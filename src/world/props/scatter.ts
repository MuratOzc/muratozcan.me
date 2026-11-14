import { BufferGeometry, Float32BufferAttribute, IcosahedronGeometry, Vector3 } from 'three';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';
import { merge } from '../geometry';
import { placeOnGround, placeOnGroundVec, toUnits, units } from '../placement';
import { rebase } from '../rebase';

/**
 * Ground dressing: tufts of grass and half-buried stones, over the whole lawn.
 *
 * Scattered uniformly across the ground sphere, everything except a corridor
 * kept clear for the path. DENSITY is the only knob.
 *
 * BLADE NORMALS POINT UP, NOT OUT. Grass blades are double-sided zero-thickness
 * strips, and this engine's shader does not flip normals for back faces the way
 * Three's standard material does — a sideways-facing normal would leave every
 * blade seen from its dark side reading as black cardboard. Normals fixed to
 * +Y make a tuft take the same light as the lawn it stands in, from every
 * direction.
 */

/** Clumps per square authored unit of lawn. The only thing to tune. */
const DENSITY = 0.24;

/** Half-width of the corridor kept clear for the path, in units. */
const PATH_CLEAR = 1.15;

/**
 * Deliberately well away from the lawn's 0x8ab967. Blade normals are +Y, the
 * same as the ground, so a tuft gets the identical diffuse term — colour is the
 * ONLY thing separating it from what it stands in. These separate mainly by
 * SATURATION — a much lower blue channel relative to green — and only slightly
 * by brightness. Going dark instead reads as burnt patches rather than grass.
 */
const GRASS = [0x7fa552, 0x8cae58, 0x78a058];
const STONE = [0x9d9a92, 0x8e8b84, 0xa8a49a];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One blade: a tapered strip that leans and curls away from the tuft's centre.
 * Authored with the bend along +X and the width along +Z, then spun to
 * `azimuth` so a tuft can fan its blades in every direction.
 */
function bladeGeometry(h: number, bend: number, w0: number, azimuth: number): BufferGeometry {
  const SEG = 4;
  const ca = Math.cos(azimuth);
  const sa = Math.sin(azimuth);
  const pos: number[] = [];
  const uv: number[] = [];
  const shade: number[] = [];
  const tone = (t: number) => [0.62 + 0.78 * t, 0.7 + 0.62 * t, 0.72 + 0.1 * t];

  const edge = (t: number, side: number): [number, number, number] => {
    const bx = bend * t * t;
    const y = h * t * (1 - 0.1 * t);
    const w = side * w0 * Math.pow(1 - t, 0.75);
    return [bx * ca + w * sa, y, -bx * sa + w * ca];
  };

  for (let i = 0; i < SEG; i++) {
    const t0 = i / SEG;
    const t1 = (i + 1) / SEG;
    const a = edge(t0, -1);
    const b = edge(t0, 1);
    const c = edge(t1, 1);
    const d = edge(t1, -1);
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    uv.push(0, t0, 1, t0, 1, t1, 0, t0, 1, t1, 0, t1);
    shade.push(...tone(t0), ...tone(t0), ...tone(t1), ...tone(t0), ...tone(t1), ...tone(t1));
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new Float32BufferAttribute(shade, 3));
  const n = new Float32Array(pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new Float32BufferAttribute(n, 3));
  return g;
}

function tuftGeometry(x: number, z: number, r: () => number): BufferGeometry {
  const count = 5 + Math.floor(r() * 3);
  const spin = r() * Math.PI * 2;
  const blades: BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const azimuth = spin + (i * 2 * Math.PI) / count + (r() - 0.5) * 0.7;
    const h = 0.14 + r() * 0.16;
    const g = bladeGeometry(h, 0.05 + r() * 0.11, 0.026 + r() * 0.012, azimuth);
    g.translate(x + (r() - 0.5) * 0.05, 0, z + (r() - 0.5) * 0.05);
    blades.push(g);
  }
  return merge(blades);
}

/**
 * A stone. IcosahedronGeometry comes out non-indexed, so the jitter has to be a
 * function of the ORIGINAL vertex position rather than of the vertex index —
 * duplicated corners must agree or the stone splits open along its seams.
 */
function stoneGeometry(radius: number, r: () => number): BufferGeometry {
  const g = new IcosahedronGeometry(radius, 0);
  const p = g.attributes.position;
  const salt = r() * 100;
  const jitter = (x: number, y: number, z: number) => {
    const s = Math.sin(x * 91.7 + y * 47.3 + z * 63.1 + salt) * 43758.5453;
    return 0.76 + (s - Math.floor(s)) * 0.42;
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const f = jitter(x, y, z);
    p.setXYZ(i, x * f, y * f * 0.6, z * f);
  }
  g.computeVertexNormals();
  // Sunk by a bit of its radius: a stone resting exactly on the lawn reads as
  // dropped, and one sitting in it reads as having always been there.
  g.translate(0, radius * 0.28, 0);
  return g;
}

// Icosahedron corners: the nearest is never more than 0.66 rad away, inside
// the quarter turn rebase needs. A coarser set would break that.
function regionCentres(): Vector3[] {
  const corners = new IcosahedronGeometry(1, 0).attributes.position;
  const out: Vector3[] = [];
  for (let i = 0; i < corners.count; i++) {
    const v = new Vector3().fromBufferAttribute(corners, i).normalize();
    if (!out.some((seen) => seen.distanceToSquared(v) < 1e-6)) out.push(v);
  }
  return out;
}

interface Region {
  at: GyroVector;
  object: HyperObject;
}

export function buildScatter(world: HyperWorld): HyperObject[] {
  const objects: HyperObject[] = [];
  const r = rng(0x5ca77e);

  const centres = regionCentres();
  const regions = new Map<number, Region>();
  const here = new Vector3();
  const regionFor = (bearing: number, dist: number): Region => {
    here.set(Math.sin(dist) * Math.sin(bearing), Math.cos(dist), -Math.sin(dist) * Math.cos(bearing));
    let best = 0;
    for (let i = 1; i < centres.length; i++) {
      if (centres[i].dot(here) > centres[best].dot(here)) best = i;
    }
    let region = regions.get(best);
    if (!region) {
      const at = placeOnGroundVec(centres[best]);
      // tanK height off: rebase hands back geometry that assumes it.
      region = { at, object: new HyperObject(at, false) };
      regions.set(best, region);
      world.add(region.object);
      objects.push(region.object);
    }
    return region;
  };

  // The lawn is a 2-sphere of radius 1/unitScale in authored units.
  const lawnRadius = toUnits(1);
  const target = Math.round(4 * Math.PI * lawnRadius * lawnRadius * DENSITY);
  const clear = units(PATH_CLEAR);

  for (let placed = 0; placed < target; ) {
    // Uniform on the sphere: acos of a uniform cosine, not a uniform angle.
    const dist = Math.acos(1 - 2 * r());
    const bearing = r() * Math.PI * 2;

    // The path is the great circle x = 0 on the ground sphere, so a point's
    // distance from it is asin of that point's x.
    const x = Math.sin(dist) * Math.sin(bearing);
    if (Math.asin(Math.abs(x)) < clear) continue;
    placed++;

    const at = placeOnGround(bearing, dist);
    const yaw = r() * Math.PI * 2;
    const region = regionFor(bearing, dist);
    const settle = (g: BufferGeometry) => rebase(g.rotateY(yaw), at, region.at);

    const roll = r();
    const tufts = roll < 0.94 ? 2 + Math.floor(r() * 3) : 0;
    const stones = roll < 0.86 ? 0 : 1 + Math.floor(r() * 3);

    if (tufts > 0) {
      const parts: BufferGeometry[] = [];
      for (let i = 0; i < tufts; i++) {
        parts.push(tuftGeometry((r() - 0.5) * 1.1, (r() - 0.5) * 1.1, r));
      }
      region.object.addGeometry(world.shared, settle(merge(parts)), {
        color: GRASS[Math.floor(r() * GRASS.length)],
        ambient: 0.56,
        // Blade-thin shadows are subpixel at any distance you would see them
        // from, and the depth map cannot resolve them without acne.
        castShadow: false,
        sway: 0.035,
      });
    }

    if (stones > 0) {
      const parts: BufferGeometry[] = [];
      for (let i = 0; i < stones; i++) {
        const g = stoneGeometry(0.05 + r() * 0.08, r);
        g.rotateY(r() * Math.PI * 2);
        g.translate((r() - 0.5) * 1.2, 0, (r() - 0.5) * 1.2);
        parts.push(g);
      }
      region.object.addGeometry(world.shared, settle(merge(parts)), {
        color: STONE[Math.floor(r() * STONE.length)],
        ambient: 0.54,
        mottleScale: 120,
        mottleAmount: 0.2,
      });
    }
  }

  return objects;
}
