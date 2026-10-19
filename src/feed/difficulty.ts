// A difficulty band, 1 (Easy) to 5 (Master), as in the band table in docs/phase_1.md. Each game
// has the same bands; the feed keeps its own copy of the type, because only games.ts imports
// from src/games/.
export type Band = 1 | 2 | 3 | 4 | 5;

// Each new page is Easy with probability 0.8 and Medium with 0.2. Bands 3 to 5 wait for
// adaptive difficulty.
export const BAND_MIX = [
  { band: 1, weight: 0.8 },
  { band: 2, weight: 0.2 },
] as const;

// `random` returns a number in [0, 1), like Math.random: below 0.8 is Easy.
export function pickBand(random: () => number): Band {
  const value = random();
  let below = 0;
  for (const { band, weight } of BAND_MIX) {
    below += weight;
    if (value < below) {
      return band;
    }
  }
  // Rounding can leave the weights' total a hair under 1.
  return BAND_MIX[BAND_MIX.length - 1].band;
}
