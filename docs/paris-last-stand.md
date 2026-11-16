# Survival S-01 — Paris: Last Stand (Design Contract)

This document is the shared contract between gameplay code, the map JSON and the
landmark 3D models of the reworked Survival mode. It replaces the former
`Iron Crucible` survival map.

## 1. Mode rules

- Objective: keep the **Élysée Palace HQ** alive for **7:00** (420 s). Holding to
  7:00 is a **victory**.
- **Defeat**: player tank destroyed, or the HQ destroyed (`defeatOnBaseLoss: true`).
- The HQ has its own hit-point pool: **`baseMaxHp: 120`**. Shells, missiles, flame
  and blast splash that hit any HQ footprint cell subtract their damage from that
  pool (no one-shot HQ). HUD shows an HQ HP bar. Other maps keep the legacy
  one-hit two-cell HQ (`baseMaxHp` absent).
- **Timed waves**: a new wave starts every **60 s** regardless of whether the
  previous wave was cleared (0:00, 1:00, 2:00, 3:00, 4:00, 5:00). Survivors stay.
  **Wave 7 at 6:00** is the finale: a Sector Boss (`BOSS_MAMMOTH`) plus escort.
- `[N]` calls the next wave early for `EARLY_CALL_BONUS` credits; it does not speed
  up the 7:00 victory clock.
- At 7:00 the game pauses on a victory modal: **EXTRACT** (end the run as a
  victory) or **OVERTIME** (continue with endless waves every 60 s, using the
  existing endless wave formula and boss rotation, for records). A loss during
  overtime still counts the run as a victory for records.
- Session economy is unchanged (Tier I start, `$500`, field Hangar `[U]`, wave
  rewards, credits never carried to the campaign profile).
- Records add `bestHoldSec` and `parisVictories`.

Wave schedule (draft):

| Time | Wave | Title | Roster |
|---|---|---|---|
| 0:00 | 1 | RECON PROBE | SCOUT, STANDARD, SCOUT, SAPPER |
| 1:00 | 2 | BRIDGEHEAD | STANDARD, ARMOR, SCOUT, ENGINEER, STANDARD |
| 2:00 | 3 | SEINE RAIDERS | HOVER, HOVER, HOWITZER, STANDARD, FLAMETHROWER |
| 3:00 | 4 | BOULEVARD BREACHERS | ARMOR, ARMOR, KAMIKAZE, SAPPER, STRIKER, STANDARD |
| 4:00 | 5 | ELECTRONIC SIEGE | JAMMER, STEALTH, STRIKER, ARMOR, HOWITZER, ENGINEER |
| 5:00 | 6 | GRAND PINCER | ARMOR, HOVER, FLAMETHROWER, STRIKER, KAMIKAZE, STANDARD, SCOUT |
| 6:00 | 7 | FINAL ASSAULT (boss) | BOSS_MAMMOTH + ARMOR, STANDARD, ENGINEER, SAPPER, SCOUT |
| 7:00+ | 8+ | Overtime | existing endless formula |

## 2. Map JSON schema additions (`public/maps/survival/paris-last-stand.json`)

```jsonc
{
  "mapId": "survival-paris-last-stand",
  "gameMode": "survival",
  "gridSize": 40,
  "baseCell": { "row": 18, "col": 18 },        // top-left cell of the HQ footprint
  "baseFootprint": { "cols": 4, "rows": 2 },   // every footprint cell is a BASE cell
  "baseMaxHp": 120,
  "baseModel": "ELYSEE",                        // landmark model used for the HQ
  "baseDefense": "authored",                    // skip the automatic getBaseLayout wall; the map authors its own ring
  "rules": { "gameMode": "survival", "defeatOnBaseLoss": true },
  "landmarks3d": [ { "kind": "EIFFEL_TOWER", "row": 32, "col": 6 } ],
  "mines": [ { "row": 25, "col": 9 } ],         // neutral, permanent, trigger under ANY tank
  "mineSigns": [ { "row": 24, "col": 8, "rotation": 0 } ], // visual only, non-blocking
  "layout": [ "..." ]                           // '=' = BRIDGE tile (see below)
}
```

- **`landmarks3d`**: `row`/`col` is the top-left cell of the footprint. The loader
  turns every *blocked* footprint cell into `TileType.LANDMARK` regardless of the
  layout character there; non-blocked footprint cells keep their layout tile.
- **`TileType.LANDMARK`**: indestructible; blocks movement, shells, missiles and
  line of sight; never targeted as terrain; not breachable by bosses; treated as
  a wall by the navgrid / minimap. Artillery shells still land (they arc over).
- **`TileType.BRIDGE`** (layout char `=`): passable ground for every tank, shells
  fly over it; the continuous water surface is rendered underneath it (it counts
  as water for the water mesh only), and one procedural stone bridge
  (`LandmarkModels.createBridge`) covers each rectangular run of bridge cells. It
  spans across the water: water flanking the run's east / west edges gives a
  north-south crossing, and vice versa.
- **`mines`**: permanent (no lifetime), visible, armed from the start. They detonate
  under the player **and under enemies** (blast damages every tank in radius,
  chain-detonates neighbours). Enemy AI is NOT given map-mine positions (they are
  traps for both sides); sapper mines keep their current behaviour.

## 3. Landmark footprints and model contract

Model space: 1 grid cell = 2.0 world units (metres). +X = east (col increases),
+Z = south (row increases), +Y = up. The model origin is the **centre of its
footprint** at ground level (y = 0). No rotation support: every landmark is
authored in the orientation below.

| kind | footprint (cols × rows) | blocked cells (dr, dc) | notes | max height |
|---|---|---|---|---|
| `ELYSEE` | 4 × 2 | all 8 (all are BASE cells) | Élysée Palace, main façade + cour d'honneur facing **south**; French flag on the roof | 4.5 |
| `ELYSEE_RUINED` | 4 × 2 | — | destroyed variant swapped in when the HQ falls | 3.0 |
| `EIFFEL_TOWER` | 3 × 3 | (0,0) (0,2) (2,0) (2,2) | four legs blocked; tanks drive under the arch through the centre cross | 13 |
| `ARC_DE_TRIOMPHE` | 3 × 2 | (0,0) (1,0) (0,2) (1,2) | two pillars blocked; arch passage along col +1 (N-S) open | 6 |
| `NOTRE_DAME` | 4 × 2 | all 8 | west façade with two towers facing **west**, spire, flying buttresses | 8 |
| `LOUVRE_PYRAMID` | 2 × 2 | all 4 | glass-and-steel pyramid on a plaza with small triangular pools | 4 |
| `SACRE_COEUR` | 3 × 2 | all 6 | white travertine basilica, central dome + small domes, faces **south** | 8 |
| `CONCORDE_OBELISK` | 1 × 1 | (0,0) | Luxor obelisk with gilded tip on a pedestal | 7 |
| `MINE_SIGN` | small prop | — | red/white triangular "DANGER — MINES" sign on a post | 1.4 |

Reference placements (the map may adjust positions, never footprints):
`ELYSEE` (18,18), `ARC_DE_TRIOMPHE` (7,5), `SACRE_COEUR` (2,25),
`CONCORDE_OBELISK` (22,12), `LOUVRE_PYRAMID` (21,27), `NOTRE_DAME` (27,31) on
Île de la Cité, `EIFFEL_TOWER` (32,6). The Seine crosses the map west→east
around rows 26–29 with four bridges.

## 4. Code ownership

- `public/src/game/terrains/landmarks.js` — `LANDMARK_SPECS`, `landmarkBlockedCells(entry)`,
  GLB loading and `createLandmarkMesh(kind)` (models in `public/models/landmarks/`,
  Blender sources in `assets/blender/landmarks/`).
- Gameplay (tiles, HQ HP, mines, timed waves, HUD): engine + `sim/survival.js`.
- Map: `public/maps/survival/paris-last-stand.json` + registration in `levels.js` / map index.
