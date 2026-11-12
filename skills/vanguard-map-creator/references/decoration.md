# Terrain decoration contract

`decoration` is an optional, validated top-level JSON object. `public/src/game/decoration.js` normalizes it and generates deterministic detail placements; `urban-ground.js` bakes the result into the existing ground texture at sector load. It does not change terrain physics, collision, navigation, enemy routes, or combat stats.

```json
{
  "decoration": {
    "version": 1,
    "seed": 100003,
    "theme": "urban",
    "zones": [{"id":"court","bounds":[8,5,14,12],"surface":"pavers","density":0.35,"details":["cracks","leaves"]}],
    "paths": [{"id":"service-road","points":[[10,5],[10,20]],"width":3,"surface":"asphalt","marking":"dashed"}],
    "landmarks": [{"id":"crossing","kind":"crosswalk","row":10,"col":15,"size":3,"rotation":90}],
    "exclusions": [{"id":"clear-turn","bounds":[9,18,11,20]}]
  }
}
```

## Contract

- Required: `version: 1`, unsigned 32-bit integer `seed`, and `theme` (`urban`, `forest`, `desert`, `coast`, `alpine`, `industrial`, `capital`). Theme selects base and accent colors, not gameplay rules.
- Each optional collection has at most 64 entries. IDs are unique across collections, 1–64 lowercase letters/digits/hyphens; `automatic-` is reserved. Unknown fields and unsupported kinds fail normalization.
- Coordinates use map row/column order from the top-left. `[row,col]` points denote cell centers. Bounds are inclusive integer `[row0,col0,row1,col1]`. Width and size are in cells; rotation is in degrees.
- Zones: `surface`, `bounds`, optional `density` (0–1, default 0.3), optional `details` (default `["cracks"]`; `[]` disables details). Surfaces: `asphalt`, `pavers`, `concrete`, `dirt`, `gravel`, `sand`, `snow`. These are flat visual treatments: snow is not slippery ice, and painted concrete is not a wall.
- Details: `cracks`, `patches`, `oil`, `leaves`, `rubble`, `tracks`, `weeds`. Vegetation and rubble favor wall edges; tracks follow nearby path direction. Stable zone sub-seeds avoid reshuffling when landmarks change.
- Paths: 2–64 points, width greater than zero and at most 8, a surface, and optional `marking` (`none`, `dashed`, `edges`). Paths paint ribbons; they never clear obstacles or define AI routes.
- Landmarks: `kind` (`crosswalk`, `parking`, `manhole`, `loading`, `label`), `row`, `col`, optional `size` (0–8 exclusive of zero; default 1), optional `rotation` (-360–360). Labels require `text` of 1–40 printable ASCII characters. Keep all visible labels in English. Labels use a camera-readable fixed proportional font; `size` controls area markings, not label length.
- Exclusions: `bounds`. Player spawn and enemy entrances automatically reserve a one-cell radius; HQ reserves two cells. Add authored exclusions for important sightlines and transitions. Exclusions suppress surface overlays as well as small details.

## Rendering and lifetime

Order: theme base, authored zones, paths and lane paint, seeded details, landmarks. Later zones/paths can paint over earlier ones. Complete strokes and rotated landmarks are clipped to permitted cells. Surface treatments can continue underneath destructible brick; small details only occupy empty cells. Forest, water, ice, concrete obstacles, HQ and spawner cells retain their distinct terrain rendering.

At most 256 details are generated per zone and 2,048 overall. Low quality uses a deterministic subset and a 512px texture instead of 1024px; both respect the renderer maximum texture size. The engine disposes the previous texture on sector replacement and the current texture on shutdown. The old generic grime overlay is hidden for decoration maps. There are no additional meshes, shadow casters, or per-frame decoration updates. Existing pooled combat FX remain independent.

Legacy `environment.roads` and `environment.districts` are adapted only if `decoration` is absent. Explicit decoration takes precedence even with empty collections. New maps should use only the new object for this information. Missions 1 and 2 are migrated; existing missions 3 and 4 also use the renderer.

This version supports flat surfaces and static details. It does not implement decorative 3D props, new hazards, or new battle-trace systems. Large objects that resemble cover need real collision/destruction support.


## Four rendering layers

1. **Surface treatment:** asphalt, pavers, dirt, sand, snow, or worn industrial flooring. Use authored zones and paths to express the place's purpose. Blend edges where appropriate while preserving terrain-rule boundaries.
2. **Static details:** cracks, patched asphalt, lane paint, manholes, leaves, oil stains, tire wear, small flat rubble. Bake/composite at map load or cache in appropriately sized chunks. Do not allocate one mesh per crack or repaint the full ground every frame.
3. **Small 3D dressing:** sparse grass, low rubble, fragments, and ground-edge detail. Reuse geometry/materials and existing batching where it fits. Do not obstruct turning space or resemble non-existent cover. Larger objects need actual collision/destruction integration.
4. **Battle traces:** scorch, tread marks, fresh rubble, and impacts. Trigger on events, pool/cap objects, and define lifetime or replacement. Reconcile traces with destroyed/moved geometry. Reuse the current FX system when suitable.

Choose texture size/chunking from the actual camera and renderer limits, not an arbitrary maximal resolution. Account for transparent overdraw, z-fighting, object lifetime, texture disposal on replay, and unnecessary shadow casters. Static ground detail should remain in software WebGL; reduce optional 3D clutter, particles, and dynamic trace counts first. Never add backdrop-filter over WebGL.

## Placement rules that create a believable place

- Put dirt at verges, entrances, and damaged walls; concentrate debris near its plausible source.
- Align wheel wear with passage direction and turning areas. Avoid tracks running through intact buildings.
- Place vegetation in cracks, edges, and neglected corners. Keep active routes calmer than their surroundings.
- Mix clusters and untouched areas instead of uniform random noise. Use stable sub-seeds per zone/layer so changing one landmark does not reshuffle the whole map.
- Reserve distinctive high-contrast marks for landmarks and gameplay feedback. Test at normal play zoom, not only close-up.
- A decorative road through a destructible barrier may be intentional pre-destruction road continuity; do not auto-delete it merely because a wall currently crosses it. Do clip irrelevant clutter from solid obstacles and exclusion zones.

## Theme examples

| Theme | Surface and texture choices | Optional sparse volume |
| --- | --- | --- |
| City | Paver courts, asphalt patches, crosswalks, manholes, faded parking lines | Brick fragments and grass along neglected edges |
| Forest | Leaf litter, root-colored patches, trail wear, damp-looking soil | Twigs and low vegetation outside clear combat lanes |
| Desert | Wind-streaked sand, exposed hardpan, stone dust, old tracks | Sparse pebbles and dry scrub |
| Coast | Salt stains, wet-looking paving, quay stripes, deposited debris | Reeds near water and small shore stones |
| Highlands | Broken snow cover, compacted tracks, visible ice transitions | Rock fragments and sparse dead vegetation |
| Industry | Loading bays, oil staining, service arrows, worn metal-floor motifs | Small scrap and shallow rubble clusters |
| Capital | Large civic paving, fractured markings, urban war damage | Rubble with clear playable silhouettes |

Begin by giving each combat area one recognizable treatment and one or two detail families. Add further variety only when it remains readable from the normal camera. Do not implement weather, slippery mud, height changes, moving trains, or damage hazards as supposedly cosmetic additions.
