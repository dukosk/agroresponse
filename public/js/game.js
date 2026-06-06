(function () {
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const startButton = document.getElementById('startGame');
  const messageEl = document.getElementById('gameMessage');

  const keys = new Set();

  let gridSize = 16;
  let cellSize = canvas.width / gridSize;
  let timerSeconds = 45;
  let registrationId = null;
  let eventSlug = AgroApi.eventSlug();
  let selectedMap = 'field';
  let backgroundImage = new Image();
  let backgroundReady = false;
  let drone = { x: 7, y: 7 };
  let target = { x: 0, y: 0 };
  let score = 0;
  let timeLeft = timerSeconds;
  let running = false;
  let lastMove = 0;
  let intervalId = null;
  let saved = false;
  let scoreAnimations = [];
  let droneAngle = 0;
  let actionPulseAt = 0;

  function randomTarget() {
    let next = { x: 0, y: 0 };
    do {
      next = {
        x: Math.floor(Math.random() * gridSize),
        y: Math.floor(Math.random() * gridSize),
      };
    } while (next.x === drone.x && next.y === drone.y);

    return next;
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (backgroundReady) {
      drawCoverImage(backgroundImage);
    } else {
      ctx.fillStyle = '#17351f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.fillStyle = 'rgba(3, 15, 8, 0.16)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i <= gridSize; i += 1) {
      ctx.strokeStyle = 'rgba(231, 255, 222, 0.38)';
      ctx.lineWidth = i % 4 === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, canvas.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(canvas.width, i * cellSize);
      ctx.stroke();
    }

    drawTarget();
    drawMissionEffect();
    drawDrone();
    drawScoreAnimations();
  }

  function drawCoverImage(image) {
    const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;
    ctx.drawImage(image, x, y, width, height);
  }

  function drawTarget() {
    const pulse = running ? Math.sin(Date.now() / 120) * 0.12 + 0.88 : 0.88;
    const pad = cellSize * 0.14;
    const x = target.x * cellSize + pad;
    const y = target.y * cellSize + pad;
    const size = cellSize - pad * 2;
    ctx.fillStyle = 'rgba(255, 59, 48, 0.26)';
    ctx.fillRect(target.x * cellSize, target.y * cellSize, cellSize, cellSize);
    ctx.fillStyle = 'rgba(255, 59, 48, ' + pulse + ')';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#fff2ee';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
  }

  function drawDrone() {
    const centerX = drone.x * cellSize + cellSize / 2;
    const centerY = drone.y * cellSize + cellSize / 2;
    const arm = cellSize * 0.35;
    const rotor = cellSize * 0.18;
    const bodyWidth = cellSize * 0.34;
    const bodyLength = cellSize * 0.58;
    const spin = Date.now() / 80;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(cellSize * 0.05, cellSize * 0.1, cellSize * 0.55, cellSize * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(droneAngle);

    ctx.strokeStyle = 'rgba(10, 18, 20, 0.82)';
    ctx.lineWidth = Math.max(9, cellSize * 0.13);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-arm, -arm);
    ctx.lineTo(arm, arm);
    ctx.moveTo(arm, -arm);
    ctx.lineTo(-arm, arm);
    ctx.stroke();

    ctx.strokeStyle = '#eef5f0';
    ctx.lineWidth = Math.max(6, cellSize * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-arm, -arm);
    ctx.lineTo(arm, arm);
    ctx.moveTo(arm, -arm);
    ctx.lineTo(-arm, arm);
    ctx.stroke();

    ctx.strokeStyle = '#6ee7d8';
    ctx.lineWidth = Math.max(2, cellSize * 0.025);
    ctx.beginPath();
    ctx.moveTo(-arm * 0.6, -arm * 0.6);
    ctx.lineTo(arm * 0.6, arm * 0.6);
    ctx.moveTo(arm * 0.6, -arm * 0.6);
    ctx.lineTo(-arm * 0.6, arm * 0.6);
    ctx.stroke();

    [[-arm, -arm], [arm, -arm], [-arm, arm], [arm, arm]].forEach(function (point, index) {
      ctx.save();
      ctx.translate(point[0], point[1]);
      ctx.rotate(spin + index);
      ctx.fillStyle = 'rgba(229, 248, 244, 0.42)';
      ctx.beginPath();
      ctx.ellipse(0, 0, rotor * 1.55, rotor * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.ellipse(0, 0, rotor * 1.55, rotor * 0.36, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f2f6f4';
      ctx.beginPath();
      ctx.arc(0, 0, rotor * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#172023';
      ctx.lineWidth = Math.max(2, cellSize * 0.03);
      ctx.stroke();

      ctx.fillStyle = index % 2 === 0 ? '#6ee7d8' : '#7bd95a';
      ctx.beginPath();
      ctx.arc(0, 0, rotor * 0.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.fillStyle = '#10181b';
    ctx.beginPath();
    roundedRect(-bodyWidth / 2 - 3, -bodyLength / 2 - 3, bodyWidth + 6, bodyLength + 6, cellSize * 0.1);
    ctx.fill();

    ctx.fillStyle = '#f4f7f5';
    ctx.beginPath();
    roundedRect(-bodyWidth / 2, -bodyLength / 2, bodyWidth, bodyLength, cellSize * 0.09);
    ctx.fill();

    ctx.fillStyle = '#303a3d';
    ctx.beginPath();
    roundedRect(-bodyWidth * 0.22, -bodyLength * 0.32, bodyWidth * 0.44, bodyLength * 0.64, cellSize * 0.045);
    ctx.fill();

    ctx.fillStyle = '#6ee7d8';
    ctx.beginPath();
    ctx.arc(-bodyWidth * 0.18, -bodyLength * 0.27, cellSize * 0.035, 0, Math.PI * 2);
    ctx.arc(bodyWidth * 0.18, -bodyLength * 0.27, cellSize * 0.035, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#7bd95a';
    ctx.beginPath();
    ctx.moveTo(0, -bodyLength * 0.58);
    ctx.lineTo(-bodyWidth * 0.32, -bodyLength * 0.18);
    ctx.lineTo(bodyWidth * 0.32, -bodyLength * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function roundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawMissionEffect() {
    const centerX = drone.x * cellSize + cellSize / 2;
    const centerY = drone.y * cellSize + cellSize / 2;
    const pulseAge = performance.now() - actionPulseAt;
    const activePulse = pulseAge < 520 ? 1 - pulseAge / 520 : 0;

    if (selectedMap === 'orchard') {
      const scan = cellSize * (0.72 + Math.sin(Date.now() / 420) * 0.07);
      ctx.strokeStyle = 'rgba(123, 217, 90, 0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerX, centerY, scan, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(123, 217, 90, 0.08)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, scan, 0, Math.PI * 2);
      ctx.fill();
    }

    if (selectedMap === 'forest') {
      const base = cellSize * (0.62 + (Date.now() % 1200) / 1200);
      ctx.strokeStyle = 'rgba(66, 212, 163, 0.38)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(centerX, centerY, base, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (selectedMap === 'field' && activePulse > 0) {
      ctx.strokeStyle = 'rgba(110, 231, 216, ' + (0.55 * activePulse) + ')';
      ctx.lineWidth = Math.max(3, cellSize * 0.05);
      ctx.beginPath();
      ctx.moveTo(centerX - cellSize * 0.8, centerY + cellSize * 0.28);
      ctx.lineTo(centerX + cellSize * 0.8, centerY + cellSize * 0.28);
      ctx.stroke();
      ctx.fillStyle = 'rgba(123, 217, 90, ' + (0.24 * activePulse) + ')';
      for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.arc(centerX + i * cellSize * 0.28, centerY + cellSize * 0.58, cellSize * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawScoreAnimations() {
    const now = performance.now();
    scoreAnimations = scoreAnimations.filter(function (item) {
      return now - item.createdAt < 720;
    });

    scoreAnimations.forEach(function (item) {
      const age = now - item.createdAt;
      const progress = age / 720;
      ctx.globalAlpha = 1 - progress;
      ctx.fillStyle = item.delta > 0 ? '#b8ff90' : '#ffb0aa';
      ctx.font = '900 ' + Math.round(cellSize * 0.48) + 'px Arial';
      ctx.textAlign = 'center';
      ctx.fillText((item.delta > 0 ? '+' : '') + item.delta, item.x, item.y - progress * cellSize * 1.4);
      ctx.globalAlpha = 1;
    });
  }

  function moveDrone(now) {
    if (!running || now - lastMove < 120) return;

    let dx = 0;
    let dy = 0;

    if (keys.has('ArrowUp') || keys.has('KeyW')) dy = -1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) dy = 1;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) dx = -1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) dx = 1;

    if (dx !== 0 || dy !== 0) {
      drone.x = Math.max(0, Math.min(gridSize - 1, drone.x + dx));
      drone.y = Math.max(0, Math.min(gridSize - 1, drone.y + dy));
      droneAngle = Math.atan2(dy, dx) + Math.PI / 2;
      lastMove = now;
    }
  }

  function updateScore(delta) {
    score += delta;
    scoreEl.textContent = score;
    scoreEl.animate(
      [
        { transform: 'scale(1)', color: '#f4fff7' },
        { transform: 'scale(1.22)', color: delta > 0 ? '#b8ff90' : '#ffb0aa' },
        { transform: 'scale(1)', color: '#f4fff7' },
      ],
      { duration: 340, easing: 'ease-out' }
    );
    scoreAnimations.push({
      delta: delta,
      x: drone.x * cellSize + cellSize / 2,
      y: drone.y * cellSize + cellSize / 2,
      createdAt: performance.now(),
    });
  }

  function performAction() {
    if (!running) return;

    actionPulseAt = performance.now();

    if (drone.x === target.x && drone.y === target.y) {
      updateScore(100);
      target = randomTarget();
      messageEl.textContent = 'Disease hotspot treated.';
    } else {
      updateScore(-50);
      messageEl.textContent = 'Treatment missed hotspot.';
    }
  }

  function loop(now) {
    moveDrone(now);
    draw();
    requestAnimationFrame(loop);
  }

  function startGame() {
    if (running || !registrationId) return;

    score = 0;
    timeLeft = timerSeconds;
    saved = false;
    drone = { x: Math.floor(gridSize / 2), y: Math.floor(gridSize / 2) };
    target = randomTarget();
    scoreEl.textContent = score;
    timeEl.textContent = timeLeft;
    messageEl.textContent = '';
    startButton.disabled = true;
    running = true;

    intervalId = window.setInterval(function () {
      timeLeft -= 1;
      timeEl.textContent = timeLeft;

      if (timeLeft <= 0) {
        finishGame();
      }
    }, 1000);
  }

  function finishGame() {
    if (!running || saved) return;

    running = false;
    saved = true;
    window.clearInterval(intervalId);
    startButton.disabled = false;
    startButton.textContent = 'Play Again';
    messageEl.textContent = 'Saving score...';

    AgroApi.post('/api/score', { registration_id: registrationId, score: score })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'Save failed');
        messageEl.innerHTML = 'Final score saved. <a href="/leaderboard.html?event=' +
          encodeURIComponent(data.eventSlug) + '">View leaderboard</a>.';
      })
      .catch(function () {
        messageEl.textContent = 'Score could not be saved. Try refreshing after checking the server.';
      });
  }

  window.addEventListener('keydown', function (event) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }

    if (event.code === 'Space') {
      performAction();
      return;
    }

    keys.add(event.code);
  });

  window.addEventListener('keyup', function (event) {
    keys.delete(event.code);
  });

  function loadPlayer() {
    const params = new URLSearchParams(window.location.search);
    const id = Number.parseInt(params.get('id'), 10);

    if (!Number.isInteger(id)) {
      messageEl.textContent = 'Missing player id.';
      draw();
      return;
    }

    Promise.all([AgroApi.config(), AgroApi.get('/api/player/' + id)])
      .then(function (results) {
        const config = results[0];
        const player = results[1].player;
        gridSize = config.gridSize;
        timerSeconds = config.timerSeconds;
        cellSize = canvas.width / gridSize;
        registrationId = player.id;
        eventSlug = player.event_slug;
        selectedMap = player.selected_map;
        drone = { x: Math.floor(gridSize / 2), y: Math.floor(gridSize / 2) };
        target = randomTarget();
        timeLeft = timerSeconds;
        timeEl.textContent = timeLeft;
        document.getElementById('playerName').textContent = player.name;
        document.getElementById('playerMeta').textContent = 'Queue #' + player.queue_number + ' · ' + AgroApi.title(player.selected_map) + ' Disease Response';
        document.getElementById('queueLink').href = '/queue.html?event=' + encodeURIComponent(eventSlug);
        document.getElementById('leaderboardLink').href = '/leaderboard.html?event=' + encodeURIComponent(eventSlug);
        document.getElementById('playersLink').href = '/players.html?event=' + encodeURIComponent(eventSlug);
        loadBackground(selectedMap);
        startButton.disabled = false;
        draw();
      })
      .catch(function () {
        messageEl.textContent = 'Player could not be loaded.';
        draw();
      });
  }

  function loadBackground(map) {
    backgroundReady = false;
    backgroundImage = new Image();
    backgroundImage.onload = function () {
      backgroundReady = true;
      draw();
    };
    backgroundImage.src = '/img/' + map + '-aerial.png';
  }

  target = randomTarget();
  startButton.addEventListener('click', startGame);
  loadPlayer();
  requestAnimationFrame(loop);
})();
