/**
 * Two languages, one world.
 *
 * Everything the visitor reads is canvas-rendered or DOM text, so switching
 * language means re-rendering textures and panels — there is no HTML to
 * translate in place. The mechanism: content declares `Localized` pairs,
 * anything that painted text registers a refresh callback, and `setLang`
 * calls them all.
 *
 * Turkish note: `toUpperCase()` is wrong for Turkish (i -> İ, ı -> I), so
 * anything uppercasing display text must go through `upper()` below.
 */

export type Lang = 'en' | 'tr';

export interface Localized {
  en: string;
  tr: string;
}

/** Shorthand for building a Localized pair. */
export function L(en: string, tr: string): Localized {
  return { en, tr };
}

const STORAGE_KEY = 'muratozcan.me:lang';

function initial(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'tr') return saved;
  } catch {
    // Private browsing; default silently.
  }
  return navigator.language?.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

let current: Lang = initial();
const listeners = new Set<(l: Lang) => void>();

// CSS text-transform takes its casing rules from this: without it Turkish i is capitalised to I, not İ.
function markDocument(): void {
  document.documentElement.lang = current;
}
markDocument();

export function lang(): Lang {
  return current;
}

/** Resolve a Localized pair in the current language. */
export function t(s: Localized): string {
  return s[current];
}

/** Locale-correct uppercase for display text. */
export function upper(s: string): string {
  return s.toLocaleUpperCase(current === 'tr' ? 'tr-TR' : 'en-US');
}

export function setLang(l: Lang): void {
  if (l === current) return;
  current = l;
  markDocument();
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    // Fine; the choice just does not survive a reload.
  }
  for (const fn of listeners) fn(l);
}

/**
 * Register for language changes. Returns an unsubscribe, though in practice
 * world text lives as long as the page.
 */
export function onLangChange(fn: (l: Lang) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
