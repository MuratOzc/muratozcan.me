import type { RenderQuality } from './engine';
import { isTouch } from './device';

type Pixels = Pick<RenderQuality, 'pixelBudget' | 'maxPixelRatio' | 'samples' | 'softShadows'>;
type Scene = Pick<RenderQuality, 'shadowMapSize' | 'shadowExtent' | 'auxInterval'>;

const MP = 1e6;

// 2.1, 3.7 and 8.3 MP are 1080p, 1440p and 4K: lower them and those screens stop rendering natively.
const PIXELS: readonly Pixels[] = [
  { pixelBudget: 0.3 * MP, maxPixelRatio: 1, samples: 0, softShadows: false },
  { pixelBudget: 0.5 * MP, maxPixelRatio: 1, samples: 0, softShadows: false },
  { pixelBudget: 0.9 * MP, maxPixelRatio: 1.5, samples: 2, softShadows: false },
  { pixelBudget: 1.4 * MP, maxPixelRatio: 2, samples: 2, softShadows: true },
  { pixelBudget: 2.1 * MP, maxPixelRatio: 2, samples: 4, softShadows: true },
  { pixelBudget: 3.7 * MP, maxPixelRatio: 2, samples: 4, softShadows: true },
  { pixelBudget: 8.3 * MP, maxPixelRatio: 2, samples: 4, softShadows: true },
];

const SCENE: readonly Scene[] = [
  { shadowMapSize: 0, shadowExtent: 0.45, auxInterval: 0.3 },
  { shadowMapSize: 1024, shadowExtent: 0.45, auxInterval: 0.15 },
  { shadowMapSize: 2048, shadowExtent: 0.7, auxInterval: 0.1 },
  // 64 MB of depth texture, which is more than some phones will give a tab.
  ...(isTouch ? [] : [{ shadowMapSize: 4096, shadowExtent: 1.0, auxInterval: 0.1 }]),
];

type Axis = 'pixels' | 'scene';
const AXES: readonly Axis[] = ['pixels', 'scene'];
const TOP: Record<Axis, number> = { pixels: PIXELS.length - 1, scene: SCENE.length - 1 };

export type Level = Record<Axis, number>;
export type Graphics = 'auto' | 'low' | 'medium' | 'high';

export const PRESET: Record<Exclude<Graphics, 'auto'>, Level> = {
  low: { pixels: 2, scene: 0 },
  medium: { pixels: 4, scene: 2 },
  high: { ...TOP },
};

let level: Level = isTouch ? { pixels: 3, scene: 1 } : { pixels: 5, scene: 2 };
const listeners = new Set<(q: RenderQuality) => void>();

export function currentLevel(): Readonly<Level> {
  return level;
}

export function currentQuality(): RenderQuality {
  return { ...PIXELS[level.pixels], ...SCENE[level.scene] };
}

export function levelCount(axis: Axis): number {
  return TOP[axis] + 1;
}

export function setLevel(next: Level): void {
  const clamped = {
    pixels: Math.max(0, Math.min(TOP.pixels, next.pixels)),
    scene: Math.max(0, Math.min(TOP.scene, next.scene)),
  };
  if (clamped.pixels === level.pixels && clamped.scene === level.scene) return;
  level = clamped;
  const quality = currentQuality();
  for (const fn of listeners) fn(quality);
}

export function onQualityChange(fn: (q: RenderQuality) => void): () => void {
  listeners.add(fn);
  fn(currentQuality());
  return () => listeners.delete(fn);
}

/** Milliseconds per frame: `cpu` spent on this thread, `total` for the whole frame. */
export interface Cost {
  cpu: number;
  total: number;
}

// A step down that saves less than this is undone, or a machine that is slow
// for a reason neither ladder touches gets walked to the bottom of both.
const GAIN = 0.88;

const CPU_BOUND = 0.6;
const CLEARLY_WORSE = 1.3;

class Tuner {
  private trial: { axis: Axis; from: number; total: number } | null = null;
  /** Cost at which stepping down an axis last failed to help; 0 if it never has. */
  private futile: Record<Axis, number> = { pixels: 0, scene: 0 };

  constructor(private readonly keep: number) {}

  judge(cost: Cost): 'none' | 'kept' | 'undid climb' | 'undid descent' {
    const trial = this.trial;
    if (!trial) return 'none';
    this.trial = null;

    const climbed = level[trial.axis] > trial.from;
    if (climbed ? cost.total <= this.keep : cost.total <= trial.total * GAIN) return 'kept';

    if (!climbed) this.futile[trial.axis] = cost.total;
    setLevel({ ...level, [trial.axis]: trial.from });
    return climbed ? 'undid climb' : 'undid descent';
  }

  descend(cost: Cost): boolean {
    const order: Axis[] =
      cost.cpu > CPU_BOUND * cost.total ? ['scene', 'pixels'] : ['pixels', 'scene'];
    for (const axis of order) {
      if (level[axis] === 0) continue;
      if (cost.total < this.futile[axis] * CLEARLY_WORSE) continue;
      this.step(axis, -1, cost);
      return true;
    }
    return false;
  }

  climb(axis: Axis, cost: Cost): boolean {
    if (level[axis] === TOP[axis]) return false;
    this.step(axis, 1, cost);
    return true;
  }

  abandon(): void {
    this.trial = null;
  }

  private step(axis: Axis, by: number, cost: Cost): void {
    this.trial = { axis, from: level[axis], total: cost.total };
    setLevel({ ...level, [axis]: level[axis] + by });
  }
}

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[values.length >> 1];
}

// Of 16.7 ms at 60Hz. This is one view from one spot, and others cost more.
const CALIBRATED_FRAME = 12.5;

// `timeFrame` must block until the GPU has finished the frame, and must not be
// called from inside the frame loop: there the wait also covers presenting the
// previous frame, and every level reads as slow.
export function calibrate(timeFrame: () => Cost): void {
  const measure = (): Cost => {
    // Discarded: the first frame on a new level pays for its reallocations.
    timeFrame();
    const first = timeFrame();
    if (first.total > 2 * CALIBRATED_FRAME) return first;
    const three = [first, timeFrame(), timeFrame()];
    return { cpu: median(three.map((c) => c.cpu)), total: median(three.map((c) => c.total)) };
  };

  const tuner = new Tuner(CALIBRATED_FRAME);
  let cost = measure();

  while (cost.total > CALIBRATED_FRAME && tuner.descend(cost)) {
    const after = measure();
    if (tuner.judge(after) === 'kept') cost = after;
  }

  // Also after a descent: one bad reading at the start is otherwise a level
  // lost for as long as the governor takes to win it back.
  const open = new Set(AXES);
  while (open.size > 0) {
    for (const axis of AXES) {
      if (!open.has(axis)) continue;
      if (!tuner.climb(axis, cost)) {
        open.delete(axis);
        continue;
      }
      const after = measure();
      if (tuner.judge(after) === 'kept') cost = after;
      else open.delete(axis);
    }
  }
}

// SMOOTH_FRAME < SLOW_FRAME. The gap between them is what stops a level flapping.
const SLOW_FRAME = 1000 / 54;
const SMOOTH_FRAME = 1000 / 57.5;

const WINDOW = 2;
const SETTLE = 0.5;
const STALL = 0.25;
const FIRST_RETRY = 20;
const LAST_RETRY = 600;

export class Governor {
  private tuner = new Tuner(SMOOTH_FRAME);
  private clock = 0;
  private settle = SETTLE;
  private frames = 0;
  private seconds = 0;
  private work = 0;
  private climbAt = FIRST_RETRY;
  private wait = FIRST_RETRY;
  private turn = 0;

  /** `dt` is seconds since the previous frame; `work` is milliseconds this one kept the thread. */
  frame(dt: number, work: number): void {
    this.clock += dt;
    if (dt > STALL) {
      this.restart();
      return;
    }
    if (this.settle > 0) {
      this.settle -= dt;
      return;
    }
    this.frames++;
    this.seconds += dt;
    this.work += work;
    if (this.seconds < WINDOW) return;

    const cost = { cpu: this.work / this.frames, total: (1000 * this.seconds) / this.frames };
    this.restart();
    const before = level;
    this.decide(cost);
    if (level !== before) this.settle = SETTLE;
  }

  reset(): void {
    this.restart();
    this.tuner.abandon();
    this.settle = SETTLE;
    this.climbAt = this.clock + FIRST_RETRY;
  }

  private decide(cost: Cost): void {
    const verdict = this.tuner.judge(cost);
    if (verdict === 'undid climb') this.refuse();
    if (verdict === 'undid climb' || verdict === 'undid descent') return;

    if (cost.total > SLOW_FRAME) {
      if (this.tuner.descend(cost)) this.refuse();
    } else if (cost.total <= SMOOTH_FRAME && this.clock >= this.climbAt) {
      for (let i = 0; i < AXES.length; i++) {
        if (this.tuner.climb(AXES[this.turn++ % AXES.length], cost)) break;
      }
    }
  }

  private restart(): void {
    this.frames = 0;
    this.seconds = 0;
    this.work = 0;
  }

  private refuse(): void {
    this.climbAt = this.clock + this.wait;
    this.wait = Math.min(this.wait * 2, LAST_RETRY);
  }
}
