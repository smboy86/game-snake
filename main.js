const FIELD_COLS = 50;
const FIELD_ROWS = 50;
const CELL_SIZE = 16;
const SPEED_CELLS_PER_SECOND = 6;
const TURN_RATE_RADIANS_PER_SECOND = Math.PI * 1.45;
const BODY_SPACING_CELLS = 0.85;
const APPLE_EAT_RADIUS_CELLS = 3;
const BASE_BODY_SIZE = 12;
const BODY_GROWTH_PER_LEVEL = 1;
const MAX_BODY_SIZE = 26;
const MAX_UPDATE_STEP_MS = 1000 / 60;
const TWO_PI = Math.PI * 2;
const BGM_SOURCE = window.__snake_assets?.bgm ?? "assets/audio/music/bgm.mp3";
const BACKGROUND_SOURCE = window.__snake_assets?.background ?? "assets/images/backgrounds/city-alley-field.png";
const BACKGROUND_KEY = "city-alley-field";
const BACKGROUND_PADDING_CELLS = 22;

const state = {
  mode: "playing",
  level: 1,
  applesEaten: 0,
  headingAngle: 0,
  targetAngle: 0,
  pointerControl: {
    active: false,
    pointerId: null,
    x: 0,
    y: 0,
  },
  bounceTimer: 0,
  head: { x: 25, y: 25 },
  trail: [{ x: 25, y: 25 }],
  segments: [{ x: 25, y: 25 }],
  apple: { x: 31, y: 25 },
  lastEvent: "started",
};

let sceneRef = null;

const audioState = {
  context: null,
  masterGain: null,
  musicGain: null,
  sfxGain: null,
  musicElement: null,
  musicSource: null,
  musicError: null,
  enabled: false,
  started: false,
};

function createGainNode(context, target, value) {
  const gain = context.createGain();
  gain.gain.value = value;
  gain.connect(target);
  return gain;
}

function ensureAudioContext() {
  if (audioState.context) return audioState.context;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = new AudioContextClass();
  audioState.masterGain = createGainNode(context, context.destination, 0.86);
  audioState.musicGain = createGainNode(context, audioState.masterGain, 0.18);
  audioState.sfxGain = createGainNode(context, audioState.masterGain, 0.38);
  audioState.context = context;
  return context;
}

function ensureMusicElement(context) {
  if (audioState.musicElement) return audioState.musicElement;
  if (!BGM_SOURCE || !audioState.musicGain) return null;

  const music = new Audio(BGM_SOURCE);
  music.loop = true;
  music.preload = "auto";
  music.volume = 1;

  audioState.musicSource = context.createMediaElementSource(music);
  audioState.musicSource.connect(audioState.musicGain);
  audioState.musicElement = music;
  return music;
}

function playTone({ frequency, startTime, duration, type = "sine", gain = 0.2, target = audioState.sfxGain }) {
  const context = audioState.context;
  if (!context || !target) return;

  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  envelope.gain.setValueAtTime(0.0001, startTime);
  envelope.gain.exponentialRampToValueAtTime(gain, startTime + 0.018);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(envelope);
  envelope.connect(target);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.04);
}

async function startGameAudio() {
  const context = ensureAudioContext();
  if (!context) return;
  if (context.state === "suspended") {
    await context.resume();
  }
  audioState.enabled = true;
  audioState.started = true;

  const music = ensureMusicElement(context);
  if (!music || !music.paused) return;

  try {
    await music.play();
    audioState.musicError = null;
  } catch (error) {
    audioState.musicError = error instanceof Error ? error.message : String(error);
  }
}

function playAppleSound() {
  const context = ensureAudioContext();
  if (!context || context.state !== "running") return;
  const now = context.currentTime;
  [659.25, 880, 1174.66].forEach((frequency, index) => {
    playTone({
      frequency,
      startTime: now + index * 0.055,
      duration: 0.22,
      type: "triangle",
      gain: 0.22 - index * 0.04,
      target: audioState.sfxGain,
    });
  });
  playTone({
    frequency: 1760,
    startTime: now + 0.16,
    duration: 0.12,
    type: "sine",
    gain: 0.08,
    target: audioState.sfxGain,
  });
}

function pauseAudio() {
  if (audioState.musicElement && !audioState.musicElement.paused) {
    audioState.musicElement.pause();
  }
  if (audioState.context && audioState.context.state === "running") {
    audioState.context.suspend();
  }
}

function resumeAudio() {
  if (audioState.enabled && audioState.context && audioState.context.state === "suspended") {
    audioState.context.resume();
  }
  if (audioState.enabled && audioState.musicElement?.paused) {
    audioState.musicElement.play().catch((error) => {
      audioState.musicError = error instanceof Error ? error.message : String(error);
    });
  }
}

function bodySize() {
  return Math.min(MAX_BODY_SIZE, BASE_BODY_SIZE + (state.level - 1) * BODY_GROWTH_PER_LEVEL);
}

function keyOf(cell) {
  return `${Math.round(cell.x)},${Math.round(cell.y)}`;
}

function normalizeAngle(angle) {
  let normalized = angle % TWO_PI;
  if (normalized <= -Math.PI) normalized += TWO_PI;
  if (normalized > Math.PI) normalized -= TWO_PI;
  return normalized;
}

function angleToVector(angle) {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function directionLabel(angle) {
  const degrees = (normalizeAngle(angle) * 180) / Math.PI;
  return `${Math.round(degrees)}deg`;
}

function targetAngleFromTouch(localX, localY, width, height) {
  const dx = localX - width / 2;
  const dy = localY - height / 2;
  const deadZone = Math.min(width, height) * 0.08;
  if (Math.hypot(dx, dy) < deadZone) return null;
  return Math.atan2(dy, dx);
}

function applyPointerDirection(pointer, width, height) {
  const targetAngle = targetAngleFromTouch(pointer.x, pointer.y, width, height);
  state.pointerControl.x = pointer.x;
  state.pointerControl.y = pointer.y;

  if (targetAngle !== null) {
    state.targetAngle = targetAngle;
    state.lastEvent = `drag-${directionLabel(targetAngle)}`;
  }
}

function isInsideField(point) {
  return point.x >= 0 && point.x <= FIELD_COLS && point.y >= 0 && point.y <= FIELD_ROWS;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isOccupiedByBody(point, radius = 0.7) {
  return state.segments.slice(4).some((segment) => distance(segment, point) < radius);
}

function isSafePoint(point) {
  return isInsideField(point) && !isOccupiedByBody(point, 1.1);
}

function appleDistanceFromHead() {
  return distance(state.head, state.apple);
}

function isAppleInEatRange() {
  return appleDistanceFromHead() <= APPLE_EAT_RADIUS_CELLS;
}

function randomSafeAngle(head) {
  const candidates = Array.from({ length: 16 }, (_, index) => (index / 16) * TWO_PI);
  const safeAngles = candidates.filter((angle) => {
    const vector = angleToVector(angle);
    const next = { x: head.x + vector.x, y: head.y + vector.y };
    return isSafePoint(next);
  });
  if (!safeAngles.length) return null;
  return safeAngles[Math.floor(Math.random() * safeAngles.length)];
}

function placeApple() {
  const occupied = new Set(state.segments.map(keyOf));
  for (let i = 0; i < 400; i++) {
    const candidate = {
      x: Math.random() * FIELD_COLS,
      y: Math.random() * FIELD_ROWS,
    };
    if (!occupied.has(keyOf(candidate)) && distance(candidate, state.head) > APPLE_EAT_RADIUS_CELLS + 2) {
      state.apple = candidate;
      return;
    }
  }
  state.apple = { x: 0, y: 0 };
}

function sampleTrailAt(distanceFromHead) {
  if (distanceFromHead <= 0 || state.trail.length === 1) return { ...state.head };

  let travelled = 0;
  for (let i = 0; i < state.trail.length - 1; i++) {
    const current = state.trail[i];
    const next = state.trail[i + 1];
    const segmentDistance = distance(current, next);
    if (travelled + segmentDistance >= distanceFromHead) {
      const ratio = (distanceFromHead - travelled) / Math.max(segmentDistance, 0.0001);
      return {
        x: current.x + (next.x - current.x) * ratio,
        y: current.y + (next.y - current.y) * ratio,
      };
    }
    travelled += segmentDistance;
  }

  return { ...state.trail[state.trail.length - 1] };
}

function rebuildSegmentsFromTrail() {
  const targetLength = Math.max(1, state.level);
  state.segments = Array.from({ length: targetLength }, (_, index) => sampleTrailAt(index * BODY_SPACING_CELLS));
}

function trimTrail() {
  const maxTrailDistance = Math.max(10, (state.level + 8) * BODY_SPACING_CELLS);
  let travelled = 0;
  let keepUntil = state.trail.length;

  for (let i = 0; i < state.trail.length - 1; i++) {
    travelled += distance(state.trail[i], state.trail[i + 1]);
    if (travelled > maxTrailDistance) {
      keepUntil = i + 2;
      break;
    }
  }

  state.trail.length = keepUntil;
}

function recordHeadInTrail() {
  const newest = state.trail[0];
  if (!newest || distance(newest, state.head) >= 0.001) {
    state.trail.unshift({ ...state.head });
    trimTrail();
  } else {
    newest.x = state.head.x;
    newest.y = state.head.y;
  }
}

function reflectHeadingFromWall() {
  let bounced = false;
  if (state.head.x < 0) {
    state.head.x = 0;
    state.headingAngle = Math.PI - state.headingAngle;
    bounced = true;
  } else if (state.head.x > FIELD_COLS) {
    state.head.x = FIELD_COLS;
    state.headingAngle = Math.PI - state.headingAngle;
    bounced = true;
  }

  if (state.head.y < 0) {
    state.head.y = 0;
    state.headingAngle = -state.headingAngle;
    bounced = true;
  } else if (state.head.y > FIELD_ROWS) {
    state.head.y = FIELD_ROWS;
    state.headingAngle = -state.headingAngle;
    bounced = true;
  }

  if (bounced) {
    state.headingAngle = normalizeAngle(state.headingAngle);
    state.targetAngle = state.headingAngle;
    state.bounceTimer = 220;
    state.lastEvent = "wall-bounce";
  }
}

function reflectHeadingFromBody() {
  const bodyRadiusCells = Math.max(0.5, bodySize() / CELL_SIZE * 0.52);
  const collidedSegment = state.segments.slice(6).find((segment) => distance(segment, state.head) < bodyRadiusCells);
  if (!collidedSegment) return;

  const velocity = angleToVector(state.headingAngle);
  const normalLength = Math.max(distance(state.head, collidedSegment), 0.0001);
  const normal = {
    x: (state.head.x - collidedSegment.x) / normalLength,
    y: (state.head.y - collidedSegment.y) / normalLength,
  };
  const dot = velocity.x * normal.x + velocity.y * normal.y;
  const reflected = {
    x: velocity.x - 2 * dot * normal.x,
    y: velocity.y - 2 * dot * normal.y,
  };

  state.headingAngle = normalizeAngle(Math.atan2(reflected.y, reflected.x));
  if (!Number.isFinite(state.headingAngle)) {
    state.headingAngle = randomSafeAngle(state.head) ?? 0;
  }
  state.targetAngle = state.headingAngle;
  state.bounceTimer = 220;
  state.lastEvent = "body-bounce";

  const push = angleToVector(state.headingAngle);
  state.head.x += push.x * 0.35;
  state.head.y += push.y * 0.35;
  reflectHeadingFromWall();
}

function moveSnakeContinuous(deltaMs) {
  const deltaSeconds = deltaMs / 1000;
  const angleDelta = normalizeAngle(state.targetAngle - state.headingAngle);
  const maxTurn = TURN_RATE_RADIANS_PER_SECOND * deltaSeconds;
  state.headingAngle = normalizeAngle(state.headingAngle + Math.max(-maxTurn, Math.min(maxTurn, angleDelta)));

  const direction = angleToVector(state.headingAngle);
  const distanceThisFrame = SPEED_CELLS_PER_SECOND * deltaSeconds;
  state.head.x += direction.x * distanceThisFrame;
  state.head.y += direction.y * distanceThisFrame;

  reflectHeadingFromWall();
  recordHeadInTrail();
  rebuildSegmentsFromTrail();
  reflectHeadingFromBody();
  recordHeadInTrail();
  rebuildSegmentsFromTrail();

  if (isAppleInEatRange()) {
    state.applesEaten += 1;
    state.level += 1;
    state.lastEvent = "apple";
    playAppleSound();
    rebuildSegmentsFromTrail();
    placeApple();
  }
}

function updateGame(deltaMs) {
  if (state.mode !== "playing") return;
  state.bounceTimer = Math.max(0, state.bounceTimer - deltaMs);

  let remaining = deltaMs;
  while (remaining > 0) {
    const step = Math.min(MAX_UPDATE_STEP_MS, remaining);
    moveSnakeContinuous(step);
    remaining -= step;
  }
}

function worldToScreen(cell, width, height) {
  return {
    x: width / 2 + (cell.x - state.head.x) * CELL_SIZE,
    y: height / 2 + (cell.y - state.head.y) * CELL_SIZE,
  };
}

function fieldBounds(width, height) {
  const topLeft = worldToScreen({ x: 0, y: 0 }, width, height);
  const bottomRight = worldToScreen({ x: FIELD_COLS, y: FIELD_ROWS }, width, height);
  return {
    left: topLeft.x,
    top: topLeft.y,
    right: bottomRight.x,
    bottom: bottomRight.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

function backgroundBounds(width, height) {
  const topLeft = worldToScreen({ x: -BACKGROUND_PADDING_CELLS, y: -BACKGROUND_PADDING_CELLS }, width, height);
  const bottomRight = worldToScreen({
    x: FIELD_COLS + BACKGROUND_PADDING_CELLS,
    y: FIELD_ROWS + BACKGROUND_PADDING_CELLS,
  }, width, height);
  return {
    left: topLeft.x,
    top: topLeft.y,
    right: bottomRight.x,
    bottom: bottomRight.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

function renderGameToText() {
  const payload = {
    coordinateSystem: "continuous field coordinates; origin top-left; x right, y down; viewport keeps snake head at screen center",
    mode: state.mode,
    field: { cols: FIELD_COLS, rows: FIELD_ROWS },
    movement: {
      speedCellsPerSecond: SPEED_CELLS_PER_SECOND,
      headingDegrees: Number(((normalizeAngle(state.headingAngle) * 180) / Math.PI).toFixed(1)),
      targetDegrees: Number(((normalizeAngle(state.targetAngle) * 180) / Math.PI).toFixed(1)),
    },
    appleEatRadiusCells: APPLE_EAT_RADIUS_CELLS,
    appleDistanceCells: Number(appleDistanceFromHead().toFixed(2)),
    level: state.level,
    length: state.segments.length,
    bodySize: bodySize(),
    direction: directionLabel(state.headingAngle),
    head: { x: Number(state.head.x.toFixed(2)), y: Number(state.head.y.toFixed(2)) },
    apple: { x: Number(state.apple.x.toFixed(2)), y: Number(state.apple.y.toFixed(2)) },
    applesEaten: state.applesEaten,
    lastEvent: state.lastEvent,
  };
  return JSON.stringify(payload, null, 2);
}

class SnakeScene extends Phaser.Scene {
  constructor() {
    super("SnakeScene");
  }

  preload() {
    this.load.image(BACKGROUND_KEY, BACKGROUND_SOURCE);
  }

  create() {
    sceneRef = this;
    this.viewportBackground = this.add.image(0, 0, BACKGROUND_KEY).setOrigin(0.5, 0.5);
    this.backgroundImage = this.add.image(0, 0, BACKGROUND_KEY).setOrigin(0, 0);
    this.graphics = this.add.graphics();
    this.hudText = this.add.text(18, 16, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "16px",
      color: "#f4f0d4",
      fontStyle: "600",
    }).setScrollFactor(0);
    this.hintText = this.add.text(18, 0, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "13px",
      color: "#bfd6f5",
    }).setScrollFactor(0);
    this.input.on("pointerdown", (pointer) => {
      startGameAudio();
      state.pointerControl.active = true;
      state.pointerControl.pointerId = pointer.id;
      applyPointerDirection(pointer, this.scale.width, this.scale.height);
    });
    this.input.on("pointermove", (pointer) => {
      if (!state.pointerControl.active || state.pointerControl.pointerId !== pointer.id) return;
      applyPointerDirection(pointer, this.scale.width, this.scale.height);
    });
    this.input.on("pointerup", (pointer) => {
      if (state.pointerControl.pointerId !== pointer.id) return;
      state.pointerControl.active = false;
      state.pointerControl.pointerId = null;
    });
    this.input.on("pointerupoutside", (pointer) => {
      if (state.pointerControl.pointerId !== pointer.id) return;
      state.pointerControl.active = false;
      state.pointerControl.pointerId = null;
    });
    this.scale.on("resize", () => this.draw());
    this.draw();
  }

  update(_time, delta) {
    updateGame(delta);
    this.draw();
  }

  manualAdvance(ms) {
    updateGame(ms);
    this.draw();
  }

  drawBackground(width, height) {
    const texture = this.textures.get(BACKGROUND_KEY).getSourceImage();
    const viewportScale = Math.max(width / texture.width, height / texture.height);
    this.viewportBackground.setPosition(width / 2, height / 2);
    this.viewportBackground.setScale(viewportScale);

    const bounds = backgroundBounds(width, height);
    this.backgroundImage.setPosition(bounds.left, bounds.top);
    this.backgroundImage.setDisplaySize(bounds.width, bounds.height);
  }

  drawGrid(width, height) {
    const leftCol = Math.floor(state.head.x - width / 2 / CELL_SIZE) - 1;
    const rightCol = Math.ceil(state.head.x + width / 2 / CELL_SIZE) + 1;
    const topRow = Math.floor(state.head.y - height / 2 / CELL_SIZE) - 1;
    const bottomRow = Math.ceil(state.head.y + height / 2 / CELL_SIZE) + 1;
    const bounds = fieldBounds(width, height);

    this.graphics.lineStyle(1, 0x8bc7df, 0.28);
    for (let col = leftCol; col <= rightCol; col++) {
      const x = width / 2 + (col - state.head.x) * CELL_SIZE;
      if (x >= bounds.left && x <= bounds.right) {
        this.graphics.lineBetween(x, bounds.top, x, bounds.bottom);
      }
    }
    for (let row = topRow; row <= bottomRow; row++) {
      const y = height / 2 + (row - state.head.y) * CELL_SIZE;
      if (y >= bounds.top && y <= bounds.bottom) {
        this.graphics.lineBetween(bounds.left, y, bounds.right, y);
      }
    }

    this.graphics.lineStyle(4, 0x9fe7ff, 0.92);
    this.graphics.strokeRect(bounds.left, bounds.top, bounds.width, bounds.height);
    this.graphics.lineStyle(1, 0xffc76e, 0.55);
    this.graphics.strokeRect(bounds.left + 5, bounds.top + 5, bounds.width - 10, bounds.height - 10);
  }

  draw() {
    const width = this.scale.width;
    const height = this.scale.height;
    const size = bodySize();
    this.graphics.clear();
    this.cameras.main.setBackgroundColor("#171b45");
    this.drawBackground(width, height);
    this.drawGrid(width, height);
    if (state.pointerControl.active) {
      this.graphics.lineStyle(3, 0x9fe7ff, 0.62);
      this.graphics.lineBetween(width / 2, height / 2, state.pointerControl.x, state.pointerControl.y);
      this.graphics.fillStyle(0x9fe7ff, 0.18);
      this.graphics.fillCircle(state.pointerControl.x, state.pointerControl.y, Math.max(14, size * 0.9));
    }

    const apple = worldToScreen(state.apple, width, height);
    this.graphics.fillStyle(0xff5a5f, 1);
    this.graphics.fillCircle(apple.x, apple.y, Math.max(7, size * 0.48));
    this.graphics.fillStyle(0xffc76e, 1);
    this.graphics.fillEllipse(apple.x + 4, apple.y - 8, 8, 4);

    state.segments.forEach((segment, index) => {
      const pos = worldToScreen(segment, width, height);
      const alpha = index === 0 ? 1 : Math.max(0.42, 1 - index * 0.08);
      const color = index === 0 ? 0x2cf38c : 0x3acb7a;
      this.graphics.fillStyle(color, alpha);
      this.graphics.fillRoundedRect(pos.x - size / 2, pos.y - size / 2, size, size, Math.min(8, size / 3));
    });

    const headPulse = state.bounceTimer > 0 ? 0xffc76e : 0xe8fff4;
    this.graphics.lineStyle(3, headPulse, 1);
    this.graphics.strokeCircle(width / 2, height / 2, size * 0.72);

    this.hudText.setText(`Lv ${state.level}  Length ${state.segments.length}  Apples ${state.applesEaten}`);
    this.hintText.setY(height - 34);
    this.hintText.setText("손가락이나 마우스를 누른 채 드래그해서 방향 조절");
  }
}

const config = {
  type: Phaser.CANVAS,
  parent: "game",
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#171b45",
  scale: {
    mode: Phaser.Scale.RESIZE,
    parent: "game",
    width: "100%",
    height: "100%",
  },
  scene: SnakeScene,
};

new Phaser.Game(config);

window.render_game_to_text = renderGameToText;
window.advanceTime = (ms) => {
  if (sceneRef) sceneRef.manualAdvance(ms);
};
window.__snake_state = state;
window.__snake_audio = audioState;

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseAudio();
  } else {
    resumeAudio();
  }
});
