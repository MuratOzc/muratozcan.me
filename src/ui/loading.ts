import { DefaultLoadingManager } from 'three';
import { onLangChange, t, type Localized } from '../content/i18n';

/**
 * The loading screen.
 *
 * Its markup is static in index.html, not created here — the bundle is ~680 kB
 * and the world is built synchronously the moment it parses, so an overlay
 * created from JS would first appear after the wait it exists to cover.
 *
 * The build is one long synchronous run. `stage()` is therefore a coroutine
 * boundary: it paints the new label and hands control back to the browser
 * until that frame is painted, before the caller does the next chunk of work.
 * Without the yield the bar would jump straight from 0 to 100 on the frame
 * everything finished.
 */

const el = document.getElementById('loading') as HTMLDivElement;
const barEl = document.getElementById('loading-bar') as HTMLDivElement;
const fillEl = document.getElementById('loading-fill') as HTMLDivElement;
const statusEl = document.getElementById('loading-status') as HTMLDivElement;
const hintEl = document.getElementById('loading-hint') as HTMLDivElement;

let label: Localized | null = null;

onLangChange(() => {
  if (label) statusEl.textContent = t(label);
});

function nextFrame(): Promise<void> {
  // A task queued from a frame callback runs after that frame is painted.
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

export function setHint(text: Localized): void {
  hintEl.textContent = t(text);
  onLangChange(() => {
    hintEl.textContent = t(text);
  });
}

/** Show `text` at `progress` (0..1), then give the browser a chance to paint. */
export async function stage(text: Localized, progress: number): Promise<void> {
  label = text;
  statusEl.textContent = t(text);
  // The first real measurement retires the indeterminate sweep.
  barEl.classList.remove('indeterminate');
  fillEl.style.transform = `scaleX(${progress})`;
  await nextFrame();
}

/**
 * Wait for every texture and image queued during the build.
 *
 * Counts through Three's default manager, which `TextureLoader` reports to on
 * its own and which props/rack.ts joins by hand for its raw `Image` loads.
 * Times out rather than trapping the visitor behind one 404.
 */
export async function waitForAssets(
  text: Localized,
  from: number,
  to: number,
  timeoutMs = 8000,
): Promise<void> {
  let loaded = 0;
  let total = 0;
  DefaultLoadingManager.onProgress = (_url, l, tt) => {
    loaded = l;
    total = tt;
  };

  label = text;
  statusEl.textContent = t(text);

  const deadline = performance.now() + timeoutMs;
  // A single frame settles the case where everything was already cached and
  // the manager drained before this ran.
  await nextFrame();

  while (total === 0 || loaded < total) {
    if (performance.now() > deadline) break;
    const ratio = total > 0 ? loaded / total : 0;
    fillEl.style.transform = `scaleX(${from + (to - from) * ratio})`;
    await nextFrame();
  }

  DefaultLoadingManager.onProgress = () => {};
  fillEl.style.transform = `scaleX(${to})`;
}

/** Fade out and remove. Safe to call twice. */
export function done(): void {
  if (el.classList.contains('done')) return;
  fillEl.style.transform = 'scaleX(1)';
  el.classList.add('done');
  // The bar's own transform transition bubbles up to this element, so the
  // handler has to name the property it is actually waiting on.
  el.addEventListener('transitionend', (e) => {
    if (e.target === el && e.propertyName === 'opacity') el.remove();
  });
  // transitionend does not fire if the element is already invisible (a
  // background tab, say), so the removal cannot be left to depend on it.
  setTimeout(() => el.remove(), 900);
}
