# Case animation source geometry

Downloaded from the public Hacktor Watch 2.0 repository at revision
`8234d9b112e0746e14f4d84727739cc576a49137`:

https://github.com/hacktorwatch/Hacktor-Watch-2.0/tree/8234d9b112e0746e14f4d84727739cc576a49137

The repository's GPL 3.0 licence is retained in `LICENSE`. Original STL,
Eagle `.brd` / `.sch`, and reference PNG files are unchanged. Source URLs,
SHA-256 checksums and byte counts for the geometry/board files are embedded
in `models.json` and the runtime data.

## Actual published models

- `main_body.stl`: 11,270 original triangles; one connected shell.
- `bottom_lid.stl`: 4,140 original triangles; one connected back cover.
- `button_pushers.stl`: two disconnected solids, each 326 original triangles.
  They are split into independent `button_left` (negative Y) and `button_right`
  (positive Y) parts without changing their assembled coordinates.

Units are millimetres. All three STLs share assembly coordinates. The display
faces **negative Z**; the back cover extends toward positive Z. A rotation
of 180 degrees around X maps the display to positive Z while preserving
handedness. The circle through the frontmost case ring has centre
`(-1.028865, -1.297916)`, radius `21.35 mm`, at `Z = -2.9 mm`.
The main outer cylinder has radius 23.25 mm; the inner back wall is 22.25 mm.

The main body spans approximately X `[-24.274, 22.221]`, Y `[-28.518, 26.291]`,
Z `[-2.9, 8.657]`. The back cover spans Z `[1, 8.6]`. The two buttons
are on the negative X edge. These bounds and the original source coordinates
are retained in each runtime part.

## Board data and interpretation

`hacktor_watch2.brd` is the authoritative Eagle PCB file. Its Dimension-layer
outline, circular cutout, actual package placements, pad geometry, surface
copper traces, vias and silkscreen data are parsed into `pcb`.

The sampled outer outline contains 191 points and its main arcs have radius
approximately 21.25 mm around `(-0.0898, -1.2431)`. This is intentionally
offset approximately 0.94 mm in X from the case ring centre. Keep board
coordinates in the same source frame; do not recenter it separately.
The board's large circular cutout is centred at `(-11.99171875, -1.181384375)`
with radius `5.1 mm`. There are 96 package placements and 350 SMD pads.

Package `bodyBounds` are bounding boxes of existing library drafting,
silkscreen and courtyard lines, used only as an approximate visual envelope.
They are not a replacement for manufacturer 3D body models. The published
repository does not include LCD, battery or PCB component solid CAD models.
Any scene representation of those bodies, component heights, PCB thickness
or Z stack spacing is an editorial reconstruction and must be documented as
such. The original exploded/disassembled/side renders provide visual guidance.

## Preparation

From the website root:

```sh
python3 tools/prepare-case-models.py
```

NumPy is needed only for this development step. The helper preserves all
source STL triangles and winding, splits the button solids, and computes
normals with a 35-degree smoothing crease while retaining hard edges.
`assets/case-animation/models.js` defines `window.HACKTOR_CASE_MODELS` for
offline / direct-file previews. `models.json` is the matching inspectable data.
