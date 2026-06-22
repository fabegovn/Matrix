const canvas = document.getElementById("mazeCanvas");
const ctx = canvas.getContext("2d");
const levelKicker = document.getElementById("levelKicker");
const levelName = document.getElementById("levelName");
const startLabel = document.getElementById("startLabel");
const finishLabel = document.getElementById("finishLabel");
const winModal = document.getElementById("winModal");
const helpModal = document.getElementById("helpModal");
const winTitle = document.getElementById("winTitle");
const winMessage = document.getElementById("winMessage");
const nextButton = document.getElementById("nextButton");
const confettiLayer = document.getElementById("confettiLayer");

// iOS Safari may still zoom on a rapid second tap even when viewport zoom is disabled.
let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  },
  { passive: false },
);

document.addEventListener(
  "gesturestart",
  (event) => {
    event.preventDefault();
  },
  { passive: false },
);

const difficulties = [
  { name: "Little Loop", rows: 9, cols: 5, color: "#6c55db" },
  { name: "Zigzag Garden", rows: 10, cols: 6, color: "#36cda0" },
  { name: "Bouncy Bridges", rows: 11, cols: 7, color: "#55b6e9" },
  { name: "Twisty Trail", rows: 12, cols: 8, color: "#ff9d4d" },
  { name: "Mega Matrix", rows: 13, cols: 9, color: "#ff766d" },
];

let matrixNumber = 1;
let difficultyIndex = 0;
let currentSeed = Math.floor(Math.random() * 2147483646) + 1;
let maze = null;
let player = { row: 0, col: 0 };
let route = [{ row: 0, col: 0 }];
let won = false;
let soundEnabled = true;
let audioContext = null;
let lastMoveTime = 0;

function seededRandom(seed) {
  let value = seed % 2147483647;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function createMaze(rows, cols, seed) {
  const random = seededRandom(seed);
  const cells = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      top: true,
      right: true,
      bottom: true,
      left: true,
      visited: false,
    })),
  );
  const stack = [];
  let current = { row: 0, col: 0 };
  cells[0][0].visited = true;
  let visited = 1;

  while (visited < rows * cols) {
    const neighbors = [];
    const { row, col } = current;
    if (row > 0 && !cells[row - 1][col].visited) neighbors.push(["top", row - 1, col, "bottom"]);
    if (col < cols - 1 && !cells[row][col + 1].visited) neighbors.push(["right", row, col + 1, "left"]);
    if (row < rows - 1 && !cells[row + 1][col].visited) neighbors.push(["bottom", row + 1, col, "top"]);
    if (col > 0 && !cells[row][col - 1].visited) neighbors.push(["left", row, col - 1, "right"]);

    if (neighbors.length) {
      const [wall, nextRow, nextCol, opposite] =
        neighbors[Math.floor(random() * neighbors.length)];
      cells[row][col][wall] = false;
      cells[nextRow][nextCol][opposite] = false;
      stack.push(current);
      current = { row: nextRow, col: nextCol };
      cells[nextRow][nextCol].visited = true;
      visited += 1;
    } else {
      current = stack.pop();
    }
  }

  cells.flat().forEach((cell) => {
    delete cell.visited;
  });
  return cells;
}

function setCanvasSize() {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

function metrics() {
  const rect = canvas.getBoundingClientRect();
  const rows = difficulties[difficultyIndex].rows;
  const cols = difficulties[difficultyIndex].cols;
  const padding = Math.max(20, Math.min(rect.width, rect.height) * 0.07);
  return {
    width: rect.width,
    height: rect.height,
    padding,
    cellW: (rect.width - padding * 2) / cols,
    cellH: (rect.height - padding * 2) / rows,
  };
}

function drawRoundedRect(x, y, width, height, radius, fill) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

function draw() {
  if (!maze) return;
  const { width, height, padding, cellW, cellH } = metrics();
  const level = difficulties[difficultyIndex];

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfbff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#f2f1fb";
  for (let row = 0; row < level.rows; row += 1) {
    for (let col = 0; col < level.cols; col += 1) {
      if ((row + col) % 2 === 0) {
        ctx.fillRect(padding + col * cellW, padding + row * cellH, cellW, cellH);
      }
    }
  }

  ctx.strokeStyle = "#364564";
  ctx.lineWidth = Math.max(2.8, Math.min(cellW, cellH) * 0.075);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();

  maze.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const x = padding + colIndex * cellW;
      const y = padding + rowIndex * cellH;
      if (cell.top) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + cellW, y);
      }
      if (cell.left) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + cellH);
      }
      if (rowIndex === level.rows - 1 && cell.bottom) {
        ctx.moveTo(x, y + cellH);
        ctx.lineTo(x + cellW, y + cellH);
      }
      if (colIndex === level.cols - 1 && cell.right) {
        ctx.moveTo(x + cellW, y);
        ctx.lineTo(x + cellW, y + cellH);
      }
    });
  });
  ctx.stroke();

  if (route.length > 1) {
    ctx.save();
    ctx.strokeStyle = level.color;
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = Math.min(cellW, cellH) * 0.28;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    route.forEach((point, index) => {
      const x = padding + (point.col + 0.5) * cellW;
      const y = padding + (point.row + 0.5) * cellH;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }

  const endX = padding + (level.cols - 0.5) * cellW;
  const endY = padding + (level.rows - 0.5) * cellH;
  const targetSize = Math.min(cellW, cellH) * 0.46;
  ctx.fillStyle = "rgba(108, 85, 219, 0.13)";
  ctx.beginPath();
  ctx.arc(endX, endY, targetSize * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = level.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(endX, endY, targetSize * 0.58, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(endX, endY, targetSize * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = level.color;
  ctx.fill();

  drawPlayer(padding + (player.col + 0.5) * cellW, padding + (player.row + 0.5) * cellH);
  positionLabels();
}

function drawPlayer(x, y) {
  const { cellW, cellH } = metrics();
  const size = Math.min(cellW, cellH) * 0.62;
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = "rgba(80, 60, 170, .25)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  drawRoundedRect(-size / 2, -size / 2, size, size, size * 0.3, difficulties[difficultyIndex].color);
  ctx.shadowColor = "transparent";

  ctx.fillStyle = "white";
  const eyeY = -size * 0.08;
  ctx.beginPath();
  ctx.arc(-size * 0.17, eyeY, size * 0.07, 0, Math.PI * 2);
  ctx.arc(size * 0.17, eyeY, size * 0.07, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "white";
  ctx.lineWidth = Math.max(1.5, size * 0.055);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, size * 0.04, size * 0.2, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.restore();
}

function positionLabels() {
  const { width, height, padding, cellW, cellH } = metrics();
  const level = difficulties[difficultyIndex];
  const toPercent = (value, total) => `${(value / total) * 100}%`;
  startLabel.style.left = toPercent(padding + cellW * 0.5, width);
  startLabel.style.top = toPercent(Math.max(12, padding * 0.42), height);
  finishLabel.style.left = toPercent(padding + (level.cols - 0.5) * cellW, width);
  finishLabel.style.top = toPercent(Math.min(height - 12, padding + level.rows * cellH + padding * 0.55), height);
}

function loadMatrix({ randomize = false, advance = false } = {}) {
  if (advance) {
    matrixNumber += 1;
    difficultyIndex = Math.min(difficultyIndex + 1, difficulties.length - 1);
  }
  if (randomize) {
    currentSeed = Math.floor(Math.random() * 2147483646) + 1;
  }
  const level = difficulties[difficultyIndex];
  maze = createMaze(level.rows, level.cols, currentSeed);
  player = { row: 0, col: 0 };
  route = [{ row: 0, col: 0 }];
  won = false;
  levelKicker.textContent = `Matrix ${matrixNumber}`;
  levelName.textContent = level.name;
  requestAnimationFrame(setCanvasSize);
  playTone(440, 0.08, "sine", 0.025);
}

function move(direction) {
  if (won || !maze || helpModal.open || winModal.open) return;
  const now = performance.now();
  if (now - lastMoveTime < 70) return;
  lastMoveTime = now;

  const cell = maze[player.row][player.col];
  const vectors = {
    up: { wall: "top", row: -1, col: 0, tone: 523.25 },
    right: { wall: "right", row: 0, col: 1, tone: 659.25 },
    down: { wall: "bottom", row: 1, col: 0, tone: 587.33 },
    left: { wall: "left", row: 0, col: -1, tone: 493.88 },
  };
  const step = vectors[direction];

  if (cell[step.wall]) {
    playTone(145, 0.07, "triangle", 0.025);
    canvas.animate(
      [
        { transform: "translateX(0)" },
        { transform: `translateX(${direction === "left" ? -3 : direction === "right" ? 3 : 0}px)` },
        { transform: "translateX(0)" },
      ],
      { duration: 130 },
    );
    return;
  }

  player.row += step.row;
  player.col += step.col;
  const previousPoint = route.at(-2);
  if (
    previousPoint &&
    previousPoint.row === player.row &&
    previousPoint.col === player.col
  ) {
    route.pop();
  } else {
    route.push({ ...player });
  }
  playMoveSound(step.tone);
  draw();

  const level = difficulties[difficultyIndex];
  if (player.row === level.rows - 1 && player.col === level.cols - 1) {
    completeLevel();
  }
}

function getAudioContext() {
  if (!soundEnabled) return null;
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function playTone(frequency, duration, type = "sine", volume = 0.04, delay = 0) {
  const audio = getAudioContext();
  if (!audio) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const start = audio.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playMoveSound(note) {
  playTone(note, 0.12, "sine", 0.035);
  playTone(note * 1.5, 0.1, "triangle", 0.012, 0.025);
}

function playWinSong() {
  [523.25, 659.25, 783.99, 1046.5].forEach((note, index) => {
    playTone(note, 0.24, "sine", 0.055, index * 0.13);
    playTone(note / 2, 0.28, "triangle", 0.018, index * 0.13);
  });
}

function completeLevel() {
  won = true;
  playWinSong();
  launchConfetti();

  const titles = ["Brilliant exploring!", "Maze magic!", "What a clever team!", "You did it!"];
  winTitle.textContent = titles[(matrixNumber - 1) % titles.length];
  winMessage.textContent =
    "You found the way out. Give each other a high five, then discover a brand-new maze!";
  nextButton.textContent = "New random matrix →";

  setTimeout(() => winModal.showModal(), 650);
}

function launchConfetti() {
  const colors = ["#6c55db", "#36cda0", "#ffc847", "#ff766d", "#55b6e9"];
  confettiLayer.innerHTML = "";
  for (let index = 0; index < 55; index += 1) {
    const piece = document.createElement("i");
    piece.className = "confetti";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.4}s`;
    piece.style.setProperty("--drift", `${Math.random() * 180 - 90}px`);
    piece.style.setProperty("--spin", `${Math.random() * 900 - 450}deg`);
    confettiLayer.appendChild(piece);
  }
  setTimeout(() => {
    confettiLayer.innerHTML = "";
  }, 2600);
}

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog").close());
});
document.getElementById("soundButton").addEventListener("click", (event) => {
  soundEnabled = !soundEnabled;
  event.currentTarget.classList.toggle("muted", !soundEnabled);
  event.currentTarget.setAttribute("aria-label", soundEnabled ? "Turn sound off" : "Turn sound on");
  if (soundEnabled) playTone(659.25, 0.12, "sine", 0.04);
});
document.getElementById("replayButton").addEventListener("click", () => {
  winModal.close();
  loadMatrix();
});
nextButton.addEventListener("click", () => {
  winModal.close();
  loadMatrix({ randomize: true, advance: true });
});

let touchIsDown = false;
canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "mouse") {
    touchIsDown = true;
    canvas.setPointerCapture(event.pointerId);
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse" && !touchIsDown) return;
  const rect = canvas.getBoundingClientRect();
  const { padding, cellW, cellH } = metrics();
  const col = Math.floor((event.clientX - rect.left - padding) / cellW);
  const row = Math.floor((event.clientY - rect.top - padding) / cellH);
  const level = difficulties[difficultyIndex];
  if (row < 0 || col < 0 || row >= level.rows || col >= level.cols) return;

  const rowDelta = row - player.row;
  const colDelta = col - player.col;
  if (Math.abs(rowDelta) + Math.abs(colDelta) !== 1) return;
  if (rowDelta === -1) move("up");
  else if (rowDelta === 1) move("down");
  else if (colDelta === -1) move("left");
  else move("right");
});

canvas.addEventListener("pointerup", () => {
  touchIsDown = false;
});
canvas.addEventListener("pointercancel", () => {
  touchIsDown = false;
});

window.addEventListener("resize", setCanvasSize);
loadMatrix();
