/**
 * Persisted viewer preferences.
 *
 * Store only — nothing here touches the DOM or the renderer. `settingsPanel`
 * writes, `main` subscribes and applies. Language is deliberately NOT here: it
 * predates this file, has its own storage key and its own listener set, and
 * everything that paints text already speaks that protocol.
 */

import { isTouch } from '../device';

export { isTouch };

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  fov: number;
  sensitivity: number;
  invertLook: boolean;
  headBob: boolean;
  quality: Quality;
  /** Upper bound on devicePixelRatio. Independent of `quality`. */
  resolution: number;
  showHelp: boolean;
  showDetails: boolean;
  showTests: boolean;
}

export const RESOLUTION_MIN = 0.5;
export const RESOLUTION_MAX = 3;

export function defaults(): Settings {
  return {
    fov: 58,
    sensitivity: 1,
    invertLook: false,
    headBob: true,
    // The shadow map is the single biggest cost and 4096 alone is ~64 MB of
    // GPU memory, which is more than some phones will give a tab at all.
    quality: isTouch ? 'medium' : 'high',
    // Phones report devicePixelRatio 3 or more, and capping below it is what
    // made the world look soft — the shadow budget is `quality`'s problem, not
    // this one's. 2 is the point past which a phone screen stops resolving the
    // difference and only the fill rate notices.
    resolution: 2,
    showHelp: true,
    // Diagnostics, not content. Anyone who wants them knows where they are.
    showDetails: false,
    showTests: false,
  };
}

const STORAGE_KEY = 'muratozcan.me:settings';

function load(): Settings {
  const base = defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Settings>;
    // Key-by-key, type-checked: a stored blob written by an older build must
    // never be able to put a string where the renderer expects a number.
    for (const key of Object.keys(base) as Array<keyof Settings>) {
      const v = saved[key];
      if (v !== undefined && typeof v === typeof base[key]) {
        (base[key] as unknown) = v;
      }
    }
    if (!['low', 'medium', 'high'].includes(base.quality)) base.quality = defaults().quality;
    base.fov = Math.max(40, Math.min(100, base.fov));
    base.sensitivity = Math.max(0.2, Math.min(3, base.sensitivity));
    base.resolution = Math.max(
      RESOLUTION_MIN,
      Math.min(RESOLUTION_MAX, base.resolution),
    );
  } catch {
    // Private browsing, or a corrupt blob. Defaults are always valid.
  }
  return base;
}

let current = load();
const listeners = new Set<(s: Settings) => void>();

export function settings(): Readonly<Settings> {
  return current;
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  if (current[key] === value) return;
  current = { ...current, [key]: value };
  persist();
  for (const fn of listeners) fn(current);
}

export function resetSettings(): void {
  current = defaults();
  persist();
  for (const fn of listeners) fn(current);
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Fine; the choice just does not survive a reload.
  }
}

/** Register for changes. Fires once immediately so callers have one code path. */
export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

export interface QualityProfile {
  shadowMapSize: number;
  shadows: boolean;
}

export const QUALITY: Record<Quality, QualityProfile> = {
  low: { shadowMapSize: 1024, shadows: false },
  medium: { shadowMapSize: 2048, shadows: true },
  high: { shadowMapSize: 4096, shadows: true },
};
