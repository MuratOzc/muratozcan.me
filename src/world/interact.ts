import { Vector3, type Object3D } from 'three';
import {
  geodesicRadius,
  unitToPoincare,
  type GyroVector,
  type HyperObject,
  type HyperWorld,
} from '../engine';
import { L, onLangChange, t, type Localized } from '../content/i18n';
import { isTouch } from '../device';
import { units } from './placement';

const PROMPT = isTouch ? L('tap', 'dokun') : L('press E', 'E’ye bas');

const RANGE_UNITS = 3.2;
const MIN_HALF_ANGLE = 0.03;

export interface AimTarget {
  name: Localized | (() => string);
  /** Read once: a target on a node that moves afterwards is still aimed at where it stood. */
  at: Object3D | Vector3;
  /** Authored units, like `range`. */
  size: number;
  range?: number;
  front?: Vector3;
  enabled?: () => boolean;
  use: () => void;
}

interface Entry {
  target: AimTarget;
  at: Vector3;
  ahead: Vector3 | null;
  range: number;
  sinRho: number;
}

export class Aim {
  hovered: AimTarget | null = null;

  private readonly pending: AimTarget[] = [];
  private readonly entries: Entry[] = [];
  private readonly promptEl: HTMLDivElement;
  private shown = '';
  private readonly poincare = new Vector3();
  private readonly point = new Vector3();
  private readonly ahead = new Vector3();
  private readonly forward = new Vector3();

  constructor(
    private readonly world: HyperWorld,
    private readonly object: HyperObject,
  ) {
    this.promptEl = document.createElement('div');
    this.promptEl.className = 'aim-prompt';
    document.body.append(this.promptEl);
    onLangChange(() => this.paint());

    addEventListener('keydown', (e) => {
      if (e.code !== 'KeyE' || e.repeat || !this.hovered) return;
      this.hovered.use();
    });
  }

  add(target: AimTarget): AimTarget {
    this.pending.push(target);
    return target;
  }

  update(worldGV: GyroVector): AimTarget | null {
    if (this.pending.length > 0) this.resolve();

    const composed = this.object.localGV.add(worldGV);
    this.forward.set(0, 0, -1).applyQuaternion(this.world.camera.quaternion);

    let best: AimTarget | null = null;
    let bestRatio = 1;
    for (const entry of this.entries) {
      if (entry.target.enabled && !entry.target.enabled()) continue;

      // The shader's own transform, not a Raycaster: a ray against the model matrix drifts from where the vertex shader draws.
      composed.transformPoint(this.lift(entry.at), this.point);
      const d = geodesicRadius(this.point);
      if (d > entry.range) continue;
      if (entry.ahead) {
        composed.transformPoint(this.lift(entry.ahead), this.ahead);
        if (geodesicRadius(this.ahead) >= d) continue;
      }

      const half = Math.max(
        MIN_HALF_ANGLE,
        Math.asin(Math.min(1, entry.sinRho / Math.max(1e-4, Math.sin(d)))),
      );
      const angle = Math.acos(Math.max(-1, Math.min(1, this.point.normalize().dot(this.forward))));
      const ratio = angle / half;
      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = entry.target;
      }
    }

    this.hovered = best;
    this.paint();
    return best;
  }

  private lift(unit: Vector3): Vector3 {
    return unitToPoincare(this.poincare.copy(unit), this.object.useTanKHeight, this.poincare);
  }

  private resolve(): void {
    this.object.updateMatrixWorld(true);
    for (const target of this.pending) {
      const at =
        target.at instanceof Vector3
          ? target.at.clone().applyMatrix4(this.object.matrixWorld)
          : new Vector3().setFromMatrixPosition(target.at.matrixWorld);
      const ahead = target.front
        ? target.front.clone().normalize().multiplyScalar(0.5).applyQuaternion(this.object.quaternion).add(at)
        : null;
      this.entries.push({
        target,
        at,
        ahead,
        range: units(target.range ?? RANGE_UNITS),
        sinRho: Math.sin(units(target.size)),
      });
    }
    this.pending.length = 0;
  }

  private paint(): void {
    let text = '';
    if (this.hovered) {
      const name = this.hovered.name;
      text = `${typeof name === 'function' ? name() : t(name)} — ${t(PROMPT)}`;
    }
    if (text === this.shown) return;
    this.shown = text;
    if (text) this.promptEl.textContent = text;
    this.promptEl.style.opacity = text ? '1' : '0';
  }
}
