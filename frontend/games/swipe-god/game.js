const canvas = document.getElementById("gameCanvas");

if (!canvas) {
    throw new Error("gameCanvas element was not found.");
}

const ctx = canvas.getContext("2d");

if (!ctx) {
    throw new Error("Unable to create 2D canvas context.");
}

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {

    // ========================================================
    // GAME
    // ========================================================

    MAX_LEVEL: 10,

    BASE_SEGMENT_LENGTH_PX: 288,

    TIMER_DURATION: 3000,

    // ========================================================
    // ADAPTIVE DIFFICULTY
    // ========================================================

    MIN_TRACE_TOLERANCE: 45,
    MAX_TRACE_TOLERANCE: 110,

    TOLERANCE_SCREEN_RATIO: 0.08,

    MIN_PATH_COVERAGE: 0.70,
    MIN_PATH_PROGRESS: 0.90,

    CHECKPOINT_SPACING: 0.08,
    CHECKPOINT_TOLERANCE_RATIO: 0.95,

    MAX_BACKWARD_MOVEMENT: 0.16,
    MAX_BACKWARD_EVENTS_RATIO: 0.08,

    // ========================================================
    // PATH GENERATION
    // ========================================================

    PATH_RADIUS_RATIO: 0.36,

    MIN_SELF_DISTANCE: 85,

    BASE_CURVE_POINTS: 12,

    MAX_TURN: Math.PI / 4,

    // ========================================================
    // VISUAL EFFECTS
    // ========================================================

    HELP_TRACE_FADE_DURATION: 2200,

    STREAK_LINE_FADE_DURATION: 1500,

    CPU_ANIMATION_DURATION: 3600,

    GLOW_SPEED: 0.35,

    SHIMMER_DURATION: 1200,

    SUCCESS_FADE_DURATION: 500,

    NEXT_LEVEL_DELAY: 1500,

    // ========================================================
    // PLAYER TRACE
    // ========================================================

    MIN_TRACE_POINT_DISTANCE: 4,

    MAX_TRACE_POINTS: 1400,

    // ========================================================
    // PARTICLES
    // ========================================================

    MAX_PARTICLES: 450,

    SUCCESS_PARTICLE_COUNT: 75,

    FAILURE_PARTICLE_COUNT: 45,

    TRACE_PARTICLE_INTERVAL: 0.025,

    // ========================================================
    // GAME FEEL
    // ========================================================

    FAILURE_RECOVERY_DELAY: 700,

    INVALID_START_SHAKE_STRENGTH: 5,

    INVALID_START_SHAKE_DURATION: 120,

    FAILURE_SHAKE_STRENGTH: 12,

    FAILURE_SHAKE_DURATION: 350,

    SUCCESS_SHAKE_STRENGTH: 4,

    SUCCESS_SHAKE_DURATION: 180,

    // ========================================================
    // UI
    // ========================================================

    UI_MARGIN: 20,

    HUD_FONT: 30,

    // ========================================================
    // SCORE
    // ========================================================

    BASE_LEVEL_SCORE: 100,

    PERFECT_BONUS: 100,

    SPEED_BONUS_MAX: 100,

    STREAK_MULTIPLIER_STEP: 0.25,

    // ========================================================
    // STORAGE
    // ========================================================

    STORAGE_KEY: "neonTraceGameBestScore",

    STORAGE_STREAK_KEY: "neonTraceGameBestStreak"
};

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

let completedStreakLines = [];

let particles = [];

let pointerId = null;

let pathWidth = 0;

let pathHeight = 0;

let pathGeneratedAt = 0;

// ============================================================
// TRACE / PROGRESS DATA
// ============================================================

let currentTraceProgress = 0;

let maxTraceProgress = 0;

let lastTraceProgress = 0;

let traceBackwardsEvents = 0;

let traceValidPoints = 0;

let traceTotalPoints = 0;

let traceDistanceTravelled = 0;

let lastTraceParticleTime = 0;

// ============================================================
// TIMER / ANIMATION STATE
// ============================================================

let timerStart = 0;

let timerRunning = false;

let timerDuration = CONFIG.TIMER_DURATION;

let pausedRemainingTime = 0;

let cpuAnimationProgress = 0;

let cpuAnimationStart = 0;

let glowAnimating = false;

let glowProgress = 0;

let helpTraceStart = 0;

let helpTraceAlpha = 1;

let successAnimationStart = 0;

let successAnimationProgress = 0;

let nextLevelTime = 0;

let failureFlash = 0;

let successFlash = 0;

// ============================================================
// SHAKE
// ============================================================

let shakeTime = 0;

let shakeDuration = 0;

let shakeStrength = 0;

// ============================================================
// PERFORMANCE
// ============================================================

let lastFrameTime = performance.now();

let gameSessionId = 0;

// ============================================================
// AUDIO
// ============================================================

let audioContext = null;

let audioReady = false;

// ============================================================
// RESIZE
// ============================================================

function resize() {

    const oldWidth = canvas.width || window.innerWidth;

    const oldHeight = canvas.height || window.innerHeight;

    canvas.width = window.innerWidth;

    canvas.height = window.innerHeight;

    canvas.style.touchAction = "none";

    /*
     * Do NOT generate a new random path on resize.
     *
     * Instead, preserve the current path and scale it
     * to the new canvas dimensions.
     */

    if (
        levels.length > 0 &&
        pathWidth > 0 &&
        pathHeight > 0
    ) {

        scaleStoredPaths(
            pathWidth,
            pathHeight,
            canvas.width,
            canvas.height
        );

        sequence =
            levels[
                currentLevel - 1
            ] || [];
    }

    pathWidth = canvas.width;

    pathHeight = canvas.height;

    /*
     * If the canvas was resized while actively tracing,
     * keep the player's current trace aligned with the
     * preserved path.
     */

    if (
        userTrace.length > 0 &&
        oldWidth > 0 &&
        oldHeight > 0
    ) {

        const scaleX =
            canvas.width / oldWidth;

        const scaleY =
            canvas.height / oldHeight;

        userTrace =
            userTrace.map(point => ({
                x: point.x * scaleX,
                y: point.y * scaleY
            }));
    }
}

window.addEventListener(
    "resize",
    resize
);

// ============================================================
// SCALE STORED PATHS
// ============================================================

function scaleStoredPaths(
    oldWidth,
    oldHeight,
    newWidth,
    newHeight
) {

    if (
        !oldWidth ||
        !oldHeight
    ) {
        return;
    }

    const scaleX =
        newWidth / oldWidth;

    const scaleY =
        newHeight / oldHeight;

    levels =
        levels.map(path =>
            path.map(point => ({
                x: point.x * scaleX,
                y: point.y * scaleY
            }))
        );
}

// ============================================================
// GAME LOOP
// ============================================================

function gameLoop(now) {

    const deltaTime =
        Math.min(
            (now - lastFrameTime) / 1000,
            0.1
        );

    lastFrameTime = now;

    update(
        deltaTime,
        now
    );

    render(now);

    requestAnimationFrame(
        gameLoop
    );
}

// ============================================================
// UPDATE
// ============================================================

function update(
    deltaTime,
    now
) {

    updateShake(deltaTime);

    updateFailureFlash(deltaTime);

    updateSuccessFlash(deltaTime);

    updateStreakFades(now);

    updateParticles(deltaTime);

    if (
        gameState === GAME_STATE.DEMO
    ) {

        updateCpuAnimation(now);
    }

    if (
        gameState === GAME_STATE.READY
    ) {

        updateGlow(deltaTime);
    }

    if (
        gameState === GAME_STATE.TRACING
    ) {

        updateTimer(now);

        updateHelpTrace(now);
    }

    if (
        gameState === GAME_STATE.SUCCESS
    ) {

        updateSuccessAnimation(now);
    }

    if (
        gameState === GAME_STATE.SUCCESS &&
        nextLevelTime > 0 &&
        now >= nextLevelTime
    ) {

        nextLevelTime = 0;

        if (
            currentLevel >=
            CONFIG.MAX_LEVEL
        ) {

            gameState =
                GAME_STATE.COMPLETE;

            timerRunning = false;

            playCompleteSound();

            createCompletionParticles();

            saveBestStats();

        } else {

            currentLevel++;

            sequence =
                levels[
                    currentLevel - 1
                ] || [];

            startCpuDemo();
        }
    }
}

// ============================================================
// RENDER
// ============================================================

function render(now) {

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    const shake =
        getShakeOffset();

    ctx.save();

    ctx.translate(
        shake.x,
        shake.y
    );

    drawBackground(now);

    drawAmbientParticles();

    drawStreakLines();

    // --------------------------------------------------------
    // GAME STATE
    // --------------------------------------------------------

    if (
        gameState ===
        GAME_STATE.DEMO
    ) {

        drawCpuSequence();
    }

    if (
        gameState ===
        GAME_STATE.READY
    ) {

        drawReadySequence();
    }

    if (
        gameState ===
        GAME_STATE.TRACING
    ) {

        drawFadingHelpTrace();

        drawUserTrace();

        drawTimerHUD();

        drawTraceProgress();
    }

    if (
        gameState ===
        GAME_STATE.SUCCESS
    ) {

        drawSuccessState();
    }

    if (
        gameState ===
        GAME_STATE.FAILED
    ) {

        drawFailureState();
    }

    if (
        gameState ===
        GAME_STATE.COMPLETE
    ) {

        drawCompleteGame();
    }

    if (
        gameState ===
        GAME_STATE.PAUSED
    ) {

        drawPausedState();
    }

    drawParticles();

    drawUI();

    drawFailureFlash();

    drawSuccessFlash();

    ctx.restore();
}

// ============================================================
// BACKGROUND
// ============================================================

function drawBackground(now) {

    const centerX =
        canvas.width / 2;

    const centerY =
        canvas.height / 2;

    const size =
        Math.min(
            canvas.width,
            canvas.height
        );

    const innerRadius =
        size / 10;

    const outerRadius =
        size / 2;

    const gradient =
        ctx.createRadialGradient(
            centerX,
            centerY,
            innerRadius,
            centerX,
            centerY,
            outerRadius
        );

    gradient.addColorStop(
        0,
        "#001f26"
    );

    gradient.addColorStop(
        0.45,
        "#00141c"
    );

    gradient.addColorStop(
        1,
        "#000811"
    );

    ctx.fillStyle =
        gradient;

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    // --------------------------------------------------------
    // Animated background grid
    // --------------------------------------------------------

    ctx.save();

    const gridSize = 60;

    const offset =
        (
            now * 0.015
        ) %
        gridSize;

    ctx.globalAlpha = 0.08;

    ctx.strokeStyle =
        "#00ffff";

    ctx.lineWidth = 1;

    for (
        let x = -gridSize + offset;
        x < canvas.width + gridSize;
        x += gridSize
    ) {

        ctx.beginPath();

        ctx.moveTo(
            x,
            0
        );

        ctx.lineTo(
            x,
            canvas.height
        );

        ctx.stroke();
    }

    for (
        let y = -gridSize + offset;
        y < canvas.height + gridSize;
        y += gridSize
    ) {

        ctx.beginPath();

        ctx.moveTo(
            0,
            y
        );

        ctx.lineTo(
            canvas.width,
            y
        );

        ctx.stroke();
    }

    ctx.restore();
}

// ============================================================
// DIFFICULTY
// ============================================================

function getDifficulty(level) {

    return {
        turnAmount:
            Math.min(
                Math.PI * 0.9,
                CONFIG.MAX_TURN +
                    level *
                    0.045
            ),

        segmentLength:
            CONFIG.BASE_SEGMENT_LENGTH_PX *
            (
                0.90 +
                level *
                0.025
            ),

        tolerance:
            getTraceTolerance(level),

        timer:
            Math.max(
                1800,
                CONFIG.TIMER_DURATION -
                    (
                        level - 1
                    ) *
                    110
            ),

        patternDensity:
            Math.min(
                1,
                0.25 +
                    level *
                    0.075
            )
    };
}

// ============================================================
// ADAPTIVE TRACE TOLERANCE
// ============================================================

function getTraceTolerance(
    level = currentLevel
) {

    const screenSize =
        Math.min(
            canvas.width,
            canvas.height
        );

    let tolerance =
        Math.min(
            CONFIG.MAX_TRACE_TOLERANCE,
            Math.max(
                CONFIG.MIN_TRACE_TOLERANCE,
                screenSize *
                CONFIG.TOLERANCE_SCREEN_RATIO
            )
        );

    /*
     * Higher levels become slightly more precise.
     */

    tolerance *=
        Math.max(
            0.70,
            1 -
                (
                    level - 1
                ) *
                0.025
        );

    return tolerance;
}

// ============================================================
// PATH GENERATION
// ============================================================

function generateLevelPath(
    level
) {

    const pattern =
        getPatternForLevel(level);

    switch (pattern) {

        case "wave":
            return generateWavePath(level);

        case "zigzag":
            return generateZigZagPath(level);

        case "sCurve":
            return generateSCurvePath(level);

        case "spiral":
            return generateSpiralPath(level);

        case "loop":
            return generateLoopPath(level);

        case "challenge":
            return generateChallengePath(level);

        default:
            return generateFreeformPath(level);
    }
}

// ============================================================
// PATTERN SELECTION
// ============================================================

function getPatternForLevel(
    level
) {

    const patterns = [

        "freeform",

        "wave",

        "zigzag",

        "sCurve",

        "spiral",

        "loop",

        "wave",

        "zigzag",

        "spiral",

        "challenge"
    ];

    return patterns[
        Math.min(
            level - 1,
            patterns.length - 1
        )
    ];
}

// ============================================================
// PLAYABLE CENTER
// ============================================================

function getPathBounds() {

    const centerX =
        canvas.width / 2;

    const centerY =
        canvas.height / 2;

    const radius =
        Math.min(
            canvas.width,
            canvas.height
        ) *
        CONFIG.PATH_RADIUS_RATIO;

    return {
        centerX,
        centerY,
        radius
    };
}

// ============================================================
// FREEFORM PATH
// ============================================================

function generateFreeformPath(
    level
) {

    const {
        centerX,
        centerY,
        radius
    } = getPathBounds();

    const difficulty =
        getDifficulty(level);

    const waypoints = [
        {
            x: centerX,
            y: centerY
        }
    ];

    let angle =
        Math.random() *
        Math.PI *
        2;

    let currentRadius =
        radius *
        0.18;

    for (
        let i = 1;
        i <= level + 2;
        i++
    ) {

        const turn =
            (
                Math.random() * 2 -
                1
            ) *
            difficulty.turnAmount;

        angle += turn;

        currentRadius =
            Math.min(
                radius *
                0.88,
                currentRadius +
                    radius *
                    (
                        0.07 +
                        Math.random() *
                        0.07
                    )
            );

        const candidate = {

            x:
                centerX +
                Math.cos(angle) *
                currentRadius,

            y:
                centerY +
                Math.sin(angle) *
                currentRadius
        };

        if (
            isPointTooCloseToPath(
                candidate,
                waypoints,
                CONFIG.MIN_SELF_DISTANCE
            )
        ) {

            angle += Math.PI / 2;

            candidate.x =
                centerX +
                Math.cos(angle) *
                currentRadius;

            candidate.y =
                centerY +
                Math.sin(angle) *
                currentRadius;
        }

        waypoints.push(
            clampPointToRadius(
                candidate,
                centerX,
                centerY,
                radius * 0.9
            )
        );
    }

    return smoothWaypoints(
        waypoints
    );
}

// ============================================================
// WAVE PATH
// ============================================================

function generateWavePath(
    level
) {

    const {
        centerX,
        centerY,
        radius
    } = getPathBounds();

    const points = [];

    const horizontal =
        Math.min(
            radius * 1.65,
            canvas.width * 0.70
        );

    const rows =
        Math.max(
            3,
            level
        );

    const amplitude =
        Math.min(
            radius * 0.42,
            65 +
                level *
                4
        );

    const startX =
        centerX -
        horizontal / 2;

    for (
        let i = 0;
        i <= rows * CONFIG.BASE_CURVE_POINTS;
        i++
    ) {

        const t =
            i /
            (
                rows *
                CONFIG.BASE_CURVE_POINTS
            );

        const x =
            startX +
            horizontal * t;

        const y =
            centerY +
            Math.sin(
                t *
                Math.PI *
                rows *
                0.72
            ) *
            amplitude;

        points.push({
            x,
            y
        });
    }

    return normalizePathAroundCenter(
        points,
        centerX,
        centerY,
        radius * 0.92
    );
}

// ============================================================
// ZIGZAG
// ============================================================

function generateZigZagPath(
    level
) {

    const {
        centerX,
        centerY,
        radius
    } = getPathBounds();

    const points = [];

    const count =
        level + 3;

    const width =
        radius * 1.65;

    const height =
        radius * 1.45;

    for (
        let i = 0;
        i <= count;
        i++
    ) {

        const t =
            i / count;

        const x =
            centerX -
            width / 2 +
            width * t;

        const direction =
            i % 2 === 0
                ? -1
                : 1;

        const y =
            centerY +
            direction *
            height *
            0.5;

        points.push({
            x,
            y
        });
    }

    /*
     * Shift the first point back to the center.
     */

    const offsetX =
        centerX -
        points[0].x;

    const offsetY =
        centerY -
        points[0].y;

    const shifted =
        points.map(point => ({
            x: point.x + offsetX,
            y: point.y + offsetY
        }));

    return normalizePathAroundCenter(
        shifted,
        centerX,
        centerY,
        radius * 0.88
    );
}

// ============================================================
// S CURVE
// ============================================================

function generateSCurvePath(
    level
) {

    const {
        centerX,
        centerY,
        radius
    } = getPathBounds();

    const points = [];

    const length =
        radius * 1.65;

    const amplitude =
        radius *
        (
            0.38 +
            Math.min(
                0.12,
                level *
                0.008
            )
        );

    const total =
        100 +
        level *
        10;

    for (
        let i = 0;
        i <= total;
        i++
    ) {

        const t =
            i / total;

        const x =
            centerX -
            length / 2 +
            length * t;

        const y =
            centerY +
            Math.sin(
                t *
                Math.PI *
                1.45
            ) *
            amplitude;

        points.push({
            x,
            y
        });
    }

    /*
     * Make the actual starting point exactly center.
     */

    const startOffsetX =
        centerX -
        points[0].x;

    const startOffsetY =
        centerY -
        points[0].y;

    const shifted =
        points.map(point => ({
            x: point.x + startOffsetX,
            y: point.y + startOffsetY
        }));

    return normalizePathAroundCenter(
        shifted,
        centerX,
        centerY,
        radius * 0.92
    );
}

// ============================================================
// SPIRAL
// ============================================================

function generateSpiralPath(
    level
) {

    const {
        centerX,
        centerY,
        radius
    } = getPathBounds();

    const points = [];

    const turns =
        1.05 +
        level *
        0.12;

    const total =
        160 +
        level *
        20;

    for (
        let i = 0;
        i <= total;
        i++
    ) {

        const t =
            i / total;

        const angle =
            t *
            Math.PI *
            2 *
            turns;

        const r =
            radius *
            0.12 +
            radius *
            0.70 *
            t;

        points.push({
            x:
                centerX +
                Math.cos(angle) *
                r,

            y:
                centerY +
                Math.sin(angle) *
                r
        });
    }

    return points;
}

// ============================================================
// LOOP
// ============================================================

function generateLoopPath(
    level
) {

    const {
        centerX,
        centerY,
        radius
    } = getPathBounds();

    const points = [];

    const total =
        190 +
        level *
        20;

    const loopRadius =
        radius *
        0.55;

    for (
        let i = 0;
        i <= total;
        i++
    ) {

        const t =
            i / total;

        const angle =
            -Math.PI / 2 +
            t *
            Math.PI *
            2.15;

        const r =
            loopRadius *
            (
                0.55 +
                0.35 *
                Math.sin(
                    t *
                    Math.PI
                )
            );

        points.push({
            x:
                centerX +
                Math.cos(angle) *
                r,

            y:
                centerY +
                Math.sin(angle) *
                r
        });
    }

    /*
     * Connect the beginning to the center.
     */

    const start =
        points[0];

    const connector = [];

    const connectorCount = 25;

    for (
        let i = 0;
        i < connectorCount;
        i++
    ) {

        const t =
            i /
            (
                connectorCount - 1
            );

        connector.push({
            x:
                centerX +
                (
                    start.x -
                    centerX
                ) *
                t,

            y:
                centerY +
                (
                    start.y -
                    centerY
                ) *
                t
        });
    }

    return [
        ...connector,
        ...points
    ];
}

// ============================================================
// CHALLENGE PATH
// ============================================================

function generateChallengePath(
    level
) {

    const {
        centerX,
        centerY,
        radius
    } = getPathBounds();

    const points = [];

    const sections = 6;

    const pointsPerSection = 45;

    for (
        let section = 0;
        section < sections;
        section++
    ) {

        const sectionStart =
            section /
            sections;

        const sectionEnd =
            (
                section + 1
            ) /
            sections;

        const direction =
            section % 2 === 0
                ? 1
                : -1;

        for (
            let i = 0;
            i < pointsPerSection;
            i++
        ) {

            const local =
                i /
                pointsPerSection;

            const t =
                sectionStart +
                (
                    sectionEnd -
                    sectionStart
                ) *
                local;

            const angle =
                t *
                Math.PI *
                4.5;

            const radial =
                radius *
                (
                    0.18 +
                    0.70 *
                    t
                );

            const wave =
                Math.sin(
                    t *
                    Math.PI *
                    12
                ) *
                radius *
                0.13 *
                direction;

            points.push({
                x:
                    centerX +
                    Math.cos(angle) *
                    radial +
                    wave,

                y:
                    centerY +
                    Math.sin(angle) *
                    radial -
                    wave
            });
        }
    }

    return normalizePathAroundCenter(
        points,
        centerX,
        centerY,
        radius * 0.90
    );
}

// ============================================================
// SMOOTH WAYPOINTS
// ============================================================

function smoothWaypoints(
    waypoints
) {

    if (
        waypoints.length < 2
    ) {
        return waypoints;
    }

    const points = [];

    for (
        let i = 0;
        i < waypoints.length - 1;
        i++
    ) {

        const a =
            waypoints[i];

        const b =
            waypoints[i + 1];

        for (
            let j = 0;
            j < CONFIG.BASE_CURVE_POINTS;
            j++
        ) {

            const t =
                j /
                CONFIG.BASE_CURVE_POINTS;

            const eased =
                t *
                t *
                (
                    3 -
                    2 *
                    t
                );

            points.push({
                x:
                    a.x +
                    (
                        b.x -
                        a.x
                    ) *
                    eased,

                y:
                    a.y +
                    (
                        b.y -
                        a.y
                    ) *
                    eased
            });
        }
    }

    points.push(
        waypoints[
            waypoints.length - 1
        ]
    );

    return points;
}

// ============================================================
// NORMALIZE PATH
// ============================================================

function normalizePathAroundCenter(
    points,
    centerX,
    centerY,
    maxRadius
) {

    if (
        points.length === 0
    ) {
        return points;
    }

    /*
     * Shift first point exactly to center.
     */

    const offsetX =
        centerX -
        points[0].x;

    const offsetY =
        centerY -
        points[0].y;

    let shifted =
        points.map(point => ({
            x: point.x + offsetX,
            y: point.y + offsetY
        }));

    let maximumDistance = 0;

    shifted.forEach(point => {

        maximumDistance =
            Math.max(
                maximumDistance,
                Math.hypot(
                    point.x -
                        centerX,
                    point.y -
                        centerY
                )
            );
    });

    if (
        maximumDistance >
        maxRadius
    ) {

        const scale =
            maxRadius /
            maximumDistance;

        shifted =
            shifted.map(point => ({
                x:
                    centerX +
                    (
                        point.x -
                        centerX
                    ) *
                    scale,

                y:
                    centerY +
                    (
                        point.y -
                        centerY
                    ) *
                    scale
            }));
    }

    return shifted;
}

// ============================================================
// POINT CLAMP
// ============================================================

function clampPointToRadius(
    point,
    centerX,
    centerY,
    radius
) {

    const dx =
        point.x -
        centerX;

    const dy =
        point.y -
        centerY;

    const distance =
        Math.hypot(
            dx,
            dy
        );

    if (
        distance <= radius
    ) {
        return point;
    }

    const scale =
        radius /
        distance;

    return {
        x:
            centerX +
            dx *
            scale,

        y:
            centerY +
            dy *
            scale
    };
}

// ============================================================
// SELF DISTANCE CHECK
// ============================================================

function isPointTooCloseToPath(
    point,
    points,
    minimumDistance
) {

    if (
        points.length < 3
    ) {
        return false;
    }

    /*
     * Don't compare against the immediately previous
     * two points because the path naturally needs to
     * be close to itself there.
     */

    for (
        let i = 0;
        i <
        points.length - 2;
        i++
    ) {

        const distance =
            distancePointToSegment(
                point.x,
                point.y,
                points[i].x,
                points[i].y,
                points[i + 1].x,
                points[i + 1].y
            );

        if (
            distance <
            minimumDistance
        ) {
            return true;
        }
    }

    return false;
}

// ============================================================
// GENERATE ALL LEVELS
// ============================================================

function generateAllLevels() {

    levels = [];

    for (
        let level = 1;
        level <= CONFIG.MAX_LEVEL;
        level++
    ) {

        levels.push(
            generateLevelPath(
                level
            )
        );
    }

    pathGeneratedAt =
        performance.now();

    pathWidth =
        canvas.width;

    pathHeight =
        canvas.height;
}

// ============================================================
// CURRENT PATH
// ============================================================

function regenerateCurrentSequence() {

    /*
     * Compatibility function retained intentionally.
     *
     * We no longer create a completely new random path
     * during resize.
     */

    if (
        levels.length === 0
    ) {
        generateAllLevels();
    }

    sequence =
        levels[
            currentLevel - 1
        ] || [];

    userTrace = [];

    timerRunning = false;

    glowAnimating = false;

    glowProgress = 0;

    helpTraceStart = 0;

    helpTraceAlpha = 1;
}

// ============================================================
// PATH LENGTH
// ============================================================

function getPathLength(
    points = sequence
) {

    let length = 0;

    for (
        let i = 1;
        i < points.length;
        i++
    ) {

        length +=
            Math.hypot(
                points[i].x -
                    points[i - 1].x,

                points[i].y -
                    points[i - 1].y
            );
    }

    return length;
}

// ============================================================
// POINT ALONG PATH
// ============================================================

function getPointAlongPath(
    progress,
    points = sequence
) {

    if (
        !points ||
        points.length === 0
    ) {

        return {
            x: 0,
            y: 0
        };
    }

    if (
        points.length === 1
    ) {
        return {
            ...points[0]
        };
    }

    progress =
        Math.max(
            0,
            Math.min(
                1,
                progress
            )
        );

    const totalLength =
        getPathLength(points);

    const target =
        totalLength *
        progress;

    let accumulated = 0;

    for (
        let i = 1;
        i < points.length;
        i++
    ) {

        const start =
            points[i - 1];

        const end =
            points[i];

        const segmentLength =
            Math.hypot(
                end.x -
                    start.x,

                end.y -
                    start.y
            );

        if (
            accumulated +
            segmentLength >=
            target
        ) {

            const local =
                segmentLength === 0
                    ? 0
                    : (
                        target -
                        accumulated
                    ) /
                    segmentLength;

            return {
                x:
                    start.x +
                    (
                        end.x -
                        start.x
                    ) *
                    local,

                y:
                    start.y +
                    (
                        end.y -
                        start.y
                    ) *
                    local
            };
        }

        accumulated +=
            segmentLength;
    }

    return {
        ...points[
            points.length - 1
        ]
    };
}

// ============================================================
// ANGLE INTERPOLATION
// ============================================================

function lerpAngle(
    a,
    b,
    t
) {

    const difference =
        Math.atan2(
            Math.sin(b - a),
            Math.cos(b - a)
        );

    return (
        a +
        difference * t
    );
}

// ============================================================
// COLORS
// ============================================================

function getStreakColor(
    streakValue
) {

    if (
        streakValue >= 10
    ) {

        return "rgba(255, 0, 255, 0.9)";
    }

    if (
        streakValue >= 6
    ) {

        return "rgba(255, 215, 0, 0.9)";
    }

    if (
        streakValue >= 3
    ) {

        return "rgba(0, 255, 0, 0.9)";
    }

    return "rgba(0, 255, 204, 0.9)";
}

// ============================================================
// COLOR DIMMING
// ============================================================

function dimColor(
    rgba,
    factor = 0.4,
    alphaFactor = 1
) {

    const match =
        rgba.match(
            /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/
        );

    if (!match) {
        return rgba;
    }

    let r =
        Number(match[1]);

    let g =
        Number(match[2]);

    let b =
        Number(match[3]);

    let a =
        match[4] !== undefined
            ? Number(match[4])
            : 1;

    r =
        Math.floor(
            r * factor
        );

    g =
        Math.floor(
            g * factor
        );

    b =
        Math.floor(
            b * factor
        );

    a *=
        factor *
        0.7 *
        alphaFactor;

    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// ============================================================
// PATH DRAWING
// ============================================================

function drawPartialPath(
    points,
    progress,
    color = "rgba(0, 255, 204, 1)",
    lineWidth = 8,
    shadowBlur = 15
) {

    if (
        !points ||
        points.length < 2
    ) {
        return;
    }

    progress =
        Math.max(
            0,
            Math.min(
                1,
                progress
            )
        );

    const targetPoint =
        getPointAlongPath(
            progress,
            points
        );

    ctx.save();

    ctx.strokeStyle =
        color;

    ctx.lineWidth =
        lineWidth;

    ctx.lineCap =
        "round";

    ctx.lineJoin =
        "round";

    ctx.shadowColor =
        color;

    ctx.shadowBlur =
        shadowBlur;

    ctx.beginPath();

    ctx.moveTo(
        points[0].x,
        points[0].y
    );

    let targetReached = false;

    for (
        let i = 1;
        i < points.length;
        i++
    ) {

        if (
            !targetReached
        ) {

            const distanceToTarget =
                Math.hypot(
                    points[i].x -
                        targetPoint.x,

                    points[i].y -
                        targetPoint.y
                );

            if (
                distanceToTarget <
                1
            ) {

                ctx.lineTo(
                    targetPoint.x,
                    targetPoint.y
                );

                targetReached = true;

                break;
            }

            const pathProgress =
                getPathProgressForPointIndex(
                    i,
                    points
                );

            if (
                pathProgress <=
                progress
            ) {

                ctx.lineTo(
                    points[i].x,
                    points[i].y
                );

            } else {

                ctx.lineTo(
                    targetPoint.x,
                    targetPoint.y
                );

                targetReached = true;

                break;
            }
        }
    }

    if (
        progress >= 1
    ) {

        ctx.lineTo(
            points[
                points.length - 1
            ].x,

            points[
                points.length - 1
            ].y
        );
    }

    ctx.stroke();

    ctx.restore();
}

// ============================================================
// PATH INDEX PROGRESS
// ============================================================

function getPathProgressForPointIndex(
    index,
    points
) {

    let total = 0;

    let current = 0;

    for (
        let i = 1;
        i < points.length;
        i++
    ) {

        const length =
            Math.hypot(
                points[i].x -
                    points[i - 1].x,

                points[i].y -
                    points[i - 1].y
            );

        total += length;

        if (
            i <= index
        ) {
            current += length;
        }
    }

    if (
        total === 0
    ) {
        return 0;
    }

    return current / total;
}

// ============================================================
// CPU DEMONSTRATION
// ============================================================

function startCpuDemo() {

    gameState =
        GAME_STATE.DEMO;

    cpuAnimationStart =
        performance.now();

    cpuAnimationProgress = 0;

    glowAnimating = false;

    glowProgress = 0;

    userTrace = [];

    timerRunning = false;

    helpTraceStart = 0;

    helpTraceAlpha = 1;

    nextLevelTime = 0;

    pointerId = null;

    currentTraceProgress = 0;

    maxTraceProgress = 0;

    traceBackwardsEvents = 0;

    traceValidPoints = 0;

    traceTotalPoints = 0;

    traceDistanceTravelled = 0;

    gameSessionId++;

    playDemoSound();
}

// ============================================================
// CPU ANIMATION
// ============================================================

function updateCpuAnimation(
    now
) {

    const elapsed =
        now -
        cpuAnimationStart;

    const duration =
        Math.max(
            1800,
            CONFIG.CPU_ANIMATION_DURATION -
                currentLevel *
                120
        );

    cpuAnimationProgress =
        Math.min(
            elapsed /
                duration,
            1
        );

    if (
        cpuAnimationProgress >= 1
    ) {

        gameState =
            GAME_STATE.READY;

        glowAnimating = true;

        glowProgress = 0;

        playReadySound();
    }
}

// ============================================================
// CPU PATH
// ============================================================

function drawCpuSequence() {

    const pulse =
        15 +
        10 *
        Math.sin(
            performance.now() *
            0.005
        );

    const color =
        getStreakColor(
            streak
        );

    drawPartialPath(
        sequence,
        cpuAnimationProgress,
        color,
        12,
        pulse
    );

    const cursor =
        getPointAlongPath(
            cpuAnimationProgress
        );

    drawPathCursor(
        cursor,
        color,
        1
    );
}

// ============================================================
// PATH CURSOR
// ============================================================

function drawPathCursor(
    point,
    color,
    alpha = 1
) {

    if (!point) {
        return;
    }

    ctx.save();

    ctx.globalAlpha =
        alpha;

    const radius = 14;

    const gradient =
        ctx.createRadialGradient(
            point.x,
            point.y,
            2,
            point.x,
            point.y,
            radius
        );

    gradient.addColorStop(
        0,
        "rgba(255,255,255,1)"
    );

    gradient.addColorStop(
        0.25,
        color
    );

    gradient.addColorStop(
        1,
        "rgba(0,255,255,0)"
    );

    ctx.fillStyle =
        gradient;

    ctx.beginPath();

    ctx.arc(
        point.x,
        point.y,
        radius,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.restore();
}

// ============================================================
// READY STATE
// ============================================================

function drawReadySequence() {

    drawPartialPath(
        sequence,
        1,
        "rgba(0, 255, 204, 0.25)",
        8,
        12
    );

    if (
        glowAnimating
    ) {

        drawGlowAlongLine();
    }

    drawPartialPath(
        sequence,
        1,
        "rgba(0, 255, 204, 1)",
        12,
        20
    );

    drawStartMarker();

    drawEndMarker();
}

// ============================================================
// START MARKER
// ============================================================

function drawStartMarker() {

    if (
        sequence.length === 0
    ) {
        return;
    }

    const point =
        sequence[0];

    const pulse =
        1 +
        Math.sin(
            performance.now() *
            0.008
        ) *
        0.15;

    ctx.save();

    ctx.strokeStyle =
        "#ffffff";

    ctx.lineWidth = 3;

    ctx.shadowColor =
        "#00ffcc";

    ctx.shadowBlur = 20;

    ctx.beginPath();

    ctx.arc(
        point.x,
        point.y,
        20 * pulse,
        0,
        Math.PI * 2
    );

    ctx.stroke();

    ctx.restore();
}

// ============================================================
// END MARKER
// ============================================================

function drawEndMarker() {

    if (
        sequence.length === 0
    ) {
        return;
    }

    const point =
        sequence[
            sequence.length - 1
        ];

    ctx.save();

    ctx.fillStyle =
        "#ffffff";

    ctx.shadowColor =
        "#00ffff";

    ctx.shadowBlur = 18;

    ctx.beginPath();

    ctx.arc(
        point.x,
        point.y,
        7,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.restore();
}

// ============================================================
// GLOW
// ============================================================

function updateGlow(
    deltaTime
) {

    if (
        !glowAnimating
    ) {
        return;
    }

    glowProgress +=
        CONFIG.GLOW_SPEED *
        deltaTime;

    if (
        glowProgress >= 1
    ) {

        glowProgress = 0;
    }
}

// ============================================================
// GLOW ALONG LINE
// ============================================================

function drawGlowAlongLine() {

    if (
        !sequence ||
        sequence.length < 2
    ) {
        return;
    }

    const point =
        getPointAlongPath(
            glowProgress
        );

    const radius = 25;

    const gradient =
        ctx.createRadialGradient(
            point.x,
            point.y,
            radius / 4,
            point.x,
            point.y,
            radius
        );

    gradient.addColorStop(
        0,
        "rgba(0, 255, 255, 0.95)"
    );

    gradient.addColorStop(
        1,
        "rgba(0, 255, 255, 0)"
    );

    ctx.save();

    ctx.fillStyle =
        gradient;

    ctx.beginPath();

    ctx.arc(
        point.x,
        point.y,
        radius,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.restore();
}

// ============================================================
// USER TRACE
// ============================================================

function drawUserTrace() {

    if (
        !userTrace ||
        userTrace.length < 2
    ) {
        return;
    }

    const color =
        getStreakColor(
            streak
        );

    ctx.save();

    ctx.strokeStyle =
        color;

    ctx.lineWidth = 7;

    ctx.lineCap =
        "round";

    ctx.lineJoin =
        "round";

    ctx.shadowColor =
        color;

    ctx.shadowBlur = 30;

    ctx.beginPath();

    ctx.moveTo(
        userTrace[0].x,
        userTrace[0].y
    );

    for (
        let i = 1;
        i < userTrace.length;
        i++
    ) {

        ctx.lineTo(
            userTrace[i].x,
            userTrace[i].y
        );
    }

    ctx.stroke();

    ctx.restore();
}

// ============================================================
// HELP TRACE
// ============================================================

function startHelpTrace() {

    helpTraceStart =
        performance.now();

    helpTraceAlpha = 1;
}

// ============================================================
// UPDATE HELP
// ============================================================

function updateHelpTrace(
    now
) {

    if (
        helpTraceStart === 0
    ) {
        return;
    }

    const elapsed =
        now -
        helpTraceStart;

    helpTraceAlpha =
        1 -
        elapsed /
            CONFIG.HELP_TRACE_FADE_DURATION;

    helpTraceAlpha =
        Math.max(
            0,
            Math.min(
                1,
                helpTraceAlpha
            )
        );
}

// ============================================================
// DRAW HELP
// ============================================================

function drawFadingHelpTrace() {

    if (
        sequence.length < 2 ||
        userTrace.length < 1 ||
        helpTraceAlpha <= 0
    ) {
        return;
    }

    const lastUser =
        userTrace[
            userTrace.length - 1
        ];

    const result =
        getClosestPathProgress(
            lastUser
        );

    const userProgress =
        result.progress;

    ctx.save();

    ctx.lineCap =
        "round";

    ctx.lineWidth = 8;

    const totalSegments =
        sequence.length - 1;

    for (
        let i = 0;
        i < totalSegments;
        i++
    ) {

        const segmentCenter =
            getPathProgressForPointIndex(
                i,
                sequence
            );

        let alpha;

        if (
            segmentCenter >
            userProgress
        ) {

            alpha =
                0.08 *
                helpTraceAlpha;

        } else {

            alpha =
                (
                    0.05 +
                    0.65 *
                    Math.min(
                        1,
                        segmentCenter /
                        Math.max(
                            userProgress,
                            0.0001
                        )
                    )
                ) *
                helpTraceAlpha;
        }

        alpha =
            Math.max(
                0.01,
                Math.min(
                    0.8,
                    alpha
                )
            );

        const color =
            `rgba(0, 255, 204, ${alpha})`;

        ctx.strokeStyle =
            color;

        ctx.shadowColor =
            color;

        ctx.shadowBlur =
            12 *
            helpTraceAlpha;

        ctx.beginPath();

        ctx.moveTo(
            sequence[i].x,
            sequence[i].y
        );

        ctx.lineTo(
            sequence[i + 1].x,
            sequence[i + 1].y
        );

        ctx.stroke();
    }

    ctx.restore();
}

// ============================================================
// DISTANCE POINT TO SEGMENT
// ============================================================

function distancePointToSegment(
    px,
    py,
    x1,
    y1,
    x2,
    y2
) {

    const dx =
        x2 -
        x1;

    const dy =
        y2 -
        y1;

    if (
        dx === 0 &&
        dy === 0
    ) {

        return Math.hypot(
            px - x1,
            py - y1
        );
    }

    const t =
        Math.max(
            0,
            Math.min(
                1,
                (
                    (px - x1) * dx +
                    (py - y1) * dy
                ) /
                (
                    dx * dx +
                    dy * dy
                )
            )
        );

    const closestX =
        x1 +
        t * dx;

    const closestY =
        y1 +
        t * dy;

    return Math.hypot(
        px -
            closestX,
        py -
            closestY
    );
}

// ============================================================
// CLOSEST PATH PROGRESS
// ============================================================

function getClosestPathProgress(
    point
) {

    if (
        sequence.length < 2
    ) {

        return {
            distance: Infinity,
            progress: 0
        };
    }

    let bestDistance =
        Infinity;

    let bestProgress = 0;

    const totalLength =
        getPathLength(
            sequence
        );

    let accumulatedLength = 0;

    for (
        let i = 1;
        i < sequence.length;
        i++
    ) {

        const start =
            sequence[i - 1];

        const end =
            sequence[i];

        const dx =
            end.x -
            start.x;

        const dy =
            end.y -
            start.y;

        const lengthSquared =
            dx * dx +
            dy * dy;

        let t =
            lengthSquared === 0
                ? 0
                : (
                    (point.x - start.x) *
                        dx +
                    (point.y - start.y) *
                        dy
                ) /
                lengthSquared;

        t =
            Math.max(
                0,
                Math.min(
                    1,
                    t
                )
            );

        const closestX =
            start.x +
            t * dx;

        const closestY =
            start.y +
            t * dy;

        const distance =
            Math.hypot(
                point.x -
                    closestX,
                point.y -
                    closestY
            );

        const segmentLength =
            Math.sqrt(
                lengthSquared
            );

        const progress =
            totalLength === 0
                ? 0
                : (
                    accumulatedLength +
                    segmentLength *
                    t
                ) /
                totalLength;

        if (
            distance <
            bestDistance
        ) {

            bestDistance =
                distance;

            bestProgress =
                progress;
        }

        accumulatedLength +=
            segmentLength;
    }

    return {
        distance:
            bestDistance,

        progress:
            bestProgress
    };
}

// ============================================================
// CHECKPOINT VALIDATION
// ============================================================

function validateCheckpoints() {

    const tolerance =
        getTraceTolerance(
            currentLevel
        ) *
        CONFIG.CHECKPOINT_TOLERANCE_RATIO;

    const checkpoints = [];

    for (
        let progress =
            0;
        progress <
        1;
        progress +=
            CONFIG.CHECKPOINT_SPACING
    ) {

        checkpoints.push(
            Math.min(
                1,
                progress
            )
        );
    }

    checkpoints.push(1);

    let traceIndex = 0;

    for (
        const checkpoint of checkpoints
    ) {

        let found = false;

        while (
            traceIndex <
            userTrace.length
        ) {

            const point =
                userTrace[
                    traceIndex
                ];

            const result =
                getClosestPathProgress(
                    point
                );

            if (
                result.distance <=
                tolerance &&
                result.progress >=
                checkpoint -
                    0.025
            ) {

                found = true;

                break;
            }

            traceIndex++;
        }

        if (!found) {
            return false;
        }
    }

    return true;
}

// ============================================================
// TRACE VALIDATION
// ============================================================

function validateUserTrace() {

    if (
        userTrace.length < 2 ||
        sequence.length < 2
    ) {

        return {
            success: false,
            coverage: 0,
            progress: 0,
            accuracy: 0,
            speedBonus: 0
        };
    }

    const tolerance =
        getTraceTolerance(
            currentLevel
        );

    // --------------------------------------------------------
    // START
    // --------------------------------------------------------

    const firstPoint =
        userTrace[0];

    const startPoint =
        sequence[0];

    const startDistance =
        Math.hypot(
            firstPoint.x -
                startPoint.x,

            firstPoint.y -
                startPoint.y
        );

    if (
        startDistance >
        tolerance
    ) {

        return {
            success: false,
            reason: "start",
            coverage: 0,
            progress: 0,
            accuracy: 0,
            speedBonus: 0
        };
    }

    // --------------------------------------------------------
    // ANALYZE TRACE
    // --------------------------------------------------------

    let validPoints = 0;

    let furthestProgress = 0;

    let previousProgress = 0;

    let backwardEvents = 0;

    let distanceError = 0;

    for (
        const point of userTrace
    ) {

        const result =
            getClosestPathProgress(
                point
            );

        if (
            result.distance <=
            tolerance
        ) {

            validPoints++;

            furthestProgress =
                Math.max(
                    furthestProgress,
                    result.progress
                );

            distanceError +=
                Math.min(
                    1,
                    result.distance /
                    tolerance
                );

            if (
                result.progress <
                previousProgress -
                    CONFIG.MAX_BACKWARD_MOVEMENT
            ) {

                backwardEvents++;
            }

            previousProgress =
                Math.max(
                    previousProgress,
                    result.progress
                );
        }
    }

    const coverage =
        validPoints /
        userTrace.length;

    const accuracy =
        validPoints > 0
            ? 1 -
                (
                    distanceError /
                    validPoints
                )
            : 0;

    // --------------------------------------------------------
    // END POSITION
    // --------------------------------------------------------

    const lastPoint =
        userTrace[
            userTrace.length - 1
        ];

    const endPoint =
        sequence[
            sequence.length - 1
        ];

    const endDistance =
        Math.hypot(
            lastPoint.x -
                endPoint.x,

            lastPoint.y -
                endPoint.y
        );

    // --------------------------------------------------------
    // CHECKPOINTS
    // --------------------------------------------------------

    const checkpointsValid =
        validateCheckpoints();

    // --------------------------------------------------------
    // BACKTRACKING
    // --------------------------------------------------------

    const maximumBackwardEvents =
        Math.max(
            3,
            userTrace.length *
                CONFIG.MAX_BACKWARD_EVENTS_RATIO
        );

    // --------------------------------------------------------
    // SPEED
    // --------------------------------------------------------

    const elapsed =
        timerRunning
            ? performance.now() -
              timerStart
            : timerDuration;

    const speedRatio =
        Math.max(
            0,
            Math.min(
                1,
                1 -
                    elapsed /
                    timerDuration
            )
        );

    const speedBonus =
        Math.round(
            speedRatio *
            CONFIG.SPEED_BONUS_MAX
        );

    const success =
        coverage >=
            CONFIG.MIN_PATH_COVERAGE &&

        furthestProgress >=
            getMinimumProgressRequired() &&

        endDistance <=
            tolerance &&

        backwardEvents <=
            maximumBackwardEvents &&

        checkpointsValid;

    return {

        success,

        coverage,

        progress:
            furthestProgress,

        accuracy,

        speedBonus,

        endDistance,

        backwardEvents
    };
}

// ============================================================
// MINIMUM PROGRESS
// ============================================================

function getMinimumProgressRequired() {

    /*
     * Later levels require more complete traversal.
     */

    return Math.min(
        0.96,
        CONFIG.MIN_PATH_PROGRESS +
            (
                currentLevel - 1
            ) *
            0.005
    );
}

// ============================================================
// POINTER POSITION
// ============================================================

function getPointerPosition(
    event
) {

    const rect =
        canvas.getBoundingClientRect();

    return {

        x:
            (
                event.clientX -
                rect.left
            ) *
            (
                canvas.width /
                rect.width
            ),

        y:
            (
                event.clientY -
                rect.top
            ) *
            (
                canvas.height /
                rect.height
            )
    };
}

// ============================================================
// POINTER DOWN
// ============================================================

canvas.addEventListener(
    "pointerdown",
    event => {

        if (
            gameState ===
            GAME_STATE.PAUSED
        ) {
            return;
        }

        if (
            gameState !==
            GAME_STATE.READY
        ) {
            return;
        }

        initializeAudio();

        const point =
            getPointerPosition(
                event
            );

        const startPoint =
            sequence[0];

        const tolerance =
            getTraceTolerance(
                currentLevel
            );

        const distance =
            Math.hypot(
                point.x -
                    startPoint.x,

                point.y -
                    startPoint.y
            );

        if (
            distance >
            tolerance
        ) {

            triggerShake(
                CONFIG.INVALID_START_SHAKE_STRENGTH,
                CONFIG.INVALID_START_SHAKE_DURATION
            );

            playInvalidStartSound();

            createBurstParticles(
                point.x,
                point.y,
                "#ff3333",
                12
            );

            return;
        }

        pointerId =
            event.pointerId;

        try {

            canvas.setPointerCapture(
                pointerId
            );

        } catch (error) {
            // Safe fallback.
        }

        gameState =
            GAME_STATE.TRACING;

        glowAnimating = false;

        userTrace = [
            point
        ];

        startHelpTrace();

        timerStart =
            performance.now();

        timerDuration =
            getDifficulty(
                currentLevel
            ).timer;

        timerRunning = true;

        currentTraceProgress = 0;

        maxTraceProgress = 0;

        lastTraceProgress = 0;

        traceBackwardsEvents = 0;

        traceValidPoints = 0;

        traceTotalPoints = 1;

        traceDistanceTravelled = 0;

        lastTraceParticleTime =
            performance.now();

        playTraceStartSound();

        event.preventDefault();
    }
);

// ============================================================
// POINTER MOVE
// ============================================================

canvas.addEventListener(
    "pointermove",
    event => {

        if (
            gameState !==
                GAME_STATE.TRACING ||
            event.pointerId !==
                pointerId
        ) {
            return;
        }

        const point =
            getPointerPosition(
                event
            );

        const last =
            userTrace[
                userTrace.length - 1
            ];

        if (last) {

            const distance =
                Math.hypot(
                    point.x -
                        last.x,

                    point.y -
                        last.y
                );

            if (
                distance <
                CONFIG.MIN_TRACE_POINT_DISTANCE
            ) {

                return;
            }

            traceDistanceTravelled +=
                distance;
        }

        if (
            userTrace.length >=
            CONFIG.MAX_TRACE_POINTS
        ) {

            return;
        }

        userTrace.push(
            point
        );

        traceTotalPoints++;

        const result =
            getClosestPathProgress(
                point
            );

        const tolerance =
            getTraceTolerance(
                currentLevel
            );

        if (
            result.distance <=
            tolerance
        ) {

            traceValidPoints++;

            currentTraceProgress =
                result.progress;

            if (
                result.progress <
                lastTraceProgress -
                    CONFIG.MAX_BACKWARD_MOVEMENT
            ) {

                traceBackwardsEvents++;
            }

            if (
                result.progress >
                maxTraceProgress
            ) {

                maxTraceProgress =
                    result.progress;
            }

            lastTraceProgress =
                Math.max(
                    lastTraceProgress,
                    result.progress
                );

            const now =
                performance.now();

            if (
                now -
                    lastTraceParticleTime >
                CONFIG.TRACE_PARTICLE_INTERVAL *
                    1000
            ) {

                createTraceParticle(
                    point.x,
                    point.y
                );

                lastTraceParticleTime =
                    now;
            }
        }

        event.preventDefault();
    }
);

// ============================================================
// POINTER UP
// ============================================================

canvas.addEventListener(
    "pointerup",
    event => {

        if (
            gameState !==
                GAME_STATE.TRACING ||
            event.pointerId !==
                pointerId
        ) {
            return;
        }

        finishTrace(true);

        try {

            canvas.releasePointerCapture(
                event.pointerId
            );

        } catch (error) {
            // Safe fallback.
        }

        pointerId = null;

        event.preventDefault();
    }
);

// ============================================================
// POINTER CANCEL
// ============================================================

canvas.addEventListener(
    "pointercancel",
    event => {

        if (
            gameState !==
            GAME_STATE.TRACING
        ) {
            return;
        }

        finishTrace(false);

        try {

            canvas.releasePointerCapture(
                event.pointerId
            );

        } catch (error) {
            // Safe fallback.
        }

        pointerId = null;
    }
);

// ============================================================
// TRACE COMPLETION
// ============================================================

function finishTrace(
    checkTrace = true
) {

    timerRunning = false;

    const result =
        checkTrace
            ? validateUserTrace()
            : {
                success: false,
                coverage: 0,
                progress: 0,
                accuracy: 0,
                speedBonus: 0
            };

    if (
        result.success
    ) {

        handleSuccessfulTrace(
            result
        );

    } else {

        handleFailedTrace(
            result
        );
    }
}

// ============================================================
// SUCCESS
// ============================================================

function handleSuccessfulTrace(
    result
) {

    gameState =
        GAME_STATE.SUCCESS;

    streak++;

    const multiplier =
        1 +
        (
            streak - 1
        ) *
        CONFIG.STREAK_MULTIPLIER_STEP;

    const levelScore =
        Math.round(
            (
                CONFIG.BASE_LEVEL_SCORE *
                currentLevel +
                result.speedBonus +
                (
                    result.accuracy >=
                    0.90
                        ? CONFIG.PERFECT_BONUS
                        : 0
                )
            ) *
            multiplier
        );

    score +=
        levelScore;

    saveBestStats();

    completedStreakLines.push({

        points: [
            ...sequence
        ],

        color:
            getStreakColor(
                streak
            ),

        fadeStart: null,

        fadeProgress: 0
    });

    successAnimationStart =
        performance.now();

    successAnimationProgress = 0;

    successFlash = 1;

    triggerShake(
        CONFIG.SUCCESS_SHAKE_STRENGTH +
            Math.min(
                6,
                streak
            ),
        CONFIG.SUCCESS_SHAKE_DURATION
    );

    createSuccessParticles();

    playSuccessSound(
        streak
    );

    const session =
        gameSessionId;

    setTimeout(
        () => {

            if (
                session !==
                gameSessionId
            ) {
                return;
            }

            const last =
                completedStreakLines[
                    completedStreakLines.length - 1
                ];

            if (last) {

                last.fadeStart =
                    performance.now();
            }

        },
        CONFIG.SUCCESS_FADE_DURATION
    );

    nextLevelTime =
        performance.now() +
        CONFIG.NEXT_LEVEL_DELAY;
}

// ============================================================
// FAILURE
// ============================================================

function handleFailedTrace(
    result = {}
) {

    gameState =
        GAME_STATE.FAILED;

    timerRunning = false;

    resetStreak();

    failureFlash = 1;

    triggerShake(
        CONFIG.FAILURE_SHAKE_STRENGTH,
        CONFIG.FAILURE_SHAKE_DURATION
    );

    createFailureParticles();

    playFailureSound();

    const session =
        gameSessionId;

    setTimeout(
        () => {

            if (
                session !==
                gameSessionId
            ) {
                return;
            }

            if (
                gameState ===
                GAME_STATE.FAILED
            ) {

                startCpuDemo();
            }

        },
        CONFIG.FAILURE_RECOVERY_DELAY
    );
}

// ============================================================
// SUCCESS ANIMATION
// ============================================================

function updateSuccessAnimation(
    now
) {

    const elapsed =
        now -
        successAnimationStart;

    successAnimationProgress =
        Math.min(
            elapsed /
                CONFIG.SHIMMER_DURATION,
            1
        );
}

// ============================================================
// SUCCESS STATE
// ============================================================

function drawSuccessState() {

    const color =
        getStreakColor(
            streak
        );

    drawPartialPath(
        sequence,
        1,
        "rgba(0, 255, 204, 0.25)",
        8,
        10
    );

    drawPartialPath(
        sequence,
        1,
        color,
        10,
        20
    );

    drawShimmerAt(
        successAnimationProgress
    );

    if (
        successAnimationProgress >= 1
    ) {

        ctx.save();

        ctx.textAlign =
            "center";

        ctx.font =
            "40px 'Segoe UI', Arial, sans-serif";

        ctx.fillStyle =
            "#00ffcc";

        ctx.shadowColor =
            "#00ffcc";

        ctx.shadowBlur = 15;

        ctx.fillText(
            currentLevel >=
                CONFIG.MAX_LEVEL
                ? "YOU WIN!"
                : "NEXT LEVEL...",
            canvas.width / 2,
            canvas.height / 2
        );

        ctx.font =
            "20px 'Segoe UI', Arial, sans-serif";

        ctx.fillStyle =
            "rgba(255,255,255,0.75)";

        ctx.shadowBlur = 0;

        ctx.fillText(
            `Score: ${score}`,
            canvas.width / 2,
            canvas.height / 2 + 40
        );

        ctx.restore();
    }
}

// ============================================================
// SHIMMER
// ============================================================

function drawShimmerAt(
    progress
) {

    const point =
        getPointAlongPath(
            progress
        );

    const radius = 30;

    const gradient =
        ctx.createRadialGradient(
            point.x,
            point.y,
            radius / 4,
            point.x,
            point.y,
            radius
        );

    gradient.addColorStop(
        0,
        "rgba(255,255,255,1)"
    );

    gradient.addColorStop(
        0.25,
        "rgba(0,255,255,0.9)"
    );

    gradient.addColorStop(
        1,
        "rgba(255,255,255,0)"
    );

    ctx.save();

    ctx.fillStyle =
        gradient;

    ctx.beginPath();

    ctx.arc(
        point.x,
        point.y,
        radius,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.restore();
}

// ============================================================
// TIMER
// ============================================================

function updateTimer(
    now
) {

    if (
        !timerRunning
    ) {
        return;
    }

    const elapsed =
        now -
        timerStart;

    if (
        elapsed >=
        timerDuration
    ) {

        timerRunning = false;

        handleTimerEnd();
    }
}

// ============================================================
// TIMER PROGRESS
// ============================================================

function getTimerProgress() {

    if (
        !timerRunning
    ) {
        return 0;
    }

    const elapsed =
        performance.now() -
        timerStart;

    return Math.max(
        0,
        Math.min(
            1,
            1 -
                elapsed /
                timerDuration
        )
    );
}

// ============================================================
// TIMER HUD
// ============================================================

function drawTimerHUD() {

    if (
        gameState !==
            GAME_STATE.TRACING ||
        !timerRunning
    ) {
        return;
    }

    const remaining =
        getTimerProgress();

    const margin =
        22;

    const barWidth =
        Math.min(
            360,
            canvas.width *
                0.38
        );

    const barHeight = 10;

    const x =
        canvas.width / 2 -
        barWidth / 2;

    const y =
        24;

    let color =
        "#00ffcc";

    if (
        remaining <= 0.33
    ) {

        color =
            "#ff3333";

    } else if (
        remaining <= 0.66
    ) {

        color =
            "#ffd700";
    }

    ctx.save();

    // Background

    ctx.fillStyle =
        "rgba(255,255,255,0.10)";

    ctx.beginPath();

    ctx.roundRect(
        x,
        y,
        barWidth,
        barHeight,
        5
    );

    ctx.fill();

    // Progress

    ctx.fillStyle =
        color;

    ctx.shadowColor =
        color;

    ctx.shadowBlur = 15;

    ctx.beginPath();

    ctx.roundRect(
        x,
        y,
        barWidth *
            remaining,
        barHeight,
        5
    );

    ctx.fill();

    // Timer text

    ctx.shadowBlur = 0;

    ctx.textAlign =
        "center";

    ctx.font =
        "16px 'Segoe UI', Arial, sans-serif";

    ctx.fillStyle =
        "#ffffff";

    ctx.fillText(
        `${(
            remaining *
            timerDuration /
            1000
        ).toFixed(1)}s`,
        canvas.width / 2,
        y + 30
    );

    ctx.restore();
}

// ============================================================
// TRACE PROGRESS HUD
// ============================================================

function drawTraceProgress() {

    const progress =
        Math.max(
            0,
            Math.min(
                1,
                maxTraceProgress
            )
        );

    ctx.save();

    const width =
        Math.min(
            220,
            canvas.width *
                0.25
        );

    const height = 5;

    const x =
        canvas.width -
        width -
        20;

    const y = 24;

    ctx.fillStyle =
        "rgba(255,255,255,0.12)";

    ctx.fillRect(
        x,
        y,
        width,
        height
    );

    ctx.fillStyle =
        "#00ffcc";

    ctx.shadowColor =
        "#00ffcc";

    ctx.shadowBlur = 8;

    ctx.fillRect(
        x,
        y,
        width *
            progress,
        height
    );

    ctx.restore();
}

// ============================================================
// TIMER FAILURE
// ============================================================

function handleTimerEnd() {

    gameState =
        GAME_STATE.FAILED;

    resetStreak();

    failureFlash = 1;

    triggerShake(
        14,
        350
    );

    createFailureParticles();

    playFailureSound();

    const session =
        gameSessionId;

    setTimeout(
        () => {

            if (
                session !==
                gameSessionId
            ) {
                return;
            }

            if (
                gameState ===
                GAME_STATE.FAILED
            ) {

                startCpuDemo();
            }

        },
        CONFIG.FAILURE_RECOVERY_DELAY
    );
}

// ============================================================
// STREAK LINES
// ============================================================

function updateStreakFades(
    now
) {

    completedStreakLines =
        completedStreakLines.filter(
            line => {

                if (
                    line.fadeStart ===
                    null
                ) {

                    return true;
                }

                const elapsed =
                    now -
                    line.fadeStart;

                line.fadeProgress =
                    Math.min(
                        elapsed /
                            CONFIG.STREAK_LINE_FADE_DURATION,
                        1
                    );

                return (
                    line.fadeProgress <
                    1
                );
            }
        );
}

// ============================================================
// DRAW STREAK LINES
// ============================================================

function drawStreakLines() {

    completedStreakLines.forEach(
        line => {

            const fadeProgress =
                line.fadeStart ===
                null
                    ? 0
                    : line.fadeProgress;

            const alpha =
                1 -
                fadeProgress;

            const shrinkFactor =
                1 -
                fadeProgress *
                0.7;

            const color =
                dimColor(
                    line.color,
                    0.4,
                    alpha
                );

            ctx.save();

            ctx.translate(
                canvas.width / 2,
                canvas.height / 2
            );

            ctx.scale(
                shrinkFactor,
                shrinkFactor
            );

            ctx.translate(
                -canvas.width / 2,
                -canvas.height / 2
            );

            drawPartialPath(
                line.points,
                1,
                color,
                4,
                8
            );

            ctx.restore();
        }
    );
}

// ============================================================
// PARTICLE CREATION
// ============================================================

function createParticle(
    x,
    y,
    color,
    options = {}
) {

    if (
        particles.length >=
        CONFIG.MAX_PARTICLES
    ) {

        particles.shift();
    }

    particles.push({

        x,

        y,

        vx:
            options.vx ??
            (
                Math.random() -
                0.5
            ) *
            120,

        vy:
            options.vy ??
            (
                Math.random() -
                0.5
            ) *
            120,

        life:
            options.life ??
            0.6,

        maxLife:
            options.life ??
            0.6,

        size:
            options.size ??
            (
                2 +
                Math.random() *
                4
            ),

        color,

        gravity:
            options.gravity ??
            0,

        drag:
            options.drag ??
            0.96
    });
}

// ============================================================
// TRACE PARTICLE
// ============================================================

function createTraceParticle(
    x,
    y
) {

    createParticle(
        x,
        y,
        getStreakColor(
            streak
        ),
        {
            vx:
                (
                    Math.random() -
                    0.5
                ) *
                20,

            vy:
                (
                    Math.random() -
                    0.5
                ) *
                20,

            life: 0.25,

            size:
                2 +
                Math.random() *
                2
        }
    );
}

// ============================================================
// BURST PARTICLES
// ============================================================

function createBurstParticles(
    x,
    y,
    color,
    count
) {

    for (
        let i = 0;
        i < count;
        i++
    ) {

        const angle =
            Math.random() *
            Math.PI *
            2;

        const speed =
            40 +
            Math.random() *
            180;

        createParticle(
            x,
            y,
            color,
            {
                vx:
                    Math.cos(angle) *
                    speed,

                vy:
                    Math.sin(angle) *
                    speed,

                life:
                    0.4 +
                    Math.random() *
                    0.5,

                size:
                    2 +
                    Math.random() *
                    5,

                drag: 0.94
            }
        );
    }
}

// ============================================================
// SUCCESS PARTICLES
// ============================================================

function createSuccessParticles() {

    if (
        sequence.length === 0
    ) {
        return;
    }

    const end =
        sequence[
            sequence.length - 1
        ];

    createBurstParticles(
        end.x,
        end.y,
        getStreakColor(
            streak
        ),
        CONFIG.SUCCESS_PARTICLE_COUNT
    );
}

// ============================================================
// FAILURE PARTICLES
// ============================================================

function createFailureParticles() {

    const point =
        userTrace.length > 0
            ? userTrace[
                userTrace.length - 1
            ]
            : {
                x:
                    canvas.width / 2,

                y:
                    canvas.height / 2
            };

    createBurstParticles(
        point.x,
        point.y,
        "#ff3333",
        CONFIG.FAILURE_PARTICLE_COUNT
    );
}

// ============================================================
// COMPLETION PARTICLES
// ============================================================

function createCompletionParticles() {

    createBurstParticles(
        canvas.width / 2,
        canvas.height / 2,
        "#ff00ff",
        120
    );
}

// ============================================================
// PARTICLE UPDATE
// ============================================================

function updateParticles(
    deltaTime
) {

    particles =
        particles.filter(
            particle => {

                particle.life -=
                    deltaTime;

                if (
                    particle.life <= 0
                ) {
                    return false;
                }

                particle.vx *=
                    Math.pow(
                        particle.drag,
                        deltaTime * 60
                    );

                particle.vy *=
                    Math.pow(
                        particle.drag,
                        deltaTime * 60
                    );

                particle.vy +=
                    particle.gravity *
                    deltaTime;

                particle.x +=
                    particle.vx *
                    deltaTime;

                particle.y +=
                    particle.vy *
                    deltaTime;

                return true;
            }
        );
}

// ============================================================
// DRAW PARTICLES
// ============================================================

function drawParticles() {

    if (
        particles.length === 0
    ) {
        return;
    }

    ctx.save();

    particles.forEach(
        particle => {

            const alpha =
                Math.max(
                    0,
                    particle.life /
                    particle.maxLife
                );

            ctx.globalAlpha =
                alpha;

            ctx.fillStyle =
                particle.color;

            ctx.shadowColor =
                particle.color;

            ctx.shadowBlur = 10;

            ctx.beginPath();

            ctx.arc(
                particle.x,
                particle.y,
                particle.size,
                0,
                Math.PI * 2
            );

            ctx.fill();
        }
    );

    ctx.restore();
}

// ============================================================
// AMBIENT PARTICLES
// ============================================================

function drawAmbientParticles() {

    const count = 28;

    ctx.save();

    ctx.globalAlpha = 0.25;

    for (
        let i = 0;
        i < count;
        i++
    ) {

        const x =
            (
                i * 137.31 +
                performance.now() *
                0.01
            ) %
            canvas.width;

        const y =
            (
                i * 73.17 +
                performance.now() *
                0.006
            ) %
            canvas.height;

        const radius =
            1 +
            (
                i % 3
            );

        ctx.fillStyle =
            "#00ffff";

        ctx.beginPath();

        ctx.arc(
            x,
            y,
            radius,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }

    ctx.restore();
}

// ============================================================
// SHAKE
// ============================================================

function triggerShake(
    strength = 12,
    duration = 300
) {

    shakeStrength =
        strength;

    shakeDuration =
        duration;

    shakeTime =
        duration;
}

// ============================================================
// UPDATE SHAKE
// ============================================================

function updateShake(
    deltaTime
) {

    if (
        shakeTime <= 0
    ) {

        shakeTime = 0;

        return;
    }

    shakeTime -=
        deltaTime *
        1000;

    if (
        shakeTime < 0
    ) {

        shakeTime = 0;
    }
}

// ============================================================
// SHAKE OFFSET
// ============================================================

function getShakeOffset() {

    if (
        shakeTime <= 0
    ) {

        return {
            x: 0,
            y: 0
        };
    }

    const intensity =
        shakeDuration > 0
            ? shakeTime /
              shakeDuration
            : 1;

    return {

        x:
            (
                Math.random() -
                0.5
            ) *
            shakeStrength *
            intensity,

        y:
            (
                Math.random() -
                0.5
            ) *
            shakeStrength *
            intensity
    };
}

// ============================================================
// FAILURE FLASH
// ============================================================

function updateFailureFlash(
    deltaTime
) {

    if (
        failureFlash <= 0
    ) {
        return;
    }

    failureFlash -=
        deltaTime *
        3.5;

    failureFlash =
        Math.max(
            0,
            failureFlash
        );
}

// ============================================================
// DRAW FAILURE FLASH
// ============================================================

function drawFailureFlash() {

    if (
        failureFlash <= 0
    ) {
        return;
    }

    ctx.save();

    ctx.fillStyle =
        `rgba(255, 0, 0, ${
            failureFlash *
            0.5
        })`;

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.restore();
}

// ============================================================
// SUCCESS FLASH
// ============================================================

function updateSuccessFlash(
    deltaTime
) {

    if (
        successFlash <= 0
    ) {
        return;
    }

    successFlash -=
        deltaTime *
        3;

    successFlash =
        Math.max(
            0,
            successFlash
        );
}

// ============================================================
// DRAW SUCCESS FLASH
// ============================================================

function drawSuccessFlash() {

    if (
        successFlash <= 0
    ) {
        return;
    }

    ctx.save();

    ctx.fillStyle =
        `rgba(0,255,204,${
            successFlash *
            0.15
        })`;

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.restore();
}

// ============================================================
// UI
// ============================================================

function drawUI() {

    const fontSize =
        CONFIG.HUD_FONT;

    ctx.save();

    ctx.font =
        `${fontSize}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;

    ctx.fillStyle =
        "#00ffcc";

    ctx.shadowColor =
        "#00ffcc";

    ctx.shadowBlur = 10;

    ctx.fillText(
        `LEVEL ${currentLevel}/${CONFIG.MAX_LEVEL}`,
        CONFIG.UI_MARGIN,
        fontSize +
            CONFIG.UI_MARGIN
    );

    ctx.font =
        "23px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

    const streakColor =
        getStreakColor(
            streak
        );

    ctx.fillStyle =
        streakColor;

    ctx.shadowColor =
        streakColor;

    ctx.shadowBlur = 8;

    ctx.fillText(
        `🔥 Streak: ${streak}`,
        CONFIG.UI_MARGIN,
        fontSize +
            42
    );

    ctx.font =
        "18px 'Segoe UI', Arial, sans-serif";

    ctx.fillStyle =
        "rgba(255,255,255,0.75)";

    ctx.shadowBlur = 0;

    ctx.fillText(
        `Score: ${score}`,
        CONFIG.UI_MARGIN,
        fontSize +
            68
    );

    // --------------------------------------------------------
    // BEST SCORE
    // --------------------------------------------------------

    ctx.textAlign =
        "right";

    ctx.fillText(
        `Best: ${bestScore}`,
        canvas.width -
            CONFIG.UI_MARGIN,
        fontSize +
            CONFIG.UI_MARGIN
    );

    // --------------------------------------------------------
    // READY MESSAGE
    // --------------------------------------------------------

    if (
        gameState ===
        GAME_STATE.READY
    ) {

        drawReadyText();
    }

    // --------------------------------------------------------
    // CONTROLS
    // --------------------------------------------------------

    if (
        gameState ===
            GAME_STATE.READY ||
        gameState ===
            GAME_STATE.DEMO
    ) {

        ctx.textAlign =
            "right";

        ctx.font =
            "14px 'Segoe UI', Arial, sans-serif";

        ctx.fillStyle =
            "rgba(255,255,255,0.40)";

        ctx.fillText(
            "P / ESC = Pause   •   R = Restart",
            canvas.width -
                CONFIG.UI_MARGIN,
            canvas.height -
                CONFIG.UI_MARGIN
        );
    }

    ctx.restore();
}

// ============================================================
// READY TEXT
// ============================================================

function drawReadyText() {

    ctx.save();

    ctx.textAlign =
        "center";

    ctx.font =
        "20px 'Segoe UI', Arial, sans-serif";

    ctx.fillStyle =
        "rgba(255,255,255,0.70)";

    ctx.shadowColor =
        "#00ffcc";

    ctx.shadowBlur = 8;

    ctx.fillText(
        "TRACE THE PATTERN",
        canvas.width / 2,
        canvas.height - 42
    );

    ctx.restore();
}

// ============================================================
// FAILURE STATE
// ============================================================

function drawFailureState() {

    drawPartialPath(
        sequence,
        1,
        "rgba(255,60,60,0.30)",
        8,
        12
    );

    ctx.save();

    ctx.textAlign =
        "center";

    ctx.font =
        "30px 'Segoe UI', Arial, sans-serif";

    ctx.fillStyle =
        "#ff4444";

    ctx.shadowColor =
        "#ff0000";

    ctx.shadowBlur = 18;

    ctx.fillText(
        "TRACE FAILED",
        canvas.width / 2,
        canvas.height / 2
    );

    ctx.restore();
}

// ============================================================
// PAUSE
// ============================================================

function togglePause() {

    if (
        gameState ===
        GAME_STATE.PAUSED
    ) {

        resumeGame();

        return;
    }

    if (
        gameState ===
            GAME_STATE.TRACING ||
        gameState ===
            GAME_STATE.READY ||
        gameState ===
            GAME_STATE.DEMO
    ) {

        pauseGame();
    }
}

// ============================================================
// PAUSE GAME
// ============================================================

function pauseGame() {

    stateBeforePause =
        gameState;

    if (
        gameState ===
        GAME_STATE.TRACING
    ) {

        pausedRemainingTime =
            Math.max(
                0,
                timerDuration -
                    (
                        performance.now() -
                        timerStart
                    )
            );

        timerRunning = false;
    }

    gameState =
        GAME_STATE.PAUSED;

    playPauseSound();
}

// ============================================================
// RESUME GAME
// ============================================================

function resumeGame() {

    gameState =
        stateBeforePause;

    if (
        gameState ===
        GAME_STATE.TRACING
    ) {

        timerStart =
            performance.now() -
            (
                timerDuration -
                pausedRemainingTime
            );

        timerRunning = true;
    }

    playPauseSound();
}

// ============================================================
// PAUSED SCREEN
// ============================================================

function drawPausedState() {

    drawPartialPath(
        sequence,
        1,
        "rgba(0,255,204,0.18)",
        8,
        8
    );

    ctx.save();

    ctx.fillStyle =
        "rgba(0,0,0,0.55)";

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.textAlign =
        "center";

    ctx.font =
        "64px 'Segoe UI', Arial, sans-serif";

    ctx.fillStyle =
        "#00ffcc";

    ctx.shadowColor =
        "#00ffcc";

    ctx.shadowBlur = 25;

    ctx.fillText(
        "PAUSED",
        canvas.width / 2,
        canvas.height / 2
    );

    ctx.font =
        "20px 'Segoe UI', Arial, sans-serif";

    ctx.fillStyle =
        "rgba(255,255,255,0.75)";

    ctx.shadowBlur = 0;

    ctx.fillText(
        "Press P or ESC to resume",
        canvas.width / 2,
        canvas.height / 2 + 50
    );

    ctx.restore();
}

// ============================================================
// COMPLETE GAME
// ============================================================

function drawCompleteGame() {

    const pulse =
        0.75 +
        Math.sin(
            performance.now() *
            0.004
        ) *
        0.25;

    ctx.save();

    ctx.textAlign =
        "center";

    ctx.font =
        "64px 'Segoe UI', Arial, sans-serif";

    ctx.fillStyle =
        `rgba(255,0,255,${pulse})`;

    ctx.shadowColor =
        "#ff00ff";

    ctx.shadowBlur = 30;

    ctx.fillText(
        "YOU WIN!",
        canvas.width / 2,
        canvas.height / 2 -
            50
    );

    ctx.font =
        "30px 'Segoe UI', Arial, sans-serif";

    ctx.fillStyle =
        "#00ffcc";

    ctx.shadowColor =
        "#00ffcc";

    ctx.shadowBlur = 12;

    ctx.fillText(
        `Score: ${score}`,
        canvas.width / 2,
        canvas.height / 2 +
            5
    );

    ctx.font =
        "24px 'Segoe UI', Arial, sans-serif";

    ctx.fillText(
        `Final Streak: ${streak}`,
        canvas.width / 2,
        canvas.height / 2 +
            45
    );

    ctx.font =
        "18px 'Segoe UI', Arial, sans-serif";

    ctx.fillStyle =
        "rgba(255,255,255,0.65)";

    ctx.shadowBlur = 0;

    ctx.fillText(
        `Best Score: ${bestScore}`,
        canvas.width / 2,
        canvas.height / 2 +
            80
    );

    ctx.fillText(
        "Press R to play again",
        canvas.width / 2,
        canvas.height / 2 +
            120
    );

    ctx.restore();
}

// ============================================================
// RESET STREAK
// ============================================================

function resetStreak() {

    streak = 0;

    completedStreakLines = [];
}

// ============================================================
// STORAGE
// ============================================================

function loadBestStats() {

    try {

        bestScore =
            Number(
                localStorage.getItem(
                    CONFIG.STORAGE_KEY
                )
            ) || 0;

        bestStreak =
            Number(
                localStorage.getItem(
                    CONFIG.STORAGE_STREAK_KEY
                )
            ) || 0;

    } catch (error) {

        bestScore = 0;

        bestStreak = 0;
    }
}

// ============================================================
// SAVE BEST STATS
// ============================================================

function saveBestStats() {

    if (
        score >
        bestScore
    ) {

        bestScore =
            score;
    }

    if (
        streak >
        bestStreak
    ) {

        bestStreak =
            streak;
    }

    try {

        localStorage.setItem(
            CONFIG.STORAGE_KEY,
            String(bestScore)
        );

        localStorage.setItem(
            CONFIG.STORAGE_STREAK_KEY,
            String(bestStreak)
        );

    } catch (error) {

        // Storage may be unavailable.
    }
}

// ============================================================
// RESTART GAME
// ============================================================

function restartGame() {

    gameSessionId++;

    currentLevel = 1;

    streak = 0;

    score = 0;

    userTrace = [];

    completedStreakLines = [];

    particles = [];

    timerRunning = false;

    pointerId = null;

    failureFlash = 0;

    successFlash = 0;

    shakeTime = 0;

    nextLevelTime = 0;

    currentTraceProgress = 0;

    maxTraceProgress = 0;

    traceBackwardsEvents = 0;

    traceValidPoints = 0;

    traceTotalPoints = 0;

    traceDistanceTravelled = 0;

    generateAllLevels();

    sequence =
        levels[0];

    startCpuDemo();

    initializeAudio();
}

// ============================================================
// KEYBOARD CONTROLS
// ============================================================

window.addEventListener(
    "keydown",
    event => {

        const key =
            event.key.toLowerCase();

        if (
            key === "p" ||
            key === "escape"
        ) {

            event.preventDefault();

            togglePause();

            return;
        }

        if (
            key === "r"
        ) {

            event.preventDefault();

            restartGame();

            return;
        }
    }
);

// ============================================================
// AUDIO INITIALIZATION
// ============================================================

function initializeAudio() {

    if (
        audioReady
    ) {
        return;
    }

    try {

        const AudioContext =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContext) {
            return;
        }

        audioContext =
            new AudioContext();

        audioReady = true;

        if (
            audioContext.state ===
            "suspended"
        ) {

            audioContext.resume();
        }

    } catch (error) {

        audioReady = false;
    }
}

// ============================================================
// AUDIO TONE
// ============================================================

function playTone(
    frequency,
    duration,
    type = "sine",
    volume = 0.04,
    delay = 0
) {

    if (
        !audioReady ||
        !audioContext
    ) {
        return;
    }

    try {

        const start =
            audioContext.currentTime +
            delay;

        const oscillator =
            audioContext.createOscillator();

        const gain =
            audioContext.createGain();

        oscillator.type =
            type;

        oscillator.frequency.setValueAtTime(
            frequency,
            start
        );

        gain.gain.setValueAtTime(
            0.0001,
            start
        );

        gain.gain.exponentialRampToValueAtTime(
            volume,
            start + 0.01
        );

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            start + duration
        );

        oscillator.connect(
            gain
        );

        gain.connect(
            audioContext.destination
        );

        oscillator.start(
            start
        );

        oscillator.stop(
            start +
            duration +
            0.03
        );

    } catch (error) {

        // Audio failure should never break gameplay.
    }
}

// ============================================================
// AUDIO EVENTS
// ============================================================

function playDemoSound() {

    playTone(
        180,
        0.08,
        "sine",
        0.025
    );
}

function playReadySound() {

    playTone(
        420,
        0.12,
        "sine",
        0.035
    );

    playTone(
        620,
        0.16,
        "sine",
        0.035,
        0.08
    );
}

function playTraceStartSound() {

    playTone(
        320,
        0.08,
        "triangle",
        0.025
    );
}

function playInvalidStartSound() {

    playTone(
        110,
        0.14,
        "sawtooth",
        0.035
    );
}

function playSuccessSound(
    streakValue
) {

    const base =
        420 +
        Math.min(
            10,
            streakValue
        ) *
        20;

    playTone(
        base,
        0.10,
        "triangle",
        0.04
    );

    playTone(
        base * 1.25,
        0.12,
        "triangle",
        0.04,
        0.08
    );

    if (
        streakValue >= 3
    ) {

        playTone(
            base * 1.5,
            0.18,
            "sine",
            0.045,
            0.16
        );
    }

    if (
        streakValue >= 10
    ) {

        playTone(
            base * 2,
            0.30,
            "sine",
            0.055,
            0.25
        );
    }
}

function playFailureSound() {

    playTone(
        180,
        0.18,
        "sawtooth",
        0.04
    );

    playTone(
        110,
        0.25,
        "sawtooth",
        0.035,
        0.08
    );
}

function playCompleteSound() {

    playTone(
        523,
        0.14,
        "sine",
        0.045
    );

    playTone(
        659,
        0.14,
        "sine",
        0.045,
        0.10
    );

    playTone(
        784,
        0.20,
        "sine",
        0.05,
        0.20
    );

    playTone(
        1046,
        0.35,
        "sine",
        0.055,
        0.32
    );
}

function playPauseSound() {

    playTone(
        260,
        0.08,
        "triangle",
        0.025
    );
}

// ============================================================
// INITIALIZATION
// ============================================================

function init() {

    loadBestStats();

    currentLevel = 1;

    streak = 0;

    score = 0;

    userTrace = [];

    completedStreakLines = [];

    particles = [];

    timerRunning = false;

    pointerId = null;

    failureFlash = 0;

    successFlash = 0;

    shakeTime = 0;

    nextLevelTime = 0;

    currentTraceProgress = 0;

    maxTraceProgress = 0;

    traceBackwardsEvents = 0;

    traceValidPoints = 0;

    traceTotalPoints = 0;

    traceDistanceTravelled = 0;

    gameSessionId++;

    generateAllLevels();

    sequence =
        levels[0] || [];

    gameState =
        GAME_STATE.DEMO;

    startCpuDemo();
}

// ============================================================
// START
// ============================================================

resize();

init();

requestAnimationFrame(
    gameLoop
);