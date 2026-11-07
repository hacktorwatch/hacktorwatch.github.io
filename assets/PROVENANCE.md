# Hacktor Watch website assets

Prepared for the project website on 4 November 2026. Original workspace assets are preserved. The asset preparation tool performs format conversion, proportional resizing, and exact transparent-padding cropping only. It does not retouch photographs, reconstruct hardware, recolor straps, or generate new imagery.

`provenance.json` records every website image's source path, source checksum, original dimensions, crop bounds, output dimensions, encoding quality, transparency, byte size, and output checksum. It also records the origin and intended scope of the logo files. Rebuild the images with `python3 tools/prepare-assets.py` from the website folder; Pillow with WebP support is required.

## Website imagery

| Website file | Existing source | Origin and intended use |
| --- | --- | --- |
| `hero-watch.webp` | `assets/edited/hero-gemini-mon28may-1957.png` | Dan-supplied generated Gemini hero, subsequently given transparent background and dial lettering edits with ImageGen. Styled editorial product illustration. |
| `hero-watch-640.webp` | Same supplied/generated hero | Smaller responsive source with the same editorial scope. |
| `hero-clock/dial.js` | `hero-watch.webp` | Native Canvas rectification retains the supplied glass, numerals, 1957 steps and 49% battery. The baked hands/date are reconstructed for a live local clock; measured perspective maps the dial back into the unchanged hero. See `docs/hero-clock.md`. |
| `pcb.webp` | `assets/edited/pcb-cutout.png` | Retouched background cutout of Dan's real PCB photograph, originally `assets/raw pictures/20261103_150906.jpg`. |
| `pcb-hand.webp` | `assets/edited/pcb-in-hand-cutout.png` | Retouched real PCB-in-hand photograph, originally `assets/raw pictures/20261103_151011.jpg`. Illustrates physical scale. |
| `wrist-hello.webp` | `assets/edited/bringup-wrist-natural-bright-hello-v16.png` | Approved V16 natural wrist retouch of the embedded V14 bring-up photograph. The original scene is real; visible hair and skin shading were retained while Hello lettering was brightened. |
| `watch-animation/wrist-clean.webp` | The supplied `wrist-hello.webp` | Built-in ImageGen removed the Hello lettering to create a dark glass clean plate for the animation. The watch, wrist, strap and background remain photographic. See `docs/watch-animation.md` for the exact edit prompt. |
| `watch-animation/poster.webp` | Clean plate plus supplied firmware artwork | Initial analog frame of the photographic display composite. The live canvas uses the same 240 × 240 firmware dial, hand sprites, glyph atlases and digital digits from `watch-demo/assets/`. The large 9 was subsequently corrected using the actual Roboto Thin outline; other time digits remain unchanged. Analog markers recolor the exact original white marker pixels. This is a demonstration composite, not a live hardware recording. |
| `exploded.webp` | `assets/github/exploded_view.png` | Mechanical CAD render from the public Hacktor Watch 2.0 repository. It is one composite image, not separate movable layers. |
| `case-animation/poster.webp`, `case-animation/case-demo.mp4`, `case-animation/case-demo.webm` | Repository STL case models and Eagle PCB data at revision `8234d9b112e0746e14f4d84727739cc576a49137` | Locally rendered 3D assembly with the shared running analog face, face-up rotation and exploded layers. Actual enclosure triangles are preserved. LCD/battery bodies and component heights are visual reconstructions; exact sources and reproduction steps are in `docs/case-animation.md`. |
| `watch-blue.webp` | `assets/edited/watch-flat-light-blue-strap-v14.png` | Editorial soft-blue strap treatment of a presentation image. It does not establish a shipping color or purchasable SKU. |
| `watch-red.webp` | `assets/edited/hero-watch-red-strap-v13.png` | Editorial red strap treatment of a presentation image. It does not establish a shipping color or purchasable SKU. |
| `lab.webp` | `assets/edited/power-measurement.png` | Retouched real photograph of the watch and Power Profiler setup, originally `assets/raw pictures/20261103_153043.jpg`. The inactive watch display remains inactive; the green light is profiler status. No measurement or performance result is inferred. |
| `watches.webp` | `assets/github/20250808_133324.jpg` | Real project photograph from the repository showing several devices and straps. This is project history/community imagery, not current assembled-watch stock. |

The repository images are documented against [Hacktor Watch 2.0, revision 8234d9b112e0746e14f4d84727739cc576a49137](https://github.com/hacktorwatch/Hacktor-Watch-2.0/tree/8234d9b112e0746e14f4d84727739cc576a49137). Exact file URLs are in the JSON manifest. The upstream `assets/edited/README.md` and adjacent prompt records describe earlier ImageGen treatments and their raw-source mapping.

The total of the ten WebP image files is **1,438,726 bytes** (about 1.44 MB / 1.37 MiB), including the responsive hero alternative. All inputs with transparency retain an alpha channel. The original photographs and generated/edited PNGs were not changed.

## Offer scope and editorial boundaries

The initial website offer concerns **developer kits and/or PCBs, with an interest registration and no payment**. A polished watch hero communicates what can be built on the platform. It does not imply that an assembled watch is for sale. The blue/red editorial assets should not become a purchase-color configurator or availability claim.

The website should use current schematics and revision-specific documentation for exact specifications. Retouched component lettering, an image of an instrument, and a styled display are not independent proof of a hardware specification or a performance result.

## Logos

- `logos/arduino.svg`: unchanged official teal logo from [Arduino's brand assets](https://content.arduino.cc/brand/arduino-color.svg), readable on a light background. Used to explain the supported software path.
- `logos/zephyr.svg`: unchanged official colored/positive artwork from the [Zephyr branding page](https://zephyrproject.org/branding/), with its original dark wordmark and colored kite. Used to explain the supported software path.
- `logos/nuttx.png`: official Apache NuttX PNG from [the NuttX documentation logo directory](https://raw.githubusercontent.com/apache/nuttx/master/Documentation/logos/NuttX_Logo.png). Only transparent canvas padding was cropped; original colors and geometry are retained.
- `logos/hacktor-mark.png` and `logos/hacktor-wordmark.png`: project artwork extracted from the supplied presentations, reduced proportionally without recoloring or redesign.

Source URLs and checksums are in `provenance.json`. Software logos are explanatory references, not sponsorship or endorsement marks.

## Self-hosted font

`fonts/manrope-latin-variable.woff2` and `fonts/manrope-latin-ext-variable.woff2` are original official Google Fonts WOFF2 deliveries for **Manrope**, normal style, variable weights **200–800**. The two files total **39,648 bytes**. Use both subsets so Romanian names retain the correct diacritics; exact Unicode ranges are recorded in `fonts/provenance.json`.

The original SIL Open Font License 1.1 is included as `fonts/OFL-Manrope.txt`. Official source URLs and file checksums are recorded in `fonts/provenance.json`. These files are self-hosted; the final website does not need a runtime request to Google Fonts.

## Website artwork

`favicon.svg` is original SVG interface artwork. `social-card.jpg` is a sharing-card layout combining the supplied styled yellow hero with the website headline. `hardware-diagram.svg` is the complete unchanged public Google Drawing export linked from the project README; its original bus labels remain revision-specific. The corresponding hashes and source link are in `provenance.json`.
