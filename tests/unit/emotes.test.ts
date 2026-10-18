import { describe, it, expect } from 'vitest';
import {
  EMOTES, EMOTE_COOLDOWN_MS, EMOTE_MAX_LABEL, BOT_KO_CHANCE, botKoSticker, emoteIndex, emoteReady,
} from '../../shared/emotes.ts';
import { BotBrain } from '../../shared/sim/bot.ts';
import { Room, type Client } from '../../server/rooms.ts';

/** Room.emote only reads the client id, so a stub is enough (no socket needed). */
const fakeClient = (id: number): Client => ({ id, ws: null as unknown as Client['ws'], name: 'A', fighter: 'default' });

describe('emote stickers (T99)', () => {
  it('ships four distinct stickers with short labels', () => {
    expect(EMOTES).toHaveLength(4);
    expect(new Set(EMOTES.map((e) => e.id)).size).toBe(4);
    expect(new Set(EMOTES.map((e) => e.label)).size).toBe(4);
    expect(new Set(EMOTES.map((e) => e.color)).size).toBe(4);
    for (const e of EMOTES) {
      // the bubble is drawn above a 48 px fighter: a long label would cover the arena
      expect(e.label.length).toBeLessThanOrEqual(EMOTE_MAX_LABEL);
      expect(e.label.trim()).toBe(e.label);
      expect(e.color).toBeGreaterThanOrEqual(0);
      expect(e.color).toBeLessThanOrEqual(0xffffff);
    }
  });

  it('validates the index', () => {
    expect(emoteIndex(0)).toBe(0);
    expect(emoteIndex(EMOTES.length - 1)).toBe(EMOTES.length - 1);
    for (const bad of [-1, EMOTES.length, 1.5, NaN, Infinity, '1', null, undefined, {}, true]) {
      expect(emoteIndex(bad)).toBe(-1);
    }
  });

  it('honours the cooldown', () => {
    expect(emoteReady(0, EMOTE_COOLDOWN_MS)).toBe(true);
    expect(emoteReady(5000, 5000)).toBe(false);
    expect(emoteReady(5000, 5000 + EMOTE_COOLDOWN_MS - 1)).toBe(false);
    expect(emoteReady(5000, 5000 + EMOTE_COOLDOWN_MS)).toBe(true);
  });

  it('relays one event per emote and rejects spam', () => {
    const room = new Room('emotes');
    const a = room.world.addPlayer(1, 'A', 'default');
    room.world.addPlayer(2, 'B', 'default');
    const c = fakeClient(1);

    expect(room.emote(c, 2, 10_000)).toBe(true);
    const ev = room.world.snapshotFor(2).ev.filter((e) => e.k === 'emote');
    expect(ev).toEqual([{ k: 'emote', id: 1, e: 2 }]);

    // same second: the cooldown swallows it, so no second bubble
    room.world.clearEvents();
    expect(room.emote(c, 0, 10_000 + EMOTE_COOLDOWN_MS - 1)).toBe(false);
    expect(room.world.snapshotFor(2).ev).toHaveLength(0);

    // after the cooldown the next sticker goes through, and it carries the sender id
    expect(room.emote(c, 0, 10_000 + EMOTE_COOLDOWN_MS)).toBe(true);
    expect(room.world.snapshotFor(2).ev.filter((e) => e.k === 'emote')).toEqual([{ k: 'emote', id: 1, e: 0 }]);

    // garbage indices and unknown players never reach the room
    room.world.clearEvents();
    expect(room.emote(c, 99, 40_000)).toBe(false);
    expect(room.emote(fakeClient(999), 1, 40_000)).toBe(false);
    expect(room.world.snapshotFor(2).ev).toHaveLength(0);
    expect(a.x).toBeTypeOf('number');
  });
});

describe('bot KO stickers (backlog #10)', () => {
  /** rng that returns the given draws in order, then 0 */
  const draws = (...xs: number[]) => {
    let i = 0;
    return () => (i < xs.length ? xs[i++] : 0);
  };
  const idx = (id: string) => EMOTES.findIndex((e) => e.id === id);

  it('stays quiet two times in three', () => {
    expect(BOT_KO_CHANCE).toBeCloseTo(1 / 3);
    expect(botKoSticker(draws(0.9))).toBeNull();
    expect(botKoSticker(draws(BOT_KO_CHANCE))).toBeNull();
    // the first draw decides whether it talks, the second picks the sticker
    expect(botKoSticker(draws(0.2, 0))).toBe(idx('haha'));
    expect(botKoSticker(draws(0.2, 0.5))).toBe(idx('gg'));
    expect(botKoSticker(draws(0.2, 0.99))).toBe(idx('arr'));
  });

  it('only ever picks a valid sticker index', () => {
    for (let i = 0; i < 200; i++) {
      const e = botKoSticker(Math.random);
      if (e !== null) expect(emoteIndex(e)).toBe(e);
    }
  });

  it('answers a KO on a human with one sticker, once per cooldown', () => {
    const room = new Room('bot-quip');
    room.world.addPlayer(1, 'A', 'default');
    room.clients.set(1, fakeClient(1));
    room.world.addPlayer(1001, 'Bot', 'default');
    room.bots.set(1001, new BotBrain(1001));

    // the bot wins the rng roll, so it answers
    room.answerKos([{ k: 'ko', a: 1001, v: 1 }], 10_000, () => 0);
    expect(room.world.snapshotFor(1).ev.filter((e) => e.k === 'emote')).toEqual([{ k: 'emote', id: 1001, e: idx('haha') }]);

    // a second KO inside the cooldown stays silent
    room.world.clearEvents();
    room.answerKos([{ k: 'ko', a: 1001, v: 1 }], 10_000 + EMOTE_COOLDOWN_MS - 1, () => 0);
    expect(room.world.snapshotFor(1).ev).toHaveLength(0);
  });

  it('stays quiet on the other 2 in 3 rolls and ignores KOs that are not bot-on-human', () => {
    const room = new Room('bot-quip-quiet');
    room.world.addPlayer(1, 'A', 'default');
    room.clients.set(1, fakeClient(1));
    room.world.addPlayer(1001, 'Bot', 'default');
    room.bots.set(1001, new BotBrain(1001));

    room.answerKos([{ k: 'ko', a: 1001, v: 1 }], 10_000, () => 0.9);
    // a human KO, and a bot KO on another bot, never quip
    room.answerKos([{ k: 'ko', a: 1, v: 1001 }, { k: 'ko', a: 1001, v: 1001 }], 40_000, () => 0);
    expect(room.world.snapshotFor(1).ev.filter((e) => e.k === 'emote')).toHaveLength(0);
  });
});
