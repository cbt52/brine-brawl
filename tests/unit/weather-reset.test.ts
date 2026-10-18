import { describe, it, expect } from 'vitest';
import { Room } from '../../server/rooms.ts';

describe('weird weather is per round (review 20261018-063134)', () => {
  it('results and lobby run calm skies, not a stale Double Tide', () => {
    const room = new Room('weather-reset');
    room.world.setWeather('double-tide');
    room.match.phase = 'results';
    room.match.timer = 99;
    room.advance(room.last + 1000);
    expect(room.world.weather).toBe('clear');

    room.world.setWeather('double-tide');
    room.match.phase = 'waiting';
    room.advance(room.last + 1000);
    expect(room.world.weather).toBe('clear');
  });

  it('a round in progress keeps its weather', () => {
    const room = new Room('weather-playing');
    room.world.setWeather('double-tide');
    room.match.phase = 'playing';
    room.match.timer = 99;
    room.advance(room.last + 1000);
    expect(room.world.weather).toBe('double-tide');
  });
});
