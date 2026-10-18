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

## Originality

Nothing may copy a franchise look (§2.8 in `TASKS-LOOP.md`): no yellow electric mouse with red cheeks, no
hay-coloured headwear with a red vest, no square sponge, no pink starfish, no red/white ball, no pineapple house.
Each fighter is an archetype plus a deliberate twist (species, prop, palette).
