# 防空作战飞行棋 / Air Defense Combat Flying Chess (Online)

A multiplayer online flying chess game with anti-air, air-to-air, anti-radar, and cruise missile combat. Authoritative Node.js + Socket.IO server, React + Vite web client, shared TypeScript protocol.

## Workspace layout

```
导弹飞行棋/
├─ shared/         # @fkzz/shared — domain types + Socket.IO protocol (Zod)
├─ server/         # @fkzz/server — authoritative game engine (Node + Socket.IO)
├─ web/            # @fkzz/web    — React 18 + Vite + zustand client
└─ data/
   └─ questions.json   # Q&A bank (you supply this)
```

## Prerequisites

- Node.js ≥ 18 (uses `crypto.randomInt`, `node:http`)
- npm ≥ 9 (uses workspaces)

## Setup

```bash
npm install        # installs all workspaces
npm run build      # builds shared → server → web
```

## Run (dev)

In two terminals:

```bash
# terminal 1 — server (port 3001)
npm -w @fkzz/server run dev

# terminal 2 — web (port 5173, proxies /socket.io to :3001)
npm -w @fkzz/web run dev
```

Open http://localhost:5173 in two or more browser tabs/windows.

## Run (production)

```bash
npm run build
npm -w @fkzz/server start    # serves API + static web/dist on :3001
```

Open http://localhost:3001.

## How to play (2–4 players)

1. Each player enters a nickname on the lobby screen.
2. One player creates a room (6-character code). The others join via the code.
3. Each player claims a colored seat (red / yellow / blue / green) and clicks **Ready**.
4. Host clicks **Start Game** when all seated players are ready (≥ 2 players).
5. Roll dice on your turn; choose plane to take off / move; play held cards from your hand.
6. First player to land **two** planes at home wins (default victory rule).

## Q&A bank (`data/questions.json`)

The `library` cell triggers a Q&A challenge. The server reads `data/questions.json` at startup. The default file is empty; supply your own questions in this schema:

```json
[
  {
    "id": "q-001",
    "prompt": "What does AAM stand for?",
    "options": ["Air-to-Air Missile", "Anti-Aircraft Missile", "Auto-Aim Module", "Astro-Air Mark"],
    "answerIndex": 0
  }
]
```

- `id` — unique string
- `prompt` — question text shown to the player
- `options` — array of answer choices (typically 4)
- `answerIndex` — zero-based index of the correct option

Restart the server after editing the file.

## Manual test checklist

- [ ] 2 players can create / join a room and see each other's seat.
- [ ] Take-off only succeeds on the configured numbers (default 6).
- [ ] Rolling 6 grants another roll; three sixes in a row busts (returns the moved plane to hangar).
- [ ] Same-color cell triggers a 4-cell jump.
- [ ] Shortcut entry warps to shortcut exit; chained jump rule applies (per spec §3.2).
- [ ] Landing on the takeoff cell returns the occupying plane to hangar (collision).
- [ ] Stacking on a same-color cell allows the new plane to "perch"; rolling 6 advances both.
- [ ] Missile factory cell draws a missile (AAM/SAM/ARM/Cruise) into your hand.
- [ ] Radar factory cell adds 1 radar (max 3, zone fan-out 0/1/3/5/7).
- [ ] Library cell triggers Q&A — correct answer rewards, wrong answer punishes.
- [ ] AAM duel resolves with counter-attacks (defender d6 ≥ 4 dodges; attacker d6 ≥ 4 hits).
- [ ] SAM auto-prompts when an enemy enters my radar zone.
- [ ] ARM (5 or 6) destroys one of target's radars.
- [ ] Cruise hits a takeoff cell automatically; on landing strip needs 4/5/6.
- [ ] Cruise on landing strip pierces immunity per spec.
- [ ] Two planes at home → game over screen with winner.

## Tech stack

| Layer    | Tools |
|----------|-------|
| Protocol | TypeScript + Zod (`shared/src/protocol.ts`) |
| Server   | Node 18, `socket.io`, `nanoid`, ESM modules |
| Engine   | Authoritative state machine in `server/src/game/engine.ts`, snapshots cloned via `structuredClone` |
| Web      | React 18, Vite 5, `zustand`, `socket.io-client`, plain CSS |
| RNG      | Server-side `crypto.randomInt` (no client randomness) |

## Notable design choices

- **Authoritative server**: clients never compute moves; they only request actions. Server validates each action against the current `Phase` and emits `game:state` snapshots.
- **Card-draw privacy**: when a player draws a card, only that player receives the concrete card kind (`event:cardDrawn`); the rest of the room sees a generic log line.
- **Same-color jump + shortcut chain**: implemented in `server/src/game/rules.ts` `resolveJumpChain`. A plane that arrived at a shortcut entry via a prior jump traverses the shortcut but does **not** chain another same-color jump on the exit (per game rule §3.2).
- **Radar zone**: `radarZoneSize(n)` returns 0 / 1 / 3 / 5 / 7 cells (per spec) sorted by distance from the defender's takeoff. SAM is auto-prompted whenever an enemy plane enters or steps inside the zone.
- **Takeoff numbers**: configurable in room options (`[6]` strict / `[5,6]` / `[2,4,6]` easy).

## License

Private project — no license granted.
