# Light Source

One lamp over the canvas. It lights the paint two ways, and both follow the
dot on the pad:

- **The pool** (always, while Light Source is on): paint near the dot is lit,
  paint far from it falls toward Ambient.
- **Relief and gloss** (while Surface Shading is also on): the lamp becomes
  Surface Shading's key light. The rim of a stroke that faces the dot lights
  up, the far rim goes into shadow, and the gloss glints on the slopes facing
  the dot. Relief and Gloss set how much the surface catches.

With Light Source off, Surface Shading keeps its fixed studio lights (warm key,
cool fill), so presets without the lamp look exactly as they did.

Rebuilt 2026-09-14. Before that the lamp was its own dye-resolution pass that
mostly dimmed the frame (0.3 to 0.5x at the defaults), while Surface Shading lit
its relief from lights that never moved, so dragging the dot changed nothing
visible under shading. That pass also fed its dimmed, 1.2-clamped copy to Glow
and to the shading height field, so it weakened the relief it should have lit,
and `x || 0.5` threw the lamp back to the centre whenever the dot touched the
pad's left or top edge.

## Where it lives

| Part | File |
|---|---|
| State, pad, Random mode, persistence (`lightSource.*` settings keys) | `js/13-light-source.js` |
| Lamp uniforms (`lampOn`, `lampPos`, `lampPower`, `lampAmbient`) | `js/05j-update-loop.js`, display section |
| Lighting math (`lampDir`, the key/fill swap in the shading block, the pool) | `js/05a-shader-core.js`, `displayFrag` |

No framebuffer of its own: everything runs inside the display pass.

## The model

- The lamp sits `LAMP_H` (0.55, short side = 1) above the dot. Distances are
  aspect-corrected, so the pool is round on any canvas.
- `L = normalize(dot - pixel, LAMP_H)`. Its `z` is the lamp's light on flat
  paint (Lambert), used for both the pool and the relief weight.
- **Pool:** `color *= Ambient + (1 - Ambient) * lampPower * L.z * LAMP_PEAK * warmTint`,
  then scaled back hue-preservingly wherever it passes full. `lampPower` is
  2 x Intensity, so 1.0 at the default 0.5. It runs after Light Shift, so
  recoloured paint is lit like the rest, and before Glow and Scatter, which are
  light in their own right.
- **Relief:** the studio key is swapped for the lamp, entered mirrored in x/y
  because the relief normal tilts *up* the luminance slope (the historic sign
  that `shadeInvert` flips). Key weight `0.86 * lampPower * L.z` peaks one lamp
  height from the foot at the studio key's strength at Intensity 0.5. The cool
  fill moves to the far side. Under the lamp half of the slope-darkening term
  is given back, otherwise every stroke near the dot gets a dark outline.
- **Gloss:** Blinn-Phong off the lamp. It is kept to a faint sheen on flat
  paint, where a point light mirrors as a wash, and glints in full on slopes.
- **Kaleidoscope:** the lamp stays in screen space, so the pool sits where
  the pad puts the dot. (Looked up through the fold, as the old pass did, a
  Wedge showed only whatever sliver of the lamp its facet sampled, and the dot
  mostly dimmed the mandala.) The folded relief gradient is carried into
  screen space through the fold's Jacobian (`dFdx`/`dFdy` of the folded UV),
  so mirrored faces are lit from the dot too; a mirror seam reads as a faint
  crease. Only while the lamp is on: the studio rig keeps its source-space
  gradient, so kaleido presets without the lamp are unchanged. Glow and
  Scatter still fold with the image.

## Controls

- **Pad:** where the lamp is. Random lets it wander (13-light-source.js).
- **Intensity:** lamp strength: the pool, and the relief and gloss it drives.
- **Ambient:** light the lamp does not supply. At 1 the pool disappears and
  only the relief and gloss show where the lamp is.
- **Scatter** (inside Glow) aims its shafts from the same position, whether or
  not Light Source is on.
