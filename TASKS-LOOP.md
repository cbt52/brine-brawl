# TASKS-LOOP — BRINE BRAWL (working title)

Repo `/Users/talhaacar/brawler` · branch `loop/brawler` · Node 22 · live port **8720**
Play: Tailscale `http://talhas-macbook-pro.tail185886.ts.net:8720` · LAN `http://192.168.178.60:8720`

---
## 0. LOOP PROTOCOL (read fully every iteration)

Markers: `[ ]` todo · `[x]` done · `[!]` blocked (reason in Log) · `[~]` skipped (optional/cut).

1. **Setup**: `cd /Users/talhaacar/brawler && (git switch loop/brawler 2>/dev/null || git switch -c loop/brawler)`.
   If `git status` is dirty (left over from a crashed iteration): if the changes belong to the current task, continue. Otherwise, if `npm run check` is green, commit them as `WIP: recover`. Else run `git stash push -u -m "loop-recover-<date>"`. Never discard work.
2. **Feedback first**: if `.loop/feedback.md` exists, read the lines not marked `✓`. If something is broken (can't join, crash, controls unusable on phone), fix it first as a hotfix (commit `HF: …`) and mark the line `✓`. Wishes and ideas go into §5 Backlog (top if the user asked for them), then mark `✓`.
3. **Pick** the FIRST `- [ ]` task in §3, going top-down. Do ONLY that task. T99 is recurring and never ticked.
   A CP header followed by a `**Gate:**` line is only eligible when its condition holds; otherwise skip that whole CP (T99 still runs).
4. **Implement** within scope. `CLAUDE.md` holds architecture, commands and originality rules and must be followed. Keep files small and focused. No unrelated refactors.
5. **Verify** before committing (everything must be green):
   - `npm run check` (typecheck + lint + ip-check + vitest)
   - the task's **Test** command(s)
   - visual tasks: `npm run shot -- …`, then open **at most 2** PNGs from `.loop/shots/` with the Read tool and fix obvious ugliness or unreadability.
   - Filter noisy output (`… 2>&1 | tail -40`).
6. **Finish**: tick `[x]`, append ONE Log line in §6 (`- T## ✅ YYYY-MM-DD — note ≤120 chars`), then `git add -A && git commit -m "T##: <title>"`. Never push.
7. **Checkpoint** (task marked `CP: yes`): before the commit also do the following:
   - run `npm run e2e` and make it green;
   - run `scripts/serve.sh` and check `curl -sf http://127.0.0.1:8720/healthz`;
   - write `.loop/checkpoint.md` (format §1);
   - collapse the bodies of the PREVIOUS CP's `[x]` tasks to their title line, to keep this file short.
8. **Stuck** (task >60 min, or tests still red after 2 fix attempts):
   - commit only green partial work as `T##-partial: …` and leave the box `[ ]`;
   - add a Log line `PARTIAL: <what's left>` and split the remainder into `T##a`/`T##b` directly below;
   - if the same task goes partial twice, cut scope and move the cut part to §5;
   - use `[!]` plus a `.loop/checkpoint.md` that starts with `ACTION NEEDED:` ONLY when the user must act (e.g. a firewall prompt, or the phone can't reach the server).
9. **Hard rules**:
   - No `git push`, no deploy, no paid services, no API keys or secrets.
   - Never delete or overwrite files this loop didn't create. You may delete: your own files, `dist/`, `.loop/tmp/`, `.loop/shots/`, `test-results/`, `playwright-report/`.
   - Never run `git reset --hard`, `git clean`, or `rm -rf` outside those paths.
   - Only kill processes started by this repo (pidfile / own temp servers).
   - External assets only if MIT, CC0 or OFL, and record each in `ASSETS.md`.
   - The originality rules (§2.7 + `CLAUDE.md`) are mandatory.
10. **Runner contract**: the external runner calls `scripts/serve.sh` after every iteration and forwards `.loop/checkpoint.md` to the user (WhatsApp/Hermes), then moves the file away. It may append user replies to `.loop/feedback.md`. The executor never contacts the user directly.

## 1. `.loop/checkpoint.md` format (German, ≤10 lines, line 1 = title)
```
CP2 ✅ Brine Brawl – Handy + Bots
Neu: Touch-Steuerung, Bots, Einladungslinks, Match-Timer.
Spielen: http://talhas-macbook-pro.tail185886.ts.net:8720  (WLAN: http://192.168.178.60:8720)
Allein: „Quick Play“ → 3 Bots. Mit Freund: „Create Room“ → Link schicken.
PC: WASD laufen · Maus zielen · Linksklick Angriff · E/Rechtsklick Spezial · Q Ultimate
Handy (quer halten): linker Stick laufen · rechter Stick ziehen+loslassen = Angriff · Buttons Spezial/Ult
Bekannt: <max 1 Zeile Einschränkungen>
```
Blocked: line 1 = `ACTION NEEDED: <what the user must do>`.

---
## 2. DESIGN REFERENCE (stable; change only via a task)

**2.1 Concept**: real-time top-down arena brawler with 2–8 players (humans plus bots) on Bubblebottom Docks, a pier-and-lagoon island. Matches are short (2:30). The game is cartoony, juicy and readable on a phone.

**2.2 Architecture**
- Server: Node (`tsx`) + `ws` + `sirv` on ONE port. It serves `CLIENT_DIR`, `/healthz`, and a websocket at `/ws`.
- The server is authoritative: clients send inputs only.
- `shared/sim/` is a pure TS simulation (no DOM, no Node APIs). It is used by the server, bots, unit tests, client prediction and the balance harness.
- `shared/protocol.ts` defines every message. Client: Vite + Phaser 3 for gameplay and in-world HUD, DOM overlay for menus.
- Use relative imports only (no path aliases).

**2.3 Netcode**
- Sim at 30 Hz, snapshot broadcast at 30 Hz as JSON with rounded ints and per-client filtering (bushes).
- Client interpolates others with a 100 ms delay. From T16 it also predicts its own movement and reconciles using `seq`.
- Input message: `{t:'in',seq,mx,my,ax,ay,atk,spc,ult}`, sent on change or every 100 ms.

**2.4 Numbers (starting points; tune in fighter data)**

| Parameter | Value |
|---|---|
| World size | 2400×1600 |
| Visible world height | ≈800 units |
| Speed | 240 u/s × fighter multiplier (0.85–1.25) |
| Radius | 26–40 |
| HP | 80–180 |
| Attack ammo | 3 ammo, reload 0.9–1.6 s each |
| Special | cooldown 5–9 s |
| Ult | charges from damage dealt (120–200) |
| Respawn | 3 s, plus 1.5 s spawn shield |
| Match | 2:30, then results 8 s, then auto rematch |

**2.5 Controls**
- PC: WASD/arrows move, mouse aims, LMB attacks, E or RMB triggers special, Q or Space triggers ult.
- Phone (landscape): left floating stick moves. Right stick aims; dragging and releasing fires, a quick tap auto-aims at the nearest enemy. Two buttons for Special and Ult.

**2.6 Factions & passives** (badge colors)
- **Critterkin** `#FFC93C`, creature companions. Passive EVOLVE: 2 KOs without dying → evolved (+12% size, +20% max HP, +25% ult gain, golden crest + aura). Lost on KO.
- **Elemental Weavers** `#2EC4B6`, element weavers. Passive FLOW: 3 attack hits within 3 s → next attack empowered (+50% dmg, status duration ×2).
- **Saltwind Crew** `#E63946`, Wonderfruit pirates. Passive PLUNDER: a KO steals 30% of the victim's ult charge, plus +25% bounty.
- **Bubblebottom Folk** `#FF7AA2`, undersea toon town. Passive TOON LOGIC: once per life, a lethal hit flattens them to 1 HP instead (pancake gag, 0.5 s immobile).

**2.7 Elements, statuses & reactions**

Statuses (3 s unless stated):

| Element | Status | Effect |
|---|---|---|
| Water | Wet | — |
| Fire | Burn | 4 dmg/s |
| Volt | Static | marker |
| Earth | Heavy | −15% speed |
| Leaf | Tangled | −30% speed, 1 s |
| Air | — | strong knockback, no status |
| Neutral | — | — |

Reactions (consume the status):

| Status + incoming element | Reaction | Effect |
|---|---|---|
| Wet + Volt | SHOCK | 0.7 s stun + 10 dmg. In tide water it chains 1 hop (≤250 u) |
| Wet + Fire | STEAM | 2 s steam cloud that hides like a bush |
| Burn + Air | FLARE | +15 dmg burst, burn spreads within 120 u |
| Heavy + Water | MUD | 0.8 s root |
| Tangled + Fire | WILDFIRE | burn duration ×2 + spreads |
| Static + Air | THUNDERCLAP | 120 u AoE, 12 dmg + knockback |

Each reaction shows a big popup word ("SHOCK!").

**2.8 Originality rules (mandatory)**
- Never use franchise names, character names, places, power names, or catchphrases from the source shows (the list is enforced by `scripts/ip-check.mjs`).
- Use our own vocabulary: *weaving* (not the source term), *Wonderfruit*, *doubloons*, *Bubblebottom Bay*, *Critterkin*.
- Visual don'ts:
  - no yellow electric mouse with red cheeks;
  - no bald monk with blue arrow marks;
  - no straw hat with red vest and scar under the eye;
  - no yellow square sponge in brown shorts and a tie;
  - no pink starfish in shorts;
  - no red/white capture ball;
  - no pineapple house.
- Each fighter = familiar archetype + a deliberate twist (different species, palette or prop).

**2.9 Modes**
- **Bounty Brawl** (FFA, default from CP5): highest bounty wins.
- **Treasure Tide** (3v3, CP7): collect doubloons from the Sunken Chest. A team holding ≥10 for 15 s wins.

**2.10 Arena**: Bubblebottom Docks.
- Sand, piers and lagoon, coral-wall obstacles, kelp bushes (hide), tide pools.
- **Rising Tide** cycle: low 35 s → rising 5 s → high 15 s → falling 5 s.
- At high tide the shallows flood: ×0.7 speed, Wet.
- At low tide, chests spawn in the tide pools.

**2.11 Art direction — 3D-rendered sprites (binding from CP9; plan by Opus 2026-10-18)**

**Camera and frames**
- Camera: orthographic, pitched 35° down, looking from screen-south.
- Fighters render 5 directions: S, SE, E, NE, N. W, SW and NW are the E-side frames mirrored (`flipX`). A spec can set `dirs: 8` when the costume is too lopsided to mirror.
- Frame cell: 128×128 px at 1×, rendered at 256 px and downsampled. Origin (0.5, 1); feet line at y = 112. The figure is 96–104 px tall; prop and width stay ≤ 120 px.
- Animations are rigid puppet parts with no skinning:

  | Anim | Frames | fps | Loop |
  |---|---|---|---|
  | idle | 4 | 6 | yes |
  | run | 6 | 12 | yes |
  | attack | 3 (windup, strike, recover) | 16 | no |
  | hurt | 1 (hurt face + squash) | — | — |

  That gives 14 frames × 5 dirs = 70 frames. KO, special/ult, evolve and wobble stay as rig tweens and FX on top of the frames.

**Look: chunky toy toon**
- Shading and outline:
  - Render with EEVEE, using toon shading (Shader-to-RGB into a constant ColorRamp) with 3 bands:
    - shadow: base colour ×0.68 lightness, hue shifted −8° toward blue;
    - base: the palette colour;
    - highlight: +12 % lightness, only on up-facing surfaces (normal z > 0.85).
  - A thin white Fresnel rim at 35 %.
  - Eyes are emissive: white, black pupil, one glint.
  - Fighters have no textures, only flat palette colours.
  - Outline: an inverted-hull mesh in `#1b1b2f`, 3 px thick at 1×.
- Colour and light:
  - Colour management must be `view_transform='Standard'`; AgX and Filmic are forbidden. Palette hex values from `scripts/art-models.mjs` must come out exactly.
  - Film is transparent. Don't bake in a ground shadow; the rig draws the contact shadow.
  - Light: one sun from above, slightly in front of the camera and centred left-to-right, so mirrored frames stay correct. For 3D sprites this replaces the "top-left" rule in `client/public/art/README.md`.

**Faction palettes**
- `trim` is the faction accent. It must sit on one large part that still reads at 48 px (scarf, collar, hat band).
- Critterkin: warm fur and cream tones, plus gold.
- Weavers: teal and earthy cloth.
- Saltwind: navy, red, sailor stripes.
- Bubblebottom: pastel pinks and aquas, round shapes.

**Readability**
- Arena saturation stays ≤ 45 % and fighters ≥ 55 %. No large arena area may use a faction accent, and no pure black is used anywhere.
- Every silhouette must be unique at 48 px. Check this on the grayscale 48 px row of the contact sheet.
- Team colour is never baked into a sprite. Teams are shown only by the crew ring and the name plate.
- Status effects reuse what exists today:
  - hit flash stays `setTintFill(0xffffff)`;
  - status tints and overlays stay unchanged;
  - evolved stays at +12 % scale with the rig's aura and crest.

**Arena**
- Ground: a straight top-down ortho render of the 2400×1600 world, saved at 0.75× as `docks-ground.jpg` (1800×1200). It holds only flat things: sand, lagoon, planks, tide-pool beds, shadow decals.
- Tall things (coral walls, barrels/crates, kelp) are separate sprites, rendered with the 35° camera. Each sprite's base sits on the bottom edge of its collision rect, and they are y-sorted together with the fighters.

**Performance budget** (enforced by `tests/unit/art-budget.test.ts`)

| Asset | Limit |
|---|---|
| Fighter atlas | ≤ 1024², ≤ 350 KB (palette PNG) |
| `docks-ground.jpg` | ≤ 450 KB |
| Props atlas | ≤ 1024², ≤ 300 KB |
| Water tile | ≤ 60 KB |
| FX atlas | ≤ 512², ≤ 150 KB |
| Extra download for the pilot | ≤ 2.5 MB |
| GPU memory in a match | ≈ 50 MB |

- After the rollout, atlases load on demand.
- In a 20 s bot match on the iPhone 13 profile, the lowfx watchdog must not trip.

**Pipeline**

| Part | Location / command |
|---|---|
| Blender scripts | `scripts/blender/{lib,specs,vendor,textures}` |
| Orchestrator | `scripts/art3d.mjs` (`npm run art:3d -- <id…> [--still] [--contact]`) |
| Arena render | `npm run art:arena -- docks` |
| FX render | `npm run art:fx` |
| Atlas packer | `scripts/lib/pack.mjs` (uses `sharp`) |
| ComfyUI client (optional) | `scripts/comfy.mjs` |

- Blender is called as `${BLENDER:-blender} -b --factory-startup --python <script> -- <args>`. Use one Blender call per id, each under 8 min. `npm run check` never needs Blender.
- Spec format: `scripts/blender/specs/<id>.json` = `{id, pal, dirs, scale, parts[{name, parent, prims[], remesh?}], features[], face, anim}`.
  - `pal` must equal the art-models `pal` for that id; a unit test enforces this.
  - Each part's primitives are joined, then voxel-remeshed and subdivided to get the vinyl-toy look.
- Rigs and animation: procedural rigs only. Quaternius or Mixamo humanoid rigs are rejected, because half the roster are creatures, headless retargeting is fragile, and the fighter meshes must be our own work.
- CC0 packs (Kenney Pirate and Nature kits) are allowed for arena props only, never for fighters. Commit only the GLBs actually used, plus `License.txt`, and add each to ASSETS.md. Vendored files total ≤ 2 MB.
- Commit final atlases, the ground JPG and the vendor GLBs. Raw frames go to `.loop/tmp/art3d/` (gitignored). Never commit `.blend` files.
- Re-render only the ids you changed: EEVEE output is not byte-stable, so a blanket re-render just produces git churn.
- Runtime: `client/src/art/sheets.ts` defines `SHEET_IDS`, `ANIMS`, and `sheetDir(aimDeg, prevDir)` (45° sectors, ±8° hysteresis). In `rig.ts` the fighter is a Sprite that plays the atlas when it exists.
  - `?art=svg` forces the old SVG look and is the fallback.
  - Skins are recoloured with `recolorPixels` (in `shared/skins.ts`) into a lazily built atlas.
  - Depth is `20 + y/WORLD_H`.
  - Debug: `?rects=1` shows collision rects; `botf=<ids>` pins bot fighters (needs ALLOW_DEBUG).
- ComfyUI is optional and used only for tileable ground and water textures:
  - If `:8188/system_stats` already answers, the user is using ComfyUI, so skip.
  - Otherwise start it with `open -a "Comfy Desktop"` and write `.loop/tmp/comfy.started`. Quit it afterwards only if that file exists.
  - Never run ComfyUI and Blender at the same time (16 GB RAM). FLUX.2 klein takes about 108 s per image; generate ≤ 6 per task.
- Iteration discipline: at most 2 render→look→fix cycles per fighter per iteration, then commit and note the remaining look issues in the Log.

---
## 3. TASKS

### CP1 — "Erste Prügelei: zwei Tabs/Handys im selben Raum"

- [x] **T00 — Tooling, MCP, scaffold**
- [x] **T01 — One-port server, client boot, serve.sh, smoke harness**
- [x] **T01a — Verify serve.sh idempotency on 8720**
- [x] **T02 — Authoritative movement, interpolation, touch v0**
- [x] **T03 — Attack, HP, KO/respawn, touch attack, CP1 e2e** · CP: yes

### CP2 — "Handy-Steuerung, Bots, Einladungslink, Match"

- [x] **T04 — Touch controls v1 (twin-stick) + mobile polish**
- [x] **T05 — Bots**
- [x] **T06 — Lobby & invite flow (DOM overlay)**
- [x] **T07 — Match flow, HUD, scoreboard** · CP: yes

### CP3 — "Die ersten 4 Kämpfer (je 1 pro Welt)"

- [x] **T08 — Data-driven fighters + ability primitives**
  - Done: `shared/fighters/{types,default,index}.ts` (FighterDef + 6-primitive `AbilityDef` union, registry with
    `default` = Deckhand, join id validated via `resolveFighterId`), `shared/sim/abilities.ts` casts generically
    (projectile count/spread/pierce/bounce/lob/aoeOnEnd, melee arc+knockback, dash+contactDmg, aoe delay/zone/tick/
    push/pull, buff, status), `SimPlayer.def` drives radius/HP/speed/ammo/reload. Ult charge from damage dealt,
    special+ult hold-to-cast gated by `cd`/charge, bots press both. Snapshot `uc` (%) + `cd` (s); HUD shows
    "SPC ready/cd · ULT n%", touch buttons get their rings filled. 23 new unit tests (vitest 56 total).
  - Do:
    - `shared/fighters/types.ts`:
      - `FighterDef {id,name,faction,element,role,blurb,radius,maxHp,speedMul,attack:AbilityDef,special:AbilityDef,ult:AbilityDef,ultCharge}`;
      - `AbilityDef` is a discriminated union with cosmetic `fx` keys:
        - `projectile{count,spread,speed,range,dmg,radius,pierce?,bounce?,lob?,aoeOnEnd?}`
        - `melee{arcDeg,range,dmg,knockback}`
        - `dash{dist,dur,contactDmg?,trail?}`
        - `aoe{at:'self'|'aim',range?,radius,delay,dmg,push?,pull?,zoneSec?,tickDmg?}`
        - `buff{shield?,heal?,speedMul?,sec}`
        - `status{…}` (applied as an element hook later)
      - attack ammo/reload, special `cd`.
    - `shared/sim/abilities.ts` executes the primitives generically. Per-fighter custom hooks only via `shared/fighters/hooks/<id>.ts` when a primitive can't express something.
    - `shared/fighters/index.ts` registry with `default` = the current generic fighter. Join `fighter` is validated against the registry.
    - Ult charge comes from damage dealt. Specials/ults are wired to input flags. Bots use the special when the target is in range and the cooldown is ready, and the ult when charged.
    - Snapshot adds `uc` (ult %) and `cd` (special remaining). The client buttons and HUD show them.
    - Unit tests per primitive (table-driven).
  - Test: `npm run check && npm run smoke`

- [x] **T08b — Art direction: 2.5D "rendered 3D model" look + likeness pass** · CP: yes
  - Done: one source model per fighter (`scripts/art-models.mjs`) → 50 SVGs + `ref/*.parts.json` via `scripts/art-gen.mjs`,
    75 deterministic three-blockout PNGs via `scripts/blockout.mjs`; light/shading spec in
    `client/public/art/README.md` §Look, likeness rows in `client/public/art/LIKENESS.md`, `/gallery.html?look=3d`.

- [x] **T09 — SVG art pipeline, animation rig, gallery**
  - Done: `client/public/art/README.md` (spec) + `default`, `voltbun`, `mira` each with a `-hurt` face (enforced by
    `tests/unit/art.test.ts`: 128 canvas, `#1b1b2f` outline, flat palette, faction accent, same body on the hurt face).
    `client/src/art/manifest.ts` (keys/urls, faction colours, element labels) + `art/rig.ts` FighterSprite: shadow,
    SVG body, faction-coloured name/HP plate with ammo pips, idle bob, run lean, attack stretch, hit flash + hurt face
    + wobble, KO spin/shrink/poof, flipX by aim, white self ring. GameScene draws rigs instead of coloured circles.
    `/gallery.html` (`client/src/gallery.ts`, extra vite input) shows every fighter at 128 + 48 px, states cycling.
  - Do:
    - Art spec in `client/public/art/README.md`:
      - SVG viewBox 0 0 128 128, facing right, centered, with a feet/ground line;
      - 5–6 flat colors + 1 shade;
      - dark outline `#1b1b2f` 4–6 px;
      - big expressive eyes, readable as a silhouette at 48 px;
      - each fighter also gets `<id>-hurt.svg` (same body, squeezed eyes and open mouth);
      - faction badge color used as an accent.
    - Loader: `this.load.svg(id, url, {width:128,height:128})`.
    - `client/src/art/rig.ts` FighterSprite (container: shadow ellipse + body sprite + name + bars) with tween states:
      - idle bob (scaleY 0.96↔1.04, 1.2 s);
      - run (lean ±8°, step squash);
      - attack (stretch 1.15 toward aim, 80 ms);
      - hit (`setTintFill(0xffffff)` 60 ms + hurt-face swap 200 ms + wobble);
      - KO (spin + shrink + poof);
      - flipX by aim direction.
    - `client/gallery.html` + `client/src/gallery.ts`: grid of all registry fighters at 128 px and 48 px, cycling the animation states, with name/faction/element.
    - Art for **Voltbun** and **Mira Tidecaller** (see §4).
  - Accept: the gallery screenshot is readable and the two fighters are clearly distinct and charming.
  - Test: `npm run check && npm run shot -- --name T09 --query "" --path /gallery.html`

- [x] **T10 — Kits: Voltbun + Mira Tidecaller**
  - Do: data and hooks per §4, plus FX keys. Mira's whip = melee arc with a long thin range. Tide Push = aoe cone push. Maelstrom = aoe pull zone. Voltbun's Static Dash = dash with a trail zone. Thunder Burrow = become untargetable for 0.6 s, reappear at the aim point, aoe stun.
  - Unit tests: each ability hits as designed. Bots pick these fighters at random.
  - Test: `npm run check && npm run smoke`

- [x] **T11 — Kits + art: Cap'n Noodle + Sudsy Loofah**
  - Note: kits registered (noodle 235 u taffy melee, stop-on-contact sling dash, cone barrage; sudsy 3-bubble bounce volley, bubble trap projectile, piercing mega bubble). New sim primitives: projectile `status`, dash `stopOnContact`, `trapped` status (no move/attack, pops after 25 dmg). Client draws the 150 ms taffy arm and bubble spheres.
  - Do:
    - SVGs and kits per §4.
    - Noodle's Taffy Jab renders a stretchy arm (thick bezier line, shoulder → fist) for 150 ms.
    - Sling Grab moves Noodle toward the aim point and stops at walls/enemies (bonus dmg).
    - Sudsy's Bubble Trap = projectile that applies `trapped` (no move/attack, 1.0 s, breaks early on 25 dmg) and renders a bubble around the target.
    - Mega Bubble = slow big projectile that traps everything it touches.
    - Gallery shot shows all 4.
  - Test: `npm run check && npm run smoke && npm run shot -- --name T11 --path /gallery.html`

- [x] **T12 — Character select** · CP: yes

### CP4 — "Juice: fühlt sich gut an"

- [x] **T13 — Game feel & FX**
  - Done: `client/src/fx/` — `textures.ts` (generated circle/star/bubble/spark/ring/dust/glow), `combatFx.ts`
    (muzzle flash, element-coloured impact ring+sparks, cast ripple, footstep dust, KO poof + orbiting stars,
    crit-sized damage numbers, screenshake halved on touch), `budget.ts` (particle cap 160/48, FPS watchdog
    → auto lowfx after 3 s <45 fps, `?lowfx=1`), `style.ts` (element palette + damage styles); rig gained
    `freeze()` hitstop (50 ms), `groundY`, `setUltReady()` glow; HUD low-HP red vignette; ☰ screenshake toggle
    in `ui/settings.ts`; 10 unit tests.
  - Test: `npm run check && npm run shot -- --name T13 --query "room=shot&bots=5" --wait 6000`
  - Do: `client/src/fx/` with:
    - generated particle textures (circle, star, bubble, spark, ring);
    - muzzle flash, impact ring and element-colored sparks, footstep dust;
    - hitstop (freeze victim sprite 50 ms);
    - screenshake on own hit/KO (setting, reduced on mobile);
    - damage numbers with pop and float (crit-size for >25);
    - KO poof cloud with orbiting stars;
    - ult-ready glow; low-HP red vignette pulse;
    - particle budget cap, with auto `lowfx` when FPS <45 for 3 s (also `?lowfx=1`).

- [x] **T14 — Arena art + bushes**
  - Do:
    - Background drawn once into a RenderTexture: sand island, lagoon water with animated wave lines (tweened graphics), wooden pier planks, coral walls matching the collision rects, barrels/crates decor, edge vignette.
    - Kelp bushes: players inside are invisible to enemies unless within 200 u or they just attacked (1 s reveal). Implement as per-client snapshot filtering on the server; bots respect it.
    - Own player in a bush is semi-transparent.
    - Unit test for the visibility filter.
  - Test: `npm run check && npm run shot -- --name T14 --query "room=shot&bots=3" --device "iPhone 13"`

- [x] **T15 — Audio (procedural, no files)**
  - Done: `client/src/audio/` — `sfx.ts` WebAudio-Synth (11 Presets aus Oszillatoren + Rausch-Buffer,
    Hüllkurven, 28-Voice-Cap, iOS-Unlock beim ersten Input), `map.ts` (reine Event→Preset-Zuordnung,
    Element-Sounds, Distanz-Dämpfung), `music.ts` (8-Takt-Sea-Shanty, Triangle-Lead + Square-Bass,
    40 ms Lookahead-Scheduler); Countdown-Beeps + Horn an Match-Phasen; ☰-Menü: Sound/Music-Toggles
    in localStorage; `cast`-Event trägt jetzt `slot` (attack/special/ult) für den Ult-Sound;
    cp1-e2e-Duell aus dem Kelp-Busch (900/1100, y=1000) in offenes Wasser verschoben (war rot seit T14).
  - Do:
    - `client/src/audio/sfx.ts` WebAudio synth (oscillators + noise + envelopes). Presets: shoot, zap, splash, bonk, whip, bubble-pop, ko, ult, pickup, countdown, horn.
    - Mapped to snapshot events, with distance attenuation.
    - Unlock on first input (iOS).
    - Simple original sea-shanty loop music (8-bar step sequencer, triangle + square bass), low volume.
    - Menu: SFX/music toggles in localStorage.
    - Unit test: event → preset mapping (pure function).
  - Test: `npm run check && npm run e2e`

- [x] **T16 — Client prediction + net diagnostics** · CP: yes

### CP5 — "Überraschung: Gezeiten, Elemente, Kopfgeld"

- [x] **T17 — Elements, statuses, reactions**
  - Do:
    - `shared/sim/elements.ts`: statuses and a reaction table per §2.7. Abilities apply their fighter's element (ability-level override allowed).
    - Snapshot `st` bitflags.
    - Client: small status icons above heads, tint overlays (wet = blue drips, burn = flicker), reaction popup words with a big bounce and a distinct sfx.
    - Table-driven unit tests for all 6 reactions.
  - Test: `npm run check`
  - Note: `shared/sim/elements.ts` owns statuses, the 6-row reaction table (status × element →
    shock/steam/flare/mud/wildfire/thunderclap), the burn tick (4 dmg/s in 0.5 s chunks), the mud
    root (0.8 s) and the steam cloud that hides like kelp. Abilities route every status/damage zone
    through `applyElementHit`, `st` is a bit mask, chips + drips + flicker ring + reaction words live
    in `client/src/fx/statusFx.ts` / `GameScene.drawStatus`, reactions play the new `react` sfx.

- [x] **T18 — Rising Tide**
  - Do:
    - `shared/sim/tide.ts` cycle per §2.10, synced in the snapshot (`tide:{phase,t}`).
    - At high tide the arena `shallows` flood:
      - inside water: speed ×0.7 and Wet each second;
      - SHOCK chains 1 hop to another player in the same water.
    - Low-tide treasure: 1–2 chests in tide pools (HP 40, can be hit). They drop a random pickup: heal 30 / +40% ult / doubloons (stored for T19).
    - Client: animated water overlay that expands with the phase, HUD tide meter with 5 s warning + horn, chest and pickup sprites.
    - Bots avoid deep water at high tide and go for chests.
    - Unit tests: phase timing, slow, chain shock.
  - Test: `npm run check && npm run shot -- --name T18 --query "room=shot&bots=3&tide=high"` (ALLOW_DEBUG override)
  - Note: `shared/sim/tide.ts` (35/5/15/5 s cycle, `waterRects`/`inWater`/`waterSpeedMul`/`pickupFor`), snapshot `tide:{phase,t,level}` + `chests` + `picks`; chests (HP 40) surface when the tide *enters* low and the rising flood swallows the rest, `damageChest` drops heal 30 / +40 % ult / `gold++`, pickups sink after 12 s; wading ×0.7 + Wet each second, shock chains 1 hop to a wet *or* flooded neighbour (`inWaterAt` host hook); client grows the water overlay from the flood level (arena.ts `paintTide`), HUD meter with the 5 s TIDE RISING flash + horn, chest/pickup sprites (GameScene `drawLoot`); bots loot chests and leave/avoid high-tide water (`leaveWater`); `?tide=high` debug join param (ALLOW_DEBUG); 13 tests in tests/unit/tide.test.ts, 330 green. Shot T18-0/T18b-0 show the meter; live check (tide=falling) delivered 2 chests at low tide with zero console errors.

- [x] **T19 — Bounty Brawl + WANTED poster**
  - Do:
    - Every player starts with 100 doubloons of bounty.
    - On a KO, the killer gets `50 + 50% of the victim's bounty` and their own bounty +100. The victim drops 3 coin pickups.
    - The highest bounty shows a floating WANTED crown marker.
    - Winner = highest bounty, and FFA scoring switches to bounty.
    - Results screen: procedurally drawn WANTED poster (parchment SVG/canvas, winner portrait, name, "WANTED – DRENCHED OR DRY", bounty with coin icon). Runners-up as small posters.
    - Unit tests for bounty math.
  - Test: `npm run check && npm run e2e`
  - Note: `shared/sim/bounty.ts` (`BOUNTY_START` 100, +100 per KO, purse `50 + 50 %` floored, 3 coins, `crownHolder`); `SimPlayer.bounty`/`gold`, KO pays the killer + drops 3 gold pickups, victim resets to 100, `resetScores` clears bounty+stash; snapshot `b`, `ScoreRow {b,f}`, `rankPlayers` sorts by bounty; HUD shows own bounty + bounty scoreboard, GameScene draws the crown + `WANTED` tag over the leader; results = canvas parchment posters (`client/src/ui/wanted.ts`, portrait from `/art/<id>.svg`) with runner-up mini sheets; 9 tests in tests/unit/bounty.test.ts, 339 green, e2e 15/15; shot T19-0.

- [x] **T20 — Faction passives** · CP: yes

### CP6 — "Die Crew wächst: 12 Kämpfer + Balance"

Each fighter task: SVG + hurt SVG, data kit, hooks if needed, unit test per ability, gallery shot ≤1 PNG viewed.

- [x] **T21 — Critterkin: Embercub + Mossback**
- [x] **T22 — Weavers: Pip Windwhistle + Brak Stonefist**
- [x] **T23 — Saltwind: Sable Tripleblade + Bisque Legsworth**
- [x] **T24 — Bubblebottom: Boss Pinchpenny + Hammy Divedome**
- [x] **T25 — Balance harness + pass** · CP: yes
  - Waiver (review 20261018-045112): the Do's 40–60 % band is **not** met and stays open — noodle 73 %, embercub 70 %, voltbun 66 %, pinchpenny 31 %, sudsy 27 %. The 3-pass budget is spent and mobility decides bot duels more than the numbers, so the closing pass is deferred to **T99** (first `.loop/balance.md` outlier, per §5). The harness itself is done and green.

### CP7 — "Team-Modus: Treasure Tide + Crew-Kombos"

- [x] **T26 — Teams**
- [x] **T27 — Treasure Tide mode**
- [x] **T28 — Crew Combos + spectate + rematch** · CP: yes

### CP8 — "Volle Crew: 24 Kämpfer"

- [x] **T29 — Critterkin: Gloomoth, Pebblor, Dozelump** (Test: gallery shot + check)
- [x] **T30 — Weavers: Ashka Flameheart, Kip Boomer, Uncle Tobo** (boomerang = projectile `returns:true`, can hit twice)
- [x] **T31 — Saltwind: Nova Chartwind, Longshot Lenny, Doc Fawnsworth** (new primitive `summon{decoy|turret}` if needed; heal on ally)
- [x] **T32 — Bubblebottom: Lumpy, Squall Mopefin, Teeny Krill** (turret via `summon`)
- [x] **T33 — Roster polish + rebalance** · CP: yes
  - Do: character select with faction tabs and a "Random" button, short bios, a mobile-friendly scroll; `npm run balance` full pass; gallery review of all 24 (one shot, fix the worst 2 readability problems); PWA manifest + generated icon so the game can be "added to home screen".
  - Checkpoint: "CP8 ✅ 24 Kämpfer", plus tips on what's fun to try.
  - Test: `npm run check && npm run balance -- --quick && npm run e2e:all`

### CP9 — "Art-Upgrade Pilot: 4 Kämpfer + Docks in Blender-Optik" (model: opus)

Rules for every task:
- Follow §2.11, and `npm run check` must be green.
- View ≤ 2 PNGs per task (contact sheets count).
- Do ≤ 2 render→look→fix cycles per fighter, then commit and note open look issues in the Log.
- Never re-render fighters you didn't change.

- [x] **T34 — Blender toolchain spike**
  - Note: Blender 5.2.2 at `/Applications/Blender.app` (art3d.mjs checks `$BLENDER`, then `blender` on PATH, then that path). EEVEE renders headless on the first try; `--gpu-backend metal` and the Workbench fallback are wired but unused. Model units = px at 1× (camera `ortho_scale` 128, `shift_y` 0.375 puts the origin on y = 112), the model turns per direction while camera + sun stay fixed. Toon = Diffuse → Shader-to-RGB → constant ramp (threshold 0.2 at sun strength 1) → Emission, so `Standard` output is the exact hex: selftest prints body/detail/trim sampled exactly (3810/4651/260 px). Outline = per-part inverted hull (`build.hull_mesh`: even-thickness push along normals + flipped faces, own object with `visible_shadow` off, backface-culled). Frames are 2× renders reduced by an exact premultiplied 2×2 box filter (`scripts/lib/frames3d.mjs`), not a resize kernel, so flat areas keep their hex. `layoutShelves` can't fit 70 untrimmed 128² cells in 1024² (64 max) — T36 must trim frames (`spriteSourceSize`). Selftest figure is 100 px but its belly dips to y = 119 (35° pitch shows the underside), so specs must keep low parts slim. ip-check now scans `scripts/` + `.py` with an allow-list for "fluffy". Contact sheet `.loop/shots/T34-contact.png`: 5 dirs, bands, continuous outline; rim light is barely visible at 1× (fine for now).
  - Do:
    - Create `scripts/blender/{lib/toon.py,lib/cam.py,lib/build.py,render_fighter.py}` and `scripts/blender/specs/selftest.json` (capsule body + sphere head + cone prop).
    - Create `scripts/art3d.mjs`: finds `$BLENDER` or `blender`, exits with a clear error if it is missing, makes one Blender call per id.
    - Create `scripts/lib/pack.mjs` with a pure `layoutShelves`. Add devDep `sharp` and npm scripts `art:3d` and `art:selftest`.
    - Render setup: EEVEE, Standard view transform, transparent film, inverted-hull outline 3 px at 1×, 3-band toon, 5 dirs.
    - Output goes to `.loop/tmp/art3d/selftest/`, packed to `.loop/tmp/art3d/selftest.{png,json}` (not committed).
    - If EEVEE fails headless, try once with `--gpu-backend metal`. If that also fails, fall back to Workbench (flat + outline) and note it in the Log.
    - Extend `scripts/ip-check.mjs` to cover `scripts/` and `.py` (skip ip-check itself).
    - Add the new commands and the dir map to CLAUDE.md, and a §3D section to `client/public/art/README.md`.
  - Accept:
    - `npm run art:selftest` takes < 3 min.
    - The contact sheet `.loop/shots/T34-contact.png` shows 5 directions, visible toon bands and a dark outline.
    - Palette hex comes out exactly: the script samples a pixel and prints it.
    - `tests/unit/art3d.test.ts` covers `layoutShelves` (no overlap, ≤ max, deterministic) and `validateSpec`.
  - Test: `npm run check && npm run art:selftest -- --contact`

- [x] **T35 — Voltbun model (stills)**
  - Note: `lib/features.py` (`earsLong`: splayed ears with a teal cap and 3 zigzag teeth; `tailBattery`: gold cell, teal band, capped + terminal) and `lib/face.py` (decals wrapped onto the head ellipsoid, no hull; `normal` + `hurt` = X eyes/open mouth) are split out of `build.py` to keep files small. Parts got `pivot`/`rot` (prims are pivot-relative) so T36 can turn them. Added a big gold collar (`prop`) as the faction-gold part; 3D drops the blush (LIKENESS row updated). `--still` now also renders `hurt_S_0`. Toon fixes (global): shadow = HSV value ×0.68 (HLS turned cream orange), lit threshold 0.2 → 0.1 so camera-facing fronts show the base hex; selftest still exact. Numbers: S 100 px, but E/SE are 105–106 px and the bottoms sit at y 115–118 (35° pitch shows the feet in front of the origin). T36 must settle the feet line (lift or slimmer feet). Far-eye decals show as white ticks just inside the outline at SE/E (outline unbroken: 0 decal px touch the background).
  - Do:
    - Write `scripts/blender/specs/voltbun.json` per §4: round cream bunny, teal zigzag ear tips, battery tail, grin. Use the `pal` from art-models.
    - Add feature generators `earsLong` and `tailBattery`, plus the face (eyes, brows, mouth, `hurt` variant), in `lib/build.py`.
    - Voxel-remesh and subdivide each part for the vinyl-toy look. Add an `anim.style: biped` stub.
  - Accept:
    - The `--still --contact` sheet reads as Voltbun at 48 px in both the colour and the grayscale row.
    - The faction gold sits on a big part. No flat-grey mush. The outline is continuous.
    - Update the LIKENESS.md row if a cue moved.
    - Unit test: spec `pal` == MODELS `pal`.
  - Test: `npm run check && npm run art:3d -- voltbun --still --contact`

- [x] **T36 — Puppet animation + Voltbun atlas**
  - Note: `scripts/blender/lib/puppet.py`: `Puppet` applies per-part deltas (loc/rot/scale) on the rest transforms; role parts found by name (`anim.roles` overrides), amplitudes in `AMP[style]` (`anim.amp` overrides, keys mirrored as `ANIM_AMPS` in `spec3d.mjs` + unit test), `anim.attackArm`. Grounding: after posing, numpy finds the lowest hull vertex in screen-up (y·sin35 + z·cos35) and moves the root so it sits at −1.5 px → every frame bottom is y = 113 (biped snaps exactly; blob/hover only lift). This settled T35's 115–118 feet. `build.build` now returns `objs`; `render_fighter.py` renders 14 frames × 5 dirs (`--still` unchanged in spirit, now grounded too); `art3d.mjs` no longer forces `--still`, trims frames (`trimFrame`, Phaser `spriteSourceSize`, 128² `sourceSize`) and writes `client/public/art/sprites/voltbun.{png,json}` (1022×525, 157 KB, 15 s). Indexed PNG via new `scripts/lib/indexed-png.mjs` (keep-hexes + top-192 exact colours + median-cut rest; sharp's libimagequant dropped `detail`, plain RGBA was 396 KB). Voltbun: scale 0.97, ears len 25 / lean 2 (E/SE ears clipped at y 0 before) → S 97 px, tops 4–34. New `tests/unit/art-budget.test.ts` (≤1024², ≤350 KB, 70 names, bottom 112±3, top > 0) + 5 tests in `art3d.test.ts`. Contact sheet: run reads by lean, steps, ear drag (weak in S/N, as expected from the front); strike lunge clear in E/SE. Open look issue: the 20 px punch arm stays small even stretched 1.35×.
  - Do:
    - Write `lib/puppet.py`: idle 4 / run 6 / attack 3 / hurt 1 frames, styles `biped|blob|hover`, overridable per spec.
    - Do the full render to `client/public/art/sprites/voltbun.{png,json}`. Frame names are `<anim>_<dir>_<i>`, sourceSize 128².
  - Accept:
    - The atlas is ≤ 1024² and ≤ 350 KB, and all 70 frame names are present (vitest reads the JSON).
    - The contact sheet shows a readable run cycle and a clear attack lunge.
    - The feet stay on the y ≈ 112 line in every frame. Test: frame bottom = 112 ± 3 via `spriteSourceSize`.
  - Test: `npm run check && npm run art:3d -- voltbun --contact`

- [x] **T37 — Rig plays sprite sheets (SVG fallback kept)**
  - Note: `sheets.ts` is pure (sectors centred on i·45°, aim = atan2 y-down so 90° = S; `sheetView` maps W/SW/NW → E/SE/NE + flipX; `svgForced`). Rig body is now a Sprite: sheet mode = origin (0.5, 112/128) on the shadow centre, no idle/run/attack tweens (frames do it), facing changes keep the cycle phase, attack = 3 frames (187 ms) then idle, hit = `hurt_<dir>_0` for 200 ms + tintFill + wobble; KO/pancake/evolve unchanged. `skinSheet.ts` builds `sheet-<id>-s<n>` as a CanvasTexture on first use (frames + trim copied) and creates anims per texture. Depth `20 + y/WORLD_H` in GameScene. `botf` = `JoinOpts.botFighters` → `Room.botFighters` (ALLOW_DEBUG). `__brawl.looks` + `tests/e2e/sheets.spec.ts` prove sheet/skin/SVG/`?art=svg` in a live match; gallery turns sheet fighters 45° per beat. Shots: the task's portrait iPhone 13 shot only shows the rotate hint, so the landscape one is the check, but on a first visit the tutorial card covers it (no URL skip, it's localStorage), so the in-game look was NOT checked by eye. T38+ shots: use `iPhone 13 landscape` and dismiss the tips first.
  - Do:
    - Create `client/src/art/sheets.ts` with `SHEET_IDS=['voltbun']`, `ANIMS`, and `sheetDir` (±8° hysteresis).
    - In the rig, change Image to Sprite. Create anims per id and dir, use the hurt frame on hit, and mirror the W side with `flipX`.
    - `?art=svg` forces the SVG look.
    - Add `recolorPixels` in `shared/skins.ts` and `client/src/art/skinSheet.ts` (builds the skinned atlas lazily).
    - Set depth to `20 + y/WORLD_H`.
    - Show the sheets in the gallery.
    - Add the debug join param `botf=<ids>` (needs ALLOW_DEBUG, same path as `tide`).
  - Accept:
    - Unit tests for `sheetDir` (8 sectors + hysteresis), for `recolorPixels` == `recolorSvg` on sample colours (outline unchanged), and for sheets↔disk consistency.
    - In game, Voltbun turns with the aim, runs, attacks, flashes white on hit, and skins 1/2 recolour.
    - Fighters without a sheet are unchanged.
  - Test: `npm run check && npm run e2e && npm run shot -- --name T37 --path /gallery.html --query "" && npm run shot -- --name T37m --device "iPhone 13" --query "room=shot&fighter=voltbun&bots=3&botf=voltbun"`

- [x] **T38 — Mira Tidecaller (model + anims + atlas)**
  - Note: new `torus` prim in `build.py` (ring in xy, z = tube Ø, `waves: [count, amp, radial?]` for scalloped trims; validated in `spec3d.mjs`). Spec `mira.json` (plain parts, no new features): bell parka (2 spheres, detail) + wavy trim hem torus, hood UP behind a bigger head (hood centre pushed back y+13 so its hull clears the face) with a radially scalloped trim rim torus, hair `#4A3442` as 2 small bang blobs + 3-blob side braid with tan shell beads (prop), tan boots, sleeves + skin hands, a wavy trim ring round each hand. Cycle 1: bangs read as a dark visor, `grin` brows looked angry, rim/ribbons invisible → smaller/higher bangs, `calm` brows, head 52×48×48, rim pushed forward, ribbon tube 5. Result: 1016×~590 atlas, ~158 KB, S 100 px, bottoms all y=113, width 62–97, 26 s render. Grey 48 px row: hood dome + braid, no ears → distinct from Voltbun. Open look issues: teal-on-teal (detail vs trim) is low contrast, the bangs still read a bit like goggles at 48 px, N/NE is a plain hood blob. e2e `sheets.spec` now pins `botf=mira,brak` (brak = the SVG fighter).
  - Do:
    - Write the spec per §4: shell-bead braid, teal parka with wave trim, water ribbon around the hands. Human chibi: big head, hair as merged blobs.
    - Add her to `SHEET_IDS` and add a LIKENESS row.
  - Accept: same as T35+T36 (reads at 48 px, within budget, 70 frames). Her silhouette is distinct from Voltbun's in the 48 px row.
  - Test: `npm run check && npm run art:3d -- mira --contact`

- [x] **T39 — Cap'n Noodle (model + anims + atlas)**
  - Note: spec `noodle.json`: lanky biped (26 px capsule legs + dark shoes, long 30 px arms with teal puff sleeves), teal shirt with 2 red torus stripes, navy shorts, cream collar ring, dark hair cap, teal hat tilted back (−12°) whose brim is a torus with new 4th `waves` value `lag` (`[3, 5, 10, 90]`: 3 lobes, lifted where the ring bulges out = tricorn corners) + cream rim torus + cream shell badge in front; new `grin` mouth (5-point wide arc) in `face.py`. Scale 0.85 clipped the hat at the cell top in `run_N_1/4` → 0.83: S 96 px, tops 5–32, bottoms all y=113, width 59–91, 1002×640 atlas 173 KB, 22 s render. Added to `SHEET_IDS`, LIKENESS row gets the 3D note. Taffy arm: the in-game shot (`.loop/tmp/t39-arm.mjs`, tips pre-dismissed) cropped off-player (camera not centred), so the shoulder start was checked by geometry: arm path starts at the rig origin, sheet feet sit 0.30·h below it, shoulder pivot z 54·0.83 → 0.29·h above the feet ⇒ within 0.01·h of the arm origin. Open look issues: from S/N the brim reads more like a round saucer than three corners; the hat hides most of the hair; the face sits low under the brim.
  - Do:
    - Write the spec per §4: lanky, seashell tricorn (NOT a straw hat), teal striped shirt, rubbery grin. Respect the §2.8 don'ts.
    - Add him to `SHEET_IDS` and add a LIKENESS row.
  - Accept: same as T38. The in-game taffy arm still starts at the sprite's shoulder (shot with `fighter=noodle`).
  - Test: `npm run check && npm run art:3d -- noodle --contact`

- [x] **T40 — Sudsy Loofah (model + anims + atlas)**
  - Note: spec `sudsy.json`, `anim.style: blob`, face on the `body` part (no head). Pink body sphere 72×66×68 + 10 darker-pink `nubs` (loofah bumps, scalloped silhouette), 3 aqua `#BDEFF5` bubbles on top, cream `apron` = a sphere bulging out of the lower front + waist-tie torus (trim on a big part), stubby detail feet. Wooden spatula: upright beside the right hand (handle + box blade), so the rest pose never dips below the feet; the strike is an overhead chop via negative amps (`windup -30`, `strike -90`, `swing 20`). New in `face.py`: `teeth: "gap"` (two white teeth under the lip line, validated in `spec3d.mjs` + test) and brow `soft` (outer end dropped: `grin`/`calm` brows set high on a round head read as an angry V under the 35° camera). Cycle 1: 111 px, angry brows, apron only a thin ring, spatula a low brown box that set the feet line (hurt_S bottom 108). Cycle 2: fixed. The final render (scale 0.95, `soft` brows) was checked by numbers only: S 97 px, bottoms 110–113, width 70–107, 1005×571 atlas 136 KB, palette exact, 22 s. Gallery shot T40-0 NOT viewed by eye (2-PNG budget went on the contact sheets); a pixel count shows the sheet-only bubble aqua (98 px), so the gallery draws the sheet. Open look issues: the `soft` brows haven't been seen yet; the nubs look like polka dots from N/NE; the spatula blade is edge-on from E.
  - Do:
    - Write the spec per §4: ROUND pink loofah, fry-cook apron, spatula, gap tooth. It must not read as a square yellow sponge.
    - Use `anim.style: blob`. Add it to `SHEET_IDS` and add a LIKENESS row.
  - Accept: same as T38. The gallery shot shows all 4 pilot sheets together, clearly distinct from each other.
  - Test: `npm run check && npm run art:3d -- sudsy --contact && npm run shot -- --name T40 --path /gallery.html --query ""`

- [~] **T41 — ComfyUI ground textures (optional)**
  - Note: SKIPPED — ComfyUI wasn't running. `npm run comfy` started `Comfy Desktop` twice (`open -a`), but neither :8188 (launcher script) nor :8000 (Desktop default) answered within 3 min. The script quit the app again both times. The tooling is in place for a later manual run: `scripts/comfy.mjs` (exit 2 = already running → skip, 3 = no answer; `--keep` leaves the app open; tiles `sand-dry|sand-wet|planks|water`) + pure `scripts/lib/seamless.mjs` (per-axis cross-fade with a half-rolled copy, `seamScore`, `tileRepeat`) + `tests/unit/seamless.test.ts`. No textures were generated, so there's no ASSETS row. T42 uses Blender noise.
  - Do:
    - Write `scripts/comfy.mjs` and `npm run comfy`.
    - Use the API workflow `~/AI/ComfyUI-Shared/api/flux2-klein-t2i.json`. If it is missing, build it from the UI workflow via `/object_info`; give up after 20 min.
    - Skip with `[~]` if ComfyUI is already running (the user is using it) or doesn't answer within 3 min.
    - Generate ≤ 6 seamless 1024² tiles: dry sand, wet sand, sun-bleached planks, lagoon water. Downscale them to 512² and save as `scripts/blender/textures/*.jpg`, ≤ 150 KB each.
    - Quit ComfyUI only if this task started it.
    - ASSETS.md: "generated locally, FLUX.2 klein 4B (licence per model card), own prompts".
  - Accept: a 2×2 tiled preview shows no visible seams, and the tiles contain no text and no figures.
  - Test: `npm run check`

- [x] **T42 — Docks ground render**
  - Note: `npm run art:arena -- docks` = `scripts/art-arena.mjs` (run via `node --import tsx`, imports `scripts/lib/arena-layout.ts` → JSON in `.loop/tmp/art3d/arena/`) + `render_arena.py` + `lib/ground.py` (flat n-gons stacked by z, wobbled rounded rects sharing a seed so foam/wet rim/depth bands follow the shore; ground colour = palette (noise-blended) × light factor 0.66…1 from Shader-to-RGB, sun π strength, tilt 10°, angle 22°, 48 TAA samples with shadow jitter). Blender 4 s. No T41 tiles → Blender noise. Contents: edge/deep/mid/shallow lagoon bands + foam line, wet rim, sand island (inset 64, r 190), 4 plank piers from the edge to the edge-middle spawns + 4 pads under the corner spawns (`decksFor`, bevelled boards, stringers, posts), tide-pool bed on `SHALLOWS` (damp ring, rim, basin, pebble ring), 150 pebbles/shells clear of every rect, hidden caster slabs on walls/decor/kelp → soft contact shadows. Output 1800×1200 q88 121 KB, sat mean 28 % / p95 39 % / max 42 %, no black (`scripts/lib/ground-stats.mjs`, also in `art-budget.test.ts`). Client: `art/ground.ts` (`preloadGround`, skipped under `?art=svg`; `?rects=1` → `debugRects` outlines at depth 40); `ArenaArt` draws the image into the ground RT scaled to the world, then still paints coral walls + barrels on top (`paintProps`) until T43. `findBlender` moved to `scripts/lib/blender.mjs`. `shot.mjs` now pre-dismisses the tutorial (`--tips` keeps it). Shots: desktop `?rects=1` viewed — outlines sit on the shadows/props, fighters pop; the portrait iPhone 13 shot is only the rotate hint, so `T42ml` (landscape) was checked by pixel count (45 % sand-hex pixels = image drawn in WebKit). Open look issues: the open-water ripple lines of the old wave layer also cross the sand; kelp shadows are plain blobs.
  - Do:
    - Write `render_arena.py` and `npm run art:arena -- docks`. The layout is exported from `shared/arena/docks.ts` via tsx.
    - Render a top-down ortho of the 2400×1600 world to `client/public/art/arena/docks-ground.jpg` at 1800×1200, ≤ 450 KB.
    - Contents: lagoon with depth bands and shore foam, sand island (T41 tiles or Blender noise), plank piers, tide-pool beds at `SHALLOWS`, soft contact shadows under walls, decor and bushes.
    - `ArenaArt` uses the image when the texture exists (Docks only); otherwise it keeps the old paint.
  - Accept: meets the §2.11 saturation rule (sand and water muted, fighters pop). A `?rects=1` shot shows the beds and shadows sitting on their rects.
  - Test: `npm run check && npm run shot -- --name T42 --query "room=shot&bots=3&rects=1" && npm run shot -- --name T42m --device "iPhone 13" --query "room=shot&bots=3"`

- [x] **T43 — Docks props: coral walls, barrels/crates, kelp**
  - Note: no Kenney kit, all procedural (`scripts/blender/lib/props.py` → fighter-style part lists through `build.build`: reef-rock plinth + edge lumps (voxel remesh) with finger corals, cream tips and lilac domes; bulging stave barrel + hoops + lid; slatted crate with a diagonal brace; kelp bed + leaf blades, tall at the front and short at the back so the depth-26 canopy barely spills past the rect top). `npm run art:arena -- docks --props` (`--ground` = ground only, none = both) → `scripts/lib/arena-props.mjs` + `render_arena_props.py`. Projection: 35° fighter camera with each model's ground depth stretched ×1/sin35 so the base covers its rect on the top-down ground. Plan in `scripts/lib/props-layout.ts`: one frame per rect size (walls `_a`/`_b` for top/bottom halves), right half = same frame + `flipX` → 14 frames, 30 instances, 1.5 px/u. Measured footprints ±1…3.7 u (check ±6), nothing clipped, atlas 996×937 indexed 144 KB, opaque sat p95 43 %, Blender 8 s. JSON: `pivot` per frame, `px`, `props` (anchor = rect bottom-edge middle). Client `art/props.ts` `ArenaProps` (y-sorted `sortDepth` shared with the rigs, kelp 26 + ±1.2° sway, off in lowfx, alpha 0.94); painted props/kelp stay for `?art=svg`/no atlas. `__brawl.props` + `tests/e2e/props.spec.ts`, `tests/unit/arena-props.test.ts`, props budget in `art-budget.test.ts`. 2-PNG budget went on the 2 atlas previews, so the T43 in-game shot was checked by pixel count only (coral/kelp hexes + red rect outlines present), NOT by eye. Open: long N-S walls y-sort by their bottom edge, so a fighter standing beside one can lose a sprite sliver to it; crate trim reads a bit grey; projectiles/loot north of a wall are hidden behind its raised part.
  - Do:
    - Use Kenney CC0 Pirate/Nature GLBs where useful. Vendor only the files used into `scripts/blender/vendor/`, with `License.txt` and ASSETS.md rows.
    - Make the coral walls procedural, with 3 shapes for the 3 rect sizes.
    - Render each instance at the 35° camera with its base on the rect bottom. Output `client/public/art/arena/docks-props.{png,json}`, plus a world anchor per frame.
    - Y-sort the props together with the rigs.
    - Kelp sprites go at depth 26 (alpha rules unchanged) with a slow sway tween, off in lowfx.
  - Accept:
    - In a `?rects=1` shot, every footprint matches its collision rect within 6 u.
    - A fighter behind a wall is covered by it; a fighter in front is drawn over it.
    - The props atlas is ≤ 1024² and ≤ 300 KB.
  - Test: `npm run check && npm run e2e && npm run shot -- --name T43 --query "room=shot&bots=5&rects=1"`

- [x] **T44 — Water + tide states**
  - Note: tile = `render_water.py` (emissive plane, 4D-torus-mapped Voronoi distance-to-edge + 4D noise warp → constant ramp: line/halo/clear, so it wraps exactly; `--raw`/`--cells`/`--span` tuning flags) via `npm run art:arena -- docks --water` (`scripts/lib/arena-water.mjs`: 512² → exact 2×2 box → 256², grey = alpha on tint `#E2F1EF`, palette PNG 21.6 KB). Seam proof = a 2-tiles-wide render whose halves differ by Δ 0.01 (neighbour-step `seamScore` misfires on thin lines). Client: `art/waterMath.ts` (pure: `lagoonHoles`, `lagoonStrips`, `waterScroll`, `poolLook`, `rimPoints`) + `art/water.ts` `WaterArt` (4 lagoon TileSprites, inverted GeometryMask of island+decks, WebGL only; per-pool caustics TileSprite masked by the live water rects; toon fill shallow/core + inner edge line, foam rim line + bobbing bubbles, 2 expanding ripple rings, whitecaps dropped). Level 0 now draws no water (matches `inWater`). Still in lowfx = `?lowfx=1` OR the FX watchdog's `budget.low` (passed per frame). Old open-water ripples are off when the tile shows (they crossed the sand). `decksFor`/`ISLAND` moved to `shared/arena/shore.ts`. `__brawl.water` + `tests/e2e/water.spec.ts`, `tests/unit/water.test.ts`, budget row. Shots: T44h viewed (lagoon caustics stop at foam/piers, pool reads as water); T44l by pixel count (pool corner 0 % water vs 81 % at high). FPS in lowfx not measured (T46).
  - Do:
    - Make a 256² seamless water tile (Blender or T41) and use it as a scrolling TileSprite in the lagoon band.
    - Restyle the flood overlay in `paintTide`: toon water fill, foam rim, ripples. Keep the same `waterRects` logic.
    - In lowfx the water is static.
  - Accept: shots at low and high tide read clearly, with the flooded shallows obviously slow water. No FPS drop in lowfx.
  - Test: `npm run check && npm run shot -- --name T44h --query "room=shot&bots=3&tide=high" && npm run shot -- --name T44l --query "room=shot&bots=3&tide=low"`

- [x] **T45 — Loot + pilot projectile sprites**
  - Note: `scripts/blender/render_props.py` + `scripts/blender/lib/loot.py` (chest, doubloon, heal cross, ult star, volt bolt, bubble, water drop, taffy fist) via `npm run art:fx` (`scripts/art-fx.mjs`, PX 2, frames in world units, `clippedEdges` guard, preview `.loop/shots/fx.png`) → `client/public/art/fx/fx.{png,json}` 254×260, 9.6 KB, 8 frames, every origin centred. `client/src/art/fxSprites.ts`: `pickupFrame`/`projFrame`/`fxTurns`/`FX_SCALE` + `preloadFx` (`?art=svg` keeps painted) + `FxSprites` image pool (`begin`/`draw`/`end`; `ready` false without the atlas, so the old painted chest/pickup/ball/fist stay as fallback). Draw sites: chests + pickups in `drawLoot`, projectiles in the proj pass (heading from the last drawn spot, `projHead`), fist in the arm overlay; `__brawl.fx` reports the drawn frames. Also fixed `scripts/shot.mjs`: a `--device` shot turns the preset viewport 90° (before, every mobile shot was just the "rotate your phone" overlay). Shots: `.loop/shots/T45-0.png` (iPhone 13, landscape) and `T45c-0.png` (chest next to the player, readable).
  - Do:
    - Write `render_props.py` and `npm run art:fx`, output `client/public/art/fx/fx.{png,json}` (≤ 512², ≤ 150 KB).
    - Contents: chest, coin, heal/ult pickups, volt bolt, bubble, water drop, taffy fist.
    - `drawLoot` and projectile drawing use the sprites when present, otherwise the current graphics.
  - Accept: chests and pickups are readable at phone zoom. Unit test for the sprite-key mapping.
  - Test: `npm run check && npm run shot -- --name T45 --device "iPhone 13" --query "room=shot&bots=3&tide=low"`

- [x] **T46 — Budget + perf pass**
  - Note: `tests/unit/art-budget.test.ts` now covers the whole §2.11 table: FX atlas (254×260, 9.6 KB, ≤ 512²/150 KB), sprite width ≤ 120 px + idle ≥ 90 px (blob sudsy 78–102, noted), a 2.5 MB pilot-download sum (actual 1.03 MB: 4 sheets 720 KB + ground 123 KB + props 148 KB + water 22 KB + fx 10 KB) and a 50 MB GPU estimate from the decoded RGBA sizes (actual ~22 MB). `window.__brawl.fps` = `{fps, lowfx, firstFrameMs, particles}` (`GameScene.perf`, first drawn frame stamped in `update`); `npm run perf` (`scripts/perf.mjs`) builds, starts a temp server and measures: desktop Chromium first frame **3D 977 ms vs `?art=svg` 822 ms** (median of 3, +155 ms for the extra 1 MB), iPhone 13 (WebKit, landscape) 20 s 3-bot match **fps median 59.7, min 55, lowfx watchdog NOT tripped, particle peak 72** → `.loop/perf.md`. e2e: new `tests/e2e/perf.spec.ts` checks the hook; the mobile Playwright project now uses a landscape viewport (portrait showed the rotate hint over every DOM test, 6 red) and `cp1.spec` waits for `m.st === 'playing'` before the movement step. check 891 + e2e:all 81 grün.
  - Do:
    - Write `tests/unit/art-budget.test.ts` covering all §2.11 file and dimension budgets.
    - Add a `window.__brawl.fps` sample.
    - Run a 20 s iPhone 13 bot match; the lowfx watchdog must not trip.
    - Measure time to first frame against `?art=svg` on desktop Chromium.
  - Accept: the budget test is green, and the numbers are in the Log line. Any overshoot is fixed (lower quality or size) or noted.
  - Test: `npm run check && npm run e2e:all`

- [x] **T47 — CP9 Pilot-Abnahme** · CP: yes
  - Note: side-by-side shots with the bots pinned to the 4 pilots (`?room=shot&bots=4&botf=voltbun,mira,noodle,sudsy&fighter=voltbun`) at desktop 1280×720 and `iPhone 13` (WebKit, landscape), each with and without `&art=svg`: `T47d-0.png`, `T47ds-0.png`, `T47m-0.png`, `T47ms-0.png`, combined into `.loop/shots/T47-compare.jpg` (viewed as the 1 contact sheet). 3D side reads as a different game: textured sand + lagoon bands, coral walls with finger corals, kelp beds, plank piers; SVG side is flat pink/green rects on plain sand. Fighters stay readable at phone zoom in both. Gallery shot `T47g-0.png` viewed: 20 SVG kits + the 4 pilot blockouts side by side. `scripts/serve.sh` up (Tailscale + LAN), `curl -sf http://127.0.0.1:8720/healthz` ok, `npm run check` 891 grün, `npm run e2e` 40 grün. `.loop/checkpoint.md` written (ACTION NEEDED + links + ART-PILOT answer instruction), `.loop/STOP` touched after the commit.
  - Do:
    - Take side-by-side shots, `?art=svg` vs new, on desktop and iPhone 13, with the bots pinned to the 4 pilots.
    - Run `scripts/serve.sh`.
    - Write `.loop/checkpoint.md`:
      - line 1: `ACTION NEEDED: Pilot-Abnahme Art-Upgrade`;
      - then links: gallery, play URL, and the `?art=svg` comparison;
      - then "Antwort: `ART-PILOT: OK` oder Änderungswünsche mit `ART:` in feedback.md".
    - Tick `[x]`, then `touch .loop/STOP` (the runner halts; restarting is the user's or Astra's call).
  - Test: `npm run check && npm run e2e`

### CP10 — "Art-Rollout: volle Crew + Arenen" (model: sonnet)

**Gate:** only when `.loop/feedback.md` has a line starting `ART-PILOT: OK`. Handle `ART:` lines first, in T48.

- [ ] **T48 — Apply pilot feedback**: all `ART:` lines; re-render only the affected ids; mark each line ✓.
- [ ] **T49 — Load sheets on demand**:
  - An atlas loads when its fighter is picked in the select screen or appears in a snapshot. The SVG shows until it has loaded.
  - No eager preload beyond the player's own fighter.
  - Test: e2e + unit (the loader queue de-dupes).
- [ ] **T50 — Critterkin batch A: embercub, mossback** (spec + atlas + LIKENESS row each; one contact sheet per id, view ≤ 2)
- [ ] **T51 — Critterkin batch B: gloomoth, pebblor, dozelump**
- [ ] **T52 — Weavers batch A: pip, brak, ashka**
- [ ] **T53 — Weavers batch B: kip, tobo**
- [ ] **T54 — Saltwind batch A: sable (`dirs: 8`), bisque, nova**
- [ ] **T55 — Saltwind batch B: lenny, fawnsworth**
- [ ] **T56 — Bubblebottom batch A: lumpy, squall, pinchpenny**
- [ ] **T57 — Bubblebottom batch B: hammy, krill, default (Deckhand)**, plus a gallery shot of all 24
- [ ] **T58 — Portraits**:
  - `render_fighter.py --portrait` renders a front bust at 256² to `client/public/art/portraits/<id>.png`.
  - Select cards, the ☰ fighter row and the WANTED posters use them, with skins via `recolorPixels` on a canvas.
  - SVG fallback stays.
- [ ] **T59 — Summons/critters/hazards**: decoy, turret, Purrl, jellies and cannons as sprites (in the `art:fx` atlas or a second one).
- [ ] **T60 — Galleon arena**: ground + props via `art:arena -- galleon` (Kenney Pirate Kit), same rules as T42/T43.
- [ ] **T61 — Lobby/select background**: a blurred Docks render behind the DOM menus (≤ 150 KB).
- [ ] **T62 — CP10 roster check + budgets** · CP: yes
  - Run the budget test over all assets and `npm run e2e:all`.
  - Checkpoint: "CP10 ✅ Neue Optik für alle 24".

### Recurring

- [ ] **T99 — Keep improving (NEVER tick)**
  - Each iteration, when no other `[ ]` task is above:
    1. Pick the highest-value item: `.loop/feedback.md` first, then a `.loop/balance.md` outlier (overall winrate <40% or >60%), then the top of §5 Backlog.
    2. Implement it (≤60 min), with tests and a check.
    3. Remove it from §5 and add one NEW idea at the end of §5.
    4. Write a Log line and commit `T99: <item>`.
  - Every 3rd T99 commit, write `.loop/checkpoint.md`: "Update ✅ <short title>", listing what changed in ≤5 lines.

---
## 4. ROSTER BIBLE (original characters; each line = element · role · visual · attack / special / ult)

**Critterkin** (`#FFC93C`)
1. **Voltbun**: Volt · skirmisher.
   - Visual: round cream-white bunny, teal zigzag ear tips, battery-shaped cotton tail, mischievous grin.
   - Kit: Spark Hop (2 quick short bolts) / Static Dash (dash, Static trail) / Thunder Burrow (dig → pop up at aim point, AoE 0.6 s stun).
2. **Embercub**: Fire · bruiser.
   - Visual: red-panda cub with a glowing ember ring on its tail, soot-smudged nose.
   - Kit: Flame Swipe (melee cone, Burn) / Ember Roll (rolling charge) / Bonfire (zone: burns enemies, heals self).
3. **Mossback**: Leaf · tank.
   - Visual: squat tortoise with a tiny bonsai tree on its mossy shell.
   - Kit: Seed Spit (3-spread, Tangled) / Shell Spin (spinning, −50% dmg taken) / Overgrowth (big root AoE).
4. **Gloomoth**: Air · trickster.
   - Visual: fluffy lavender ghost-moth with lantern antennae.
   - Kit: Dust Puff (short cone, slow) / Phase Flutter (blink + 1 s invisible) / Lantern Swarm (5 homing moths).
5. **Pebblor**: Earth · thrower.
   - Visual: chubby rock chick with a gem crest and tiny wings.
   - Kit: Pebble Lob (arcing AoE, Heavy) / Hunker (turn to stone 1 s, immune) / Avalanche Egg (huge rolling egg).
6. **Dozelump**: Water · tank.
   - Visual: sleepy giant manatee-blob with nightcap and drool bubble.
   - Kit: Belly Bump (melee knockback) / Snooze (heal 40 over 2 s, rooted) / Body Slam (jump to aim, AoE).

**Elemental Weavers** (`#2EC4B6`)
1. **Mira Tidecaller**: Water · controller.
   - Visual: girl with a shell-bead braid, teal parka with wave trim, water ribbon around her hands.
   - Kit: Water Whip (long thin lash, Wet) / Tide Push (cone push) / Maelstrom (pull vortex zone).
2. **Pip Windwhistle**: Air · mobile.
   - Visual: small kid in a sky-blue/white poncho with a paper kite on his back, wild curly hair.
   - Kit: Gust Pellet (knockback shot) / Kite Leap (long dash over obstacles) / Cyclone (moving tornado).
3. **Brak Stonefist**: Earth · tank.
   - Visual: stocky mountain boy, huge stone gauntlets, fur hat.
   - Kit: Rock Toss (heavy slow shot) / Stone Wall (temporary wall) / Quake (3 expanding rings).
4. **Ashka Flameheart**: Fire · DPS.
   - Visual: fire dancer with ember ribbons, red-gold sash, determined brows.
   - Kit: Fire Darts (3 rapid) / Flame Step (dash leaving fire) / Phoenix Ribbon (wide sweeping arc).
5. **Kip Boomer**: Neutral · trickster.
   - Visual: lanky teen with a huge bone-white boomerang and a mud-painted face.
   - Kit: Boomerang (returns, hits twice) / Smoke Pop (smoke zone + speed) / Triple Rang.
6. **Uncle Tobo**: Volt · support.
   - Visual: round jolly uncle with a teapot and a tiny lightning moustache curl.
   - Kit: Hot Tea Splash (cone, small Burn) / Tea Break (heal over time) / Redirect Bolt (huge line bolt).

**Saltwind Crew** (`#E63946`; powers come from Wonderfruits)
1. **Cap'n Noodle**: Neutral · bruiser.
   - Visual: lanky, ate the Taffy-Fruit; seashell tricorn (not straw), teal striped shirt, rubbery grin.
   - Kit: Taffy Jab (long stretchy punch) / Sling Grab (stretch-yank to aim point) / Taffy Typhoon (rapid punch barrage cone).
2. **Sable Tripleblade**: Neutral · melee DPS.
   - Visual: swordswoman with two sabers plus a third blade in a mechanical crab-claw arm, eye patch.
   - Kit: Twin Slash (arc) / Claw Dash Cut / Three-Tide Tempest (spin).
3. **Bisque Legsworth**: Fire · kicker.
   - Visual: pelican chef in a toque, legs only (hands always holding a ladle).
   - Kit: Ladle Kick (melee) / Skillet Rocket Kick (fire dash) / Five-Course Combo (multi-hit).
4. **Nova Chartwind**: Air · controller.
   - Visual: navigator with a compass staff, map-scarf, swirling cloud pet.
   - Kit: Mist Orb (Wet) / Storm Cloud (zone, Wet) / Lightning Chart (bolts on 5 aim spots).
5. **Longshot Lenny**: Neutral · sniper.
   - Visual: tall-tale teller with an enormous slingshot and a gossiping parrot.
   - Kit: Fib Shot (long range) / Decoy Lenny / The Big Fib (giant rubber-duck bomb).
6. **Doc Fawnsworth**: Leaf · healer.
   - Visual: tiny seahorse surgeon in a top hat, ate the Grow-Fruit.
   - Kit: Remedy Dart (dmg enemies / heal allies) / Grow Form (big tank 4 s) / Field Surgery (heal zone).

**Bubblebottom Folk** (`#FF7AA2`)
1. **Sudsy Loofah**: Water · support/controller.
   - Visual: round pink bath loofah, fry-cook apron, spatula, gap-tooth grin.
   - Kit: Bubble Volley (slow bouncing bubbles) / Bubble Trap (encase 1 s) / Mega Bubble (giant trapping bubble).
2. **Lumpy**: Earth · tank goof.
   - Visual: lime-green sea cucumber with a tiny party hat, happily oblivious.
   - Kit: Flop Slap (melee) / Rock Nap (hide under a rock, invulnerable 1.2 s) / Big Nap Quake.
3. **Squall Mopefin**: Air · artist.
   - Visual: grumpy cuttlefish with a dented tuba, beret.
   - Kit: Sour Note (sound cone) / Ink Cloud (blind zone) / Grand Recital (huge pulse).
4. **Boss Pinchpenny**: Earth · bruiser.
   - Visual: greedy blue lobster shopkeeper with a cash-register belly.
   - Kit: Coin Flick (piercing coins) / Claw Clamp (grab + pull) / Register Crush (slam AoE, drops coins).
5. **Hammy Divedome**: Air · diver.
   - Visual: karate hamster in a fishbowl diving helmet, air tank, headband.
   - Kit: Karate Chop (fast melee) / Tank Rocket (dash) / Helmet Pop (bubble field slows enemies).
6. **Teeny Krill**: Volt · gadgeteer.
   - Visual: tiny krill genius in a clunky mech suit, monocle.
   - Kit: Laser Pew / Mini-Turret (summon 6 s) / Mech Max (suit grows, big laser).

Cameo: **Purrl**, a sea snail that meows. Arena critter, backlog item.

---
## 5. IMPROVEMENT BACKLOG (ordered; T99 takes from the top; user feedback goes first)
11. Optional ONLY if the user asks: ComfyUI portraits (127.0.0.1:8188, 2–7 min/img, 16 GB RAM, never while the user is using it).

46. Results auto-start vs Ready: a human who has not tapped Ready still gets the round restarted after the 8 s results wait (`Match.update` `results` case), so a slow tapper loses the rematch. Hold the results a few seconds longer while any connected human is unready (the footer already says "auto-start in Ns"), with a unit test on `Room.readyTally` plus the match with one slow tapper.

47. ☰ fighter row wraps to 13 lines: at the 280 px `.frow` width the 24 buttons (now with a 16 px face) take 13 rows and push Leave down on short phones. Lay the row out as a 3-column grid of face + name (`#menu .frow` in `client/src/ui/ui.css`), so it fits in about 8 rows and the `on` state stays readable.
48. Jelly sting cue: a sting is a plain `hit` with attacker -1, the same as burn and cannon damage, so the client draws no sting of its own. Add a jelly-specific event (or a `jl` hit flag) and a soft zap in `client/src/audio/map.ts`, so a jelly sting reads apart from a burn tick.
49. Best-KO replay has no end-to-end test: `tests/unit/killcam.test.ts` covers the clip, the best-KO rule and the label, but no spec makes the local player the killer and waits for the results. Add a debug op that books a KO with us as attacker, then check that `BEST KO CAM` plays once and the poster waits for it.
50. Most KOs ribbon has no end-to-end test: the ribbon only shows when someone scored a KO in the round, and `kill` is a self-KO with no attacker. Add a debug op that books a KO with us as attacker (shared with #49), then assert `results-mvp` shows "MOST KOS · 1" under our poster.
51. Showdown title names the wrong side: the results title is always "<first row> wins!" (the bounty leader), so a last-standing win by a crew can read as a fighter from the losing crew winning. When `ls` is set, title the poster with that label ("CREW A wins!" or the fighter's name) in `syncResults` (`client/src/ui/results.ts`), with a unit test on the title helper.
52. Bounty coins have no tip: #34 keeps Bounty Brawl (the default) at three tips, so the KO purse and the crown are never explained. Find a one-line home for it (crown label or stats page) rather than a fourth card.
53. Killcam flake, root cause open: #35 made `KillCam.playing(now)` judge the replay on its clock (`replaying` no longer waits for the next `GameScene.update`), but the render-loop stall was never reproduced (0 failures in 24 runs). If the killcam e2e flakes again, log `game.loop.actualFps` and the time of the last `GameScene.update` next to the failure to see whether the loop stopped.
54. Best-run tag: when a round's best KO run beats the saved `bestRun`, the results poster shows a "New best run" tag like the bounty tag (`newBestFor` in `client/src/ui/stats.ts`, a `bestRunKey` next to `bestKey`), so a streak record is celebrated the same way.
55. Emote cooldown ring: the wheel greys out for `EMOTE_COOLDOWN_MS` (1.2 s) but shows no timer, so players cannot tell when the next sticker is ready. Draw a thin ring on each wheel button that fills over the cooldown (`client/src/ui/` emote wheel, driven by the same clock as `emoteReady`), with a unit test on the fill fraction helper.
56. Heal sound: the `heal` event (Remedy Dart, Field Surgery) is silent, the same gap #38 closed for Purrl, because `cueForEvent` has no `heal` case. Give it the soft bubble chime (`bubble` preset in `client/src/audio/sfx.ts`) or its own quiet preset, with a unit test in `tests/unit/audio.test.ts`.
57. Cannon impact colour: the `hit` branch in `client/src/scenes/GameScene.ts` colours the impact from the attacker's element, and a cannon bar has attacker -1, so `getArt` falls back to the first fighter and every bar hit flashes that fighter's colour. For `e.src === 'cannon'`, use the bar orange from `client/src/fx/cannonFx.ts` (`BAR`) with a short splinter burst, with a unit test on the colour helper.

58. Slab bump cue: a knockback or pull that a stone slab stops now halts cleanly (#40), but the victim just slides to a stop with no feedback. Emit a `bump` event when `shove()` is stopped by a solid (`shared/sim/abilities.ts`), and play a short dust puff plus a soft thud in `client/src/audio/map.ts` terms, with a unit test on the event.
59. Predictor and World still default to the docks: `replay()`'s `area` and the predictor's `area` field (`client/src/net/predict.ts`) fall back to `DOCKS_ARENA`, and so does the `World` constructor (`shared/sim/world.ts`). Make the predictor's arena required the way #41 did for the sim helpers, so a galleon client cannot predict on the docks by accident. Decide the `World` default separately, since most unit tests call `new World()`.
60. Debug gate untested: `matchsec` and `tide` reach `RoomManager.join` only when `ALLOW_DEBUG` is set, and that ternary lives in `server/index.ts` (no unit test covers it). Move the `JoinOpts` mapping from the `join` message into a small pure helper (`joinOptsFromMsg(msg, allowDebug)`) and unit-test that production drops both fields.
62. Telegraph pulse: a lane about to fire looks the same for its whole 1 s warning, so the dashes do not say "now". Flash them faster in the last 0.3 s of `CANNON_WARN_SEC` (`drawTelegraph` in `client/src/fx/cannonFx.ts`), with a unit test on the pulse helper.
63. Host toast on phones: #45 checked the desktop viewport only (`client/src/ui/ui.css` `#host-toast` sits 50 px from the top, centred). Take one Pixel 7 shot (`npm run shot -- --device "Pixel 7" --query "room=toastchk&name=A&bots=1"`) with the toast injected, and move it if it overlaps the TIDE/Showdown timer tag or the ☰/🏆 row.

---

## 6. LOG (one line per task/hotfix; archive older lines to `.loop/log-archive.md` if >40 lines)
- T34 ✅ 2026-10-18 — Blender 5.2.2 toolchain: EEVEE headless works (no metal/Workbench fallback needed), selftest 7 s, palette exact, outline + 3 bands ok; 8 tests, check 800 grün
- T99 ✅ 2026-10-18 — Showdown part 2: lobby mode, ring + HUD timer, edge dmg, flood follows ring, bots turn back; 11 tests, check 612 grün, shot ok → §5 #20
- T99 ✅ 2026-10-18 — Crew marks (backlog #8): crew B ring is a double ring (`client/src/fx/crewMark.ts`, rig `setTeam`), so crews differ by shape; status chips already had distinct glyphs; 3 unit tests, check 619 grün, 1× crop only → §5 #22
- T99 ✅ 2026-10-18 — Tips card (backlog #7): first visit shows 3 tips (PC/touch text), 'Got it' or 20 s saves brawl.tutorial, click-through; 4 unit + 1 e2e, check 616 + e2e desktop 21/21 + shot ok → §5 #21
- T99 ✅ 2026-10-18 — Local stats (backlog #9): rounds/wins/KOs/best bounty/favorite in localStorage, counted once per room:round in GameScene, panel from lobby + ☰; 9 unit, check 628 grün, shot ok → §5 #23
- T99 ✅ 2026-10-18 — Bot-Antwort (Backlog #10): Bot mit KO auf Mensch sendet 1/3 der Fälle einen Sticker (`botKoSticker`, `Room.answerKos`), gleicher Cooldown; 4 Tests, check 632 grün
- T99 ✅ 2026-10-18 — Purrl-Suche (Backlog #12): verletzter Bot (<60 % HP), kein Gegner in Sicht, Schnecke <480 u → Zustand `snail` läuft hin (1× Heilung/Leben); 4 Tests, check 636 grün, balance 24/24 in 40–60 % (Chase-Variante drückte Dozelump/Hammy auf 37/39 %, daher nur beim Wandern)
- T99 ✅ 2026-10-18 — Galleon slice 2 (#13): `shared/arena/galleon.ts` layout, 6 unit tests, not wired → §5 #26
- T99 ✅ 2026-10-18 — Bot-Level im ☰-Menü (Backlog #14): Host wählt easy/normal/sharky, `botlevel`-Msg → Room+alle Bots (`BotBrain.setDifficulty`), `bl` in MatchInfo; 3 Tests, check 645 grün, Shot ok → §5 #27
- T99 ✅ 2026-10-18 — Rematch = Ready (backlog #15): Ready-Tap pro Mensch, 10 s nach dem letzten Tap wenn alle bereit, sonst 8 s Auto-Restart; Ready-Button + "Next round in Ns"; 5 Unit + e2e match grün, check 650
- T99 ✅ 2026-10-18 — Skins everywhere (backlog #16): `sk` in results rows, select cards + WANTED posters use `skinnedPortrait` (blob of recoloured SVG), ☰ skin button sends `skin` msg → live; 6 unit tests, check 657 grün, lobby shot ok → §5 #29
- T99 ✅ 2026-10-18 — Bubble storm (backlog #17, slice 2a): `shared/sim/bubbles.ts` (carry up + 0.6× walk, in `stepMove` so prediction agrees), in the weather roll, `bb` snapshot, `dbg wx` op; 14 unit + e2e, check 671 grün, shot ok → §5 #30
- T99 ✅ 2026-10-18 — Kill-cam part 2 (backlog #18): last 0,5 s before the KO at half speed, a tap/click ends the replay (`KillCam.skip`), tag says "tap to skip"; 3 new unit tests (9 total), 1 e2e tap test; check 673 grün, e2e killcam 4/4 grün, banner not shot-checked → §5 #31
- T99 ✅ 2026-10-18 — Lint-Bereinigung (Backlog #19): ungenutzte `eslint-disable`-Zeile aus `tests/e2e/emotes.spec.ts` entfernt, `npm run lint` sauber; check 673 grün → neue Idee §5 #32 (MVP-Band)
- T99 ✅ 2026-10-18 — Showdown part 3 (backlog #20): last-standing finish (`lastSideInRing`, one side inside the closing ring ends the round), outside-ring wash, Showdown rolls no Double Tide; 9 tests, check 682 grün, wash not shot-checked (no clock hook) → §5 #33
- T99 ✅ 2026-10-18 — How to play (backlog #21): ☰ button reopens the tips card (`showTutorial`, same text), ☰ menu scrolls on short screens (was cut off at 720 px, so Leave was unreachable); 1 e2e, check 682 grün, e2e tutorial 2/2 grün → §5 #34
- T99 ✅ 2026-10-18 — Colour-blind palette (backlog #22): ☰ toggle `brawl.cb` (opt-in), `ELEMENT_COLOR_CB` via `elementColor` (sparks, chips, reactions); 5 unit + 1 e2e, check 687 grün, no screenshot → §5 #35 (killcam flake)
- T99 ✅ 2026-10-18 — Stats part 2 (backlog #23): Siegquote pro Kämpfer im Piratenbuch (`wonBy`), „New best bounty“-Tag auf dem Results-Poster (`bestKey`, nur bei echtem Rekord); 4 neue Unit-Tests, check 691 grün, e2e match 4/4 grün, kein Screenshot → §5 #36
- T99 ✅ 2026-10-18 — Streak sticker (backlog #24): third KO of a round sends one room sticker for that fighter (human or bot, once per round, shared emote cooldown, `STREAK_KOS`/`streakSticker` in shared/emotes.ts, `answerStreak` in server/rooms.ts); 3 unit tests, check 694 grün → §5 #37 (cooldown jump)
- T99 ✅ 2026-10-18 — Purrl heal feedback (backlog #25): snail heal is a `purrl` event at the fighter, bubble ring + "+N" pop on them; 1 new unit test, check 695 grün → §5 #38 (Purrl chime)
- T99 ✅ 2026-10-18 — Galleon part 3a (#26): `shared/arena/arena.ts` Arena, `World(arena)` spawns/obstacles, cannon volleys hit once each (`CANNON_DMG` 30); 7 tests, check 702 grün → §5 #26 (3b rest), #39 (cannon hit cause)
- T99 ✅ 2026-10-18 — Galleon part 3b (#26): bots steer + spawn on `World.arena`, dash/burrow/shove use its scenery; 2 tests, check 704 grün → §5 #26 (3c), #40
- T99 ✅ 2026-10-18 — Galleon part 3c-1 (#26): `Arena` gets id/shallows/bushes, tide, kelp, snail + predictor use the match's arena, `MatchInfo.ar`; 5 tests, check 709 grün → §5 #26 (3d), #41
- T99 ✅ 2026-10-18 — Galleon part 3d-1 (#26): `join.arena` picks the room's layout at creation (`arenaById`, unknown = docks), `Room` builds its `World` on it; 5 tests, check 714 grün → §5 #26 (3d-2), #42
- T99 ✅ 2026-10-18 — JoinOpts (backlog #42): `RoomManager.join(ws, opts)` takes one `JoinOpts` object, `server/index.ts` is the only production call site, 6 test files moved over; check 778 grün, serve.sh + smoke ok → §5 #60
- T35 ✅ 2026-10-18 — Voltbun 3D stills: spec + earsLong/tailBattery/face(hurt), part pivots, gold collar, HSV toon shadow; S 100 px, E 106 / bottoms 115–118 → T36
- T36 ✅ 2026-10-18 — puppet.py (biped/blob/hover, ground snap) + Voltbun atlas 70 frames 1022×525 157 KB indexed, feet y=113 all; check 813 grün
- T37 ✅ 2026-10-18 — rig plays Voltbun sheet (8 facings, hysteresis, hurt frame, lazy skin atlases), botf, y-sort; check 824 + e2e 34 grün
- T38 ✅ 2026-10-18 — Mira atlas (torus prim + waves, hood/rim/braid/ribbons), 70 frames ~158 KB, feet y=113; check 831 grün
- T39 ✅ 2026-10-18 — Noodle atlas (torus `lag` → tricorn brim, grin mouth, lanky biped), 70 frames 173 KB, feet y=113; check 837 grün
- T40 ✅ 2026-10-18 — Sudsy atlas (blob pouf, nubs, bubbles, apron, overhead spatula chop, gap teeth), 136 KB, feet ok; check 843 grün
- T41 ⏭ 2026-10-18 — skipped: Comfy Desktop no answer on :8188/:8000 within 3 min; `npm run comfy` + seamless lib kept; check 846 grün
- T42 ✅ 2026-10-18 — Docks ground: render_arena.py top-down 1800×1200 jpg 121 KB, sat p95 39 %, piers/pads, beds, contact shadows; ?rects=1; check 856 + e2e 34 grün
- T43 ✅ 2026-10-18 — Docks props atlas (procedural coral/barrel/crate/kelp, 35° + depth stretch), 14 frames 144 KB, y-sort; check 867 + e2e 36 grün
- T44 ✅ 2026-10-18 — Water: seamless Blender caustics tile 21.6 KB, masked lagoon scroll, toon flood pools (foam/ripples), still in lowfx; check 880 + e2e 39 grün
- T46 ✅ 2026-10-18 — Budget+Perf: alle §2.11-Budgets im Unit-Test (FX 9,6 KB, Pilot-Download 1,03/2,5 MB, GPU ~22/50 MB); `__brawl.fps` + `npm run perf`: Desktop erster Frame 977 ms vs SVG 822 ms, iPhone 13 20 s Median 59,7 fps (min 55), lowfx nicht getrippt; check 891 + e2e:all 81 grün
- T47 ✅ 2026-10-18 — CP9-Abnahme: 4 Shots 3D vs `?art=svg` (Desktop + iPhone 13), Galerie-Shot, serve.sh + healthz ok, Checkpoint + STOP gesetzt; check 891 + e2e 40 grün
- T45 ✅ 2026-10-18 — FX-Atlas (`npm run art:fx`): 8 Loot-/Projektil-Sprites, 254×260, 9,6 KB, Sprite-Pool + Painter-Fallback, `?art=svg` unverändert; `shot.mjs` schießt Handys jetzt im Querformat; 4 Unit, check 884 + e2e 39 grün
