# Yin yang filigree glyph: replaces the atom

This goes at the centre of the knob filigree in the UI design refactor, in place of the atom glyph (three orbits and a nucleus). `reference/atom-to-replace.png` shows the current knob with the atom. `reference/sizes-on-knob.png` shows this glyph on that knob at 40 to 116 px, with a 3x pixel zoom of each size.

## Files

| File | Use |
|---|---|
| `yin-yang-filigree.svg` | **The one to use.** `currentColor`, square `0 0 100 100` viewBox. Each outline carries a 0.7 px non-scaling stroke, so the lines stay about 1 px wide however small it is drawn. |
| `yin-yang-filigree-fill-only.svg` | The same paths with no added stroke. Use it for large sizes (160 px and up), or wherever `vector-effect` isn't supported. |
| `png/yin-yang-filigree-{48,64,104,256}.png` | Raster fallbacks, cream `#EBDFD2` on transparent, each rendered at its own size (don't rescale them). |
| `CREDITS.txt` | Required attribution, ready to paste. |
| `reference/` | The knob being changed, and the size sweep. |

## How to use it

- **Colour:** fill and stroke are both `currentColor`, so set `color` on the container. To match the atom, use cream `#EBDFD2` with a soft glow: `filter: drop-shadow(0 0 1.5px rgba(255, 225, 190, 0.55))`.
- **Size:** it's designed for 64 to 120 px. It holds its shape down to about 48 px (the atom's size on the current knob), but it's busy there. The best size is to fill most of the knob face: about 104 px on a 120 px face. Below 40 px it turns to noise.
- **Placement:** the figure is round and centred in the viewBox with a 1.5% margin, so it sits concentric in a round knob. Centre it on the knob's axis.
- **Line weight:** when inlined, override it with CSS `stroke-width` on the `<svg>`. It is measured in screen px because every path has `vector-effect="non-scaling-stroke"`: 0.5 is lighter, 1.0 is bolder. Through `<img>` or `background-image`, page CSS can't reach in, so edit the attribute in the file instead. Don't thicken the glyph by scaling it with `transform`.
- **Rotation (optional):** if the knob turns with its value, the glyph can turn with it. A yin yang turning as the viscosity changes is on theme.
- **Keep it as is:** don't add back the outer rim, the dots or the middle line. They were removed so the glyph survives small sizes (see below).

## Where it comes from

It's adapted from a vector by **Muhammad Bilal** on Vecteezy (item 80872383; the file is a pair of yin yangs, and this is the left, line-art one). The paths were taken exactly from the EPS, then reduced so they read at UI scale:

- **Removed:** the outer rim and the middle S line (one shape in the original). Along the S, three parallel lines are now two.
- **Removed:** the dots and the two small rings.
- **Kept:** both comma outlines with their swirls, the top-right swirl arc, and the two eye rings. The comma outlines now form the circle themselves, open at the tails.
- **Changed:** refit to a 100-unit viewBox and recoloured to `currentColor`.

## Attribution: required

Credit the artwork in the app's third-party notices or credits. In the Fluid-UI repo that file is `THIRD-PARTY-NOTICES.txt`, and `CREDITS.txt` has a section ready to paste in as section 7.

**License, not yet confirmed:** Vecteezy's Free license allows commercial use but asks for credit to **Vecteezy** with a link, not only to the artist. A Pro download drops that requirement. Check which license the file was downloaded under before shipping. Do not redistribute the original EPS; only this derived glyph ships.
