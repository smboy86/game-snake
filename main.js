const FIELD_COLS = 50;
const FIELD_ROWS = 50;
const CELL_SIZE = 16;
const MOVE_INTERVAL_MS = 200;
const APPLE_EAT_RADIUS_CELLS = 3;
const BASE_BODY_SIZE = 12;
const BODY_GROWTH_PER_LEVEL = 1;
const MAX_BODY_SIZE = 26;
const DIRECTIONS = {
  up: { x: 0, y: -1, label: "up" },
  down: { x: 0, y: 1, label: "down" },
  left: { x: -1, y: 0, label: "left" },
  right: { x: 1, y: 0, label: "right" },
  upLeft: { x: -1, y: -1, label: "up-left" },
  upRight: { x: 1, y: -1, label: "up-right" },
  downLeft: { x: -1, y: 1, label: "down-left" },
  downRight: { x: 1, y: 1, label: "down-right" },
};

const state = {
  mode: "playing",
  level: 1,
  applesEaten: 0,
  direction: DIRECTIONS.right,
  pendingDirection: DIRECTIONS.right,
  pointerControl: {
    active: false,
    pointerId: null,
    x: 0,
    y: 0,
  },
  moveAccumulator: 0,
  bounceTimer: 0,
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
  musicTimer: null,
  step: 0,
  enabled: false,
  started: false,
  nextNoteTime: 0,
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
  audioState.masterGain = createGainNode(context, context.destination, 0.72);
  audioState.musicGain = createGainNode(context, audioState.masterGain, 0.18);
  audioState.sfxGain = createGainNode(context, audioState.masterGain, 0.38);
  audioState.context = context;
  return context;
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

function scheduleMusicSlice() {
  const context = audioState.context;
  if (!context || !audioState.musicGain) return;

  const melody = [392, 440, 523.25, 440, 392, 329.63, 349.23, 392];
  const bass = [130.81, 130.81, 174.61, 174.61, 146.83, 146.83, 196, 196];
  const stepDuration = 0.32;
  const lookAhead = 0.7;

  while (audioState.nextNoteTime < context.currentTime + lookAhead) {
    const step = audioState.step;
    const melodyFrequency = melody[step % melody.length];
    const bassFrequency = bass[Math.floor(step / 2) % bass.length];
    playTone({
      frequency: melodyFrequency,
      startTime: audioState.nextNoteTime,
      duration: 0.24,
      type: "triangle",
      gain: step % 4 === 0 ? 0.16 : 0.11,
      target: audioState.musicGain,
    });
    if (step % 2 === 0) {
      playTone({
        frequency: bassFrequency,
        startTime: audioState.nextNoteTime,
        duration: 0.52,
        type: "sine",
        gain: 0.08,
        target: audioState.musicGain,
      });
    }
    audioState.step += 1;
    audioState.nextNoteTime += stepDuration;
  }
}

async function startGameAudio() {
  const context = ensureAudioContext();
  if (!context) return;
  if (context.state === "suspended") {
    await context.resume();
  }
  audioState.enabled = true;

  if (audioState.started) return;
  audioState.started = true;
  audioState.nextNoteTime = context.currentTime + 0.05;
  scheduleMusicSlice();
  audioState.musicTimer = window.setInterval(scheduleMusicSlice, 180);
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
  if (audioState.context && audioState.context.state === "running") {
    audioState.context.suspend();
  }
}

function resumeAudio() {
  if (audioState.enabled && audioState.context && audioState.context.state === "suspended") {
    audioState.nextNoteTime = audioState.context.currentTime + 0.05;
    audioState.context.resume();
  }
}

function bodySize() {
  return Math.min(MAX_BODY_SIZE, BASE_BODY_SIZE + (state.level - 1) * BODY_GROWTH_PER_LEVEL);
}

function keyOf(cell) {
  return `${cell.x},${cell.y}`;
}

function directionByVector(x, y) {
  return Object.values(DIRECTIONS).find((direction) => direction.x === x && direction.y === y) || DIRECTIONS.right;
}

function directionFromTouch(localX, localY, width, height) {
  const dx = localX - width / 2;
  const dy = localY - height / 2;
  const deadZone = Math.min(width, height) * 0.08;
  if (Math.hypot(dx, dy) < deadZone) return null;
  const sx = dx > deadZone ? 1 : dx < -deadZone ? -1 : 0;
  const sy = dy > deadZone ? 1 : dy < -deadZone ? -1 : 0;
  const found = Object.values(DIRECTIONS).find((direction) => direction.x === sx && direction.y === sy);
  return found || null;
}

function applyPointerDirection(pointer, width, height) {
  const direction = directionFromTouch(pointer.x, pointer.y, width, height);
  state.pointerControl.x = pointer.x;
  state.pointerControl.y = pointer.y;

  if (direction) {
    state.pendingDirection = direction;
    state.lastEvent = `drag-${direction.label}`;
  }
}

function isInsideField(cell) {
  return cell.x >= 0 && cell.x < FIELD_COLS && cell.y >= 0 && cell.y < FIELD_ROWS;
}

function isOccupiedByBody(cell) {
  return state.segments.slice(1).some((segment) => segment.x === cell.x && segment.y === cell.y);
}

function isSafeCell(cell) {
  return isInsideField(cell) && !isOccupiedByBody(cell);
}

function appleDistanceFromHead() {
  const head = state.segments[0];
  return Math.hypot(head.x - state.apple.x, head.y - state.apple.y);
}

function isAppleInEatRange() {
  return appleDistanceFromHead() <= APPLE_EAT_RADIUS_CELLS;
}

function randomSafeDirection(head) {
  const safeDirections = Object.values(DIRECTIONS).filter((direction) => {
    const next = { x: head.x + direction.x, y: head.y + direction.y };
    return isSafeCell(next);
  });
  if (!safeDirections.length) return null;
  return safeDirections[Math.floor(Math.random() * safeDirections.length)];
}

function reflectFromWall(direction, next) {
  let reflectedX = direction.x;
  let reflectedY = direction.y;
  if (next.x < 0 || next.x >= FIELD_COLS) reflectedX *= -1;
  if (next.y < 0 || next.y >= FIELD_ROWS) reflectedY *= -1;
  return directionByVector(reflectedX, reflectedY);
}

function reflectFromBody(direction, head, collidedSegment) {
  let reflectedX = direction.x;
  let reflectedY = direction.y;
  if (collidedSegment.x !== head.x) reflectedX *= -1;
  if (collidedSegment.y !== head.y) reflectedY *= -1;
  return directionByVector(reflectedX, reflectedY);
}

function resolveBounce(head, reflectedDirection, eventName) {
  let finalDirection = reflectedDirection;
  let finalEvent = eventName;
  let next = { x: head.x + finalDirection.x, y: head.y + finalDirection.y };

  if (!isSafeCell(next)) {
    const randomDirection = randomSafeDirection(head);
    if (!randomDirection) {
      state.bounceTimer = 220;
      state.lastEvent = `${eventName}-blocked`;
      return null;
    }
    finalDirection = randomDirection;
    finalEvent = `${eventName}-random`;
    next = { x: head.x + finalDirection.x, y: head.y + finalDirection.y };
  }

  state.direction = finalDirection;
  state.pendingDirection = finalDirection;
  state.bounceTimer = 220;
  state.lastEvent = finalEvent;
  return next;
}

function placeApple() {
  const occupied = new Set(state.segments.map(keyOf));
  for (let i = 0; i < 400; i++) {
    const candidate = {
      x: Math.floor(Math.random() * FIELD_COLS),
      y: Math.floor(Math.random() * FIELD_ROWS),
    };
    if (!occupied.has(keyOf(candidate))) {
      state.apple = candidate;
      return;
    }
  }
  state.apple = { x: 0, y: 0 };
}

function growToLevel() {
  while (state.segments.length < state.level) {
    const tail = state.segments[state.segments.length - 1];
    state.segments.push({ x: tail.x, y: tail.y });
  }
  if (state.segments.length > state.level) {
    state.segments.length = state.level;
  }
}

function moveSnakeOneCell() {
  state.direction = state.pendingDirection;
  const head = state.segments[0];
  let next = { x: head.x + state.direction.x, y: head.y + state.direction.y };

  if (!isInsideField(next)) {
    next = resolveBounce(head, reflectFromWall(state.direction, next), "wall-bounce");
    if (!next) return;
  }

  const collidedSegment = state.segments.slice(1).find((segment) => segment.x === next.x && segment.y === next.y);
  if (collidedSegment) {
    next = resolveBounce(head, reflectFromBody(state.direction, head, collidedSegment), "body-bounce");
    if (!next) return;
  }

  state.segments.unshift(next);
  if (isAppleInEatRange()) {
    state.applesEaten += 1;
    state.level += 1;
    state.lastEvent = "apple";
    playAppleSound();
    growToLevel();
    placeApple();
  } else {
    growToLevel();
  }
}

function updateGame(deltaMs) {
  if (state.mode !== "playing") return;
  state.moveAccumulator += deltaMs;
  state.bounceTimer = Math.max(0, state.bounceTimer - deltaMs);
  while (state.moveAccumulator >= MOVE_INTERVAL_MS) {
    state.moveAccumulator -= MOVE_INTERVAL_MS;
    moveSnakeOneCell();
  }
}

function worldToScreen(cell, width, height) {
  const head = state.segments[0];
  return {
    x: width / 2 + (cell.x - head.x) * CELL_SIZE,
    y: height / 2 + (cell.y - head.y) * CELL_SIZE,
  };
}

function renderGameToText() {
  const head = state.segments[0];
  const payload = {
    coordinateSystem: "grid origin top-left; x right, y down; viewport keeps snake head at screen center",
    mode: state.mode,
    field: { cols: FIELD_COLS, rows: FIELD_ROWS },
    appleEatRadiusCells: APPLE_EAT_RADIUS_CELLS,
    appleDistanceCells: Number(appleDistanceFromHead().toFixed(2)),
    level: state.level,
    length: state.segments.length,
    bodySize: bodySize(),
    direction: state.direction.label,
    head,
    apple: state.apple,
    applesEaten: state.applesEaten,
    lastEvent: state.lastEvent,
  };
  return JSON.stringify(payload, null, 2);
}

class SnakeScene extends Phaser.Scene {
  constructor() {
    super("SnakeScene");
  }

  create() {
    sceneRef = this;
    this.graphics = this.add.graphics();
    this.hudText = this.add.text(18, 16, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "16px",
      color: "#122014",
      fontStyle: "600",
    }).setScrollFactor(0);
    this.hintText = this.add.text(18, 0, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "13px",
      color: "#38513c",
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

  drawGrid(width, height) {
    const head = state.segments[0];
    const leftCol = Math.floor(head.x - width / 2 / CELL_SIZE) - 1;
    const rightCol = Math.ceil(head.x + width / 2 / CELL_SIZE) + 1;
    const topRow = Math.floor(head.y - height / 2 / CELL_SIZE) - 1;
    const bottomRow = Math.ceil(head.y + height / 2 / CELL_SIZE) + 1;

    this.graphics.lineStyle(1, 0xcbd6b3, 0.55);
    for (let col = leftCol; col <= rightCol; col++) {
      const x = width / 2 + (col - head.x) * CELL_SIZE;
      this.graphics.lineBetween(x, 0, x, height);
    }
    for (let row = topRow; row <= bottomRow; row++) {
      const y = height / 2 + (row - head.y) * CELL_SIZE;
      this.graphics.lineBetween(0, y, width, y);
    }

    this.graphics.lineStyle(3, 0x59705c, 0.9);
    const topLeft = worldToScreen({ x: 0, y: 0 }, width, height);
    const bottomRight = worldToScreen({ x: FIELD_COLS, y: FIELD_ROWS }, width, height);
    this.graphics.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  }

  draw() {
    const width = this.scale.width;
    const height = this.scale.height;
    const size = bodySize();
    this.graphics.clear();
    this.cameras.main.setBackgroundColor("#eef2dd");
    this.graphics.fillStyle(0xeef2dd, 1);
    this.graphics.fillRect(0, 0, width, height);
    this.drawGrid(width, height);
    if (state.pointerControl.active) {
      this.graphics.lineStyle(3, 0x224f2c, 0.5);
      this.graphics.lineBetween(width / 2, height / 2, state.pointerControl.x, state.pointerControl.y);
      this.graphics.fillStyle(0x224f2c, 0.2);
      this.graphics.fillCircle(state.pointerControl.x, state.pointerControl.y, Math.max(14, size * 0.9));
    }

    const apple = worldToScreen(state.apple, width, height);
    this.graphics.fillStyle(0xd94343, 1);
    this.graphics.fillCircle(apple.x, apple.y, Math.max(7, size * 0.48));
    this.graphics.fillStyle(0x4f8a42, 1);
    this.graphics.fillEllipse(apple.x + 4, apple.y - 8, 8, 4);

    state.segments.forEach((segment, index) => {
      const pos = worldToScreen(segment, width, height);
      const alpha = index === 0 ? 1 : Math.max(0.42, 1 - index * 0.08);
      const color = index === 0 ? 0x224f2c : 0x3f8f4b;
      this.graphics.fillStyle(color, alpha);
      this.graphics.fillRoundedRect(pos.x - size / 2, pos.y - size / 2, size, size, Math.min(8, size / 3));
    });

    const headPulse = state.bounceTimer > 0 ? 0xf2b84b : 0xf8f4df;
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
  backgroundColor: "#eef2dd",
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
