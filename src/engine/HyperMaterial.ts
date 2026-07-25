import {
  Color,
  GLSL3,
  Matrix3,
  ShaderMaterial,
  Vector3,
  Vector4,
  type Side,
  type Texture,
} from 'three';
import { HM } from './math/curvature';
import { HYPER_COMMON, HYPER_FRAGMENT, HYPER_VERTEX } from './shaders/hyperCore';

/**
 * Uniforms shared by every material in the world. Because Three compares
 * uniform objects by reference, handing the same object to every material means
 * one write updates them all.
 */
export interface SharedUniforms {
  uK: { value: number };
  uUnitScale: { value: number };
  uLightDir: { value: Vector3 };
  uFog: { value: Vector4 };
  uFogInvDist: { value: number };
}

export function createSharedUniforms(): SharedUniforms {
  return {
    uK: { value: HM.K },
    uUnitScale: { value: HM.unitScale },
    uLightDir: { value: new Vector3(0.4, 0.85, 0.3).normalize() },
    uFog: { value: new Vector4(0.72, 0.79, 0.86, 1.0) },
    uFogInvDist: { value: 1.0 },
  };
}

export type Hemisphere = 'none' | 'top' | 'bottom';

export interface HyperMaterialOptions {
  color?: Color | number;
  ambient?: number;
  tanKHeight?: boolean;
  gridScale?: number;
  gridWidth?: number;
  gridFade?: number;
  /** Cutout texture, sampled with the mesh UVs. */
  map?: Texture;
  /** Alpha below this is discarded. */
  alphaTest?: number;
  mottleScale?: number;
  mottleAmount?: number;
  side?: Side;
}

export interface HyperMaterial extends ShaderMaterial {
  isHyperMaterial: true;
}

function build(
  shared: SharedUniforms,
  hemisphere: Hemisphere,
  opts: HyperMaterialOptions,
): HyperMaterial {
  const defines: Record<string, string> = {};
  if (hemisphere === 'top') defines.TOP_HEMISPHERE = '1';
  if (hemisphere === 'bottom') defines.BOTTOM_HEMISPHERE = '1';
  if (opts.map) defines.USE_MAP = '1';

  const mat = new ShaderMaterial({
    glslVersion: GLSL3,
    defines,
    uniforms: {
      ...shared,
      uTanKHeight: { value: opts.tanKHeight === false ? 0 : 1 },
      uHyperPos: { value: new Vector3() },
      uHyperRot: { value: new Matrix3() },
      uColor: { value: new Color(opts.color ?? 0xffffff) },
      uAmbient: { value: opts.ambient ?? 0.55 },
      uGridScale: { value: opts.gridScale ?? 0 },
      uGridWidth: { value: opts.gridWidth ?? 1.5 },
      uGridFade: { value: opts.gridFade ?? 4.0 },
      uMottleScale: { value: opts.mottleScale ?? 40.0 },
      uMottleAmount: { value: opts.mottleAmount ?? 0.0 },
      uMap: { value: opts.map ?? null },
      uAlphaTest: { value: opts.alphaTest ?? 0.5 },
      uStaticPos: { value: new Vector3() },
      uStaticRot: { value: new Matrix3() },
    },
    vertexShader: HYPER_COMMON + HYPER_VERTEX,
    fragmentShader: HYPER_COMMON + HYPER_FRAGMENT,
  }) as HyperMaterial;

  mat.isHyperMaterial = true;
  if (opts.side !== undefined) mat.side = opts.side;
  return mat;
}

/**
 * Build the material set for one mesh.
 *
 * Spherical worlds get two materials — the mesh must be drawn once per
 * hemisphere. Euclidean and hyperbolic worlds get one, since a single
 * projection covers them.
 */
export function createHyperMaterials(
  shared: SharedUniforms,
  opts: HyperMaterialOptions = {},
): HyperMaterial[] {
  if (HM.K > 0) {
    return [build(shared, 'bottom', opts), build(shared, 'top', opts)];
  }
  return [build(shared, 'none', opts)];
}
