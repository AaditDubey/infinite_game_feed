// A stopwatch that only counts while running. Callers pass in the current time in
// milliseconds, so it has no clock of its own and tests can pick any time.
export interface Stopwatch {
  elapsedMs: number; // time counted before the current run
  runningSince: number | null; // when the current run started, or null while paused
}

export function start(now: number): Stopwatch {
  return { elapsedMs: 0, runningSince: now };
}

export function pause(watch: Stopwatch, now: number): Stopwatch {
  if (watch.runningSince === null) {
    return watch;
  }
  return { elapsedMs: elapsedMs(watch, now), runningSince: null };
}

export function resume(watch: Stopwatch, now: number): Stopwatch {
  if (watch.runningSince !== null) {
    return watch;
  }
  return { ...watch, runningSince: now };
}

export function elapsedMs(watch: Stopwatch, now: number): number {
  if (watch.runningSince === null) {
    return watch.elapsedMs;
  }
  return watch.elapsedMs + Math.max(0, now - watch.runningSince);
}

// mm:ss, with minutes going past 59 rather than adding hours.
export function formatClock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}
