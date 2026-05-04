const FIELD_COLS = 100;
const FIELD_ROWS = 100;
const CELL_SIZE = 16;
const MOVE_INTERVAL_MS = 200;
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
  moveAccumulator: 0,
  bounceTimer: 0,
  segments: [{ x: 50, y: 50 }],
  apple: { x: 58, y: 50 },
  lastEvent: "started",
};

let sceneRef = null;

function bodySize() {
  return Math.min(MAX_BODY_SIZE, BASE_BODY_SIZE + (state.level - 1) * BODY_GROWTH_PER_LEVEL);
}

function keyOf(cell) {
  return `${cell.x},${cell.y}`;
}

function reverseDirection(direction) {
  return {
    x: -direction.x,
    y: -direction.y,
    label: direction.label.startsWith("up")
      ? direction.label.replace("up", "down")
      : direction.label.startsWith("down")
        ? direction.label.replace("down", "up")
        : direction.label === "left"
          ? "right"
          : direction.label === "right"
            ? "left"
            : `${-direction.x},${-direction.y}`,
  };
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

function isInsideField(cell) {
  return cell.x >= 0 && cell.x < FIELD_COLS && cell.y >= 0 && cell.y < FIELD_ROWS;
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

function bounceFromSelf() {
  state.segments.reverse();
  state.direction = reverseDirection(state.direction);
  state.pendingDirection = state.direction;
  state.bounceTimer = 220;
  state.lastEvent = "body-bounce";
}

function bounceFromWall() {
  const reversed = reverseDirection(state.direction);
  state.direction = reversed;
  state.pendingDirection = reversed;
  state.bounceTimer = 220;
  state.lastEvent = "wall-bounce";
}

function moveSnakeOneCell() {
  state.direction = state.pendingDirection;
  const head = state.segments[0];
  let next = { x: head.x + state.direction.x, y: head.y + state.direction.y };

  if (!isInsideField(next)) {
    bounceFromWall();
    next = {
      x: Phaser.Math.Clamp(head.x + state.direction.x, 0, FIELD_COLS - 1),
      y: Phaser.Math.Clamp(head.y + state.direction.y, 0, FIELD_ROWS - 1),
    };
  }

  const bodyWithoutTail = state.segments.slice(0, Math.max(1, state.segments.length - 1));
  if (bodyWithoutTail.some((segment) => segment.x === next.x && segment.y === next.y)) {
    bounceFromSelf();
    return;
  }

  state.segments.unshift(next);
  const ateApple = next.x === state.apple.x && next.y === state.apple.y;
  if (ateApple) {
    state.applesEaten += 1;
    state.level += 1;
    state.lastEvent = "apple";
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
      const direction = directionFromTouch(pointer.x, pointer.y, this.scale.width, this.scale.height);
      if (direction) {
        state.pendingDirection = direction;
        state.lastEvent = `turn-${direction.label}`;
      }
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

  drawTouchZones(width, height) {
    this.graphics.lineStyle(1, 0x7e9b82, 0.25);
    this.graphics.lineBetween(width / 3, 0, width / 3, height);
    this.graphics.lineBetween((width / 3) * 2, 0, (width / 3) * 2, height);
    this.graphics.lineBetween(0, height / 3, width, height / 3);
    this.graphics.lineBetween(0, (height / 3) * 2, width, (height / 3) * 2);
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
    this.drawTouchZones(width, height);

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
    this.hintText.setText("화면 방향 터치로 8방향 이동");
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
