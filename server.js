const express = require('express');
const path = require('path');
const QRCode = require('qrcode');
const {
  createRegistration,
  getQueue,
  getWaitingPosition,
  resetWaitingQueue,
  callNextPlayer,
  finishCurrentPlayer,
  skipPlayer,
  getPlayer,
  saveScore,
  getEventLeaderboard,
  getTodayEventLeaderboard,
  getEventRankForPlayer,
  getTodayTopFive,
  getGlobalLeaderboard,
  getEventPlayers,
} = require('./src/db');
const {
  EVENT_CONFIG,
  EVENT_NAME,
  EVENT_SLUG,
  DEFAULT_EVENT_SLUG,
  MAPS,
  TIMER_SECONDS,
  GAME_DURATION_SECONDS,
  SPAWN_INTERVAL_MS,
  MAX_ACTIVE_HOTSPOTS,
  MAX_ACTIVE_TARGETS,
  GRID_SIZE,
} = require('./src/gameConfig');

const app = express();
const port = process.env.PORT || 8000;
const host = process.env.HOST || '127.0.0.1';

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

function cleanEventSlug(value) {
  const slug = String(value || DEFAULT_EVENT_SLUG).trim();
  return /^[a-z0-9-]+$/.test(slug) ? slug : DEFAULT_EVENT_SLUG;
}

function cleanString(value) {
  return String(value || '').trim();
}

function routeError(res, error, message) {
  console.error(message, error);
  res.status(500).json({
    ok: false,
    error: message,
    details: error instanceof Error ? error.message : String(error),
  });
}

app.get('/api/config', (req, res) => {
  res.json({
    eventConfig: EVENT_CONFIG,
    eventName: EVENT_NAME,
    eventSlug: EVENT_SLUG,
    defaultEventSlug: DEFAULT_EVENT_SLUG,
    maps: MAPS,
    timerSeconds: TIMER_SECONDS,
    gameDurationSeconds: GAME_DURATION_SECONDS,
    spawnIntervalMs: SPAWN_INTERVAL_MS,
    maxActiveHotspots: MAX_ACTIVE_HOTSPOTS,
    maxActiveTargets: MAX_ACTIVE_TARGETS,
    gridSize: GRID_SIZE,
  });
});

app.get('/api/register-qr.svg', (req, res) => {
  const eventSlug = cleanEventSlug(req.query.event);
  const origin = `${req.protocol}://${req.get('host')}`;
  const registerUrl = `${origin}/register.html?event=${encodeURIComponent(eventSlug)}`;

  QRCode.toString(registerUrl, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    color: {
      dark: '#102417',
      light: '#f4fff7',
    },
  }, (error, svg) => {
    if (error) {
      return routeError(res, error, 'Registration QR could not be generated.');
    }

    res.header('Content-Type', 'image/svg+xml; charset=utf-8');
    res.send(svg);
  });
});

app.post('/api/register', (req, res) => {
  const eventSlug = cleanEventSlug(req.body.event_slug);
  const name = cleanString(req.body.name);
  const email = cleanString(req.body.email);
  const selectedMap = cleanString(req.body.selected_map);

  if (!name) {
    return res.status(400).json({ ok: false, error: 'Name is required.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Valid email is required.' });
  }

  if (!MAPS.includes(selectedMap)) {
    return res.status(400).json({ ok: false, error: 'Choose a valid map.' });
  }

  const registration = createRegistration({ eventSlug, name, email, selectedMap });
  const waitingPosition = getWaitingPosition(eventSlug, registration.queue_number);
  res.json({
    ok: true,
    registration,
    waitingPosition,
    playersBefore: Math.max(0, waitingPosition - 1),
  });
});

app.get('/api/queue', (req, res) => {
  const eventSlug = cleanEventSlug(req.query.event);
  res.json({ ok: true, eventSlug, queue: getQueue(eventSlug) });
});

app.get('/api/queue/current', (req, res) => {
  try {
    const eventSlug = cleanEventSlug(req.query.event);
    const queue = getQueue(eventSlug);
    res.json({ ok: true, eventSlug, current: queue.current || null });
  } catch (error) {
    routeError(res, error, 'Current queue player could not be loaded.');
  }
});

app.post('/api/queue/call-next', (req, res) => {
  const eventSlug = cleanEventSlug(req.body.event_slug);
  const result = callNextPlayer(eventSlug);

  if (!result.ok) {
    return res.status(409).json(result);
  }

  res.json(result);
});

app.post('/api/queue/finish-current', (req, res) => {
  const eventSlug = cleanEventSlug(req.body.event_slug);
  res.json(finishCurrentPlayer(eventSlug));
});

app.post('/api/queue/skip-player', (req, res) => {
  const eventSlug = cleanEventSlug(req.body.event_slug);
  const id = Number.parseInt(req.body.id, 10);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ ok: false, error: 'Player id is required.' });
  }

  const result = skipPlayer(eventSlug, id);
  if (!result.ok) {
    return res.status(404).json(result);
  }

  res.json(result);
});

app.post('/api/queue/reset-waiting', (req, res) => {
  try {
    const eventSlug = cleanEventSlug(req.body.event_slug);
    res.json(resetWaitingQueue(eventSlug));
  } catch (error) {
    routeError(res, error, 'Waiting queue could not be reset.');
  }
});

app.get('/api/player/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const player = getPlayer(id);

  if (!player) {
    return res.status(404).json({ ok: false, error: 'Player not found.' });
  }

  res.json({ ok: true, player });
});

app.post('/api/score', (req, res) => {
  const id = Number.parseInt(req.body.registration_id, 10);
  const score = Number.parseInt(req.body.score, 10);

  if (!Number.isInteger(id) || !Number.isInteger(score)) {
    return res.status(400).json({ ok: false, error: 'Player id and score are required.' });
  }

  const player = getPlayer(id);
  if (!player) {
    return res.status(404).json({ ok: false, error: 'Player not found.' });
  }

  saveScore(id, score);
  res.json({
    ok: true,
    eventSlug: player.event_slug,
    score,
    ranks: getEventRankForPlayer(id),
  });
});

app.get('/api/leaderboard', (req, res) => {
  try {
    const eventSlug = cleanEventSlug(req.query.event);
    res.json({
      ok: true,
      eventSlug,
      event: getEventLeaderboard(eventSlug),
      today: getTodayEventLeaderboard(eventSlug),
      global: getGlobalLeaderboard(),
    });
  } catch (error) {
    routeError(res, error, 'Leaderboard could not be loaded.');
  }
});

app.get('/api/leaderboard/today', (req, res) => {
  try {
    const eventSlug = cleanEventSlug(req.query.event);
    res.json({
      ok: true,
      eventSlug,
      today: getTodayEventLeaderboard(eventSlug),
    });
  } catch (error) {
    routeError(res, error, 'Today leaderboard could not be loaded.');
  }
});

app.get('/api/leaderboard/today/export', (req, res) => {
  try {
    const eventSlug = cleanEventSlug(req.query.event);
    const rows = getTodayTopFive(eventSlug);
    const columns = [
      ['rank', null],
      ['queue_number', 'queue_number'],
      ['name', 'name'],
      ['email', 'email'],
      ['selected_map', 'selected_map'],
      ['score', 'score'],
      ['finished_at', 'finished_at'],
    ];
    const csvRows = rows.map((row, index) => columns.map((column) => (
      column[0] === 'rank' ? csvCell(index + 1) : csvCell(row[column[1]])
    )).join(','));
    const csv = [columns.map((column) => column[0]).join(','), ...csvRows].join('\n');

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="${eventSlug}-today-top-5.csv"`);
    res.send(csv + '\n');
  } catch (error) {
    routeError(res, error, 'Today Top 5 CSV could not be exported.');
  }
});

app.get('/api/players', (req, res) => {
  try {
    const eventSlug = cleanEventSlug(req.query.event);
    res.json({
      ok: true,
      eventSlug,
      players: getEventPlayers(eventSlug),
    });
  } catch (error) {
    routeError(res, error, 'Players could not be loaded.');
  }
});

function csvCell(value) {
  const text = String(value == null ? '' : value);
  return `"${text.replace(/"/g, '""')}"`;
}

function sendPlayersCsv(req, res) {
  const eventSlug = cleanEventSlug(req.query.event);
  const players = getEventPlayers(eventSlug);
  const columns = [
    ['queue_number', 'queue_number'],
    ['name', 'name'],
    ['email', 'email'],
    ['selected_map', 'selected_map'],
    ['status', 'status'],
    ['score', 'score'],
    ['created_at', 'created_at'],
    ['started_at', 'started_at'],
    ['finished_at', 'finished_at'],
  ];
  const rows = players.map((player) => columns.map((column) => csvCell(player[column[1]])).join(','));
  const csv = [columns.map((column) => column[0]).join(','), ...rows].join('\n');

  res.header('Content-Type', 'text/csv; charset=utf-8');
  res.header('Content-Disposition', `attachment; filename="${eventSlug}-players.csv"`);
  res.send(csv + '\n');
}

app.get('/api/players.csv', (req, res) => {
  try {
    sendPlayersCsv(req, res);
  } catch (error) {
    routeError(res, error, 'Players CSV could not be exported.');
  }
});

app.get('/api/players/export', (req, res) => {
  try {
    sendPlayersCsv(req, res);
  } catch (error) {
    routeError(res, error, 'Players CSV could not be exported.');
  }
});

app.listen(port, host, () => {
  console.log(`Agro Drone Response running at http://localhost:${port}`);
});
