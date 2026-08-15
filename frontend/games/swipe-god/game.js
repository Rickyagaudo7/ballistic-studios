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
    // --------------------------------------------------------
    // GAME
    // --------------------------------------------------------

    MAX_LEVEL: 10,

    // Approximate pixels used for each path segment.
    SEGMENT_LENGTH_PX: 288,

    // How far the player's pointer can be from the path.
    TRACE_TOLERANCE: 110,

    // Total time allowed to complete a trace.
    TIMER_DURATION: 3000,

    // --------------------------------------------------------
    // VISUAL EFFECTS
    // --------------------------------------------------------

    HELP_TRACE_FADE_DURATION: 2500,
    STREAK_LINE_FADE_DURATION: 1500,

    CPU_ANIMATION_DURATION: 4000,

    // Progress per second.
    GLOW_SPEED: 0.35,

    SHIMMER_DURATION: 1200,
    SUCCESS_FADE_DURATION: 500,
    NEXT_LEVEL_DELAY: 1500,

    // --------------------------------------------------------
    // PLAYER TRACE
    // --------------------------------------------------------

    MIN_TRACE_POINT_DISTANCE: 4,

    // --------------------------------------------------------
    // PATH GENERATION
    // --------------------------------------------------------

    MAX_TURN: Math.PI / 4,
    PATH_RADIUS_RATIO: 1 / 3,

    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    MIN_PATH_COVERAGE: 0.70,
    MIN_PATH_PROGRESS: 0.90,
    MAX_BACKWARD_MOVEMENT: 0.20,
    MAX_BACKWARD_EVENTS_RATIO: 0.08,

    // --------------------------------------------------------
    // GAME FEEL
    // --------------------------------------------------------

    FAILURE_RECOVERY_DELAY: 700,
    INVALID_START_SHAKE_STRENGTH: 5,
    INVALID_START_SHAKE_DURATION: 120,

    FAILURE_SHAKE_STRENGTH: 12,
    FAILURE_SHAKE_DURATION: 350,

    SUCCESS_SHAKE_STRENGTH: 4,
    SUCCESS_SHAKE_DURATION: 180,

    // --------------------------------------------------------
    // UI
    // --------------------------------------------------------

    UI_MARGIN: 20
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
    COMPLETE: "complete"
};

let gameState = GAME_STATE.DEMO;

// ============================================================
// GAME DATA
// ============================================================

let currentLevel = 1;
let streak = 0;

let fullSequence = [];
let sequence = [];

let userTrace = [];

let completedStreakLines = [];

let pointerId = null;

// ============================================================
// TIMERS / ANIMATION STATE
// ============================================================

let timerStart = 0;
let timerRunning = false;

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

let shakeTime = 0;
let shakeDuration = 0;
let shakeStrength = 0;

let lastFrameTime = performance.now();

// Used to prevent delayed timers from affecting a newer game state.
let gameSessionId = 0;

// ============================================================
// CANVAS / RESIZE
// ============================================================

function resize() {
    const oldWidth = canvas.width;
    const oldHeight = canvas.height;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    /*
     * If the game has already started, regenerate the path
     * so that it remains centered on the new canvas.
     *
     * We intentionally do not interrupt the COMPLETE screen.
     */
    if (
        oldWidth > 0 &&
        oldHeight > 0 &&
        fullSequence.length > 0 &&
        gameState !== GAME_STATE.COMPLETE
    ) {
        regenerateCurrentSequence();
    }
}

window.addEventListener("resize", resize);

// ============================================================
// GAME LOOP
// ============================================================

function gameLoop(now) {
    const deltaTime = Math.min(
        (now - lastFrameTime) / 1000,
        0.1
    );

    lastFrameTime = now;

    update(deltaTime, now);
    render(now);

    requestAnimationFrame(gameLoop);
}

// ============================================================
// UPDATE
// ============================================================

function update(deltaTime, now) {
    updateShake(deltaTime);
    updateFailureFlash(deltaTime);
    updateStreakFades(now);

    if (gameState === GAME_STATE.DEMO) {
        updateCpuAnimation(now);
    }

    if (gameState === GAME_STATE.READY) {
        updateGlow(deltaTime);
    }

    if (gameState === GAME_STATE.TRACING) {
        updateTimer(now);
        updateHelpTrace(now);
    }

    if (gameState === GAME_STATE.SUCCESS) {
        updateSuccessAnimation(now);
    }

    // --------------------------------------------------------
    // MOVE TO NEXT LEVEL
    // --------------------------------------------------------

    if (
        gameState === GAME_STATE.SUCCESS &&
        nextLevelTime > 0 &&
        now >= nextLevelTime
    ) {
        nextLevelTime = 0;

        if (currentLevel >= CONFIG.MAX_LEVEL) {
            gameState = GAME_STATE.COMPLETE;
            timerRunning = false;
        } else {
            currentLevel++;

            sequence = fullSequence.slice(
                0,
                currentLevel + 1
            );

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

    const shake = getShakeOffset();

    ctx.save();

    ctx.translate(
        shake.x,
        shake.y
    );

    drawBackground();
    drawStreakLines();

    // --------------------------------------------------------
    // GAME STATE VISUALS
    // --------------------------------------------------------

    if (gameState === GAME_STATE.DEMO) {
        drawCpuSequence();
    }

    if (gameState === GAME_STATE.READY) {
        drawReadySequence();
    }

    if (gameState === GAME_STATE.TRACING) {
        drawFadingHelpTrace();
        drawUserTrace();
        drawTimerRing();
    }

    if (gameState === GAME_STATE.SUCCESS) {
        drawSuccessState();
    }

    if (gameState === GAME_STATE.FAILED) {
        drawFailureState();
    }

    if (gameState === GAME_STATE.COMPLETE) {
        drawCompleteGame();
    }

    drawUI();
    drawFailureFlash();

    ctx.restore();
}

// ============================================================
// BACKGROUND
// ============================================================

function drawBackground() {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const size = Math.min(
        canvas.width,
        canvas.height
    );

    const innerRadius = size / 10;
    const outerRadius = size / 2;

    const gradient = ctx.createRadialGradient(
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
        1,
        "#000811"
    );

    ctx.fillStyle = gradient;

    ctx.fillRect(
        0,
        0,
        canvas.width,
        canvas.height
    );
}

// ============================================================
// PATH GENERATION
// ============================================================

function generateSequence(level) {
    const points = [];

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const maxRadius =
        Math.min(
            canvas.width,
            canvas.height
        ) * CONFIG.PATH_RADIUS_RATIO;

    // Start exactly in the center.
    points.push({
        x: centerX,
        y: centerY
    });

    let angle =
        Math.random() *
        Math.PI *
        2;

    for (let i = 1; i <= level; i++) {
        const last =
            points[points.length - 1];

        const angleChange =
            (Math.random() * 2 - 1) *
            CONFIG.MAX_TURN;

        angle += angleChange;

        let newX =
            last.x +
            Math.cos(angle) *
            CONFIG.SEGMENT_LENGTH_PX;

        let newY =
            last.y +
            Math.sin(angle) *
            CONFIG.SEGMENT_LENGTH_PX;

        const distanceFromCenter =
            Math.hypot(
                newX - centerX,
                newY - centerY
            );

        // ----------------------------------------------------
        // Keep the path inside the playable radius.
        // ----------------------------------------------------

        if (
            distanceFromCenter >
            maxRadius
        ) {
            const angleToCenter =
                Math.atan2(
                    centerY - last.y,
                    centerX - last.x
                );

            angle = lerpAngle(
                angle,
                angleToCenter,
                0.7
            );

            newX =
                last.x +
                Math.cos(angle) *
                CONFIG.SEGMENT_LENGTH_PX;

            newY =
                last.y +
                Math.sin(angle) *
                CONFIG.SEGMENT_LENGTH_PX;

            const newDistance =
                Math.hypot(
                    newX - centerX,
                    newY - centerY
                );

            // Final safety clamp.
            if (
                newDistance >
                maxRadius
            ) {
                const scale =
                    maxRadius /
                    newDistance;

                newX =
                    centerX +
                    (newX - centerX) *
                    scale;

                newY =
                    centerY +
                    (newY - centerY) *
                    scale;
            }
        }

        points.push({
            x: newX,
            y: newY
        });
    }

    return points;
}

// ============================================================
// REGENERATE PATH
// ============================================================

function regenerateCurrentSequence() {
    if (fullSequence.length === 0) {
        return;
    }

    fullSequence =
        generateSequence(
            CONFIG.MAX_LEVEL
        );

    sequence =
        fullSequence.slice(
            0,
            currentLevel + 1
        );

    userTrace = [];

    timerRunning = false;

    glowAnimating = false;
    glowProgress = 0;

    helpTraceStart = 0;
    helpTraceAlpha = 1;

    /*
     * If the player was actively playing when the window
     * changed size, restart the demonstration rather than
     * leaving them with a broken path.
     */
    if (
        gameState !== GAME_STATE.COMPLETE
    ) {
        startCpuDemo();
    }
}

// ============================================================
// ANGLE INTERPOLATION
// ============================================================

function lerpAngle(a, b, t) {
    const difference =
        Math.atan2(
            Math.sin(b - a),
            Math.cos(b - a)
        );

    return a + difference * t;
}

// ============================================================
// COLORS
// ============================================================

function getStreakColor(streakValue) {
    if (streakValue >= 10) {
        return "rgba(255, 0, 255, 0.9)";
    }

    if (streakValue >= 6) {
        return "rgba(255, 215, 0, 0.9)";
    }

    if (streakValue >= 3) {
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

    let r = Number(match[1]);
    let g = Number(match[2]);
    let b = Number(match[3]);

    let a =
        match[4] !== undefined
            ? Number(match[4])
            : 1;

    r = Math.floor(r * factor);
    g = Math.floor(g * factor);
    b = Math.floor(b * factor);

    a *= factor * 0.7 * alphaFactor;

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

    const totalSegments =
        points.length - 1;

    const scaledProgress =
        progress *
        totalSegments;

    ctx.save();

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.shadowColor = color;
    ctx.shadowBlur = shadowBlur;

    ctx.beginPath();

    ctx.moveTo(
        points[0].x,
        points[0].y
    );

    let remaining =
        scaledProgress;

    for (
        let i = 1;
        i < points.length;
        i++
    ) {
        if (remaining >= 1) {
            ctx.lineTo(
                points[i].x,
                points[i].y
            );

            remaining -= 1;
        } else if (remaining > 0) {
            const start =
                points[i - 1];

            const end =
                points[i];

            const x =
                start.x +
                (end.x - start.x) *
                remaining;

            const y =
                start.y +
                (end.y - start.y) *
                remaining;

            ctx.lineTo(
                x,
                y
            );

            break;
        } else {
            break;
        }
    }

    ctx.stroke();

    ctx.restore();
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

    gameSessionId++;
}

function updateCpuAnimation(now) {
    const elapsed =
        now -
        cpuAnimationStart;

    cpuAnimationProgress =
        Math.min(
            elapsed /
            CONFIG.CPU_ANIMATION_DURATION,
            1
        );

    if (
        cpuAnimationProgress >= 1
    ) {
        gameState =
            GAME_STATE.READY;

        glowAnimating = true;
        glowProgress = 0;
    }
}

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
}

// ============================================================
// READY STATE
// ============================================================

function drawReadySequence() {
    drawPartialPath(
        sequence,
        1,
        "rgba(0, 255, 204, 0.35)",
        8,
        12
    );

    if (glowAnimating) {
        drawGlowAlongLine();
    }

    drawPartialPath(
        sequence,
        1,
        "rgba(0, 255, 204, 1)",
        12,
        20
    );
}

// ============================================================
// GLOW ANIMATION
// ============================================================

function updateGlow(deltaTime) {
    if (!glowAnimating) {
        return;
    }

    glowProgress +=
        CONFIG.GLOW_SPEED *
        deltaTime;

    if (glowProgress >= 1) {
        glowProgress = 0;
    }
}

function drawGlowAlongLine() {
    if (
        !sequence ||
        sequence.length < 2
    ) {
        return;
    }

    const totalSegments =
        sequence.length - 1;

    const scaledT =
        glowProgress *
        totalSegments;

    let segmentIndex =
        Math.floor(
            scaledT
        );

    let segmentProgress =
        scaledT -
        segmentIndex;

    if (
        segmentIndex >=
        totalSegments
    ) {
        segmentIndex =
            totalSegments - 1;

        segmentProgress = 1;
    }

    const start =
        sequence[segmentIndex];

    const end =
        sequence[
            segmentIndex + 1
        ];

    const x =
        start.x +
        (end.x - start.x) *
        segmentProgress;

    const y =
        start.y +
        (end.y - start.y) *
        segmentProgress;

    const radius = 20;

    const gradient =
        ctx.createRadialGradient(
            x,
            y,
            radius / 4,
            x,
            y,
            radius
        );

    gradient.addColorStop(
        0,
        "rgba(0, 255, 255, 0.9)"
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
        x,
        y,
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

    ctx.strokeStyle = color;
    ctx.lineWidth = 7;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.shadowColor = color;
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

function updateHelpTrace(now) {
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

    const totalSegments =
        sequence.length - 1;

    let minimumDistance =
        Infinity;

    let userProgress = 0;

    // --------------------------------------------------------
    // Find where the player currently is on the path.
    // --------------------------------------------------------

    for (
        let i = 0;
        i < totalSegments;
        i++
    ) {
        const start =
            sequence[i];

        const end =
            sequence[i + 1];

        const A =
            lastUser.x -
            start.x;

        const B =
            lastUser.y -
            start.y;

        const C =
            end.x -
            start.x;

        const D =
            end.y -
            start.y;

        const dot =
            A * C +
            B * D;

        const lengthSquared =
            C * C +
            D * D;

        let parameter =
            lengthSquared !== 0
                ? dot /
                  lengthSquared
                : 0;

        parameter =
            Math.max(
                0,
                Math.min(
                    1,
                    parameter
                )
            );

        const closestX =
            start.x +
            parameter * C;

        const closestY =
            start.y +
            parameter * D;

        const distance =
            Math.hypot(
                lastUser.x -
                    closestX,
                lastUser.y -
                    closestY
            );

        if (
            distance <
            minimumDistance
        ) {
            minimumDistance =
                distance;

            userProgress =
                (i + parameter) /
                totalSegments;
        }
    }

    ctx.save();

    ctx.lineCap = "round";
    ctx.lineWidth = 8;

    for (
        let i = 0;
        i < totalSegments;
        i++
    ) {
        const segmentCenter =
            (i + 0.5) /
            totalSegments;

        let alpha;

        if (
            segmentCenter >
            userProgress
        ) {
            alpha =
                0.1 *
                helpTraceAlpha;
        } else {
            const denominator =
                Math.max(
                    userProgress,
                    0.0001
                );

            alpha =
                (
                    0.05 +
                    0.75 *
                    (
                        segmentCenter /
                        denominator
                    )
                ) *
                helpTraceAlpha;
        }

        alpha =
            Math.max(
                0.01,
                Math.min(
                    0.8 *
                        helpTraceAlpha,
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
// TRACE VALIDATION
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
        x2 - x1;

    const dy =
        y2 - y1;

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
        x1 + t * dx;

    const closestY =
        y1 + t * dy;

    return Math.hypot(
        px - closestX,
        py - closestY
    );
}

// ============================================================
// CLOSEST PATH PROGRESS
// ============================================================

function getClosestPathProgress(point) {
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

    const totalSegments =
        sequence.length - 1;

    for (
        let i = 0;
        i < totalSegments;
        i++
    ) {
        const start =
            sequence[i];

        const end =
            sequence[i + 1];

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

        if (
            distance <
            bestDistance
        ) {
            bestDistance =
                distance;

            bestProgress =
                (i + t) /
                totalSegments;
        }
    }

    return {
        distance:
            bestDistance,
        progress:
            bestProgress
    };
}

// ============================================================
// TRACE VALIDATION
// ============================================================

function validateUserTrace() {
    if (
        userTrace.length < 2 ||
        sequence.length < 2
    ) {
        return false;
    }

    // --------------------------------------------------------
    // 1. START POSITION
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
        CONFIG.TRACE_TOLERANCE
    ) {
        return false;
    }

    // --------------------------------------------------------
    // 2. PATH COVERAGE
    // --------------------------------------------------------

    let validPoints = 0;

    for (
        const point of userTrace
    ) {
        const result =
            getClosestPathProgress(
                point
            );

        if (
            result.distance <=
            CONFIG.TRACE_TOLERANCE
        ) {
            validPoints++;
        }
    }

    const coverage =
        validPoints /
        userTrace.length;

    if (
        coverage <
        CONFIG.MIN_PATH_COVERAGE
    ) {
        return false;
    }

    // --------------------------------------------------------
    // 3. FORWARD PROGRESS
    // --------------------------------------------------------

    let furthestProgress = 0;

    for (
        const point of userTrace
    ) {
        const result =
            getClosestPathProgress(
                point
            );

        if (
            result.distance <=
            CONFIG.TRACE_TOLERANCE
        ) {
            furthestProgress =
                Math.max(
                    furthestProgress,
                    result.progress
                );
        }
    }

    if (
        furthestProgress <
        CONFIG.MIN_PATH_PROGRESS
    ) {
        return false;
    }

    // --------------------------------------------------------
    // 4. END POSITION
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

    if (
        endDistance >
        CONFIG.TRACE_TOLERANCE
    ) {
        return false;
    }

    // --------------------------------------------------------
    // 5. BACKWARD MOVEMENT
    // --------------------------------------------------------

    let previousProgress = 0;
    let backwardsMovement = 0;

    for (
        const point of userTrace
    ) {
        const result =
            getClosestPathProgress(
                point
            );

        if (
            result.distance >
            CONFIG.TRACE_TOLERANCE
        ) {
            continue;
        }

        if (
            result.progress <
            previousProgress -
                CONFIG.MAX_BACKWARD_MOVEMENT
        ) {
            backwardsMovement++;
        }

        previousProgress =
            Math.max(
                previousProgress,
                result.progress
            );
    }

    if (
        backwardsMovement >
        Math.max(
            3,
            userTrace.length *
                CONFIG.MAX_BACKWARD_EVENTS_RATIO
        )
    ) {
        return false;
    }

    return true;
}

// ============================================================
// POINTER POSITION
// ============================================================

function getPointerPosition(event) {
    const rect =
        canvas.getBoundingClientRect();

    return {
        x:
            (event.clientX -
                rect.left) *
            (
                canvas.width /
                rect.width
            ),

        y:
            (event.clientY -
                rect.top) *
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
            gameState !==
            GAME_STATE.READY
        ) {
            return;
        }

        const point =
            getPointerPosition(
                event
            );

        const startPoint =
            sequence[0];

        const distance =
            Math.hypot(
                point.x -
                    startPoint.x,
                point.y -
                    startPoint.y
            );

        // ----------------------------------------------------
        // Must begin near the start.
        // ----------------------------------------------------

        if (
            distance >
            CONFIG.TRACE_TOLERANCE
        ) {
            triggerShake(
                CONFIG.INVALID_START_SHAKE_STRENGTH,
                CONFIG.INVALID_START_SHAKE_DURATION
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
            // Pointer capture is not supported
            // in every environment.
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

        timerRunning = true;

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

        // ----------------------------------------------------
        // Ignore extremely small movements.
        // ----------------------------------------------------

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
        }

        userTrace.push(point);

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
            // Pointer capture may already be released.
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
            // Pointer capture may already be released.
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

    const successful =
        checkTrace &&
        validateUserTrace();

    if (successful) {
        handleSuccessfulTrace();
    } else {
        handleFailedTrace();
    }
}

// ============================================================
// SUCCESS
// ============================================================

function handleSuccessfulTrace() {
    gameState =
        GAME_STATE.SUCCESS;

    streak++;

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

    triggerShake(
        CONFIG.SUCCESS_SHAKE_STRENGTH,
        CONFIG.SUCCESS_SHAKE_DURATION
    );

    const session =
        gameSessionId;

    // --------------------------------------------------------
    // Begin fading the completed line.
    // --------------------------------------------------------

    setTimeout(() => {
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
    }, CONFIG.SUCCESS_FADE_DURATION);

    // --------------------------------------------------------
    // Schedule next level.
    // --------------------------------------------------------

    nextLevelTime =
        performance.now() +
        CONFIG.NEXT_LEVEL_DELAY;
}

// ============================================================
// FAILURE
// ============================================================

function handleFailedTrace() {
    gameState =
        GAME_STATE.FAILED;

    timerRunning = false;

    resetStreak();

    failureFlash = 1;

    triggerShake(
        CONFIG.FAILURE_SHAKE_STRENGTH,
        CONFIG.FAILURE_SHAKE_DURATION
    );

    const session =
        gameSessionId;

    setTimeout(() => {
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
    }, CONFIG.FAILURE_RECOVERY_DELAY);
}

// ============================================================
// SUCCESS ANIMATION
// ============================================================

function updateSuccessAnimation(now) {
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

        ctx.restore();
    }
}

// ============================================================
// SUCCESS SHIMMER
// ============================================================

function drawShimmerAt(t) {
    if (
        sequence.length < 2
    ) {
        return;
    }

    const totalSegments =
        sequence.length - 1;

    const scaledT =
        t *
        totalSegments;

    let segmentIndex =
        Math.floor(
            scaledT
        );

    let segmentProgress =
        scaledT -
        segmentIndex;

    if (
        segmentIndex >=
        totalSegments
    ) {
        segmentIndex =
            totalSegments - 1;

        segmentProgress = 1;
    }

    const start =
        sequence[
            segmentIndex
        ];

    const end =
        sequence[
            segmentIndex + 1
        ];

    const x =
        start.x +
        (end.x - start.x) *
        segmentProgress;

    const y =
        start.y +
        (end.y - start.y) *
        segmentProgress;

    const radius = 25;

    const gradient =
        ctx.createRadialGradient(
            x,
            y,
            radius / 4,
            x,
            y,
            radius
        );

    gradient.addColorStop(
        0,
        "rgba(255, 255, 255, 0.95)"
    );

    gradient.addColorStop(
        1,
        "rgba(255, 255, 255, 0)"
    );

    ctx.save();

    ctx.fillStyle =
        gradient;

    ctx.beginPath();

    ctx.arc(
        x,
        y,
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

function updateTimer(now) {
    if (!timerRunning) {
        return;
    }

    const elapsed =
        now -
        timerStart;

    if (
        elapsed >=
        CONFIG.TIMER_DURATION
    ) {
        timerRunning = false;

        handleTimerEnd();
    }
}

function getTimerProgress() {
    if (!timerRunning) {
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
                    CONFIG.TIMER_DURATION
        )
    );
}

// ============================================================
// TIMER RING
// ============================================================

function drawTimerRing() {
    if (
        gameState !==
            GAME_STATE.TRACING ||
        !timerRunning
    ) {
        return;
    }

    const remaining =
        getTimerProgress();

    const centerX =
        canvas.width / 2;

    const centerY =
        canvas.height / 2;

    const radius =
        Math.min(
            canvas.width,
            canvas.height
        ) / 3;

    const startAngle =
        -Math.PI / 2;

    const endAngle =
        startAngle +
        Math.PI *
            2 *
            remaining;

    let color =
        "#00ffcc";

    if (
        remaining <= 0.33
    ) {
        color = "#ff3333";
    } else if (
        remaining <= 0.66
    ) {
        color = "#ffd700";
    }

    ctx.save();

    ctx.lineWidth = 10;

    ctx.strokeStyle =
        color;

    ctx.shadowColor =
        color;

    ctx.shadowBlur = 20;

    ctx.lineCap =
        "round";

    ctx.beginPath();

    ctx.arc(
        centerX,
        centerY,
        radius,
        startAngle,
        endAngle,
        false
    );

    ctx.stroke();

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

    const session =
        gameSessionId;

    setTimeout(() => {
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
    }, CONFIG.FAILURE_RECOVERY_DELAY);
}

// ============================================================
// STREAK LINES
// ============================================================

function updateStreakFades(now) {
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

function updateShake(deltaTime) {
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

function drawFailureFlash() {
    if (
        failureFlash <= 0
    ) {
        return;
    }

    ctx.save();

    ctx.fillStyle =
        `rgba(255, 0, 0, ${
            failureFlash * 0.5
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
    const fontSize = 30;

    ctx.save();

    // --------------------------------------------------------
    // LEVEL
    // --------------------------------------------------------

    ctx.font =
        `${fontSize}px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif`;

    ctx.fillStyle =
        "#00ffcc";

    ctx.shadowColor =
        "#00ffcc";

    ctx.shadowBlur = 10;

    ctx.fillText(
        `Level: ${currentLevel}`,
        CONFIG.UI_MARGIN,
        fontSize +
            CONFIG.UI_MARGIN
    );

    // --------------------------------------------------------
    // STREAK
    // --------------------------------------------------------

    ctx.font =
        "24px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

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
            40
    );

    ctx.shadowBlur = 0;

    // --------------------------------------------------------
    // READY MESSAGE
    // --------------------------------------------------------

    if (
        gameState ===
        GAME_STATE.READY
    ) {
        drawReadyText();
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
        "rgba(255, 255, 255, 0.65)";

    ctx.fillText(
        "Trace the pattern",
        canvas.width / 2,
        canvas.height - 40
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
        "rgba(255, 60, 60, 0.35)",
        8,
        12
    );
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

    // --------------------------------------------------------
    // WIN TITLE
    // --------------------------------------------------------

    ctx.font =
        "64px 'Segoe UI', Arial, sans-serif";

    ctx.fillStyle =
        `rgba(255, 0, 255, ${pulse})`;

    ctx.shadowColor =
        "#ff00ff";

    ctx.shadowBlur = 30;

    ctx.fillText(
        "YOU WIN!",
        canvas.width / 2,
        canvas.height / 2
    );

    // --------------------------------------------------------
    // FINAL STREAK
    // --------------------------------------------------------

    ctx.font =
        "28px 'Segoe UI', Arial, sans-serif";

    ctx.fillStyle =
        "#00ffcc";

    ctx.shadowColor =
        "#00ffcc";

    ctx.shadowBlur = 12;

    ctx.fillText(
        `Final Streak: ${streak}`,
        canvas.width / 2,
        canvas.height / 2 + 55
    );

    // --------------------------------------------------------
    // COMPLETION MESSAGE
    // --------------------------------------------------------

    ctx.font =
        "20px 'Segoe UI', Arial, sans-serif";

    ctx.fillStyle =
        "rgba(255, 255, 255, 0.65)";

    ctx.shadowBlur = 0;

    ctx.fillText(
        "All levels completed",
        canvas.width / 2,
        canvas.height / 2 + 95
    );

    ctx.restore();
}

// ============================================================
// STREAK / RESET
// ============================================================

function resetStreak() {
    streak = 0;

    completedStreakLines = [];
}

// ============================================================
// GAME INITIALIZATION
// ============================================================

function init() {
    currentLevel = 1;

    streak = 0;

    userTrace = [];

    completedStreakLines = [];

    timerRunning = false;

    pointerId = null;

    failureFlash = 0;

    shakeTime = 0;

    nextLevelTime = 0;

    gameSessionId++;

    // --------------------------------------------------------
    // Generate the complete 10-level path once.
    // --------------------------------------------------------

    fullSequence =
        generateSequence(
            CONFIG.MAX_LEVEL
        );

    // --------------------------------------------------------
    // Only reveal level 1 initially.
    // --------------------------------------------------------

    sequence =
        fullSequence.slice(
            0,
            currentLevel + 1
        );

    gameState =
        GAME_STATE.DEMO;

    startCpuDemo();
}

// ============================================================
// START GAME
// ============================================================

resize();

init();

requestAnimationFrame(
    gameLoop
);