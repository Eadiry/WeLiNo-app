/**
 * Shared tuning for the continuous/webtoon readers' autoscroll. One tick
 * every `AUTO_SCROLL_TICK_MS`; each tick advances the scroll offset by
 * `autoScrollStepPerTick(speed)` px, so speed level 5 ≈ 150 px/s and level
 * 10 ≈ 300 px/s.
 */
export const AUTO_SCROLL_TICK_MS = 50;

export const autoScrollStepPerTick = (speedLevel: number): number =>
  Math.max(1, speedLevel) * 1.5;
