# AGENTS.md — Project Documentation & Engineering Rules

## 1. Core Project Rules (CRITICAL)

- **User balance edits**: The user may change gameplay constants and code directly. Treat current implementation values as the runtime source of truth; documentation and pinned balance expectations may be stale. Preserve unrelated tuning and report mismatches rather than reverting game characteristics to match documentation or tests.

1. **Language Policy (English-Only Content)**:
   - **All application content, UI text, HUD labels, status banners, code comments, identifiers, and documentation MUST be written strictly in English.**
   - **Chat Communication**: Agents may communicate with the user in the user's preferred language in the chat conversation, while keeping all source code, UI strings, and repository files in English.
2. **Pure Vanilla JavaScript Stack (Zero Bundler / No Vite)**:
   - The project is built strictly with **Vanilla JavaScript (Native ES Modules, `.js`)**, **HTML5 (`<script type="importmap">`)**, **Pure CSS (`src/index.css`)**, **Static Dev Server (`npx serve public -l 3000`)**, and **Three.js (`three` is the sole runtime dependency)**.
   - **Do NOT use TypeScript (`.ts`, `.tsx`), React, or Vite** anywhere in the project.
3. **Visual & Performance Discipline**:
   - **No CSS `backdrop-filter` / `backdrop-blur`** over the WebGL canvas, as it triggers expensive per-frame framebuffer readbacks. Use high-opacity solid surfaces (e.g., `bg-[#0B0F17]/95`) with crisp borders instead.
   - Maintain support for both hardware-accelerated WebGL and software WebGL fallback (`isSoftwareGl` detection in `TankGameEngine`).
4. **5-Track × 5-Level Player Component System & Standalone Modules**:
   - **Player Tank Components MUST have 5 levels of development (Tiers 1–5)** across all 5 core tracks:
     - **Cannon**: `CANNON_Mk1` to `CANNON_Mk5` (`Cannon Mk1` to `Cannon Mk5`, short Roman `I` to `V`)
     - **Chassis**: `CH1` to `CH5`
     - **Frame**: `F1` to `F5`
     - **Engine**: `E1` to `E5`
     - **Armor**: `A1` to `A5`
   - **Enemy Tank Components**: Enemy tanks may equip both standard player components (`C1..C5`, `CH1..CH5`, `F1..F5`, `E1..E5`, `A1..A5`) and enemy-exclusive special components (`CH_HOVER`, `HOWITZER`, `FLAMETHROWER`, `BOSS_DUAL`, `HYDRA_MLRS`, `TITAN_RAIL`, `CH_SCOUT`, `CH_TITAN`, `CH_HYDRA`, `CH_COLOSSUS`, `F_RAM`, `F_TITAN`, `F_HYDRA`, `F_BASTION`, `E_NITRO`, `E_OMEGA`, `E_SINGULARITY`, `A0`, `A_STEALTH`, `A_OMEGA`, `A_HYDRA`, `A_AEGIS`).
   - **Additional / Optional Modules (`OPTIONAL_EQUIPMENT`)**: Additional modules do **not** have upgrade levels (`leveled: false`); each module is a standalone entity with its own mechanic (`APS_MODULE`, `ROCKET_LAUNCHER`, `REPAIR_KIT_MOD`, `MINE_LAYER`, `WARHEAD`, `JAMMER`, `BUILDER_KIT`, `DOZER_BLADE`, `CLOAK`).
   - **Visibly Distinct 3D Tank Upgrades**: Every tier `1..5` across all 5 tracks (`C1..C5`, `CH1..CH5`, `F1..F5`, `E1..E5`, `A1..A5`) and active standalone modules (`APS`, `MISSILE`) must have a clearly visible 3D representation on the player tank rig in `src/game/models.js`.
5. **Tank Stats = Type Base + Components + Modules; Models Only Take Guidance From Them**:
   - Every tank type has a **base** (`base: tankBase({...})` in `src/game/tanks.js`): its own `hp`, `mass`, per-side `armor` (`front` / `left` / `right` / `rear`), `sightRadius` and `radioAlertRadius`. Core components (`src/game/components/`) and modules add to it. Final stats are computed **only** in `computeTankStats(loadout, base)` (`src/game/constants.js`):
     1. **HP** adds up: `base.hp` + `hpBonus` of every component and module.
     2. **Mass** = `base.mass` + component masses + module masses; **speed** follows only total mass and engine power (no chassis / frame speed multipliers).
     3. **Armour always works per side**: `base.armor[side]` + the armour component (its `armorByAspect`, otherwise its uniform `reductionPct`) + module `armorBonusByAspect`, capped at `DURABILITY.MAX_ARMOR`. Shell hits and blast splash both use the side that is hit; `stats.armor` is the weakest side.
     4. **Damage, penetration and reload** come from the cannon alone.
     5. **Sight and radio** come from the base; modules may add `sightBonus` / `radioBonus`.
   - **Tune a single tank type through its `base`**, never through a stat-only module. `OPTIONAL_EQUIPMENT` holds only equipment with its own mechanic. The balance table (Cannon Mk1 hits per type) is pinned in `tests/tank-stats.test.js`.
   - For 3D models and textures (procedural rigs in `models.js` and Blender builds in `assets/blender/`), a component's description is a **recommendation, not a strict specification**. A model may interpret, simplify, or omit a component's suggested visual details as long as the tank stays recognizable and stats are untouched.
   - **Bolt-on attachments are standalone modules, not part of a core component.** Elements such as a dozer blade (`DOZER_BLADE`) belong in `OPTIONAL_EQUIPMENT` and appear on a model only when the tank's loadout lists that module.
6. **Clarify Before Building a Tank Model**:
   - Before creating or rebuilding any tank model (Blender or procedural), **always confirm with the user**: which additional / optional modules the tank carries, its intended size relative to other tanks, and any distinctive features or elements it must (or must not) have.
7. **Release Before Deploy (On `main` After PR Merge)**:
   - Do **not** create Git tags or GitHub releases on a feature/PR branch or prior to PR merge.
   - Only **after** a PR is merged/squashed into `main`, create the annotated Git tag matching the `package.json` version on the resulting squash commit on `main` (e.g., `git tag -a v1.4.1 -m "Release v1.4.1"`) and create the remote/GitHub release, then run production deploy (`npm run deploy`). Do not deploy uncommitted work directly to production without a release.
8. **Version Bump Policy (Branches & PRs)**:
   - The `.githooks/pre-commit` hook auto-bumps the patch version **only** on direct commits to `main` (it skips feature branches, merges/rebases, and commits where `package.json` version is already staged).
   - While working on a feature branch, do **not** bump the version on intermediate commits. Bump the version (`node scripts/bump-version.mjs` or manually in `package.json` / `package-lock.json`) **only immediately before creating the Pull Request into `main`** (if it has not already been bumped relative to `main`), without creating any tag or release yet.
9. **Target Platform & Viewport Orientation (Desktop & Landscape Tablets)**:
   - The game UI, HUD, tactical 36×36 isometric arena, and cinematic operations screens are designed exclusively for **Desktop displays and Tablets in Landscape orientation** (16:9 or wider aspect ratio recommended).
   - Mobile phones and portrait orientations are strictly non-target configurations. Layouts, interactive controls, and visual styling must optimize for horizontal widescreen viewing.

---

## 2. Project Overview

**IRON VANGUARD** is a 3D isometric tactical tank assault game inspired by *Battle City*, built with Three.js and Vanilla JavaScript.

### Key Gameplay Features
- **36×36 Destructible Isometric Arena**:
  - 4× expanded tactical grid (`GRID_SIZE = 36`, `TILE_SIZE = 2`, 1,296 cells per sector).
  - Terrain types: Destructible Brick (4 sub-blocks per cell, 4 HP), Hard-to-Destroy Reinforced Concrete (`CONCRETE`, 16 HP with progressive cracking and exposed steel rebar), Stealth Forest Canopy, Impassable Water (crossable with the `CH4` All-Terrain or `CH5` Grav-Hover chassis), Low-Friction Ice, Enemy Spawner Pads, and the Command Base HQ.
- **Modular Tank Engineering & Physics (`src/game/constants.js`)**:
  - Dynamic calculation of **Total Mass**, **Engine Power-to-Weight Ratio**, **Move Speed**, **Armor Reduction (%)**, **Armor Penetration (%)**, and **Effective Damage**:
    $$\text{EffectiveArmor} = \text{Armor} \times \left(1 - \frac{\text{Penetration}}{100}\right), \quad \text{FinalDamage} = \text{Damage} \times \left(1 - \frac{\text{EffectiveArmor}}{100}\right)$$
  - Player Tier-1 durability is **22 HP** (the player base hull; Tier-1 components add no HP).
  - Low-HP penalty: below 33% HP, movement speed is reduced by 30% and the hull emits damage sparks.
- **5-Track × 5-Level Modular Upgrades with Live 3D Visuals (`src/game/models.js`)**:
  - **Cannon (`CANNON_Mk1`..`CANNON_Mk5` / `Cannon Mk1`..`Cannon Mk5` / `I`..`V`)**: Reload is governed strictly by each cannon's time-based `fireCooldown` in seconds (no active-projectile wait cap). `CANNON_Mk1` / `Cannon Mk1` (`I`) (20 dmg, 0% penetration, 1.5s) $\rightarrow$ `CANNON_Mk2` / `Cannon Mk2` (`II`) with laser rangefinder (22 dmg, 10%, 1.25s) $\rightarrow$ `CANNON_Mk3` / `Cannon Mk3` (`III`) thermal shroud (25 dmg, 22%, 1.2s) $\rightarrow$ `CANNON_Mk4` / `Cannon Mk4` (`IV`) heavy siege gun with hydro-recoil cylinders & rails (28 dmg, 32%, 1.0s) $\rightarrow$ `CANNON_Mk5` / `Cannon Mk5` (`V`) Twin-Linked Heavy AP dual barrels firing a rapid double salvo with 0.2s inter-barrel delay (concrete-cracking 28 dmg, 32% penetration, 1.0s full reload after salvo).
  - **Chassis (`CH1`..`CH5`)**: `CH1` 5-roadwheel steel tracks $\rightarrow$ `CH2` wide chevron treads + blue hydro-shocks $\rightarrow$ `CH3` 7-roadwheel heavy torsion tracks $\rightarrow$ `CH4` Active all-terrain tracks: extra-wide grouser tracks on hydropneumatic struts with gold height adjusters, rear water-jet propulsors, wading snorkel and cyan terrain scanners (crosses water and drives over ice, sand, mud and fords with no slowdown or slip) $\rightarrow$ `CH5` Quad-track articulated bogies + subtle low-profile under-hull hover trim (also all-terrain).
  - **Hull Frame (`F1`..`F5`)**: `F1` welded monocoque + tow shackles $\rightarrow$ `F2` tubular front bull-bar $\rightarrow$ `F3` reinforced heavy frame (front armor beam, side frame rails, corner gussets) $\rightarrow$ `F4` external composite exo-truss roll-cage $\rightarrow$ `F5` Titan serrated siege ram prow + armored sponsons.
  - **Engine (`E1`..`E5`)**: `E1` standard diesel louvers $\rightarrow$ `E2` V8 turbo hood + air filters & side mufflers $\rightarrow$ `E3` V12 twin-intercooler + 4 exhaust stacks + rear fuel drums $\rightarrow$ `E4` gas-turbine nacelle with glowing jet nozzle & intake rotor $\rightarrow$ `E5` Twin-core 225hp fusion reactor domes + dual plasma thrusters.
  - **Armor (`A1`..`A5`)**: `A1` rolled homogeneous hull $\rightarrow$ `A2` bolted appliqué armor + side skirts $\rightarrow$ `A3` *Kontakt-5* ERA wedges + 6 smoke launchers $\rightarrow$ `A4` *Chobham* arrowhead cheeks + roof ERA + rear slat screens $\rightarrow$ `A5` Super-heavy *Relikt* V-glacis citadel + wrap-around reactive pods.
- **Standalone Non-Leveled Modules (`OPTIONAL_EQUIPMENT`)**:
  - **4-Corner Active Protection System (`APS_MODULE`)**: Intercepts Cannon Mk1–Mk3 shells and all missiles for 1 charge each; Cannon Mk4/Mk5, HOWITZER and each BOSS_DUAL shell cost 2 charges. Requires the full charge cost before interception. Cannot stop FLAMETHROWER or TITAN_RAIL. Rules live in `public/src/sim/aps.js`.
  - **Turret Homing ATGM Pod (`ROCKET_LAUNCHER`)**: Player-fired guided missiles (`Space` / `Right Click`) with visible warheads on the turret pod.
  - **Emergency Auto-Repair Kit (`REPAIR_KIT_MOD`)**: Automatically restores +20 HP when hull integrity drops below 33%.
  - **Enemy Specialized Modules**: `MINE_LAYER`, `WARHEAD`, `JAMMER`, `BUILDER_KIT`, `DOZER_BLADE` (front mine-dozer blade, 8 t, no HP bonus), `CLOAK`.
- **12 Enemy Tank Types (`src/game/tanks.js` — `TANK_TYPES` & `TANK_CONFIGS`) + 3 Sector Bosses (`SECTOR_BOSS_CONFIGS`) & Combat Balance**:
  - `SCOUT`, `STANDARD`, `HOWITZER`, `ARMOR`, `SAPPER`, `HOVER`, `KAMIKAZE`, `FLAMETHROWER`, `JAMMER`, `ENGINEER`, `STRIKER`, and `STEALTH`, plus exactly three Sector Bosses (`BOSS_MAMMOTH`, `BOSS_HYDRA`, `BOSS_TITAN`), each with its own full loadout (there is no shared generic `BOSS` type).
  - Sector Bosses are distinct fights: `BOSS_MAMMOTH` (Sector 01) is the brawler siege dreadnought with loadout `BOSS_DUAL · CH_TITAN · F_TITAN · E_OMEGA · A_OMEGA + ROCKET_LAUNCHER` (136 HP, 40%); `BOSS_HYDRA` (Sector 02) is an amphibious stand-off rocket-artillery cruiser with its own loadout `HYDRA_MLRS · CH_HYDRA · F_HYDRA · E_OMEGA · A_HYDRA + ROCKET_LAUNCHER` (132 HP, 50%): it keeps 10-14 cells away, fires telegraphed 3-rocket triangle salvos at 6-14 cells, answers close-range intruders with a homing ATGM salvo, and below 50% HP reloads 25% faster but stops retreating (tuning in `HYDRA`, `constants.js`); `BOSS_TITAN` (Sector 03) is the final rail-fortress with its own loadout `TITAN_RAIL · CH_COLOSSUS · F_BASTION · E_SINGULARITY · A_AEGIS + JAMMER` (200 HP, slowest boss): every rail shot is telegraphed by a 1.2 s locked targeting beam before a brick-piercing 45 dmg / 80% penetration slug; Aegis armour is directional (60% front, 35% sides, 15% rear, judged on the hull; `A_AEGIS.armorByAspect`) so it must be flanked; an ECM jammer pulses every 8 s; at 60% HP it calls a one-time STANDARD + ARMOR escort, and at 30% it overloads (0.7 s charge, faster hull turn, rear armour 0%) (tuning in `TITAN`, `constants.js`).
  - **Enemy Behavior Actions & Luck (`public/src/sim/behavior/actions.js`)**: every enemy and boss config in `tanks.js` declares its own `behavior: defineBehavior(role, actions)`. `actions` is an ordered priority list; whenever the tank needs a movement order, a shot or a special, it takes the FIRST listed action of that kind whose condition holds. Each action has its own `luck` in `[0, 1]`: a plain success probability rolled once when the action is assigned. Move actions: `move_to_player` (success: the role brain fights the known player), `move_to_player_base` (drive into firing range of the HQ and hold), `defend_enemy_base` (return next to the enemy base while the player is within `DEFEND_TRIGGER_CELLS`), `move_to_zone` (`zone: { row, col }`), `follow_route` (the encounter's map `patrolRoute`, once), `patrol_zone` (around the given or current zone), `take_cover` (available for `afterHitSec` after a hit, default 3 s, or below the optional `hpBelow` HP ratio: drive to the nearest cell hidden from the player and hold it for `COVER_HOLD_SEC`), `ambush` (hide 3-6 cells from the last known player position, else from the HQ, preferring forest, chokepoints and the player's trail; hold until the player comes within `triggerCells`, default 5, then the next action springs the trap); cover and ambush orders stay active until they end even when their trigger has passed; a failed move roll drives to a random cell in another zone. The 36×36 arena is split into 6×6-cell zones. Orders are re-rolled when they end, after `MOVE_PLAN_SEC` (failed: `FAILED_MOVE_SEC`), or when a higher-priority action becomes available. Shoot actions: `shoot_player`, `shoot_player_base`, `shoot_obstacle`, `shoot_random`; rolled per shot: a hit aims exactly at the target's current position, a miss aims deliberately beside it (indirect fire lands outside the splash circle; a missed missile never homes). Specials: `set_mine` (miss: the mine lands off the planned spot), `build_brick`, `repair_ally`, `jam` (miss: wasted); unlisted specials always succeed. Luck values come only from the tank config (no map-level scaling, no spawn jitter); difficulty is tuned through enemy composition and count. Crew timing (reaction, turret alignment, reload jitter) is the same for every enemy (`GUNNER` in `gunner.js`). Per-tank weapon settings next to `behavior`: `artillery: { aimSec, flightSec }` (indirect fire: aiming time before each shell and shell flight time; defaults `ARTILLERY.AIM_TIME` / `FLIGHT_TIME`) and `missile: { homing }` (whether enemy missiles steer after launch).
  - **Enemy Role Brains (`brain.js`, `ROLE_CONFIGS`)**: every enemy tank type declares a `behavior.role` in `tanks.js`. The brain controls movement during a successful `move_to_player` order, which is available while the enemy sees the player or remembers / was radioed the player's position (artillery and jammer also while any ally spots the player; the engineer also while an ally needs repair). Brains pick a tactic, choose a tactical cell (`findTacticalCells`: distance band, LOS rule, cover, forest, water, chokepoints, player trail, flank direction, squad bearing slot, ally crowding, small score noise) and follow an A* path to it. Roles: `line` (`STANDARD`: engage from a firing cell, duck into cover, peek again; retreats once below 35% HP), `flanker` (`SCOUT`: 6-10 cells on the player's rear side, kites when crowded, evades after hits), `spearhead` (`ARMOR`: closes to 2-4 cells and holds glacis-first), `artillery` (`HOWITZER`: hidden 7-11 cell firing cell, fires on spotter data, relocates after 2-3 barrages, flees threats closer than 5 cells), `minelayer` (`SAPPER`: mines chokepoints on the player's recent trail, mines while evading, fights as `line` once out of mines; on patrol it only mines cells the player drove through), `raider` (`HOVER`: strikes from water / shorelines the player cannot cross, then withdraws), `hunter` (`KAMIKAZE`: stalks through cells hidden from the player, then a telegraphed red-spark zigzag charge inside 5 cells), `ambusher` (`FLAMETHROWER`: lurks hidden 3-6 cells away in forest / corners, rushes inside 5 cells), `ewar` (`JAMMER`: shadows out of sight, dashes into jam range only while allies are engaged, withdraws after each pulse), `support` (`ENGINEER`: drives next to the most damaged ally, otherwise fortifies, flees close threats), `standoff` (`STRIKER`: 7-10 cell LOS launch cell, shifts sideways after launches), `sniper` (`STEALTH`: 8-11 cell overwatch, one shot then slips into a hidden cell; standing still gives full camouflage). Sector Bosses use the same framework with their scripted weapons and phases intact: `dreadnought` (`BOSS_MAMMOTH`: closes to 3-6 cells and side-steps every other cycle), `cruiser` (`BOSS_HYDRA`: strafes inside its `HYDRA.PREFERRED_MIN_CELLS`..`PREFERRED_MAX_CELLS` band, capped inside sight range; phase 2 presses into `SALVO_MIN_CELLS`..`PREFERRED_MIN_CELLS`), `fortress` (`BOSS_TITAN`: advances glacis-first to `TITAN.HOLD_DISTANCE_CELLS` and holds). Boss bands are passed from `constants.js` via `bossBrainOverrides` in `engine.js`. Without contact or memory the next movement action of the behavior applies (`follow_route`, `move_to_player_base`, `patrol_zone`, ...).
  - **Enemy Abilities (`src/game/abilities/`)**: special mechanics are plugged into a tank type from its config, next to its role: `behavior` says *how* a tank fights, `abilities` says *what is special* about it (e.g. `SAPPER`: `behavior: defineBehavior('minelayer', [...]), abilities: ['mineLayer']`; specials roll their action luck via `rollTankSpecial`). Each ability is a module with `id` and optional hooks: `init(tank, game)` at spawn; `tryUse(tank, game, { brainActive, canSeePlayer })` for the shared `specialCooldown` slot (returns a cooldown when it acts; run by `updateAbilities`); `fire(tank, game, { target, distToPlayer, aimReady, token })` to replace the main gun (`target` is `player`, `base`, `breach` or `terrain`; returns the reload or 0 to hold fire; run by `fireAbilityWeapon`); `unarmed: true` for tanks without a gun (no aiming, no attack token; the engine checks `tank.armed`); and `contactRange` + `onContact(tank, game)` for effects when the tank touches the player (returning true spends the tank; run by `spendContactEnemy`). `equipAbilities` resolves them at spawn and caches `tank.armed`, `tank.weaponAbility` and `tank.contactAbility`. Abilities keep their own decision logic and tuning constants and use the engine only for world services. Current abilities: `mineLayer` (`MINE_LAYER`: ammunition from the `MINE_LAYER` module), `jammerPulse` (`JAMMER_PULSE`; `emitJammerPulse` is also reused by `BOSS_TITAN` on its own cadence), `engineerSupport` (`ENGINEER_SUPPORT`: weld allies, repair bricks, raise walls), `flameStream` (`FLAMETHROWER`: napalm puffs tuned by `FLAME_STREAM`; burns walls and terrain at half rate, never targets the base), `contactWarhead` (`KAMIKAZE`: unarmed, detonates `KAMIKAZE_BLAST` inside `CONTACT_WARHEAD.TRIGGER_RANGE`). New special mechanics go here as abilities, not as `enemyClass` branches in `engine.js`; unknown ability ids throw at spawn and in `tests/enemy-abilities.test.js`.
  - **AI Telemetry Overlay (F3)**: `aiDebugMode` shows exact HP bars plus a floating label per enemy (role, tactic, `FIRE` while it holds an attack token, the current movement order and shot with their dice results) and its remaining A* path (or a line to the player during a direct charge). Built in `updateAiDebugOverlay` only while the mode is on and fully disposed when it is turned off.
  - **Squad Director (`squad.js`)**: at most `maxAttackers` enemies (map JSON `enemies.maxAttackers`, default 3) may shoot at the player at once; tokens go to the closest tanks and rotate after 4 s when others wait. Bosses are exempt. Fighting tanks also get evenly spread bearing slots around the player so they converge from different sides. Artillery fires on spotter data while any ally sees the player.
  - **No-lead rule**: enemies never lead their shots. The Gunner (`gunner.js`, `computeAimPoint`) only reads the target's current position; do not add target velocity to enemy aiming. Homing missiles and artillery striking the current position are not leading.
  - Hits-to-kill and directional durability depend on the current tank base, equipped components, hit aspect and cannon. Compute them from `computeTankStats` and the combat damage functions. Historical numeric expectations in tests or documentation may lag user tuning; never revert current stats just to match an old snapshot.
- **Surfaces & Obstacles Catalog (`src/game/terrains/surfaces.js` — `TileType`, `SURFACE_TYPES`, `SURFACE_CONFIGS`)**:
  - Dedicated specs and descriptions for `EMPTY`, `BRICK`, `CONCRETE`, `FOREST`, `WATER`, `ICE`, `SPAWNER`, and `BASE`.
- **5 Tactical Field Power-Ups (`src/game/powerups.js` — `POWERUP` & `POWERUP_TYPES`)**:
  - `REPAIR`, `EMP`, `BASE_RESTORE`, `APS`, and `MISSILE`. Field Power-Ups are strictly situational combat abilities.
  - **BOX Supply Rules**: Tanks award credits; fully opened BOX caches roll `BOX_POWERUP_DROP_CHANCE` (currently 33%). Successful drops draw from the match's shuffled pool without replacement; exhausted pools reshuffle without adjacent repeats. Pickups stay at the cache location until collected or the mission ends. `BASE_RESTORE` has priority while HQ is destroyed and no reconstruction pickup is pending; emergency priority may override the bag cycle. Legacy map pickup types do not predetermine BOX contents.
  - **Hangar Supplies and Repairs**: Buy one APS charge for `APS.CHARGE_CREDIT_PRICE` (currently 1000) or one missile for `MISSILE.CREDIT_PRICE` (currently 3000), up to their current capacity limits. Component repair is priced by purchased tier through `componentRepairCost`: II 600, III 900, IV 1200, V 1500 credits; Tier I cannot currently fault.
  - **Credit Economy & Hangar Upgrades**: Destroying enemies and clearing missions yields **Credits ($)**. Upgrading core tracks (`C1..C5`, `CH1..CH5`, `F1..F5`, `E1..E5`, `A1..A5`) is performed in the **Hangar (`[U]`)** accessible within the repair radius of the Allied Command Base (or from the menu). Entering the Hangar in combat pauses battlefield simulation.
  - **Fortified Allied Base**: The player's Command Base is a two-bay tank workshop (`createCommandBaseBlock` in `models.js`) that occupies 2×1 cells (`baseCell` + its right neighbour) on the outermost row. `getBaseLayout` (`levels.js`) puts a 4-cell line of reinforced Concrete (16 HP) two rows towards the enemy and keeps the lane between them and the cells beside the HQ open, so tanks can drive up to it. Either HQ cell being hit destroys the base.
  - **Alloys & Part Levels Removed**: Secondary Alloys and Lv.0 → Lv.3 sub-levels are deleted; Credits are the sole universal upgrade currency.

---

## 3. Directory & File Architecture

All files directly required to run and deploy the game reside inside `/public` (which is a 100% self-contained static directory ready for direct deployment). Development, server, documentation, and configuration files remain in the project root `/`.

```text
/
├── AGENTS.md               # Project architecture and engineering rules (dev/docs)
├── docs/                   # Engineering documentation and specifications (dev/docs)
├── metadata.json           # AI Studio applet metadata (dev/config)
├── package.json            # Single runtime dependency ("three"); dev-only GLB tooling in devDependencies
├── scripts/
│   ├── lint.mjs            # `npm run lint`: syntax check of every module in public/src/, then lint-methods.mjs and lint-dead-code.mjs
│   ├── lint-methods.mjs    # Fails on calls to methods that do not exist (`// lint-methods-ignore` skips a line)
│   ├── lint-dead-code.mjs  # Fails on unused imports, exports, methods and write-only fields (`// lint-dead-ignore` keeps one)
│   ├── sync-vendor.mjs     # `npm run vendor`: copies only the used Three.js files into public/vendor
│   └── optimize-models.mjs # `npm run optimize-models`: Blender GLBs -> public/models (player atlas, 512 px cap, KTX2, Draco)
└── public/                 # Self-contained deployable game directory
    ├── index.html          # Application entry HTML with native ES importmap
    ├── serve.json          # Cache-Control headers for the static dev server (`serve`)
    ├── maps/               # JSON sector maps (36x36 tile layouts, enemy pools, fixed spawns, and bosses)
    │   ├── index.json      # Campaign map registry and tile/enemy legend
    │   ├── sector-01-frontier.json
    │   ├── sector-02-nord.json
    │   └── sector-03-titan-core.json
    ├── vendor/
    │   └── three/          # Pruned Three.js runtime (only imported modules + Draco decoder; see scripts/sync-vendor.mjs)
    └── src/
        ├── main.js         # Vanilla JS DOM UI, HUD telemetry, modals, and event delegation
        ├── router.js       # Hash router: URL <-> out-of-combat screen (#/play, #/campaign/<id>, #/guide, #/settings, #/codex/<id>, #/hangar); one SPA, one WebGL context
        ├── menu.js         # Menu shell: picks the screen module for state.menuPage, shared header/back/footer
        ├── views/          # One module per screen: home.js, play.js, campaign.js, guide.js, settings.js, codex.js
        ├── hangar-ui.js    # Hangar & Workshop drawer
        ├── index.css       # Standalone compiled CSS stylesheet
        ├── sim/            # Pure simulation modules (catalog, ballistics, subsystems, AI, hangar, missions)
        │   └── behavior/   # Enemy behavior system: actions + Luck rolls + zones (actions.js), no-lead Gunner (gunner.js), A* + grid LOS (navgrid.js), tactical cell queries (positions.js), role brains (brain.js), Squad Director (squad.js)
        └── game/
            ├── components/     # Dedicated catalog modules: Cannons, Chassis, Frames, Engines, Armors, Modules
            │   ├── index.js
            │   ├── cannons.js
            │   ├── chassis.js
            │   ├── frames.js
            │   ├── engines.js
            │   ├── armors.js
            │   ├── modules.js
            │   ├── types.js
            │   └── upgrades.js
            ├── terrains/       # Terrain & surface modules
            │   ├── surfaces.js           # Dedicated catalog: characteristics & descriptions of all surfaces/obstacles
            │   ├── continuous-surface.js # Shared contour builder for continuous water / ice patches
            │   ├── water.js              # Water surface + wet bank
            │   ├── ice.js                # Frozen surface with fractures and frosted edges
            │   ├── sand.js               # World-aligned dune shading, wind ripples, runtime sand patch masks
            │   ├── brick-models.js       # Blender BRICK tile model: 5 damage states (BRICK_HP_0..4) from models/terrain/brick.glb
            │   ├── urban-ground.js       # Baked ground texture with decoration and sand zones
            │   ├── enemy-stronghold.js   # ENEMY_BASE model: tiered concrete fortress (bastions, lit gate, spire + reactor crystal), merged per material
            │   └── mountains.js          # Non-colliding rocky perimeter outside the arena
            ├── abilities/      # Enemy special abilities plugged in from tank configs (index.js registry, mine-layer.js, jammer-pulse.js, engineer-support.js, flame-stream.js, contact-warhead.js)
            ├── tanks.js        # Dedicated catalog: characteristics & descriptions of all tank types
            ├── powerups.js     # Dedicated catalog: characteristics & descriptions of all Power-Ups
            ├── constants.js    # Core combat constants, physics formulas, and catalog re-exports
            ├── types.js        # Core game enumerations (GameStatus) and catalog re-exports
            ├── levels.js       # JSON map loader, parser, and sector configurations
            ├── icons.js        # Trophy SVG badges and 2D Canvas hologram emblem renderers
            ├── codex.js        # 3D Codex catalog (Tanks, Surfaces, Power-Ups, Combat Effects)
            ├── models.js       # Three.js procedural textures, terrain meshes, and 3D tank rigs
            ├── fx.js           # Particle combat effects (FxSystem: fire, smoke, sparks, shockwaves, decals)
            ├── tile-batcher.js # Renders static map tiles through a few InstancedMeshes (TileBatcher)
            ├── texture-gen.js  # Procedural canvas textures (TextureGenerator) + worker transport
            ├── texture-worker.js # Generates the procedural textures off the main thread at startup
            ├── dispose.js      # Ownership-based GPU resource cleanup (markOwned / autoDisposeOwned)
            ├── sound.js        # Web Audio API procedural sound effects synthesizer
            └── engine.js       # Three.js WebGL game loop, AI, physics, collisions, and camera
```

---

## 4. Development & Verification Workflow

- **Adding/Editing Features**:
  - Keep state management decoupled: `TankGameEngine` (`public/src/game/engine.js`) owns the 3D scene and simulation state and emits snapshots to `public/src/main.js` via `onHudUpdate`.
  - Use DOM event delegation (`data-action` attributes) in `public/src/main.js` for UI interactions.
- **Verification**:
  - Always run `compile_applet` (`npm run build`) and `lint_applet` (`npm run lint`) after making code changes to verify zero build or syntax errors. Lint also fails on calls to missing methods and on unused code: delete what it reports, or drop the needless `export`, instead of silencing it.
- **Blender Builds (`assets/blender/`)**:
  - Always pass an **absolute** output directory inside `assets/blender/<tank>/` after `--` (e.g. `-- C:/projects/.../assets/blender/armor`). On Windows, Blender resolves relative image/render paths against the drive root, so a relative path like `-- armor` writes to `C:\armor\`. The build and bake scripts refuse any output directory outside `assets/blender/`.
