# Agro Drone Response

Initial MVP for a lightweight browser-based event queue, drone game, and leaderboard.

## Stack

- Node.js
- Express
- SQLite
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

The SQLite database lives at `database/database.sqlite`. The server creates or migrates the table automatically on startup.

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
- 45 second default game timer
- Score rules: +100 correct hit, -50 miss
- SQLite score saving
- Event and global leaderboards

## Pages

- `/` home
- `/register.html` registration
- `/queue.html` queue board
- `/game.html?id=1` game for a registration
- `/leaderboard.html` event and global leaderboards

## API

- `GET /api/config`
- `POST /api/register`
- `GET /api/queue?event=agrokomplex-nitra`
- `POST /api/queue/call-next`
- `POST /api/queue/finish-current`
- `POST /api/queue/skip-player`
- `GET /api/player/:id`
- `POST /api/score`
- `GET /api/leaderboard?event=agrokomplex-nitra`
