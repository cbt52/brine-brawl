import type { WebSocket } from 'ws';
import { MAX_HUMANS, MAX_NAME_LEN, TICK_HZ } from '../shared/constants.ts';
import type { InputMsg, RoomMode, ScoreRow, SimEvent } from '../shared/protocol.ts';
import { World } from '../shared/sim/world.ts';
import { arenaById, DOCKS_ARENA, type Arena } from '../shared/arena/arena.ts';
import { BotBrain, sanitizeBotLevel, type BotDifficulty } from '../shared/sim/bot.ts';
import { autoTeams, type Team } from '../shared/sim/teams.ts';
import { randomFighterId, resolveFighterId } from '../shared/fighters/index.ts';
import { Match, READY_HOLD_SEC, rankPlayers } from './match.ts';
import { botKoSticker, emoteIndex, emoteReady, STREAK_KOS, streakSticker } from '../shared/emotes.ts';
import { sanitizeSkin } from '../shared/skins.ts';
import { pickWeather } from '../shared/sim/weather.ts';
import { mvpId } from '../shared/sim/mvp.ts';

const ROOM_RE = /^[a-z0-9-]{1,24}$/;
const ADJ = ['Salty', 'Soggy', 'Crispy', 'Wobbly', 'Grumpy', 'Sneaky', 'Bouncy', 'Dizzy'];
const BOT_NAMES = ['Bot Barnacle', 'Captain Crumb', 'Sir Soggy', 'Lady Limpet', 'Dr Dribble', 'Mr Mussel', 'Baron Brine'];
const NOUN = ['Biscuit', 'Barnacle', 'Pickle', 'Noodle', 'Clam', 'Muffin', 'Kelp', 'Crumb'];

export function sanitizeRoom(raw: unknown): string {
  return typeof raw === 'string' && ROOM_RE.test(raw) ? raw : 'main';
}

export function sanitizeName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/[^A-Za-z0-9 _-]/g, '').slice(0, MAX_NAME_LEN).trim() : '';
  if (s) return s;
  const r = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  return `${r(ADJ)} ${r(NOUN)}`;
}

export function sanitizeMode(raw: unknown): RoomMode | null {
  return raw === 'bounty' || raw === 'treasure' || raw === 'showdown' ? raw : null;
}

export interface Client {
  id: number;
  ws: WebSocket;
  name: string;
  fighter: string;
}

export class Room {
  clients = new Map<number, Client>();
  world: World;
  match = new Match();
  /** Bounty Brawl (default) or Treasure Tide (T26/T27) */
  mode: RoomMode = 'bounty';
  /** bot level for bots this room spawns from now on (T99, set by the first human) */
  botLevel: BotDifficulty = 'normal';
  emptySince: number | null = Date.now();
  bots = new Map<number, BotBrain>();
  wantBots = 0;
  /** debug builds only (`?botf=`): fighter ids for new bots, in spawn order; empty = random kits */
  botFighters: string[] = [];
  private nextBot = 1000;
  /** last emote timestamp per client, so nobody can spam the room (T99) */
  private emoteAt = new Map<number, number>();
  /** humans who tapped Ready on this results screen (backlog #15), cleared when the round moves on */
  private readyIds = new Set<number>();
  /** fighters who already got their streak sticker this round (backlog #24) */
  private streakSent = new Set<number>();
  /** the round's Most KOs fighter, frozen with the ranking (backlog #32) */
  mvp: number | null = null;
  /** the side that won this round's Showdown last-standing finish (backlog #33); null when the clock ran out */
  lastStand: string | null = null;
  acc = 0;
  last = Date.now();
  /** the layout is fixed when the room is created (backlog #26, the Galleon room pick) */
  constructor(public id: string, mode: RoomMode = 'bounty', arena: Arena = DOCKS_ARENA) {
    this.mode = mode;
    this.world = new World(arena);
    this.world.setMode(mode);
  }

  /**
   * Full roster for the scoreboard — every combatant, including fighters the viewer's snapshot
   * hides behind kelp (the `players` list is filtered per viewer).
   */
  roster(): ScoreRow[] {
    const treasure = this.mode === 'treasure';
    const rows = [...this.world.players.values()].map((p) => ({
      id: p.id, name: p.name, kos: p.kos, deaths: p.deaths,
      // Treasure Tide scores the coins on the body, Bounty Brawl the bounty (T27)
      bounty: treasure ? p.carry : p.bounty,
      fighter: p.fighter, bot: this.bots.has(p.id), team: p.team ?? undefined, skin: p.skin,
      bestRun: p.bestRun,
    }));
    const ranked = rankPlayers(rows);
    if (!treasure) return ranked;
    // the crew with the bigger pile tops the board, then coins, then KOs
    const totals: [number, number] = [0, 0];
    for (const r of ranked) if (r.tm === 0 || r.tm === 1) totals[r.tm] += r.b;
    const order = totals[1] > totals[0] ? [1, 0] : [0, 1];
    const crewRank = (tm?: number): number => (tm === order[0] ? 0 : 1);
    return ranked.sort((x, y) => crewRank(x.tm) - crewRank(y.tm));
  }

  /** Auto-balance the crews: existing sides stay, newcomers join the smaller crew (T26). */
  assignTeams(): void {
    const members = [...this.world.players.values()].map((p) => ({
      id: p.id, human: this.clients.has(p.id), team: p.team,
    }));
    const teams = autoTeams(members);
    for (const [id, team] of teams) this.world.setTeam(id, team as Team);
  }

  /** Advance the sim by wall-clock time using a fixed 30 Hz step. */
  advance(now: number): number {
    this.acc = Math.min(this.acc + (now - this.last) / 1000, 0.25);
    this.last = now;
    const dt = 1 / TICK_HZ;
    let n = 0;
    while (this.acc >= dt) {
      this.world.setRoundT(this.roundSec());
      for (const b of this.bots.values()) this.world.setInput(b.id, b.think(this.world, dt));
      const from = this.world.events.length;
      this.world.step(dt);
      this.answerKos(this.world.events.slice(from), now);
      this.stepMatch(dt);
      this.acc -= dt;
      n++;
    }
    return n;
  }

  /** Seconds into the round while it is being played (the Showdown ring clock, backlog #6). */
  private roundSec(): number {
    return this.match.phase === 'playing' ? this.match.cfg.matchSec - this.match.timer : 0;
  }

  /** the results board (ranking + Most KOs pick) is taken once, when the round ends */
  private freezeResults(): void {
    this.match.ranking = this.roster();
    this.mvp = mvpId([...this.world.players.values()]);
  }

  private stepMatch(dt: number): void {
    const ev = this.match.update(dt, this.world.players.size);
    if (ev === 'start') {
      this.world.resetScores();
      this.streakSent.clear();
      this.lastStand = null;
      // Weird Weather (backlog #4): each round rolls its own modifier
      this.world.setWeather(pickWeather(Math.random(), this.mode));
    }
    else if (ev === 'end') this.freezeResults();
    // Treasure Tide (T27) and Showdown (backlog #20) can end a round before its clock runs out
    const early = this.world.treasure?.won != null || this.world.lastStanding();
    if (this.match.phase === 'playing' && early) {
      this.lastStand = this.world.lastStandingLabel();
      if (this.match.finish() === 'end') this.freezeResults();
    }
    // Weird Weather lasts one round: calm skies again outside 'playing' (results, lobby, countdown)
    if (this.match.phase !== 'playing') this.world.setWeather('clear');
    if (this.match.phase !== 'results') this.readyIds.clear();
  }

  /** Bots fill free slots up to the requested count; humans take priority. */
  syncBots(): void {
    const target = Math.max(0, Math.min(this.wantBots, MAX_HUMANS - this.clients.size));
    while (this.bots.size > target) {
      const id = [...this.bots.keys()].pop()!;
      this.bots.delete(id);
      this.world.removePlayer(id);
    }
    while (this.bots.size < target) {
      const id = this.nextBot++;
      const used = new Set([...this.world.players.values()].map((p) => p.name));
      const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${id}`;
      // bots show up with a random real kit (T10) and join the smaller crew (T26)
      const pinned = this.botFighters.length ? this.botFighters[this.bots.size % this.botFighters.length] : null;
      this.world.addPlayer(id, name, pinned ?? randomFighterId(), true);
      this.bots.set(id, new BotBrain(id, this.botLevel));
    }
    this.assignTeams();
  }

  /**
   * "Rematch" on the results screen is a Ready tap (backlog #15). Once every connected human is ready,
   * the next round starts READY_HOLD_SEC after the last tap; until then the normal results wait applies.
   */
  rematch(c: Client): boolean {
    if (this.match.phase !== 'results') return false;
    // only the first tap counts: a resent message must not push the round start back again
    if (this.readyIds.has(c.id)) return false;
    this.readyIds.add(c.id);
    const humans = [...this.clients.keys()];
    if (!humans.every((id) => this.readyIds.has(id))) return false;
    this.match.holdResults(READY_HOLD_SEC);
    return true;
  }

  /** Ready tally for the results poster (backlog #28); only connected humans count, so a leaver's tap does not. */
  readyTally(): { ready: number; of: number } {
    const ids = [...this.clients.keys()];
    return { ready: ids.filter((id) => this.readyIds.has(id)).length, of: ids.length };
  }

  /** Drop per-client bookkeeping when somebody leaves the room. */
  dropClient(id: number): void {
    this.emoteAt.delete(id);
  }

  /** Fighter change from the in-game menu: takes effect on the client's next respawn. */
  setFighter(c: Client, fighter: unknown): void {
    const id = resolveFighterId(fighter);
    c.fighter = id;
    this.world.setFighter(c.id, id);
  }

  /** ☰-menu skin change (backlog #16): cosmetic, so it applies at once on the next snapshot. */
  setSkin(c: Client, raw: unknown): void {
    this.world.setSkin(c.id, sanitizeSkin(raw));
  }

  /** The first human to join is the host (backlog #14/#27); null once the room is empty. */
  hostId(): number | null {
    return this.clients.keys().next().value ?? null;
  }

  /** Host's ☰-menu level change (backlog #14): the bots already in the room switch with it. */
  setBotLevel(raw: unknown): void {
    this.botLevel = sanitizeBotLevel(raw);
    for (const b of this.bots.values()) b.setDifficulty(this.botLevel);
  }

  setInput(c: Client, i: InputMsg): void {
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    this.world.setInput(c.id, {
      seq: n(i.seq), mx: n(i.mx), my: n(i.my), ax: n(i.ax), ay: n(i.ay),
      atk: !!i.atk, spc: !!i.spc, ult: !!i.ult,
    });
  }

  /**
   * Emote sticker (T99): validate the index and the per-player cooldown, then let the world queue
   * the event for the next snapshot. Returns false when the request was rejected.
   */
  emote(c: Client, raw: unknown, now = Date.now()): boolean {
    return this.relayEmote(c.id, raw, now);
  }

  /** Shared by humans and bots: one index check and one cooldown per fighter id. */
  private relayEmote(id: number, raw: unknown, now: number): boolean {
    const e = emoteIndex(raw);
    if (e < 0 || !this.world.players.has(id)) return false;
    const last = this.emoteAt.get(id);
    if (last !== undefined && !emoteReady(last, now)) return false;
    this.emoteAt.set(id, now);
    this.world.emote(id, e);
    return true;
  }

  /**
   * Backlog #10: a bot that scores a KO on a human answers with a sticker, one time in three.
   * It goes through the same cooldown, so a bot on cooldown just stays quiet.
   * Backlog #24: the third KO of a round earns the room's sticker for that fighter, once per round.
   */
  answerKos(events: readonly SimEvent[], now: number, rng: () => number = Math.random): void {
    for (const ev of events) {
      if (ev.k !== 'ko') continue;
      if (ev.a !== ev.v) this.answerStreak(ev.a, rng);
      if (!this.bots.has(ev.a) || !this.clients.has(ev.v)) continue;
      const e = botKoSticker(rng);
      if (e !== null) this.relayEmote(ev.a, e, now);
    }
  }

  /**
   * Backlog #24: a fighter with STREAK_KOS KOs this round gets one sticker.
   * Backlog #37: it skips the wheel cooldown and does not start it, so a sticker sent just before
   * the third KO cannot silence the greeting. The once-per-round `streakSent` set is its rate limit.
   */
  private answerStreak(id: number, rng: () => number): void {
    const p = this.world.players.get(id);
    if (!p || p.kos < STREAK_KOS || this.streakSent.has(id)) return;
    this.streakSent.add(id);
    this.world.emote(id, streakSticker(rng));
  }
}

/** A `join` message's fields, still raw: `RoomManager.join` sanitizes each one. */
export interface JoinOpts {
  room: unknown;
  name: unknown;
  fighter: unknown;
  bots?: unknown;
  /** debug builds only: match length override (index.ts gates it behind ALLOW_DEBUG) */
  matchSec?: unknown;
  /** debug builds only: rising-tide jump (`?tide=high`) */
  tide?: unknown;
  /** debug builds only: `?botf=` comma list of bot fighter ids */
  botFighters?: unknown;
  mode?: unknown;
  level?: unknown;
  skin?: unknown;
  arena?: unknown;
}

/** `?botf=a,b` → registered fighter ids only (unknown ids are dropped), at most one per bot slot. */
export function parseBotFighters(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((id) => id && resolveFighterId(id) === id)
    .slice(0, MAX_HUMANS - 1);
}

export class RoomManager {
  rooms = new Map<string, Room>();
  private nextId = 1;
  private timer: NodeJS.Timeout;

  constructor() {
    this.timer = setInterval(() => this.sweep(), 5000);
    this.timer.unref();
  }

  join(ws: WebSocket, opts: JoinOpts): { room: Room; client: Client } | null {
    const id = sanitizeRoom(opts.room);
    let room = this.rooms.get(id);
    const created = !room;
    if (!room) {
      room = new Room(id, sanitizeMode(opts.mode) ?? 'bounty', arenaById(opts.arena));
      this.rooms.set(id, room);
    }
    if (room.clients.size >= MAX_HUMANS) return null;
    if (created && opts.matchSec !== undefined) room.match.setMatchSec(opts.matchSec);
    if (opts.tide !== undefined) room.world.debugTide(String(opts.tide));
    if (opts.botFighters !== undefined) room.botFighters = parseBotFighters(opts.botFighters);
    const cid = this.nextId++;
    const client: Client = {
      id: cid,
      ws,
      name: sanitizeName(opts.name),
      fighter: resolveFighterId(opts.fighter),
    };
    room.clients.set(cid, client);
    room.world.addPlayer(cid, client.name, client.fighter);
    // skin (backlog #3): cosmetic only, so it is set straight on the sim player
    room.world.setSkin(cid, sanitizeSkin(opts.skin));
    room.emptySince = null;
    if (room.clients.size === 1) room.botLevel = sanitizeBotLevel(opts.level);
    if (room.clients.size === 1 && typeof opts.bots === 'number' && Number.isFinite(opts.bots)) {
      room.wantBots = Math.max(0, Math.min(7, Math.floor(opts.bots)));
    }
    room.syncBots();
    return { room, client };
  }

  leave(room: Room, client: Client): void {
    room.clients.delete(client.id);
    room.dropClient(client.id);
    room.world.removePlayer(client.id);
    if (room.clients.size === 0) {
      room.emptySince = Date.now();
      room.wantBots = 0;
    }
    room.syncBots();
  }

  sweep(now = Date.now()): void {
    for (const [id, r] of this.rooms) {
      if (r.emptySince !== null && now - r.emptySince > 30_000) this.rooms.delete(id);
    }
  }

  broadcast(): void {
    for (const r of this.rooms.values()) {
      if (r.clients.size === 0) continue;
      r.advance(Date.now());
      const info = r.match.info();
      // unfiltered roster: the per-viewer snapshot list hides fighters behind kelp
      info.ros = r.roster();
      info.mode = r.mode;
      info.wx = r.world.weather;
      info.bl = r.botLevel;
      info.ar = r.world.arena.id;
      if (r.match.phase === 'results') {
        info.rd = r.readyTally();
        if (r.mvp !== null) info.mv = r.mvp;
        if (r.lastStand) info.ls = r.lastStand;
      }
      if (r.mode === 'showdown') info.sd = Math.round(r.world.roundT * 10) / 10;
      const host = r.hostId();
      for (const c of r.clients.values()) {
        if (c.ws.readyState !== 1) continue;
        const snap = r.world.snapshotFor(c.id);
        // the host flag is per viewer, so each client gets its own copy of the info
        snap.m = { ...info, host: c.id === host };
        c.ws.send(JSON.stringify(snap));
      }
      r.world.clearEvents();
    }
  }

  stats() {
    let players = 0;
    for (const r of this.rooms.values()) players += r.clients.size;
    return { rooms: this.rooms.size, players };
  }

  close(): void {
    clearInterval(this.timer);
  }
}
