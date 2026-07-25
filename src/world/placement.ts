import { Vector3 } from 'three';
import { GyroVector, HM } from '../engine';

/**
 * Authoring units.
 *
 * Geometry is authored in Unit coordinates and the engine works in radians of
 * geodesic distance. `unitScale` bridges them: at unitScale = 0.1 a person is
 * 1 unit tall and the world is 2*PI / 0.1 = 62.8 units around, which is a
 * comfortable range to model in and matches how downloaded assets are scaled.
 *
 * Heights convert exactly. With tanKHeight on, an authored height h becomes
 * atan(tan(h * unitScale)) = h * unitScale radians — the two operations
 * cancel. Horizontal extents go through the Klein (gnomonic) map instead, so
 * an authored width w spans atan(w * unitScale) radians. That is linear for
 * small objects and stretches for large ones; it is why the ground tiles have
 * to reach 10 units to cover a 45 degree cube face.
 */

/** Authored units -> radians of geodesic distance. Use for placement. */
export function units(n: number): number {
  return n * HM.unitScale;
}

/** Radians -> authored units. */
export function toUnits(radians: number): number {
  return radians / HM.unitScale;
}

/**
 * Placement primitives.
 *
 * Design-free: these say WHERE things can go, not what goes there. Every one
 * of them was verified the hard way, so reach for these rather than composing
 * GyroVectors by hand.
 */

/**
 * Place something on the ground at a compass bearing and a geodesic distance
 * from spawn.
 *
 * IMPORTANT: this is the only correct way to position by offset. Do NOT build
 * a position by translating an already-translated GyroVector sideways —
 * `translate` composes isometries and carries holonomy, so a lateral step
 * comes out scaled by cos(distance). It pinches to zero at the quarter turn
 * and FLIPS SIGN beyond it, turning two intended parallel rows into an X.
 */
export function placeOnGround(bearing: number, distance: number): GyroVector {
  const dir = new Vector3(Math.sin(bearing), 0, -Math.cos(bearing));
  return GyroVector.fromGeodesic(dir, distance);
}

/**
 * Place something beside a path that runs from spawn along bearing 0.
 *
 * `along` is arc travelled down the path; `lateral` is perpendicular offset,
 * positive to the right. The result sits at EXACTLY `lateral` from the path
 * for any `along`, so flanking rows stay genuinely parallel the whole way.
 *
 * A related claim is false and worth keeping straight: no two GEODESICS stay
 * parallel in spherical space — any two great circles meet twice. But the set
 * of points at constant distance from a great circle is a small circle, and
 * small circles ARE parallel to it everywhere. A flanking row follows one of
 * those; it simply is not a geodesic itself, so walking straight along it
 * drifts you off.
 *
 * Spherical Pythagoras on the right triangle spawn-foot-point:
 *   cos(r) = cos(along) * cos(lateral)
 *   tan(bearing) = tan(lateral) / sin(along)
 *
 * Verified by invariant 12 in the engine self-tests.
 */
export function placeAlongPath(along: number, lateral: number): GyroVector {
  const r = Math.acos(
    Math.max(-1, Math.min(1, Math.cos(along) * Math.cos(lateral))),
  );
  const bearing = Math.atan2(Math.tan(lateral), Math.sin(along));
  return placeOnGround(bearing, r);
}

/**
 * Yaw needed to make an object face along a path.
 *
 * A GyroVector built by translation carries a parallel-transported frame, so
 * an object placed off to the side does NOT already point along the path — its
 * frame arrived on a different bearing. Measured rather than derived: take a
 * point a hair further along, pull it into the object's local frame, read the
 * heading.
 */
export function pathYaw(along: number, lateral: number, eps = 1e-3): number {
  const here = placeAlongPath(along, lateral);
  const ahead = placeAlongPath(along + eps, lateral);
  const local = here.inverse().transformPoint(ahead.point());
  return Math.atan2(-local.x, -local.z);
}

/**
 * The far side of the world. A hair short of PI, because the Poincare radius
 * is infinite exactly at the antipode; the far-hemisphere pass maps this back
 * to a sane magnitude.
 *
 * Whatever sits here is visible from everywhere in the world, from every
 * direction, at all times. It is the only point with that property.
 */
export const ANTIPODE_DISTANCE = Math.PI - 0.04;

/** Geodesic distance from the viewer to a placed GyroVector. */
export function distanceToViewer(gv: GyroVector, worldGV: GyroVector): number {
  return 2 * Math.atan(gv.add(worldGV).vec.length());
}

/** Somewhere in the world with something to say. Read by ProximityPanel. */
export interface Poi {
  id: string;
  title: string;
  body: string;
  gv: GyroVector;
  /** Geodesic radius within which the panel shows, in radians. */
  radius: number;
}
