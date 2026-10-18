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
  - Note: three kits in `shared/fighters/{gloomoth,pebblor,dozelump}.ts`. Gloomoth: Dust Puff (melee cone + Heavy 2 s) / Phase Flutter (burrow/blink 250 u, 0.8 s untargetable) / Lantern Swarm (5 homing moths). Pebblor: Pebble Lob (lob over walls, landing AoE 95 + Heavy) / Hunker (`buff dmgMul 0` = 1 s immune) / Avalanche Egg (piercing boulder). Dozelump: Belly Bump (wide shove) / Snooze (heal 40, `speedMul 0` = rooted 2 s) / Body Slam (burrow onto the aim, AoE 150). New generic bits: projectile `homing` (steer toward the nearest enemy, `shared/sim/world.ts` `steer()`, 6 rad/s, 340 u) and `aoeOnEnd.status` so a lob can land a status; `buff` now honours `speedMul 0`/`dmgMul 0` (`!== undefined`) and `damage()` returns early on 0 damage. 11 tests in `tests/unit/critterkin.test.ts`; gallery shot T29-0 shows all three (name plates still overlap the faction badge — T33). Also de-flaked `tests/unit/teams.test.ts` (unseeded bot aim jitter).
- [x] **T30 — Weavers: Ashka Flameheart, Kip Boomer, Uncle Tobo** (boomerang = projectile `returns:true`, can hit twice)
  - Note: three kits in `shared/fighters/{ashka,kip,tobo}.ts`. Ashka: Fire Darts (3 needle volley) / Flame Step (dash + burning trail) / Phoenix Ribbon (210° melee arc, Burn 2.5 s). Kip: Boomerang (new projectile `returns:true` + `returning`: turns around at the end of `left`, steers home, clears its hit list → hits the same enemy again; dies when it reaches its owner) / Smoke Pop (aoe at self + new `AoeAbility.selfSpeedMul` → 1.5× speed while the cloud stands) / Triple Rang (3 returning boomerangs). Tobo: Hot Tea Splash (cone + Burn) / Tea Break (self-heal zone, 8 HP per ½ s tick over 3 s) / Redirect Bolt (piercing 1500 u/s line bolt + Static). Bot: a self-heal special (`aoe` at self with `selfHeal`) is now pressed when HP < 75 %, same fix class as the T29 buff rule. 11 tests in `tests/unit/weavers-cp8.test.ts`; gallery shot T30-0 shows all three (name plates still overlap the faction badge — T33).
- [x] **T31 — Saltwind: Nova Chartwind, Longshot Lenny, Doc Fawnsworth** (new primitive `summon{decoy|turret}` if needed; heal on ally)
  - Note: three kits in `shared/fighters/{nova,lenny,fawnsworth}.ts` (art SVGs + hurt frames were already in `client/public/art/`). Nova: Mist Orb (`element:'water'` + Wet 3 s) / Storm Cloud (`aoe` zone that wets everyone under it) / Lightning Chart (new `AoeAbility.strikes` + `strikeSpreadDeg` → 5 separate strike circles fanned 100°, each its own delay, 22 dmg, volt). Lenny: Fib Shot (1200 u/s, 950 range, 24 dmg, 2 ammo) / Decoy Lenny (`summon{type:'decoy'}`, HP 70, 5 s) / The Big Fib (`lob` + `aoeOnEnd` 130 r, 34 dmg). Fawnsworth: Remedy Dart (projectile `allyHeal 20` — patches a teammate it reaches and dies there, still 12 dmg to an enemy) / Grow Form (`buff dmgMul 0.5` + heal 10, 4 s) / Field Surgery (`aoe at self`, `allyHeal 9` per ½ s tick over 3 s). New primitives: `shared/sim/summons.ts` (`stepSummons`: lifetime, turret target search + shots, removal; decoys block enemy projectiles while a crew's shot passes through, `world.stepProjectiles` checks `this.summons` after walls) plus turret `status`/`statusSec` so a volt turret statics — T32's turret only needs a data def now; snapshot gains `sum[]` and `Summon` carries `team` for `sameTeam` targeting; client draws decoys (`GameScene.drawSummon`: straw body + painted grin) and turrets (plinth + barrel) with HP bars, and new `heal` event → green `+n` (`CombatFx.heal`). 15 tests in `tests/unit/saltwind-cp8.test.ts` (incl. the turret primitive); gallery shot T31-0 shows all three legible. `npm run check`: 32 files / 466 tests green, ip-check ok. 40 s headless bot match with the new kits ran clean (no summon leaks, KOs land).
- [x] **T32 — Bubblebottom: Lumpy, Squall Mopefin, Teeny Krill** (turret via `summon`)
  - Note: three kits in `shared/fighters/{lumpy,squall,krill}.ts` (art SVGs were already in `client/public/art/`). Lumpy: Flop Slap (85° melee + Heavy 1.5 s) / Rock Nap (`buff dmgMul 0` + `speedMul 0`, 1.2 s — nothing gets through, and he cannot walk) / Big Nap Quake (`aoe at self`, 250 r, 30 dmg + shove + Heavy). Squall Mopefin: Sour Note (100° cone, 70 knockback, no status = pure air) / Ink Cloud (new `AoeAbility.hides` → `Zone.hides`, so `shared/sim/visibility.ts` filters everyone standing inside it exactly like kelp/steam; zoneSec 3.5 + tickDmg 2) / Grand Recital (`aoe at self`, 290 r, push 160). Teeny Krill: Laser Pew (1150 u/s, Static) / Mini-Turret (`summon{type:'turret'}`, 6 s, 0.6 s shots, Static — pure data on the T31 primitive) / Mech Max (780 range piercing beam, 30 dmg). 10 tests in `tests/unit/bubblebottom-cp8.test.ts`; gallery shot T32-0 shows all three legible (name plates still overlap the faction badge — T33). `npm run check`: 33 files / 476 tests green, ip-check ok.
- [x] **T33 — Roster polish + rebalance** · CP: yes
  - Note: select screen: faction tabs (`ftab-all|critterkin|weavers|saltwind|bubblebottom`, filter via `hidden`, cards stay mounted) + 🎲 Random (`fighter-random`, persists via `saveFighter`, jumps back to "All" and scrolls the card into view), the existing `blurb` is now the card bio (2-line clamp in `client/src/ui/ui.css`), grid is a `pan-y` scroll box (`max-height: min(50vh, 420px)`, 58vh/360px on short screens); `mountFighterGrid` now owns a `.select` wrapper, lobby markup points at `[data-testid=fighter-select]`. Rebalance: `npm run balance` full pass (2760 1v1s + 20 FFA, 38 s) driven from **18 → 1 → 0 outliers** in three passes — all 24 kits inside 40–60 % (42–56 %); per-kit numbers recorded in the `EDITS` history in `scripts/lib/balance.ts`, the six unit suites that pin damage numbers updated to the new values. Gallery: name plate + faction line moved into their own 42 px band (they used to overlap each other and the 48 px sprites) and the 48 px check moved to the top-right corner — shot `T33-gallery2-0.png` reads clean. PWA: `client/public/manifest.webmanifest` + `scripts/gen-icon.mjs` (zlib-only PNG writer → `icons/icon-192.png`, `icon-512.png`, `maskable-512.png`) + pass-through `client/public/sw.js` (registered in `main.ts` on `import.meta.env.PROD`) + manifest/theme-color/apple-touch-icon tags in `client/index.html`; 8 new tests in `tests/unit/select.test.ts` (bios, card markup, manifest/icons/PWA hooks) and a 4th `tests/e2e/select.spec.ts` case for tabs + dice. `npm run check` 34 files / 483 tests green, `npm run e2e:all` 34/34 green, healthz ok.
  - Do: character select with faction tabs and a "Random" button, short bios, a mobile-friendly scroll; `npm run balance` full pass; gallery review of all 24 (one shot, fix the worst 2 readability problems); PWA manifest + generated icon so the game can be "added to home screen".
  - Checkpoint: "CP8 ✅ 24 Kämpfer", plus tips on what's fun to try.
  - Test: `npm run check && npm run balance -- --quick && npm run e2e:all`

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

44. Cannon warning cue: a volley's telegraph and bar are drawn (`client/src/fx/cannonFx.ts`) but silent. Play a short warning tick the first time a lane shows `st: 'warn'` in `snap.cn`, and a thud when it turns to `fire`, in `client/src/audio/map.ts` terms (kept quiet, one cue per volley per lane).
45. Host hand-over toast: the bot controls now follow the host role (`MatchInfo.host`), so when the host leaves and the next player becomes host their ☰ menu unlocks silently. Show a one-line toast "You host this room now" on that change (client compares `host` between snapshots), so the newly enabled controls are explained.
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
61. Galleon tips on a direct link: a `?room=…&name=…` link that joins an existing room mounts the tips card from `params.get('arena')` (`client/src/main.ts`), but the room keeps its own arena, so a link without `arena=` shows the docks card on a galleon match. Mount the card from the first snapshot's `m.ar` instead (or re-check on the first `m`), with a unit test on the arena pick.

---

## 6. LOG (one line per task/hotfix; archive older lines to `.loop/log-archive.md` if >40 lines)
- T99 ✅ 2026-10-18 — Galleon tips (backlog #43): `tutorialTips`/`showTutorial`/`mountTutorial` take the arena; galleon heading 'Welcome aboard the galleon' and a 'Deck cannons' tip replace kelp & tide; menu ☰ passes `net.last.m.ar`; 3 unit tests, check 781 grün → §5 #61
- T99 ✅ 2026-10-18 — Required arena lists (backlog #41): `waterRects`/`inWater`/`waterSpeedMul`, `inBush`/`canSee`, `stepPurrl`, `stepMove` take their list with no docks default (`stepMove` base moved before the optional params); compile-time guard test, check 778 grün → §5 #59
- T99 ✅ 2026-10-18 — Knockback stops at slabs (backlog #40): `shove()` walks 6 u steps against `solids(h)` (scenery + walls), burrow landing too; 1 unit, check 776 grün → §5 #58
- T99 ✅ 2026-10-18 — Cannon thud (backlog #39): `hit` event carries `src: 'cannon'` (`damage(…, slot, src)`), client cue `cannon` (sine 150→45 Hz + low noise) instead of the heavy bonk; 1 world + 1 audio test, check 775 grün → §5 #57
- T99 ✅ 2026-10-18 — Skins slice 2: `join.skin` → room → `world.setSkin` → snapshot `sk`; lobby Skin button (localStorage); rig `setSkin` with async `addtexture` fallback, skin copies from recoloured SVG text; gallery shows both swaps; 4 unit tests, check 574 + e2e 19/19 + shot ok
- T99 ✅ 2026-10-18 — Weird Weather slice 1: `shared/sim/weather.ts` (Double Tide = tide clock ×2, 50 % roll per round in `server/rooms.ts`), `wx` in MatchInfo, HUD tag; 8 unit tests, check 581 grün; Jelly/Bubble → §5 #17
- T99 ✅ 2026-10-18 — Kill-cam (backlog #5): own KO replays the 2 s before it (`net/killcam.ts`, `Net.buffer` kept 3 s by age), camera on the killer, "KO CAM · name" tag, events muted during replay; 7 unit + 1 e2e, check 588 + e2e desktop 20/20 grün; banner not screenshot-checked → §5 #18
- T99 ✅ 2026-10-18 — Showdown slice 1: `shared/sim/showdown.ts` ring 1000→260 u (30–150 s), tide tracks shrink, edge dmg; 11 tests, check 599 grün; wiring → §5 #6
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
