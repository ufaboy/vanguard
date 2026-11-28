# Building footprint templates

Approved footprint templates for modular buildings (`A` = 1-story, `P` = 2-story).

- `#` = building cell (`A` or `P`)
- `.` = open cell (street, yard, or courtyard)
- Any template may be rotated (`90°` / `180°` / `270°`) or mirrored to fit the street orientation.
- **Courtyard layering**: set the courtyard surface in `surfaceLayout` (`V` grass or `.` ground) and optionally place an object on top in `objectLayout` (`F` tree, `Q` crate, or `.` empty).

---

## Group 1 — Simple and shaped buildings (no courtyard)

Used for residential houses, sheds, apartments, and offices (`A` or `P`).

### A. Rectangles (`2×2` to `2×5`)

```text
##     ###     ####     #####
##     ###     ####     #####
```

### B. L-shapes

```text
###     ####     ####     ####
#..     #...     ##..     ##..
#..     #...     ##..     ##..
                          ##..
```

### C. Semi-thick L-shape

```text
###
###
#..
#..
```

### D. T-shapes

```text
###     ####     ####     #####
.#.     .#..     .##.     ..#..
.#.     .#..     .##.     ..#..
```

### E. H-shapes / bowtie

```text
#..#     #...#     ##.##
####     #####     .###.
#..#     #...#     ##.##
```

### F. Crosses (`+`)

```text
.#.     .##.
###     ####
.#.     .##.
```

---

## Group 2 — Courtyard buildings (`A` or `P`)

Courtyard cells `.` use `V` (grass) or `.` (ground) in `surfaceLayout`, and may hold `F` (tree), `Q` (crate), or `.` (empty) in `objectLayout`.

### H. U-shapes (open courtyard facing the street)

```text
H1 (3×3)   H2 (4×3)   H3 (4×4)   H4 (5×4)    H5 (6×4)
###        ####       ####       #####       ######
#.#        #..#       ####       #...#       ##..##
#.#        #..#       #..#       #...#       ##..##
                      #..#       #...#       ##..##
```

### I. C-shapes (semi-enclosed courtyard with a 1–2 cell gate)

```text
I1 (5×4, 1-cell gate)     I2 (6×5, 2-cell gate)
#####                     ######
#...#                     #....#
#...#                     #....#
##.##                     #....#
                          ##..##
```

### J. O-shapes (enclosed decorative courtyard ring)

```text
J1 (3×3, 1×1 yard)   J2 (4×4, 2×2 yard)   J3 (5×4, 3×2 yard)
###                  ####                 #####
#.#                  #..#                 #...#
###                  #..#                 #...#
                     ####                 #####
```

---

## Group 3 — Industrial halls and warehouses (`P` only)

The **only** building category allowed to have solid enclosed interior (`core`) cells.

### K. Halls, depots, and loading bays

```text
K1 (3×4 / 3×5)         K2 (4×5 / 4×6)           K3 (hall with loading bay)
####     #####         #####     ######         ######
####     #####         #####     ######         ######
####     #####         #####     ######         ######
                       #####     ######         ###...
                                                ###...
```

In `K3`, the recessed `.` loading bay may hold `Q` (crates) or `D` (fuel barrels) on `.` (ground).
