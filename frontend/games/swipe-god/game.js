"use strict";

const canvas = document.getElementById("gameCanvas");
if (!canvas) throw new Error("gameCanvas element was not found.");

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Unable to create 2D canvas context.");

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
    MAX_LEVEL: 10,

    // Timer = TIMER_BASE + (path length / required speed). Never below MIN_TIMER.
    TIMER_BASE: 1200,
    MIN_TIMER: 2200,

    // Tolerance
    MIN_TRACE_TOLERANCE: 45,
    MAX_TRACE_TOLERANCE: 110,
    TOLERANCE_SCREEN_RATIO: 0.08,

    // Validation
    MIN_PATH_COVERAGE: 0.70,
    MIN_PATH_PROGRESS: 0.90,
    CHECKPOINT_SPACING: 0.08,
    CHECKPOINT_TOLERANCE_RATIO: 0.95,

    // Progress tracking only searches this window around the player's
    // furthest progress. Prevents snapping to the wrong part of paths that
    // loop back near themselves, and also limits backtracking.
    TRACK_WINDOW_BACK: 0.16,
    TRACK_WINDOW_FORWARD: 0.35,

    // Path generation
    PATH_RADIUS_RATIO: 0.36,
    MIN_SELF_DISTANCE: 85,
    BASE_CURVE_POINTS: 12,
    MAX_TURN: Math.PI / 4,

    // Visual effects
    HELP_TRACE_FADE_DURATION: 2200,
    STREAK_LINE_FADE_DURATION: 1500,
    CPU_ANIMATION_DURATION: 3600,
    GLOW_SPEED: 0.35,
    SHIMMER_DURATION: 1200,
    SUCCESS_FADE_DURATION: 500,
    NEXT_LEVEL_DELAY: 1500,

    // Player trace
    MIN_TRACE_POINT_DISTANCE: 4,
    MAX_TRACE_POINTS: 1400,

    // Particles
    MAX_PARTICLES: 450,
    SUCCESS_PARTICLE_COUNT: 75,
    FAILURE_PARTICLE_COUNT: 45,
    TRACE_PARTICLE_INTERVAL: 0.025,

    // Game feel
    FAILURE_RECOVERY_DELAY: 700,
    INVALID_START_SHAKE_STRENGTH: 5,
    INVALID_START_SHAKE_DURATION: 120,
    FAILURE_SHAKE_STRENGTH: 12,
    FAILURE_SHAKE_DURATION: 350,
    SUCCESS_SHAKE_STRENGTH: 4,
    SUCCESS_SHAKE_DURATION: 180,

    // UI
    UI_MARGIN: 20,
    HUD_FONT: 30,
    BUTTON_MIN_SIZE: 44,

    // Score
    BASE_LEVEL_SCORE: 100,
    PERFECT_BONUS: 100,
    SPEED_BONUS_MAX: 100,
    STREAK_MULTIPLIER_STEP: 0.25,

    // Storage
    STORAGE_KEY: "neonTraceGameBestScore",
    STORAGE_STREAK_KEY: "neonTraceGameBestStreak",
    STORAGE_SETTINGS_KEY: "neonTraceGameSettings"
};

const FONT = "'Segoe UI', -apple-system, 'Helvetica Neue', Arial, sans-serif";

// ============================================================
// GAME STATES
// ============================================================

const GAME_STATE = {
    DEMO: "demo",
    READY: "ready",
    TRACING: "tracing",
    SUCCESS: "success",
    FAILED: "failed",
    COMPLETE: "complete",
    PAUSED: "paused"
};

let gameState = GAME_STATE.DEMO;
let stateBeforePause = GAME_STATE.READY;

// ============================================================
// GAME DATA
// ============================================================

let currentLevel = 1;
let streak = 0;
let score = 0;
let bestScore = 0;
let bestStreak = 0;

let levels = [];
let sequence = [];
let userTrace = [];
let traceResults = [];
let completedStreakLines = [];
let particles = [];
let pointerId = null;

// Trace progress (furthest valid progress along the path, 0..1)
let traceProgress = 0;
let lastTraceParticleTime = 0;

// Timers / animation
let timerStart = 0;
let timerRunning = false;
let timerDuration = CONFIG.MIN_TIMER;
let cpuAnimationProgress = 0;
let cpuAnimationStart = 0;
let pausedDemoElapsed = 0;
let glowAnimating = false;
let glowProgress = 0;
let helpTraceStart = 0;
let helpTraceAlpha = 1;
let successAnimationStart = 0;
let successAnimationProgress = 0;
let nextLevelTime = 0;
let failureFlash = 0;
let successFlash = 0;

// Shake
let shakeTime = 0;
let shakeDuration = 0;
let shakeStrength = 0;

// Misc
let lastFrameTime = performance.now();
let gameSessionId = 0;

// Display / layout (all game logic uses CSS pixels)
let W = 0;
let H = 0;
let dpr = 1;
let uiScale = 1;
let insets = { top: 0, right: 0, bottom: 0, left: 0 };
let layout = null; // { cx, cy, R }
let buttons = [];
let menuTop = 0;

const isTouchDevice =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;

// Settings (persisted)
const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const settings = {
    sound: true,
    reduceFlash: prefersReducedMotion
};

// Audio
let audioContext = null;
let audioReady = false;

// ============================================================
// PAGE SETUP (mobile / app wrapper friendly)
// ============================================================

function setupPage() {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
        meta = document.createElement("meta");
        meta.name = "viewport";
        document.head.appendChild(meta);
    }
    meta.content =
        "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

    const bg = "#000811";
    Object.assign(document.documentElement.style, {
        margin: "0", height: "100%", overflow: "hidden",
        overscrollBehavior: "none", background: bg
    });
    Object.assign(document.body.style, {
        margin: "0", height: "100%", overflow: "hidden",
        overscrollBehavior: "none", background: bg,
        userSelect: "none", webkitUserSelect: "none",
        webkitTouchCallout: "none"
    });
    Object.assign(canvas.style, {
        display: "block", touchAction: "none", userSelect: "none"
    });

    document.addEventListener("contextmenu", e => e.preventDefault());
}

function readSafeInsets() {
    const el = document.createElement("div");
    el.style.cssText =
        "position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;" +
        "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) " +
        "env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    insets = {
        top: parseFloat(cs.paddingTop) || 0,
        right: parseFloat(cs.paddingRight) || 0,
        bottom: parseFloat(cs.paddingBottom) || 0,
        left: parseFloat(cs.paddingLeft) || 0
    };
    el.remove();
}

// ============================================================
// STORAGE (Capacitor Preferences if present, else localStorage)
// ============================================================

const Prefs =
    (window.Capacitor &&
        window.Capacitor.Plugins &&
        window.Capacitor.Plugins.Preferences) || null;

async function storageGet(key) {
    try {
        if (Prefs) return (await Prefs.get({ key })).value;
        return localStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

async function storageSet(key, value) {
    try {
        if (Prefs) await Prefs.set({ key, value: String(value) });
        else localStorage.setItem(key, String(value));
    } catch (e) {
        // Storage may be unavailable.
    }
}

async function loadSavedData() {
    bestScore = Number(await storageGet(CONFIG.STORAGE_KEY)) || 0;
    bestStreak = Number(await storageGet(CONFIG.STORAGE_STREAK_KEY)) || 0;

    try {
        const raw = await storageGet(CONFIG.STORAGE_SETTINGS_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            if (typeof saved.sound === "boolean") settings.sound = saved.sound;
            if (typeof saved.reduceFlash === "boolean") {
                settings.reduceFlash = saved.reduceFlash;
            }
        }
    } catch (e) {
        // Ignore corrupt settings.
    }
}

function saveSettings() {
    storageSet(CONFIG.STORAGE_SETTINGS_KEY, JSON.stringify(settings));
}

function saveBestStats() {
    if (score > bestScore) bestScore = score;
    if (streak > bestStreak) bestStreak = streak;
    storageSet(CONFIG.STORAGE_KEY, bestScore);
    storageSet(CONFIG.STORAGE_STREAK_KEY, bestStreak);
}

// ============================================================
// RESIZE (uniform scaling, DPR aware)
// ============================================================

function computeLayout() {
    return {
        cx: W / 2,
        cy: H / 2,
        R: Math.min(W, H) * CONFIG.PATH_RADIUS_RATIO
    };
}

function resize() {
    const oldLayout = layout;

    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 3);

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    readSafeInsets();
    uiScale = Math.max(0.65, Math.min(1, Math.min(W, H) / 520));
    layout = computeLayout();

    // Re-map existing geometry with ONE uniform scale so shapes never stretch.
    if (oldLayout && oldLayout.R > 0 && levels.length > 0) {
        const remap = p => ({
            x: layout.cx + ((p.x - oldLayout.cx) / oldLayout.R) * layout.R,
            y: layout.cy + ((p.y - oldLayout.cy) / oldLayout.R) * layout.R
        });

        levels = levels.map(path => path.map(remap));
        sequence = levels[currentLevel - 1] || [];
        userTrace = userTrace.map(remap);
        completedStreakLines.forEach(line => {
            line.points = line.points.map(remap);
        });
    }
}

window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 150));

// ============================================================
// PATH DATA CACHE (cumulative lengths, computed once per path)
// ============================================================

const pathCache = new WeakMap();

function getPathData(points) {
    let data = pathCache.get(points);
    if (data) return data;

    const cum = [0];
    for (let i = 1; i < points.length; i++) {
        cum.push(
            cum[i - 1] +
            Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
        );
    }
    data = { cum, total: cum[cum.length - 1] };
    pathCache.set(points, data);
    return data;
}

function getPathLength(points = sequence) {
    return getPathData(points).total;
}

// Smallest segment index i >= 1 such that cum[i] >= target.
function findSegment(cum, target) {
    let lo = 1;
    let hi = cum.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] >= target) hi = mid;
        else lo = mid + 1;
    }
    return lo;
}

function getPointAlongPath(progress, points = sequence) {
    if (!points || points.length === 0) return { x: 0, y: 0 };
    if (points.length === 1) return { ...points[0] };

    const { cum, total } = getPathData(points);
    progress = Math.max(0, Math.min(1, progress));
    const target = total * progress;

    const i = findSegment(cum, target);
    const segLen = cum[i] - cum[i - 1];
    const local = segLen === 0 ? 0 : (target - cum[i - 1]) / segLen;

    return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * local,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * local
    };
}

// ============================================================
// GEOMETRY HELPERS
// ============================================================

function distancePointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);

    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Closest point on the path, optionally restricted to a progress window.
function getClosestPathProgress(point, minP = 0, maxP = 1) {
    if (sequence.length < 2) return { distance: Infinity, progress: 0 };

    const { cum, total } = getPathData(sequence);
    if (total === 0) return { distance: Infinity, progress: 0 };

    const lo = minP <= 0 ? 1 : findSegment(cum, minP * total);
    const hi = maxP >= 1 ? sequence.length - 1 : findSegment(cum, maxP * total);

    let bestDistance = Infinity;
    let bestProgress = 0;

    for (let i = lo; i <= hi; i++) {
        const a = sequence[i - 1];
        const b = sequence[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;

        let t = lenSq === 0 ? 0 : ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        const distance = Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));

        if (distance < bestDistance) {
            bestDistance = distance;
            bestProgress = (cum[i - 1] + Math.sqrt(lenSq) * t) / total;
        }
    }

    return { distance: bestDistance, progress: bestProgress };
}

function clampPointToRadius(point, cx, cy, radius) {
    const dx = point.x - cx;
    const dy = point.y - cy;
    const distance = Math.hypot(dx, dy);
    if (distance <= radius) return point;
    const scale = radius / distance;
    return { x: cx + dx * scale, y: cy + dy * scale };
}

function isPointTooCloseToPath(point, points, minimumDistance) {
    if (points.length < 3) return false;
    for (let i = 0; i < points.length - 2; i++) {
        const d = distancePointToSegment(
            point.x, point.y,
            points[i].x, points[i].y,
            points[i + 1].x, points[i + 1].y
        );
        if (d < minimumDistance) return true;
    }
    return false;
}

function normalizePathAroundCenter(points, cx, cy, maxRadius) {
    if (points.length === 0) return points;

    const offsetX = cx - points[0].x;
    const offsetY = cy - points[0].y;

    let shifted = points.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));

    let maxDist = 0;
    shifted.forEach(p => {
        maxDist = Math.max(maxDist, Math.hypot(p.x - cx, p.y - cy));
    });

    if (maxDist > maxRadius) {
        const scale = maxRadius / maxDist;
        shifted = shifted.map(p => ({
            x: cx + (p.x - cx) * scale,
            y: cy + (p.y - cy) * scale
        }));
    }

    return shifted;
}

function smoothWaypoints(waypoints) {
    if (waypoints.length < 2) return waypoints;

    const points = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
        const a = waypoints[i];
        const b = waypoints[i + 1];
        for (let j = 0; j < CONFIG.BASE_CURVE_POINTS; j++) {
            const t = j / CONFIG.BASE_CURVE_POINTS;
            const eased = t * t * (3 - 2 * t);
            points.push({
                x: a.x + (b.x - a.x) * eased,
                y: a.y + (b.y - a.y) * eased
            });
        }
    }
    points.push(waypoints[waypoints.length - 1]);
    return points;
}

// ============================================================
// DIFFICULTY
// ============================================================

function getDifficulty(level) {
    return {
        turnAmount: Math.min(Math.PI * 0.9, CONFIG.MAX_TURN + level * 0.045)
    };
}

function getTraceTolerance(level = currentLevel) {
    const screenSize = Math.min(W, H);

    let tolerance = Math.min(
        CONFIG.MAX_TRACE_TOLERANCE,
        Math.max(CONFIG.MIN_TRACE_TOLERANCE, screenSize * CONFIG.TOLERANCE_SCREEN_RATIO)
    );

    // Higher levels become slightly more precise.
    tolerance *= Math.max(0.70, 1 - (level - 1) * 0.025);
    return tolerance;
}

// Timer scales with how long the path actually is on this screen.
function getLevelTimer(level) {
    const path = levels[level - 1];
    const length = path ? getPathLength(path) : 0;
    const requiredSpeed = 260 + level * 20; // px per second
    return Math.round(
        Math.max(CONFIG.MIN_TIMER, CONFIG.TIMER_BASE + (length / requiredSpeed) * 1000)
    );
}

function getMinimumProgressRequired() {
    return Math.min(0.96, CONFIG.MIN_PATH_PROGRESS + (currentLevel - 1) * 0.005);
}

// ============================================================
// PATH GENERATION
// ============================================================

function getPatternForLevel(level) {
    const patterns = [
        "freeform", "wave", "zigzag", "sCurve", "spiral",
        "loop", "wave", "zigzag", "spiral", "challenge"
    ];
    return patterns[Math.min(level - 1, patterns.length - 1)];
}

function generateLevelPath(level) {
    switch (getPatternForLevel(level)) {
        case "wave": return generateWavePath(level);
        case "zigzag": return generateZigZagPath(level);
        case "sCurve": return generateSCurvePath(level);
        case "spiral": return generateSpiralPath(level);
        case "loop": return generateLoopPath(level);
        case "challenge": return generateChallengePath(level);
        default: return generateFreeformPath(level);
    }
}

function generateAllLevels() {
    levels = [];
    for (let level = 1; level <= CONFIG.MAX_LEVEL; level++) {
        levels.push(generateLevelPath(level));
    }
}

function generateFreeformPath(level) {
    const { cx, cy, R } = layout;
    const difficulty = getDifficulty(level);

    const waypoints = [{ x: cx, y: cy }];
    let angle = Math.random() * Math.PI * 2;
    let currentRadius = R * 0.18;

    for (let i = 1; i <= level + 2; i++) {
        angle += (Math.random() * 2 - 1) * difficulty.turnAmount;

        currentRadius = Math.min(
            R * 0.88,
            currentRadius + R * (0.07 + Math.random() * 0.07)
        );

        const candidate = {
            x: cx + Math.cos(angle) * currentRadius,
            y: cy + Math.sin(angle) * currentRadius
        };

        if (isPointTooCloseToPath(candidate, waypoints, CONFIG.MIN_SELF_DISTANCE)) {
            angle += Math.PI / 2;
            candidate.x = cx + Math.cos(angle) * currentRadius;
            candidate.y = cy + Math.sin(angle) * currentRadius;
        }

        waypoints.push(clampPointToRadius(candidate, cx, cy, R * 0.9));
    }

    return smoothWaypoints(waypoints);
}

function generateWavePath(level) {
    const { cx, cy, R } = layout;
    const points = [];

    const horizontal = Math.min(R * 1.65, W * 0.70);
    const rows = Math.max(3, level);
    const amplitude = Math.min(R * 0.42, 65 + level * 4);
    const startX = cx - horizontal / 2;
    const count = rows * CONFIG.BASE_CURVE_POINTS;

    for (let i = 0; i <= count; i++) {
        const t = i / count;
        points.push({
            x: startX + horizontal * t,
            y: cy + Math.sin(t * Math.PI * rows * 0.72) * amplitude
        });
    }

    return normalizePathAroundCenter(points, cx, cy, R * 0.92);
}

function generateZigZagPath(level) {
    const { cx, cy, R } = layout;
    const points = [];

    const count = level + 3;
    const width = R * 1.65;
    const height = R * 1.45;

    for (let i = 0; i <= count; i++) {
        const t = i / count;
        const direction = i % 2 === 0 ? -1 : 1;
        points.push({
            x: cx - width / 2 + width * t,
            y: cy + direction * height * 0.5
        });
    }

    return normalizePathAroundCenter(points, cx, cy, R * 0.88);
}

function generateSCurvePath(level) {
    const { cx, cy, R } = layout;
    const points = [];

    const length = R * 1.65;
    const amplitude = R * (0.38 + Math.min(0.12, level * 0.008));
    const total = 100 + level * 10;

    for (let i = 0; i <= total; i++) {
        const t = i / total;
        points.push({
            x: cx - length / 2 + length * t,
            y: cy + Math.sin(t * Math.PI * 1.45) * amplitude
        });
    }

    return normalizePathAroundCenter(points, cx, cy, R * 0.92);
}

function generateSpiralPath(level) {
    const { cx, cy, R } = layout;
    const points = [];

    const turns = 1.05 + level * 0.12;
    const total = 160 + level * 20;

    for (let i = 0; i <= total; i++) {
        const t = i / total;
        const angle = t * Math.PI * 2 * turns;
        const r = R * 0.12 + R * 0.70 * t;
        points.push({
            x: cx + Math.cos(angle) * r,
            y: cy + Math.sin(angle) * r
        });
    }

    return points;
}

function generateLoopPath(level) {
    const { cx, cy, R } = layout;
    const points = [];

    const total = 190 + level * 20;
    const loopRadius = R * 0.55;

    for (let i = 0; i <= total; i++) {
        const t = i / total;
        const angle = -Math.PI / 2 + t * Math.PI * 2.15;
        const r = loopRadius * (0.55 + 0.35 * Math.sin(t * Math.PI));
        points.push({
            x: cx + Math.cos(angle) * r,
            y: cy + Math.sin(angle) * r
        });
    }

    // Connect the center to the start of the loop.
    const start = points[0];
    const connector = [];
    const connectorCount = 25;

    for (let i = 0; i < connectorCount; i++) {
        const t = i / (connectorCount - 1);
        connector.push({
            x: cx + (start.x - cx) * t,
            y: cy + (start.y - cy) * t
        });
    }

    return [...connector, ...points];
}

function generateChallengePath(level) {
    const { cx, cy, R } = layout;
    const points = [];

    const sections = 6;
    const pointsPerSection = 45;

    for (let section = 0; section < sections; section++) {
        const sectionStart = section / sections;
        const sectionEnd = (section + 1) / sections;
        const direction = section % 2 === 0 ? 1 : -1;

        for (let i = 0; i < pointsPerSection; i++) {
            const t = sectionStart + (sectionEnd - sectionStart) * (i / pointsPerSection);
            const angle = t * Math.PI * 4.5;
            const radial = R * (0.18 + 0.70 * t);
            const wave = Math.sin(t * Math.PI * 12) * R * 0.13 * direction;

            points.push({
                x: cx + Math.cos(angle) * radial + wave,
                y: cy + Math.sin(angle) * radial - wave
            });
        }
    }

    return normalizePathAroundCenter(points, cx, cy, R * 0.90);
}

// ============================================================
// COLORS
// ============================================================

function getStreakColor(streakValue) {
    if (streakValue >= 10) return "rgba(255, 0, 255, 0.9)";
    if (streakValue >= 6) return "rgba(255, 215, 0, 0.9)";
    if (streakValue >= 3) return "rgba(0, 255, 0, 0.9)";
    return "rgba(0, 255, 204, 0.9)";
}

function dimColor(rgba, factor = 0.4, alphaFactor = 1) {
    const match = rgba.match(
        /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/
    );
    if (!match) return rgba;

    const r = Math.floor(Number(match[1]) * factor);
    const g = Math.floor(Number(match[2]) * factor);
    const b = Math.floor(Number(match[3]) * factor);
    const a = (match[4] !== undefined ? Number(match[4]) : 1) * factor * 0.7 * alphaFactor;

    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// ============================================================
// DRAWING HELPERS
// ============================================================

function roundedRect(x, y, w, h, r) {
    if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, r);
        return;
    }
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function drawText(str, x, y, size, color, align = "left", glow = 0, glowColor = color) {
    ctx.save();
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glow;
    ctx.fillText(str, x, y);
    ctx.restore();
}

function drawPartialPath(
    points,
    progress,
    color = "rgba(0, 255, 204, 1)",
    lineWidth = 8,
    shadowBlur = 15
) {
    if (!points || points.length < 2) return;

    const { cum, total } = getPathData(points);
    if (total === 0) return;

    progress = Math.max(0, Math.min(1, progress));
    const target = total * progress;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = shadowBlur;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
        if (cum[i] <= target) {
            ctx.lineTo(points[i].x, points[i].y);
        } else {
            const p = getPointAlongPath(progress, points);
            ctx.lineTo(p.x, p.y);
            break;
        }
    }

    ctx.stroke();
    ctx.restore();
}

function drawGlowDot(point, radius, innerStop, innerColor, outerColor, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;

    const gradient = ctx.createRadialGradient(
        point.x, point.y, innerStop, point.x, point.y, radius
    );
    gradient.addColorStop(0, innerColor);
    gradient.addColorStop(1, outerColor);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// ============================================================
// BACKGROUND
// ============================================================

function drawBackground(now) {
    const size = Math.min(W, H);

    const gradient = ctx.createRadialGradient(
        W / 2, H / 2, size / 10, W / 2, H / 2, size / 2
    );
    gradient.addColorStop(0, "#001f26");
    gradient.addColorStop(0.45, "#00141c");
    gradient.addColorStop(1, "#000811");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    // Animated grid: one path, one stroke.
    const gridSize = 60;
    const offset = (now * 0.015) % gridSize;

    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = "#00ffff";
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = -gridSize + offset; x < W + gridSize; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
    }
    for (let y = -gridSize + offset; y < H + gridSize; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
    }

    ctx.stroke();
    ctx.restore();
}

function drawAmbientParticles(now) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#00ffff";

    for (let i = 0; i < 28; i++) {
        const x = (i * 137.31 + now * 0.01) % W;
        const y = (i * 73.17 + now * 0.006) % H;
        ctx.beginPath();
        ctx.arc(x, y, 1 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

// ============================================================
// CPU DEMONSTRATION
// ============================================================

function clearTraceState() {
    userTrace = [];
    traceResults = [];
    traceProgress = 0;
    timerRunning = false;
    pointerId = null;
}

function startCpuDemo() {
    gameState = GAME_STATE.DEMO;
    cpuAnimationStart = performance.now();
    cpuAnimationProgress = 0;
    glowAnimating = false;
    glowProgress = 0;
    helpTraceStart = 0;
    helpTraceAlpha = 1;
    nextLevelTime = 0;

    clearTraceState();
    gameSessionId++;
    playDemoSound();
}

function updateCpuAnimation(now) {
    const duration = Math.max(1800, CONFIG.CPU_ANIMATION_DURATION - currentLevel * 120);
    cpuAnimationProgress = Math.min((now - cpuAnimationStart) / duration, 1);

    if (cpuAnimationProgress >= 1) {
        gameState = GAME_STATE.READY;
        glowAnimating = true;
        glowProgress = 0;
        playReadySound();
    }
}

function drawCpuSequence() {
    const pulse = 15 + 10 * Math.sin(performance.now() * 0.005);
    const color = getStreakColor(streak);

    drawPartialPath(sequence, cpuAnimationProgress, color, 12, pulse);
    drawGlowDot(
        getPointAlongPath(cpuAnimationProgress), 14, 2,
        "rgba(255,255,255,1)", "rgba(0,255,255,0)"
    );
}

// ============================================================
// READY STATE
// ============================================================

function drawReadySequence() {
    drawPartialPath(sequence, 1, "rgba(0, 255, 204, 0.25)", 8, 12);

    if (glowAnimating && sequence.length > 1) {
        drawGlowDot(
            getPointAlongPath(glowProgress), 25, 6,
            "rgba(0, 255, 255, 0.95)", "rgba(0, 255, 255, 0)"
        );
    }

    drawPartialPath(sequence, 1, "rgba(0, 255, 204, 1)", 12, 20);
    drawStartMarker();
    drawEndMarker();
}

function drawStartMarker() {
    if (sequence.length === 0) return;
    const p = sequence[0];
    const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.15;

    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#00ffcc";
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function drawEndMarker() {
    if (sequence.length === 0) return;
    const p = sequence[sequence.length - 1];

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#00ffff";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function updateGlow(deltaTime) {
    if (!glowAnimating) return;
    glowProgress += CONFIG.GLOW_SPEED * deltaTime;
    if (glowProgress >= 1) glowProgress = 0;
}

// ============================================================
// TRACING VISUALS
// ============================================================

function drawUserTrace() {
    if (userTrace.length < 2) return;

    const color = getStreakColor(streak);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;

    ctx.beginPath();
    ctx.moveTo(userTrace[0].x, userTrace[0].y);
    for (let i = 1; i < userTrace.length; i++) {
        ctx.lineTo(userTrace[i].x, userTrace[i].y);
    }
    ctx.stroke();
    ctx.restore();
}

function startHelpTrace() {
    helpTraceStart = performance.now();
    helpTraceAlpha = 1;
}

function updateHelpTrace(now) {
    if (helpTraceStart === 0) return;
    helpTraceAlpha = Math.max(
        0,
        Math.min(1, 1 - (now - helpTraceStart) / CONFIG.HELP_TRACE_FADE_DURATION)
    );
}

// Drawn in a small number of batched strokes instead of one per segment.
function drawFadingHelpTrace() {
    if (sequence.length < 2 || helpTraceAlpha <= 0) return;

    const { cum, total } = getPathData(sequence);
    if (total === 0) return;

    const BUCKETS = 16;
    const userProgress = traceProgress;
    let idx = 1;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 8;

    for (let b = 0; b < BUCKETS; b++) {
        const p0 = b / BUCKETS;
        const p1 = (b + 1) / BUCKETS;
        const center = (p0 + p1) / 2;

        let alpha;
        if (center > userProgress) {
            alpha = 0.08 * helpTraceAlpha;
        } else {
            alpha =
                (0.05 + 0.65 * Math.min(1, center / Math.max(userProgress, 0.0001))) *
                helpTraceAlpha;
        }
        alpha = Math.max(0.01, Math.min(0.8, alpha));

        const color = `rgba(0, 255, 204, ${alpha})`;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10 * helpTraceAlpha;

        const start = getPointAlongPath(p0);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);

        while (idx < sequence.length && cum[idx] / total <= p1) {
            if (cum[idx] / total > p0) ctx.lineTo(sequence[idx].x, sequence[idx].y);
            idx++;
        }

        const end = getPointAlongPath(p1);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
    }

    ctx.restore();
}

// ============================================================
// TRACE VALIDATION
// ============================================================

// Scores one trace point against the path, using a progress window.
function evaluateTracePoint(point, track) {
    const r = getClosestPathProgress(
        point,
        track - CONFIG.TRACK_WINDOW_BACK,
        track + CONFIG.TRACK_WINDOW_FORWARD
    );
    return {
        valid: r.distance <= getTraceTolerance(),
        distance: r.distance,
        progress: r.progress
    };
}

function validateUserTrace(elapsed) {
    const fail = { success: false, coverage: 0, progress: 0, accuracy: 0, speedBonus: 0 };

    if (userTrace.length < 2 || sequence.length < 2) return fail;

    const tolerance = getTraceTolerance();

    // Start
    const startDist = Math.hypot(
        userTrace[0].x - sequence[0].x,
        userTrace[0].y - sequence[0].y
    );
    if (startDist > tolerance) return { ...fail, reason: "start" };

    // Coverage / accuracy (results were computed live while tracing)
    let validPoints = 0;
    let distanceError = 0;

    for (const r of traceResults) {
        if (r.valid) {
            validPoints++;
            distanceError += Math.min(1, r.distance / tolerance);
        }
    }

    const coverage = validPoints / userTrace.length;
    const accuracy = validPoints > 0 ? 1 - distanceError / validPoints : 0;

    // End
    const last = userTrace[userTrace.length - 1];
    const endPoint = sequence[sequence.length - 1];
    const endDistance = Math.hypot(last.x - endPoint.x, last.y - endPoint.y);

    // Checkpoints (must be reached in order)
    const cpTolerance = tolerance * CONFIG.CHECKPOINT_TOLERANCE_RATIO;
    const checkpoints = [];
    for (let p = 0; p < 1; p += CONFIG.CHECKPOINT_SPACING) checkpoints.push(p);
    checkpoints.push(1);

    let checkpointsValid = true;
    let idx = 0;

    for (const cp of checkpoints) {
        let found = false;
        while (idx < traceResults.length) {
            const r = traceResults[idx];
            if (r.valid && r.distance <= cpTolerance && r.progress >= cp - 0.025) {
                found = true;
                break;
            }
            idx++;
        }
        if (!found) {
            checkpointsValid = false;
            break;
        }
    }

    // Speed bonus
    const speedRatio = Math.max(0, Math.min(1, 1 - elapsed / timerDuration));
    const speedBonus = Math.round(speedRatio * CONFIG.SPEED_BONUS_MAX);

    const success =
        coverage >= CONFIG.MIN_PATH_COVERAGE &&
        traceProgress >= getMinimumProgressRequired() &&
        endDistance <= tolerance &&
        checkpointsValid;

    return { success, coverage, progress: traceProgress, accuracy, speedBonus, endDistance };
}

// ============================================================
// INPUT
// ============================================================

function getPointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * (W / rect.width),
        y: (event.clientY - rect.top) * (H / rect.height)
    };
}

function hitButton(point) {
    for (const b of buttons) {
        if (point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h) {
            return b;
        }
    }
    return null;
}

function handleButton(id) {
    switch (id) {
        case "pause": togglePause(); break;
        case "resume": resumeGame(); break;
        case "restart":
        case "again": restartGame(); break;
        case "sound":
            settings.sound = !settings.sound;
            saveSettings();
            if (settings.sound) playPauseSound();
            break;
        case "flash":
            settings.reduceFlash = !settings.reduceFlash;
            saveSettings();
            break;
    }
}

function releaseCapture(id) {
    try {
        if (id !== null && id !== undefined) canvas.releasePointerCapture(id);
    } catch (e) {
        // Safe fallback.
    }
}

function addTracePoint(point) {
    const last = userTrace[userTrace.length - 1];

    if (last && Math.hypot(point.x - last.x, point.y - last.y) < CONFIG.MIN_TRACE_POINT_DISTANCE) {
        return;
    }

    const result = evaluateTracePoint(point, traceProgress);

    if (userTrace.length >= CONFIG.MAX_TRACE_POINTS) {
        // Keep the newest point so the end of the trace is always accurate.
        userTrace[userTrace.length - 1] = point;
        traceResults[traceResults.length - 1] = result;
    } else {
        userTrace.push(point);
        traceResults.push(result);
    }

    if (result.valid) {
        traceProgress = Math.max(traceProgress, result.progress);

        const now = performance.now();
        if (now - lastTraceParticleTime > CONFIG.TRACE_PARTICLE_INTERVAL * 1000) {
            createTraceParticle(point.x, point.y);
            lastTraceParticleTime = now;
        }
    }
}

canvas.addEventListener("pointerdown", event => {
    initializeAudio();
    resumeAudio();

    const point = getPointerPosition(event);

    // On-screen buttons (a second finger may use them while tracing).
    if (gameState !== GAME_STATE.TRACING || event.pointerId !== pointerId) {
        const button = hitButton(point);
        if (button) {
            handleButton(button.id);
            event.preventDefault();
            return;
        }
    }

    if (gameState !== GAME_STATE.READY) return;

    const startPoint = sequence[0];
    if (!startPoint) return;

    const distance = Math.hypot(point.x - startPoint.x, point.y - startPoint.y);

    if (distance > getTraceTolerance(currentLevel)) {
        triggerShake(CONFIG.INVALID_START_SHAKE_STRENGTH, CONFIG.INVALID_START_SHAKE_DURATION);
        playInvalidStartSound();
        createBurstParticles(point.x, point.y, "#ff3333", 12);
        return;
    }

    pointerId = event.pointerId;
    try {
        canvas.setPointerCapture(pointerId);
    } catch (e) {
        // Safe fallback.
    }

    gameState = GAME_STATE.TRACING;
    glowAnimating = false;

    userTrace = [point];
    traceResults = [{ valid: true, distance, progress: 0 }];
    traceProgress = 0;

    startHelpTrace();

    timerDuration = getLevelTimer(currentLevel);
    timerStart = performance.now();
    timerRunning = true;
    lastTraceParticleTime = performance.now();

    playTraceStartSound();
    haptic("light");
    event.preventDefault();
});

canvas.addEventListener("pointermove", event => {
    if (gameState !== GAME_STATE.TRACING || event.pointerId !== pointerId) return;

    // Coalesced events give a smoother, more accurate trace on fast swipes.
    const events =
        typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];

    if (events.length > 0) {
        for (const e of events) addTracePoint(getPointerPosition(e));
    } else {
        addTracePoint(getPointerPosition(event));
    }

    event.preventDefault();
});

canvas.addEventListener("pointerup", event => {
    if (gameState !== GAME_STATE.TRACING || event.pointerId !== pointerId) return;

    addTracePoint(getPointerPosition(event));
    releaseCapture(event.pointerId);
    finishTrace(true);
    event.preventDefault();
});

canvas.addEventListener("pointercancel", event => {
    if (gameState !== GAME_STATE.TRACING || event.pointerId !== pointerId) return;

    releaseCapture(event.pointerId);
    finishTrace(false);
});

window.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();

    if (key === "p" || key === "escape") {
        event.preventDefault();
        togglePause();
    } else if (key === "r") {
        event.preventDefault();
        restartGame();
    }
});

// Auto-pause when the app is backgrounded; recover audio on return.
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        if (
            gameState === GAME_STATE.DEMO ||
            gameState === GAME_STATE.READY ||
            gameState === GAME_STATE.TRACING
        ) {
            pauseGame();
        }
    } else {
        resumeAudio();
    }
});

// ============================================================
// TRACE COMPLETION
// ============================================================

function finishTrace(checkTrace = true) {
    // Measure elapsed time BEFORE stopping the timer (needed for speed bonus).
    const elapsed = timerRunning ? performance.now() - timerStart : timerDuration;
    timerRunning = false;
    pointerId = null;

    const result = checkTrace
        ? validateUserTrace(elapsed)
        : { success: false, coverage: 0, progress: 0, accuracy: 0, speedBonus: 0 };

    if (result.success) handleSuccessfulTrace(result);
    else handleFailedTrace();
}

function handleSuccessfulTrace(result) {
    gameState = GAME_STATE.SUCCESS;
    streak++;

    const multiplier = 1 + (streak - 1) * CONFIG.STREAK_MULTIPLIER_STEP;

    const levelScore = Math.round(
        (CONFIG.BASE_LEVEL_SCORE * currentLevel +
            result.speedBonus +
            (result.accuracy >= 0.90 ? CONFIG.PERFECT_BONUS : 0)) *
        multiplier
    );

    score += levelScore;
    saveBestStats();

    completedStreakLines.push({
        points: [...sequence],
        color: getStreakColor(streak),
        fadeStart: null,
        fadeProgress: 0
    });

    successAnimationStart = performance.now();
    successAnimationProgress = 0;

    if (!settings.reduceFlash) successFlash = 1;

    triggerShake(
        CONFIG.SUCCESS_SHAKE_STRENGTH + Math.min(6, streak),
        CONFIG.SUCCESS_SHAKE_DURATION
    );

    createSuccessParticles();
    playSuccessSound(streak);
    haptic("success");

    const session = gameSessionId;

    setTimeout(() => {
        if (session !== gameSessionId) return;
        const last = completedStreakLines[completedStreakLines.length - 1];
        if (last) last.fadeStart = performance.now();
    }, CONFIG.SUCCESS_FADE_DURATION);

    nextLevelTime = performance.now() + CONFIG.NEXT_LEVEL_DELAY;
}

function handleFailedTrace() {
    gameState = GAME_STATE.FAILED;
    timerRunning = false;

    releaseCapture(pointerId);
    pointerId = null;

    resetStreak();

    if (!settings.reduceFlash) failureFlash = 1;

    triggerShake(CONFIG.FAILURE_SHAKE_STRENGTH, CONFIG.FAILURE_SHAKE_DURATION);
    createFailureParticles();
    playFailureSound();
    haptic("error");

    const session = gameSessionId;

    setTimeout(() => {
        if (session !== gameSessionId) return;
        if (gameState === GAME_STATE.FAILED) startCpuDemo();
    }, CONFIG.FAILURE_RECOVERY_DELAY);
}

function updateSuccessAnimation(now) {
    successAnimationProgress = Math.min(
        (now - successAnimationStart) / CONFIG.SHIMMER_DURATION,
        1
    );
}

function drawSuccessState() {
    const color = getStreakColor(streak);

    drawPartialPath(sequence, 1, "rgba(0, 255, 204, 0.25)", 8, 10);
    drawPartialPath(sequence, 1, color, 10, 20);

    drawGlowDot(
        getPointAlongPath(successAnimationProgress), 30, 7,
        "rgba(255,255,255,1)", "rgba(255,255,255,0)"
    );

    if (successAnimationProgress >= 1) {
        const s = uiScale;
        drawText(
            currentLevel >= CONFIG.MAX_LEVEL ? "YOU WIN!" : "NEXT LEVEL...",
            W / 2, H / 2, 40 * s, "#00ffcc", "center", 15
        );
        drawText(`Score: ${score}`, W / 2, H / 2 + 40 * s, 20 * s, "rgba(255,255,255,0.75)", "center");
    }
}

// ============================================================
// TIMER
// ============================================================

function updateTimer(now) {
    if (!timerRunning) return;

    if (now - timerStart >= timerDuration) {
        timerRunning = false;
        handleFailedTrace();
    }
}

function getTimerProgress() {
    if (!timerRunning) return 0;
    return Math.max(0, Math.min(1, 1 - (performance.now() - timerStart) / timerDuration));
}

function drawTimerHUD() {
    if (gameState !== GAME_STATE.TRACING || !timerRunning) return;

    const remaining = getTimerProgress();
    const barWidth = Math.min(360, W * 0.5);
    const barHeight = 10;
    const x = W / 2 - barWidth / 2;
    const y = H - insets.bottom - 48;

    let color = "#00ffcc";
    if (remaining <= 0.33) color = "#ff3333";
    else if (remaining <= 0.66) color = "#ffd700";

    ctx.save();

    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    roundedRect(x, y, barWidth, barHeight, 5);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    roundedRect(x, y, Math.max(0, barWidth * remaining), barHeight, 5);
    ctx.fill();

    ctx.restore();

    drawText(
        `${((remaining * timerDuration) / 1000).toFixed(1)}s`,
        W / 2, y - 10, 16, "#ffffff", "center"
    );
}

function drawTraceProgress() {
    const width = Math.min(360, W * 0.5);
    const x = W / 2 - width / 2;
    const y = H - insets.bottom - 48 + 20;

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(x, y, width, 5);

    ctx.fillStyle = "#00ffcc";
    ctx.shadowColor = "#00ffcc";
    ctx.shadowBlur = 8;
    ctx.fillRect(x, y, width * Math.max(0, Math.min(1, traceProgress)), 5);
    ctx.restore();
}

// ============================================================
// STREAK LINES
// ============================================================

function updateStreakFades(now) {
    if (completedStreakLines.length === 0) return;

    completedStreakLines = completedStreakLines.filter(line => {
        if (line.fadeStart === null) return true;
        line.fadeProgress = Math.min(
            (now - line.fadeStart) / CONFIG.STREAK_LINE_FADE_DURATION,
            1
        );
        return line.fadeProgress < 1;
    });
}

function drawStreakLines() {
    completedStreakLines.forEach(line => {
        const fade = line.fadeStart === null ? 0 : line.fadeProgress;
        const shrink = 1 - fade * 0.7;
        const color = dimColor(line.color, 0.4, 1 - fade);

        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(shrink, shrink);
        ctx.translate(-W / 2, -H / 2);
        drawPartialPath(line.points, 1, color, 4, 8);
        ctx.restore();
    });
}

function resetStreak() {
    streak = 0;
    completedStreakLines = [];
}

// ============================================================
// PARTICLES
// ============================================================

function createParticle(x, y, color, options = {}) {
    if (particles.length >= CONFIG.MAX_PARTICLES) particles.shift();

    const life = options.life ?? 0.6;

    particles.push({
        x,
        y,
        vx: options.vx ?? (Math.random() - 0.5) * 120,
        vy: options.vy ?? (Math.random() - 0.5) * 120,
        life,
        maxLife: life,
        size: options.size ?? 2 + Math.random() * 4,
        color,
        gravity: options.gravity ?? 0,
        drag: options.drag ?? 0.96
    });
}

function createTraceParticle(x, y) {
    createParticle(x, y, getStreakColor(streak), {
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20,
        life: 0.25,
        size: 2 + Math.random() * 2
    });
}

function createBurstParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 40 + Math.random() * 180;

        createParticle(x, y, color, {
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0.4 + Math.random() * 0.5,
            size: 2 + Math.random() * 5,
            drag: 0.94
        });
    }
}

function createSuccessParticles() {
    if (sequence.length === 0) return;
    const end = sequence[sequence.length - 1];
    createBurstParticles(end.x, end.y, getStreakColor(streak), CONFIG.SUCCESS_PARTICLE_COUNT);
}

function createFailureParticles() {
    const p = userTrace.length > 0 ? userTrace[userTrace.length - 1] : { x: W / 2, y: H / 2 };
    createBurstParticles(p.x, p.y, "#ff3333", CONFIG.FAILURE_PARTICLE_COUNT);
}

function createCompletionParticles() {
    createBurstParticles(W / 2, H / 2, "#ff00ff", 120);
}

function updateParticles(deltaTime) {
    if (particles.length === 0) return;

    particles = particles.filter(p => {
        p.life -= deltaTime;
        if (p.life <= 0) return false;

        const drag = Math.pow(p.drag, deltaTime * 60);
        p.vx *= drag;
        p.vy *= drag;
        p.vy += p.gravity * deltaTime;
        p.x += p.vx * deltaTime;
        p.y += p.vy * deltaTime;
        return true;
    });
}

// No shadowBlur per particle (very expensive on mobile); additive blending
// gives the glow instead.
function drawParticles() {
    if (particles.length === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.restore();
}

// ============================================================
// SHAKE / FLASH
// ============================================================

function triggerShake(strength = 12, duration = 300) {
    if (settings.reduceFlash) return;
    shakeStrength = strength;
    shakeDuration = duration;
    shakeTime = duration;
}

function updateShake(deltaTime) {
    if (shakeTime <= 0) {
        shakeTime = 0;
        return;
    }
    shakeTime = Math.max(0, shakeTime - deltaTime * 1000);
}

function getShakeOffset() {
    if (shakeTime <= 0) return { x: 0, y: 0 };

    const intensity = shakeDuration > 0 ? shakeTime / shakeDuration : 1;
    return {
        x: (Math.random() - 0.5) * shakeStrength * intensity,
        y: (Math.random() - 0.5) * shakeStrength * intensity
    };
}

function updateFlashes(deltaTime) {
    if (failureFlash > 0) failureFlash = Math.max(0, failureFlash - deltaTime * 3.5);
    if (successFlash > 0) successFlash = Math.max(0, successFlash - deltaTime * 3);
}

function drawFlashes() {
    if (failureFlash > 0) {
        ctx.fillStyle = `rgba(255, 0, 0, ${failureFlash * 0.5})`;
        ctx.fillRect(0, 0, W, H);
    }
    if (successFlash > 0) {
        ctx.fillStyle = `rgba(0, 255, 204, ${successFlash * 0.15})`;
        ctx.fillRect(0, 0, W, H);
    }
}

// ============================================================
// BUTTONS & UI
// ============================================================

function layoutButtons() {
    buttons = [];

    const s = uiScale;
    const margin = CONFIG.UI_MARGIN * s;
    const size = CONFIG.BUTTON_MIN_SIZE;

    if (
        gameState === GAME_STATE.DEMO ||
        gameState === GAME_STATE.READY ||
        gameState === GAME_STATE.TRACING
    ) {
        buttons.push({
            id: "pause",
            x: W - insets.right - margin - size,
            y: insets.top + margin,
            w: size,
            h: size
        });
    }

    if (gameState === GAME_STATE.PAUSED) {
        const bw = Math.min(300, W * 0.7);
        const bh = 46;
        const gap = 12;

        const items = [
            { id: "resume", label: "Resume" },
            { id: "restart", label: "Restart" },
            { id: "sound", label: `Sound: ${settings.sound ? "On" : "Off"}` },
            { id: "flash", label: `Reduce Flashing: ${settings.reduceFlash ? "On" : "Off"}` }
        ];

        const total = 80 + items.length * bh + (items.length - 1) * gap;
        menuTop = Math.max(insets.top + 8, (H - total) / 2);

        items.forEach((item, i) => {
            buttons.push({
                ...item,
                x: (W - bw) / 2,
                y: menuTop + 80 + i * (bh + gap),
                w: bw,
                h: bh
            });
        });
    }

    if (gameState === GAME_STATE.COMPLETE) {
        const bw = Math.min(260, W * 0.7);
        buttons.push({
            id: "again",
            label: "Play Again",
            x: (W - bw) / 2,
            y: H / 2 + 105 * s,
            w: bw,
            h: 50
        });
    }
}

function drawButtons() {
    for (const b of buttons) {
        ctx.save();

        ctx.beginPath();
        roundedRect(b.x, b.y, b.w, b.h, b.id === "pause" ? 22 : 12);
        ctx.fillStyle = "rgba(0,255,204,0.10)";
        ctx.fill();

        ctx.strokeStyle = "rgba(0,255,204,0.8)";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#00ffcc";
        ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.shadowBlur = 0;

        if (b.id === "pause") {
            ctx.fillStyle = "#00ffcc";
            ctx.fillRect(b.x + 15, b.y + 13, 5, 18);
            ctx.fillRect(b.x + 24, b.y + 13, 5, 18);
        } else {
            drawText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 6, 18, "#ffffff", "center");
        }

        ctx.restore();
    }
}

function drawUI() {
    const s = uiScale;
    const margin = CONFIG.UI_MARGIN * s;
    const left = insets.left + margin;
    const top = insets.top + margin;
    const fontSize = CONFIG.HUD_FONT * s;
    const streakColor = getStreakColor(streak);

    drawText(`LEVEL ${currentLevel}/${CONFIG.MAX_LEVEL}`, left, top + fontSize, fontSize, "#00ffcc", "left", 10);
    drawText(`🔥 Streak: ${streak}`, left, top + fontSize + 28 * s, 23 * s, streakColor, "left", 8);
    drawText(`Score: ${score}`, left, top + fontSize + 52 * s, 18 * s, "rgba(255,255,255,0.75)");
    drawText(`Best: ${bestScore}`, left, top + fontSize + 74 * s, 16 * s, "rgba(255,255,255,0.55)");

    if (gameState === GAME_STATE.READY) {
        drawText(
            "TRACE THE PATTERN",
            W / 2, H - insets.bottom - 42, 20 * Math.max(0.85, s),
            "rgba(255,255,255,0.70)", "center", 8, "#00ffcc"
        );
    }

    // Keyboard hint only on devices without touch.
    if (
        !isTouchDevice &&
        (gameState === GAME_STATE.READY || gameState === GAME_STATE.DEMO)
    ) {
        drawText(
            "P / ESC = Pause   •   R = Restart",
            W - insets.right - margin, H - insets.bottom - margin, 14,
            "rgba(255,255,255,0.40)", "right"
        );
    }

    drawButtons();
}

function drawFailureState() {
    drawPartialPath(sequence, 1, "rgba(255,60,60,0.30)", 8, 12);
    drawText("TRACE FAILED", W / 2, H / 2, 30 * Math.max(0.8, uiScale), "#ff4444", "center", 18, "#ff0000");
}

function drawPausedState() {
    drawPartialPath(sequence, 1, "rgba(0,255,204,0.18)", 8, 8);

    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, 0, W, H);

    drawText("PAUSED", W / 2, menuTop + 48, 56 * uiScale, "#00ffcc", "center", 25);
}

function drawCompleteGame() {
    const s = uiScale;
    const pulse = 0.75 + Math.sin(performance.now() * 0.004) * 0.25;

    drawText("YOU WIN!", W / 2, H / 2 - 50 * s, 64 * s, `rgba(255,0,255,${pulse})`, "center", 30, "#ff00ff");
    drawText(`Score: ${score}`, W / 2, H / 2 + 5 * s, 30 * s, "#00ffcc", "center", 12);
    drawText(`Final Streak: ${streak}`, W / 2, H / 2 + 40 * s, 24 * s, "#00ffcc", "center", 12);
    drawText(`Best Score: ${bestScore}`, W / 2, H / 2 + 72 * s, 18 * s, "rgba(255,255,255,0.65)", "center");
}

// ============================================================
// PAUSE
// ============================================================

function togglePause() {
    if (gameState === GAME_STATE.PAUSED) {
        resumeGame();
    } else if (
        gameState === GAME_STATE.TRACING ||
        gameState === GAME_STATE.READY ||
        gameState === GAME_STATE.DEMO
    ) {
        pauseGame();
    }
}

function pauseGame() {
    stateBeforePause = gameState;

    if (gameState === GAME_STATE.DEMO) {
        pausedDemoElapsed = performance.now() - cpuAnimationStart;
    }

    if (gameState === GAME_STATE.TRACING) {
        // A finger can't be "held" through a pause, so the attempt is cancelled
        // (streak is kept) and the player resumes at the start of the pattern.
        releaseCapture(pointerId);
        clearTraceState();
        helpTraceStart = 0;
        helpTraceAlpha = 1;
        glowAnimating = true;
        stateBeforePause = GAME_STATE.READY;
    }

    gameState = GAME_STATE.PAUSED;
    playPauseSound();
}

function resumeGame() {
    if (gameState !== GAME_STATE.PAUSED) return;

    gameState = stateBeforePause;

    if (gameState === GAME_STATE.DEMO) {
        cpuAnimationStart = performance.now() - pausedDemoElapsed;
    }

    playPauseSound();
}

// ============================================================
// GAME FLOW
// ============================================================

function resetRun() {
    currentLevel = 1;
    streak = 0;
    score = 0;
    completedStreakLines = [];
    particles = [];
    failureFlash = 0;
    successFlash = 0;
    shakeTime = 0;
    nextLevelTime = 0;

    generateAllLevels();
    sequence = levels[0] || [];
    startCpuDemo();
}

function restartGame() {
    resetRun();
    initializeAudio();
}

function advanceAfterSuccess() {
    nextLevelTime = 0;

    if (currentLevel >= CONFIG.MAX_LEVEL) {
        gameState = GAME_STATE.COMPLETE;
        timerRunning = false;
        playCompleteSound();
        haptic("success");
        createCompletionParticles();
        saveBestStats();
    } else {
        currentLevel++;
        sequence = levels[currentLevel - 1] || [];
        startCpuDemo();
    }
}

// ============================================================
// GAME LOOP
// ============================================================

function update(deltaTime, now) {
    updateShake(deltaTime);
    updateFlashes(deltaTime);
    updateStreakFades(now);
    updateParticles(deltaTime);

    switch (gameState) {
        case GAME_STATE.DEMO:
            updateCpuAnimation(now);
            break;
        case GAME_STATE.READY:
            updateGlow(deltaTime);
            break;
        case GAME_STATE.TRACING:
            updateTimer(now);
            updateHelpTrace(now);
            break;
        case GAME_STATE.SUCCESS:
            updateSuccessAnimation(now);
            if (nextLevelTime > 0 && now >= nextLevelTime) advanceAfterSuccess();
            break;
    }
}

function render(now) {
    ctx.clearRect(0, 0, W, H);
    layoutButtons();

    const shake = getShakeOffset();

    ctx.save();
    ctx.translate(shake.x, shake.y);

    drawBackground(now);
    drawAmbientParticles(now);
    drawStreakLines();

    switch (gameState) {
        case GAME_STATE.DEMO:
            drawCpuSequence();
            break;
        case GAME_STATE.READY:
            drawReadySequence();
            break;
        case GAME_STATE.TRACING:
            drawFadingHelpTrace();
            drawUserTrace();
            drawTimerHUD();
            drawTraceProgress();
            break;
        case GAME_STATE.SUCCESS:
            drawSuccessState();
            break;
        case GAME_STATE.FAILED:
            drawFailureState();
            break;
        case GAME_STATE.COMPLETE:
            drawCompleteGame();
            break;
        case GAME_STATE.PAUSED:
            drawPausedState();
            break;
    }

    drawParticles();
    drawUI();
    drawFlashes();

    ctx.restore();
}

function gameLoop(now) {
    const deltaTime = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;

    update(deltaTime, now);
    render(now);

    requestAnimationFrame(gameLoop);
}

// ============================================================
// HAPTICS (Capacitor Haptics plugin if present, else Vibration API)
// ============================================================

function haptic(kind) {
    try {
        const plugin =
            window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;

        if (plugin) {
            if (kind === "success") plugin.notification({ type: "SUCCESS" });
            else if (kind === "error") plugin.notification({ type: "ERROR" });
            else plugin.impact({ style: "LIGHT" });
            return;
        }

        if (navigator.vibrate) {
            navigator.vibrate(kind === "error" ? [30, 40, 30] : kind === "success" ? 20 : 10);
        }
    } catch (e) {
        // Haptics are optional.
    }
}

// ============================================================
// AUDIO
// ============================================================

function initializeAudio() {
    if (audioReady) return;

    try {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return;

        audioContext = new Ctor();
        audioReady = true;
        resumeAudio();
    } catch (e) {
        audioReady = false;
    }
}

// iOS can suspend/interrupt the context (calls, backgrounding). Always try to recover.
function resumeAudio() {
    if (audioContext && audioContext.state !== "running") {
        try {
            const p = audioContext.resume();
            if (p && p.catch) p.catch(() => {});
        } catch (e) {
            // Ignore.
        }
    }
}

function playTone(frequency, duration, type = "sine", volume = 0.04, delay = 0) {
    if (!settings.sound || !audioReady || !audioContext) return;

    try {
        if (audioContext.state !== "running") resumeAudio();

        const start = audioContext.currentTime + delay;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start(start);
        oscillator.stop(start + duration + 0.03);
    } catch (e) {
        // Audio failure should never break gameplay.
    }
}

function playDemoSound() { playTone(180, 0.08, "sine", 0.025); }

function playReadySound() {
    playTone(420, 0.12, "sine", 0.035);
    playTone(620, 0.16, "sine", 0.035, 0.08);
}

function playTraceStartSound() { playTone(320, 0.08, "triangle", 0.025); }
function playInvalidStartSound() { playTone(110, 0.14, "sawtooth", 0.035); }
function playPauseSound() { playTone(260, 0.08, "triangle", 0.025); }

function playSuccessSound(streakValue) {
    const base = 420 + Math.min(10, streakValue) * 20;

    playTone(base, 0.10, "triangle", 0.04);
    playTone(base * 1.25, 0.12, "triangle", 0.04, 0.08);

    if (streakValue >= 3) playTone(base * 1.5, 0.18, "sine", 0.045, 0.16);
    if (streakValue >= 10) playTone(base * 2, 0.30, "sine", 0.055, 0.25);
}

function playFailureSound() {
    playTone(180, 0.18, "sawtooth", 0.04);
    playTone(110, 0.25, "sawtooth", 0.035, 0.08);
}

function playCompleteSound() {
    playTone(523, 0.14, "sine", 0.045);
    playTone(659, 0.14, "sine", 0.045, 0.10);
    playTone(784, 0.20, "sine", 0.05, 0.20);
    playTone(1046, 0.35, "sine", 0.055, 0.32);
}

// ============================================================
// START
// ============================================================

setupPage();
resize();
resetRun();
loadSavedData(); // async; best score and settings fill in once loaded
requestAnimationFrame(gameLoop);