---
name: create-map
description: Create a new BATTLE TANK (Vanguard) battlefield map JSON from a theme — a real place ("Gdansk shipyard", "Pripyat") or a generic setting ("frozen mountain pass") — that looks like a believable real location and plays well. Use when the user asks for a new map, a themed map, or /create-map <theme>.
---

# Create Map

Turn a theme into one complete, playable 40×40 map JSON that reads as a real place from the game camera. The output is **only the map file**: do not register it in a campaign / survival / contract index, add i18n entries, or wire it into progression. (Integration notes for later live in `docs/map-integration.md` when that file exists locally.)

Follow the repository's AGENTS.md. Treat current code as the runtime contract; documentation and old maps may be stale.

## Inputs

- **Theme** (required): a real place or a generic setting.
- **Game mode** (required): `extermination`, `stronghold_assault` or `base_defense`. If the user did not give one, **ask** in the brief step — never guess.
- **Output path** (optional): default `public/maps/drafts/<slug>.json` (kebab-case slug of the map name).

## Workflow

### 1. Load the vocabulary

Read [catalog.md](references/catalog.md) (tile characters, what may stand on what, buildings, landmarks, map JSON fields), [realism.md](references/realism.md) (realism rules, scale, theme palettes) and [decoration.md](references/decoration.md) (the 2D `decoration` contract). Open one recent map of the same mode in `public/maps/` as a format example — copy its structure, not its layout. Before using a field or token, confirm it still exists in `public/src/game/levels.js` / `terrains/layers.js`; never invent keys.

### 2. Research the place

- **Real place**: use web search and your own knowledge to learn its layout: what the place is for, its main roads / rail / water, the characteristic buildings, the dominant landmark, the terrain around it. Read pages only — do not download maps or files. Summarize what you will keep and what you will simplify.
- **Generic theme**: decide what real-world kind of place it is (a mountain pass with a road, a supply depot and a village) and what it would contain.
- If a requested real place cannot be found, fall back to a generic version of the theme and tell the user.

### 3. Brief and zoning sketch — wait for approval

Before filling any cells, show the user:

1. **Place**: what it is and its function; for a real place, the reference summary (kept / simplified).
2. **Mode** (ask here if it was not given), environment theme (`urban`, `forest`, `desert`, `coast`, `alpine`, `industrial`, `capital`).
3. **Dominant landmark** and where it sits.
4. **Routes**: the three routes from the enemy entrances to the player base (open direct, covered detour, destructible shortcut), breach points, the flank BOX pockets.
5. **Draft roster** idea (types and why they fit the terrain).
6. **Zoning sketch**: a 20×20 character sketch (one character = 2×2 cells) with a legend of zones (e.g. `R` road, `W` water, `h` housing, `i` industry, `f` forest, `g` fields, `b` player base, `e` enemy entry / base). North is up; enemies come from the north.

Do not continue until the user approves or corrects it.

### 4. Author the map by hand

Write `surfaceLayout` and `objectLayout` directly (40 strings of 40 characters each). Build in this order and keep every layer consistent with the place's logic:

1. Base ground and natural terrain (grass, sand, stone, swamp, snow-type ice areas).
2. Water bodies with natural banks.
3. Road network (and bridges where roads cross water).
4. Building blocks fronting the roads; yards; industrial plots.
5. Vegetation masses, tree lines, parks.
6. Context objects (barrels, oil, crates, water tower) and the **war layer** (defence lines, hedgehogs, craters, rubble, damaged blocks).
7. Player base, player spawn, enemy entrances, enemy base (stronghold mode), BOX caches.
8. `decoration` (zones, paths, labels, markings) with a unique `seed`; `landmarks3d` only when an existing kind fits.
9. `enemies` + `enemyPool`, `design`, `environment`, `rules`, `completionReward`.

Fill in `design` with `enemySide: "north"`, `tacticalIdentity`, `breaches`, and a `reference` object: `{ "place": "...", "kind": "real" | "generic", "kept": [...], "simplified": [...] }`.

### 5. Hard gameplay invariants (never break these for realism)

Gameplay wins over realism, but resolve conflicts by moving, compressing or adding things *in a way that still fits the place*, not by dropping its logic.

- **Orientation**: enemies always enter from the north edge; the player base sits on the southern outer row. Rotate a real place to fit.
- **Entrances**: all `enemies.entrances`, encounter `initialCells`, and enemy spawn-related cells lie in rows 0–11. Row 0 has several open, drivable entry gaps that connect to continuous corridors through the first third of the map. Never seal the north edge.
- **No border frame**: no continuous `C`/`B` perimeter box. Edges stay open terrain, forest, water or local buildings.
- **No unbreakable water divider**: no continuous water line across the map between the enemy side and the base. Every full-width water barrier has dry fords, bridges (`=`), or destructible breach points.
- **Connectivity**: the player spawn can reach every enemy entrance, either over open ground or through brick / concrete breaches. Every BOX can be reached and collected with the stock chassis.
- **Base**: `baseCell` and its right neighbour are `HH` on the outermost southern row. `getBaseLayout` (`levels.js`) adds a 4-cell concrete line two rows north and keeps the lane open — do not author over those cells. Keep the player spawn open and a few rows north of the base.
- **Stronghold mode**: the `E` enemy base sits deep in the north (rows 2–7), never mid-map, with `enemyBase.fortifyPerimeter: true` and concrete around it.
- **Placement compatibility**: every object stands on a surface allowed by `canPlaceOnSurface` (see catalog.md).

### 6. Tactical minimum

- At least **3 distinct routes** from the enemy entrances to the base: an open direct one, a covered detour, and a destructible shortcut.
- **2–4 breach points** (brick / concrete) that really shorten a route; list them in `design.breaches`.
- **Alternating ranges**: open fields / squares for long-range fights next to built-up or wooded close-quarters zones.
- At least one **flank pocket with a BOX** that is worth the risk.
- The base has cover, but **most BOX caches lie outside the HQ safe zone**. BOX contents are random (see `terrains/boxes-loot.js`); never promise a specific reward.
- Asymmetric but fair: no mirrored halves, no uniform grids.

### 7. Draft enemy roster

- Total budget **20–32 tanks**; `initialSpawnCount: 4`, `maxConcurrent: 8`; `enemyPool` equals the flattened `encounters[].enemies` in order.
- At most **3 encounters** (probe → pressure → finale), each with its own entrances and a `patrolRoute` that follows the routes you designed.
- Types follow the terrain: `HOVER` only with water; `STEALTH` / `FLAMETHROWER` with forest and cover; `HOWITZER` / `STRIKER` with long sightlines; `SAPPER` with chokepoints; `ENGINEER` with lots of brick. `STANDARD` / `ARMOR` / `SCOUT` fill the rest.
- **No sector bosses** unless the user asks.
- Read current type ids from `public/src/game/vehicles/tanks.js`.

### 8. Verify with scripts

```text
node skills/create-map/scripts/inspect-map.mjs . <map-json-path>
node skills/create-map/scripts/audit-map.mjs <map-json-path>
```

Both must report no errors. Also check by reading the grid: entrance gaps on row 0, no full-width water line, breaches listed in `design` really exist, `enemyPool` matches the encounters. Scripts are evidence, not proof of realism or fun.

### 9. Verify visually in the editor (required)

1. Start the dev map editor: `pnpm run editor` serves the repository root on port 3002 (add a `.claude/launch.json` entry `npx --yes serve . -l 3002` if `preview_start` needs one).
2. Open `http://localhost:3002/editor/?map=/<map-json-path>` in the built-in browser — the `?map=` parameter loads any JSON under the repository root.
3. Take screenshots from the top view and the isometric 3D view. Check: does it read as the intended place? Are roads continuous, buildings plausible, water banks natural, vegetation organic, the dominant landmark visible? Are firing lanes, entrances and the base readable?
4. Fix what looks wrong in the JSON, reload, repeat. Show the final screenshots to the user.

The editor's 3D view renders tiles, buildings and landmarks but **not** the 2D `decoration` layer (zones, paths, markings, labels), and its viewport crops the map edges (zoom out with the mouse wheel; top view via `Iso / Top`). Say which decoration you could not see instead of calling it verified.

If the browser is unavailable, say plainly that no visual check happened.

## Deliver

Report: file path, the place and what was simplified, mode, dominant landmark, routes and breaches, BOX pockets (inside / outside the HQ safe zone), roster summary, script results, screenshots, and what still needs a real playtest. Do not create additional maps, change existing maps, or edit game code unless asked.
