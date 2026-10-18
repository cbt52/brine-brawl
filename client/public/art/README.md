# Brine Brawl — art spec

Every fighter is one SVG sprite, generated from a single model by `scripts/art-gen.mjs` (models in
`scripts/art-models.mjs`). No raster files, no external downloads (see `ASSETS.md`).

## Look (binding for every fighter, T09 onwards)

Gameplay stays 2D top-down, but **each fighter must read like a 3D model rendered into the scene**:

- **Three-quarter view facing right**, with 8–12 % perspective foreshortening: far-side limbs are drawn
  0.92× and tucked behind the body, the near arm is 1.0× and overlaps the torso.
- **Volume shading in at least 3 zones** per part: base tone, **ambient occlusion** along the bottom/right
  edge, **rim light** along the top-left edge, plus **one specular dot** on the biggest rounded form.
  `art-gen.mjs` emits exactly that (base fill → dark shape nudged +y → white shape nudged −x/−y, both clipped
  to the part), so the whole roster shares one light direction without hand work.
- **One light direction for the whole roster: top-left, front.** Never mirror a sprite's lighting; the rig
  flips the whole sprite with `flipX`, which keeps the light on the same side *of the character*.
- **No flat, single-tone fills** except for the faction accent and tiny details (eyes, pips, coin dots).
- **5–6 colours + AO + rim per fighter**, derived from the faction colour (§2.6 in `TASKS-LOOP.md`).
- **A soft elliptical contact shadow** under every fighter (the rig draws it; sprites must not bake one in,
  but they must look like they stand on the ground line at y ≈ 112).
- **Silhouette readable at 48 px**: head/body ratio, limb thickness and prop scale matched to the reference
  archetype, with the prop pushed out beyond the body outline so it survives the downscale.
- **Prop and headwear come first**: at 48 px the silhouette is read from head shape + prop, not from the face.

`client/public/art/LIKENESS.md` records, per fighter, which three visual cues of the source archetype were
matched and what had to change to stay legal.

## Pipeline

```
scripts/art-models.mjs   one model per fighter (palette, proportions, face, features)
        │
        ├── scripts/art-gen.mjs ──► client/public/art/<id>.svg (+ -hurt)  runtime sprites
        │                       └─► client/public/art/ref/<id>.parts.json  the same parts as 2.5D geometry
        │
        └── scripts/blockout.mjs ─► client/public/art/ref/<id>-{front,side,q34}.png  lit 3D blockouts (three)
```

- Sprites and blockouts come from **one part list**, so they cannot drift apart. Change the model, rerun both:
  `npm run art` (`node scripts/art-gen.mjs && node scripts/blockout.mjs`).
- `blockout.mjs` renders with `three` (local devDependency, no CDN) in Playwright's Chromium — Node has no
  WebGL context. It is deterministic: fixed camera, fixed light rig, no random values.
- `ref/` PNGs are **lighting and shape guides only**; the game never loads them (`/gallery.html?look=3d`
  shows them next to the sprites).
- `tests/unit/art.test.ts` enforces canvas, outline colour, palette size, the hurt-face pair and the presence
  of a blockout reference for every fighter, so a missing or off-spec asset fails `npm run check`.

## Canvas

- `viewBox="0 0 128 128"`, `width`/`height` 128. No CSS, no filters, no gradients, no `<image>`
  (the rig tints, flips and scales sprites, so anything fancy breaks). The only container allowed is
  `<clipPath>`, which is how the AO/rim shading stays inside a part.
- **Facing right.** The character looks to +x; the rig mirrors it with `flipX` when the aim is to the left.
- Centred horizontally (body around x = 64) and the **feet/ground line sits at y ≈ 112** (max 118),
  so the sprite can be anchored by its feet on the player position.
- Silhouette first: it must read at 48 px. Big head, clear ears/horns/hats, limbs visible against the body.

## Style

- 5–8 flat colours plus the outline. Examples: Voltbun `#FFF3D6` body, `#E4D3B0` shade,
  `#2EC4B6` ears, `#FFC93C` tail, `#FF9FB0` nose. AO and rim are not palette colours: they are the part
  shape reused with `#1b1b2f` / `#FFFFFF` at low opacity (see §Look).
- Outline everything with `#1b1b2f`, `stroke-width` **5** (4 for tiny details). `stroke-linejoin="round"`,
  `stroke-linecap="round"`.
- Faces: big expressive eyes (white sclera radius ≥ 7 at 128 px, dark pupil), one clear mouth. No outlines on
  pupils. Eyes sit above the vertical centre of the head.
- Faction colour is the accent (trim, scarf, badge, ribbon):
  Critterkin `#FFC93C` · Elemental Weavers `#2EC4B6` · Saltwind Crew `#E63946` · Bubblebottom Folk `#FF7AA2`.
- Element cue per fighter: volt = zigzags, water = waves/ribbons, fire = flames, earth = facets,
  leaf = leaves, air = swirls, neutral = plain.

## Files per fighter

| File | Content |
|---|---|
| `<id>.svg` | neutral pose, the one the rig idles/runs/attacks with |
| `<id>-hurt.svg` | **same body, same colours** — only the face changes: squeezed `><` eyes and an open mouth |
| `ref/<id>.parts.json` | the model's parts as 2.5D geometry (input for `scripts/blockout.mjs`) |
| `ref/<id>-{front,side,q34}.png` | lit 3D blockouts, 128 px, transparent, one light rig |

`<id>` is the fighter id in `shared/fighters/index.ts` (`default`, `voltbun`, `mira`, …).
Add the fighter to **both** `scripts/art-models.mjs` and `client/src/art/manifest.ts`, then rerun
`node scripts/art-gen.mjs && node scripts/blockout.mjs`. `tests/unit/art.test.ts` enforces canvas, outline
colour, palette size, the pair of files, the face difference and the blockout reference, so a missing or
off-spec asset fails `npm run check`.

## 3D sprites (CP9 onwards, binding spec: §2.11 in `TASKS-LOOP.md`)

Fighters move from SVG to sprites rendered in Blender. The SVGs stay as the `?art=svg` fallback.

```
scripts/blender/specs/<id>.json   parts (primitives) + palette + face + anim style
        │  npm run art:3d -- <id> [--still] [--contact]
        ▼
scripts/art3d.mjs ──► blender -b --factory-startup --python scripts/blender/render_fighter.py
        │                 lib/cam.py    ortho camera 35° down from screen-south, sun from above-front
        │                 lib/build.py  prims → part meshes (voxel remesh + subdiv) + inverted hull
        │                 lib/features.py  spec features (earsLong, tailBattery) → extra parts
        │                 lib/face.py   eye/brow/mouth decals wrapped onto the head; `normal` + `hurt` sets
        │                 lib/toon.py   Shader-to-RGB → constant ramp: shadow | base | highlight, rim 35 %
        ▼
.loop/tmp/art3d/<id>/<anim>_<dir>_<i>.png (2×) ──► 2× box downsample ──► scripts/lib/pack.mjs atlas
```

- Model units are **px at 1×**, z up, the model faces −Y (towards the camera); the feet sit on the origin,
  which lands on y = 112 of the 128 px cell. Prim `size` is the full bounding box, `at` its centre,
  relative to the part's `pivot` (model space, default origin); a part may also carry a `rot` (degrees).
  The puppet animation turns parts about these pivots.
- Features (`{fn, parent, at, …}`) expand into ordinary parts whose pivot is `at`; colour keys
  (`c`, `tip`, `band`, `cap`) take pal keys. The `face` (`{part, eyeDx, eyeZ, eyeW, eyeH, brow, mouth, nose}`,
  offsets from the head ellipsoid centre) is unlit decals with no hull: white eyes, `#1b1b2f` pupils with a
  glint, brows and mouth, plus a `hurt` set (X eyes, open mouth). `--still` renders one idle frame per
  direction plus `hurt_S_0` into `.loop/tmp/art3d/`.
- **Animation** (`lib/puppet.py`): rigid parts turned about their pivots, idle 4 / run 6 / attack 3
  (windup, strike, recover) / hurt 1 (hurt face + squash) per direction = 70 frames. Styles `biped`
  (stepping feet, arm swing, lean), `blob` (hops, squash and stretch), `hover` (floats, tilts). Roles are
  found by part name (`body`, `head`, `arm_r/l`, `foot_r/l` or `leg_r/l`, `ear_r/l`, `tail`); a spec may
  override them in `anim.roles`, tune `anim.amp` (keys in `ANIM_AMPS`, `scripts/lib/spec3d.mjs`) and pick
  `anim.attackArm` (`r|l|both|none`). Every frame is grounded: the lowest outline vertex is moved to 1.5 px
  below the origin on screen (walkers snap exactly, blob/hover may only rise), so the frame bottom is y = 113.
- **Atlas**: the full render packs `client/public/art/sprites/<id>.{png,json}` (Phaser JSON hash, frames
  `<anim>_<dir>_<i>`, trimmed with `spriteSourceSize` in a 128² `sourceSize`). The PNG is indexed by
  `scripts/lib/indexed-png.mjs`, which keeps every palette hex exact (libimagequant dropped small areas).
  `tests/unit/art-budget.test.ts` enforces ≤ 1024², ≤ 350 KB, all frame names and the feet line (112 ± 3).
- The contact sheet of a full render has one block per direction (14 frames, 1×, 48 px, 48 px grayscale).
- Toon shadow band = base × 0.68 in HSV value (HLS would push pale colours like cream into orange); a surface
  is lit when its diffuse value is above 0.1, so camera-facing fronts show the base hex.
- 35° pitch shows the ground footprint below the origin: keep low parts slim and tucked under the body.
- Directions S, SE, E, NE, N are rendered by turning the model; the camera and sun never move, so the rig
  can mirror the E side with `flipX` without the light flipping.
- **Lighting replaces the top-left rule above for 3D sprites**: one sun from above, slightly in front of the
  camera, centred left-to-right.
- Colours are flat palette values through Emission with the `Standard` view transform, so the base band is
  the exact palette hex; the orchestrator prints a sampled pixel per palette colour and fails if one is missing.
- Outline: per-part inverted hull in `#1b1b2f`, 3 px at 1×, which also draws the lines between parts.
- If EEVEE fails headless, `art3d.mjs` retries with `--gpu-backend metal`, then falls back to Workbench
  (flat colours + outline).
- `npm run art:selftest -- --contact` renders a capsule + sphere + cone test figure and writes
  `.loop/shots/T34-contact.png` (row 1: 1×, row 2: 48 px, row 3: 48 px grayscale).
- Arena ground (`npm run art:arena -- docks`): a straight top-down ortho of the 2400×1600 world, saved at
  0.75× as `arena/docks-ground.jpg` (≤ 450 KB). Flat things only (lagoon bands, foam, sand, planks, tide-pool
  beds, pebbles); contact shadows come from hidden caster slabs on the collision rects. Ground colours are
  palette × a light factor (0.66 shadow … 1.0 sun) and stay ≤ 45 % saturation (p95, checked by the script and
  the budget test). `?art=svg` skips it and paints the old ground; `?rects=1` outlines every gameplay rect.

## Originality

Nothing may copy a franchise look (§2.8 in `TASKS-LOOP.md`): no yellow electric mouse with red cheeks, no
hay-coloured headwear with a red vest, no square sponge, no pink starfish, no red/white ball, no pineapple house.
Each fighter is an archetype plus a deliberate twist (species, prop, palette).
