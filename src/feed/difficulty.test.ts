import { BAND_MIX, pickBand } from './difficulty';

describe('pickBand', () => {
  it('serves Easy below 0.8 and Medium from 0.8 up', () => {
    expect(pickBand(() => 0)).toBe(1);
    expect(pickBand(() => 0.7999)).toBe(1);
    expect(pickBand(() => 0.8)).toBe(2);
    expect(pickBand(() => 0.9999999)).toBe(2);
  });

  it('serves 80% Easy and 20% Medium over an even spread of random values', () => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let i = 0; i < 1000; i++) {
      counts[pickBand(() => i / 1000)] += 1;
    }
    expect(counts).toEqual({ 1: 800, 2: 200, 3: 0, 4: 0, 5: 0 });
  });

  it('has weights that add up to 1', () => {
    const total = BAND_MIX.reduce((sum, { weight }) => sum + weight, 0);
    expect(total).toBeCloseTo(1);
  });
});
