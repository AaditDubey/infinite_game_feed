import { elapsedMs, formatClock, pause, resume, start } from './stopwatch';

describe('stopwatch', () => {
  it('counts from zero while running', () => {
    const watch = start(1_000);
    expect(elapsedMs(watch, 1_000)).toBe(0);
    expect(elapsedMs(watch, 4_500)).toBe(3_500);
  });

  it("doesn't count time while paused", () => {
    const paused = pause(start(0), 2_000);
    expect(elapsedMs(paused, 60_000)).toBe(2_000);
    const resumed = resume(paused, 60_000);
    expect(elapsedMs(resumed, 61_000)).toBe(3_000);
  });

  it('ignores a second pause or a second resume', () => {
    const running = start(0);
    expect(resume(running, 5_000)).toBe(running);
    const paused = pause(running, 1_000);
    expect(pause(paused, 9_000)).toBe(paused);
  });

  it('never counts backwards if the clock jumps back', () => {
    expect(elapsedMs(start(10_000), 9_000)).toBe(0);
  });
});

describe('formatClock', () => {
  it.each([
    [0, '00:00'],
    [999, '00:00'],
    [1_000, '00:01'],
    [192_000, '03:12'],
    [3_665_000, '61:05'],
  ])('shows %i ms as %s', (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });
});
