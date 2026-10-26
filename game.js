// =============================================
//  BRICK BREAKER – SPECIAL EDITION + GOOGLE
//  Game Logic (Vanilla JS + Canvas API)
// =============================================

(function () {
  "use strict";

  /* ── Canvas Setup ─────────────────────────── */
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const CANVAS_W = 480;
  const CANVAS_H = 620;
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;

  /* ── Game Constants ───────────────────────── */
  const PADDLE_H = 14;
  const PADDLE_W_BASE = 90;
  const BALL_RADIUS = 7;
  const BRICK_COLS = 9;
  const BRICK_ROWS = 6;
  const BRICK_GAP = 5;
  const BRICK_TOP_OFFSET = 60;
  const BRICK_SIDE_OFFSET = 14;
  const BRICK_W = Math.floor((CANVAS_W - BRICK_SIDE_OFFSET * 2 - BRICK_GAP * (BRICK_COLS - 1)) / BRICK_COLS);
  const BRICK_H = 22;

  /* ── Brick Types ──────────────────────────── */
  const BRICK_TYPE = {
    NORMAL:  "normal",
    DOUBLE:  "double",   // splits ball into 2
    ROW:     "row",      // destroys entire row
    COL:     "col",      // destroys entire column
    HARD:    "hard",     // requires 2+ hits
    LASER:   "laser",    // paddle gains laser cannons
    WIDE:    "wide",     // paddle becomes wider
    SLOW:    "slow",     // slows all balls
    SHIELD:  "shield",   // safety net at bottom
    BOMB:    "bomb",     // radial explosion
    LIFE:    "life",     // +1 life
  };

  /* ── Colors / Themes ──────────────────────── */
  const COLORS = {
    normal:      ["#1a6aff", "#0044cc"],
    double:      ["#ff0088", "#aa0055"],
    row:         ["#00ff88", "#008844"],
    col:         ["#ff6600", "#aa3300"],
    hard:        ["#b400ff", "#7700aa"],
    hardDamaged: ["#7700aa", "#440066"],
    laser:       ["#ff3300", "#aa1100"],
    wide:        ["#00ccff", "#006688"],
    slow:        ["#00ffee", "#008877"],
    shield:      ["#ffdd00", "#aa8800"],
    bomb:        ["#ff6600", "#881100"],
    life:        ["#ff4466", "#aa1133"],
    paddle:      ["#00d4ff", "#0077aa"],
    ball:        ["#ffffff", "#aaddff"],
  };

  /* ── State ────────────────────────────────── */
  let score, lives, level, gameState, bricks, balls, paddle;
  let particles = [];
  let explosionRings = [];
  let lasers = [];
  let powerupTimers = {};   // { laser: timeLeft, wide: timeLeft, slow: timeLeft }
  let shield = null;        // { y, life }
  let mouseX = CANVAS_W / 2;
  let keysHeld = { left: false, right: false };
  let paused = false;
  let lastTime = 0;
  let laserCooldown = 0;

  /* ── DOM refs ─────────────────────────────── */
  const scoreEl     = document.getElementById("score");
  const ballCountEl = document.getElementById("ball-count");
  const levelEl     = document.getElementById("level");
  const livesEl     = document.getElementById("lives");
  const overlay     = document.getElementById("overlay");
  const gameoverOverlay = document.getElementById("gameover-overlay");
  const levelupOverlay  = document.getElementById("levelup-overlay");
  const startBtn    = document.getElementById("start-btn");
  const restartBtn  = document.getElementById("restart-btn");
  const finalScore  = document.getElementById("final-score");
  const levelDisplay = document.getElementById("level-display");
  const powerupBar  = document.getElementById("powerup-bar");

  /* ═══════════════════════════════════════════
     INITIALISATION
  ═══════════════════════════════════════════ */
  function initGame() {
    score = 0;
    lives = 3;
    level = 1;
    paused = false;
    particles = [];
    explosionRings = [];
    lasers = [];
    powerupTimers = {};
    shield = null;
    laserCooldown = 0;
    updateHUD();
    createPaddle();
    createBricks();
    spawnBall();
    gameState = "playing";
  }

  function createPaddle() {
    paddle = {
      x: CANVAS_W / 2 - PADDLE_W_BASE / 2,
      y: CANVAS_H - 40,
      w: PADDLE_W_BASE,
      h: PADDLE_H,
      speed: 7,
    };
  }

  function spawnBall(x, y, vx, vy) {
    const angle = (Math.random() * 60 + 60) * (Math.PI / 180);
    const baseSpeed = 3.5 + level * 0.25;
    const speed = powerupTimers.slow > 0 ? baseSpeed * 0.6 : baseSpeed;
    balls.push({
      x:  x  !== undefined ? x  : CANVAS_W / 2,
      y:  y  !== undefined ? y  : paddle.y - BALL_RADIUS - 2,
      vx: vx !== undefined ? vx : Math.cos(angle) * speed * (Math.random() < 0.5 ? 1 : -1),
      vy: vy !== undefined ? vy : -Math.abs(Math.sin(angle) * speed),
      radius: BALL_RADIUS,
      trail: [],
      fire: false,    // fireball (penetrates)
      fireTimer: 0,
    });
  }

  /* ── Brick Grid ──────────────────────────── */
  function createBricks() {
    balls = [];
    bricks = [];
    const specialChance = 0.08 + level * 0.025;
    const hardChance    = 0.04 + level * 0.015;

    // All special types pool
    const specialTypes = [
      BRICK_TYPE.DOUBLE,
      BRICK_TYPE.ROW,
      BRICK_TYPE.COL,
      BRICK_TYPE.LASER,
      BRICK_TYPE.WIDE,
      BRICK_TYPE.SLOW,
      BRICK_TYPE.SHIELD,
      BRICK_TYPE.BOMB,
      BRICK_TYPE.LIFE,
    ];

    for (let r = 0; r < BRICK_ROWS; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        const rnd = Math.random();
        let type = BRICK_TYPE.NORMAL;
        let hp = 1;

        if (rnd < hardChance) {
          type = BRICK_TYPE.HARD;
          hp = Math.random() < 0.3 ? 3 : 2;
        } else if (rnd < hardChance + specialChance) {
          type = specialTypes[Math.floor(Math.random() * specialTypes.length)];
        }

        bricks.push({
          col: c, row: r,
          x: BRICK_SIDE_OFFSET + c * (BRICK_W + BRICK_GAP),
          y: BRICK_TOP_OFFSET  + r * (BRICK_H + BRICK_GAP),
          w: BRICK_W, h: BRICK_H,
          type, hp,
          alive: true,
          glimmer: Math.random() * Math.PI * 2,
          _flash: 0,
        });
      }
    }
  }

  /* ═══════════════════════════════════════════
     GAME LOOP
  ═══════════════════════════════════════════ */
  function loop(ts) {
    const dt = Math.min((ts - lastTime) / 16.67, 3);
    lastTime = ts;

    if (!paused && gameState === "playing") {
      update(dt);
    }
    draw();
    requestAnimationFrame(loop);
  }

  /* ─── UPDATE ──────────────────────────────── */
  function update(dt) {
    movePaddle(dt);
    updatePaddle(dt);
    updateBalls(dt);
    updateLasers(dt);
    updateShield(dt);
    updateParticles(dt);
    updateExplosionRings(dt);
    updatePowerupTimers(dt);
    checkLevelComplete();
  }

  /* ── Paddle movement ─────────────────────── */
  function movePaddle(dt) {
    if (keysHeld.left)  paddle.x -= paddle.speed * dt;
    if (keysHeld.right) paddle.x += paddle.speed * dt;

    const target = mouseX - paddle.w / 2;
    paddle.x += (target - paddle.x) * 0.18 * dt;
    paddle.x = Math.max(0, Math.min(CANVAS_W - paddle.w, paddle.x));
  }

  /* ── Paddle width animation ──────────────── */
  function updatePaddle(dt) {
    const targetW = powerupTimers.wide > 0 ? PADDLE_W_BASE * 1.75 : PADDLE_W_BASE;
    paddle.w += (targetW - paddle.w) * 0.08 * dt;
  }

  /* ── Powerup timers ──────────────────────── */
  function updatePowerupTimers(dt) {
    Object.keys(powerupTimers).forEach((k) => {
      powerupTimers[k] -= dt;
      if (powerupTimers[k] <= 0) delete powerupTimers[k];
    });
    renderPowerupBar();
  }

  /* ── Laser auto-fire ─────────────────────── */
  function updateLasers(dt) {
    if (powerupTimers.laser > 0) {
      laserCooldown -= dt;
      if (laserCooldown <= 0) {
        fireLasers();
        laserCooldown = 22; // frames
      }
    }

    for (let i = lasers.length - 1; i >= 0; i--) {
      const l = lasers[i];
      l.y -= 7 * dt;

      let hit = false;
      for (let j = 0; j < bricks.length; j++) {
        const b = bricks[j];
        if (!b.alive) continue;
        if (l.x >= b.x && l.x <= b.x + b.w && l.y >= b.y && l.y <= b.y + b.h) {
          hitBrick(b, null, -1);
          hit = true;
          break;
        }
      }
      if (hit || l.y < 0) lasers.splice(i, 1);
    }
  }

  function fireLasers() {
    const lx = paddle.x + 4;
    const rx = paddle.x + paddle.w - 4;
    const y  = paddle.y - 2;
    lasers.push({ x: lx, y, color: "#ff3300" });
    lasers.push({ x: rx, y, color: "#ff3300" });
    spawnParticles(lx, y, "#ff3300", 4);
    spawnParticles(rx, y, "#ff3300", 4);
  }

  /* ── Shield ──────────────────────────────── */
  function updateShield(dt) {
    if (!shield) return;
    shield.life -= 0.003 * dt;
    if (shield.life <= 0) shield = null;
  }

  /* ── Balls ───────────────────────────────── */
  function updateBalls(dt) {
    const toRemove = [];

    balls.forEach((ball, idx) => {
      // Trail
      ball.trail.push({ x: ball.x, y: ball.y });
      if (ball.trail.length > 14) ball.trail.shift();

      // Fire timer
      if (ball.fire) {
        ball.fireTimer -= dt;
        if (ball.fireTimer <= 0) ball.fire = false;
      }

      // Apply slow
      const slowFactor = powerupTimers.slow > 0 ? 0.6 : 1;

      ball.x += ball.vx * dt * slowFactor;
      ball.y += ball.vy * dt * slowFactor;

      // Wall bounces
      if (ball.x - ball.radius < 0)       { ball.x = ball.radius;         ball.vx =  Math.abs(ball.vx); }
      if (ball.x + ball.radius > CANVAS_W) { ball.x = CANVAS_W - ball.radius; ball.vx = -Math.abs(ball.vx); }
      if (ball.y - ball.radius < 0)        { ball.y = ball.radius;         ball.vy =  Math.abs(ball.vy); }

      // Paddle collision
      if (
        ball.vy > 0 &&
        ball.y + ball.radius >= paddle.y &&
        ball.y - ball.radius <= paddle.y + paddle.h &&
        ball.x >= paddle.x &&
        ball.x <= paddle.x + paddle.w
      ) {
        const hitPos = (ball.x - paddle.x) / paddle.w;
        const angle  = (hitPos - 0.5) * (Math.PI * 0.65);
        const speed  = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        ball.vx = Math.sin(angle) * speed;
        ball.vy = -Math.cos(angle) * speed;
        ball.y  = paddle.y - ball.radius;
        spawnPaddleParticles(ball.x, paddle.y);
      }

      // Shield bounce
      if (shield && ball.vy > 0 && ball.y + ball.radius >= shield.y && ball.y + ball.radius <= shield.y + 8) {
        ball.vy = -Math.abs(ball.vy);
        ball.y  = shield.y - ball.radius;
        spawnParticles(ball.x, shield.y, "#ffdd00", 8);
      }

      // Brick collision
      let brickHitCount = 0;
      for (let i = 0; i < bricks.length; i++) {
        const b = bricks[i];
        if (!b.alive) continue;
        if (circleRectCollide(ball, b)) {
          if (ball.fire) {
            // Fireball: pass through, just destroy
            hitBrick(b, ball, idx);
            brickHitCount++;
            if (brickHitCount >= 3) break; // max 3 penetrations per frame
          } else {
            resolveBallBrickCollision(ball, b, idx);
            break;
          }
        }
      }

      // Ball lost
      if (ball.y - ball.radius > CANVAS_H) {
        toRemove.push(idx);
      }
    });

    for (let i = toRemove.length - 1; i >= 0; i--) {
      balls.splice(toRemove[i], 1);
    }

    if (balls.length === 0) loseLife();
  }

  function circleRectCollide(ball, rect) {
    const nearX = Math.max(rect.x, Math.min(ball.x, rect.x + rect.w));
    const nearY = Math.max(rect.y, Math.min(ball.y, rect.y + rect.h));
    const dx = ball.x - nearX;
    const dy = ball.y - nearY;
    return dx * dx + dy * dy < ball.radius * ball.radius;
  }

  function resolveBallBrickCollision(ball, brick, ballIdx) {
    const nearX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.w));
    const nearY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.h));
    const dx = ball.x - nearX;
    const dy = ball.y - nearY;
    if (Math.abs(dx) > Math.abs(dy)) ball.vx = -ball.vx;
    else ball.vy = -ball.vy;
    hitBrick(brick, ball, ballIdx);
  }

  /* ── Brick hit / destroy ─────────────────── */
  function hitBrick(brick, ball, ballIdx) {
    brick.hp--;
    flashBrick(brick);
    if (brick.hp <= 0) {
      destroyBrick(brick, ball, ballIdx);
    } else {
      spawnParticles(brick.x + brick.w / 2, brick.y + brick.h / 2, getTypeColor(brick.type), 6);
    }
  }

  function destroyBrick(brick, ball, ballIdx) {
    brick.alive = false;

    const pts =
      brick.type === BRICK_TYPE.NORMAL ? 10 :
      brick.type === BRICK_TYPE.HARD   ? 30 : 60;
    addScore(pts);

    const cx = brick.x + brick.w / 2;
    const cy = brick.y + brick.h / 2;
    const color = getTypeColor(brick.type);

    spawnParticles(cx, cy, color, brick.type === BRICK_TYPE.NORMAL ? 12 : 22);
    addExplosionRing(cx, cy, color);

    // Special effects
    switch (brick.type) {
      case BRICK_TYPE.DOUBLE: activateDouble(ball, cx, cy); break;
      case BRICK_TYPE.ROW:    activateRow(brick.row);       break;
      case BRICK_TYPE.COL:    activateCol(brick.col);       break;
      case BRICK_TYPE.LASER:  activateLaser(cx, cy);        break;
      case BRICK_TYPE.WIDE:   activateWide(cx, cy);         break;
      case BRICK_TYPE.SLOW:   activateSlow(cx, cy);         break;
      case BRICK_TYPE.SHIELD: activateShield(cx, cy);       break;
      case BRICK_TYPE.BOMB:   activateBomb(brick, cx, cy);  break;
      case BRICK_TYPE.LIFE:   activateLife(cx, cy);         break;
    }
  }

  /* ═══════════════════════════════════════════
     SPECIAL BRICK EFFECTS
  ═══════════════════════════════════════════ */

  // ✕2 공 2배
  function activateDouble(sourceBall, cx, cy) {
    showSpecialMessage("✕2  공이 2배로!", "#ff0088");
    const src = sourceBall || balls[0];
    if (!src) return;
    const speed = Math.sqrt(src.vx * src.vx + src.vy * src.vy);
    const angle = Math.atan2(src.vy, src.vx) + (Math.random() < 0.5 ? 0.4 : -0.4);
    spawnBall(src.x, src.y, Math.cos(angle) * speed, Math.sin(angle) * speed);
    updateHUD();
    spawnParticles(cx, cy, "#ff0088", 30);
  }

  // ↔ 가로 폭발
  function activateRow(row) {
    showSpecialMessage("↔  가로 폭발!", "#00ff88");
    bricks.forEach((b) => {
      if (b.row === row && b.alive) {
        b.alive = false; addScore(15);
        spawnParticles(b.x + b.w/2, b.y + b.h/2, "#00ff88", 8);
        addExplosionRing(b.x + b.w/2, b.y + b.h/2, "#00ff88");
      }
    });
  }

  // ↕ 세로 폭발
  function activateCol(col) {
    showSpecialMessage("↕  세로 폭발!", "#ff6600");
    bricks.forEach((b) => {
      if (b.col === col && b.alive) {
        b.alive = false; addScore(15);
        spawnParticles(b.x + b.w/2, b.y + b.h/2, "#ff6600", 8);
        addExplosionRing(b.x + b.w/2, b.y + b.h/2, "#ff6600");
      }
    });
  }

  // 🔫 레이저
  function activateLaser(cx, cy) {
    showSpecialMessage("🔫  레이저 발사!", "#ff3300");
    powerupTimers.laser = 300; // frames
    spawnParticles(cx, cy, "#ff3300", 25);
  }

  // 📐 와이드 패들
  function activateWide(cx, cy) {
    showSpecialMessage("📐  와이드 패들!", "#00ccff");
    powerupTimers.wide = 420; // frames
    spawnParticles(cx, cy, "#00ccff", 20);
  }

  // 🐢 슬로우
  function activateSlow(cx, cy) {
    showSpecialMessage("🐢  슬로우!", "#00ffee");
    powerupTimers.slow = 360; // frames
    spawnParticles(cx, cy, "#00ffee", 20);
  }

  // 🛡️ 안전망 (세이프티 넷)
  function activateShield(cx, cy) {
    showSpecialMessage("🛡️  안전망 생성!", "#ffdd00");
    shield = { y: CANVAS_H - 18, life: 1 };
    spawnParticles(cx, cy, "#ffdd00", 25);
    addExplosionRing(cx, cy, "#ffdd00");
  }

  // 💣 폭탄 - 주변 범위 폭발
  function activateBomb(brick, cx, cy) {
    showSpecialMessage("💣  폭탄 폭발!", "#ff6600");
    const BOMB_RADIUS = 90;
    bricks.forEach((b) => {
      if (!b.alive) return;
      const dx = (b.x + b.w / 2) - cx;
      const dy = (b.y + b.h / 2) - cy;
      if (Math.sqrt(dx*dx + dy*dy) <= BOMB_RADIUS) {
        b.alive = false; addScore(20);
        spawnParticles(b.x + b.w/2, b.y + b.h/2, "#ff6600", 10);
        addExplosionRing(b.x + b.w/2, b.y + b.h/2, "#ff8800");
      }
    });
    // Big ring
    for (let r = 0; r < 3; r++) {
      setTimeout(() => addExplosionRing(cx, cy, "#ff4400"), r * 80);
    }
  }

  // ❤️ 목숨 +1
  function activateLife(cx, cy) {
    showSpecialMessage("❤️  목숨 +1!", "#ff4466");
    lives = Math.min(lives + 1, 9);
    updateHUD();
    spawnParticles(cx, cy, "#ff4466", 30);
    addExplosionRing(cx, cy, "#ff4466");
  }

  /* ── Helper ──────────────────────────────── */
  function getTypeColor(type) {
    const map = {
      double: "#ff0088", row: "#00ff88", col: "#ff6600",
      hard: "#b400ff", laser: "#ff3300", wide: "#00ccff",
      slow: "#00ffee", shield: "#ffdd00", bomb: "#ff6600",
      life: "#ff4466",
    };
    return map[type] || "#1a6aff";
  }

  function getTypeLabel(b) {
    switch (b.type) {
      case BRICK_TYPE.DOUBLE: return "✕2";
      case BRICK_TYPE.ROW:    return "↔";
      case BRICK_TYPE.COL:    return "↕";
      case BRICK_TYPE.HARD:   return b.hp >= 3 ? "■■■" : b.hp === 2 ? "■■" : "■";
      case BRICK_TYPE.LASER:  return "🔫";
      case BRICK_TYPE.WIDE:   return "📐";
      case BRICK_TYPE.SLOW:   return "🐢";
      case BRICK_TYPE.SHIELD: return "🛡";
      case BRICK_TYPE.BOMB:   return "💣";
      case BRICK_TYPE.LIFE:   return "❤";
      default: return "";
    }
  }

  /* ── Particles ───────────────────────────── */
  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * 4 + 1;
      particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 1,
        decay: Math.random() * 0.04 + 0.02,
        size: Math.random() * 4 + 1,
        color,
      });
    }
  }

  function spawnPaddleParticles(x, y) {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      particles.push({
        x, y,
        vx: Math.cos(a) * (Math.random() * 3 + 1),
        vy: Math.sin(a) * (Math.random() * 3 + 1),
        life: 1, decay: 0.06,
        size: Math.random() * 3 + 1,
        color: powerupTimers.wide > 0 ? "#00ccff" : "#00d4ff",
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.08 * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function addExplosionRing(x, y, color) {
    explosionRings.push({ x, y, r: 0, life: 1, color });
  }

  function updateExplosionRings(dt) {
    for (let i = explosionRings.length - 1; i >= 0; i--) {
      const ring = explosionRings[i];
      ring.r    += 3 * dt;
      ring.life -= 0.04 * dt;
      if (ring.life <= 0) explosionRings.splice(i, 1);
    }
  }

  /* ── Score & Lives ───────────────────────── */
  function addScore(pts) {
    score += pts;
    scoreEl.textContent = score;
    scoreEl.classList.remove("score-bump");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("score-bump");
  }

  function loseLife() {
    lives--;
    livesEl.textContent = lives;
    shield = null;
    if (lives <= 0) {
      gameOver();
    } else {
      setTimeout(() => {
        if (gameState === "playing") { spawnBall(); updateHUD(); }
      }, 700);
    }
  }

  function gameOver() {
    gameState = "gameover";
    finalScore.textContent = score;
    gameoverOverlay.classList.remove("hidden");
    gameoverOverlay.classList.add("visible");
  }

  function checkLevelComplete() {
    if (bricks.filter((b) => b.alive).length === 0) {
      level++;
      showLevelUp();
    }
  }

  function showLevelUp() {
    gameState = "levelup";
    levelDisplay.textContent = `LEVEL ${level}`;
    levelupOverlay.classList.remove("hidden");
    levelupOverlay.classList.add("visible");
    setTimeout(() => {
      levelupOverlay.classList.remove("visible");
      levelupOverlay.classList.add("hidden");
      powerupTimers = {};
      shield = null;
      createBricks();
      spawnBall();
      updateHUD();
      gameState = "playing";
    }, 2200);
  }

  function updateHUD() {
    scoreEl.textContent   = score;
    ballCountEl.textContent = balls.length;
    levelEl.textContent   = level;
    livesEl.textContent   = lives;
  }

  /* ── Powerup bar ─────────────────────────── */
  function renderPowerupBar() {
    if (!powerupBar) return;
    powerupBar.innerHTML = "";
    const order = [
      { key: "laser",  icon: "🔫", label: "레이저",  color: "#ff3300" },
      { key: "wide",   icon: "📐", label: "와이드",  color: "#00ccff" },
      { key: "slow",   icon: "🐢", label: "슬로우",  color: "#00ffee" },
    ];
    order.forEach(({ key, icon, label, color }) => {
      if (!powerupTimers[key]) return;
      const pct = Math.min(1, powerupTimers[key] / 400) * 100;
      const el = document.createElement("div");
      el.className = "powerup-chip";
      el.innerHTML = `
        <span>${icon} ${label}</span>
        <div class="powerup-progress" style="--clr:${color}; --pct:${pct}%"></div>
      `;
      powerupBar.appendChild(el);
    });
    if (shield) {
      const el = document.createElement("div");
      el.className = "powerup-chip";
      el.innerHTML = `<span>🛡️ 안전망</span>
        <div class="powerup-progress" style="--clr:#ffdd00; --pct:${Math.min(100, shield.life*100)}%"></div>`;
      powerupBar.appendChild(el);
    }
  }

  /* ── Toast messages ──────────────────────── */
  const toasts = [];
  function showSpecialMessage(msg, color) {
    toasts.push({ msg, color, y: CANVAS_H / 2 - 20, life: 1 });
  }

  function flashBrick(brick) { brick._flash = 1.0; }

  /* ═══════════════════════════════════════════
     DRAWING
  ═══════════════════════════════════════════ */
  function draw() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawGrid();
    drawExplosionRings();
    drawBricks();
    drawShield();
    drawPaddle();
    drawLasers();
    drawBalls();
    drawParticles();
    drawToasts();
  }

  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.02)";
    ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_W; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
    }
    for (let y = 0; y < CANVAS_H; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawBricks() {
    const t = Date.now() / 1000;
    bricks.forEach((b) => {
      if (!b.alive) return;
      b.glimmer += 0.03;
      const shine = (Math.sin(b.glimmer + t) + 1) / 2 * 0.15;

      let [c1, c2] = COLORS[b.type] || COLORS.normal;
      if (b.type === BRICK_TYPE.HARD && b.hp === 1) [c1, c2] = COLORS.hardDamaged;

      ctx.save();

      // Body gradient
      const grad = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      roundRect(ctx, b.x, b.y, b.w, b.h, 5);
      ctx.fillStyle = grad;
      ctx.fill();

      // Shine
      if (shine > 0) {
        const sg = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
        sg.addColorStop(0, `rgba(255,255,255,${shine})`);
        sg.addColorStop(1, "transparent");
        roundRect(ctx, b.x, b.y, b.w, b.h, 5);
        ctx.fillStyle = sg;
        ctx.fill();
      }

      // Flash
      if (b._flash > 0) {
        roundRect(ctx, b.x, b.y, b.w, b.h, 5);
        ctx.fillStyle = `rgba(255,255,255,${b._flash * 0.55})`;
        ctx.fill();
        b._flash = Math.max(0, b._flash - 0.1);
      }

      // Border
      roundRect(ctx, b.x, b.y, b.w, b.h, 5);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Glow + neon border on specials
      if (b.type !== BRICK_TYPE.NORMAL) {
        const pulse = Math.sin(t * 3 + b.glimmer);
        ctx.shadowBlur = 14 + pulse * 5;
        ctx.shadowColor = c1;
        roundRect(ctx, b.x, b.y, b.w, b.h, 5);
        ctx.strokeStyle = c1;
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Label / emoji
      const label = getTypeLabel(b);
      if (label) {
        ctx.font = `bold 11px Orbitron, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.shadowBlur = 8;
        ctx.shadowColor = "#fff";
        ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);
        ctx.shadowBlur = 0;
      }

      ctx.restore();
    });
  }

  function drawPaddle() {
    const t = Date.now() / 1000;
    const isWide   = powerupTimers.wide > 0;
    const isLaser  = powerupTimers.laser > 0;
    const padColor1 = isLaser ? "#ff6600" : isWide ? "#00ccff" : COLORS.paddle[0];
    const padColor2 = isLaser ? "#aa2200" : isWide ? "#006688" : COLORS.paddle[1];

    ctx.save();
    ctx.shadowBlur = 16 + Math.sin(t * 2) * 5;
    ctx.shadowColor = padColor1;

    const grad = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x + paddle.w, paddle.y + paddle.h);
    grad.addColorStop(0, padColor1);
    grad.addColorStop(1, padColor2);

    roundRect(ctx, paddle.x, paddle.y, paddle.w, paddle.h, 7);
    ctx.fillStyle = grad;
    ctx.fill();

    // Highlight
    const hi = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.h / 2);
    hi.addColorStop(0, "rgba(255,255,255,0.35)");
    hi.addColorStop(1, "rgba(255,255,255,0)");
    roundRect(ctx, paddle.x, paddle.y, paddle.w, paddle.h / 2, 7);
    ctx.fillStyle = hi;
    ctx.fill();

    // Laser cannon nubs
    if (isLaser) {
      ctx.fillStyle = "#ff3300";
      ctx.shadowColor = "#ff3300";
      ctx.shadowBlur = 10;
      ctx.fillRect(paddle.x,              paddle.y - 6, 6, 8);
      ctx.fillRect(paddle.x + paddle.w - 6, paddle.y - 6, 6, 8);
    }

    ctx.restore();
  }

  function drawLasers() {
    lasers.forEach((l) => {
      ctx.save();
      ctx.shadowBlur = 12;
      ctx.shadowColor = l.color;
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x, l.y - 18);
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(l.x, l.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawShield() {
    if (!shield) return;
    ctx.save();
    ctx.globalAlpha = shield.life;
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#ffdd00";
    const grad = ctx.createLinearGradient(0, shield.y, CANVAS_W, shield.y);
    grad.addColorStop(0,   "transparent");
    grad.addColorStop(0.1, "#ffdd00");
    grad.addColorStop(0.9, "#ffdd00");
    grad.addColorStop(1,   "transparent");
    ctx.fillStyle = grad;
    ctx.fillRect(0, shield.y, CANVAS_W, 5);
    ctx.restore();
  }

  function drawBalls() {
    balls.forEach((ball) => {
      const isFire = ball.fire;
      const trailColor = isFire ? "#ff4400" : (powerupTimers.slow > 0 ? "#00ffee" : "#00d4ff");

      // Trail
      ball.trail.forEach((pt, i) => {
        const a = (i / ball.trail.length) * 0.45;
        const s = ball.radius * (i / ball.trail.length) * 0.7;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = trailColor;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, s, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      ctx.save();
      ctx.shadowBlur  = isFire ? 35 : 20;
      ctx.shadowColor = isFire ? "#ff4400" : trailColor;

      const grad = ctx.createRadialGradient(
        ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.3, 0,
        ball.x, ball.y, ball.radius
      );
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.6, isFire ? "#ffaa44" : "#aaddff");
      grad.addColorStop(1,   isFire ? "#ff4400" : "#0077aa");

      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    });
  }

  function drawParticles() {
    particles.forEach((p) => {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle   = p.color;
      ctx.shadowBlur  = 6;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function drawExplosionRings() {
    explosionRings.forEach((ring) => {
      ctx.save();
      ctx.globalAlpha = ring.life * 0.6;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 10;
      ctx.shadowColor = ring.color;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawToasts() {
    for (let i = toasts.length - 1; i >= 0; i--) {
      const toast = toasts[i];
      toast.y    -= 0.7;
      toast.life -= 0.012;
      if (toast.life <= 0) { toasts.splice(i, 1); continue; }

      ctx.save();
      ctx.globalAlpha = Math.min(1, toast.life * 2);
      ctx.font        = `bold 20px Orbitron, monospace`;
      ctx.textAlign   = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle   = toast.color;
      ctx.shadowBlur  = 20;
      ctx.shadowColor = toast.color;
      ctx.fillText(toast.msg, CANVAS_W / 2, toast.y);
      ctx.restore();
    }
  }

  /* ── Utility ──────────────────────────────── */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ═══════════════════════════════════════════
     INPUT
  ═══════════════════════════════════════════ */
  window.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft"  || e.key === "a") keysHeld.left  = true;
    if (e.key === "ArrowRight" || e.key === "d") keysHeld.right = true;
    if ((e.key === " " || e.key === "Escape") && gameState === "playing") {
      paused = !paused;
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.key === "ArrowLeft"  || e.key === "a") keysHeld.left  = false;
    if (e.key === "ArrowRight" || e.key === "d") keysHeld.right = false;
  });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    mouseX = e.touches[0].clientX - rect.left;
  }, { passive: false });

  /* ── Buttons ─────────────────────────────── */
  startBtn.addEventListener("click", () => {
    overlay.classList.remove("visible");
    overlay.classList.add("hidden");
    initGame();
    lastTime = performance.now();
    requestAnimationFrame(loop);
  });

  restartBtn.addEventListener("click", () => {
    gameoverOverlay.classList.remove("visible");
    gameoverOverlay.classList.add("hidden");
    initGame();
  });

  /* ── Initial preview frame ───────────────── */
  bricks = []; balls = []; particles = []; explosionRings = []; lasers = [];
  paddle = { x: CANVAS_W / 2 - PADDLE_W_BASE / 2, y: CANVAS_H - 40, w: PADDLE_W_BASE, h: PADDLE_H };
  shield = null;
  draw();

})();
