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

21. Tips card on demand: the first-visit tips (`client/src/ui/tutorial.ts`, shown once via `brawl.tutorial`) can't be reopened today. Add a "How to play" button to the ☰ menu that mounts the same card again, and reuse `tutorialTips(touch)` so the text stays in one place.
22. Colour-blind palette option in the ☰ menu: a shape-first set (crew rings and status chips already differ by shape; the element colours and the reaction popups still rely on hue alone). `client/src/fx/style.ts` holds the palette, so the option only swaps values there.
23. Stats part 2 (slice 1 = `client/src/ui/stats.ts`, counted per finished round, panel in the lobby and the ☰ menu): win rate per fighter in the panel, and a "new best bounty" tag on the results poster (the round's bounty is already in `res`, compare it with the saved best before counting).
24. Streak sticker: a fighter with three KOs in one round gets a bubble from the room (same four stickers, shared cooldown) so a streak reads above the body.
25. Purrl heal feedback: when the snail heals a fighter, a small bubble ring and a "+10" pop show on that fighter (today the heal is silent apart from the number in the event list), so humans learn that the snail heals them too.
26. Taffy Galleon, part 3 (slice 2 = `shared/arena/galleon.ts`: deck obstacles, spawns and four rail cannons, unit-tested, not wired): `World`, bots and prediction take an arena instead of the docks constants, the cannons come from `GALLEON_CANNONS` and damage bodies once per volley (`volleyHits` + `k`), rocking deck art in `client/src/art/arena.ts`.
27. Host-only bot controls: non-hosts see the ☰ bot count and level buttons but tapping them does nothing (the server ignores them). Send an `host` flag in the match info and grey out the bot and level rows for non-hosts, with a 'host only' hint.
28. Ready count on the results screen: the poster shows "2/3 ready" (a `rd` count in MatchInfo, from `Room.rematch`'s ready set) so players see who the round is waiting for, and the footer shows "Next round in Ns" only once the round is ready.
29. Portraits in the ☰ fighter row: the row is text-only, so a skin change shows on the body and nowhere else in the menu. Give each button a small portrait via `skinnedPortrait` (`client/src/art/skinPortrait.ts`) at the picked skin, and keep the `on` state from `markFighterRow`.
30. Weird Weather part 3 (slice 2a = bubble storm: `shared/sim/bubbles.ts`, carry + slow in `stepMove`, `bb` snapshot, predicted, `dbg wx` op): jellyfish rain as a third `Weather` entry, drifting stinging jellies that dash through the open sand, with their own sim hook and a shot check.
31. Kill-cam part 3 (the remaining piece of old #18; slow motion and tap-to-skip are done in `client/src/net/killcam.ts`): the killer's own best KO also gets a short replay, so a KO you were in is seen again after the round. Reuse the 2 s lead-up and `KillCam.start`, and tag it "BEST KO CAM".
32. MVP tag on the results poster: the round's top KO fighter gets a "MOST KOS" ribbon under the WANTED poster, so a round with no bounty winner still names a standout. Count KOs per player per round on the server (the same place bounty is counted) and send them in `res`, then unit-test the tie rule (the earliest KO wins).
33. Showdown finish banner: when the last-standing rule ends a round early, the results poster says "LAST STANDING · <crew or name>" above the table, so an early finish reads as a win and not as a cut-off timer.

---
## 6. LOG (one line per task/hotfix; archive older lines to `.loop/log-archive.md` if >40 lines)
- T15 ✅ 2026-10-18 — Prozedurales Audio (11 Presets, Distanz-Dämpfung, iOS-Unlock, Shanty-Loop, ☰ Sound/Music-Toggles, cast-slot für Ult-SFX); cp1-e2e-Position aus dem Busch; check+e2e grün
- T19 ✅ 2026-10-18 — Bounty Brawl: 100-Start, KO-Purse 50+50 %, +100 Bounty, 3 Münzen, Krone+WANTED-Marker, WANTED-Poster-Results; check+339 Tests+e2e 15/15 grün
- T17 ✅ 2026-10-18 — Elemente/Statuses: 6-Reaktions-Tabelle, Burn-Tick, Mud-Root, Steam-Cloud, st-Bitmaske, Status-FX+Reaktionsworte; check grün
- T18 ✅ 2026-10-18 — Rising Tide: 35/5/15/5-Zyklus, Flut-Rects + Wading-Slow/Wet, Schock-Kette, Low-Tide-Chests+Pickups, Tide-Meter+Hupe; 13 Tests grün
- RF ✅ 2026-10-18 — Review 042545: Edge-Cadence (quantized dir, EDGE_MS=TICK_MS), Burn-KO, Ability-Element-Fallback, Chest-Seeding, T20-Spec+Logs; 356 Tests+e2e 15/15 grün
- T20 ✅ 2026-10-18 — Fraktions-Passives (EVOLVE/FLOW/PLUNDER/TOON LOGIC) im Sim + Aura/Krone/Ribbon/Münzen/Pancake-FX, Passiv-Zeile auf den Karten; CP5, check+347 Tests+smoke+e2e grün
- T21 ✅ 2026-10-18 — Embercub+Mossback-Kits (Zone-SelfHeal/Tick-Burn, Root-AoE, Buff-DmgMul), 8 neue Tests, check+364 Tests+shot grün
- T22 ✅ 2026-10-18 — Pip+Brak-Kits (Gust-Pair, Kite-Dash, Pull-Zone; Wall-Primitive `shared/sim/walls.ts`), 14 neue Tests, check+378 grün
- T23 ✅ 2026-10-18 — Sable+Bisque-Kits (breiter Saber-Arc, Claw-Dash, Spin-Ult; Fire-Dash-Trail, 5-Gang-Combo-Cone), 8 neue Tests, check+386+shot grün
- T28 ✅ 2026-10-18 — Crew Combos (Element-Paarnamen, +40 % Burst, 1,5 s/300 u, `slot` bis ins Damage-Chokepoint), KO-Kamera folgt Killer, Results Rematch/Change fighter; CP7, 428 Tests+e2e grün
- T25 ✅ 2026-10-18 — Balance-Harness (`npm run balance`, --quick 1 s): 12×12-Paare ×10 Seeds ×60 s + FFA×20, `.loop/balance.md`; Bot-Nahkampf-Fix (prefRange aus der eigenen Reichweite); 3 Balance-Pässe, Outliers 11→5; CP6, 397 Tests+e2e 15/15+healthz grün
- T27 ✅ 2026-10-18 — Treasure Tide: Sunken Chest spawnt alle 7 s eine Münze, getragene Münzen fallen bei KO, ≥10 Münzen starten 15 s Escape-Countdown (reset bei Verlust), HUD-Crew-Balken + Banner, Bot-Rollen carry/collect/escort; 13 neue Tests, check 420+e2e 15/15 grün
- T26 ✅ 2026-10-18 — Teams: RoomMode (bounty|treasure) Lobby→Join→Room, autoTeams (sticky, Humans gespreizt), kein Friendly Fire (damage/Projektil/Ability/Element/Bot-Ziel), Crew-Ring+Ally-Namen, Bots regroup; 407 Tests+e2e 15/15 grün
- T30 ✅ 2026-10-18 — Ashka (Fire Darts/Flame Step/Phoenix Ribbon), Kip (Boomerang `returns`-Primitive, Smoke Pop `selfSpeedMul`, Triple Rang), Uncle Tobo (Hot Tea Splash/Tea Break/Redirect Bolt); Bot nutzt Self-Heal-Special; 11 Tests, check 451+shot grün
- T31 ✅ 2026-10-18 — Nova (Mist Orb/Storm Cloud/`strikes`-Lightning Chart), Lenny (Fib Shot/Decoy via `summon`/Big Fib-Lob), Doc Fawnsworth (`allyHeal`-Dart, Grow Form, Field Surgery); `shared/sim/summons.ts`-Primitive (decoy/turret, Snapshot `sum[]`, Client-Draw + Heil-FX); 15 Tests, check 466+shot grün
- T32 ✅ 2026-10-18 — Lumpy (Flop Slap/Rock Nap-Immunität/Big Nap Quake), Squall Mopefin (Sour Note/Ink Cloud via neuem `AoeAbility.hides`/Grand Recital), Teeny Krill (Laser Pew/Mini-Turret-Summon/Mech-Max-Pierce); 10 Tests, check 476+shot grün
- T33 ✅ 2026-10-18 — Roster-Politur: Fraktions-Tabs + 🎲 Random + Bios + Scroll-Grid, Balance-Vollpass 18→0 Outliers (alle 24 in 40–60 %), Galerie-Textband fix, PWA-Manifest+Icons+SW; CP8, 483 Tests+e2e 34/34+healthz grün
- T99 ✅ 2026-10-18 — Emote-Rad: 4 Sticker (`shared/emotes.ts`, Index + 1,2 s Cooldown im Room), DOM-Rad oben rechts (Taste 1–4/V), Blase über dem Kämpfer; 4 Unit + 4 e2e-Tests, check 488 grün, Shot ok
- T99 ✅ 2026-10-18 — Purrl-Schnecke (Backlog #1): `shared/sim/purrl.ts` wandert über Sand (seeded, meidet Korallen+Flut), heilt +10 einmal pro Leben (Respawn setzt zurück), Snapshot `purrl`, Client-Zeichnung; 9 Unit-Tests, check 497 grün, kein Live-Shot (kein Teleport-Hook)
- T99 ✅ 2026-10-18 — Taffy Galleon slice 1: `shared/sim/cannon.ts` (Kanone: 1 s Telegraph, wandernde Leiste, Zeit-pure Treffer, Aim-Winkel); 8 Unit-Tests, check 505 grün; Arena-Rest → §5 #13
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
