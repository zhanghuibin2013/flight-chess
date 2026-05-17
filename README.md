# Missile Flying Chess / 导弹飞行棋

A multiplayer online strategy board game featuring air combat mechanics with missiles, radar systems, and tactical gameplay. Built with Node.js, Socket.IO, React, and TypeScript.

## 🎮 Game Overview

Missile Flying Chess is a digital adaptation of the classic flying chess board game, enhanced with modern combat elements including:

- **Air-to-Air Missiles (AAM)**: Engage enemy aircraft in dogfights
- **Surface-to-Air Missiles (SAM)**: Defend your airspace with radar-guided interception
- **Anti-Radiation Missiles (ARM)**: Destroy enemy radar systems
- **Cruise Missiles**: Long-range precision strikes on vulnerable targets
- **Radar Systems**: Expand detection zones for enhanced defense
- **Q&A Challenges**: Test your knowledge for rewards and penalties

## 📁 Project Structure

```
missile-flying-chess/
├─ shared/         # @fkzz/shared — Shared TypeScript types & Socket.IO protocol (Zod)
├─ server/         # @fkzz/server — Authoritative game engine (Node.js + Socket.IO)
├─ web/            # @fkzz/web    — React 18 + Vite + Zustand client
├─ docs/           # Game rules and documentation
│   ├─ 游戏说明.md     # Chinese game manual
│   └─ 棋盘布局.txt    # Board layout specifications
└─ data/
   └─ questions.json   # Q&A question bank
```

## ✨ Features

- **Real-time Multiplayer**: 2-4 players compete in real-time via WebSocket
- **Authoritative Server**: All game logic validated server-side to prevent cheating
- **Strategic Combat**: Multiple weapon systems with unique mechanics
- **Dynamic Gameplay**: Random events, Q&A challenges, and reward/penalty cards
- **Responsive Design**: Modern UI built with React and Tailwind CSS
- **Cross-platform**: Play on any device with a web browser

## 🚀 Quick Start

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd missile-flying-chess

# Install dependencies
npm install

# Build all packages
npm run build
```

### Development Mode

Run the following commands in separate terminals:

```bash
# Terminal 1: Start the game server (port 3001)
npm -w @fkzz/server run dev

# Terminal 2: Start the web client (port 5173)
npm -w @fkzz/web run dev
```

Open http://localhost:5173 in multiple browser tabs/windows to play with friends.

### Production Mode

```bash
# Build the project
npm run build

# Start the production server (serves both API and static files on port 3001)
npm -w @fkzz/server start
```

Visit http://localhost:3001 to play.

## 🎯 How to Play

### 1. Lobby Setup
- Enter your nickname on the lobby screen
- One player creates a room (generates a 6-character code)
- Other players join using the room code
- Each player selects a color seat (Red/Yellow/Blue/Green) and clicks **Ready**

### 2. Game Start
- Host clicks **Start Game** when all players are ready (minimum 2 players)
- Players take turns rolling dice and moving their aircraft

### 3. Core Mechanics

#### Takeoff
- Roll the required number (configurable: 6 for hard, 5-6 for normal, 2-4-6 for easy)
- Move aircraft from hangar to takeoff point
- Rolling a 6 grants an extra turn

#### Movement
- Aircraft move clockwise around the board based on dice rolls
- Land on special tiles to trigger events (missile factory, radar factory, library)

#### Jump Mechanic
- Landing on same-colored tiles triggers automatic jumps to the next matching tile
- Can only jump once per movement sequence

#### Shortcut Channels
- Active entry: Fly through shortcut AND trigger jump
- Passive entry (via jump): Fly through shortcut WITHOUT additional jump

#### Landing Zone
- Last 4 tiles before finish line are protected (immune to most attacks)
- Must roll exact number to land; overshoot causes retreat

#### Stacking (Formation)
- Multiple same-color aircraft on one tile form a formation
- Special collision rules apply when encountering formations

#### Collisions
- Opposing aircraft on same tile: Both return to hangar
- Formation collisions: Attacker and one defender return to hangar

### 4. Weapon Systems

#### Radar Cards
- Determine防空 identification zone size
- 0 cards: No SAM usage
- 1 card: 1-tile zone
- 3 cards: 3-tile fan zone (radius 2)
- 5 cards: 5-tile fan zone (radius 3)
- 7 cards: 7-tile fan zone (radius 3)
- Even numbers don't expand zone

#### Air-to-Air Missiles (AAM)
- Trigger when enemy within 4 tiles ahead
- Both sides roll dice; higher wins
- Winner sends loser back to hangar
- Defender can counter-attack if they have AAM cards

#### Surface-to-Air Missiles (SAM)
- Auto-prompt when enemy enters radar zone
- Requires at least 1 radar card to use

#### Anti-Radiation Missiles (ARM)
- Attack enemy radar systems
- Roll 5 or 6 for successful hit
- Destroys one enemy radar card

#### Cruise Missiles
- Attack aircraft at takeoff points or landing zones
- Takeoff target: Automatic hit
- Landing zone target: Roll 4-6 for success

### 5. Equipment Acquisition

#### Missile Factory
- Land on "Missile Factory" tile to draw random missile card
- Cannot draw during collision states

#### Radar Factory
- Land on "Radar Factory" tile to gain 1 radar card
- Cannot draw during collision states

### 6. Q&A System

#### Library Challenge
- Land on "Library" tile to trigger Q&A
- Correct answer: Draw reward card
- Wrong answer: Draw penalty card

#### Reward Cards (30 total)
- Extra roll & move (×4)
- Move forward 2/4/6 tiles (×4 each)
- Gain missile/radar (×4 each)
- Skip opponent's turn (×4)
- Block one attack (×2)

#### Penalty Cards (30 total)
- Extra roll & move backward (×4)
- Move backward 2/4/6 tiles (×4 each)
- Return to takeoff (×2)
- Skip turn (×4)
- Lose missile/radar (×4 each)

### 7. Victory Conditions

**Mode 1: Race Victory**
- First player to land 2 aircraft at home wins

**Mode 2: Time-Limited Victory**
- Set time limit (recommended: 2 hours)
- Player with most aircraft at finish line wins

## 📝 Q&A Question Bank

The game includes a knowledge quiz system. Customize questions by editing `data/questions.json`:

```json
[
  {
    "id": "q-001",
    "prompt": "What does AAM stand for?",
    "options": [
      "Air-to-Air Missile",
      "Anti-Aircraft Missile",
      "Auto-Aim Module",
      "Astro-Air Mark"
    ],
    "answerIndex": 0
  }
]
```

**Fields:**
- `id`: Unique identifier
- `prompt`: Question text
- `options`: Array of answer choices (typically 4)
- `answerIndex`: Zero-based index of correct answer

Restart the server after modifying the file.

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Protocol** | TypeScript + Zod schema validation |
| **Server** | Node.js 18, Socket.IO, nanoid, ESM modules |
| **Game Engine** | Authoritative state machine with structuredClone snapshots |
| **Client** | React 18, Vite 5, Zustand state management, Socket.IO client |
| **RNG** | Server-side `crypto.randomInt` (no client randomness) |
| **Styling** | Plain CSS with responsive design |

## 🔒 Security & Design

- **Authoritative Server**: Clients only request actions; server validates all moves against game state
- **Private Card Draws**: Only the drawing player sees card details; others see generic logs
- **No Client RNG**: All randomness generated server-side to prevent manipulation
- **State Snapshots**: Full game state synced to all clients after each action

## 🧪 Testing Checklist

- [ ] 2+ players can create/join rooms and see seats
- [ ] Takeoff only works on configured numbers
- [ ] Rolling 6 grants extra turn; three 6s = bust
- [ ] Same-color tiles trigger 4-cell jumps
- [ ] Shortcut channels work correctly (active vs passive)
- [ ] Landing on occupied takeoff tile causes collision
- [ ] Stacking allows perching; rolling 6 advances formation
- [ ] Missile factory draws random missile card
- [ ] Radar factory adds radar (max 3, zones: 0/1/3/5/7)
- [ ] Library triggers Q&A with rewards/penalties
- [ ] AAM duels resolve with counter-attacks
- [ ] SAM auto-prompts on radar zone entry
- [ ] ARM destroys radar on roll 5-6
- [ ] Cruise missiles hit takeoff automatically; need 4-6 for landing zone
- [ ] Cruise missiles pierce landing zone immunity
- [ ] Game ends when 2 aircraft reach home

## 📄 License

Private project — no license granted.

## 🤝 Contributing

This is a private project. For inquiries, please contact the project maintainer.

---

**Enjoy the game! 🎲✈️💥**
