const express = require('express');
const path = require('path');
const {
  createRegistration,
  getQueue,
  callNextPlayer,
  finishCurrentPlayer,
  skipPlayer,
  getPlayer,
  saveScore,
  getEventLeaderboard,
  getGlobalLeaderboard,
} = require('./src/db');
const { DEFAULT_EVENT_SLUG, MAPS, TIMER_SECONDS, GRID_SIZE } = require('./src/gameConfig');

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

app.get('/api/config', (req, res) => {
  res.json({
    defaultEventSlug: DEFAULT_EVENT_SLUG,
    maps: MAPS,
    timerSeconds: TIMER_SECONDS,
    gridSize: GRID_SIZE,
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
  res.json({ ok: true, registration });
});

app.get('/api/queue', (req, res) => {
  const eventSlug = cleanEventSlug(req.query.event);
  res.json({ ok: true, eventSlug, queue: getQueue(eventSlug) });
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
  res.json({ ok: true, eventSlug: player.event_slug });
});

app.get('/api/leaderboard', (req, res) => {
  const eventSlug = cleanEventSlug(req.query.event);
  res.json({
    ok: true,
    eventSlug,
    event: getEventLeaderboard(eventSlug),
    global: getGlobalLeaderboard(),
  });
});

app.listen(port, host, () => {
  console.log(`Agro Drone Response running at http://localhost:${port}`);
});
