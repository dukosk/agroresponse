const fs = require('fs');
const path = require('path');

const databaseDir = path.join(__dirname, '..', 'database');
const dataPath = path.join(databaseDir, 'data.json');
const temporaryDataPath = path.join(databaseDir, 'data.json.tmp');

function emptyData() {
  return {
    registrations: [],
    scores: [],
    events: [],
  };
}

function normalizeData(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    registrations: Array.isArray(source.registrations) ? source.registrations : [],
    scores: Array.isArray(source.scores) ? source.scores : [],
    events: Array.isArray(source.events) ? source.events : [],
  };
}

function writeJsonFile(filePath, contents) {
  const fileDescriptor = fs.openSync(filePath, 'w');
  try {
    fs.writeFileSync(fileDescriptor, contents, 'utf8');
    fs.fsyncSync(fileDescriptor);
  } finally {
    fs.closeSync(fileDescriptor);
  }
}

function ensureStorage() {
  fs.mkdirSync(databaseDir, { recursive: true });
  if (!fs.existsSync(dataPath)) {
    writeJsonFile(dataPath, JSON.stringify(emptyData(), null, 2) + '\n');
  }
}

function readData() {
  ensureStorage();
  try {
    return normalizeData(JSON.parse(fs.readFileSync(dataPath, 'utf8')));
  } catch (error) {
    throw new Error(`JSON storage could not be read at ${dataPath}: ${error.message}`);
  }
}

function writeData(value) {
  ensureStorage();
  const contents = JSON.stringify(normalizeData(value), null, 2) + '\n';
  writeJsonFile(temporaryDataPath, contents);

  try {
    fs.renameSync(temporaryDataPath, dataPath);
  } catch (error) {
    if (!['EACCES', 'EEXIST', 'EPERM'].includes(error.code)) {
      if (fs.existsSync(temporaryDataPath)) fs.unlinkSync(temporaryDataPath);
      throw error;
    }

    // Windows can briefly lock the destination. Copying the completed temp
    // file keeps the store usable without requiring a native dependency.
    fs.copyFileSync(temporaryDataPath, dataPath);
    fs.unlinkSync(temporaryDataPath);
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function nowTimestamp() {
  return new Date().toISOString();
}

function nextId(rows) {
  return rows.reduce((highest, row) => Math.max(highest, Number(row.id) || 0), 0) + 1;
}

function nextQueueNumber(data, eventSlug) {
  return data.registrations
    .filter((row) => row.event_slug === eventSlug)
    .reduce((highest, row) => Math.max(highest, Number(row.queue_number) || 0), 0) + 1;
}

function ensureEvent(data, eventSlug) {
  if (data.events.some((event) => event.slug === eventSlug)) return;
  data.events.push({
    id: nextId(data.events),
    slug: eventSlug,
    created_at: nowTimestamp(),
  });
}

function createRegistrationRecord(data, {
  eventSlug,
  name,
  email,
  selectedMap,
  status,
}) {
  const timestamp = nowTimestamp();
  const registration = {
    id: nextId(data.registrations),
    event_slug: eventSlug,
    queue_number: nextQueueNumber(data, eventSlug),
    name,
    email,
    selected_map: selectedMap,
    status,
    score: null,
    created_at: timestamp,
    started_at: status === 'playing' ? timestamp : null,
    finished_at: null,
  };

  data.registrations.push(registration);
  ensureEvent(data, eventSlug);
  writeData(data);
  return clone(registration);
}

function createRegistration({ eventSlug, name, email, selectedMap }) {
  return createRegistrationRecord(readData(), {
    eventSlug,
    name,
    email,
    selectedMap,
    status: 'waiting',
  });
}

function createPlayingRegistration({ eventSlug, name, email, selectedMap }) {
  return createRegistrationRecord(readData(), {
    eventSlug,
    name,
    email,
    selectedMap,
    status: 'playing',
  });
}

function getWaitingPosition(eventSlug, queueNumber) {
  return readData().registrations.filter((row) => (
    row.event_slug === eventSlug &&
    row.status === 'waiting' &&
    Number(row.queue_number) <= Number(queueNumber)
  )).length;
}

function sortByQueueNumber(rows) {
  return rows.sort((a, b) => Number(a.queue_number) - Number(b.queue_number));
}

function getCurrentPlayerFromData(data, eventSlug) {
  const rows = data.registrations.filter((row) => (
    row.event_slug === eventSlug && row.status === 'playing'
  ));

  rows.sort((a, b) => {
    const startedComparison = String(a.started_at || '').localeCompare(String(b.started_at || ''));
    return startedComparison || Number(a.queue_number) - Number(b.queue_number);
  });
  return rows[0] || null;
}

function getNextPlayerFromData(data, eventSlug) {
  return sortByQueueNumber(data.registrations.filter((row) => (
    row.event_slug === eventSlug && row.status === 'waiting'
  )))[0] || null;
}

function getQueue(eventSlug) {
  const data = readData();
  return {
    current: clone(getCurrentPlayerFromData(data, eventSlug)),
    next: clone(getNextPlayerFromData(data, eventSlug)),
    waiting: clone(sortByQueueNumber(data.registrations.filter((row) => (
      row.event_slug === eventSlug && row.status === 'waiting'
    )))),
  };
}

function resetWaitingQueue(eventSlug) {
  const data = readData();
  let changed = 0;

  data.registrations.forEach((row) => {
    if (
      row.event_slug === eventSlug &&
      row.score == null &&
      ['waiting', 'playing', 'skipped'].includes(row.status)
    ) {
      row.status = 'waiting';
      row.started_at = null;
      row.finished_at = null;
      changed += 1;
    }
  });

  if (changed) writeData(data);
  return { ok: true, changed };
}

function callNextPlayer(eventSlug) {
  const data = readData();
  const current = getCurrentPlayerFromData(data, eventSlug);
  if (current) {
    return {
      ok: false,
      error: 'Finish or skip the current player first.',
      player: clone(current),
    };
  }

  const next = getNextPlayerFromData(data, eventSlug);
  if (!next) {
    return { ok: false, error: 'No waiting players.' };
  }

  next.status = 'playing';
  next.started_at = nowTimestamp();
  writeData(data);
  return { ok: true, player: clone(next) };
}

function finishCurrentPlayer(eventSlug) {
  const data = readData();
  const current = getCurrentPlayerFromData(data, eventSlug);
  if (!current) {
    return { ok: false, error: 'No current player.' };
  }

  current.status = 'finished';
  current.finished_at = current.finished_at || nowTimestamp();
  writeData(data);
  return { ok: true, player: clone(current) };
}

function skipPlayer(eventSlug, id) {
  const data = readData();
  const player = data.registrations.find((row) => (
    Number(row.id) === Number(id) &&
    row.event_slug === eventSlug &&
    ['waiting', 'playing'].includes(row.status)
  ));

  if (!player) {
    return { ok: false, error: 'Player cannot be skipped.' };
  }

  player.status = 'skipped';
  player.finished_at = nowTimestamp();
  writeData(data);
  return { ok: true, player: clone(player) };
}

function getPlayer(id) {
  const player = readData().registrations.find((row) => Number(row.id) === Number(id));
  return clone(player || null);
}

function saveScore(id, score) {
  const data = readData();
  const player = data.registrations.find((row) => Number(row.id) === Number(id));
  if (!player) return null;

  const timestamp = nowTimestamp();
  player.score = Number(score);
  player.status = 'finished';
  player.created_at = player.created_at || timestamp;
  player.finished_at = timestamp;

  let scoreRecord = data.scores.find((row) => Number(row.registration_id) === Number(id));
  if (!scoreRecord) {
    scoreRecord = {
      id: nextId(data.scores),
      registration_id: player.id,
      event_slug: player.event_slug,
      score: player.score,
      created_at: timestamp,
    };
    data.scores.push(scoreRecord);
  } else {
    scoreRecord.score = player.score;
    scoreRecord.updated_at = timestamp;
  }

  writeData(data);
  return clone(player);
}

function timestampValue(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function sortScores(rows) {
  return rows.sort((a, b) => (
    Number(b.score) - Number(a.score) ||
    timestampValue(a.finished_at) - timestampValue(b.finished_at) ||
    Number(a.id) - Number(b.id)
  ));
}

function scoredPlayers(data, eventSlug) {
  return data.registrations.filter((row) => (
    row.status === 'finished' &&
    row.score != null &&
    (eventSlug == null || row.event_slug === eventSlug)
  ));
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isToday(row) {
  return localDateKey(row.finished_at || row.created_at) === localDateKey(new Date());
}

function getEventLeaderboard(eventSlug) {
  return clone(sortScores(scoredPlayers(readData(), eventSlug)));
}

function getTodayEventLeaderboard(eventSlug) {
  const rows = scoredPlayers(readData(), eventSlug).filter(isToday);
  return clone(sortScores(rows).slice(0, 10));
}

function getEventRankForPlayer(id) {
  const data = readData();
  const player = data.registrations.find((row) => Number(row.id) === Number(id));
  if (!player || player.score == null) return null;

  const eventRank = scoredPlayers(data, player.event_slug)
    .filter((row) => Number(row.score) > Number(player.score)).length + 1;
  const todayRank = scoredPlayers(data, player.event_slug)
    .filter((row) => isToday(row) && Number(row.score) > Number(player.score)).length + 1;

  return { event: eventRank, today: todayRank };
}

function getTodayTopFive(eventSlug) {
  const rows = scoredPlayers(readData(), eventSlug).filter(isToday);
  return clone(sortScores(rows).slice(0, 5));
}

function getGlobalLeaderboard() {
  return clone(sortScores(scoredPlayers(readData())).slice(0, 20));
}

function getEventPlayers(eventSlug) {
  const rows = sortByQueueNumber(readData().registrations.filter((row) => (
    row.event_slug === eventSlug
  ))).map((row) => ({
    ...row,
    registered_at: row.created_at || row.started_at || row.finished_at || '',
  }));
  return clone(rows);
}

ensureStorage();

module.exports = {
  createRegistration,
  createPlayingRegistration,
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
};
