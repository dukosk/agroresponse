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
  let drone = { x: 7, y: 7 };
  let target = { x: 0, y: 0 };
  let score = 0;
  let timeLeft = timerSeconds;
  let running = false;
  let lastMove = 0;
  let intervalId = null;
  let saved = false;

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
    ctx.fillStyle = '#eaf2e5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i <= gridSize; i += 1) {
      ctx.strokeStyle = '#bfd1b7';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, canvas.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(canvas.width, i * cellSize);
      ctx.stroke();
    }

    ctx.fillStyle = '#d92d20';
    ctx.fillRect(target.x * cellSize + 5, target.y * cellSize + 5, cellSize - 10, cellSize - 10);

    const centerX = drone.x * cellSize + cellSize / 2;
    const centerY = drone.y * cellSize + cellSize / 2;
    ctx.fillStyle = '#1f7a8c';
    ctx.beginPath();
    ctx.arc(centerX, centerY, cellSize * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#102a43';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(centerX - 18, centerY);
    ctx.lineTo(centerX + 18, centerY);
    ctx.moveTo(centerX, centerY - 18);
    ctx.lineTo(centerX, centerY + 18);
    ctx.stroke();
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
      lastMove = now;
    }
  }

  function updateScore(delta) {
    score += delta;
    scoreEl.textContent = score;
  }

  function performAction() {
    if (!running) return;

    if (drone.x === target.x && drone.y === target.y) {
      updateScore(100);
      target = randomTarget();
      messageEl.textContent = 'Target confirmed.';
    } else {
      updateScore(-50);
      messageEl.textContent = 'Missed target.';
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
    drone = { x: 7, y: 7 };
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

    const body = new URLSearchParams();
    body.set('registration_id', registrationId);
    body.set('score', String(score));

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
        drone = { x: Math.floor(gridSize / 2), y: Math.floor(gridSize / 2) };
        target = randomTarget();
        timeLeft = timerSeconds;
        timeEl.textContent = timeLeft;
        document.getElementById('playerName').textContent = player.name;
        document.getElementById('playerMeta').textContent = 'Queue #' + player.queue_number + ' · ' + AgroApi.title(player.selected_map);
        document.getElementById('queueLink').href = '/queue.html?event=' + encodeURIComponent(eventSlug);
        document.getElementById('leaderboardLink').href = '/leaderboard.html?event=' + encodeURIComponent(eventSlug);
        startButton.disabled = false;
        draw();
      })
      .catch(function () {
        messageEl.textContent = 'Player could not be loaded.';
        draw();
      });
  }

  target = randomTarget();
  startButton.addEventListener('click', startGame);
  loadPlayer();
  requestAnimationFrame(loop);
})();
