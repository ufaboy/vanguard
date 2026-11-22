# BATTLE TANK

A 3D isometric tactical tank assault game inspired by *Battle City*, built with **Three.js** and **Vanilla JavaScript** (native ES modules, zero bundler).

## Overview

**BATTLE TANK** combines classic arcade base-defense with modular tank engineering, directional armor, destructible 40×40 arenas, and role-driven enemy AI.

### Game Modes
- **Campaign**: Progress through 7 regions and 38 missions against 12 specialized enemy tank classes and 4 unique Sector Bosses (`BOSS_MAMMOTH`, `BOSS_HYDRA`, `BOSS_TITAN`, `BOSS_INFERNO`). Campaign progress, credits, and Garage upgrades persist in `localStorage`.
- **Survival (*Iron Crucible*, *Paris Last Stand*)**: Endless wave defense starting with a stock Tier-1 tank in `sessionStorage` while saving personal records to `localStorage`.
- **Contracts**: Standalone tactical operations (*Blackout Protocol*, *Last Cargo*, *Charles Bridge*, *Brandenburg Gate*, *Versailles*, *Brussels*, *Remagen Bridgehead*) starting with a stock Tier-1 tank in `sessionStorage` and syncing earned credits back to your Campaign balance.

### Key Features
- **Modular 5×5 Tank Upgrades**: Upgrade **Cannon**, **Chassis**, **Frame**, **Engine**, and **Armor** across Tiers I–V in the Garage (`[U]`), with live 3D visual changes on the player tank.
- **Directional Armor & Ballistics**: Per-side armor (`front`, `left`, `right`, `rear`), armor penetration, mass-to-power mobility, and active component damage/repair.
- **Standalone Equipment & Field Power-Ups**: 4-corner Active Protection System (APS), homing ATGM rocket pod, emergency repair kits (`RM-1`), EMP, smoke grenades, and base restoration.
- **Destructible 40×40 Tactical Arenas**: Sub-block destructible Brick walls, multi-hit Reinforced Concrete, stealth Forest canopies, Water (crossable by `CH4`/`CH5`), low-friction Ice, Roads, Swamps, ignitable Oil Slicks, 3D Blast Craters, destructible Water Towers (flood nearby tiles & extinguish fires), Explosive Barrels, Wooden Crates, Anti-Tank Hedgehogs, Defense Turrets, Enemy Spawners, and a fortified Command Base HQ.
- **Tactical Enemy AI**: Role-based brains (`line`, `flanker`, `spearhead`, `artillery`, `minelayer`, `raider`, `hunter`, `ambusher`, `ewar`, `support`, `standoff`, `sniper`) coordinated by a Squad Director. Press `F3` in-game to toggle the AI Telemetry Overlay.

## Tech Stack & Architecture

- **Runtime**: Vanilla JavaScript (Native ES Modules), HTML5 (`<script type="importmap">`), CSS, and Three.js (`three` is the sole runtime dependency). No TypeScript or React; the game is never bundled.
- **Static SEO pages**: the home, mode, guide and info pages (English and Spanish) are rendered at build time by [Astro](https://astro.build) from [`site/`](site/) into `dist/site`, together with an untouched copy of [`public/`](public/) (the game, assets and page scripts).

```text
├── public/              # Game and assets served as written (battlefield.html, src/, maps/, models/, vendor/)
├── site/                # Astro sources of the static pages (layout, footer, pages, i18n helpers)
├── i18n/pages/          # Translations of the static pages
├── codex/               # Standalone 3D Codex studio (pnpm run codex -> http://localhost:3001/codex)
├── tests/               # Node.js test runner suites (node --test)
├── scripts/             # Linter, Three.js vendor sync, GLB optimizer, itch.io packager, Cloudflare Pages deploy
├── assets/blender/      # Source Blender scripts for 3D models
├── docs/                # Engineering specifications and design docs
├── .env.example         # Environment variable template (Cloudflare Pages credentials, etc.)
└── package.json         # Scripts and dev tooling
```

## Run Locally

**Prerequisites:** Node.js (v18+ recommended) and pnpm (the version pinned in `package.json` `packageManager`; `corepack enable` installs it).

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Build the site and start the local static server:
   ```bash
   pnpm run dev
   ```
   *(or `pnpm start`)*
3. Open [http://localhost:3000](http://localhost:3000) in your browser.
4. *(Optional)* Start the standalone **3D Codex** studio:
   ```bash
   pnpm run codex
   ```
   and open [http://localhost:3001/codex](http://localhost:3001/codex).

The game needs no build step: the browser loads its ES modules directly. `pnpm run dev` only renders the static pages with Astro (`pnpm run build:site`) and serves `dist/site`; use `pnpm run dev:site` for the Astro dev server with live reload while editing pages.

## Development & Testing

- **Lint** (syntax check, method-call verification, and dead-code check across `public/src/`):
  ```bash
  pnpm run lint
  ```
  *(`pnpm run build` runs lint and the Astro site build.)*
- **Run tests** (uses Node's built-in test runner):
  ```bash
  pnpm test
  ```
- **Sync Three.js vendor files** into `public/vendor/` after updating `three`:
  ```bash
  pnpm run vendor
  ```
- **Optimize 3D models** (converts Blender GLBs with KTX2/Draco into `public/models/`):
  ```bash
  pnpm run optimize-models
  ```
- **Build itch.io bundle**:
  ```bash
  pnpm run build:itch
  ```

## Deployment (Cloudflare Pages)

The project includes a deployment script for Cloudflare Pages (`scripts/deploy.mjs`) that builds the site and deploys `dist/site`.

1. Copy `.env.example` to `.env` and set your Cloudflare credentials (or authenticate via `pnpm exec wrangler login`):
   ```env
   CLOUDFLARE_ACCOUNT_ID="your-account-id"
   CLOUDFLARE_API_TOKEN="your-api-token"
   ```
2. Deploy to production or preview:
   ```bash
   pnpm run deploy
   pnpm run deploy:preview
   ```
3. Or test locally with Wrangler Pages:
   ```bash
   pnpm run pages:dev
   ```
