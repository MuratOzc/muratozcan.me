import {
  Color,
  GLSL3,
  Matrix3,
  Matrix4,
  ShaderMaterial,
  Uniform,
  UniformsGroup,
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
 * Values shared by every material in the world. Written here as plain fields,
 * and sent to the GPU as one uniform block by `pack`.
 */
export interface SharedUniforms {
  uK: { value: number };
  uUnitScale: { value: number };
  uLightDir: { value: Vector3 };
  uSunColor: { value: Vector3 };
  uSkyLight: { value: Vector3 };
  uGroundLight: { value: Vector3 };
  uFogHorizon: { value: Vector3 };
  uFogZenith: { value: Vector3 };
  uSunGlow: { value: Vector3 };
  uFogDensity: { value: number };
  uHaze: { value: number };
  /** Seconds. */
  uTime: { value: number };
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
  block: UniformsGroup;
  /** Copy the fields above into the block. Once a frame, before any pass. */
  pack(): void;
}

export function createSharedUniforms(): SharedUniforms {
  const [space, light, sun, sky, ground, horizon, zenith, glow] = Array.from(
    { length: 8 },
    () => new Vector4(),
  );
  const block = new UniformsGroup();
  block.setName('World');

  const shared: SharedUniforms = {
    uK: { value: HM.K },
    uUnitScale: { value: HM.unitScale },
    uLightDir: { value: new Vector3(0.4, 0.85, 0.3).normalize() },
    uSunColor: { value: new Vector3(1, 1, 1) },
    uSkyLight: { value: new Vector3(1, 1, 1) },
    uGroundLight: { value: new Vector3(1, 1, 1) },
    uFogHorizon: { value: new Vector3(0.72, 0.79, 0.86) },
    uFogZenith: { value: new Vector3(0.72, 0.79, 0.86) },
    uSunGlow: { value: new Vector3(0, 0, 0) },
    uFogDensity: { value: 1.0 },
    uHaze: { value: 0 },
    uTime: { value: 0 },
    uFogInvDist: { value: 1.0 },
    uShadowMap: { value: null },
    uShadowMatrix: { value: new Matrix4() },
    uShadowBias: { value: 0.0025 },
    uShadowStrength: { value: 0.9 },
    uShadowTexel: { value: 1 / 2048 },
    uShadowSoft: { value: 1 },
    uShadowMaxWDot: { value: 1.0 },
    shadowsEnabled: false,
    block,
    pack() {
      const s = shared;
      const rgb = (out: Vector4, v: Vector3, w: number) => out.set(v.x, v.y, v.z, w);
      space.set(s.uK.value, s.uUnitScale.value, s.uTime.value, s.uFogInvDist.value);
      rgb(light, s.uLightDir.value, s.uFogDensity.value);
      rgb(sun, s.uSunColor.value, s.uHaze.value);
      rgb(sky, s.uSkyLight.value, s.uShadowBias.value);
      rgb(ground, s.uGroundLight.value, s.uShadowStrength.value);
      rgb(horizon, s.uFogHorizon.value, s.uShadowTexel.value);
      rgb(zenith, s.uFogZenith.value, s.uShadowSoft.value);
      rgb(glow, s.uSunGlow.value, s.uShadowMaxWDot.value);
    },
  };

  // In the order the World block declares them in hyperCore.ts.
  block.add(new Uniform(shared.uShadowMatrix.value));
  for (const v of [space, light, sun, sky, ground, horizon, zenith, glow]) {
    block.add(new Uniform(v));
  }
  return shared;
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
  /** 0 to 1: how far the broad mottle patches drift in hue, yellower to cooler. */
  mottleHue?: number;
  /** Authored units. Needs uv.y running 0 at the root to 1 at the tip; not applied in the shadow pass. */
  sway?: number;
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
  const sways = (opts.sway ?? 0) > 0;

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
  if (sways) defines.USE_SWAY = '1';

  const uniforms: ShaderMaterial['uniforms'] = {
    uTanKHeight: { value: opts.tanKHeight === false ? 0 : 1 },
    uHyperPos: placement.uHyperPos,
    uHyperRot: placement.uHyperRot,
    uColor: { value: new Color(opts.color ?? 0xffffff) },
    uAmbient: { value: opts.ambient ?? 0.55 },
  };
  if (receives) uniforms.uShadowMap = shared.uShadowMap;
  if (gridded) {
    uniforms.uGridScale = { value: opts.gridScale };
    uniforms.uGridWidth = { value: opts.gridWidth ?? 1.5 };
    uniforms.uGridFade = { value: opts.gridFade ?? 4.0 };
  }
  if (mottled) {
    uniforms.uMottleScale = { value: opts.mottleScale ?? 40.0 };
    uniforms.uMottleAmount = { value: opts.mottleAmount };
    uniforms.uMottleHue = { value: opts.mottleHue ?? 0 };
    uniforms.uNoise = { value: noiseTexture() };
    uniforms.uStaticPos = placement.uStaticPos;
    uniforms.uStaticRot = placement.uStaticRot;
  }
  if (opts.map) {
    uniforms.uMap = { value: opts.map };
    uniforms.uAlphaTest = { value: opts.alphaTest ?? 0.5 };
  }
  if (sways) uniforms.uSway = { value: opts.sway };

  const mat = new ShaderMaterial({
    glslVersion: GLSL3,
    defines,
    uniforms,
    uniformsGroups: [shared.block],
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
      uTanKHeight: { value: opts.tanKHeight === false ? 0 : 1 },
      uHyperPos: placement.uHyperPos,
      uHyperRot: placement.uHyperRot,
      uMap: { value: opts.map ?? null },
      uAlphaTest: { value: opts.alphaTest ?? 0.5 },
    },
    uniformsGroups: [shared.block],
    vertexShader: HYPER_COMMON + HYPER_DEPTH_VERTEX,
    fragmentShader: HYPER_COMMON + HYPER_DEPTH_FRAGMENT,
  }) as HyperMaterial;

  mat.isHyperMaterial = true;
  mat.hemisphere = 'none';
  return mat;
}
