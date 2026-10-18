# BRINE BRAWL (working title)

Real-time top-down arena brawler (2–8 players, humans + bots), cartoony, phone-friendly.
Server-authoritative Node + `ws`; Phaser 3 client. Task plan: `TASKS-LOOP.md` (follow its Loop protocol).

## Commands
- `npm run check` — typecheck + lint + ip-check + vitest (must be green before commit)
- `npm run build` — vite build (`OUT_DIR` overrides output, default `dist/client`)
- `npm start` — server (env PORT=8720, HOST, CLIENT_DIR, ALLOW_DEBUG)
- `npm run smoke` — websocket smoke test · `npm run shot -- …` — screenshots to `.loop/shots/`
- `npm run e2e` (desktop) / `npm run e2e:all` — Playwright
- `scripts/serve.sh` — build + (re)start live server on 8720
- `npm run art:3d -- <id…> [--still] [--contact]` — Blender 3D sprites (`$BLENDER`, `blender` on PATH, or /Applications/Blender.app)
- `npm run art:selftest -- --contact` — toolchain check → `.loop/shots/T34-contact.png` (`npm run check` never needs Blender)

## Directory map
- `shared/{protocol,constants}.ts`, `shared/sim/` (pure TS sim), `shared/fighters/`, `shared/arena/`
- `server/` — http + ws on one port, rooms, match flow
- `client/src/{scenes,net,ui,input,fx,audio,art}`, `client/public/art/`
- `tests/{unit,e2e}`, `scripts/`
- `scripts/blender/{lib,specs}` (Blender Python: toon/cam/build + per-fighter specs), `scripts/art3d.mjs`,
  `scripts/lib/{pack,spec3d,frames3d}.mjs`; raw 3D frames go to `.loop/tmp/art3d/` (never commit `.blend`)

## Architecture rules
- One port serves `CLIENT_DIR`, `/healthz`, and websocket `/ws`.
- Server is authoritative; clients send inputs only. Sim 30 Hz, snapshots 30 Hz JSON.
- `shared/sim/` has no DOM and no Node APIs (used by server, bots, tests, prediction, balance).
- Relative imports only (no path aliases). Keep files small and focused.

## Testing rules
- Unit-test the sim (vitest). Smoke for networking. e2e at checkpoints.
- Expose `window.__brawl` debug hook on the client. Put `data-testid` on DOM UI.

## Originality rules (mandatory)
- No franchise/character/place/power names or catchphrases from the source shows (`scripts/ip-check.mjs` enforces).
- Own vocabulary: weaving, Wonderfruit, doubloons, Bubblebottom Bay, Critterkin.
- Visual don'ts: no yellow electric mouse with red cheeks, bald monk with blue arrows, straw hat + red vest + scar,
  yellow square sponge, pink starfish in shorts, red/white capture ball, pineapple house.
- Each fighter = familiar archetype + a deliberate twist.

## Token hygiene
- Filter noisy output (`… 2>&1 | tail -40`). View at most 2 screenshots per task.

## Safety
- No `git push`, deploy, paid services, or secrets. Never read `.env.local`.
- Never delete files you didn't create; no `rm -rf`, `git reset --hard`, `git clean`.
- Only kill processes started by this repo (pidfile / own temp servers).
- External assets only MIT/CC0/OFL, recorded in `ASSETS.md`.
