import {
  Color,
  GLSL3,
  Matrix3,
  Matrix4,
  ShaderMaterial,
  Vector3,
  Vector4,
  type Side,
  type Texture,
} from 'three';
import { HM } from './math/curvature';
import {
  HYPER_COMMON,
  HYPER_DEPTH_FRAGMENT,
  HYPER_DEPTH_VERTEX,
  HYPER_FRAGMENT,
  HYPER_VERTEX,
} from './shaders/hyperCore';

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
  uShadowMap: { value: Texture | null };
  uShadowMatrix: { value: Matrix4 };
  uShadowBias: { value: number };
  uShadowStrength: { value: number };
  uShadowTexel: { value: number };
  uShadowMaxWDot: { value: number };
  /**
   * Compile-time flag, not a uniform: materials built while this is true are
   * compiled with shadow sampling, and objects grow a depth-pass twin. Set by
   * HyperWorld before any geometry is added.
   */
  shadowsEnabled: boolean;
}

export function createSharedUniforms(): SharedUniforms {
  return {
    uK: { value: HM.K },
    uUnitScale: { value: HM.unitScale },
    uLightDir: { value: new Vector3(0.4, 0.85, 0.3).normalize() },
    uFog: { value: new Vector4(0.72, 0.79, 0.86, 1.0) },
    uFogInvDist: { value: 1.0 },
    uShadowMap: { value: null },
    uShadowMatrix: { value: new Matrix4() },
    uShadowBias: { value: 0.0025 },
    uShadowStrength: { value: 0.9 },
    uShadowTexel: { value: 1 / 2048 },
    uShadowMaxWDot: { value: 1.0 },
    shadowsEnabled: false,
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
  /**
   * Set false to skip the shadow-depth twin. For flat paint lying on the
   * ground (path markings, plaques) a shadow caster is pure cost.
   */
  castShadow?: boolean;
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
  // The flag is metadata, not a uniform — strip it before spreading.
  const { shadowsEnabled, ...sharedUniforms } = shared;

  const defines: Record<string, string> = {};
  if (hemisphere === 'top') defines.TOP_HEMISPHERE = '1';
  if (hemisphere === 'bottom') defines.BOTTOM_HEMISPHERE = '1';
  if (opts.map) defines.USE_MAP = '1';
  // The far hemisphere is beyond the shadow map's reach (and mostly fog), so
  // only near-side materials pay for the sampling.
  if (shadowsEnabled && hemisphere !== 'top') defines.USE_SHADOWMAP = '1';

  const mat = new ShaderMaterial({
    glslVersion: GLSL3,
    defines,
    uniforms: {
      ...sharedUniforms,
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

/**
 * The depth-only material for the shadow pass: the same curved-space warp,
 * rendered from the light's point of view. One instance per geometry, because
 * uHyperPos/uHyperRot are per-object.
 */
export function createShadowDepthMaterial(
  shared: SharedUniforms,
  opts: HyperMaterialOptions = {},
): HyperMaterial {
  const defines: Record<string, string> = {};
  if (opts.map) defines.USE_MAP = '1';

  const mat = new ShaderMaterial({
    glslVersion: GLSL3,
    defines,
    uniforms: {
      uK: shared.uK,
      uUnitScale: shared.uUnitScale,
      uShadowMaxWDot: shared.uShadowMaxWDot,
      uTanKHeight: { value: opts.tanKHeight === false ? 0 : 1 },
      uHyperPos: { value: new Vector3() },
      uHyperRot: { value: new Matrix3() },
      uMap: { value: opts.map ?? null },
      uAlphaTest: { value: opts.alphaTest ?? 0.5 },
    },
    vertexShader: HYPER_COMMON + HYPER_DEPTH_VERTEX,
    fragmentShader: HYPER_DEPTH_FRAGMENT,
  }) as HyperMaterial;

  mat.isHyperMaterial = true;
  return mat;
}
