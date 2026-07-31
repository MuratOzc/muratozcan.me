/**
 * Touch hardware is the signal, not screen width: a narrow desktop window is
 * still a desktop, and a tablet in landscape is not.
 *
 * Its own module because both the settings layer and the world's props need
 * it, and the world must not have to import from the UI to find out.
 */
export const isTouch =
  matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
