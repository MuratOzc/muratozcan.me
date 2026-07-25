import { Quaternion, Vector3 } from 'three';
import { GyroVector, type HyperWorld } from '../engine';

/**
 * The shape of the world.
 *
 *                        spawn (pole)
 *                             |
 *          near hemisphere ---+--- personal: hobbies, links, easter eggs
 *                             |
 *   ============ the ring (great circle, quarter turn out) ============
 *                the ten layers of the stack, as machine
 *                             |
 *           far hemisphere ---+--- approach
 *                             |
 *                     the antipode: you
 *
 * Every great circle on the ground has exactly two poles — points a quarter
 * turn from every point on the circle — and those two poles are PI apart,
 * which is the antipode relationship. So spawning at one pole puts the ring
 * at a uniform quarter turn in all directions and puts the far pole exactly
 * at the antipode. None of these three places is positioned by hand; they
 * fall out of the geometry.
 */

const UP = new Vector3(0, 1, 0);

/** Geodesic distance from spawn to the ring. */
export const RING_DISTANCE = Math.PI / 2;

/**
 * Place something on the ground at a compass bearing and a geodesic distance
 * from spawn.
 *
 * IMPORTANT: this is the only correct way to position by offset. Do NOT build
 * a position by translating an already-translated GyroVector sideways —
 * `translate` composes isometries and carries holonomy, so a lateral step
 * comes out scaled by cos(distance). It pinches to zero at the quarter turn
 * and FLIPS SIGN beyond it, which turns two intended parallel rows into an X.
 *
 * There is also no way to fix that by being cleverer: spherical space has no
 * parallel lines at all. Any two geodesics meet, twice. Anything long and
 * straight converges, so layouts have to be radial rather than rectilinear.
 */
export function placeOnGround(bearing: number, distance: number): GyroVector {
  const dir = new Vector3(Math.sin(bearing), 0, -Math.cos(bearing));
  return GyroVector.fromGeodesic(dir, distance);
}

/** Bearing around the ring for item `i` of `n`. */
export function ringBearing(i: number, n: number): number {
  return (i / n) * Math.PI * 2;
}

/**
 * Place something beside the path.
 *
 * `along` is arc length travelled down the path from spawn; `lateral` is
 * perpendicular offset, positive to the right. The result sits at EXACTLY
 * `lateral` from the path for any `along` — the flanking rows stay genuinely
 * parallel the whole way.
 *
 * That is worth stating carefully, because a related claim is false. No two
 * geodesics stay parallel in spherical space; any two great circles meet
 * twice. But the set of points at constant distance from a great circle is a
 * small circle, and small circles ARE parallel to it everywhere. A flanking
 * row follows one of those. It simply is not a geodesic itself — walk along
 * it in a straight line and you drift off it.
 *
 * The conversion is spherical Pythagoras on the right triangle spawn-foot-point:
 *
 *   cos(r) = cos(along) * cos(lateral)
 *   tan(bearing) = tan(lateral) / sin(along)
 */
export function placeAlongPath(along: number, lateral: number): GyroVector {
  const r = Math.acos(
    Math.max(-1, Math.min(1, Math.cos(along) * Math.cos(lateral))),
  );
  const bearing = Math.atan2(Math.tan(lateral), Math.sin(along));
  return placeOnGround(bearing, r);
}

/**
 * Yaw needed to make an object face along the path.
 *
 * A GyroVector built by translation carries a parallel-transported frame, so
 * an object placed off to the side of the path does NOT already point along
 * it — the frame arrived there along a different bearing. Rather than derive
 * the correction from spherical trigonometry, measure it: take a point a hair
 * further down the path, pull it into the object's local frame, and read off
 * the heading.
 */
export function pathYaw(along: number, lateral: number, eps = 1e-3): number {
  const here = placeAlongPath(along, lateral);
  const ahead = placeAlongPath(along + eps, lateral);
  const local = here.inverse().transformPoint(ahead.point());
  return Math.atan2(-local.x, -local.z);
}

/**
 * The antipode sits a hair short of PI, because the Poincare radius is
 * infinite exactly there. The far-hemisphere pass maps it back to a sane
 * magnitude.
 */
export const ANTIPODE_DISTANCE = Math.PI - 0.04;

export function placeAtAntipode(): GyroVector {
  return placeOnGround(0, ANTIPODE_DISTANCE);
}

/**
 * A point of interest: somewhere in the world with something to say.
 * Proximity panels read from this.
 */
export interface Poi {
  id: string;
  title: string;
  body: string;
  gv: GyroVector;
  /** Geodesic radius within which the panel shows, in radians. */
  radius: number;
}

/** Geodesic distance from the viewer to a placed GyroVector. */
export function distanceToViewer(gv: GyroVector, worldGV: GyroVector): number {
  return 2 * Math.atan(gv.add(worldGV).vec.length());
}

/** Orient an object about its own up axis, in its local Unit frame. */
export function faceBearing(object: { rotation: { y: number } }, bearing: number): void {
  object.rotation.y = bearing;
}

export { UP };

/** Convenience for callers that want a yaw quaternion. */
export function yawQuaternion(angle: number): Quaternion {
  return new Quaternion().setFromAxisAngle(UP, angle);
}

export type { HyperWorld };
