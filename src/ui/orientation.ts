import { onLangChange, t } from '../content/i18n';
import { UI } from '../content/ui';
import { isTouch } from './settings';

/**
 * The landscape nudge.
 *
 * A suggestion, not a gate — the world is playable in portrait, it is just
 * cramped, and a hard block on a phone held the "wrong" way is a good way to
 * lose a visitor at the door. Dismissing it lasts the session.
 */
export function attachOrientationHint(): void {
  const el = document.getElementById('rotate') as HTMLDivElement;
  const text = document.getElementById('rotate-text') as HTMLParagraphElement;
  const dismissBtn = document.getElementById('rotate-dismiss') as HTMLButtonElement;

  if (!isTouch) {
    el.remove();
    return;
  }

  let dismissed = false;
  const paint = () => {
    text.textContent = t(UI.rotate);
    dismissBtn.textContent = t(UI.rotateDismiss);
  };
  onLangChange(paint);
  paint();

  const sync = () => {
    el.hidden = dismissed || innerWidth >= innerHeight;
  };
  dismissBtn.addEventListener('click', () => {
    dismissed = true;
    sync();
  });

  addEventListener('resize', sync);
  addEventListener('orientationchange', sync);
  sync();
}
