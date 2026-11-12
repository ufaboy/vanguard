# Campaign map integration

This is a navigation guide to the current repository, not a promise that every API remains unchanged. Read implementations before patching them.

| Concern | Inspect |
| --- | --- |
| Mission intent, roster, availability and stable IDs | `public/src/game/campaign.js` |
| Authored map registry and examples | `public/maps/campaign/index.json`, neighboring mission JSON files |
| Native JSON fallback imports, normalization, active SECTORS | `public/src/game/levels.js` |
| Exact finite group accounting and recovery | `public/src/game/encounters.js` |
| Spawn clearance, initial units, live cap, actual victory/defeat | `public/src/game/engine.js` |
| Patrol routing and obstacle handling | `public/src/game/campaign-navigation.js` |
| Campaign buttons, labels, statuses | `public/src/views/campaign.js`, `public/src/main.js`, `public/src/menu.js` |
| Component-defined stats and canonical enemy IDs | `public/src/game/components.js`, `public/src/game/tanks.js` |
| Ground/dressing/FX and batch lifecycle | `urban-ground.js`, `models.js`, `fx.js`, `tile-batcher.js`, `dispose.js` under `public/src/game/` |
| Completion saves and loot settlement | `public/src/sim/hangar.js`, engine victory/abort methods |
| Existing behavioral tests | `tests/` |

Initial cells in authored encounter maps consume the first group's roster; do not add their counts again. `enemyPool` must agree with the ordered flattened encounter roster when the current loader uses both. Fixed spawns have different legacy semantics; inspect their accounting rather than assuming they consume a queue.

The catalog's whole-mission budget includes bosses and escorts. Do not copy the default sector boss into ordinary missions. Conversely, do not route a planned boss map through a no-boss encounter-completion branch: implement and test the specific boss phase and reserved escorts when that mission is requested. Stronghold success may occur before all reserved enemies deploy.

Campaign opening is sequential, while inspection of planned mission briefings is allowed. Keep installed-but-locked distinct from not-yet-built. Saved mission IDs, not mutable array positions, define completion. A direct start/restart action must not bypass progression. Generalize totals, victory messages, and replay targets for the selected map.

Keep old sector files archived unless the user requests removal. Never use them as silent fallback content for a new mission. Update both runtime registry loading and built-in module fallback imports if the current architecture retains both.

Preserve the Vanilla JavaScript/native module/static-server stack and the current build scripts. Read AGENTS.md rather than restoring an old `server.js` workflow from memory. Do not change dependencies, tank models, global balance, or unrelated maps to complete ordinary map authoring.
