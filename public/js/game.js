(function () {
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const startButton = document.getElementById('startGame');
  const messageEl = document.getElementById('gameMessage');
  const playerNameEl = document.getElementById('playerName');
  const playerMetaEl = document.getElementById('playerMeta');
  const queueLink = document.getElementById('queueLink');
  const leaderboardLink = document.getElementById('leaderboardLink');
  const playersLink = document.getElementById('playersLink');
  const gameLayout = document.getElementById('gameLayout');
  const stationWaiting = document.getElementById('stationWaiting');
  const stationEventName = document.getElementById('stationEventName');
  const stationQr = document.getElementById('stationQr');
  const stationRegisterUrl = document.getElementById('stationRegisterUrl');
  const stationLeader = document.getElementById('stationLeader');
  const stationTodayScores = document.getElementById('stationTodayScores');
  const stationMode = document.body.dataset.gameMode === 'station';
  const singleStationMode = document.body.dataset.gameMode === 'single';

  const keys = new Set();

  let gridSize = 16;
  let cellSize = canvas.width / gridSize;
  let timerSeconds = 60;
  let spawnIntervalMs = 2200;
  let maxActiveTargets = 3;
  let registrationId = null;
  let eventSlug = AgroApi.eventSlug();
  let selectedMap = 'field';
  let backgroundImage = new Image();
  let backgroundReady = false;
  let drone = { x: 7, y: 7 };
  let targets = [];
  let score = 0;
  let hits = 0;
  let misses = 0;
  let timeLeft = timerSeconds;
  let running = false;
  let lastMove = 0;
  let intervalId = null;
  let spawnTimerId = null;
  let saved = false;
  let scoreAnimations = [];
  let droneAngle = 0;
  let actionPulseAt = 0;
  let stationPollId = null;
  let activeStationPlayerId = null;
  let activePlayer = null;
  let lastStationWaitingData = null;
  let lastResult = null;
  let lastMessageKey = null;

  function t(key, vars) {
    return window.AgroI18n ? AgroI18n.t(key, vars) : key;
  }

  function missionLabel(map) {
    return AgroApi.title(map) + ' ' + t('mission');
  }

  function playerMeta(player) {
    if (singleStationMode) {
      return missionLabel(player.selected_map) + ' · ' + t('diseaseResponse');
    }
    return t('queue') + ' #' + player.queue_number + ' · ' + missionLabel(player.selected_map) + ' · ' + t('diseaseResponse');
  }

  function renderStartButtonText() {
    if (running) {
      startButton.textContent = t('missionRunning');
    } else if (lastResult) {
      startButton.textContent = stationMode ? t('missionComplete') : t('playAgain');
    } else {
      startButton.textContent = stationMode ? t('startMission') : t('start');
    }
  }

  function setMessage(key) {
    lastMessageKey = key || null;
    messageEl.textContent = key ? t(key) : '';
  }

  function randomTarget() {
    let next = { x: 0, y: 0 };
    do {
      next = {
        x: Math.floor(Math.random() * gridSize),
        y: Math.floor(Math.random() * gridSize),
      };
    } while (
      (next.x === drone.x && next.y === drone.y) ||
      targets.some(function (target) { return target.x === next.x && target.y === next.y; })
    );

    return next;
  }

  function spawnTarget() {
    if (targets.length >= maxActiveTargets) return;
    targets.push(randomTarget());
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

    targets.forEach(drawTarget);
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

  function drawTarget(target) {
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
    const hitIndex = targets.findIndex(function (target) {
      return drone.x === target.x && drone.y === target.y;
    });

    if (hitIndex !== -1) {
      hits += 1;
      updateScore(100);
      targets.splice(hitIndex, 1);
      spawnTarget();
      setMessage('hotspotTreated');
    } else {
      misses += 1;
      updateScore(-50);
      setMessage('hotspotMissed');
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
    hits = 0;
    misses = 0;
    timeLeft = timerSeconds;
    saved = false;
    lastResult = null;
    drone = { x: Math.floor(gridSize / 2), y: Math.floor(gridSize / 2) };
    targets = [];
    spawnTarget();
    scoreEl.textContent = score;
    timeEl.textContent = timeLeft;
    setMessage();
    startButton.disabled = true;
    running = true;
    renderStartButtonText();

    intervalId = window.setInterval(function () {
      timeLeft -= 1;
      timeEl.textContent = timeLeft;

      if (timeLeft <= 0) {
        finishGame();
      }
    }, 1000);
    spawnTimerId = window.setInterval(spawnTarget, spawnIntervalMs);
  }

  function finishGame() {
    if (!running || saved) return;

    running = false;
    saved = true;
    window.clearInterval(intervalId);
    window.clearInterval(spawnTimerId);
    startButton.disabled = false;
    renderStartButtonText();
    setMessage('savingScore');

    AgroApi.post('/api/score', { registration_id: registrationId, score: score })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || 'Save failed');
        const eventRank = data.ranks && data.ranks.event ? data.ranks.event : '-';
        const todayRank = data.ranks && data.ranks.today ? data.ranks.today : '-';
        const attempts = hits + misses;
        const accuracy = attempts ? Math.round((hits / attempts) * 100) : 0;
        lastResult = {
          eventSlug: data.eventSlug,
          score: score,
          eventRank: eventRank,
          todayRank: todayRank,
          hits: hits,
          misses: misses,
          accuracy: accuracy,
          selectedMap: selectedMap,
        };
        renderResult();
        if (stationMode) {
          startButton.disabled = true;
          window.setTimeout(resetStationWaiting, 10000);
        }
      })
      .catch(function (error) {
        AgroApi.logError('Score save failed', error);
        setMessage('scoreSaveFailed');
      });
  }

  function renderResult() {
    if (!lastResult) return;

    if (singleStationMode) {
      gameLayout.classList.add('result-mode');
      messageEl.innerHTML = '<div class="single-result-heading"><p class="eyebrow">' + t('missionComplete') +
        '</p><h2>' + t('missionResults') + '</h2></div><div class="final-result single-final-result">' +
        '<div class="result-score"><span>' + t('finalScore') + '</span><strong>' + lastResult.score + '</strong></div>' +
        '<div><span>' + t('todayRank') + '</span><strong>#' + lastResult.todayRank + '</strong></div>' +
        '<div><span>' + t('eventRank') + '</span><strong>#' + lastResult.eventRank + '</strong></div>' +
        '<div><span>' + t('hits') + '</span><strong>' + lastResult.hits + '</strong></div>' +
        '<div><span>' + t('misses') + '</span><strong>' + lastResult.misses + '</strong></div>' +
        '<div><span>' + t('accuracy') + '</span><strong>' + lastResult.accuracy + '%</strong></div>' +
        '<div><span>' + t('selectedMission') + '</span><strong>' +
        AgroApi.escapeHtml(AgroApi.title(lastResult.selectedMap)) + '</strong></div>' +
        '</div><div class="actions single-result-actions"><button class="button primary" type="button" data-next-player>' +
        t('nextPlayer') + '</button><a class="button" href="/leaderboard.html?event=' +
        encodeURIComponent(lastResult.eventSlug) + '">' + t('leaderboard') + '</a></div>';
      return;
    }

    messageEl.innerHTML = '<div class="final-result">' +
      '<div><span>' + t('finalScore') + '</span><strong>' + lastResult.score + '</strong></div>' +
      '<div><span>' + t('eventRank') + '</span><strong>#' + lastResult.eventRank + '</strong></div>' +
      '<div><span>' + t('todayRank') + '</span><strong>#' + lastResult.todayRank + '</strong></div>' +
      '<div><span>' + t('hits') + '</span><strong>' + lastResult.hits + '</strong></div>' +
      '<div><span>' + t('misses') + '</span><strong>' + lastResult.misses + '</strong></div>' +
      '<div><span>' + t('accuracy') + '</span><strong>' + lastResult.accuracy + '%</strong></div>' +
      '</div><div class="actions"><a class="button primary" href="/queue.html?event=' +
      encodeURIComponent(lastResult.eventSlug) + '">' + t('backToQueue') + '</a><a class="button" href="/">' +
      t('home') + '</a><a class="button" href="/leaderboard.html?event=' +
      encodeURIComponent(lastResult.eventSlug) + '">' + t('leaderboard') + '</a></div>';
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

  function applyConfig(config) {
    gridSize = config.gridSize;
    timerSeconds = config.gameDurationSeconds || config.timerSeconds;
    spawnIntervalMs = config.spawnIntervalMs || spawnIntervalMs;
    maxActiveTargets = config.maxActiveHotspots || config.maxActiveTargets || maxActiveTargets;
    cellSize = canvas.width / gridSize;
    timeLeft = timerSeconds;
    timeEl.textContent = timeLeft;
    if (stationEventName && config.eventConfig) {
      stationEventName.textContent = config.eventConfig.eventName;
    }
  }

  function updateEventLinks() {
    if (queueLink) queueLink.href = '/queue.html?event=' + encodeURIComponent(eventSlug);
    if (leaderboardLink) leaderboardLink.href = '/leaderboard.html?event=' + encodeURIComponent(eventSlug);
    if (playersLink) playersLink.href = '/players.html?event=' + encodeURIComponent(eventSlug);
  }

  function setPlayer(player) {
    activePlayer = player;
    registrationId = player.id;
    activeStationPlayerId = player.id;
    eventSlug = player.event_slug;
    selectedMap = player.selected_map;
    drone = { x: Math.floor(gridSize / 2), y: Math.floor(gridSize / 2) };
    targets = [];
    score = 0;
    hits = 0;
    misses = 0;
    saved = false;
    lastResult = null;
    timeLeft = timerSeconds;
    scoreEl.textContent = score;
    timeEl.textContent = timeLeft;
    spawnTarget();
    playerNameEl.removeAttribute('data-i18n');
    playerNameEl.textContent = player.name;
    playerMetaEl.textContent = playerMeta(player);
    renderStartButtonText();
    startButton.disabled = false;
    setMessage(stationMode ? 'currentPilotReady' : null);
    updateEventLinks();
    loadBackground(selectedMap);
    if (stationMode) {
      if (stationWaiting) stationWaiting.classList.add('hidden');
      if (gameLayout) gameLayout.classList.remove('hidden');
    }
    if (singleStationMode && gameLayout) {
      gameLayout.classList.remove('hidden', 'result-mode');
    }
    draw();
  }

  function startSingleStationPlayer(player) {
    return AgroApi.config()
      .then(applyConfig)
      .catch(function (error) {
        AgroApi.logError('Single-station config load failed', error);
      })
      .then(function () {
        setPlayer(player);
        startGame();
      });
  }

  function resetSingleStationGame() {
    running = false;
    saved = false;
    registrationId = null;
    activePlayer = null;
    activeStationPlayerId = null;
    lastResult = null;
    lastMessageKey = null;
    targets = [];
    keys.clear();
    score = 0;
    hits = 0;
    misses = 0;
    timeLeft = timerSeconds;
    window.clearInterval(intervalId);
    window.clearInterval(spawnTimerId);
    scoreEl.textContent = score;
    timeEl.textContent = timeLeft;
    messageEl.textContent = '';
    playerNameEl.textContent = t('appTitle');
    playerMetaEl.textContent = '';
    startButton.disabled = true;
    if (gameLayout) {
      gameLayout.classList.add('hidden');
      gameLayout.classList.remove('result-mode');
    }
    draw();
  }

  function renderStationWaiting(data) {
    lastStationWaitingData = data || lastStationWaitingData;
    const registerUrl = window.location.origin + '/register.html?event=' + encodeURIComponent(eventSlug);
    if (stationRegisterUrl) stationRegisterUrl.textContent = registerUrl;
    if (stationQr) stationQr.src = '/api/register-qr.svg?event=' + encodeURIComponent(eventSlug);

    const leader = data && data.leader && data.leader[0];
    if (stationLeader) {
      stationLeader.innerHTML = leader
        ? '<div class="leader-card"><strong>' + AgroApi.escapeHtml(leader.name) + '</strong><span>' + leader.score + '</span><small>' + missionLabel(leader.selected_map) + '</small></div>'
        : '<p class="message">' + t('noCompletedMissions') + '</p>';
    }

    const today = data && data.today ? data.today : [];
    if (stationTodayScores) {
      stationTodayScores.innerHTML = today.length
        ? today.slice(0, 5).map(function (row, index) {
          return '<div class="preview-row"><span class="rank-number">#' + (index + 1) + '</span><strong>' +
            AgroApi.escapeHtml(row.name) + '</strong><span>' + row.score + '</span></div>';
        }).join('')
        : '<p class="message">' + t('noScoresToday') + '</p>';
    }
  }

  function showStationWaiting(data) {
    registrationId = null;
    activeStationPlayerId = null;
    running = false;
    saved = false;
    targets = [];
    keys.clear();
    window.clearInterval(intervalId);
    window.clearInterval(spawnTimerId);
    startButton.disabled = true;
    if (gameLayout) gameLayout.classList.add('hidden');
    if (stationWaiting) stationWaiting.classList.remove('hidden');
    renderStationWaiting(data);
    draw();
  }

  function resetStationWaiting() {
    showStationWaiting();
    pollStation();
  }

  function pollStation() {
    if (!stationMode || running) return;

    Promise.all([
      AgroApi.config(),
      AgroApi.get('/api/queue/current?event=' + encodeURIComponent(eventSlug)),
      AgroApi.get('/api/leaderboard?event=' + encodeURIComponent(eventSlug)),
    ])
      .then(function (results) {
        const config = results[0];
        const current = results[1].current;
        const leaderboard = results[2];
        applyConfig(config);
        eventSlug = results[1].eventSlug || eventSlug;

        if (!current) {
          if (!registrationId) {
            showStationWaiting({
              leader: leaderboard.event,
              today: leaderboard.today,
            });
          }
          return;
        }

        if (current.id !== activeStationPlayerId) {
          setPlayer(current);
        }
      })
      .catch(function (error) {
        AgroApi.logError('Game station poll failed', error);
        if (stationWaiting) stationWaiting.classList.remove('hidden');
        if (stationTodayScores) stationTodayScores.innerHTML = '<p class="message">' + t('stationDataLoadFailed') + '</p>';
      });
  }

  function loadPlayer() {
    if (singleStationMode) {
      if (gameLayout) gameLayout.classList.add('hidden');
      draw();
      return;
    }

    if (stationMode) {
      if (gameLayout) gameLayout.classList.add('hidden');
      if (stationWaiting) stationWaiting.classList.remove('hidden');
      pollStation();
      stationPollId = window.setInterval(pollStation, 2000);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const id = Number.parseInt(params.get('id'), 10);

    if (!Number.isInteger(id)) {
      setMessage('missingPlayerId');
      draw();
      return;
    }

    Promise.all([AgroApi.config(), AgroApi.get('/api/player/' + id)])
      .then(function (results) {
        const config = results[0];
        const player = results[1].player;
        applyConfig(config);
        setPlayer(player);
      })
      .catch(function (error) {
        AgroApi.logError('Game player load failed', error);
        setMessage('playerLoadFailed');
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

  spawnTarget();
  startButton.addEventListener('click', startGame);
  if (singleStationMode) {
    window.AgroGame = {
      startSingleStationPlayer: startSingleStationPlayer,
      resetSingleStationGame: resetSingleStationGame,
    };
  }
  loadPlayer();
  requestAnimationFrame(loop);
  window.addEventListener('beforeunload', function () {
    window.clearInterval(stationPollId);
  });
  window.addEventListener('agro:languagechange', function () {
    if (activePlayer) {
      playerNameEl.textContent = activePlayer.name;
      playerMetaEl.textContent = playerMeta(activePlayer);
    }
    renderStartButtonText();
    if (lastResult) {
      renderResult();
    } else if (lastMessageKey) {
      setMessage(lastMessageKey);
    }
    if (stationWaiting && !stationWaiting.classList.contains('hidden')) {
      renderStationWaiting(lastStationWaitingData);
    }
  });
})();
