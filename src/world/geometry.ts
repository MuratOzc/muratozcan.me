import {
  BufferAttribute,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Quaternion,
  Shape,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Path,
} from 'three';
import { RoundedBoxGeometry as ThreeRoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HyperMaterialOptions } from '../engine';

export type Point = [number, number];
export type Part = [BufferGeometry, HyperMaterialOptions];

/**
 * Merge authored parts into one buffer.
 *
 * Every prop in the world is built the same way: a pile of primitives is
 * positioned in authored space and merged into a single geometry, so a station
 * costs a handful of draw calls rather than a hundred.
 *
 * The wrinkle this exists for: three.js hands back indexed buffers for the
 * primitives and non-indexed ones for RoundedBoxGeometry and the extrusions,
 * and mergeGeometries refuses a batch that mixes the two. Flattening is the
 * only way to reconcile them, but it is worth doing ONLY for a mixed batch —
 * a uniformly indexed pile merges as-is, and HyperObject.addGeometry re-welds
 * anything non-indexed on the way in, so flattening a batch that did not need
 * it just pays for the weld twice.
 */
export function merge(parts: BufferGeometry[]): BufferGeometry {
  const mixed = parts.some((g) => g.index) && parts.some((g) => !g.index);
  return mergeGeometries(mixed ? parts.map((g) => (g.index ? g.toNonIndexed() : g)) : parts);
}

/**
 * three's RoundedBoxGeometry, with no more corner segments than its radius
 * can show. Its `segments` only ever round the corners: they do not subdivide
 * the faces, and six of them on a centimetre radius is two thousand triangles
 * nobody can see.
 */
export class RoundedBoxGeometry extends ThreeRoundedBoxGeometry {
  constructor(width = 1, height = 1, depth = 1, segments = 2, radius = 0.1) {
    super(width, height, depth, Math.max(1, Math.min(segments, Math.ceil(radius / 0.02))), radius);
  }
}

export function grained(
  geometry: BufferGeometry,
  axis: 'x' | 'y' | 'z',
  across = 70,
  along = 5,
): BufferGeometry {
  const position = geometry.attributes.position;
  const out = new Float32Array(position.count * 3);
  const offset = [Math.random() * 40, Math.random() * 40, Math.random() * 40];
  const scale = [across, across, across];
  scale['xyz'.indexOf(axis)] = along;
  for (let i = 0; i < position.count; i++) {
    for (let c = 0; c < 3; c++) out[i * 3 + c] = position.getComponent(i, c) * scale[c] + offset[c];
  }
  geometry.setAttribute('grain', new BufferAttribute(out, 3));
  return geometry;
}

export function lathe(
  profile: Array<[number, number]>,
  segments: number,
  arc = Math.PI * 2,
): BufferGeometry {
  return new LatheGeometry(profile.map(([x, y]) => new Vector2(x, y)), segments, 0, arc);
}

export function smooth(geometry: BufferGeometry): BufferGeometry {
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  const welded = mergeVertices(geometry, 1e-6);
  welded.computeVertexNormals();
  return welded;
}

export function trace<T extends Path>(path: T, points: Point[]): T {
  points.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
  path.closePath();
  return path;
}

export function box(w: number, h: number, d: number, r = 0.006): BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, 2, r);
}

export function pos(g: BufferGeometry, x: number, y: number, z: number): BufferGeometry {
  return g.translate(x, y, z);
}

export function across(profile: Point[], width: number, bevel: number): BufferGeometry {
  const g = new ExtrudeGeometry(trace(new Shape(), profile), {
    depth: width - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  g.translate(0, 0, -width / 2 + bevel);
  return g.rotateY(-Math.PI / 2);
}

export function moved(parts: Part[], x: number, y: number, z: number, turn = 0): Part[] {
  for (const [g] of parts) {
    if (turn) g.rotateY(turn);
    g.translate(x, y, z);
  }
  return parts;
}

const UP = new Vector3(0, 1, 0);

export function aimed(g: BufferGeometry, from: Vector3, to: Vector3): BufferGeometry {
  const along = new Vector3().subVectors(to, from).normalize();
  g.applyQuaternion(new Quaternion().setFromUnitVectors(UP, along));
  return g.translate(from.x, from.y, from.z);
}

export function rod(from: Vector3, to: Vector3, r: number, rEnd = r, segments = 8): BufferGeometry {
  const length = from.distanceTo(to);
  return aimed(new CylinderGeometry(rEnd, r, length, segments).translate(0, length / 2, 0), from, to);
}

export function roundedRect<T extends Path>(path: T, w: number, h: number, r: number): T {
  const x = w / 2;
  const y = h / 2;
  path.moveTo(-x + r, -y);
  path.lineTo(x - r, -y);
  path.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false);
  path.lineTo(x, y - r);
  path.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
  path.lineTo(-x + r, y);
  path.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(-x, -y + r);
  path.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false);
  return path;
}
