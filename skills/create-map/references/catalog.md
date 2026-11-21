# Map vocabulary

Snapshot of the runtime contract. Before relying on a value, confirm it in `public/src/game/levels.js` (`SURFACE_CHAR_TO_TILE`, `OBJECT_CHAR_TO_TILE`), `public/src/game/terrains/layers.js` (`canPlaceOnSurface`) and `public/src/game/terrains/surfaces.js` (`SURFACE_CONFIGS`). The user tunes these values often, so the code wins.

## Grid

- `gridSize: 40`, `tileSize: 2`. Coordinates are `{ row, col }` from the top-left; row 0 is the north (enemy) edge and row 39 the south (player) edge.
- Every cell has a **surface** (`surfaceLayout`) and an optional **object** (`objectLayout`, `.` = none). Both are 40 strings of 40 characters.

## Surfaces (`surfaceLayout`)

| Char | Surface | Driving | Use it for |
| --- | --- | --- | --- |
| `.` / `G` | Ground (asphalt / dirt) | normal | yards, plazas, dirt fields, generic ground |
| `R` | Road | faster (×1.2) | the road network only, never scattered |
| `V` | Grass | normal | meadows, verges, parks, forest floor |
| `S` / `N` | Sand | slow (×0.78) | deserts, beaches, riverbanks, construction sites |
| `^` | Stone | top speed capped (1.5 cells/s) | rocky ground, scree, quarries, mountain slopes |
| `M` | Swamp / mud | very slow (×0.58) | marshes, wet riverbanks, flooded fields |
| `I` | Ice | slippery for the player | frozen lakes and rivers, glaciers, iced roads |
| `L` | Oil slick | slightly slow, flammable (chain-ignites) | spills at depots, under and around barrels, wrecked vehicles |
| `W` | Water | impassable (CH4 / CH5 and hover enemies cross it) | rivers, lakes, sea, canals, docks |

## Objects (`objectLayout`)

| Char | Object | Blocks tanks | Blocks shells | HP | Notes |
| --- | --- | --- | --- | --- | --- |
| `B` | Brick wall | yes | yes | 4 | walls, fences, garden walls, ruins, breach points |
| `C` | Concrete wall | yes | yes | 16 | bunkers, quays, dams, industrial walls, hard breaches |
| `A` | 1-storey building | yes | yes | 25 | houses, sheds, warehouses; collapses into rubble |
| `P` | 2-storey building | yes | yes | 70 | apartment blocks, offices, factory halls |
| `F` | Forest canopy | no | no | – | woods, tree lines, parks; hides tanks |
| `X` / `Z` | Czech hedgehog | yes | no | – | defence lines, road blocks |
| `D` / `O` | Fuel barrel | yes | yes | 1 | explodes with chain reactions |
| `Q` | Supply boxes (BOX) | yes | yes | 2 | loot caches; release random power-ups |
| `K` | Shell crater | no (slow) | no | – | battle damage |
| `U` | Rubble | no (very slow) | no | 1 | collapsed buildings, ruined walls |
| `T` | Water tower | yes | yes | 2 | a classic dominant landmark |
| `=` | Bridge | no (fast) | no | – | only on water, where a road crosses it |
| `H` | Allied HQ | – | – | – | exactly two cells `HH` on the southern outer row |
| `E` | Enemy base | – | – | 48 | `stronghold_assault` only |

### Buildings

Each connected cluster of `A` (or of `P`) becomes one modular building with outward-facing walls and one style. The style mix comes from `environment.theme` (`THEME_ITERATION2_SHARE` in `building-layout.js`): `urban` is all residential; `industrial` and `desert` are mostly warehouses / factories / offices; `coast` and `capital` are mostly residential. So:

- One cluster = one building. Separate neighbouring houses with at least one cell (a yard, a lane) or by alternating `A` and `P`.
- The cluster's shape is the building's footprint: use rectangles, L-shapes and courtyard blocks of real-looking proportions, not single cells.
- `B` and `C` always render as plain wall blocks, not buildings.

## What may stand on what (`canPlaceOnSurface`)

| Object | Allowed surfaces |
| --- | --- |
| `=` bridge | `W` only |
| `F` forest | `.` ground, `V` grass |
| `D` barrel | `.`, `S`, `^`, `V`, `R`, `L` |
| walls (`B`, `C`, `A`, `P`) and decorations (`X`, `Q`, `K`, `U`, `T`) | dry solid ground: `.`, `S`, `^`, `V`, `R` |
| `H`, `E` | `.`, `^`, `V` (`FACILITY_SURFACES`) |

Nothing except a bridge stands on water, swamp, ice or oil (barrels may stand on oil).

## 3D landmarks (`landmarks3d`)

`[{ "kind": "...", "row": r, "col": c }]` with a kind from `PLACEABLE_LANDMARKS` (`terrains/landmarks.js`); `row` / `col` is the footprint's top-left cell. These are real monuments, so use them only where they truly belong:

- Paris: `EIFFEL_TOWER`, `ARC_DE_TRIOMPHE`, `NOTRE_DAME`, `LOUVRE_PYRAMID`, `SACRE_COEUR`, `CONCORDE_OBELISK`.
- Berlin: `BRANDENBURG_GATE` (7×2; cells 0, 2, 4, 6 block, cells 1, 3, 5 are drivable passages running north-south; an object such as `B` may close a passage) and `VICTORY_COLUMN` (2×2, fully blocked).
- Versailles: `VERSAILLES_PALACE` (16×3, fully blocked, garden front facing north), `LATONA_FOUNTAIN` and `APOLLO_FOUNTAIN` (2×2, fully blocked).

The map scripts treat landmark footprints as solid walls (`#` in `layered-layout.mjs`).

A new monument needs a Blender build (`assets/blender/landmarks*/`), a `LANDMARK_SPECS` entry with its footprint and GLB `pack`, and a procedural fallback. For other places, build the dominant landmark from tiles (water tower, bridge, a large `P` block, a square with a label, a dam, a quay).

## Map JSON fields

Use a recent map of the same mode as the template. Typical top-level keys:

- `mapId`, `id`, `name`, `subtitle`, `objective`, `gameMode`, `gridSize`, `tileSize`
- `playerSpawnCell`, `baseCell`, `enemyBase` (`stronghold_assault`: `{ cell, name, maxHp, fortifyPerimeter: true }`)
- `rules` (`spawnSectorBossOnClear`, `defeatOnBaseLoss`), `completionReward`
- `environment` (`theme`, `tint`, `fogColor`, `groundColor`)
- `design` (`enemySide`, `tacticalIdentity`, `breaches[]`, `reference`)
- `decoration` (see decoration.md), `landmarks3d`, optional `mines`, `mineSigns`
- `enemies` (`initialSpawnCount`, `maxConcurrent`, `spawnIntervalSec`, `entrances[{id,row,col}]`, `encounters[{id,label,enemies[],initialCells?,entrances[],patrolRoute[],recoverySec}]`, optional `nextWave: { when: "cleared", delaySec }` to start each group exactly `delaySec` after the previous one is fully destroyed; without it the next group starts when at most one tank is left and `recoverySec` is halved) and `enemyPool`
- `surfaceLayout`, `objectLayout`

Map text (`name`, `subtitle`, `objective`, encounter labels, decoration labels) is English. The skill does not add i18n entries; that happens when the map is integrated.
