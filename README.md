# Agro Drone Response

Initial MVP for a lightweight browser-based event queue, drone game, and leaderboard.

## Stack

- Node.js
- Express
- JSON file storage
- Plain HTML/CSS
- Plain JavaScript canvas

No frontend framework is used.

## Setup

```sh
npm install
```

## Run

```sh
npm start
```

Open http://localhost:8000.

Active exhibition data lives at `database/data.json`. The server creates the folder and JSON file automatically when missing. The previous `database/database.sqlite` file is retained as legacy data but is no longer read by the app.

Storage uses only built-in Node.js file-system APIs. Installation does not require Python, `node-gyp`, Visual Studio Build Tools, or a native database compiler.

## Default event

The default event slug is:

```text
agrokomplex-nitra
```

You can override it with `?event=your-event-slug` on registration, queue, and leaderboard pages.

## MVP features

- Registration with name, email, and map selection: orchard, forest, field
- Event-specific queue numbers
- Queue board showing currently playing, next player, and waiting players
- Queue board auto-refresh every 3 seconds
- Manual queue controls: call next player, mark current player finished, skip player
- Canvas game with WASD/arrow drone movement
- Random red targets on a grid
- SPACE action
- 60 second default game timer
- Score rules: +100 correct hit, -50 miss
- JSON score saving
- Event and global leaderboards

## Pages

- `/` home
- `/single-station.html` one-laptop exhibition mode
- `/register.html` registration
- `/queue.html` queue board
- `/operator.html` queue operator controls
- `/game-station.html` dedicated queue game station
- `/game.html?id=1` game for a registration
- `/leaderboard.html` event and global leaderboards
- `/players.html` player records and CSV export

## API

- `GET /api/config`
- `POST /api/register`
- `POST /api/single-station/register`
- `GET /api/queue?event=agrokomplex-nitra`
- `POST /api/queue/call-next`
- `POST /api/queue/finish-current`
- `POST /api/queue/skip-player`
- `GET /api/player/:id`
- `POST /api/score`
- `GET /api/leaderboard?event=agrokomplex-nitra`
- `GET /api/leaderboard/today?event=agrokomplex-nitra`
- `GET /api/leaderboard/today/export?event=agrokomplex-nitra`
- `GET /api/players?event=agrokomplex-nitra`
- `GET /api/players/export?event=agrokomplex-nitra`
