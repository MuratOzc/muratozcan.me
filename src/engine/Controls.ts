import { Euler, Quaternion, Vector3 } from 'three';
import type { HyperWorld } from './HyperWorld';
import { geodesicTranslate } from './math/coords';

export interface ControlsOptions {
  speed?: number;
  /** Keep the horizon level while walking. Turn off for free flight. */
  levelHorizon?: boolean;
  lookSensitivity?: number;
}

/**
 * First-person controls.
 *
 * Movement is a Möbius translation applied to `worldGV` — the world slides past
 * a stationary viewer. Ported from the freeFly branch of HyperEngine's
 * Player.cs, minus gravity and collision.
 *
 * `alignUpVector` runs every frame when levelHorizon is on. Without it holonomy
 * gradually rolls the camera as you move, which looks like a bug but is real
 * geometry.
 */
export class Controls {
  speed: number;
  levelHorizon: boolean;
  lookSensitivity: number;

  yaw = 0;
  pitch = 0;
  private keys = new Set<string>();
  private euler = new Euler(0, 0, 0, 'YXZ');
  private locked = false;

  constructor(private world: HyperWorld, private element: HTMLElement, opts: ControlsOptions = {}) {
    this.speed = opts.speed ?? 0.35;
    this.levelHorizon = opts.levelHorizon ?? true;
    this.lookSensitivity = opts.lookSensitivity ?? 0.0022;
    this.attach();
  }

  private attach(): void {
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    this.element.addEventListener('click', () => this.element.requestPointerLock());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.lookSensitivity;
      this.pitch -= e.movementY * this.lookSensitivity;
      const lim = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    });
  }

  get isLocked(): boolean {
    return this.locked;
  }

  update(dt: number): void {
    // The Three camera only ever rotates; its position stays at the origin.
    this.euler.set(this.pitch, this.yaw, 0);
    this.world.camera.quaternion.setFromEuler(this.euler);

    const input = new Vector3();
    if (this.keys.has('KeyW')) input.z -= 1;
    if (this.keys.has('KeyS')) input.z += 1;
    if (this.keys.has('KeyA')) input.x -= 1;
    if (this.keys.has('KeyD')) input.x += 1;
    if (this.keys.has('Space')) input.y += 1;
    if (this.keys.has('ShiftLeft') || this.keys.has('ControlLeft')) input.y -= 1;
    if (input.lengthSq() === 0) return;

    input.normalize();

    // Walking uses yaw only so looking up does not lift you off the ground;
    // free flight uses the full look rotation.
    const frame = this.levelHorizon
      ? new Quaternion().setFromEuler(new Euler(0, this.yaw, 0, 'YXZ'))
      : this.world.camera.quaternion;

    const displacement = input
      .applyQuaternion(frame)
      .multiplyScalar(this.speed * dt * (this.keys.has('KeyR') ? 3 : 1));

    // The world moves opposite the player.
    let gv = this.world.worldGV.untranslate(geodesicTranslate(displacement));
    if (this.levelHorizon) gv.alignUpVector();
    this.world.worldGV = gv;
  }
}
