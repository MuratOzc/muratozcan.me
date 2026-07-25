import { Euler, Quaternion, Vector3 } from 'three';
import type { HyperWorld } from './HyperWorld';
import { geodesicTranslate, heightAboveGround } from './math/coords';
import { GyroVector } from './math/gyrovector';

export interface ControlsOptions {
  /** Eye height above the ground, in radians of geodesic distance. */
  eyeHeight?: number;
  /**
   * Walking speed as a multiple of eye height per second. Expressing it
   * relative to height is HyperEngine's convention and it is the right one —
   * it keeps the world feeling consistently scaled if you change how tall the
   * viewer is. CodeParade used 2.25.
   */
  speed?: number;
  sprintMultiplier?: number;
  lookSensitivity?: number;
  /** Seconds to reach ~63% of target velocity. 0 disables smoothing. */
  smoothTime?: number;
  /** Head bob amplitude as a fraction of eye height. 0 disables it. */
  headBob?: number;
  mode?: 'walk' | 'fly';
}

/**
 * First-person controls.
 *
 * Movement is a Möbius translation applied to `worldGV` — the world slides past
 * a stationary viewer.
 *
 * Two things make this different from an ordinary FPS controller:
 *
 * 1. `alignUpVector` runs every frame. Without it, holonomy gradually rolls the
 *    camera as you move. That looks like a bug and is not one.
 *
 * 2. Height has to be actively held. A geodesic that starts out horizontal does
 *    not stay parallel to the ground — walking "straight" drifts you off it.
 *    Measured over a full lap the drift is only a few percent here, but it
 *    accumulates, so walk mode pins the height every frame instead of hoping.
 */
export class Controls {
  eyeHeight: number;
  speed: number;
  sprintMultiplier: number;
  lookSensitivity: number;
  smoothTime: number;
  headBob: number;
  mode: 'walk' | 'fly';

  yaw = 0;
  pitch = 0;

  /**
   * Total path length walked, in radians. Distinct from distance-from-spawn,
   * which is a straight line and can never exceed PI — walk past the antipode
   * and it starts counting down again.
   */
  distanceWalked = 0;

  private keys = new Set<string>();
  private euler = new Euler(0, 0, 0, 'YXZ');
  private yawEuler = new Euler(0, 0, 0, 'YXZ');
  private yawQuat = new Quaternion();
  private velocity = new Vector3();
  private bobPhase = 0;
  private locked = false;

  constructor(
    private world: HyperWorld,
    private element: HTMLElement,
    opts: ControlsOptions = {},
  ) {
    this.eyeHeight = opts.eyeHeight ?? 0.1;
    this.speed = opts.speed ?? 2.25;
    this.sprintMultiplier = opts.sprintMultiplier ?? 2.6;
    this.lookSensitivity = opts.lookSensitivity ?? 0.0022;
    this.smoothTime = opts.smoothTime ?? 0.09;
    this.headBob = opts.headBob ?? 0.018;
    this.mode = opts.mode ?? 'walk';
    this.attach();
  }

  private attach(): void {
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
      if (e.code === 'KeyF') this.mode = this.mode === 'walk' ? 'fly' : 'walk';
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.velocity.set(0, 0, 0);
    });

    this.element.addEventListener('click', () => this.element.requestPointerLock());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.lookSensitivity;
      this.pitch -= e.movementY * this.lookSensitivity;
      const lim = Math.PI / 2 - 0.001;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    });
  }

  get isLocked(): boolean {
    return this.locked;
  }

  /** Current height above the ground, in radians. */
  get height(): number {
    return heightAboveGround(this.world.worldGV.inverse().point());
  }

  /** Drop the viewer onto the ground at the configured eye height. */
  reset(): void {
    this.world.worldGV = new GyroVector(new Vector3(0, -Math.tan(this.eyeHeight / 2), 0));
    this.velocity.set(0, 0, 0);
    this.bobPhase = 0;
    this.distanceWalked = 0;
  }

  /** Move the viewer vertically so they sit exactly `target` above the ground. */
  private setHeight(gv: GyroVector, target: number): GyroVector {
    const delta = target - heightAboveGround(gv.inverse().point());
    if (Math.abs(delta) < 1e-9) return gv;
    return gv.untranslate(geodesicTranslate(new Vector3(0, delta, 0)));
  }

  update(dt: number): void {
    // The Three camera only ever rotates; its position stays at the origin.
    this.euler.set(this.pitch, this.yaw, 0);
    this.world.camera.quaternion.setFromEuler(this.euler);

    const walking = this.mode === 'walk';

    const input = new Vector3();
    if (this.keys.has('KeyW')) input.z -= 1;
    if (this.keys.has('KeyS')) input.z += 1;
    if (this.keys.has('KeyA')) input.x -= 1;
    if (this.keys.has('KeyD')) input.x += 1;

    // Vertical. In walk mode this raises or lowers the height the viewer is
    // pinned to, so you stay where you left off rather than sinking back.
    let rise = 0;
    if (this.keys.has('Space')) rise += 1;
    if (this.keys.has('ShiftLeft') || this.keys.has('ControlLeft')) rise -= 1;

    const sprint = this.keys.has('KeyR') ? this.sprintMultiplier : 1;
    const metresPerSecond = this.speed * this.eyeHeight * sprint;

    if (walking && rise !== 0) {
      this.eyeHeight = Math.max(
        0.012,
        Math.min(1.4, this.eyeHeight + rise * metresPerSecond * dt),
      );
    }
    if (!walking) input.y = rise;

    // Walking uses yaw only, so looking up does not lift you off the ground.
    // Flying uses the full look rotation.
    let frame: Quaternion;
    if (walking) {
      this.yawEuler.set(0, this.yaw, 0);
      frame = this.yawQuat.setFromEuler(this.yawEuler);
    } else {
      frame = this.world.camera.quaternion;
    }

    const wish = new Vector3();
    if (input.lengthSq() > 0) {
      wish.copy(input).normalize().applyQuaternion(frame).multiplyScalar(metresPerSecond);
    }

    // Exponential approach — frame-rate independent, unlike a raw lerp factor.
    const k = this.smoothTime > 0 ? 1 - Math.exp(-dt / this.smoothTime) : 1;
    this.velocity.lerp(wish, k);

    const moved = this.velocity.length() * dt;
    this.distanceWalked += moved;
    if (moved > 1e-9) {
      let gv = this.world.worldGV.untranslate(
        geodesicTranslate(this.velocity.clone().multiplyScalar(dt)),
      );
      gv.alignUpVector();
      this.world.worldGV = gv;
    }

    if (walking) {
      // Head bob, driven by distance travelled rather than time, so it stops
      // when you do and does not speed up with frame rate.
      let target = this.eyeHeight;
      if (this.headBob > 0) {
        this.bobPhase += moved / Math.max(this.eyeHeight, 1e-6);
        const intensity = Math.min(1, this.velocity.length() / (this.speed * this.eyeHeight));
        target += Math.sin(this.bobPhase * 2.6) * this.headBob * this.eyeHeight * intensity;
      }
      this.world.worldGV = this.setHeight(this.world.worldGV, target);
    }
  }
}
