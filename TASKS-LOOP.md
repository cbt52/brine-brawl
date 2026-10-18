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
  - Do:
    - `client/src/input/touch.ts`:
      - left floating move stick;
      - right aim stick: drag shows an aim line/cone, release fires toward the aim, a quick tap (<150 ms, <12 px) auto-aims;
      - Special button (with cooldown ring) and Ult button (charge ring, glows when ready).
    - The same UI scales with the safe area (`env(safe-area-inset-*)`).
    - Portrait mode shows a "rotate your phone" overlay.
    - Fullscreen button only where `requestFullscreen` exists (Android).
    - `navigator.vibrate?.(30)` when hit.
    - Block iOS double-tap zoom, long-press menus and text selection.
    - Desktop: E/RMB = special, Q/Space = ult (no-op until abilities exist; send the flags anyway).
    - `tests/e2e/helpers/touch.ts`: CDP `Input.dispatchTouchEvent` drag helper.
    - `tests/e2e/mobile.spec.ts` (project `mobile`): dragging the left stick moves the player, a right tap fires (ammo decreases).
    - Visual check of the stick layout with `npm run shot -- --name T04 --device "iPhone 13" --query "room=shot"`.
  - Test: `npm run check && npx playwright test --project=mobile`

- [x] **T05 — Bots**
  - Do:
    - `shared/sim/bot.ts` `class BotBrain { constructor(id, difficulty); think(world, dt): Input }`:
      - states wander → chase → kite at preferred range → flee when HP <30% (toward far spawn);
      - aim lead with error by difficulty (easy ±18°, normal ±9°);
      - reaction delay 250/150 ms;
      - strafes while shooting;
      - avoids walls with simple whisker rays.
    - Server: bots are World players with `bot:true` and fun names (Bot Barnacle, Captain Crumb, Sir Soggy…).
    - `bots` from join msg/URL `?bots=N` (0–7). The first human sets it; the room keeps total ≤8 (bots leave when humans join).
    - Debug `dbg{op:'bots',n}`.
    - Unit tests: a bot approaches a target and fires within 3 s of sim; a bot flees at low HP.
    - Smoke: room with 1 ws client + `bots=3`, 20 s → at least one hit event where `a` is a bot.
  - Test: `npm run check && npm run smoke`

- [x] **T06 — Lobby & invite flow (DOM overlay)**
  - Done: lobby (title wobble, name prefilled from localStorage), Quick Play / Create Room / Join-with-code
    (bare code or pasted link), invite panel with clipboard fallback + share, ☰ menu (invite, ±Bot host-only, Leave),
    invite links always ask first. 6 desktop + 7 mobile e2e green.
  - Do:
    - `client/src/ui/` DOM overlay with cartoon CSS. Font Lilita One via `npm i @fontsource/lilita-one` (OFL → add to ASSETS.md).
    - Title "BRINE BRAWL" with a wobbly CSS animation.
    - Name input (localStorage).
    - Buttons (all with `data-testid`):
      - **Quick Play** → room `qp-<rand4>` with bots=3;
      - **Create Room** → room `<adjective>-<sea-noun>-<rand2>` (e.g. `soggy-clam-42`) with bots=0, plus an invite panel;
      - **Join with code**.
    - Invite panel shows the full URL `location.origin + '/?room=…'`:
      - Copy button tries `navigator.clipboard` and falls back to select + `execCommand('copy')`, then "long-press to copy". (HTTP over Tailscale/LAN is not a secure context.)
      - `navigator.share` only if it exists.
    - Opening `?room=xyz` shows "Join room xyz" with the name field and goes straight in.
    - In-game ☰ menu: Copy invite link, +Bot/−Bot (first human = host), Leave.
    - e2e: click Quick Play → canvas visible and `__brawl.state().players.length ≥ 4`. Create Room → invite URL contains `?room=`.
  - Test: `npm run check && npm run e2e`

- [x] **T07 — Match flow, HUD, scoreboard** · CP: yes
  - Done: `server/match.ts` (waiting → countdown 3 s → playing 150 s → results 8 s), snap `m`, HUD in its own
    Phaser scene (timer, KOs, kill feed, 3-2-1-BRAWL, waiting panel, Tab/🏆 scoreboard), DOM results overlay with
    confetti, `?matchsec=` debug override. 4 unit + 3 e2e tests; touch tap fix (motionless release now fires).
  - Do:
    - Room state machine in `server/match.ts`: `waiting` (<2 combatants) → `countdown` 3 s → `playing` 150 s → `results` 8 s → `countdown`…
    - Late joiners join a running match. Scores reset each match. FFA winner = most KOs (tie → fewer deaths).
    - HUD (Phaser, fixed to camera): timer, own KOs, kill feed (last 4), big countdown "3-2-1-BRAWL!", "waiting for players – share link / add bot" panel.
    - Scoreboard: hold Tab / tap 🏆.
    - Results overlay (DOM): ranking with names and KOs, winner confetti.
    - Unit tests for state transitions with a fake clock.
    - e2e: with `?bots=3&matchsec=10` (ALLOW_DEBUG only override) the results overlay appears within 20 s.
  - Checkpoint: "CP2 ✅ Handy + Bots + Einladen". Quick Play alone, Create Room → send link to a friend, phone controls.
  - Test: `npm run check && npm run smoke && npm run e2e:all`

### CP3 — "Die ersten 4 Kämpfer (je 1 pro Welt)"

- [ ] **T08 — Data-driven fighters + ability primitives**
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

- [ ] **T09 — SVG art pipeline, animation rig, gallery**
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

- [ ] **T10 — Kits: Voltbun + Mira Tidecaller**
  - Do: data and hooks per §4, plus FX keys. Mira's whip = melee arc with a long thin range. Tide Push = aoe cone push. Maelstrom = aoe pull zone. Voltbun's Static Dash = dash with a trail zone. Thunder Burrow = become untargetable for 0.6 s, reappear at the aim point, aoe stun.
  - Unit tests: each ability hits as designed. Bots pick these fighters at random.
  - Test: `npm run check && npm run smoke`

- [ ] **T11 — Kits + art: Cap'n Noodle + Sudsy Loofah**
  - Do:
    - SVGs and kits per §4.
    - Noodle's Taffy Jab renders a stretchy arm (thick bezier line, shoulder → fist) for 150 ms.
    - Sling Grab moves Noodle toward the aim point and stops at walls/enemies (bonus dmg).
    - Sudsy's Bubble Trap = projectile that applies `trapped` (no move/attack, 1.0 s, breaks early on 25 dmg) and renders a bubble around the target.
    - Mega Bubble = slow big projectile that traps everything it touches.
    - Gallery shot shows all 4.
  - Test: `npm run check && npm run smoke && npm run shot -- --name T11 --path /gallery.html`

- [ ] **T12 — Character select** · CP: yes
  - Do:
    - Lobby "Choose Fighter" grid: card = SVG portrait + name + faction badge + element icon + role + 3 stat bars (HP/Speed/Damage derived from data) + one-line attack/special/ult blurbs.
    - Choice is saved to localStorage and sent in join. An in-game menu button changes the fighter on the next respawn (`dbg`-free normal message `pick{fighter}`).
    - Bots pick random fighters.
    - e2e: select Mira → own `f === 'mira'`.
    - Mobile shot of the select screen.
  - Checkpoint: "CP3 ✅ 4 Kämpfer", listing the 4 fighters with a one-line description each.
  - Test: `npm run check && npm run e2e`

### CP4 — "Juice: fühlt sich gut an"

- [ ] **T13 — Game feel & FX**
  - Do: `client/src/fx/` with:
    - generated particle textures (circle, star, bubble, spark, ring);
    - muzzle flash, impact ring and element-colored sparks, footstep dust;
    - hitstop (freeze victim sprite 50 ms);
    - screenshake on own hit/KO (setting, reduced on mobile);
    - damage numbers with pop and float (crit-size for >25);
    - KO poof cloud with orbiting stars;
    - ult-ready glow; low-HP red vignette pulse;
    - particle budget cap, with auto `lowfx` when FPS <45 for 3 s (also `?lowfx=1`).
  - Test: `npm run check && npm run shot -- --name T13 --query "room=shot&bots=5" --wait 6000`

- [ ] **T14 — Arena art + bushes**
  - Do:
    - Background drawn once into a RenderTexture: sand island, lagoon water with animated wave lines (tweened graphics), wooden pier planks, coral walls matching the collision rects, barrels/crates decor, edge vignette.
    - Kelp bushes: players inside are invisible to enemies unless within 200 u or they just attacked (1 s reveal). Implement as per-client snapshot filtering on the server; bots respect it.
    - Own player in a bush is semi-transparent.
    - Unit test for the visibility filter.
  - Test: `npm run check && npm run shot -- --name T14 --query "room=shot&bots=3" --device "iPhone 13"`

- [ ] **T15 — Audio (procedural, no files)**
  - Do:
    - `client/src/audio/sfx.ts` WebAudio synth (oscillators + noise + envelopes). Presets: shoot, zap, splash, bonk, whip, bubble-pop, ko, ult, pickup, countdown, horn.
    - Mapped to snapshot events, with distance attenuation.
    - Unlock on first input (iOS).
    - Simple original sea-shanty loop music (8-bar step sequencer, triangle + square bass), low volume.
    - Menu: SFX/music toggles in localStorage.
    - Unit test: event → preset mapping (pure function).
  - Test: `npm run check && npm run e2e`

- [ ] **T16 — Client prediction + net diagnostics** · CP: yes
  - Do:
    - Own player predicted with the shared movement step. Keep unacked inputs and re-apply them after each snapshot (reconcile). Smooth error correction (blend over 100 ms; snap if >120 u).
    - Ping display (`ping`/`pong` every 2 s) in the corner.
    - `?lag=ms` adds simulated latency to client send/receive (test only).
    - Unit tests: reconcile converges and replays inputs correctly.
    - e2e: with `?lag=150`, own position changes within 50 ms of keydown.
  - Checkpoint: "CP4 ✅ Juice": effects, sound (toggle in ☰), arena with kelp hiding spots, smoother movement.
  - Test: `npm run check && npm run e2e`

### CP5 — "Überraschung: Gezeiten, Elemente, Kopfgeld"

- [ ] **T17 — Elements, statuses, reactions**
  - Do:
    - `shared/sim/elements.ts`: statuses and a reaction table per §2.7. Abilities apply their fighter's element (ability-level override allowed).
    - Snapshot `st` bitflags.
    - Client: small status icons above heads, tint overlays (wet = blue drips, burn = flicker), reaction popup words with a big bounce and a distinct sfx.
    - Table-driven unit tests for all 6 reactions.
  - Test: `npm run check`

- [ ] **T18 — Rising Tide**
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

- [ ] **T19 — Bounty Brawl + WANTED poster**
  - Do:
    - Every player starts with 100 doubloons of bounty.
    - On a KO, the killer gets `50 + 50% of the victim's bounty` and their own bounty +100. The victim drops 3 coin pickups.
    - The highest bounty shows a floating WANTED crown marker.
    - Winner = highest bounty, and FFA scoring switches to bounty.
    - Results screen: procedurally drawn WANTED poster (parchment SVG/canvas, winner portrait, name, "WANTED – DRENCHED OR DRY", bounty with coin icon). Runners-up as small posters.
    - Unit tests for bounty math.
  - Test: `npm run check && npm run e2e`

- [ ] **T20 — Faction passives** · CP: yes
  - Do:
    - Implement EVOLVE, FLOW, PLUNDER and TOON LOGIC (§2.6) in `shared/sim/passives.ts`.
    - Visuals: Evolve = scale up + golden aura + crest overlay sprite. Flow = ribbon swirl on the empowered attack. Plunder = coins fly to the killer. Toon Logic = pancake squash + "boing" + star.
    - Passive info on the character cards.
    - Unit tests for each.
  - Checkpoint: "CP5 ✅ Überraschung!" Rising tide, element reactions (example: wet + volt = shock), bounty hunt + WANTED poster, faction passives.
  - Test: `npm run check && npm run smoke && npm run e2e`

### CP6 — "Die Crew wächst: 12 Kämpfer + Balance"
(Each fighter task: SVG + hurt SVG, data kit, hooks if needed, unit test per ability, gallery shot ≤1 PNG viewed.)

- [ ] **T21 — Critterkin: Embercub + Mossback**
  - Test: `npm run check && npm run shot -- --name T21 --path /gallery.html`
- [ ] **T22 — Weavers: Pip Windwhistle + Brak Stonefist**
  - Brak's Stone Wall adds a new primitive `wall` (temporary dynamic obstacle, 4 s, HP 60, in collision + projectile blocking).
  - Test: same pattern
- [ ] **T23 — Saltwind: Sable Tripleblade + Bisque Legsworth**
  - Test: same pattern
- [ ] **T24 — Bubblebottom: Boss Pinchpenny + Hammy Divedome**
  - Test: same pattern
- [ ] **T25 — Balance harness + pass** · CP: yes
  - Do:
    - `scripts/balance.ts` (`npm run balance`): headless World with BotBrain(normal), no network, fast-forward sim.
    - Every fighter pair runs 1v1 ×10 seeds × 60 s, plus 6-bot FFA ×20.
    - Writes `.loop/balance.md` (winrate matrix, overall winrate, avg dmg/KO per fighter).
    - Adjust data by ≤10% steps until every overall winrate is 40–60% (max 3 passes). Log the changes.
    - `npm run balance -- --quick` runs in <30 s and is covered by a unit test.
  - Checkpoint: "CP6 ✅ 12 Kämpfer", the new names plus a one-liner on balance.
  - Test: `npm run check && npm run balance -- --quick`

### CP7 — "Team-Modus: Treasure Tide + Crew-Kombos"

- [ ] **T26 — Teams**
  - Do:
    - Room `mode` (`bounty`|`treasure`).
    - Teams A/B with auto-balance (humans spread out, bots fill), no friendly fire, team ring colors under the feet, ally names in a team color, bots team-aware (target enemies only, regroup).
    - Lobby: mode selector on Create Room; Quick Play picks a random mode.
    - Unit tests: friendly fire off, team assignment.
  - Test: `npm run check && npm run smoke`
- [ ] **T27 — Treasure Tide mode**
  - Do:
    - Sunken Chest in the center spawns a doubloon every 7 s (underwater at high tide → slow to reach). Carried coins show above the head and drop on KO.
    - A team with ≥10 combined starts a 15 s countdown, and it resets if they drop below 10. Win, else timeout → most coins.
    - HUD: team totals + countdown.
    - Bots: collect/escort/hunt carrier roles.
    - Unit tests: win rule, drop on KO.
  - Test: `npm run check && npm run e2e`
- [ ] **T28 — Crew Combos + spectate + rematch** · CP: yes
  - Do:
    - When two teammates' ults hit the same enemy or area within 1.5 s and 300 u → Crew Combo. It is named by element pair: Volt+Water "Storm Surge", Fire+Air "Firenado", Earth+Water "Mudslide", Leaf+Water "Bloom Burst", Fire+Earth "Magma Pop", else "Crew Combo!". Effect: +40% bonus dmg AoE + full-screen banner + unique FX.
    - While KO'd, the camera follows the killer.
    - Results screen: "Rematch" + "Change fighter".
    - Unit test for combo detection.
  - Checkpoint: "CP7 ✅ Team-Modus", Treasure Tide 3v3 + Crew Combos, invite a friend into the same team.
  - Test: `npm run check && npm run e2e:all`

### CP8 — "Volle Crew: 24 Kämpfer"

- [ ] **T29 — Critterkin: Gloomoth, Pebblor, Dozelump** (Test: gallery shot + check)
- [ ] **T30 — Weavers: Ashka Flameheart, Kip Boomer, Uncle Tobo** (boomerang = projectile `returns:true`, can hit twice)
- [ ] **T31 — Saltwind: Nova Chartwind, Longshot Lenny, Doc Fawnsworth** (new primitive `summon{decoy|turret}` if needed; heal on ally)
- [ ] **T32 — Bubblebottom: Lumpy, Squall Mopefin, Teeny Krill** (turret via `summon`)
- [ ] **T33 — Roster polish + rebalance** · CP: yes
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
1. Emote wheel (4 sticker emotes: "Arr!", "Bloop", "GG", 😂-style original stickers).
2. Purrl the meowing sea snail: wanders the beach, touching it heals +10 once per life.
3. Second arena "Taffy Galleon": rocking ship deck, cannon hazard that fires across lanes.
4. Bot difficulty selector (easy / normal / sharky) in the lobby.
5. Skins: 2 palette swaps per fighter (data-driven SVG color replacement).
6. "Weird Weather" match modifiers: jellyfish rain, bubble storm, double tide.
7. Kill-cam: 2 s replay of the last KO from the snapshot buffer.
8. Showdown battle-royale mode where the tide permanently rises and shrinks the island.
9. Tutorial overlay for first-time players (3 tips, dismissible).
10. Colorblind-friendly team outlines and status shapes.
11. Local stats page (matches, favorite fighter, best bounty) in localStorage.
12. Optional ONLY if the user asks: ComfyUI portraits (127.0.0.1:8188, 2–7 min/img, 16 GB RAM, never while the user is using it).

---
## 6. LOG (one line per task/hotfix; archive older lines to `.loop/log-archive.md` if >40 lines)
- T00 ✅ 2026-10-18 — scaffold+MCP done; .claude/settings.json write was denied by harness (add manually, MCP works anyway)
- T01-partial 🟡 2026-10-18 — server/client/smoke/shot done+green; PARTIAL: serve.sh not runnable (needs approval) → T01a
- T01/T01a 🔴 2026-10-18 — BLOCKED: harness requires user approval to run scripts/serve.sh; check+smoke green; see checkpoint
- T02 ✅ 2026-10-18 — shared World sim, docks arena, interp+camera, kb/mouse/touch stick; unit+smoke green
- T03 ✅ 2026-10-18 — attack/ammo/KO/respawn, hit FX+HUD, tap-fire, cp1 e2e green; serve.sh step needs user approval (see checkpoint)
- T04 ✅ 2026-10-18 — twin-stick touch.ts, DOM buttons+rings, rotate overlay, fullscreen, mobile e2e green
- RF ✅ 2026-10-18 — input throttle 30/s w/ immediate flag edges, per-input aim source, serve.sh verified (T01/T01a ticked)
- HF ✅ 2026-10-18 — serve.sh mkdir lock (.loop/serve.lock, stale >5 min dropped)
- T05 ✅ 2026-10-18 — BotBrain (wander/chase/kite/flee, lead+error, react delay, whiskers), room bots, dbg bots, unit+smoke green
- T06 ✅ 2026-10-18 — DOM lobby+invite+☰ menu, clipboard fallback, bots msg; portrait rotate hint no longer covers menus
- T07 ✅ 2026-10-18 — Match-Flow + HUD-Scene (Timer/KOs/Feed/Scoreboard), Results-Overlay, ?matchsec, Touch-Tap-Fix
