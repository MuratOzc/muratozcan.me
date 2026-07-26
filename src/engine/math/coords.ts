import { Quaternion, Vector3 } from 'three';
import { HM, atanK, tanK } from './curvature';
import { mobiusDistSq } from './mobius';

/**
 * Coordinate systems, ported from HyperEngine (see HyperEngine.pdf, "Coordinate
 * Systems"). The chain runs:
 *
 *   Unit  --(* unitScale, optional tanK height)-->  Klein
 *   Klein --(stereographic)-->                      Poincare
 *
 * - **Unit**: what you author geometry in. A tile spans -1..1.
 * - **Klein**: unit coordinates scaled to the absolute unit of curvature.
 *   Mostly an intermediate step.
 * - **Poincare**: the primary system. Everything a GyroVector holds is here.
 *   In hyperbolic space the magnitude is always < 1; in spherical space it runs
 *   to infinity at the antipode (which is exactly why rendering needs the
 *   two-hemisphere trick — see hyperCore.ts).
 */

const UP = new Vector3(0, 1, 0);

export function kleinToPoincare(p: Vector3, out = new Vector3()): Vector3 {
  if (HM.K === 0) return out.copy(p);
  const s = Math.sqrt(Math.max(0, 1 + HM.K * p.lengthSq())) + 1;
  return out.copy(p).divideScalar(s);
}

/**
 * WARNING — spherically, this is only valid within a quarter turn.
 *
 * Klein is the gnomonic chart. In spherical space the denominator hits zero at
 * |p| = 1, which is a geodesic distance of exactly PI/2, and goes NEGATIVE
 * beyond it — so the result diverges at the quarter turn and then comes back
 * inverted. A point 100 degrees away converts to a Klein point pointing the
 * opposite direction.
 *
 * That makes it unsafe for anything measuring direction or distance to
 * arbitrary points in the world: at unitScale 0.1 the quarter turn is only
 * 15.7 units out of 62.8, so most of the world is past it.
 *
 * For a direction from one point to another, use the Möbius difference
 * instead — `mobiusAdd(a.negate(), b)` — which stays well defined all the way
 * to the antipode.
 */
export function poincareToKlein(p: Vector3, out = new Vector3()): Vector3 {
  if (HM.K === 0) return out.copy(p);
  return out.copy(p).multiplyScalar(2 / (1 - HM.K * p.lengthSq()));
}

/** Transform a plane normal alongside a Klein -> Poincare point conversion. */
export function kleinToPoincareNormal(p: Vector3, n: Vector3, out = new Vector3()): Vector3 {
  if (HM.K === 0) return out.copy(n).normalize();
  const a = 1 + Math.sqrt(1 + HM.K * p.lengthSq());
  const b = HM.K * n.dot(p);
  return out.copy(n).multiplyScalar(a).addScaledVector(p, b).normalize();
}

/** Transform a plane normal alongside a Poincare -> Klein point conversion. */
export function poincareToKleinNormal(p: Vector3, n: Vector3, out = new Vector3()): Vector3 {
  if (HM.K === 0) return out.copy(n).normalize();
  const a = 1 + HM.K * p.lengthSq();
  const b = -2 * HM.K * n.dot(p);
  return out.copy(n).multiplyScalar(a).addScaledVector(p, b).normalize();
}

/**
 * `useTanKHeight` makes the Y axis horospherical rather than flat — it keeps
 * vertical structures standing up straight as they move away from you, instead
 * of leaning with the curvature. HyperEngine turns this on by default.
 */
export function unitToKlein(p: Vector3, useTanKHeight: boolean, out = new Vector3()): Vector3 {
  out.copy(p).multiplyScalar(HM.unitScale);
  if (useTanKHeight) {
    out.y = tanK(out.y) * Math.sqrt(1 + HM.K * (out.x * out.x + out.z * out.z));
  }
  return out;
}

export function kleinToUnit(p: Vector3, useTanKHeight: boolean, out = new Vector3()): Vector3 {
  out.copy(p);
  if (useTanKHeight) {
    out.y = atanK(out.y / Math.sqrt(1 + HM.K * (out.x * out.x + out.z * out.z)));
  }
  return out.divideScalar(HM.unitScale);
}

export function unitToPoincare(p: Vector3, useTanKHeight: boolean, out = new Vector3()): Vector3 {
  return kleinToPoincare(unitToKlein(p, useTanKHeight, out), out);
}

export function poincareToUnit(p: Vector3, useTanKHeight: boolean, out = new Vector3()): Vector3 {
  return kleinToUnit(poincareToKlein(p, out), useTanKHeight, out);
}

/** How much a unit-sized object is scaled by, at a given Poincare position. */
export function poincareScaleFactor(p: Vector3): number {
  return 1 + HM.K * p.lengthSq();
}

/**
 * The local "up" direction at a Poincare point. In curved space up is not a
 * constant — this is what {@link GyroVector.alignUpVector} uses to keep the
 * horizon level as you walk.
 */
export function upVector(p: Vector3, out = new Vector3()): Vector3 {
  const u = 1 + HM.K * p.lengthSq();
  const v = -2 * HM.K * p.y;
  return out.copy(UP).multiplyScalar(u).addScaledVector(p, v).normalize();
}

/** Project a Poincare point onto the y = 0 ground plane. Used by the map view. */
export function projectToPlane(p: Vector3, out = new Vector3()): Vector3 {
  const m = HM.K * p.lengthSq();
  const d = 1 + m;
  const s = 2 / (1 - m + Math.sqrt(d * d - 4 * HM.K * p.y * p.y));
  return out.set(p.x * s, 0, p.z * s);
}

/**
 * Convert a metric displacement into a Poincare-ball delta suitable for Möbius
 * composition.
 *
 * IMPORTANT — this differs from HyperEngine by a factor of two, deliberately.
 * HyperEngine's HyperTranslate uses tanK(|d|); the Poincare radius for a
 * geodesic distance s is actually tanK(s/2), since Poincare radius = tan(theta/2)
 * in spherical space. For Hyperbolica that factor is invisible because walking
 * speed is a free tuning parameter that absorbs it. We use the metric-correct
 * form so that "walk 2*PI and arrive back where you started" is exactly true
 * and can be asserted in a test. See selftest.ts, testSphericalWrap.
 */
export function geodesicTranslate(d: Vector3, out = new Vector3()): Vector3 {
  const mag = d.length();
  if (mag < 1e-9) return out.set(0, 0, 0);
  return out.copy(d).multiplyScalar(tanK(mag * 0.5) / mag);
}

/** HyperEngine's HyperTranslate verbatim, kept for reference and comparison. */
export function hyperTranslate(d: Vector3, out = new Vector3()): Vector3 {
  const mag = d.length();
  if (mag < 1e-5) return out.set(0, 0, 0);
  return out.copy(d).multiplyScalar(tanK(mag) / mag);
}

/** Geodesic distance from the origin to a Poincare point. */
export function geodesicRadius(p: Vector3): number {
  return 2 * atanK(p.length());
}

/**
 * Geodesic distance between two Poincare points.
 *
 * mobiusDistSq gives |a (+) -b|^2, and a Poincare radius r corresponds to a
 * geodesic distance 2*atanK(r), so this is just the composition of the two.
 */
export function geodesicDistance(a: Vector3, b: Vector3): number {
  return 2 * atanK(Math.sqrt(Math.max(0, mobiusDistSq(a, b))));
}

/**
 * Height of a Poincare point above the ground — the totally geodesic surface
 * y = 0, which in spherical space is a great 2-sphere.
 *
 * This is NOT `2*atan(p.y)`. That only works directly above the origin. The
 * honest version comes from the inverse stereographic lift: a Poincare point
 * maps to the unit 3-sphere point (2p, 1 - |p|^2) / (1 + |p|^2), and the
 * distance from there to the great sphere {y = 0} is asin of its y component.
 */
export function heightAboveGround(p: Vector3): number {
  if (HM.K === 0) return p.y;
  const d = 1 + HM.K * p.lengthSq();
  if (Math.abs(d) < 1e-12) return 0;
  const s = (2 * p.y) / d;
  return HM.K > 0 ? Math.asin(Math.max(-1, Math.min(1, s))) : Math.asinh(s);
}

/**
 * Unity's Quaternion.FromToRotation. Three's setFromUnitVectors handles the
 * degenerate case differently, so this is ported directly to keep
 * alignUpVector behaving identically to the reference.
 */
export function fromToRotation(a: Vector3, b: Vector3, out = new Quaternion()): Quaternion {
  const c = new Vector3().crossVectors(a, b);
  const w = Math.sqrt(a.lengthSq() * b.lengthSq()) + a.dot(b);
  return out.set(c.x, c.y, c.z, w).normalize();
}

/** Swing-twist decomposition: the component of `q` that twists about `d`. */
export function swingTwist(q: Quaternion, d: Vector3, out = new Quaternion()): Quaternion {
  const ra = new Vector3(q.x, q.y, q.z);
  const p = d.clone().multiplyScalar(ra.dot(d) / d.lengthSq());
  return out.set(p.x, p.y, p.z, q.w).normalize();
}
