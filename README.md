# IRON VANGUARD

A 3D isometric tactical tank assault game inspired by *Battle City*, built with **Three.js** and **Vanilla JavaScript** (native ES modules, zero bundler).

## Overview

**IRON VANGUARD** combines classic arcade base-defense with modular tank engineering, directional armor, destructible 36×36 arenas, and role-driven enemy AI.

### Game Modes
- **Campaign**: Progress through 3 sectors and 15 missions against 12 specialized enemy tank classes and 3 unique Sector Bosses (`BOSS_MAMMOTH`, `BOSS_HYDRA`, `BOSS_TITAN`). Campaign progress, credits, and Hangar upgrades persist in `localStorage`.
- **Survival (*Iron Crucible*)**: Endless wave defense starting with a stock Tier-1 tank in `sessionStorage` while saving personal records to `localStorage`.
- **Contracts**: Standalone tactical operations (*Last Cargo*, *Blackout Protocol*) starting with a stock Tier-1 tank in `sessionStorage` and syncing earned credits back to your Campaign balance.

### Key Features
- **Modular 5×5 Tank Upgrades**: Upgrade **Cannon**, **Chassis**, **Frame**, **Engine**, and **Armor** across Tiers I–V in the Hangar (`[U]`), with live 3D visual changes on the player tank.
- **Directional Armor & Ballistics**: Per-side armor (`front`, `left`, `right`, `rear`), armor penetration, mass-to-power mobility, and active component damage/repair.
- **Standalone Equipment & Field Power-Ups**: 4-corner Active Protection System (APS), homing ATGM rocket pod, emergency repair kits (`RM-1`), EMP, and base restoration.
- **Destructible 36×36 Tactical Arenas**: Sub-block destructible Brick walls, multi-hit Reinforced Concrete, stealth Forest canopies, Water (crossable by `CH4`/`CH5`), low-friction Ice, Enemy Spawners, and a fortified Command Base HQ.
- **Tactical Enemy AI**: Role-based brains (`line`, `flanker`, `spearhead`, `artillery`, `minelayer`, `raider`, `hunter`, `ambusher`, `ewar`, `support`, `standoff`, `sniper`) coordinated by a Squad Director. Press `F3` in-game to toggle the AI Telemetry Overlay.

## Tech Stack & Architecture

- **Runtime**: Vanilla JavaScript (Native ES Modules), HTML5 (`<script type="importmap">`), CSS, and Three.js (`three` is the sole runtime dependency). No TypeScript, React, or Vite.
- **Static Deployment Ready**: Everything needed to run or host the game lives inside [`public/`](public/).

```text
├── public/              # Self-contained static web app (index.html, src/, maps/, models/, vendor/)
├── tests/               # Node.js test runner suites (node --test)
├── scripts/             # Linter, Three.js vendor sync, GLB optimizer, Cloudflare Pages deploy
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

No build step is required—the browser loads ES modules directly from `public/`.

## Development & Testing

- **Lint** (syntax check, method-call verification, and dead-code check across `public/src/`):
  ```bash
  npm run lint
  ```
  *(Also aliased as `npm run build`.)*
- **Run tests** (uses Node's built-in test runner):
  ```bash
  node --test tests/*.test.js
  ```
- **Sync Three.js vendor files** into `public/vendor/` after updating `three`:
  ```bash
  npm run vendor
  ```
- **Optimize 3D models** (converts Blender GLBs with KTX2/Draco into `public/models/`):
  ```bash
  npm run optimize-models
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
