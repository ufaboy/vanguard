# BATTLE TANK

A 3D isometric tactical tank assault game inspired by *Battle City*, built with **Three.js** and **Vanilla JavaScript** (native ES modules, zero bundler).

## Overview

**BATTLE TANK** combines classic arcade base-defense with modular tank engineering, directional armor, destructible 40×40 arenas, and role-driven enemy AI.

### Game Modes
- **Campaign**: Progress through 4 sectors and 35 missions against 12 specialized enemy tank classes and 4 unique Sector Bosses (`BOSS_MAMMOTH`, `BOSS_HYDRA`, `BOSS_TITAN`, `BOSS_INFERNO`). Campaign progress, credits, and Hangar upgrades persist in `localStorage`.
- **Survival (*Iron Crucible*)**: Endless wave defense starting with a stock Tier-1 tank in `sessionStorage` while saving personal records to `localStorage`.
- **Contracts**: Standalone tactical operations (*Last Cargo*, *Blackout Protocol*) starting with a stock Tier-1 tank in `sessionStorage` and syncing earned credits back to your Campaign balance.

### Key Features
- **Modular 5×5 Tank Upgrades**: Upgrade **Cannon**, **Chassis**, **Frame**, **Engine**, and **Armor** across Tiers I–V in the Hangar (`[U]`), with live 3D visual changes on the player tank.
- **Directional Armor & Ballistics**: Per-side armor (`front`, `left`, `right`, `rear`), armor penetration, mass-to-power mobility, and active component damage/repair.
- **Standalone Equipment & Field Power-Ups**: 4-corner Active Protection System (APS), homing ATGM rocket pod, emergency repair kits (`RM-1`), EMP, smoke grenades, and base restoration.
- **Destructible 40×40 Tactical Arenas**: Sub-block destructible Brick walls, multi-hit Reinforced Concrete, stealth Forest canopies, Water (crossable by `CH4`/`CH5`), low-friction Ice, Roads, Swamps, ignitable Oil Slicks, 3D Blast Craters, destructible Water Towers (flood nearby tiles & extinguish fires), Explosive Barrels, Wooden Crates, Anti-Tank Hedgehogs, Defense Turrets, Enemy Spawners, and a fortified Command Base HQ.
- **Tactical Enemy AI**: Role-based brains (`line`, `flanker`, `spearhead`, `artillery`, `minelayer`, `raider`, `hunter`, `ambusher`, `ewar`, `support`, `standoff`, `sniper`) coordinated by a Squad Director. Press `F3` in-game to toggle the AI Telemetry Overlay.

## Tech Stack & Architecture

- **Runtime**: Vanilla JavaScript (Native ES Modules), HTML5 (`<script type="importmap">`), CSS, and Three.js (`three` is the sole runtime dependency). No TypeScript, React, or Vite.
- **Static Deployment Ready**: Everything needed to run or host the game lives inside [`public/`](public/).

```text
├── public/              # Self-contained static web app (index.html, src/, maps/, models/, vendor/)
├── codex/               # Standalone 3D Codex studio (npm run codex -> http://localhost:3001/codex)
├── tests/               # Node.js test runner suites (node --test)
├── scripts/             # Linter, Three.js vendor sync, GLB optimizer, itch.io packager, Cloudflare Pages deploy
├── assets/blender/      # Source Blender scripts for 3D models
├── docs/                # Engineering specifications and design docs
├── .env.example         # Environment variable template (Cloudflare Pages credentials, etc.)
└── package.json         # Scripts and dev tooling
```

## Run Locally

**Prerequisites:** Node.js (v18+ recommended) and npm.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the local static server:
   ```bash
   npm run dev
   ```
   *(or `npm start`)*
3. Open [http://localhost:3000](http://localhost:3000) in your browser.
4. *(Optional)* Start the standalone **3D Codex** studio:
   ```bash
   npm run codex
   ```
   and open [http://localhost:3001/codex](http://localhost:3001/codex).

No build step is required—the browser loads ES modules directly from `public/`.

## Development & Testing

- **Lint** (syntax check, method-call verification, and dead-code check across `public/src/`):
  ```bash
  npm run lint
  ```
  *(Also aliased as `npm run build`.)*
- **Run tests** (uses Node's built-in test runner):
  ```bash
  npm test
  ```
- **Sync Three.js vendor files** into `public/vendor/` after updating `three`:
  ```bash
  npm run vendor
  ```
- **Optimize 3D models** (converts Blender GLBs with KTX2/Draco into `public/models/`):
  ```bash
  npm run optimize-models
  ```
- **Build itch.io bundle**:
  ```bash
  npm run build:itch
  ```

## Deployment (Cloudflare Pages)

The project includes a deployment script for Cloudflare Pages (`scripts/deploy.mjs`) that deploys `public/`.

1. Copy `.env.example` to `.env` and set your Cloudflare credentials (or authenticate via `npx wrangler login`):
   ```env
   CLOUDFLARE_ACCOUNT_ID="your-account-id"
   CLOUDFLARE_API_TOKEN="your-api-token"
   ```
2. Deploy to production or preview:
   ```bash
   npm run deploy
   npm run deploy:preview
   ```
3. Or test locally with Wrangler Pages:
   ```bash
   npm run pages:dev
   ```
