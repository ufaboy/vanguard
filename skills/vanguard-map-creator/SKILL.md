---
name: vanguard-map-creator
description: Create, redesign, and connect IRON VANGUARD campaign maps with distinct tactical layouts, finite enemy encounters, and theme-aware terrain decoration. Use for new numbered missions, improving existing battlefields, or adding map-specific visual dressing in the Vanguard repository.
---

# Vanguard Map Creator

Create a playable, visually legible battlefield that presents meaningful choices and fits the campaign. Work in the selected Vanguard checkout; do not assume a fixed filesystem path. Follow its current AGENTS.md. Preserve the user's requested mission, theme, and scope; a decoration-only request does not authorize rewriting encounters or progression.

## Inspect the current contract

Read the requested mission in `public/src/game/campaign.js`, `docs/CAMPAIGN_PLAN.md`, and the applicable guidance in `docs/CAMPAIGN_GAMEPLAY_GUIDELINES.md`. Inspect a neighboring implemented map, `public/src/game/levels.js`, and the relevant loading/spawning/rendering code before editing. Treat documentation as intent and the current code as the runtime contract. The user may tune constants and code directly; documentation and balance snapshots can lag behind. Verify current values before editing, preserve unrelated tuning, and report discrepancies rather than changing gameplay to match stale documentation or tests.

Read [decoration.md](references/decoration.md) when creating or dressing terrain. It documents the implemented v1 schema and distinguishes flat decoration from future 3D dressing. Never add unsupported JSON keys and claim that they render. Read [integration.md](references/integration.md) when making a map playable or changing encounter/progression behavior.

## Design the battlefield before filling cells

Write a compact working brief: tactical question, intended loadout, objective, theme, primary routes, retreat options, encounter rhythm, and visual landmarks. For a numbered mission, derive roster counts and progression from the existing plan rather than inventing replacements.

Give adjacent missions different decisions, engagement ranges, or movement patterns. Start with the places where players fight and the connections between them. Avoid default mirrored street grids, repeated rectangular blocks, or adding obstacle density merely to hide an empty layout. Symmetry can be intentional when requested; asymmetry alone does not make a map enjoyable.

Do not surround the map with a default `CONCRETE` (`C`) perimeter box on `row 0`, `row 35`, `col 0`, `col 35`. The engine already enforces the 36×36 arena boundary for tank collision, pathfinding, and projectiles, so a continuous concrete frame is unnecessary and visually artificial—especially on forest, desert, coastal, and alpine maps. Leave map edges open (`.`, `F`, `W`, `I`) or place only localized buildings, rock outcrops, or shoreline segments along the edge where they serve the layout. Where an urban or fortress edge does use a wall segment, keep it to a single tile layer rather than strips two or more cells deep. Most importantly, the enemy-entry edge (the perimeter opposite the player's base) must never be sealed: ensure that the far boundary has multiple unblocked entry breaches and continuous drivable avenues leading into the interior so tanks can freely roll onto the map.

Provide distinct route tradeoffs: exposed direct access, covered detour, or a destructible shortcut with an ammunition/time cost. Verify each claimed shortcut actually shortens or improves a route. Use terrain and cover to produce readable changes in range and movement, not just different colors.

### Destructible Chokepoints and Breaching Barriers
Some maps can feature tactical barriers that completely block direct overland movement for standard tanks, requiring either the player or advancing enemy tanks to blast and breach walls to open a passage.
- A blocking barrier does not have to be a uniform solid partition: it can be formed from mixed combinations of water channels (`WATER` / `W`), brick structures (`BRICK` / `B`), and reinforced concrete barriers (`CONCRETE` / `C`).
- **No Unbreakable Water Dividers (CRITICAL)**: Always verify that there is **never a continuous, unbroken line of `WATER` (`W`)** spanning across the map between the player's base / spawn area and the enemy side. Standard tanks (Tier 1–3 chassis `CH1`–`CH3` and non-amphibious enemies) cannot cross water, and water cannot be demolished or breached by cannon fire. Any full-width divide across the arena must include destructible breach points (`BRICK` or `CONCRETE`) or dry fords/bridges so both player tanks and enemy breaching AI can blast a path through.

### Enemy Command Base Placement in Assault Missions (`stronghold_assault` / `E`)
On maps where the player's primary mission objective is to destroy the enemy Command Base (e.g., `gameMode: "stronghold_assault"` with an `ENEMY_BASE` / `E` tile):
- **Position the enemy Command Base deep near the far side of the map** (close to the northern perimeter / enemy deployment zone, e.g. `rows 2–7`), and **never in the middle of the map** (e.g. `rows 14–20`).
- Placing the enemy base deep within enemy territory establishes a genuine tactical offensive: the player must fight through enemy waves, defensive perimeter lines, and fortified chokepoints across the battlefield to reach and eliminate the enemy command post.
- **Fortify the enemy Command Base with reinforced CONCRETE (`C`) and Perimeter Defense Turrets**:
  The enemy Command Base (`E`) in citadel assault missions MUST be fortified with reinforced `CONCRETE` (`C`) blocks and authentic perimeter defense turrets (100 HP durability each). The 4 corner bastions are always equipped with CANNON (direct fire) and HOWITZER (high-arc mortar barrage), while complex maps add 2 flanking HYDRA_MLRS rocket batteries. In the map JSON, set `"fortifyPerimeter": true` inside `enemyBase`.

Enemy tanks do not appear magically inside the arena on spawn pads: they drive onto the battlefield from outside the map along the far edge opposite the player's deployment side (typically the northern perimeter). Design the entry edge and deployment zone around this off-map drive-in mechanic:
- The far edge (e.g. `row 0` for northern entries) must provide sufficient unblocked, passable entry tiles (`.`, `F`, `I`) serving as ingress points. Never wall off or obstruct these entry lanes with continuous `CONCRETE` (`C`) or impassable obstacles.
- Every entrance along the perimeter must connect directly to open, drivable corridors and thoroughfares that extend forward through the first third of the map (`rows 0–11` for a northern entry), allowing incoming waves to cleanly advance onto the battlefield without jamming, bottlenecking, or stalling at the border.
- All enemy entrance coordinates, initial deployment cells, reinforcement ingress points, bosses, and summoned escorts must be located within this enemy-entry strip (the first third of the map measured inward from the far edge, `rows 0–11`).
- Do not place enemy spawn or ingress points at the flanks or rear near the player's base. Enemies must enter from outside the far edge and advance inward toward the player; patrol routes and subsequent combat maneuvers then guide them deeper into the map. Check actual runtime placement and clearance so entry points never get trapped or blocked by static terrain.

Lay out the opening so the player can understand the first problem before encountering overlapping threats. Design recovery and a decisive finish. Use the mission's finite 20–32 tank budget, including initial units, later groups, bosses, and reserved summons. Live caps are ceilings, not a requirement to keep maximum pressure. Do not change core component stats to make a map harder.

### BOX Supply Placement

Place the majority of `BOX` supply crates outside the allied HQ safe zone. Judge safety by the HQ repair/support area, protective fortifications, and covered approaches, rather than distance alone. Collecting most supplies must require leaving the protected base position.

- Distribute crates along side routes, near contested passages, and in guarded pockets. Avoid concentrating supplies beside HQ or along a single camping position; offer meaningful choices between supply detours and advancing toward the objective.
- Make the reward justify the extra travel, exposure, or fight. Account for the current BOX drop chance and shared power-up pool when judging expected rewards; never assign or promise a specific bonus in a particular BOX. Read the current chance from `public/src/game/terrains/boxes-loot.js`.
- Give each supply pocket a readable approach and a viable way back into the fight. Verify that the intended player loadout can reach and collect the contents; do not hide useful supplies behind accidental impassable terrain or require an empty-map cleanup tour to obtain them.
- Guard pockets through enemy routes and firing positions that respect the enemy-entry rules above, not through extra spawns near HQ. A limited recovery crate near HQ is compatible with this rule, but must not make staying at the base the best way to obtain most supplies.

When reviewing the map, identify its HQ safe zone, count crates inside and outside it, and explain the route choice and risk/reward purpose of the main supply pockets. Check pickup access after each crate is opened. Tanks award credits; BOX caches release Power-Ups after being shot open. Released bonuses stay at the cache location until collected by the tank or the mission ends. Author supply rewards as BOX caches, not loose pickups; legacy map `powerups` entries supply cache positions only: their type does not determine the reward. Each fully opened BOX rolls the configured drop chance, then consumes an entry from the match's shuffled pool on success. Exhausted pools reshuffle without adjacent repeats; empty rolls do not consume entries. BASE_RESTORE is excluded while HQ is alive and takes emergency priority when HQ is destroyed unless a reconstruction kit is already pending. This priority can override the ordinary bag cycle.

## Author gameplay and decoration together

Keep collision and surface rules in the existing gameplay map representation. Author a few purposeful surface zones, paths, and landmarks; derive small details with a stable seed and placement rules. A road is visual author intent, not a second collision map or an enemy route. Empty space alone cannot distinguish asphalt, a courtyard, or a parking lot.

Use four visual layers: surface treatment, static texture details, sparse small 3D dressing, and event-driven battle traces. Prefer the first two for the initial pass. Make damage, vegetation, stains, and debris spatially plausible. Leave firing lanes, mines, terrain boundaries, targets, and pickup silhouettes legible from the gameplay camera.

Anything that convincingly looks like substantial cover must have matching gameplay behavior. Decorative grass or flat rubble may be non-colliding; a large concrete barrier, tree trunk, or wreck must not secretly be pass-through cover. Building or rebuilding tank models still requires the clarification required by AGENTS.md; ordinary terrain work does not authorize that task.

If the requested appearance needs missing renderer support, implement the smallest reusable supported addition within the requested scope, wire normalization and rendering, and test it. Otherwise record the unsupported idea as a proposal. Do not silently replace all existing maps or embark on an unrelated decoration-engine rewrite.

## Verify and iterate

Use the read-only helper for initial geometry and encounter checks:

```text
node <skill-directory>/scripts/inspect-map.mjs <project-root> <map-json-path>
```

Paths may be absolute; a relative map path is resolved from the project root. The helper checks the current 36×36 string layout and finite authored encounter format. Its output is evidence, not certification: it cannot prove tank-physics clearance, runtime support for decoration, fair combat, or fun. For new schemas, extend meaningful project tests rather than weakening failures blindly.

Check graph connectivity, real tank turning clearance, spawn occupancy/exclusion, roster accounting, failed-spawn retries, live limits, patrol destinations, objective rules, and appropriate boss reserves. For new playable missions, test UI selection, locked/available/completed states, stable mission IDs, saved unlocks, replay/restart/abort, rewards, and generic mission labels. Avoid legacy map fallbacks or hardcoded previous-mission totals.

Inspect decoration through the actual game camera when browser/computer tools are available: confirm alignment with geometry, landmark readability, clean threat silhouettes, and acceptable hardware/software WebGL performance. Do not bypass tool restrictions. If live inspection is unavailable, continue static/simulation checks and explicitly state that a visual or combat playtest did not happen.

Run relevant existing/new tests, then `npm run build` and `npm run lint` after application code changes. Review playable geometry before spending time on fine decoration. Iterate on observed issues; do not claim a map is engaging because graph tests pass.

Deliver the concrete map or changes, how to reach it, roster and main tactical differences, validations performed, and remaining playtest limits. Update the matching mission brief/documentation to describe what actually exists. Do not create unrelated missions or publish externally unless requested.
