import { describe, it, expect, vi, afterEach } from 'vitest';
import type { WebSocket } from 'ws';
import { RoomManager } from '../../server/rooms.ts';
import { rankPlayers } from '../../server/match.ts';
import { skinnedPortrait } from '../../client/src/art/skinPortrait.ts';
import { artUrl } from '../../client/src/art/manifest.ts';
import { SKINS, recolorSvg } from '../../shared/skins.ts';

describe('skins everywhere (backlog #16)', () => {
  it('the results rows carry the skin only when it is not the drawn look', () => {
    const rows = rankPlayers([
      { id: 1, name: 'A', kos: 1, deaths: 0, bounty: 50, fighter: 'voltbun', skin: 2 },
      { id: 2, name: 'B', kos: 0, deaths: 1, bounty: 20, fighter: 'embercub', skin: 0 },
      { id: 3, name: 'C', kos: 0, deaths: 1, bounty: 10, fighter: 'pebblor' },
    ]);
    expect(rows.find((r) => r.id === 1)!.sk).toBe(2);
    expect(rows.find((r) => r.id === 2)!).not.toHaveProperty('sk');
    expect(rows.find((r) => r.id === 3)!).not.toHaveProperty('sk');
  });

  it('the room roster hands each fighter its current skin to the poster', () => {
    const mgr = new RoomManager();
    const { room, client } = mgr.join({} as WebSocket, { room: 'skin-roster', name: 'A', fighter: 'default', bots: 0 })!;
    expect(room.roster()[0]).not.toHaveProperty('sk');
    room.setSkin(client, 1);
    expect(room.world.players.get(client.id)!.skin).toBe(1);
    expect(room.roster()[0].sk).toBe(1);
  });

  it('a skin change from the ☰ menu sanitizes junk back to the drawn look', () => {
    const mgr = new RoomManager();
    const { room, client } = mgr.join({} as WebSocket, { room: 'skin-junk', name: 'A', fighter: 'default', bots: 0 })!;
    room.setSkin(client, 2);
    expect(room.world.players.get(client.id)!.skin).toBe(2);
    room.setSkin(client, 'mint; drop table');
    expect(room.world.players.get(client.id)!.skin).toBe(0);
    room.setSkin(client, 99);
    expect(room.world.players.get(client.id)!.skin).toBe(0);
  });
});

describe('skinnedPortrait', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('the drawn look is the art file itself and never fetches', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await skinnedPortrait('voltbun', 0)).toBe(artUrl('voltbun'));
    expect(await skinnedPortrait('voltbun', 42)).toBe(artUrl('voltbun'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a palette swap fetches the SVG once and hands out a blob of the recoloured text', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#ff0000"/></svg>';
    const fetchMock = vi.fn(async () => ({ text: async () => svg }));
    const blobs: Blob[] = [];
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: (b: Blob) => { blobs.push(b); return `blob:test/${blobs.length}`; },
    }));

    const first = await skinnedPortrait('pebblor', 1);
    const again = await skinnedPortrait('pebblor', 1);
    expect(first).toBe('blob:test/1');
    expect(again).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(artUrl('pebblor'));
    expect(await blobs[0].text()).toBe(recolorSvg(svg, SKINS[1].hueShift));
    expect(blobs[0].type).toBe('image/svg+xml');
  });

  it('a failed fetch falls back to the drawn look', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await skinnedPortrait('mossback', 2)).toBe(artUrl('mossback'));
  });
});
