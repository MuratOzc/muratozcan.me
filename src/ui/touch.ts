import type { Controls } from '../engine';

/**
 * Twin-stick touch controls.
 *
 * Left thumb drives a joystick, right thumb looks, a tap on the right side
 * interacts, and a hold on the sprint pad runs. Pointers are tracked by id, so
 * both thumbs work at once — the whole point of the layout.
 *
 * The joystick base is placed wherever the thumb lands inside the left zone
 * rather than pinned to a corner. A fixed stick has to be positioned for one
 * hand size and one phone width; a floating one is always under the thumb that
 * summoned it.
 *
 * SPRINT IS NOT A BUTTON, it is a region of the look surface. Deflecting the
 * stick to its edge used to sprint, which meant full deflection could never
 * just be "walk at the speed a keyboard walks". Making it a real button would
 * cost a third thumb, so the pad claims the pointer for sprint AND hands it to
 * the look handler: press and hold to run, slide the same thumb to keep
 * looking around while running.
 *
 * Interact is delivered as a synthetic `KeyE` keydown so the stations keep one
 * code path. props/contact.ts listens for that and does not need to know
 * whether a keyboard or a thumb produced it.
 */

/** Radius at which the stick reads as fully deflected, in CSS pixels. */
const STICK_RADIUS = 52;
/** Below this the stick reads as centred — thumbs are not precise. */
const DEAD_ZONE = 0.14;
/** Fraction of the screen width reserved for the movement stick. */
const MOVE_ZONE = 0.45;

const TAP_MS = 260;
const TAP_SLOP = 12;

/**
 * Radians of look per CSS pixel dragged, before the sensitivity setting.
 *
 * A thumb has a couple of centimetres of travel before it has to lift and
 * reset; a mouse has a desk. Matching the desktop rate here meant three or
 * four strokes to turn around, so the touch rate is 3x it and 1x on the
 * slider is the value a phone should actually ship with.
 */
const LOOK_RATE = 0.0096;

export function attachTouchControls(controls: Controls, canvas: HTMLElement): void {
  const layer = document.getElementById('touch') as HTMLDivElement;
  const stick = document.getElementById('stick') as HTMLDivElement;
  const knob = document.getElementById('stick-knob') as HTMLDivElement;
  const sprintPad = document.getElementById('sprint') as HTMLDivElement;
  layer.hidden = false;

  let moveId: number | null = null;
  let lookId: number | null = null;
  let originX = 0;
  let originY = 0;
  let lookX = 0;
  let lookY = 0;
  let lookStart = 0;
  let lookDrift = 0;
  /** True when the look pointer began on the sprint pad. */
  let lookIsSprint = false;

  const onSprintPad = (x: number, y: number): boolean => {
    const r = sprintPad.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  const releaseStick = () => {
    moveId = null;
    controls.moveInput.set(0, 0);
    stick.classList.remove('live');
    knob.style.transform = '';
  };

  const releaseSprint = () => {
    lookIsSprint = false;
    controls.sprintInput = false;
    sprintPad.classList.remove('held');
  };

  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    // Capture keeps a thumb that slides off the canvas still reporting to it.
    // Throws if the id is not live, which is not worth losing the touch over.
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Nothing to capture; the listeners on the element still fire.
    }

    const sprint = onSprintPad(e.clientX, e.clientY);

    if (!sprint && e.clientX < innerWidth * MOVE_ZONE && moveId === null) {
      moveId = e.pointerId;
      originX = e.clientX;
      originY = e.clientY;
      stick.style.left = `${originX}px`;
      stick.style.top = `${originY}px`;
      stick.classList.add('live');
    } else if (lookId === null) {
      lookId = e.pointerId;
      lookX = e.clientX;
      lookY = e.clientY;
      lookStart = performance.now();
      lookDrift = 0;
      lookIsSprint = sprint;
      if (sprint) {
        controls.sprintInput = true;
        sprintPad.classList.add('held');
      }
    }
  });

  canvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (e.pointerId === moveId) {
      let dx = e.clientX - originX;
      let dy = e.clientY - originY;
      const len = Math.hypot(dx, dy);

      // Drag past the ring and the base follows, so a thumb that wanders does
      // not silently lose its range of travel.
      if (len > STICK_RADIUS * 1.6) {
        const pull = len - STICK_RADIUS * 1.6;
        originX += (dx / len) * pull;
        originY += (dy / len) * pull;
        stick.style.left = `${originX}px`;
        stick.style.top = `${originY}px`;
        dx = e.clientX - originX;
        dy = e.clientY - originY;
      }

      const mag = Math.min(1, Math.hypot(dx, dy) / STICK_RADIUS);
      const clamped = mag > 0 ? STICK_RADIUS * mag : 0;
      const ang = Math.atan2(dy, dx);
      knob.style.transform = `translate(${Math.cos(ang) * clamped}px, ${Math.sin(ang) * clamped}px)`;

      if (mag < DEAD_ZONE) {
        controls.moveInput.set(0, 0);
      } else {
        // Rescale past the dead zone so the first responsive pixel is a slow
        // walk rather than a jump to 14% speed. Full deflection is the plain
        // walking speed a keyboard gives, no faster.
        const scaled = (mag - DEAD_ZONE) / (1 - DEAD_ZONE);
        controls.moveInput.set(Math.cos(ang) * scaled, -Math.sin(ang) * scaled);
      }
    } else if (e.pointerId === lookId) {
      const dx = e.clientX - lookX;
      const dy = e.clientY - lookY;
      lookX = e.clientX;
      lookY = e.clientY;
      lookDrift += Math.abs(dx) + Math.abs(dy);
      controls.lookBy(-dx * LOOK_RATE, -dy * LOOK_RATE);
    }
  });

  const end = (e: PointerEvent) => {
    if (e.pointerId === moveId) {
      releaseStick();
    } else if (e.pointerId === lookId) {
      // A touch that neither travelled nor lingered is a tap, and a tap is
      // how you interact with whatever the crosshair is on. A thumb coming off
      // the sprint pad is never that, however briefly it was down.
      if (
        !lookIsSprint &&
        performance.now() - lookStart < TAP_MS &&
        lookDrift < TAP_SLOP
      ) {
        dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
      }
      if (lookIsSprint) releaseSprint();
      lookId = null;
    }
  };

  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  // A pointer lost to a system gesture never reports up; without this the
  // stick would stay deflected and the viewer would walk off on their own.
  const releaseAll = () => {
    releaseStick();
    releaseSprint();
    lookId = null;
  };
  addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
  });
}
