import { PlaneGeometry, Vector3 } from 'three';
import { HyperObject, type HyperWorld } from '../../engine';
import { placeOnGround, type Poi } from '../placement';
import { L } from '../../content/i18n';
import { makeTextTexture } from '../text';

/**
 * A triangle with three right angles, painted on the ground.
 *
 * Its corners are three mutually orthogonal directions on the ground sphere —
 * the corner of an octant. Each side is a quarter-turn geodesic, each corner
 * measures exactly 90 degrees, and the angle sum is 270. This is not a trick
 * of projection; pace it out and every corner is square. Euclid holds locally
 * and fails globally, which is the entire personality of this website.
 *
 * The corners are the rotated standard basis: rotating {ex, ey, ez} about the
 * world's y axis swings the triangle off the aisle so its sides sweep the
 * lawn instead of blocking the walk.
 */

const PSI = -0.85;
const D0 = 1.05;

function corners(): Vector3[] {
  const cs = Math.cos(PSI);
  const sn = Math.sin(PSI);
  const ry = (v: Vector3) => new Vector3(v.x * cs + v.z * sn, v.y, -v.x * sn + v.z * cs);
  return [
    ry(new Vector3(1, 0, 0)),
    ry(new Vector3(0, Math.cos(D0), -Math.sin(D0))),
    ry(new Vector3(0, Math.sin(D0), Math.cos(D0))),
  ];
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

export function buildTriangle(world: HyperWorld): { objects: HyperObject[]; poi: Poi } {
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

  // ---- the corners: a flat "90°" at each, facing into the triangle.
  const centroid = C[0].clone().add(C[1]).add(C[2]).normalize();
  const cornerGeo = new PlaneGeometry(0.85, 0.85, 3, 3);
  cornerGeo.rotateX(-Math.PI / 2);
  cornerGeo.translate(0, 0.045, 0);
  const cornerTex = makeTextTexture('90°', { width: 512, height: 512, color: '#3f4a3a' });

  for (const c of C) {
    const o = new HyperObject(groundGV(c));
    o.rotation.y = yawToward(c, centroid);
    o.addGeometry(world.shared, cornerGeo, {
      map: cornerTex,
      color: 0xffffff,
      ambient: 0.9,
      alphaTest: 0.3,
      castShadow: false,
    });
    world.add(o);
    objects.push(o);
  }

  // The label sits on the corner nearest the path, where people will
  // actually cross the line.
  return {
    objects,
    poi: {
      id: 'triangle',
      title: L('A triangle with three right angles', 'Üç dik açılı bir üçgen'),
      body: L(
        'Every corner of this triangle is exactly 90 degrees. Walk it and check. I like confusing things — and on a sphere, the ground itself plays along.',
        'Bu üçgenin her köşesi tam 90 derece. Yürüyüp kontrol edin. Kafa karıştıran şeyleri severim — kürede zeminin kendisi de bu oyuna katılıyor.',
      ),
      gv: groundGV(C[1]),
      radius: 0.55,
    },
  };
}
