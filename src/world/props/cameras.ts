import { BoxGeometry, Group, Vector3 } from 'three';
import { GyroVector, HyperObject, type HyperWorld } from '../../engine';

/**
 * Security cameras that watch you.
 *
 * The tracking is the whole point, and it works because of how the engine is
 * shaped rather than in spite of it: the viewer never moves, so "where is the
 * player" is answered by composing the camera's own placement with the world
 * transform and inverting it. The result is the viewer's position expressed in
 * the camera's local frame, which is exactly what an aim needs.
 *
 * No raycast, no world-space lookAt, no distance check. One GyroVector
 * composition per camera per frame.
 */

const HOUSING = 0x6f7780;
const LENS = 0x14181c;
const MAST = 0x9aa0a6;

/** One camera head: mount, body, sunshade, lens. Built facing -z. */
function buildHead(world: HyperWorld, object: HyperObject, parent: Group): void {
  const body = new BoxGeometry(0.2, 0.19, 0.52, 2, 2, 3);
  body.translate(0, 0, -0.1);
  object.addGeometry(world.shared, body, { color: HOUSING, ambient: 0.5 }, parent);

  const shade = new BoxGeometry(0.26, 0.03, 0.44, 2, 1, 3);
  shade.translate(0, 0.12, -0.14);
  object.addGeometry(world.shared, shade, { color: 0x848c94, ambient: 0.55 }, parent);

  const lens = new BoxGeometry(0.13, 0.13, 0.06, 1, 1, 1);
  lens.translate(0, 0, -0.38);
  object.addGeometry(world.shared, lens, { color: LENS, ambient: 0.25 }, parent);
}

/**
 * A camera that turns to face the viewer.
 *
 * The head is a nested node so it can rotate independently of the pole it is
 * bolted to — the shader reads the full world matrix, so nesting just works.
 */
export class Watcher {
  readonly head = new Group();
  /** Radians per second the head can turn. Deliberately unhurried. */
  slew = 1.6;

  private yaw = 0;
  private pitch = 0;
  private readonly local = new Vector3();

  constructor(
    private readonly object: HyperObject,
    /** Yaw of the pole itself, which the head's rotation is relative to. */
    private readonly baseYaw: number,
  ) {
    this.head.rotation.order = 'YXZ';
  }

  update(worldGV: GyroVector, dt: number): void {
    // Compose the camera's placement with the world transform, then invert:
    // that maps the viewer (who sits permanently at the origin) into this
    // camera's own frame.
    const composed = this.object.localGV.add(worldGV);
    composed.inverse().point(this.local);

    const horizontal = Math.hypot(this.local.x, this.local.z);
    // The head hangs under a node that already carries the pole's yaw, so
    // subtract it to get a rotation relative to the parent.
    const targetYaw = Math.atan2(-this.local.x, -this.local.z) - this.baseYaw;
    const targetPitch = Math.atan2(this.local.y, horizontal);

    const step = this.slew * dt;
    this.yaw += clampAngle(targetYaw - this.yaw) * Math.min(1, step);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, step);

    this.head.rotation.y = this.yaw;
    this.head.rotation.x = this.pitch;
  }
}

/** Shortest signed way round to an angle difference. */
function clampAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export interface CameraMastResult {
  object: HyperObject;
  watchers: Watcher[];
}

/**
 * The security station: a mast with several cameras, all of them tracking.
 *
 * Heights are staggered and the arms point different ways, so from a distance
 * it reads as a cluster rather than a stack — and so at least one head is
 * always visibly moving no matter where you approach from.
 */
export function buildCameraMast(
  world: HyperWorld,
  at: GyroVector,
  baseYaw: number,
): CameraMastResult {
  const object = new HyperObject(at, false);
  object.rotation.y = baseYaw;

  const MAST_H = 3.4;
  const base = new BoxGeometry(0.6, 0.16, 0.6, 2, 1, 2);
  base.translate(0, 0.08, 0);
  object.addGeometry(world.shared, base, { color: 0x7d838a, ambient: 0.55 });

  const pole = new BoxGeometry(0.16, MAST_H, 0.16, 2, 12, 2);
  pole.translate(0, MAST_H / 2, 0);
  object.addGeometry(world.shared, pole, { color: MAST, ambient: 0.55 });

  const watchers: Watcher[] = [];
  const arms: Array<[number, number]> = [
    // [height, bearing of the arm]
    [3.15, 0],
    [2.55, 2.2],
    [1.95, 4.3],
  ];

  for (const [height, bearing] of arms) {
    const armLen = 0.5;
    const arm = new BoxGeometry(0.08, 0.08, armLen, 1, 1, 2);
    arm.translate(0, 0, -armLen / 2);
    const armNode = new Group();
    armNode.position.y = height;
    armNode.rotation.y = bearing;
    object.add(armNode);
    object.addGeometry(world.shared, arm, { color: MAST, ambient: 0.55 }, armNode);

    const head = new Group();
    head.position.z = -armLen;
    armNode.add(head);
    const watcher = new Watcher(object, baseYaw + bearing);
    head.add(watcher.head);
    buildHead(world, object, watcher.head);
    watchers.push(watcher);
  }

  world.add(object);
  return { object, watchers };
}

/**
 * A lone camera on a slim pole.
 *
 * These go along the whole route, not just at the security station. They are
 * small and easy to miss on the way out; the intent is that you notice them on
 * the way back and realise they have been turning to follow you the entire
 * time.
 */
export function buildLoneCamera(
  world: HyperWorld,
  at: GyroVector,
  baseYaw: number,
  height = 2.4,
): { object: HyperObject; watcher: Watcher } {
  const object = new HyperObject(at, false);
  object.rotation.y = baseYaw;

  const pole = new BoxGeometry(0.1, height, 0.1, 1, 8, 1);
  pole.translate(0, height / 2, 0);
  object.addGeometry(world.shared, pole, { color: MAST, ambient: 0.55 });

  const node = new Group();
  node.position.y = height;
  object.add(node);

  const watcher = new Watcher(object, baseYaw);
  watcher.slew = 1.1;
  node.add(watcher.head);
  buildHead(world, object, watcher.head);

  world.add(object);
  return { object, watcher };
}
