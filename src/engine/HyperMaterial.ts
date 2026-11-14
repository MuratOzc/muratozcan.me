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
import { NOISE_SIZE, noiseTexture } from './noise';
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
  uShadowSoft: { value: number };
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
    uShadowSoft: { value: 1 },
    uShadowMaxWDot: { value: 1.0 },
    shadowsEnabled: false,
  };
}

export interface ObjectUniforms {
  uHyperPos: { value: Vector3 };
  uHyperRot: { value: Matrix3 };
  uStaticPos: { value: Vector3 };
  uStaticRot: { value: Matrix3 };
}

export function createObjectUniforms(): ObjectUniforms {
  return {
    uHyperPos: { value: new Vector3() },
    uHyperRot: { value: new Matrix3() },
    uStaticPos: { value: new Vector3() },
    uStaticRot: { value: new Matrix3() },
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
   * Composite the map's alpha instead of cutting out against `alphaTest`.
   *
   * For paint lying flat on a surface — path markings — where the decal is
   * always in front of one opaque thing directly beneath it, so none of the
   * sorting that makes transparency painful applies. The texture MUST be
   * mipmapped: prefiltered alpha is the entire mechanism, and without it a
   * blended decal aliases exactly as badly as a cutout did.
   *
   * Not for signage. Anything that can be seen against something other than
   * the surface it is painted on wants the cutout.
   */
  alphaBlend?: boolean;
  /**
   * Set false to skip the shadow-depth twin. For flat paint lying on the
   * ground (path markings, plaques) a shadow caster is pure cost.
   */
  castShadow?: boolean;
  /**
   * Set false to skip shadow sampling entirely. Decal faces — text planes
   * sitting millimetres proud of solid geometry — must opt out: the shadow
   * map cannot resolve the sliver of depth between decal and backing, and
   * the backing falsely shadows the decal (a dark disc that grows with
   * viewing distance, centred wherever the surface is nearest the viewer).
   */
  receiveShadow?: boolean;
  mottleScale?: number;
  mottleAmount?: number;
  side?: Side;
}

export interface HyperMaterial extends ShaderMaterial {
  isHyperMaterial: true;
  hemisphere: Hemisphere;
}

function build(
  shared: SharedUniforms,
  placement: ObjectUniforms,
  hemisphere: Hemisphere,
  opts: HyperMaterialOptions,
): HyperMaterial {
  const receives = shared.shadowsEnabled && hemisphere !== 'top' && opts.receiveShadow !== false;
  const mottled = (opts.mottleAmount ?? 0) > 0;
  const gridded = (opts.gridScale ?? 0) > 0;

  const defines: Record<string, string> = {};
  if (hemisphere === 'top') defines.TOP_HEMISPHERE = '1';
  if (hemisphere === 'bottom') defines.BOTTOM_HEMISPHERE = '1';
  if (opts.map) defines.USE_MAP = '1';
  if (opts.map && opts.alphaBlend) defines.USE_ALPHA_BLEND = '1';
  // The far hemisphere is beyond the shadow map's reach (and mostly fog), so
  // only near-side materials pay for the sampling.
  if (receives) defines.USE_SHADOWMAP = '1';
  if (gridded) defines.USE_GRID = '1';
  if (mottled) {
    defines.USE_MOTTLE = '1';
    defines.NOISE_TEXEL = (1 / NOISE_SIZE).toFixed(8);
  }

  const uniforms: ShaderMaterial['uniforms'] = {
    uK: shared.uK,
    uUnitScale: shared.uUnitScale,
    uLightDir: shared.uLightDir,
    uFog: shared.uFog,
    uFogInvDist: shared.uFogInvDist,
    uTanKHeight: { value: opts.tanKHeight === false ? 0 : 1 },
    uHyperPos: placement.uHyperPos,
    uHyperRot: placement.uHyperRot,
    uColor: { value: new Color(opts.color ?? 0xffffff) },
    uAmbient: { value: opts.ambient ?? 0.55 },
  };
  if (receives) {
    uniforms.uShadowMap = shared.uShadowMap;
    uniforms.uShadowMatrix = shared.uShadowMatrix;
    uniforms.uShadowBias = shared.uShadowBias;
    uniforms.uShadowStrength = shared.uShadowStrength;
    uniforms.uShadowTexel = shared.uShadowTexel;
    uniforms.uShadowSoft = shared.uShadowSoft;
  }
  if (gridded) {
    uniforms.uGridScale = { value: opts.gridScale };
    uniforms.uGridWidth = { value: opts.gridWidth ?? 1.5 };
    uniforms.uGridFade = { value: opts.gridFade ?? 4.0 };
  }
  if (mottled) {
    uniforms.uMottleScale = { value: opts.mottleScale ?? 40.0 };
    uniforms.uMottleAmount = { value: opts.mottleAmount };
    uniforms.uNoise = { value: noiseTexture() };
    uniforms.uStaticPos = placement.uStaticPos;
    uniforms.uStaticRot = placement.uStaticRot;
  }
  if (opts.map) {
    uniforms.uMap = { value: opts.map };
    uniforms.uAlphaTest = { value: opts.alphaTest ?? 0.5 };
  }

  const mat = new ShaderMaterial({
    glslVersion: GLSL3,
    defines,
    uniforms,
    vertexShader: HYPER_COMMON + HYPER_VERTEX,
    fragmentShader: HYPER_COMMON + HYPER_FRAGMENT,
  }) as HyperMaterial;

  mat.isHyperMaterial = true;
  mat.hemisphere = hemisphere;
  if (opts.map && opts.alphaBlend) {
    mat.transparent = true;
    // Coplanar paint on the surface below it. Writing depth would only let one
    // decal occlude another at the same spot, which is not a thing that
    // happens here, and would break the blend if it did.
    mat.depthWrite = false;
  }
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
  placement: ObjectUniforms,
  opts: HyperMaterialOptions = {},
): HyperMaterial[] {
  if (HM.K > 0) {
    return [build(shared, placement, 'bottom', opts), build(shared, placement, 'top', opts)];
  }
  return [build(shared, placement, 'none', opts)];
}

/**
 * The depth-only material for the shadow pass: the same curved-space warp,
 * rendered from the light's point of view.
 */
export function createShadowDepthMaterial(
  shared: SharedUniforms,
  placement: ObjectUniforms,
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
      uHyperPos: placement.uHyperPos,
      uHyperRot: placement.uHyperRot,
      uMap: { value: opts.map ?? null },
      uAlphaTest: { value: opts.alphaTest ?? 0.5 },
    },
    vertexShader: HYPER_COMMON + HYPER_DEPTH_VERTEX,
    fragmentShader: HYPER_DEPTH_FRAGMENT,
  }) as HyperMaterial;

  mat.isHyperMaterial = true;
  mat.hemisphere = 'none';
  return mat;
}
