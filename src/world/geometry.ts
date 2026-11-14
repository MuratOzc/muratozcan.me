import type { BufferGeometry } from 'three';
import { RoundedBoxGeometry as ThreeRoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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
