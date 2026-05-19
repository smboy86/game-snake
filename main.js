const FIELD_COLS = 50;
const FIELD_ROWS = 50;
const CELL_SIZE = 16;
const BASE_SPEED_CELLS_PER_SECOND = 6;
const TURN_RATE_RADIANS_PER_SECOND = Math.PI * 1.45;
const BODY_SPACING_CELLS = 0.85;
const APPLE_SET_SIZE = 3;
const INITIAL_ACTIVE_APPLE_COUNT = 3;
const WIN_APPLE_COUNT = 50;
const APPLE_EAT_RADIUS_CELLS = 3;
const BASE_BODY_SIZE = 12;
const BODY_GROWTH_PER_LEVEL = 1;
const MAX_BODY_SIZE = 26;
const MAX_UPDATE_STEP_MS = 1000 / 60;
const SPEED_GROWTH_FACTOR = 1.3;
const SCREEN_SHAKE_DURATION_MS = 180;
const EXIT_APP_DELAY_MS = 3000;
const RAIN_PARTICLE_DENSITY = 0.00018;
const TWO_PI = Math.PI * 2;
const BGM_SOURCE = window.__snake_assets?.bgm ?? "assets/audio/music/bgm.mp3";
const BACKGROUND_SOURCE = window.__snake_assets?.background ?? "assets/images/backgrounds/city-alley-field-expanded.png";
const BACKGROUND_KEY = "city-alley-field";
const BACKGROUND_PADDING_CELLS = 27;

const state = {
  mode: "menu",
  menuVariant: "start",
  modeBeforeConfirm: "menu",
  level: 1,
  applesEaten: 0,
  speedMultiplier: 1,
  headingAngle: 0,
  targetAngle: 0,
  pointerControl: {
    active: false,
    pointerId: null,
    x: 0,
    y: 0,
  },
  bounceTimer: 0,
  screenShakeMs: 0,
  elapsedMs: 0,
  head: { x: 25, y: 25 },
  trail: [{ x: 25, y: 25 }],
  segments: [{ x: 25, y: 25 }],
  apples: [
    { id: 1, x: 31, y: 25 },
    { id: 2, x: 22, y: 30 },
    { id: 3, x: 28, y: 18 },
  ],
  rainEnabled: true,
  lastEvent: "menu",
  exitTimerId: null,
};

const initialApplePositions = [
  { id: 1, x: 31, y: 25 },
  { id: 2, x: 22, y: 30 },
  { id: 3, x: 28, y: 18 },
];

let sceneRef = null;
let renderShakeOffset = { x: 0, y: 0 };
let uiElements = null;
let nextAppleId = 4;

const audioState = {
  context: null,
  masterGain: null,
  musicGain: null,
  sfxGain: null,
  musicElement: null,
  musicSource: null,
  musicError: null,
  retryTimer: null,
  retryCount: 0,
  enabled: false,
  started: false,
  waitingForGesture: false,
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
  music.playsInline = true;

  audioState.musicSource = context.createMediaElementSource(music);
  audioState.musicSource.connect(audioState.musicGain);
  audioState.musicElement = music;
  music.load();

  ["canplay", "loadeddata"].forEach((eventName) => {
    music.addEventListener(eventName, () => {
      if (audioState.enabled && music.paused) {
        attemptMusicPlayback();
      }
    });
  });
  return music;
}

function scheduleMusicRetry() {
  if (!audioState.enabled || audioState.retryTimer || audioState.retryCount >= 8) return;
  const delay = Math.min(1200, 120 + audioState.retryCount * 140);
  audioState.retryCount += 1;
  audioState.retryTimer = window.setTimeout(() => {
    audioState.retryTimer = null;
    attemptMusicPlayback();
  }, delay);
}

function attemptMusicPlayback() {
  const context = ensureAudioContext();
  if (!context) return;
  const music = ensureMusicElement(context);
  if (!music || !music.paused) return;

  if (context.state === "suspended") {
    context.resume().catch((error) => {
      audioState.musicError = error instanceof Error ? error.message : String(error);
    });
  }

  music.play()
    .then(() => {
      audioState.musicError = null;
      audioState.retryCount = 0;
    })
    .catch((error) => {
      audioState.musicError = error instanceof Error ? error.message : String(error);
      if (error?.name === "NotAllowedError") {
        audioState.waitingForGesture = true;
        return;
      }
      scheduleMusicRetry();
    });
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
  audioState.enabled = true;
  audioState.started = true;
  audioState.waitingForGesture = false;

  if (context.state === "suspended") {
    context.resume().catch((error) => {
      audioState.musicError = error instanceof Error ? error.message : String(error);
    });
  }
  attemptMusicPlayback();
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
  if (audioState.enabled) {
    attemptMusicPlayback();
  }
}

function currentSpeedCellsPerSecond() {
  return BASE_SPEED_CELLS_PER_SECOND * state.speedMultiplier;
}

function currentTurnRateRadiansPerSecond() {
  return TURN_RATE_RADIANS_PER_SECOND * Math.sqrt(state.speedMultiplier);
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

function activeApples() {
  return state.apples;
}

function appleDistanceFromHead(apple) {
  return distance(state.head, apple);
}

function nearestAppleDistanceFromHead() {
  if (!state.apples.length) return null;
  return Math.min(...state.apples.map(appleDistanceFromHead));
}

function eatenAppleIndex() {
  return state.apples.findIndex((apple) => appleDistanceFromHead(apple) <= APPLE_EAT_RADIUS_CELLS);
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

function createAppleCandidate(occupied) {
  for (let i = 0; i < 500; i++) {
    const candidate = {
      id: nextAppleId++,
      x: Math.random() * FIELD_COLS,
      y: Math.random() * FIELD_ROWS,
    };
    if (!occupied.has(keyOf(candidate)) && distance(candidate, state.head) > APPLE_EAT_RADIUS_CELLS + 2) {
      occupied.add(keyOf(candidate));
      return candidate;
    }
  }
  return { id: nextAppleId++, x: 0, y: 0 };
}

function placeAppleSet(count = INITIAL_ACTIVE_APPLE_COUNT) {
  const occupied = new Set(state.segments.map(keyOf));
  state.apples = Array.from({ length: count }, () => createAppleCandidate(occupied));
}

function resetGameState() {
  state.mode = "menu";
  state.menuVariant = "start";
  state.modeBeforeConfirm = "menu";
  state.level = 1;
  state.applesEaten = 0;
  state.speedMultiplier = 1;
  state.headingAngle = 0;
  state.targetAngle = 0;
  state.pointerControl.active = false;
  state.pointerControl.pointerId = null;
  state.pointerControl.x = 0;
  state.pointerControl.y = 0;
  state.bounceTimer = 0;
  state.screenShakeMs = 0;
  state.head = { x: 25, y: 25 };
  state.trail = [{ x: 25, y: 25 }];
  state.segments = [{ x: 25, y: 25 }];
  state.apples = initialApplePositions.map((apple) => ({ ...apple }));
  state.rainEnabled = true;
  state.lastEvent = "reset";
  nextAppleId = 4;
}

function collectApple(index) {
  state.apples.splice(index, 1);
  state.applesEaten += 1;
  state.level += 1;
  state.lastEvent = "apple";
  state.screenShakeMs = SCREEN_SHAKE_DURATION_MS;
  if (state.applesEaten >= WIN_APPLE_COUNT) {
    finishGame();
  } else if (state.apples.length === 0) {
    if (state.applesEaten % APPLE_SET_SIZE === 0) {
      state.speedMultiplier *= SPEED_GROWTH_FACTOR;
    }
    placeAppleSet();
  } else if (state.applesEaten % APPLE_SET_SIZE === 0) {
    state.speedMultiplier *= SPEED_GROWTH_FACTOR;
  }
  playAppleSound();
  rebuildSegmentsFromTrail();
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
  const maxTurn = currentTurnRateRadiansPerSecond() * deltaSeconds;
  state.headingAngle = normalizeAngle(state.headingAngle + Math.max(-maxTurn, Math.min(maxTurn, angleDelta)));

  const direction = angleToVector(state.headingAngle);
  const distanceThisFrame = currentSpeedCellsPerSecond() * deltaSeconds;
  state.head.x += direction.x * distanceThisFrame;
  state.head.y += direction.y * distanceThisFrame;

  reflectHeadingFromWall();
  recordHeadInTrail();
  rebuildSegmentsFromTrail();
  reflectHeadingFromBody();
  recordHeadInTrail();
  rebuildSegmentsFromTrail();

  const appleIndex = eatenAppleIndex();
  if (appleIndex >= 0) {
    collectApple(appleIndex);
  }
}

function updateEffects(deltaMs) {
  state.elapsedMs += deltaMs;
  state.bounceTimer = Math.max(0, state.bounceTimer - deltaMs);
  state.screenShakeMs = Math.max(0, state.screenShakeMs - deltaMs);
}

function updateGame(deltaMs) {
  updateEffects(deltaMs);
  if (state.mode !== "playing") return;

  let remaining = deltaMs;
  while (remaining > 0) {
    const step = Math.min(MAX_UPDATE_STEP_MS, remaining);
    moveSnakeContinuous(step);
    remaining -= step;
  }
}

function worldToScreen(cell, width, height) {
  return {
    x: width / 2 + (cell.x - state.head.x) * CELL_SIZE + renderShakeOffset.x,
    y: height / 2 + (cell.y - state.head.y) * CELL_SIZE + renderShakeOffset.y,
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
  const nearestAppleDistance = nearestAppleDistanceFromHead();
  const remainingTargetApples = Math.max(0, WIN_APPLE_COUNT - state.applesEaten);
  const payload = {
    coordinateSystem: "continuous field coordinates; origin top-left; x right, y down; viewport keeps snake head at screen center",
    mode: state.mode,
    menuVariant: state.menuVariant,
    field: { cols: FIELD_COLS, rows: FIELD_ROWS },
    movement: {
      baseSpeedCellsPerSecond: BASE_SPEED_CELLS_PER_SECOND,
      speedMultiplier: Number(state.speedMultiplier.toFixed(4)),
      speedCellsPerSecond: Number(currentSpeedCellsPerSecond().toFixed(3)),
      turnRateDegreesPerSecond: Number(((currentTurnRateRadiansPerSecond() * 180) / Math.PI).toFixed(1)),
      headingDegrees: Number(((normalizeAngle(state.headingAngle) * 180) / Math.PI).toFixed(1)),
      targetDegrees: Number(((normalizeAngle(state.targetAngle) * 180) / Math.PI).toFixed(1)),
    },
    appleEatRadiusCells: APPLE_EAT_RADIUS_CELLS,
    appleDistanceCells: nearestAppleDistance === null ? null : Number(nearestAppleDistance.toFixed(2)),
    level: state.level,
    length: state.segments.length,
    bodySize: bodySize(),
    direction: directionLabel(state.headingAngle),
    head: { x: Number(state.head.x.toFixed(2)), y: Number(state.head.y.toFixed(2)) },
    apples: state.apples.map((apple) => ({
      id: apple.id,
      x: Number(apple.x.toFixed(2)),
      y: Number(apple.y.toFixed(2)),
    })),
    activeAppleCount: activeApples().length,
    applesEaten: state.applesEaten,
    targetApples: WIN_APPLE_COUNT,
    remainingTargetApples,
    speedMultiplier: Number(state.speedMultiplier.toFixed(4)),
    speedCellsPerSecond: Number(currentSpeedCellsPerSecond().toFixed(3)),
    rainEnabled: state.rainEnabled,
    screenShakeMs: Math.round(state.screenShakeMs),
    lastEvent: state.lastEvent,
  };
  return JSON.stringify(payload, null, 2);
}

function updateMenuVariant() {
  if (state.mode === "menu") state.menuVariant = "start";
  if (state.mode === "paused") state.menuVariant = "pause";
  if (state.mode === "exitConfirm") {
    state.menuVariant = state.modeBeforeConfirm === "paused" ? "pause" : "start";
  }
  if (state.mode === "playing" || state.mode === "ending" || state.mode === "exited") state.menuVariant = null;
}

function setMode(mode) {
  state.mode = mode;
  updateMenuVariant();
  updateGameUi();
}

function startOrResumeGame() {
  startGameAudio();
  state.pointerControl.active = false;
  state.pointerControl.pointerId = null;
  state.lastEvent = state.mode === "paused" ? "resumed" : "started";
  setMode("playing");
}

function restartGame() {
  resetGameState();
  startOrResumeGame();
}

function pauseGame() {
  if (state.mode !== "playing") return;
  state.lastEvent = "paused";
  setMode("paused");
}

function requestExitConfirmation() {
  state.modeBeforeConfirm = state.mode === "paused" || state.mode === "ending" ? state.mode : "menu";
  state.lastEvent = "exit-confirm";
  setMode("exitConfirm");
}

function cancelExitConfirmation() {
  state.lastEvent = "exit-cancelled";
  if (state.modeBeforeConfirm === "paused" || state.modeBeforeConfirm === "ending") {
    setMode(state.modeBeforeConfirm);
    return;
  }
  setMode("menu");
}

function finishGame() {
  state.pointerControl.active = false;
  state.pointerControl.pointerId = null;
  state.lastEvent = "ending";
  pauseAudio();
  setMode("ending");
}

function confirmExit() {
  if (state.exitTimerId !== null) return;
  state.lastEvent = "exit-confirmed";
  setMode("exited");
  pauseAudio();

  state.exitTimerId = window.setTimeout(() => {
    state.exitTimerId = null;
    const payload = JSON.stringify({ type: "exit_app" });
    if (window.ReactNativeWebView?.postMessage) {
      window.ReactNativeWebView.postMessage(payload);
    }
  }, EXIT_APP_DELAY_MS);
}

function ensureGameUi() {
  if (uiElements) return uiElements;
  const shell = document.getElementById("game-shell") ?? document.body;

  const pauseButton = document.createElement("button");
  pauseButton.type = "button";
  pauseButton.className = "pause-button";
  pauseButton.textContent = "II";
  pauseButton.setAttribute("aria-label", "게임 일시정지");
  pauseButton.addEventListener("click", (event) => {
    event.stopPropagation();
    startGameAudio();
    pauseGame();
  });

  const overlay = document.createElement("section");
  overlay.className = "game-menu";
  overlay.setAttribute("aria-live", "polite");

  const panel = document.createElement("div");
  panel.className = "game-menu__panel";

  const title = document.createElement("h1");
  title.className = "game-menu__title";
  title.textContent = "모험 스네이크";

  const primaryButton = document.createElement("button");
  primaryButton.type = "button";
  primaryButton.className = "retro-button retro-button--primary";
  primaryButton.addEventListener("click", (event) => {
    event.stopPropagation();
    startOrResumeGame();
  });

  const exitButton = document.createElement("button");
  exitButton.type = "button";
  exitButton.className = "retro-button";
  exitButton.textContent = "게임 종료";
  exitButton.addEventListener("click", (event) => {
    event.stopPropagation();
    startGameAudio();
    requestExitConfirmation();
  });

  panel.append(title, primaryButton, exitButton);
  overlay.append(panel);

  const confirm = document.createElement("section");
  confirm.className = "exit-confirm";
  confirm.setAttribute("aria-live", "assertive");

  const confirmPanel = document.createElement("div");
  confirmPanel.className = "exit-confirm__panel";

  const confirmText = document.createElement("p");
  confirmText.className = "exit-confirm__text";
  confirmText.textContent = "정말 나가시겠습니까?";

  const confirmActions = document.createElement("div");
  confirmActions.className = "exit-confirm__actions";

  const yesButton = document.createElement("button");
  yesButton.type = "button";
  yesButton.className = "retro-button retro-button--small retro-button--primary";
  yesButton.textContent = "예";
  yesButton.addEventListener("click", (event) => {
    event.stopPropagation();
    confirmExit();
  });

  const noButton = document.createElement("button");
  noButton.type = "button";
  noButton.className = "retro-button retro-button--small";
  noButton.textContent = "아니오";
  noButton.addEventListener("click", (event) => {
    event.stopPropagation();
    cancelExitConfirmation();
  });

  confirmActions.append(yesButton, noButton);
  confirmPanel.append(confirmText, confirmActions);
  confirm.append(confirmPanel);

  const ending = document.createElement("section");
  ending.className = "ending-screen";
  ending.setAttribute("aria-live", "assertive");

  const endingPanel = document.createElement("div");
  endingPanel.className = "game-menu__panel ending-screen__panel";

  const endingText = document.createElement("p");
  endingText.className = "ending-screen__text";
  endingText.textContent =
    "배고픔에 지쳐 있는 작은 뱀이\n용케 사과를 모두 먹고 힘을 모았어요\n이제 눅눅한 골목길을 떠나\n더 넓은 세상으로 나아갑니다";

  const restartButton = document.createElement("button");
  restartButton.type = "button";
  restartButton.className = "retro-button retro-button--primary";
  restartButton.textContent = "게임 다시 시작";
  restartButton.addEventListener("click", (event) => {
    event.stopPropagation();
    restartGame();
  });

  const endingExitButton = document.createElement("button");
  endingExitButton.type = "button";
  endingExitButton.className = "retro-button";
  endingExitButton.textContent = "게임 종료";
  endingExitButton.addEventListener("click", (event) => {
    event.stopPropagation();
    requestExitConfirmation();
  });

  endingPanel.append(endingText, restartButton, endingExitButton);
  ending.append(endingPanel);

  const exited = document.createElement("section");
  exited.className = "exited-screen";
  exited.textContent = "게임을 종료합니다.";

  shell.append(pauseButton, overlay, confirm, ending, exited);
  uiElements = { shell, pauseButton, overlay, primaryButton, exitButton, confirm, ending, exited };
  updateGameUi();
  return uiElements;
}

function updateGameUi() {
  if (!uiElements) return;
  const isMenuVisible = state.mode === "menu" || state.mode === "paused";
  const isConfirmVisible = state.mode === "exitConfirm";
  const isEnding = state.mode === "ending";
  const isExited = state.mode === "exited";

  uiElements.shell.classList.toggle("is-blurred", isMenuVisible || isConfirmVisible || isEnding || isExited);
  uiElements.overlay.classList.toggle("is-visible", isMenuVisible);
  uiElements.confirm.classList.toggle("is-visible", isConfirmVisible);
  uiElements.ending.classList.toggle("is-visible", isEnding);
  uiElements.exited.classList.toggle("is-visible", isExited);
  uiElements.pauseButton.classList.toggle("is-visible", state.mode === "playing");
  uiElements.primaryButton.textContent = state.menuVariant === "pause" ? "계속하기" : "게임 시작";
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
    ensureGameUi();
    this.rainParticles = [];
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
      if (state.mode !== "playing") return;
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
    this.updateRain(delta, this.scale.width, this.scale.height);
    this.draw();
  }

  manualAdvance(ms) {
    updateGame(ms);
    this.updateRain(ms, this.scale.width, this.scale.height);
    this.draw();
  }

  ensureRain(width, height) {
    const targetCount = Math.max(28, Math.round(width * height * RAIN_PARTICLE_DENSITY));
    while (this.rainParticles.length < targetCount) {
      this.rainParticles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        length: 7 + Math.random() * 14,
        speed: 90 + Math.random() * 120,
        drift: -16 + Math.random() * 12,
        alpha: 0.22 + Math.random() * 0.34,
      });
    }
    if (this.rainParticles.length > targetCount) {
      this.rainParticles.length = targetCount;
    }
  }

  updateRain(deltaMs, width, height) {
    if (!state.rainEnabled) return;
    this.ensureRain(width, height);
    const deltaSeconds = deltaMs / 1000;
    this.rainParticles.forEach((drop) => {
      drop.x += drop.drift * deltaSeconds;
      drop.y += drop.speed * deltaSeconds;
      if (drop.y > height + drop.length || drop.x < -30) {
        drop.x = Math.random() * (width + 60);
        drop.y = -drop.length - Math.random() * height * 0.16;
      }
    });
  }

  drawRain(width, height) {
    if (!state.rainEnabled) return;
    this.ensureRain(width, height);
    this.rainParticles.forEach((drop, index) => {
      const x = Math.round(drop.x) + (index % 3);
      const y = Math.round(drop.y);
      this.graphics.lineStyle(2, 0x9fe7ff, drop.alpha);
      this.graphics.lineBetween(x, y, x + drop.drift * 0.035, y + drop.length);
      if (index % 7 === 0) {
        this.graphics.lineStyle(1, 0xf4f0d4, drop.alpha * 0.42);
        this.graphics.lineBetween(x + 1, y + 1, x + 1, y + Math.max(3, drop.length * 0.42));
      }
    });
  }

  screenShakeOffset() {
    if (state.screenShakeMs <= 0) return { x: 0, y: 0 };
    const progress = state.screenShakeMs / SCREEN_SHAKE_DURATION_MS;
    const strength = 7 * progress;
    return {
      x: Math.sin(state.elapsedMs * 0.11) * strength,
      y: Math.cos(state.elapsedMs * 0.17) * strength * 0.72,
    };
  }

  drawBackground(width, height) {
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
    renderShakeOffset = this.screenShakeOffset();
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

    state.apples.forEach((appleCell) => {
      const apple = worldToScreen(appleCell, width, height);
      const appleRadius = Math.max(7, size * 0.48);
      this.graphics.fillStyle(0xb4464d, 1);
      this.graphics.fillCircle(apple.x, apple.y, appleRadius);
      this.graphics.fillStyle(0x7c3d43, 0.42);
      this.graphics.fillCircle(apple.x - 1, apple.y + 2, appleRadius * 0.17);
      this.graphics.fillStyle(0x935057, 1);
      this.graphics.fillCircle(apple.x - appleRadius + 1, apple.y - 3, 2);
      this.graphics.fillCircle(apple.x - appleRadius + 1, apple.y + 3, 2);
      this.graphics.fillCircle(apple.x - appleRadius + 4, apple.y, 1.5);
      this.graphics.fillStyle(0x8a6b3d, 1);
      this.graphics.fillEllipse(apple.x + 4, apple.y - 8, 8, 4);
    });

    state.segments.forEach((segment, index) => {
      const pos = worldToScreen(segment, width, height);
      const alpha = index === 0 ? 1 : Math.max(0.42, 1 - index * 0.08);
      const color = index === 0 ? 0x2cf38c : 0x3acb7a;
      this.graphics.fillStyle(color, alpha);
      this.graphics.fillRoundedRect(pos.x - size / 2, pos.y - size / 2, size, size, Math.min(8, size / 3));
    });

    const headPulse = state.bounceTimer > 0 ? 0xffc76e : 0xe8fff4;
    this.graphics.lineStyle(3, headPulse, 1);
    this.graphics.strokeCircle(width / 2 + renderShakeOffset.x, height / 2 + renderShakeOffset.y, size * 0.72);

    this.drawRain(width, height);

    const remainingTargetApples = Math.max(0, WIN_APPLE_COUNT - state.applesEaten);
    this.hudText.setText(`목표 사과: ${remainingTargetApples}개`);
    this.hintText.setY(height - 34);
    this.hintText.setText(state.mode === "playing" ? "손가락이나 터치를 이용해 누른 채 방향전환 가능" : "비 내리는 골목에서 시작을 기다리는 중");
    renderShakeOffset = { x: 0, y: 0 };
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
window.__snake_controls = {
  start: startOrResumeGame,
  pause: pauseGame,
  requestExit: requestExitConfirmation,
  cancelExit: cancelExitConfirmation,
  confirmExit,
  restart: restartGame,
  finish: finishGame,
  placeAppleSet,
};

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseAudio();
  } else {
    resumeAudio();
  }
});

["pointerdown", "touchstart", "click"].forEach((eventName) => {
  document.addEventListener(eventName, startGameAudio, { capture: true, passive: true });
});

window.addEventListener("focus", resumeAudio);

window.setTimeout(() => {
  startGameAudio();
}, 250);
