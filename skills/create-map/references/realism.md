# Realism rules

The goal: a player looking at the map from the game camera recognises *what kind of place this is* (and, for a real place, *which place*), and nothing looks randomly scattered. When a rule conflicts with the gameplay invariants in SKILL.md, gameplay wins. Resolve the conflict in a way that still fits the place: move, compress, or add a plausible element.

## Scale: compress the essence, use game sizes

A 40×40 arena cannot hold a real place at true scale. Keep the place's recognisable elements and their **relative arrangement** (the river is west of the factory, the station faces the square), but size everything in game units:

| Element | Game size |
| --- | --- |
| Main road / avenue | 2 cells wide |
| Street, country road, service lane | 1 cell |
| House, shed | 2×2 to 3×4 cells (`A`) |
| Apartment block, office, factory hall | 3×4 to 4×8 cells (`P`), L-shapes and courtyards allowed |
| Urban block (buildings + yards) | 6–10 cells per side |
| River | 2–5 cells wide; sea or lake may fill a whole edge strip |
| Forest mass | 15+ cells, irregular outline |
| Tree line / hedge row | 1 cell wide |
| Square, plaza, field | 5–12 cells open |

The grid is small, so pick the 3–5 most characteristic elements of the place and give them space. Drop or merge the rest and record what you dropped in `design.reference.simplified`.

## The 11 rules

1. **Function first.** Decide what the place is for (port, factory, village, rail junction, mountain pass, capital district) before drawing. Zones follow from the function: housing near roads and services, industry next to rail or water, fields around villages, forest on the rough ground.
2. **Roads form a network.** A connected hierarchy: main road → streets → lanes. Roads continue off the map edges, because real places connect to the outside. Junctions are T or X shaped. Dead ends exist only as driveways into a yard, depot or farm. Never leave isolated 1–2 cell road stubs, and never put walls, crates, barrels or hedgehogs in the middle of a road unless they form a deliberate war-layer road block.
3. **Buildings face the street.** They stand along roads with a setback and a yard behind. Blocks vary in size and shape (no grid of identical squares). A lone wall segment in an open field is allowed only as a ruin, with rubble and craters around it.
4. **Water behaves like water.**
   - Rivers enter and leave across map edges, and lakes have irregular outlines.
   - A bridge (`=`) sits exactly where a road meets water.
   - Banks are sand, grass or swamp.
   - Straight-edged rectangular water is only a canal, dock or harbour basin, and then it gets a `C` quay edge.
5. **Vegetation grows organically.**
   - Forests are irregular masses with ragged edges.
   - Tree lines follow roads, field boundaries and riverbanks.
   - Parks sit inside urban blocks.
   - Grass (`V`) rims forest edges and verges.
   - Avoid uniform 2×2 tree squares.
6. **Surfaces transition gradually.** Road → verge (ground or sand) → grass → forest, and beach → dunes → scrub. Never a checkerboard of single cells. Each surface area is a patch with a reason to be there.
7. **Objects have context.**
   - Barrels (`D`) stand where fuel or ammunition plausibly is: depots, garages, farms, rail sidings, checkpoints, wrecked convoys, field positions. Oil slick (`L`) may lie under and around barrels and spread from them.
   - Crates (`Q`) stand at loading bays, warehouses, docks and supply points.
   - Hedgehogs (`X`) form lines across roads and gaps.
   - The water tower (`T`) stands at a station, farm, factory or village edge.
8. **The war layer tells a story.** The place has become a front line. Place a defensive belt (hedgehogs, brick barricades, concrete blocks), a damaged district (rubble `U`, craters `K`, broken walls), and approach scars, all concentrated where the fighting would plausibly be. Do not sprinkle craters and rubble uniformly.
9. **Respect the theme palette** (table below). Do not use surfaces or objects that cannot exist in that setting.
10. **No mirrors, no grids.** The map is asymmetric but fair, with each route having a different character. Repeated identical blocks and mirrored halves read as artificial.
11. **Labels are English; real places use real names** (`decoration.landmarks` of kind `label`: district, street, landmark names).

**Dominant landmark:** every map has at least one recognisable landmark visible from the game camera, such as a water tower, a bridge, a large factory hall, a dam, a station square, a harbour crane quay, or a Paris monument (`landmarks3d`) where it belongs. Place it where routes meet or where the player can orient by it.

## Theme palettes

| `environment.theme` | Typical surfaces | Typical objects | Avoid |
| --- | --- | --- | --- |
| `urban` | `.` `R` `^` `V` (parks) | `A` `P` `B` `C` `Q` `D` `L` `U` `K` `X` `T` | sand seas, ice fields |
| `capital` | `R` `^` `.` `V` | large `P` blocks, `C`, squares with labels, `landmarks3d` (Paris) | rural clutter, swamps |
| `industrial` | `.` `R` `^` `L` | `P` halls, `C`, `D`, `Q`, `T`, `U` | forests in the plant area |
| `forest` | `V` `.` `M` `R` (country roads) | `F` masses, `A` villages/farms, `B` fences, `T` | dense city blocks |
| `coast` | `W` `S` `V` `M` `R` `.` | `C` quays, `A`/`P` port buildings, `Q` docks, `D`, `=` | ice |
| `desert` | `S` `^` `.` `R` | `A` flat-roof compounds, `B` mud walls, `C` bunkers, `D`, `L` | forest, swamp, ice |
| `alpine` | `I` `^` `V` `.` `R` | `F` conifer belts, `A` chalets/huts, `C` galleries/dams, `T` | sand, oil fields |

Use `decoration.zones` surfaces (`asphalt`, `pavers`, `concrete`, `dirt`, `gravel`, `sand`, `snow`) to strengthen the setting: snow on alpine ground, pavers on squares, gravel at rail yards, asphalt in depots.

## Self-check before the visual pass

- Can you name each zone's function?
- Does every road lead somewhere, and does the network reach the edges?
- Would a real builder put this building here, facing this way?
- Does the water flow, and do roads cross it on bridges?
- Do forests and tree lines look grown, not stamped?
- Is there one dominant landmark?
- Do barrels, crates and oil have a reason to be where they are?
- Is the battle damage concentrated where the fighting would be?
