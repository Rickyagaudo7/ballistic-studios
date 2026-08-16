"use strict";

// ============================================================
// MATH SPACE SHOOTER
// ============================================================
//
// Required HTML:
//
// <canvas id="gameCanvas"></canvas>
//
// Optional HTML:
//
// <div id="gameUI"></div>
//
// Controls:
// WASD / Arrow Keys = Move
// SPACE = Shoot
// P = Pause
// R = Restart after Game Over
//
// ============================================================

const canvas = document.getElementById("gameCanvas");

if (!canvas) {
    throw new Error('gameCanvas element was not found.');
}

const ctx = canvas.getContext("2d");

if (!ctx) {
    throw new Error("Unable to create 2D canvas context.");
}


// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {

    // Canvas
    WIDTH: 1280,
    HEIGHT: 720,

    // Player
    PLAYER_SPEED: 520,
    PLAYER_ACCELERATION: 1800,
    PLAYER_FRICTION: 0.82,

    PLAYER_WIDTH: 52,
    PLAYER_HEIGHT: 70,

    MAX_HEALTH: 3,

    // Shooting
    BULLET_SPEED: 900,
    BULLET_WIDTH: 5,
    BULLET_HEIGHT: 24,

    SHOOT_COOLDOWN: 0.16,

    // Enemies
    INITIAL_ENEMIES: 4,
    MAX_ENEMIES: 12,

    ENEMY_MIN_SPEED: 65,
    ENEMY_MAX_SPEED: 140,

    ENEMY_RADIUS: 38,

    // Math
    STARTING_DIFFICULTY: 1,

    // Scoring
    BASE_SCORE: 100,

    COMBO_MULTIPLIER_STEP: 5,

    // Particles
    MAX_PARTICLES: 700,

    // Background
    STAR_COUNT: 220,

    // Waves
    WAVE_DURATION: 25,

    // Effects
    SCREEN_SHAKE_DURATION: 0.18,
    SCREEN_SHAKE_AMOUNT: 10
};


// ============================================================
// GAME STATE
// ============================================================

const game = {

    running: true,

    paused: false,

    gameOver: false,

    score: 0,

    highScore: Number(localStorage.getItem("mathSpaceHighScore")) || 0,

    combo: 0,

    level: 1,

    wave: 1,

    difficulty: CONFIG.STARTING_DIFFICULTY,

    waveTimer: 0,

    totalTime: 0,

    correctAnswers: 0,

    wrongAnswers: 0,

    problemsSolved: 0,

    currentProblem: null,

    shakeTimer: 0,

    shakeAmount: 0
};


// ============================================================
// PLAYER
// ============================================================

const player = {

    x: CONFIG.WIDTH / 2,

    y: CONFIG.HEIGHT - 110,

    vx: 0,

    vy: 0,

    width: CONFIG.PLAYER_WIDTH,

    height: CONFIG.PLAYER_HEIGHT,

    health: CONFIG.MAX_HEALTH,

    shootTimer: 0,

    invincibleTimer: 0,

    thrust: 0
};


// ============================================================
// INPUT
// ============================================================

const keys = {

    left: false,

    right: false,

    up: false,

    down: false,

    shoot: false
};


document.addEventListener("keydown", (event) => {

    const key = event.key.toLowerCase();

    if (
        key === "arrowleft" ||
        key === "a"
    ) {
        keys.left = true;
        event.preventDefault();
    }

    if (
        key === "arrowright" ||
        key === "d"
    ) {
        keys.right = true;
        event.preventDefault();
    }

    if (
        key === "arrowup" ||
        key === "w"
    ) {
        keys.up = true;
        event.preventDefault();
    }

    if (
        key === "arrowdown" ||
        key === "s"
    ) {
        keys.down = true;
        event.preventDefault();
    }

    if (key === " ") {

        keys.shoot = true;

        event.preventDefault();
    }

    if (key === "p") {

        if (!game.gameOver) {

            game.paused = !game.paused;
        }
    }

    if (key === "r" && game.gameOver) {

        restartGame();
    }
});


document.addEventListener("keyup", (event) => {

    const key = event.key.toLowerCase();

    if (
        key === "arrowleft" ||
        key === "a"
    ) {
        keys.left = false;
    }

    if (
        key === "arrowright" ||
        key === "d"
    ) {
        keys.right = false;
    }

    if (
        key === "arrowup" ||
        key === "w"
    ) {
        keys.up = false;
    }

    if (
        key === "arrowdown" ||
        key === "s"
    ) {
        keys.down = false;
    }

    if (key === " ") {

        keys.shoot = false;
    }
});


// ============================================================
// MOUSE
// ============================================================

let mouse = {

    x: CONFIG.WIDTH / 2,

    y: CONFIG.HEIGHT / 2,

    down: false
};


canvas.addEventListener("mousemove", (event) => {

    const rect = canvas.getBoundingClientRect();

    mouse.x =
        (event.clientX - rect.left) *
        (CONFIG.WIDTH / rect.width);

    mouse.y =
        (event.clientY - rect.top) *
        (CONFIG.HEIGHT / rect.height);
});


canvas.addEventListener("mousedown", () => {

    mouse.down = true;
});


canvas.addEventListener("mouseup", () => {

    mouse.down = false;
});


// ============================================================
// TOUCH
// ============================================================

canvas.addEventListener(
    "touchstart",
    (event) => {

        const touch = event.touches[0];

        if (!touch) return;

        const rect = canvas.getBoundingClientRect();

        mouse.x =
            (touch.clientX - rect.left) *
            (CONFIG.WIDTH / rect.width);

        mouse.y =
            (touch.clientY - rect.top) *
            (CONFIG.HEIGHT / rect.height);

        mouse.down = true;

        event.preventDefault();
    },
    { passive: false }
);


canvas.addEventListener(
    "touchmove",
    (event) => {

        const touch = event.touches[0];

        if (!touch) return;

        const rect = canvas.getBoundingClientRect();

        mouse.x =
            (touch.clientX - rect.left) *
            (CONFIG.WIDTH / rect.width);

        mouse.y =
            (touch.clientY - rect.top) *
            (CONFIG.HEIGHT / rect.height);

        event.preventDefault();
    },
    { passive: false }
);


canvas.addEventListener(
    "touchend",
    () => {

        mouse.down = false;
    }
);


// ============================================================
// ARRAYS
// ============================================================

const bullets = [];

const enemies = [];

const particles = [];

const stars = [];

const floatingTexts = [];


// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function random(min, max) {

    return Math.random() * (max - min) + min;
}


function randomInt(min, max) {

    return Math.floor(
        Math.random() * (max - min + 1)
    ) + min;
}


function clamp(value, min, max) {

    return Math.max(
        min,
        Math.min(max, value)
    );
}


function choose(array) {

    return array[
        Math.floor(Math.random() * array.length)
    ];
}


function distance(x1, y1, x2, y2) {

    return Math.hypot(
        x2 - x1,
        y2 - y1
    );
}


// ============================================================
// RESIZE
// ============================================================

function resizeCanvas() {

    const dpr = Math.min(
        window.devicePixelRatio || 1,
        2
    );

    canvas.width =
        CONFIG.WIDTH * dpr;

    canvas.height =
        CONFIG.HEIGHT * dpr;

    canvas.style.width = "100%";

    canvas.style.height = "100%";

    ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );
}


window.addEventListener(
    "resize",
    resizeCanvas
);


resizeCanvas();


// ============================================================
// STAR FIELD
// ============================================================

function createStars() {

    stars.length = 0;

    for (
        let i = 0;
        i < CONFIG.STAR_COUNT;
        i++
    ) {

        stars.push({

            x: random(
                0,
                CONFIG.WIDTH
            ),

            y: random(
                0,
                CONFIG.HEIGHT
            ),

            size: random(
                0.5,
                2.4
            ),

            speed: random(
                20,
                110
            ),

            brightness: random(
                0.25,
                1
            ),

            twinkle: random(
                0,
                Math.PI * 2
            )
        });
    }
}


function updateStars(dt) {

    for (const star of stars) {

        star.y += star.speed * dt;

        star.twinkle += dt * 2;

        if (star.y > CONFIG.HEIGHT) {

            star.y = -5;

            star.x = random(
                0,
                CONFIG.WIDTH
            );
        }
    }
}


function drawStars() {

    for (const star of stars) {

        const pulse =
            0.65 +
            Math.sin(star.twinkle) *
            0.25;

        ctx.globalAlpha =
            star.brightness *
            pulse;

        ctx.fillStyle = "#ffffff";

        ctx.beginPath();

        ctx.arc(
            star.x,
            star.y,
            star.size,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }

    ctx.globalAlpha = 1;
}


// ============================================================
// MATH ENGINE
// ============================================================

function generateProblem() {

    const difficulty =
        Math.min(
            game.difficulty,
            10
        );

    let a;

    let b;

    let answer;

    let operation;

    const operations =
        getAvailableOperations(
            difficulty
        );

    operation = choose(operations);


    // --------------------------------------------------------
    // ADDITION
    // --------------------------------------------------------

    if (operation === "+") {

        a = randomInt(
            1,
            10 + difficulty * 10
        );

        b = randomInt(
            1,
            10 + difficulty * 10
        );

        answer = a + b;
    }


    // --------------------------------------------------------
    // SUBTRACTION
    // --------------------------------------------------------

    else if (operation === "-") {

        a = randomInt(
            5,
            20 + difficulty * 10
        );

        b = randomInt(
            1,
            a
        );

        answer = a - b;
    }


    // --------------------------------------------------------
    // MULTIPLICATION
    // --------------------------------------------------------

    else if (operation === "×") {

        a = randomInt(
            2,
            3 + difficulty
        );

        b = randomInt(
            2,
            5 + difficulty
        );

        answer = a * b;
    }


    // --------------------------------------------------------
    // DIVISION
    // --------------------------------------------------------

    else if (operation === "÷") {

        b = randomInt(
            2,
            5 + difficulty
        );

        answer = randomInt(
            2,
            5 + difficulty
        );

        a = b * answer;
    }


    return {

        a,

        b,

        operation,

        answer,

        text:
            `${a} ${operation} ${b} = ?`
    };
}


function getAvailableOperations(difficulty) {

    if (difficulty <= 1) {

        return ["+"];
    }

    if (difficulty === 2) {

        return [
            "+",
            "-"
        ];
    }

    if (difficulty <= 4) {

        return [
            "+",
            "-",
            "×"
        ];
    }

    return [
        "+",
        "-",
        "×",
        "÷"
    ];
}


// ============================================================
// ANSWER GENERATION
// ============================================================

function generateAnswers(correctAnswer) {

    const answers = new Set();

    answers.add(correctAnswer);

    const spread =
        Math.max(
            3,
            Math.floor(
                Math.abs(correctAnswer) * 0.25
            )
        );

    while (answers.size < 4) {

        let wrong;

        const method =
            randomInt(1, 4);

        if (method === 1) {

            wrong =
                correctAnswer +
                randomInt(
                    -spread,
                    spread
                );
        }

        else if (method === 2) {

            wrong =
                correctAnswer +
                randomInt(
                    -10,
                    10
                );
        }

        else if (method === 3) {

            wrong =
                correctAnswer +
                randomInt(
                    -3,
                    3
                ) * 2;
        }

        else {

            wrong =
                correctAnswer *
                randomInt(
                    1,
                    3
                );
        }

        if (
            Number.isFinite(wrong) &&
            wrong >= 0 &&
            wrong !== correctAnswer
        ) {

            answers.add(wrong);
        }
    }

    return Array.from(answers)
        .sort(() => Math.random() - 0.5);
}


// ============================================================
// ENEMY CREATION
// ============================================================

function spawnEnemy() {

    if (
        enemies.length >=
        CONFIG.MAX_ENEMIES
    ) {

        return;
    }

    const problem =
        game.currentProblem ||
        generateProblem();

    game.currentProblem =
        problem;

    const answers =
        generateAnswers(
            problem.answer
        );

    const answer =
        choose(answers);

    const isCorrect =
        answer === problem.answer;

    const radius =
        CONFIG.ENEMY_RADIUS;

    enemies.push({

        x: random(
            radius + 30,
            CONFIG.WIDTH - radius - 30
        ),

        y: -radius - 40,

        radius,

        speed: random(
            CONFIG.ENEMY_MIN_SPEED +
            game.level * 5,

            CONFIG.ENEMY_MAX_SPEED +
            game.level * 12
        ),

        answer,

        isCorrect,

        rotation: random(
            0,
            Math.PI * 2
        ),

        rotationSpeed: random(
            -1,
            1
        ),

        wobble: random(
            0,
            Math.PI * 2
        ),

        wobbleSpeed: random(
            1,
            3
        ),

        wobbleAmount: random(
            15,
            35
        ),

        type: choose([
            "fighter",
            "orb",
            "crystal"
        ]),

        hitFlash: 0
    });
}


// ============================================================
// BULLET CREATION
// ============================================================

function shoot() {

    if (player.shootTimer > 0) {

        return;
    }

    bullets.push({

        x: player.x,

        y:
            player.y -
            player.height / 2,

        width:
            CONFIG.BULLET_WIDTH,

        height:
            CONFIG.BULLET_HEIGHT,

        speed:
            CONFIG.BULLET_SPEED,

        life: 1.5
    });

    player.shootTimer =
        CONFIG.SHOOT_COOLDOWN;

    createMuzzleParticles();
}


// ============================================================
// PARTICLES
// ============================================================

function createParticle(
    x,
    y,
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
            random(-150, 150),

        vy:
            options.vy ??
            random(-150, 150),

        size:
            options.size ??
            random(2, 6),

        life:
            options.life ??
            random(0.3, 0.8),

        maxLife:
            options.maxLife ??
            0.8,

        gravity:
            options.gravity ??
            0,

        type:
            options.type ??
            "spark"
    });
}


function createExplosion(
    x,
    y,
    amount = 35
) {

    for (
        let i = 0;
        i < amount;
        i++
    ) {

        const angle =
            random(
                0,
                Math.PI * 2
            );

        const speed =
            random(
                70,
                350
            );

        createParticle(
            x,
            y,
            {

                vx:
                    Math.cos(angle) *
                    speed,

                vy:
                    Math.sin(angle) *
                    speed,

                size:
                    random(2, 7),

                life:
                    random(
                        0.25,
                        0.75
                    ),

                maxLife:
                    0.75
            }
        );
    }
}


function createMuzzleParticles() {

    for (
        let i = 0;
        i < 7;
        i++
    ) {

        createParticle(
            player.x,
            player.y -
            player.height / 2,
            {

                vx:
                    random(-40, 40),

                vy:
                    random(
                        -300,
                        -120
                    ),

                size:
                    random(1, 4),

                life:
                    random(
                        0.1,
                        0.3
                    ),

                maxLife:
                    0.3
            }
        );
    }
}


function updateParticles(dt) {

    for (
        let i = particles.length - 1;
        i >= 0;
        i--
    ) {

        const p = particles[i];

        p.life -= dt;

        p.vy +=
            p.gravity * dt;

        p.x +=
            p.vx * dt;

        p.y +=
            p.vy * dt;

        p.size *=
            Math.pow(
                0.2,
                dt
            );

        if (p.life <= 0) {

            particles.splice(
                i,
                1
            );
        }
    }
}


function drawParticles() {

    for (const p of particles) {

        const alpha =
            clamp(
                p.life /
                p.maxLife,
                0,
                1
            );

        ctx.globalAlpha =
            alpha;

        ctx.fillStyle =
            "#ffffff";

        ctx.beginPath();

        ctx.arc(
            p.x,
            p.y,
            p.size,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }

    ctx.globalAlpha = 1;
}


// ============================================================
// FLOATING TEXT
// ============================================================

function addFloatingText(
    text,
    x,
    y,
    type = "normal"
) {

    floatingTexts.push({

        text,

        x,

        y,

        life: 1,

        maxLife: 1,

        type
    });
}


function updateFloatingTexts(dt) {

    for (
        let i = floatingTexts.length - 1;
        i >= 0;
        i--
    ) {

        const text =
            floatingTexts[i];

        text.life -= dt;

        text.y -=
            45 * dt;

        if (text.life <= 0) {

            floatingTexts.splice(
                i,
                1
            );
        }
    }
}


function drawFloatingTexts() {

    ctx.textAlign = "center";

    for (const text of floatingTexts) {

        ctx.globalAlpha =
            text.life;

        if (
            text.type ===
            "correct"
        ) {

            ctx.fillStyle =
                "#58ff9a";

            ctx.font =
                "bold 28px Arial";
        }

        else if (
            text.type ===
            "wrong"
        ) {

            ctx.fillStyle =
                "#ff5555";

            ctx.font =
                "bold 28px Arial";
        }

        else {

            ctx.fillStyle =
                "#ffffff";

            ctx.font =
                "bold 22px Arial";
        }

        ctx.fillText(
            text.text,
            text.x,
            text.y
        );
    }

    ctx.globalAlpha = 1;
}


// ============================================================
// PLAYER UPDATE
// ============================================================

function updatePlayer(dt) {

    let dx = 0;

    let dy = 0;

    if (keys.left) dx--;

    if (keys.right) dx++;

    if (keys.up) dy--;

    if (keys.down) dy++;

    // Normalize diagonal movement
    if (dx !== 0 || dy !== 0) {

        const length =
            Math.hypot(dx, dy);

        dx /= length;

        dy /= length;

        player.vx +=
            dx *
            CONFIG.PLAYER_ACCELERATION *
            dt;

        player.vy +=
            dy *
            CONFIG.PLAYER_ACCELERATION *
            dt;
    }

    else {

        player.vx *=
            Math.pow(
                CONFIG.PLAYER_FRICTION,
                dt * 60
            );

        player.vy *=
            Math.pow(
                CONFIG.PLAYER_FRICTION,
                dt * 60
            );
    }

    const speed =
        Math.hypot(
            player.vx,
            player.vy
        );

    if (
        speed >
        CONFIG.PLAYER_SPEED
    ) {

        const scale =
            CONFIG.PLAYER_SPEED /
            speed;

        player.vx *= scale;

        player.vy *= scale;
    }

    player.x +=
        player.vx * dt;

    player.y +=
        player.vy * dt;

    player.x = clamp(
        player.x,
        35,
        CONFIG.WIDTH - 35
    );

    player.y = clamp(
        player.y,
        80,
        CONFIG.HEIGHT - 55
    );

    player.thrust =
        0.5 +
        Math.random() *
        0.5;

    if (
        player.shootTimer > 0
    ) {

        player.shootTimer -= dt;
    }

    if (
        player.invincibleTimer > 0
    ) {

        player.invincibleTimer -= dt;
    }

    if (
        keys.shoot ||
        mouse.down
    ) {

        shoot();
    }
}


// ============================================================
// PLAYER DRAW
// ============================================================

function drawPlayer() {

    if (
        player.invincibleTimer > 0 &&
        Math.floor(
            player.invincibleTimer * 15
        ) % 2 === 0
    ) {

        return;
    }

    ctx.save();

    ctx.translate(
        player.x,
        player.y
    );

    // Engine flame
    ctx.beginPath();

    ctx.moveTo(
        -10,
        28
    );

    ctx.lineTo(
        0,
        55 +
        player.thrust * 15
    );

    ctx.lineTo(
        10,
        28
    );

    ctx.closePath();

    const flame =
        ctx.createLinearGradient(
            0,
            25,
            0,
            70
        );

    flame.addColorStop(
        0,
        "#ffffff"
    );

    flame.addColorStop(
        0.35,
        "#5de7ff"
    );

    flame.addColorStop(
        1,
        "rgba(0,100,255,0)"
    );

    ctx.fillStyle = flame;

    ctx.fill();


    // Ship body
    ctx.beginPath();

    ctx.moveTo(
        0,
        -38
    );

    ctx.lineTo(
        26,
        28
    );

    ctx.lineTo(
        10,
        22
    );

    ctx.lineTo(
        0,
        32
    );

    ctx.lineTo(
        -10,
        22
    );

    ctx.lineTo(
        -26,
        28
    );

    ctx.closePath();

    const shipGradient =
        ctx.createLinearGradient(
            -25,
            -35,
            25,
            30
        );

    shipGradient.addColorStop(
        0,
        "#ffffff"
    );

    shipGradient.addColorStop(
        0.35,
        "#72dfff"
    );

    shipGradient.addColorStop(
        1,
        "#2874ff"
    );

    ctx.fillStyle =
        shipGradient;

    ctx.shadowColor =
        "#31cfff";

    ctx.shadowBlur = 20;

    ctx.fill();

    ctx.shadowBlur = 0;


    // Cockpit
    ctx.beginPath();

    ctx.ellipse(
        0,
        -10,
        9,
        15,
        0,
        0,
        Math.PI * 2
    );

    const cockpit =
        ctx.createLinearGradient(
            0,
            -25,
            0,
            5
        );

    cockpit.addColorStop(
        0,
        "#ffffff"
    );

    cockpit.addColorStop(
        0.4,
        "#6af0ff"
    );

    cockpit.addColorStop(
        1,
        "#1460b8"
    );

    ctx.fillStyle =
        cockpit;

    ctx.fill();


    // Wings
    ctx.fillStyle =
        "#2f5fff";

    ctx.beginPath();

    ctx.moveTo(
        -8,
        2
    );

    ctx.lineTo(
        -35,
        30
    );

    ctx.lineTo(
        -12,
        23
    );

    ctx.closePath();

    ctx.fill();

    ctx.beginPath();

    ctx.moveTo(
        8,
        2
    );

    ctx.lineTo(
        35,
        30
    );

    ctx.lineTo(
        12,
        23
    );

    ctx.closePath();

    ctx.fill();

    ctx.restore();
}


// ============================================================
// BULLET UPDATE
// ============================================================

function updateBullets(dt) {

    for (
        let i = bullets.length - 1;
        i >= 0;
        i--
    ) {

        const bullet =
            bullets[i];

        bullet.y -=
            bullet.speed * dt;

        bullet.life -= dt;

        if (
            bullet.y < -50 ||
            bullet.life <= 0
        ) {

            bullets.splice(
                i,
                1
            );
        }
    }
}


// ============================================================
// BULLET DRAW
// ============================================================

function drawBullets() {

    for (const bullet of bullets) {

        const gradient =
            ctx.createLinearGradient(
                0,
                bullet.y -
                bullet.height,
                0,
                bullet.y
            );

        gradient.addColorStop(
            0,
            "rgba(255,255,255,0)"
        );

        gradient.addColorStop(
            0.4,
            "#ffffff"
        );

        gradient.addColorStop(
            1,
            "#43d9ff"
        );

        ctx.fillStyle =
            gradient;

        ctx.shadowColor =
            "#36dfff";

        ctx.shadowBlur = 15;

        ctx.fillRect(
            bullet.x -
            bullet.width / 2,

            bullet.y -
            bullet.height,

            bullet.width,

            bullet.height
        );

        ctx.shadowBlur = 0;
    }
}


// ============================================================
// ENEMY UPDATE
// ============================================================

function updateEnemies(dt) {

    for (
        let i = enemies.length - 1;
        i >= 0;
        i--
    ) {

        const enemy =
            enemies[i];

        enemy.y +=
            enemy.speed * dt;

        enemy.wobble +=
            enemy.wobbleSpeed * dt;

        enemy.rotation +=
            enemy.rotationSpeed * dt;

        enemy.x +=
            Math.sin(
                enemy.wobble
            ) *
            enemy.wobbleAmount *
            dt;

        enemy.hitFlash -= dt;


        // Enemy reaches player area
        if (
            enemy.y >
            CONFIG.HEIGHT + 80
        ) {

            enemyMissed(enemy);

            enemies.splice(
                i,
                1
            );
        }
    }
}


// ============================================================
// ENEMY DRAW
// ============================================================

function drawEnemy(enemy) {

    ctx.save();

    ctx.translate(
        enemy.x,
        enemy.y
    );

    ctx.rotate(
        enemy.rotation
    );

    const radius =
        enemy.radius;


    // Glow
    ctx.shadowColor =
        enemy.isCorrect
            ? "#49ff9d"
            : "#ff4c78";

    ctx.shadowBlur = 25;


    if (
        enemy.type ===
        "fighter"
    ) {

        ctx.beginPath();

        ctx.moveTo(
            0,
            -radius
        );

        ctx.lineTo(
            radius,
            radius * 0.75
        );

        ctx.lineTo(
            0,
            radius * 0.35
        );

        ctx.lineTo(
            -radius,
            radius * 0.75
        );

        ctx.closePath();

        ctx.fillStyle =
            enemy.isCorrect
                ? "#1dba83"
                : "#b62e5b";

        ctx.fill();

    }

    else if (
        enemy.type ===
        "crystal"
    ) {

        ctx.beginPath();

        ctx.moveTo(
            0,
            -radius
        );

        ctx.lineTo(
            radius * 0.8,
            -radius * 0.2
        );

        ctx.lineTo(
            radius * 0.55,
            radius
        );

        ctx.lineTo(
            -radius * 0.55,
            radius
        );

        ctx.lineTo(
            -radius * 0.8,
            -radius * 0.2
        );

        ctx.closePath();

        ctx.fillStyle =
            enemy.isCorrect
                ? "#177d69"
                : "#76204a";

        ctx.fill();

    }

    else {

        ctx.beginPath();

        ctx.arc(
            0,
            0,
            radius,
            0,
            Math.PI * 2
        );

        ctx.fillStyle =
            enemy.isCorrect
                ? "#155f54"
                : "#5c1f45";

        ctx.fill();
    }

    ctx.shadowBlur = 0;


    // Answer number
    ctx.rotate(
        -enemy.rotation
    );

    ctx.textAlign =
        "center";

    ctx.textBaseline =
        "middle";

    ctx.font =
        "bold 24px Arial";

    ctx.fillStyle =
        "#ffffff";

    ctx.shadowColor =
        "#ffffff";

    ctx.shadowBlur = 8;

    ctx.fillText(
        enemy.answer,
        0,
        2
    );

    ctx.shadowBlur = 0;


    // Small target ring
    ctx.strokeStyle =
        enemy.isCorrect
            ? "rgba(80,255,170,0.8)"
            : "rgba(255,90,130,0.35)";

    ctx.lineWidth = 2;

    ctx.beginPath();

    ctx.arc(
        0,
        0,
        radius + 8,
        0,
        Math.PI * 2
    );

    ctx.stroke();

    ctx.restore();
}


// ============================================================
// COLLISION DETECTION
// ============================================================

function bulletHitsEnemy(
    bullet,
    enemy
) {

    return distance(
        bullet.x,
        bullet.y,
        enemy.x,
        enemy.y
    ) <
        enemy.radius +
        10;
}


// ============================================================
// HANDLE COLLISIONS
// ============================================================

function checkBulletCollisions() {

    for (
        let b = bullets.length - 1;
        b >= 0;
        b--
    ) {

        const bullet =
            bullets[b];

        for (
            let e = enemies.length - 1;
            e >= 0;
            e--
        ) {

            const enemy =
                enemies[e];

            if (
                bulletHitsEnemy(
                    bullet,
                    enemy
                )
            ) {

                bullets.splice(
                    b,
                    1
                );

                enemies.splice(
                    e,
                    1
                );

                handleEnemyHit(
                    enemy
                );

                break;
            }
        }
    }
}


// ============================================================
// ENEMY HIT
// ============================================================

function handleEnemyHit(enemy) {

    createExplosion(
        enemy.x,
        enemy.y,
        45
    );

    game.shakeTimer =
        CONFIG.SCREEN_SHAKE_DURATION;

    game.shakeAmount =
        CONFIG.SCREEN_SHAKE_AMOUNT;


    if (enemy.isCorrect) {

        // --------------------------------------------
        // CORRECT
        // --------------------------------------------

        game.correctAnswers++;

        game.problemsSolved++;

        game.combo++;

        const multiplier =
            getComboMultiplier();

        const points =
            CONFIG.BASE_SCORE *
            multiplier;

        game.score += points;

        if (
            game.score >
            game.highScore
        ) {

            game.highScore =
                game.score;

            localStorage.setItem(
                "mathSpaceHighScore",
                game.highScore
            );
        }

        addFloatingText(
            `+${points}`,
            enemy.x,
            enemy.y - 45,
            "correct"
        );

        addFloatingText(
            "CORRECT!",
            enemy.x,
            enemy.y - 75,
            "correct"
        );


        // New problem
        game.currentProblem =
            generateProblem();


        // Difficulty increase
        updateDifficulty();


        // Correct answer burst
        createExplosion(
            enemy.x,
            enemy.y,
            20
        );
    }

    else {

        // --------------------------------------------
        // WRONG
        // --------------------------------------------

        game.wrongAnswers++;

        game.combo = 0;

        damagePlayer();

        addFloatingText(
            "WRONG!",
            enemy.x,
            enemy.y - 45,
            "wrong"
        );

        addFloatingText(
            "-1 SHIELD",
            enemy.x,
            enemy.y - 75,
            "wrong"
        );
    }
}


// ============================================================
// ENEMY MISSED
// ============================================================

function enemyMissed(enemy) {

    if (
        enemy.isCorrect
    ) {

        // Missing the correct answer
        // is a gameplay mistake.

        game.combo = 0;

        damagePlayer();

        addFloatingText(
            "MISSED!",
            enemy.x,
            CONFIG.HEIGHT - 100,
            "wrong"
        );

        game.currentProblem =
            generateProblem();
    }
}


// ============================================================
// PLAYER DAMAGE
// ============================================================

function damagePlayer() {

    if (
        player.invincibleTimer > 0
    ) {

        return;
    }

    player.health--;

    player.invincibleTimer = 1.2;

    game.shakeTimer =
        0.35;

    game.shakeAmount =
        18;

    createExplosion(
        player.x,
        player.y,
        25
    );

    if (
        player.health <= 0
    ) {

        endGame();
    }
}


// ============================================================
// COMBO
// ============================================================

function getComboMultiplier() {

    return Math.min(
        1 +
        Math.floor(
            game.combo /
            CONFIG.COMBO_MULTIPLIER_STEP
        ),
        10
    );
}


// ============================================================
// DIFFICULTY
// ============================================================

function updateDifficulty() {

    const newDifficulty =
        Math.max(
            1,
            Math.floor(
                game.problemsSolved /
                5
            ) + 1
        );

    if (
        newDifficulty >
        game.difficulty
    ) {

        game.difficulty =
            Math.min(
                newDifficulty,
                10
            );

        game.level =
            game.difficulty;

        addFloatingText(
            `LEVEL ${game.level}!`,
            CONFIG.WIDTH / 2,
            CONFIG.HEIGHT / 2,
            "correct"
        );
    }
}


// ============================================================
// WAVE SYSTEM
// ============================================================

function updateWave(dt) {

    game.waveTimer += dt;

    if (
        game.waveTimer >=
        CONFIG.WAVE_DURATION
    ) {

        game.waveTimer = 0;

        game.wave++;

        addFloatingText(
            `WAVE ${game.wave}`,
            CONFIG.WIDTH / 2,
            CONFIG.HEIGHT / 2,
            "correct"
        );

        // Increase difficulty
        game.difficulty =
            Math.min(
                10,
                game.difficulty + 0.5
            );
    }
}


// ============================================================
// SPAWN MANAGEMENT
// ============================================================

let spawnTimer = 0;


function updateSpawning(dt) {

    spawnTimer -= dt;

    const targetEnemies =
        Math.min(
            CONFIG.INITIAL_ENEMIES +
            Math.floor(game.wave / 2),
            CONFIG.MAX_ENEMIES
        );

    if (
        spawnTimer <= 0 &&
        enemies.length <
        targetEnemies
    ) {

        spawnEnemy();

        const spawnRate =
            Math.max(
                0.45,
                1.5 -
                game.difficulty *
                0.07
            );

        spawnTimer =
            random(
                spawnRate * 0.65,
                spawnRate * 1.15
            );
    }
}


// ============================================================
// GAME UPDATE
// ============================================================

function update(dt) {

    if (
        game.paused ||
        game.gameOver
    ) {

        return;
    }

    game.totalTime += dt;

    updateStars(dt);

    updatePlayer(dt);

    updateBullets(dt);

    updateEnemies(dt);

    updateParticles(dt);

    updateFloatingTexts(dt);

    checkBulletCollisions();

    updateWave(dt);

    updateSpawning(dt);

    if (
        game.shakeTimer > 0
    ) {

        game.shakeTimer -= dt;
    }
}


// ============================================================
// BACKGROUND
// ============================================================

function drawBackground() {

    const gradient =
        ctx.createLinearGradient(
            0,
            0,
            0,
            CONFIG.HEIGHT
        );

    gradient.addColorStop(
        0,
        "#030515"
    );

    gradient.addColorStop(
        0.5,
        "#070b27"
    );

    gradient.addColorStop(
        1,
        "#02030d"
    );

    ctx.fillStyle =
        gradient;

    ctx.fillRect(
        0,
        0,
        CONFIG.WIDTH,
        CONFIG.HEIGHT
    );


    // Nebula glow

    const nebula =
        ctx.createRadialGradient(
            CONFIG.WIDTH * 0.25,
            CONFIG.HEIGHT * 0.3,
            10,

            CONFIG.WIDTH * 0.25,
            CONFIG.HEIGHT * 0.3,
            450
        );

    nebula.addColorStop(
        0,
        "rgba(50,70,180,0.12)"
    );

    nebula.addColorStop(
        1,
        "rgba(0,0,0,0)"
    );

    ctx.fillStyle =
        nebula;

    ctx.fillRect(
        0,
        0,
        CONFIG.WIDTH,
        CONFIG.HEIGHT
    );


    drawStars();
}


// ============================================================
// UI
// ============================================================

function drawUI() {

    ctx.save();

    // --------------------------------------------------------
    // TOP BAR
    // --------------------------------------------------------

    ctx.fillStyle =
        "rgba(3,6,25,0.72)";

    ctx.fillRect(
        0,
        0,
        CONFIG.WIDTH,
        72
    );


    // Score
    ctx.textAlign =
        "left";

    ctx.textBaseline =
        "middle";

    ctx.font =
        "bold 22px Arial";

    ctx.fillStyle =
        "#ffffff";

    ctx.fillText(
        `SCORE ${game.score.toLocaleString()}`,
        25,
        25
    );

    ctx.font =
        "14px Arial";

    ctx.fillStyle =
        "#8793b8";

    ctx.fillText(
        `BEST ${game.highScore.toLocaleString()}`,
        25,
        50
    );


    // Level
    ctx.textAlign =
        "center";

    ctx.font =
        "bold 22px Arial";

    ctx.fillStyle =
        "#ffffff";

    ctx.fillText(
        `LEVEL ${Math.floor(game.level)}`,
        CONFIG.WIDTH / 2,
        25
    );

    ctx.font =
        "14px Arial";

    ctx.fillStyle =
        "#8793b8";

    ctx.fillText(
        `WAVE ${game.wave}`,
        CONFIG.WIDTH / 2,
        50
    );


    // Combo
    ctx.textAlign =
        "right";

    ctx.font =
        "bold 22px Arial";

    ctx.fillStyle =
        game.combo >= 5
            ? "#62ff9f"
            : "#ffffff";

    ctx.fillText(
        `COMBO ×${getComboMultiplier()}`,
        CONFIG.WIDTH - 25,
        25
    );

    ctx.font =
        "14px Arial";

    ctx.fillStyle =
        "#8793b8";

    ctx.fillText(
        `${game.combo} correct`,
        CONFIG.WIDTH - 25,
        50
    );


    // --------------------------------------------------------
    // HEALTH
    // --------------------------------------------------------

    const healthX = 25;

    const healthY =
        CONFIG.HEIGHT - 35;

    ctx.textAlign =
        "left";

    ctx.font =
        "bold 14px Arial";

    ctx.fillStyle =
        "#aeb9db";

    ctx.fillText(
        "SHIELDS",
        healthX,
        healthY - 15
    );


    for (
        let i = 0;
        i < CONFIG.MAX_HEALTH;
        i++
    ) {

        ctx.beginPath();

        ctx.arc(
            healthX +
            i * 32 +
            7,
            healthY,
            8,
            0,
            Math.PI * 2
        );

        ctx.fillStyle =
            i < player.health
                ? "#53e7ff"
                : "#18213f";

        ctx.shadowColor =
            "#53e7ff";

        ctx.shadowBlur =
            i < player.health
                ? 12
                : 0;

        ctx.fill();

        ctx.shadowBlur = 0;
    }


    // --------------------------------------------------------
    // PROBLEM BOX
    // --------------------------------------------------------

    const boxWidth = 360;

    const boxHeight = 72;

    const boxX =
        CONFIG.WIDTH / 2 -
        boxWidth / 2;

    const boxY =
        CONFIG.HEIGHT -
        100;


    ctx.fillStyle =
        "rgba(5,10,35,0.92)";

    ctx.strokeStyle =
        "#3a8fff";

    ctx.lineWidth = 2;

    ctx.shadowColor =
        "#347cff";

    ctx.shadowBlur = 20;

    roundRect(
        ctx,
        boxX,
        boxY,
        boxWidth,
        boxHeight,
        18
    );

    ctx.fill();

    ctx.stroke();

    ctx.shadowBlur = 0;


    ctx.textAlign =
        "center";

    ctx.textBaseline =
        "middle";

    ctx.font =
        "bold 30px Arial";

    ctx.fillStyle =
        "#ffffff";

    ctx.fillText(
        game.currentProblem
            ? game.currentProblem.text
            : "...",
        CONFIG.WIDTH / 2,
        boxY + boxHeight / 2
    );


    // --------------------------------------------------------
    // CONTROLS
    // --------------------------------------------------------

    ctx.textAlign =
        "center";

    ctx.font =
        "13px Arial";

    ctx.fillStyle =
        "rgba(180,195,230,0.7)";

    ctx.fillText(
        "WASD / ARROWS • SPACE TO FIRE • P TO PAUSE",
        CONFIG.WIDTH / 2,
        CONFIG.HEIGHT - 18
    );


    ctx.restore();
}


// ============================================================
// ROUNDED RECTANGLE
// ============================================================

function roundRect(
    context,
    x,
    y,
    width,
    height,
    radius
) {

    context.beginPath();

    context.moveTo(
        x + radius,
        y
    );

    context.lineTo(
        x + width - radius,
        y
    );

    context.quadraticCurveTo(
        x + width,
        y,
        x + width,
        y + radius
    );

    context.lineTo(
        x + width,
        y + height - radius
    );

    context.quadraticCurveTo(
        x + width,
        y + height,
        x + width - radius,
        y + height
    );

    context.lineTo(
        x + radius,
        y + height
    );

    context.quadraticCurveTo(
        x,
        y + height,
        x,
        y + height - radius
    );

    context.lineTo(
        x,
        y + radius
    );

    context.quadraticCurveTo(
        x,
        y,
        x + radius,
        y
    );

    context.closePath();
}


// ============================================================
// PAUSE SCREEN
// ============================================================

function drawPauseScreen() {

    if (!game.paused) {

        return;
    }

    ctx.fillStyle =
        "rgba(0,0,0,0.65)";

    ctx.fillRect(
        0,
        0,
        CONFIG.WIDTH,
        CONFIG.HEIGHT
    );

    ctx.textAlign =
        "center";

    ctx.textBaseline =
        "middle";

    ctx.font =
        "bold 58px Arial";

    ctx.fillStyle =
        "#ffffff";

    ctx.fillText(
        "PAUSED",
        CONFIG.WIDTH / 2,
        CONFIG.HEIGHT / 2 - 30
    );

    ctx.font =
        "18px Arial";

    ctx.fillStyle =
        "#9ca8d0";

    ctx.fillText(
        "Press P to continue",
        CONFIG.WIDTH / 2,
        CONFIG.HEIGHT / 2 + 35
    );
}


// ============================================================
// GAME OVER SCREEN
// ============================================================

function drawGameOver() {

    if (!game.gameOver) {

        return;
    }

    ctx.fillStyle =
        "rgba(0,0,0,0.72)";

    ctx.fillRect(
        0,
        0,
        CONFIG.WIDTH,
        CONFIG.HEIGHT
    );


    ctx.textAlign =
        "center";

    ctx.textBaseline =
        "middle";


    ctx.font =
        "bold 62px Arial";

    ctx.fillStyle =
        "#ff5577";

    ctx.shadowColor =
        "#ff3355";

    ctx.shadowBlur = 25;

    ctx.fillText(
        "GAME OVER",
        CONFIG.WIDTH / 2,
        CONFIG.HEIGHT / 2 - 100
    );

    ctx.shadowBlur = 0;


    ctx.font =
        "bold 30px Arial";

    ctx.fillStyle =
        "#ffffff";

    ctx.fillText(
        `SCORE ${game.score.toLocaleString()}`,
        CONFIG.WIDTH / 2,
        CONFIG.HEIGHT / 2 - 30
    );


    ctx.font =
        "18px Arial";

    ctx.fillStyle =
        "#aeb9db";

    ctx.fillText(
        `Problems solved: ${game.problemsSolved}`,
        CONFIG.WIDTH / 2,
        CONFIG.HEIGHT / 2 + 15
    );

    ctx.fillText(
        `Correct: ${game.correctAnswers}   Wrong: ${game.wrongAnswers}`,
        CONFIG.WIDTH / 2,
        CONFIG.HEIGHT / 2 + 45
    );


    ctx.font =
        "bold 20px Arial";

    ctx.fillStyle =
        "#63dcff";

    ctx.fillText(
        "PRESS R TO PLAY AGAIN",
        CONFIG.WIDTH / 2,
        CONFIG.HEIGHT / 2 + 105
    );
}


// ============================================================
// DRAW EVERYTHING
// ============================================================

function draw() {

    ctx.save();

    // Screen shake
    if (
        game.shakeTimer > 0
    ) {

        const strength =
            game.shakeAmount *
            (
                game.shakeTimer /
                CONFIG.SCREEN_SHAKE_DURATION
            );

        ctx.translate(
            random(
                -strength,
                strength
            ),

            random(
                -strength,
                strength
            )
        );
    }


    drawBackground();

    drawParticles();

    for (const enemy of enemies) {

        drawEnemy(enemy);
    }

    drawBullets();

    drawPlayer();

    drawFloatingTexts();

    ctx.restore();


    drawUI();

    drawPauseScreen();

    drawGameOver();
}


// ============================================================
// GAME OVER
// ============================================================

function endGame() {

    game.gameOver = true;

    game.running = false;

    createExplosion(
        player.x,
        player.y,
        100
    );

    if (
        game.score >
        game.highScore
    ) {

        game.highScore =
            game.score;

        localStorage.setItem(
            "mathSpaceHighScore",
            game.highScore
        );
    }
}


// ============================================================
// RESTART
// ============================================================

function restartGame() {

    game.running = true;

    game.paused = false;

    game.gameOver = false;

    game.score = 0;

    game.combo = 0;

    game.level = 1;

    game.wave = 1;

    game.difficulty = 1;

    game.waveTimer = 0;

    game.totalTime = 0;

    game.correctAnswers = 0;

    game.wrongAnswers = 0;

    game.problemsSolved = 0;

    game.shakeTimer = 0;

    game.shakeAmount = 0;


    player.x =
        CONFIG.WIDTH / 2;

    player.y =
        CONFIG.HEIGHT - 110;

    player.vx = 0;

    player.vy = 0;

    player.health =
        CONFIG.MAX_HEALTH;

    player.shootTimer = 0;

    player.invincibleTimer = 0;


    bullets.length = 0;

    enemies.length = 0;

    particles.length = 0;

    floatingTexts.length = 0;


    spawnTimer = 0;

    game.currentProblem =
        generateProblem();


    for (
        let i = 0;
        i < 3;
        i++
    ) {

        spawnEnemy();
    }
}


// ============================================================
// INITIALIZE
// ============================================================

function initializeGame() {

    createStars();

    game.currentProblem =
        generateProblem();

    for (
        let i = 0;
        i < CONFIG.INITIAL_ENEMIES;
        i++
    ) {

        spawnEnemy();
    }
}


// ============================================================
// MAIN LOOP
// ============================================================

let lastTime =
    performance.now();


function gameLoop(timestamp) {

    let dt =
        (timestamp - lastTime) /
        1000;

    lastTime =
        timestamp;

    // Prevent giant jumps after tab switching
    dt =
        Math.min(
            dt,
            0.033
        );

    update(dt);

    draw();

    requestAnimationFrame(
        gameLoop
    );
}


// ============================================================
// START GAME
// ============================================================

initializeGame();

requestAnimationFrame(
    gameLoop
);