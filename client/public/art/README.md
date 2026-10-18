# Brine Brawl — art spec

Every fighter is one hand-written SVG. No raster files, no external downloads (see `ASSETS.md`).

## Canvas

- `viewBox="0 0 128 128"`, `width`/`height` 128. No CSS, no filters, no gradients — flat shapes only
  (the rig tints, flips and scales sprites, so anything fancy breaks).
- **Facing right.** The character looks to +x; the rig mirrors it with `flipX` when the aim is to the left.
- Centred horizontally (body around x = 64) and the **feet/ground line sits at y ≈ 112** (max 118),
  so the sprite can be anchored by its feet on the player position.
- Silhouette first: it must read at 48 px. Big head, clear ears/horns/hats, limbs visible against the body.

## Style

- 5–8 flat colours plus the outline. Examples: Voltbun `#FFF3D6` body, `#E4D3B0` shade,
  `#2EC4B6` ears, `#FFC93C` tail, `#FF9FB0` nose.
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

`<id>` is the fighter id in `shared/fighters/index.ts` (`default`, `voltbun`, `mira`, …).
Add the id to `client/src/art/manifest.ts`; `tests/unit/art.test.ts` enforces canvas, outline colour, palette
size, the pair of files and the face difference, so a missing or off-spec sprite fails `npm run check`.

## Originality

Nothing may copy a franchise look (§2.8 in `TASKS-LOOP.md`): no yellow electric mouse with red cheeks, no
hay-coloured headwear with a red vest, no square sponge, no pink starfish, no red/white ball, no pineapple house.
Each fighter is an archetype plus a deliberate twist (species, prop, palette).
