import { PlaneGeometry, Vector3, type BufferGeometry } from 'three';
import { HyperObject, type HyperWorld } from '../../engine';
import { merge, moved, type Part } from '../geometry';
import { placeOnGround, type Poi } from '../placement';
import {
  DECAL,
  DISC_TOP,
  HEAD_TOP,
  fieldStool,
  rangingPole,
  surveyAtlas,
  surveyMarker,
  theodolite,
  tripod,
} from './surveyKit';

/**
 * A triangle with three right angles, painted on the ground.
 *
 * Its corners are three mutually orthogonal directions on the ground sphere —
 * the corner of an octant. Each side is a quarter-turn geodesic, each corner
 * measures exactly 90 degrees, and the angle sum is 270. This is not a trick
 * of projection; pace it out and every corner is square. Euclid holds locally
 * and fails globally, which is the entire personality of this website.
 *
 * Placement: the triangle lives ENTIRELY on the right lawn. The three corners
 * are three orthonormal directions arranged symmetrically around the "right
 * pole" (1,0,0) — each at 54.7° from it, 120° apart in azimuth. Pairwise dots:
 * cos²θ + sin²θ·cos120° = 1/3 − 1/3 = 0, so the corners stay mutually
 * perpendicular, while every point of every side keeps x > 0: corners sit
 * 6.2 units right of the path and the sides bow AWAY to 9.6, so the walk is
 * never crossed. Spinning PHI0 slides the corners along the path direction;
 * the current value tucks them between station bays.
 */

const THETA = Math.acos(1 / Math.sqrt(3));
const PHI0 = -1.7;

/** The triangle's corners as ground-sphere unit vectors. Also used by the
 *  architecture station's world model to draw the triangle on its globe. */
export function triangleCorners(): Vector3[] {
  return corners();
}

function corners(): Vector3[] {
  const out: Vector3[] = [];
  for (let k = 0; k < 3; k++) {
    const phi = PHI0 + (k * 2 * Math.PI) / 3;
    out.push(
      new Vector3(
        Math.cos(THETA),
        Math.sin(THETA) * Math.cos(phi),
        Math.sin(THETA) * Math.sin(phi),
      ),
    );
  }
  return out;
}

/** Ground-sphere unit vector -> (bearing, geodesic distance) from spawn. */
function vecToPlace(v: Vector3): { bearing: number; dist: number } {
  return {
    bearing: Math.atan2(v.x, -v.z),
    dist: Math.acos(Math.max(-1, Math.min(1, v.y))),
  };
}

function slerp(a: Vector3, b: Vector3, t: number): Vector3 {
  const omega = Math.acos(Math.max(-1, Math.min(1, a.dot(b))));
  const s = Math.sin(omega);
  return a
    .clone()
    .multiplyScalar(Math.sin((1 - t) * omega) / s)
    .addScaledVector(b, Math.sin(t * omega) / s);
}

function groundGV(v: Vector3) {
  const { bearing, dist } = vecToPlace(v);
  return placeOnGround(bearing, dist);
}

/** Yaw at `from` looking toward `to`, both ground vectors. */
function yawToward(from: Vector3, to: Vector3): number {
  const here = groundGV(from);
  const local = here.inverse().transformPoint(groundGV(to).point());
  return Math.atan2(-local.x, -local.z);
}

/**
 * The centre of the triangle — by the corner symmetry this is exactly the
 * "right pole" (1,0,0), a quarter turn off the path. Anything placed here is
 * equidistant from all three corners. The yaw faces the first corner, which
 * is also roughly back toward the path.
 */
export function triangleCenter(): { gv: ReturnType<typeof placeOnGround>; yaw: number } {
  const centroid = new Vector3(1, 0, 0);
  return { gv: groundGV(centroid), yaw: yawToward(centroid, corners()[0]) };
}

export function buildTriangle(world: HyperWorld): { objects: HyperObject[]; poi: Poi | null } {
  const objects: HyperObject[] = [];
  const C = corners();

  // ---- the sides: strips of paint along each quarter-turn geodesic.
  const SEGMENTS = 26;
  // Height above ground matters here: paint hovering inside the shadow
  // map's bias tolerance gets false-shadowed by the ground beneath it and
  // renders as broken black. 4cm clears the bias comfortably.
  const strip = new PlaneGeometry(0.28, 0.62, 2, 3);
  strip.rotateX(-Math.PI / 2);
  strip.translate(0, 0.04, 0);

  for (let s = 0; s < 3; s++) {
    const a = C[s];
    const b = C[(s + 1) % 3];
    for (let i = 0; i < SEGMENTS; i++) {
      const mid = slerp(a, b, (i + 0.5) / SEGMENTS).normalize();
      const next = slerp(a, b, Math.min(1, (i + 1) / SEGMENTS)).normalize();
      const o = new HyperObject(groundGV(mid));
      o.rotation.y = yawToward(mid, next);
      // NOTE: flat uColor hexes render darker than they read (sRGB hex is
      // linearised on upload and the shader never re-encodes), so this is
      // deliberately brighter than the moss it displays as.
      o.addGeometry(world.shared, strip, {
        color: 0x9aa88f,
        ambient: 0.85,
        castShadow: false,
      });
      world.add(o);
      objects.push(o);
    }
  }

  const atlas = surveyAtlas();
  const SURVEYED = 0;
  const POLE_AWAY = 0.4;

  for (let k = 0; k < 3; k++) {
    const c = C[k];
    const sighted = C[(k + 2) % 3];
    const o = new HyperObject(groundGV(c));
    // Everything at a corner is authored with the side to `sighted` leaving along -z and the other side along +x.
    o.rotation.y = yawToward(c, sighted);
    o.name = `survey-corner-${k}`;

    const marker = surveyMarker(41 + k * 17);
    const solids: Part[] = marker.parts;
    const decals: BufferGeometry[] = marker.decals;

    if (k === SURVEYED) {
      solids.push(...tripod(DISC_TOP));
      const instrument = theodolite();
      solids.push(...moved(instrument.parts, 0, HEAD_TOP, 0));
      decals.push(...instrument.decals.map((g) => g.translate(0, HEAD_TOP, 0)));

      const stool = fieldStool();
      const TURN = -Math.PI / 4;
      solids.push(...moved(stool.parts, -0.87, 0, 0.35, TURN));
      decals.push(...stool.decals.map((g) => g.rotateY(TURN).translate(-0.87, 0, 0.35)));

      const stake = slerp(c, sighted, POLE_AWAY / (Math.PI / 2)).normalize();
      const pole = new HyperObject(groundGV(stake));
      pole.rotation.y = yawToward(stake, c);
      pole.name = 'survey-pole';
      for (const [g, opts] of rangingPole()) pole.addGeometry(world.shared, g, opts);
      world.add(pole);
      objects.push(pole);
    }

    for (const [g, opts] of solids) o.addGeometry(world.shared, g, opts);
    o.addGeometry(world.shared, merge(decals), { ...DECAL, map: atlas });
    world.add(o);
    objects.push(o);
  }

  // The label sits on the first corner walkers reach, where the painted
  // line is most likely to be noticed.
  return {
    objects,
    poi: null,
  };
}
