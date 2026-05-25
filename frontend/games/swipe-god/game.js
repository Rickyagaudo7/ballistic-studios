const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

const PIXELS_PER_INCH = 96;
const SEGMENT_LENGTH = 3 * PIXELS_PER_INCH;
const tolerance = 155;
const TIMER_DURATION = 3000; // ms allowed between swipes before timeout
const HELP_TRACE_FADE_DURATION = 2500; // ms for helping trace fade out
const STREAK_LINE_FADE_DURATION = 1500; // ms for streak lines to fade out smoothly

let currentLevel = 1;
let maxLines = 10;
let fullSequence = [];
let sequence = [];
let cpuPlaying = true;
let userTrace = [];
let tracing = false;


let animationProgress = 0;
let animationSpeed = 0.004; // slower fixed speed for animation
let shakeTime = 0;
let shakeStrength = 0;
let timerStart = 0;
let timerRunning = false;
let timerId = null;

// Helping trace fade timer
let helpTraceStart = 0;
let helpTraceAlpha = 1;

// Streak system - stores fading info per streak line
let streak = 0;
let completedStreakLines = []; // { points, color, fadeStart, fadeProgress }

let glowAnimating = false;
let glowProgress = 0;
const glowSpeed = 0.008;

function triggerShake(strength = 12, duration = 300) {
  shakeStrength = strength;
  shakeTime = duration;
}

function getShakeOffset() {
  if (shakeTime > 0) {
    shakeTime -= 16;

    return {
      x: (Math.random() - 0.5) * shakeStrength,
      y: (Math.random() - 0.5) * shakeStrength
    };
  }

  return { x: 0, y: 0 };
}


function getStreakColor(s) {
  if (s >= 10) return "rgba(255,0,255,0.9)";       // Magenta
  if (s >= 6) return "rgba(255,215,0,0.9)";        // Gold
  if (s >= 3) return "rgba(0,255,0,0.9)";          // Green
  return "rgba(0,255,204,0.9)";                     // Cyan default
}

function dimColor(rgba, factor = 0.4, alphaFactor = 1) {
  const parts = rgba.match(/rgba?\((\d+),(\d+),(\d+),?([\d.]*)\)/);
  if (!parts) return rgba;
  let [r, g, b, a] = parts.slice(1).map(Number);
  if (isNaN(a)) a = 1;
  r = Math.floor(r * factor);
  g = Math.floor(g * factor);
  b = Math.floor(b * factor);
  a = a * factor * 0.7 * alphaFactor;
  return `rgba(${r},${g},${b},${a})`;
}

// Generates a smooth circular sequence of points for the trace
function generateSequence(level) {
  const points = [];
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const maxRadius = Math.min(canvas.width, canvas.height) / 3;

  points.push({ x: centerX, y: centerY }); // start at center

  // Initial random angle
  let angle = Math.random() * 2 * Math.PI;

  for (let i = 1; i <= level; i++) {
    const last = points[points.length - 1];

    // Limit angle change to ±45 degrees per step (smoother turns)
    const maxTurn = Math.PI / 4;
    const angleChange = (Math.random() * 2 - 1) * maxTurn;
    angle += angleChange;

    // Calculate candidate next point
    let newX = last.x + Math.cos(angle) * SEGMENT_LENGTH;
    let newY = last.y + Math.sin(angle) * SEGMENT_LENGTH;

    // Check if outside circular boundary
    let distFromCenter = Math.hypot(newX - centerX, newY - centerY);
    if (distFromCenter > maxRadius) {
      // Steer angle gently back toward center
      const angleToCenter = Math.atan2(centerY - last.y, centerX - last.x);
      const steerStrength = 0.7;
      angle = angle * (1 - steerStrength) + angleToCenter * steerStrength;

      // Recalculate next point after steering
      newX = last.x + Math.cos(angle) * SEGMENT_LENGTH;
      newY = last.y + Math.sin(angle) * SEGMENT_LENGTH;

      // Clamp if still out of bounds (rare)
      distFromCenter = Math.hypot(newX - centerX, newY - centerY);
      if (distFromCenter > maxRadius) {
        const scaleBack = maxRadius / distFromCenter;
        newX = centerX + (newX - centerX) * scaleBack;
        newY = centerY + (newY - centerY) * scaleBack;
      }
    }

    points.push({ x: newX, y: newY });
  }

  return points;
}

function drawBackground() {
  const gradient = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    Math.min(canvas.width, canvas.height) / 10,
    canvas.width / 2,
    canvas.height / 2,
    Math.min(canvas.width, canvas.height) / 2
  );
  gradient.addColorStop(0, "#001f26");
  gradient.addColorStop(1, "#000811");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawPartialPath(points, t, color = "rgba(0, 255, 204, 1)", lineWidth = 8, shadowBlur = 15) {
  if (points.length < 2) return;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = shadowBlur;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  const totalSegments = points.length - 1;
  let drawnLength = t * totalSegments;

  for (let i = 1; i < points.length; i++) {
    if (drawnLength >= 1) {
      ctx.lineTo(points[i].x, points[i].y);
      drawnLength -= 1;
    } else if (drawnLength > 0) {
      const start = points[i - 1];
      const end = points[i];
      const partialX = start.x + (end.x - start.x) * drawnLength;
      const partialY = start.y + (end.y - start.y) * drawnLength;
      ctx.lineTo(partialX, partialY);
      break;
    } else {
      break;
    }
  }

  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawFadingHelpTrace() {
  if (sequence.length < 2 || userTrace.length < 1) return;

  const elapsed = Date.now() - helpTraceStart;
  helpTraceAlpha = 1 - elapsed / HELP_TRACE_FADE_DURATION;
  if (helpTraceAlpha < 0) helpTraceAlpha = 0;
  if (helpTraceAlpha === 0) return;

  const lastUser = userTrace[userTrace.length - 1];
  const totalSegments = sequence.length - 1;

  let minDist = Infinity;
  let tUser = 0;
  for (let i = 0; i < totalSegments; i++) {
    const start = sequence[i];
    const end = sequence[i + 1];
    const A = lastUser.x - start.x;
    const B = lastUser.y - start.y;
    const C = end.x - start.x;
    const D = end.y - start.y;
    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    let param = len_sq !== 0 ? dot / len_sq : -1;
    param = Math.min(Math.max(param, 0), 1);
    const xx = start.x + param * C;
    const yy = start.y + param * D;
    const dist = Math.hypot(lastUser.x - xx, lastUser.y - yy);
    if (dist < minDist) {
      minDist = dist;
      tUser = (i + param) / totalSegments;
    }
  }

  ctx.lineCap = "round";
  ctx.lineWidth = 8;

  for (let i = 0; i < totalSegments; i++) {
    const start = sequence[i];
    const end = sequence[i + 1];
    const segCenterT = (i + 0.5) / totalSegments;

    let alpha;
    if (segCenterT > tUser) {
      alpha = 0.1 * helpTraceAlpha;
    } else {
      alpha = (0.05 + 0.75 * (segCenterT / tUser)) * helpTraceAlpha;
    }
    alpha = Math.min(Math.max(alpha, 0.01), 0.8 * helpTraceAlpha);

    const color = `rgba(0,255,204,${alpha})`;

    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 * helpTraceAlpha;

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
}

function drawStreakLines() {
  const now = Date.now();
  completedStreakLines = completedStreakLines.filter(line => {
    if (!line.fadeStart) return true;
    const elapsed = now - line.fadeStart;
    line.fadeProgress = Math.min(elapsed / STREAK_LINE_FADE_DURATION, 1);
    return line.fadeProgress < 1;
  });

  completedStreakLines.forEach(line => {
    const alpha = line.fadeStart ? 1 - line.fadeProgress : 1;
    const shrinkFactor = line.fadeStart ? 1 - line.fadeProgress * 0.7 : 1;
    const color = dimColor(line.color, 0.4, alpha);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(shrinkFactor, shrinkFactor);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    drawPartialPath(line.points, 1, color, 4, 8);

    ctx.restore();
  });
}

function drawUserTrace() {
  if (userTrace.length < 2) return;

  // Use streak color dynamically here:
  const color = getStreakColor(streak);

  ctx.strokeStyle = color;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 30;

  ctx.beginPath();
  ctx.moveTo(userTrace[0].x, userTrace[0].y);
  for (let i = 1; i < userTrace.length; i++) {
    ctx.lineTo(userTrace[i].x, userTrace[i].y);
  }
  ctx.stroke();

  ctx.shadowBlur = 0;
}

function distancePointToSegment(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = -1;
  if (len_sq !== 0) param = dot / len_sq;

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

function validateUserTrace() {
  if (userTrace.length < 2) return false;

  const points = sequence;
  let currentSegment = 0;

  for (const pt of userTrace) {
    if (currentSegment >= points.length - 1) break;

    const start = points[currentSegment];
    const end = points[currentSegment + 1];
    const dist = distancePointToSegment(pt.x, pt.y, start.x, start.y, end.x, end.y);

    if (dist > tolerance) {
      return false;
    }

    const distToEnd = Math.hypot(pt.x - end.x, pt.y - end.y);
    if (distToEnd < tolerance) {
      currentSegment++;
    }
  }

  return currentSegment >= points.length - 1;
}

function cpuAnimateDraw() {
  cpuPlaying = true;
  animationProgress = 0;
  let pulsePhase = 0;

  animationSpeed = 0.004; // slowed down speed here

  glowAnimating = false;

  function step() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const shake = getShakeOffset();
ctx.save();
ctx.translate(shake.x, shake.y);

    drawBackground();
    drawStreakLines();

    const pulseGlow = 15 + 10 * Math.sin(pulsePhase);
    pulsePhase += 0.1;

    const currentColor = getStreakColor(streak);
    drawPartialPath(sequence, animationProgress, currentColor, 12, pulseGlow);

    drawTimerBar();
    displayLevel();

    animationProgress += animationSpeed;
    if (animationProgress <= 1) {
      requestAnimationFrame(step);
    } else {
      cpuPlaying = false;
      setTimeout(() => {
  cpuPlaying = false; // now player can interact
}, 200);
      animationProgress = 1;
      glowAnimating = true;
      glowProgress = 0;
      animateGlowAlongLine();
      ctx.restore();
    }
  }
  step();
}

function animateGlowAlongLine() {
  if (!glowAnimating) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawStreakLines();

  drawPartialPath(sequence, 1, "rgba(0,255,204,0.3)", 8, 10);

  const totalSegments = sequence.length - 1;
  let scaledT = glowProgress * totalSegments;
  let segIndex = Math.floor(scaledT);
  let segT = scaledT - segIndex;

  if (segIndex >= totalSegments) segIndex = totalSegments - 1;

  const start = sequence[segIndex];
  const end = sequence[segIndex + 1];

  const x = start.x + (end.x - start.x) * segT;
  const y = start.y + (end.y - start.y) * segT;

  const radius = 20;
  const gradient = ctx.createRadialGradient(x, y, radius / 4, x, y, radius);
  gradient.addColorStop(0, "rgba(0,255,255,0.9)");
  gradient.addColorStop(1, "rgba(0,255,255,0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  drawPartialPath(sequence, 1, "rgba(0,255,204,1)", 12, 20);

  drawTimerBar();
  displayLevel();

  glowProgress += glowSpeed;
  if (glowProgress > 1) glowProgress = 0;

  requestAnimationFrame(animateGlowAlongLine);
}

// Draw circular timer ring urging user to trace quickly
function drawTimerBar() {
  if (!timerRunning) return;

  const elapsed = Date.now() - timerStart;
  const t = Math.min(elapsed / TIMER_DURATION, 1);

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(canvas.width, canvas.height) / 3;

  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + 2 * Math.PI * t;

  ctx.lineWidth = 10;
  ctx.strokeStyle = "#00ffcc";
  ctx.shadowColor = "#00ffcc";
  ctx.shadowBlur = 20;
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, startAngle, endAngle);
  ctx.stroke();

  ctx.shadowBlur = 0;
}

async function onTimerEnd() {
  timerRunning = false;
  if (timerId) clearTimeout(timerId);
  await flashRed();
  resetStreak();
  cpuAnimateDraw();
}

function resetStreak() {
  streak = 0;
  completedStreakLines = [];
}

function flashRed() {
  return new Promise(resolve => {
    let flashes = 0;
    function flash() {
      ctx.fillStyle = flashes % 2 === 0 ? 'rgba(255,0,0,0.5)' : 'transparent';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      flashes++;
      if (flashes < 6) setTimeout(flash, 150);
      else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        resolve();
      }
    }
    flash();
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function displayLevel() {
  const fontSize = 30;
  ctx.font = `${fontSize}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;
  ctx.fillStyle = "#00ffcc";
  ctx.shadowColor = "#00ffcc";
  ctx.shadowBlur = 10;
  ctx.fillText(`Level: ${currentLevel}`, 20, fontSize + 10);
  ctx.shadowBlur = 0;

  ctx.font = "24px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
  const streakColor = getStreakColor(streak);
  ctx.fillStyle = streakColor;
  ctx.shadowColor = streakColor;
  ctx.shadowBlur = 8;
  ctx.fillText(`🔥 Streak: ${streak}`, 20, fontSize + 40);
  ctx.shadowBlur = 0;
}

canvas.addEventListener("pointerdown", e => {
  if (cpuPlaying) return;
  glowAnimating = false;
  tracing = true;
  userTrace = [{ x: e.clientX, y: e.clientY }];

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();

  helpTraceStart = Date.now();
  helpTraceAlpha = 1;

  drawFadingHelpTrace();
  drawUserTrace();
  displayLevel();

  timerStart = Date.now();
  timerRunning = true;

  if (timerId) clearTimeout(timerId);
  timerId = setTimeout(onTimerEnd, TIMER_DURATION);
});

canvas.addEventListener("pointermove", e => {
  if (!tracing || cpuPlaying) return;
  userTrace.push({ x: e.clientX, y: e.clientY });

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawStreakLines();

  drawFadingHelpTrace();

  drawUserTrace();
  displayLevel();
  drawTimerBar();

  if (timerId) clearTimeout(timerId);
  timerId = setTimeout(onTimerEnd, TIMER_DURATION);
});

canvas.addEventListener("pointerup", async e => {
  if (!tracing || cpuPlaying) return;

  tracing = false;

  timerRunning = false;
  if (timerId) clearTimeout(timerId);

  if (validateUserTrace()) {
    streak++;

    completedStreakLines.push({
      points: [...sequence],
      color: getStreakColor(streak),
      fadeStart: null,
      fadeProgress: 0,
    });

    await animateShimmer();
    await fadeOutSequence();

    completedStreakLines[completedStreakLines.length - 1].fadeStart = Date.now();

    currentLevel++;
    if (currentLevel > maxLines) currentLevel = maxLines;
    sequence = fullSequence.slice(0, currentLevel + 1);

   setTimeout(() => {
  drawBackground(); // instead of clearing to black

  ctx.font = "40px Arial";
  ctx.fillStyle = "#00ffcc";
  ctx.textAlign = "center";
  ctx.fillText("Next Level...", canvas.width / 2, canvas.height / 2);

  setTimeout(() => {
    cpuAnimateDraw();
  }, 1500);

}, 300);
  }
});
async function animateShimmer() {
  const steps = 60;
  const interval = 20;

  for (let i = 0; i <= steps; i++) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawPartialPath(sequence, 1, "rgba(0,255,204,0.3)");

    const t = i / steps;
    drawShimmerAt(t);

    await delay(interval);
  }
}

function drawShimmerAt(t) {
  if (sequence.length < 2) return;

  const totalSegments = sequence.length - 1;
  let scaledT = t * totalSegments;
  let segIndex = Math.floor(scaledT);
  let segT = scaledT - segIndex;

  if (segIndex >= totalSegments) segIndex = totalSegments - 1;

  const start = sequence[segIndex];
  const end = sequence[segIndex + 1];

  const x = start.x + (end.x - start.x) * segT;
  const y = start.y + (end.y - start.y) * segT;

  const radius = 25;
  const gradient = ctx.createRadialGradient(x, y, radius / 4, x, y, radius);
  gradient.addColorStop(0, "rgba(255,255,255,0.9)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

async function fadeOutSequence() {
  const steps = 30;
  for (let i = steps; i >= 0; i--) {
    const alpha = i / steps;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawStreakLines();
    drawPartialPath(sequence, 1, `rgba(0,255,204,${alpha})`, 8, 15);
    await delay(16);
  }
}

function init() {
  currentLevel = 1;
  streak = 0;
  completedStreakLines = [];

  fullSequence = generateSequence(maxLines);
  sequence = fullSequence.slice(0, currentLevel + 1);

  cpuPlaying = true; // CPU is playing animation first

  cpuAnimateDraw();
}
