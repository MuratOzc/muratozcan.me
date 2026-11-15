import { BufferAttribute, LatheGeometry, Vector2, type BufferGeometry } from 'three';
import { RoundedBoxGeometry as ThreeRoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

export function lathe(profile: Array<[number, number]>, segments: number): BufferGeometry {
  return new LatheGeometry(profile.map(([x, y]) => new Vector2(x, y)), segments);
}

export function smooth(geometry: BufferGeometry): BufferGeometry {
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  const welded = mergeVertices(geometry, 1e-6);
  welded.computeVertexNormals();
  return welded;
}
