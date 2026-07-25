import type { GyroVector } from '../engine';
import { distanceToViewer, type Poi } from './layout';

/**
 * Proximity panels.
 *
 * Walking is the only interaction. Get near something and its text fades in;
 * walk away and it fades out. No clicking, no menus, nothing to learn.
 *
 * One panel at a time, showing whichever point of interest is nearest and in
 * range. Showing several at once turns into overlapping clutter fast, and in
 * spherical space a distant thing can be very large on screen, so anchoring
 * panels to objects would put text in wild places. A single fixed panel keeps
 * it calm.
 */
export class ProximityPanel {
  private el: HTMLElement;
  private titleEl: HTMLElement;
  private bodyEl: HTMLElement;
  private current: string | null = null;
  private opacity = 0;

  constructor(container: HTMLElement = document.body) {
    this.el = document.createElement('div');
    this.el.className = 'proximity-panel';
    this.titleEl = document.createElement('h2');
    this.bodyEl = document.createElement('p');
    this.el.append(this.titleEl, this.bodyEl);
    container.append(this.el);
  }

  update(pois: Poi[], worldGV: GyroVector, dt: number): Poi | null {
    let best: Poi | null = null;
    let bestRatio = Infinity;

    for (const poi of pois) {
      const d = distanceToViewer(poi.gv, worldGV);
      // Compare as a fraction of each POI's own radius, so a small marker you
      // are standing on beats a large landmark that is merely near.
      const ratio = d / poi.radius;
      if (ratio < 1 && ratio < bestRatio) {
        bestRatio = ratio;
        best = poi;
      }
    }

    if (best && best.id !== this.current) {
      this.current = best.id;
      this.titleEl.textContent = best.title;
      this.bodyEl.textContent = best.body;
      this.el.classList.toggle('untitled', best.title === '');
    }
    if (!best) this.current = null;

    // Fade on distance rather than snapping, and ease out faster than in so
    // walking past something does not leave text hanging around.
    const target = best ? Math.min(1, (1 - bestRatio) * 2.5) : 0;
    const rate = target > this.opacity ? 6 : 9;
    this.opacity += (target - this.opacity) * Math.min(1, rate * dt);
    this.el.style.opacity = this.opacity.toFixed(3);
    this.el.style.visibility = this.opacity < 0.01 ? 'hidden' : 'visible';

    return best;
  }
}
