const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const databaseDir = path.join(__dirname, '..', 'database');
const databasePath = path.join(databaseDir, 'database.sqlite');

fs.mkdirSync(databaseDir, { recursive: true });

const db = new Database(databasePath);
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_slug TEXT NOT NULL,
    queue_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    selected_map TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    score INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TEXT,
    finished_at TEXT,
    UNIQUE(event_slug, queue_number)
  );

  CREATE INDEX IF NOT EXISTS idx_registrations_event_status_queue
    ON registrations (event_slug, status, queue_number);

  CREATE INDEX IF NOT EXISTS idx_registrations_score
    ON registrations (score DESC, finished_at ASC);
`);

function nextQueueNumber(eventSlug) {
  const row = db
    .prepare('SELECT COALESCE(MAX(queue_number), 0) + 1 AS next FROM registrations WHERE event_slug = ?')
    .get(eventSlug);

  return row.next;
}

function createRegistration({ eventSlug, name, email, selectedMap }) {
  const queueNumber = nextQueueNumber(eventSlug);
  const result = db
    .prepare(`
      INSERT INTO registrations (event_slug, queue_number, name, email, selected_map)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(eventSlug, queueNumber, name, email, selectedMap);

  return getPlayer(result.lastInsertRowid);
}

function getCurrentPlayer(eventSlug) {
  return db
    .prepare(`
      SELECT * FROM registrations
      WHERE event_slug = ? AND status = 'playing'
      ORDER BY started_at ASC, queue_number ASC
      LIMIT 1
    `)
    .get(eventSlug) || null;
}

function getNextPlayer(eventSlug) {
  return db
    .prepare(`
      SELECT * FROM registrations
      WHERE event_slug = ? AND status = 'waiting'
      ORDER BY queue_number ASC
      LIMIT 1
    `)
    .get(eventSlug) || null;
}

function getWaitingPlayers(eventSlug) {
  return db
    .prepare(`
      SELECT * FROM registrations
      WHERE event_slug = ? AND status = 'waiting'
      ORDER BY queue_number ASC
    `)
    .all(eventSlug);
}

function getQueue(eventSlug) {
  return {
    current: getCurrentPlayer(eventSlug),
    next: getNextPlayer(eventSlug),
    waiting: getWaitingPlayers(eventSlug),
  };
}

const callNextPlayer = db.transaction((eventSlug) => {
  const current = getCurrentPlayer(eventSlug);
  if (current) {
    return { ok: false, error: 'Finish or skip the current player first.', player: current };
  }

  const next = getNextPlayer(eventSlug);
  if (!next) {
    return { ok: false, error: 'No waiting players.' };
  }

  db.prepare(`
    UPDATE registrations
    SET status = 'playing', started_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(next.id);

  return { ok: true, player: getPlayer(next.id) };
});

function finishCurrentPlayer(eventSlug) {
  const current = getCurrentPlayer(eventSlug);
  if (!current) {
    return { ok: false, error: 'No current player.' };
  }

  db.prepare(`
    UPDATE registrations
    SET status = 'finished', finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP)
    WHERE id = ?
  `).run(current.id);

  return { ok: true, player: getPlayer(current.id) };
}

function skipPlayer(eventSlug, id) {
  const player = db
    .prepare(`
      SELECT * FROM registrations
      WHERE id = ? AND event_slug = ? AND status IN ('waiting', 'playing')
    `)
    .get(id, eventSlug);

  if (!player) {
    return { ok: false, error: 'Player cannot be skipped.' };
  }

  db.prepare(`
    UPDATE registrations
    SET status = 'skipped', finished_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);

  return { ok: true, player: getPlayer(id) };
}

function getPlayer(id) {
  return db.prepare('SELECT * FROM registrations WHERE id = ?').get(id) || null;
}

function saveScore(id, score) {
  db.prepare(`
    UPDATE registrations
    SET score = ?,
        status = 'finished',
        created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
        finished_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(score, id);
}

function getEventLeaderboard(eventSlug) {
  return db
    .prepare(`
      SELECT * FROM registrations
      WHERE event_slug = ? AND score IS NOT NULL
      ORDER BY score DESC, finished_at ASC
      LIMIT 20
    `)
    .all(eventSlug);
}

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayEventLeaderboard(eventSlug) {
  return db
    .prepare(`
      SELECT * FROM registrations
      WHERE event_slug = ?
        AND status = 'finished'
        AND score IS NOT NULL
        AND date(COALESCE(finished_at, created_at), 'localtime') = date('now', 'localtime')
      ORDER BY score DESC, finished_at ASC
      LIMIT 10
    `)
    .all(eventSlug);
}

function getGlobalLeaderboard() {
  return db
    .prepare(`
      SELECT * FROM registrations
      WHERE score IS NOT NULL
      ORDER BY score DESC, finished_at ASC
      LIMIT 20
    `)
    .all();
}

function getEventPlayers(eventSlug) {
  return db
    .prepare(`
      SELECT
        *,
        COALESCE(created_at, started_at, finished_at, '') AS registered_at
      FROM registrations
      WHERE event_slug = ?
      ORDER BY queue_number ASC
    `)
    .all(eventSlug);
}

module.exports = {
  createRegistration,
  getQueue,
  callNextPlayer,
  finishCurrentPlayer,
  skipPlayer,
  getPlayer,
  saveScore,
  getEventLeaderboard,
  getTodayEventLeaderboard,
  getGlobalLeaderboard,
  getEventPlayers,
};
