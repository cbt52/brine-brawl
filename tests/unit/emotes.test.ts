import { describe, it, expect } from 'vitest';
import {
  EMOTES, EMOTE_COOLDOWN_MS, EMOTE_MAX_LABEL, emoteIndex, emoteReady,
} from '../../shared/emotes.ts';
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
