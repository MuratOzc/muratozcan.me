/**
 * Global curvature state.
 *
 * Ported from HyperEngine's `HM` class (Assets/HyperEngine/HyperMath.cs).
 *
 * The single most important thing to understand: **curvature is ternary, not a
 * dial.** K is only ever -1 (hyperbolic), 0 (euclidean) or +1 (spherical). You
 * do not scale the curvature to make a bigger or smaller world — you scale the
 * *content* against a fixed unit of curvature, via `unitScale` (HyperEngine
 * calls this KLEIN_V and derives it from the tiling).
 *
 * That means world size and content size are one budget. In a spherical world
 * the whole universe is 2*PI across in geodesic units, full stop. If you want
 * more room, you make your objects smaller.
 */

export type Curvature = -1 | 0 | 1;

export const HM = {
  /** Curvature class: -1 hyperbolic, 0 euclidean, +1 spherical. */
  K: 0 as Curvature,

  /**
   * Scale from Unit coordinates (what you author geometry in) to Klein
   * coordinates (absolute units of curvature). HyperEngine's KLEIN_V.
   */
  unitScale: 1,

  /** Squares meeting at a vertex, when using a regular tiling. 4 = euclidean. */
  N: 4,

  /** Width of one tile in Klein coordinates, when using a regular tiling. */
  cellWidth: 2,
};

/**
 * Free-form world setup — use this when you are placing objects by GyroVector
 * rather than building a regular tiling. `unitScale` maps one unit of authored
 * geometry to Klein coordinates: with unitScale = 1 and K = 1, an object one
 * unit wide subtends roughly one radian.
 */
export function setGeometry(K: Curvature, unitScale = 1): void {
  HM.K = K;
  HM.unitScale = unitScale;
  HM.N = K > 0 ? 3 : K < 0 ? 5 : 4;
  HM.cellWidth = unitScale * 2;
}

/**
 * Regular-tiling world setup, faithful to HyperEngine's SetTileType.
 * `n` is the number of squares meeting at each vertex:
 *   n = 3  -> spherical      n = 4 -> euclidean      n >= 5 -> hyperbolic
 *
 * Kept for parity with the reference implementation; the tiny epsilon on
 * unitScale is CodeParade's, to hide seams between adjacent tiles.
 */
export function setTileType(n: number): void {
  HM.N = Math.round(n);
  if (n === 4) {
    HM.K = 0;
    HM.unitScale = 1;
    HM.cellWidth = 2;
  } else {
    HM.K = n < 4 ? 1 : -1;
    const a = Math.PI / 4;
    const b = Math.PI / n;
    const r = Math.cos(b) / Math.sin(a);
    HM.cellWidth = Math.sqrt(Math.abs(r * r - 1)) / r;
    HM.unitScale = HM.cellWidth + 3e-4 / n;
  }
}

/** Curvature-dependent tangent: tan / identity / tanh. */
export function tanK(x: number): number {
  if (HM.K > 0) return Math.tan(x);
  if (HM.K < 0) return Math.tanh(x);
  return x;
}

/** Inverse of {@link tanK}. */
export function atanK(x: number): number {
  if (HM.K > 0) return Math.atan(x);
  if (HM.K < 0) return Math.atanh(x);
  return x;
}
