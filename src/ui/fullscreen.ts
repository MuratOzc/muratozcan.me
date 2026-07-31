import { onLangChange, t } from '../content/i18n';
import { UI } from '../content/ui';
import { isTouch } from '../device';

/**
 * Fullscreen toggle.
 *
 * Worth a button of its own on a phone: the browser's own chrome eats a strip
 * of a screen that is already short in landscape, and it is the only way to
 * get rid of it. The button hides itself where the API does not exist —
 * Safari on iPhone refuses fullscreen for anything that is not a <video>, and
 * a control that silently does nothing is worse than no control.
 */

interface WebkitElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}
interface WebkitDocument extends Document {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
}

const root = document.documentElement as WebkitElement;
const doc = document as WebkitDocument;

// lib.dom declares both as always present. They are not: Safari on iPhone
// ships neither, so the annotation has to overrule the lib or the support
// check below is compiled away as a tautology.
type FullscreenCall = (() => Promise<void> | void) | undefined;

const request: FullscreenCall = root.requestFullscreen ?? root.webkitRequestFullscreen;
const exit: FullscreenCall = doc.exitFullscreen ?? doc.webkitExitFullscreen;

export function isFullscreenSupported(): boolean {
  return Boolean(request && exit);
}

/**
 * Declared locally rather than leaned on from lib.dom, which types `lock` as
 * always present and its argument as a closed union — neither of which is safe
 * to assume across the browsers that actually run this.
 */
interface OrientationLock {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
}

const orientation = (screen as unknown as { orientation?: OrientationLock })
  .orientation;

/**
 * Landscape is only lockable from inside fullscreen, and only on a phone —
 * which is the whole reason the two are wired together here rather than the
 * lock being offered on its own. Every failure mode is a refusal we cannot act
 * on: no API, a desktop, or a browser that simply says no.
 */
function applyOrientationLock(on: boolean): void {
  if (!isTouch) return;
  try {
    if (on) void orientation?.lock?.('landscape').catch(() => {});
    else orientation?.unlock?.();
  } catch {
    // Older engines reject by throwing rather than returning a rejection.
  }
}

function isFullscreen(): boolean {
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

export function attachFullscreenButton(): void {
  const btn = document.getElementById('fullscreen-btn') as HTMLButtonElement;
  if (!isFullscreenSupported()) return;
  btn.hidden = false;

  const enterIcon = btn.querySelector('.fs-enter') as SVGElement;
  const exitIcon = btn.querySelector('.fs-exit') as SVGElement;

  const paint = () => {
    const on = isFullscreen();
    enterIcon.style.display = on ? 'none' : '';
    exitIcon.style.display = on ? '' : 'none';
    btn.setAttribute('aria-label', t(on ? UI.exitFullscreen : UI.fullscreen));
  };

  btn.addEventListener('click', () => {
    // Rejects when the gesture is not deemed user-activated, which is not
    // something the viewer can act on and not worth an unhandled rejection.
    void (isFullscreen() ? exit!.call(doc) : request!.call(root));
  });

  // Escape and the system gesture both leave fullscreen without touching the
  // button, so the icon follows the document rather than the last click.
  const onChange = () => {
    paint();
    applyOrientationLock(isFullscreen());
  };
  document.addEventListener('fullscreenchange', onChange);
  document.addEventListener('webkitfullscreenchange', onChange);
  onLangChange(paint);
  paint();
}
