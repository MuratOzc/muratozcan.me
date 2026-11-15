/**
 * The curved-space vertex/fragment core.
 *
 * Ported from HyperEngine's Assets/HyperEngine/Shaders/HyperCore.cginc.
 *
 * ---------------------------------------------------------------------------
 * THE TWO-HEMISPHERE TRICK
 * ---------------------------------------------------------------------------
 * In spherical space, Poincare coordinates run to infinity at the antipode. No
 * single projection can draw the whole world, so CodeParade's solution is to
 * not try: every object is rendered TWICE, once per hemisphere.
 *
 *   BOTTOM pass  draws the near half as-is, and discards w_dot > 2
 *   TOP pass     inverts through the unit sphere (p /= w_dot) to bring the far
 *                half into view, and discards w_dot < 0.5
 *
 * The passes then split the depth buffer between them — bottom occupies
 * [0, 0.5], top occupies [0.5, 1] reversed. The overlap between 0.5 and 2.0 is
 * deliberate: both passes draw there, the nearer bottom pass wins, and the
 * seam disappears.
 *
 * This is why naive single-pass approaches fall apart past the quarter turn.
 * The fix is not a better projection, it is a second draw.
 *
 * ---------------------------------------------------------------------------
 * SHADOWS IN THE CHART
 * ---------------------------------------------------------------------------
 * Lighting in this engine is deliberately non-geodesic: uLightDir is a fixed
 * direction in the viewer's Poincare chart, exactly HyperEngine's cheat. That
 * cheat is what makes real shadow mapping possible. Light "rays" are straight
 * lines in chart space, so an ordinary orthographic depth map rendered IN THAT
 * CHART agrees with the diffuse term by construction — shadows fall exactly
 * where dot(n, uLightDir) says the light comes from.
 *
 * The depth pass reuses the identical vertex warp (same Möbius composition,
 * same tessellated triangles), only projected by the light's camera instead of
 * the viewer's. Any mismatch between the two warps would show up as acne, so
 * both shaders are assembled from the same source chunks below.
 *
 * The chart moves when the viewer does, so the map is re-rendered every frame
 * — this also means the light camera can stay centred on the origin, where the
 * viewer permanently sits and where shadow detail matters most. Geometry near
 * the antipode has enormous chart coordinates; a triangle straddling the light
 * frustum could rasterise a phantom occluder straight through it, so the depth
 * pass discards fragments whose interpolated w_dot is beyond the shadow range.
 */

export const HYPER_COMMON = /* glsl */ `
// A block, not plain uniforms: three re-sends plain ones on every draw call.
// The layout has to match createSharedUniforms member for member.
layout(std140) uniform World {
  mat4 uShadowMatrix;
  vec4 wSpace;
  vec4 wLight;
  vec4 wSun;
  vec4 wSky;
  vec4 wGround;
  vec4 wHorizon;
  vec4 wZenith;
  vec4 wGlow;
};
#define uK wSpace.x
#define uUnitScale wSpace.y
#define uTime wSpace.z
#define uFogInvDist wSpace.w
#define uLightDir wLight.xyz
#define uFogDensity wLight.w
#define uSunColor wSun.rgb
#define uHaze wSun.w
#define uSkyLight wSky.rgb
#define uShadowBias wSky.w
#define uGroundLight wGround.rgb
#define uShadowStrength wGround.w
#define uFogHorizon wHorizon.rgb
#define uShadowTexel wHorizon.w
#define uFogZenith wZenith.rgb
#define uShadowSoft wZenith.w
#define uSunGlow wGlow.rgb
#define uShadowMaxWDot wGlow.w

uniform float uTanKHeight;

float tan_k(float x) {
  if (uK > 0.5)  return tan(x);
  if (uK < -0.5) return tanh(x);
  return x;
}
`;

/** Uniforms and functions every warping vertex shader needs. */
const HYPER_WARP = /* glsl */ `
uniform vec3 uHyperPos;
uniform mat3 uHyperRot;

vec3 qtransform(vec4 q, vec3 v) {
  vec3 t = cross(q.xyz, v);
  t += t;
  return v + q.w * t + cross(q.xyz, t);
}

// Möbius addition, with the matching normal transform folded in. The gyration
// quaternion (c, d) is exactly the rotation the addition induces, so surface
// normals have to ride along or lighting goes wrong as objects move.
vec3 mobius_add(vec3 b, vec3 a, inout vec3 n) {
  vec3 c = uK * cross(a, b);
  float d = 1.0 - uK * dot(a, b);
  vec3 t = a + b;
  n = qtransform(normalize(vec4(c, d)), n);
  return (t * d + cross(c, t)) / (d * d + dot(c, c));
}

vec3 mobius_add_point(vec3 b, vec3 a) {
  vec3 c = uK * cross(a, b);
  float d = 1.0 - uK * dot(a, b);
  vec3 t = a + b;
  return (t * d + cross(c, t)) / (d * d + dot(c, c));
}
`;

/**
 * Unit -> Poincare lift, operating on `p`. Shared verbatim between the display
 * and shadow-depth vertex shaders — they must warp identically.
 */
const HYPER_LIFT = /* glsl */ `
  // Unit -> Klein
  p *= uUnitScale;
  if (uTanKHeight > 0.5) {
    p.y = tan_k(p.y) * sqrt(1.0 + uK * dot(p.xz, p.xz));
  }

  // Klein -> Poincare. Written as K*(K + dot) rather than 1 + K*dot so that
  // K = 0 falls out as an exact identity with no branch.
  p /= sqrt(uK * (uK + dot(p, p))) + 1.0;
`;

export const HYPER_VERTEX = HYPER_WARP + /* glsl */ `
in vec4 aTint;

#ifdef USE_MOTTLE
uniform vec3 uStaticPos;
uniform mat3 uStaticRot;
out vec4 vSphere;
#endif

#ifdef USE_SHADOWMAP
out vec4 vShadowCoord;
#endif

#ifdef USE_GRID
out vec3 vLocalPos;
#endif

out vec3 vNormal;
out vec2 vUv;
out float vWDot;
out vec4 vTint;
out vec4 vView;

#ifdef USE_SURFACE
in vec3 aSurface;
in vec3 aGrain;
out vec3 vSurface;
out vec3 vGrain;
#endif

#ifdef USE_SWAY
uniform float uSway;
#endif

void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  vTint = aTint;
  #ifdef USE_SURFACE
    vSurface = aSurface;
    vGrain = aGrain;
  #endif
  #ifdef USE_SWAY
    float bend = uSway * uv.y * uv.y;
    p.x += bend * sin(uTime * 1.7 + p.x * 3.1 + p.z * 2.3);
    p.z += bend * 0.6 * cos(uTime * 1.3 + p.x * 2.7 - p.z * 1.9);
  #endif
  // Height above the ground; has to be read before the lift.
  vView.w = p.y;
  #ifdef USE_GRID
    vLocalPos = position;
  #endif
` + HYPER_LIFT + /* glsl */ `
  #ifdef USE_MOTTLE
  // A world coordinate that does not move when the viewer does.
  //
  // uStaticPos/uStaticRot are the object's own placement WITHOUT the camera
  // composed in, so this is fixed to the world rather than to the observer.
  // Lifting it back onto the unit 3-sphere (the inverse stereographic map)
  // gives a bounded, continuous coordinate that stays well behaved all the way
  // to the antipode — where Poincare coordinates run to infinity.
  //
  // This is what makes seamless surface texturing possible. Anything derived
  // from tile-local coordinates breaks at tile boundaries; anything derived
  // from this does not, because neighbouring tiles agree here by construction.
  vec3 ps = uStaticRot * mobius_add_point(p, uStaticPos);
  float rs = dot(ps, ps);
  vSphere = vec4(2.0 * ps, 1.0 - rs) / (1.0 + rs);
  #endif

  // Place into curved space: object transform composed with the camera
  // transform, both baked into uHyperPos / uHyperRot on the CPU.
  p = mobius_add(p, uHyperPos, n);
  p = uHyperRot * p;
  n = uHyperRot * n;

  float w_dot = dot(p, p);
  vWDot = w_dot;

#ifdef USE_SHADOWMAP
  // Light-space position, taken BEFORE the hemisphere inversion: the shadow
  // map lives in the same chart as the lighting, and only covers the near
  // region anyway. (Top-hemisphere materials never define USE_SHADOWMAP.)
  vShadowCoord = uShadowMatrix * vec4(p, 1.0);
#endif

  #ifdef TOP_HEMISPHERE
    // Invert through the unit sphere to render the far hemisphere.
    p /= w_dot;
  #endif

  // Hyperbolic space projects through Beltrami-Klein; spherical does not.
  float w = 1.0;
  if (uK < -0.5) { w = 1.0 + w_dot; }

  vNormal = n;
  vView.xyz = p;

  // The camera never translates — the world moves instead — so strip any
  // translation from the view matrix and keep only its rotation.
  gl_Position = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(p, w);

  // The depth split has to stay here: writing gl_FragDepth instead gives the
  // same image but turns off early depth rejection for every material.
  #ifdef TOP_HEMISPHERE
    gl_Position.z = 0.5 * (gl_Position.w - gl_Position.z);
  #endif
  #ifdef BOTTOM_HEMISPHERE
    gl_Position.z = 0.5 * (gl_Position.z - gl_Position.w);
  #endif
}
`;

/**
 * The shadow-depth vertex shader: the same warp, projected by the light's
 * orthographic camera. Here `viewMatrix` belongs to the light camera and its
 * translation is KEPT — the light sits away from the origin looking back.
 */
export const HYPER_DEPTH_VERTEX = HYPER_WARP + /* glsl */ `
out vec2 vUv;
out float vWDot;

void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  vUv = uv;
` + HYPER_LIFT + /* glsl */ `
  p = uHyperRot * mobius_add_point(p, uHyperPos);

  vWDot = dot(p, p);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const HYPER_DEPTH_FRAGMENT = /* glsl */ `
#ifdef USE_MAP
uniform sampler2D uMap;
uniform float uAlphaTest;
#endif

in vec2 vUv;
in float vWDot;

layout(location = 0) out vec4 fragColor;

void main() {
  // Kill far-hemisphere geometry. Its chart coordinates are enormous, and a
  // triangle with vertices on both sides of the light frustum would otherwise
  // rasterise a phantom occluder through the middle of the map.
  if (vWDot > uShadowMaxWDot) discard;

  // Cutout textures (signage) should cast cutout shadows, not quad shadows.
  #ifdef USE_MAP
    if (texture(uMap, vUv).a < uAlphaTest) discard;
  #endif

  fragColor = vec4(1.0);
}
`;

export const HYPER_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAmbient;

#ifdef USE_GRID
uniform float uGridScale;
uniform float uGridWidth;
uniform float uGridFade;
in vec3 vLocalPos;
#endif

#ifdef USE_MOTTLE
uniform float uMottleScale;
uniform float uMottleAmount;
uniform float uMottleHue;
in vec4 vSphere;
#endif

#ifdef USE_SURFACE
in vec3 vSurface;
in vec3 vGrain;
#endif

#ifdef USE_NOISE
uniform lowp sampler3D uNoise;
#endif

#ifdef USE_MAP
uniform sampler2D uMap;
uniform float uAlphaTest;
#endif

#ifdef USE_SHADOWMAP
// A comparison sampler: texture() returns how much of the bilinear footprint
// passes the depth test, so each tap is already softened in hardware.
uniform highp sampler2DShadow uShadowMap;
in vec4 vShadowCoord;
#endif

in vec3 vNormal;
in vec2 vUv;
in float vWDot;
in vec4 vTint;
in vec4 vView;

layout(location = 0) out vec4 fragColor;

vec3 shoulder(vec3 c) {
  const float knee = 0.72;
  vec3 over = max(c - knee, 0.0) / (1.0 - knee);
  return min(c, knee) + (1.0 - knee) * over / (1.0 + over);
}

float grain(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

#ifdef USE_NOISE
// The +0.5 puts lattice points on the texel centres of noise.ts's texture.
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return texture(uNoise, (i + f + 0.5) * NOISE_TEXEL).r;
}

float fbm(vec3 p) {
  return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.17) + 0.2 * vnoise(p * 4.61);
}
#endif

#ifdef USE_SHADOWMAP
// 1 = fully lit, 0 = fully occluded. ndl is dot(n, uLightDir), used to scale
// the bias: grazing surfaces need more slack or they self-shadow into acne.
float shadowFactor(float ndl) {
  if (uShadowStrength <= 0.0) return 1.0;
  vec3 sc = vShadowCoord.xyz;
  if (sc.z <= 0.0 || sc.z >= 1.0) return 1.0;

  // Fade out toward the edge of the map so shadows dissolve with distance
  // instead of being clipped by an invisible square.
  vec2 edge = abs(sc.xy * 2.0 - 1.0);
  float fade = 1.0 - smoothstep(0.7, 0.95, max(edge.x, edge.y));
  if (fade <= 0.0) return 1.0;

  float bias = uShadowBias * (0.3 + 0.7 * (1.0 - clamp(ndl, 0.0, 1.0)));
  float z = sc.z - bias;

  float lit;
  if (uShadowSoft > 0.5) {
    lit = 0.0;
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        lit += texture(uShadowMap, vec3(sc.xy + vec2(float(x), float(y)) * uShadowTexel, z));
      }
    }
    lit /= 9.0;
  } else {
    lit = texture(uShadowMap, vec3(sc.xy, z));
  }

  return 1.0 - fade * uShadowStrength * (1.0 - lit);
}
#endif

void main() {
  // w_dot is strictly positive, but MSAA can extrapolate it negative at edges,
  // so clamp before using it. (CodeParade hit this too.)
  float w_dot = max(vWDot, 0.0);

  #ifdef TOP_HEMISPHERE
    if (w_dot < 0.5) discard;
  #endif
  #ifdef BOTTOM_HEMISPHERE
    if (w_dot > 2.0) discard;
  #endif

  // Fog doubles as the depth cue. Spherical space needs its own curve because
  // w_dot is not monotonic in distance the way it is when K <= 0.
  float fog_a;
  if (uK > 0.5) {
    fog_a = uFogDensity * w_dot / (2.0 + uK * w_dot);
    fog_a *= fog_a;
    fog_a *= fog_a;
    // w/(1+w) is sin^2 of half the geodesic distance.
    fog_a = 1.0 - (1.0 - fog_a) * exp(-uHaze * w_dot / (1.0 + w_dot));
  } else {
    fog_a = uFogDensity * (1.0 - max(1.0 - uFogInvDist * w_dot, 0.0));
  }

  vec3 n = normalize(vNormal);
  vec3 view = normalize(vView.xyz);
  float ndl = dot(n, uLightDir);
  float direct = clamp((ndl + 0.25) / 1.25, 0.0, 1.0);

  // Shadow scales the DIRECT light only; the ambient floor below is what a
  // fully shadowed surface is left with.
  float sunlit = 1.0;
  #ifdef USE_SHADOWMAP
    sunlit = shadowFactor(ndl);
  #endif
  direct *= sunlit;

  // At ambient 1 a surface is a lamp or a screen and takes no light at all.
  float ambient = uAmbient * vTint.a;
  float unlit = smoothstep(0.85, 1.0, ambient);
  float open = mix(0.6, 1.0, smoothstep(0.0, 0.7, vView.w));
  open = mix(open, 1.0, clamp(n.y, 0.0, 1.0));
  vec3 light = ambient * open * mix(uGroundLight, uSkyLight, 0.5 + 0.5 * n.y)
             + (1.0 - ambient) * direct * uSunColor;
  light = mix(light, vec3(1.0), unlit);

  vec3 base = uColor * vTint.rgb;
  float alpha = 1.0;
  #ifdef USE_MAP
    // Cutout rather than blending. Sorting transparent surfaces would have to
    // cope with the two hemisphere passes each owning half the depth range,
    // which is not worth it for signage.
    vec4 tex = texture(uMap, vUv);
    #ifdef USE_ALPHA_BLEND
      // Composited, not cut out. A cutout decides per pixel whether a texel is
      // there at all, which is the wrong question for paint lying flat on a
      // surface: every distant chevron is thinner than the pixel asking, so it
      // answers half yes and half no and the shape breaks into fragments.
      //
      // The mipmap has already averaged that shape down to the right coverage
      // for the distance it is being viewed at. Taking its alpha as-is spends
      // that work instead of throwing it away, and needs no threshold, no
      // derivative rescale, and no MSAA to look right — a texel that is 40%
      // covered draws at 40%.
      alpha = tex.a;
      if (alpha <= 0.0) discard;
    #else
      if (tex.a < uAlphaTest) discard;
    #endif
    base *= tex.rgb;
  #endif

  #ifdef USE_SURFACE
    float gloss = vSurface.x;
    float metal = vSurface.y;
    if (vSurface.z > 0.0) {
      float streak = 0.6 * vnoise(vGrain) + 0.4 * vnoise(vGrain * 2.7 + 3.1);
      base *= 1.0 + vSurface.z * (2.0 * streak - 1.0);
    }
  #else
    const float gloss = 0.0;
  #endif

  vec3 col = base * light;
  float rim = 1.0 - abs(dot(n, view));
  rim *= rim;
  rim *= rim;
  col += base * uSkyLight * (0.35 * rim * (1.0 - unlit) * (1.0 - gloss));

  #ifdef USE_SURFACE
    col *= 1.0 - 0.7 * metal;
    vec3 tinted = mix(vec3(1.0), base, metal);
    vec3 halfway = normalize(uLightDir - view);
    float highlight = pow(max(dot(n, halfway), 0.0), mix(6.0, 240.0, gloss * gloss));
    highlight *= gloss * (0.3 + 1.4 * gloss) * step(0.0, ndl) * sunlit;
    vec3 bounce = reflect(view, n);
    vec3 above = mix(uFogHorizon, uFogZenith, pow(clamp(bounce.y, 0.0, 1.0), 0.6));
    vec3 around = mix(uGroundLight * 0.4, above, smoothstep(-0.2, 0.12, bounce.y));
    float glance = 1.0 - clamp(dot(n, -view), 0.0, 1.0);
    glance *= glance * glance * glance * glance;
    float mirror = gloss * mix(0.04 + 0.96 * glance, 0.9, metal);
    col += tinted * (uSunColor * highlight + around * mirror * open) * (1.0 - unlit);
  #endif

  // Optional surface grid, in authored Unit coordinates so the lines follow the
  // geometry rather than the screen.
  //
  // It has to fade with distance. Near the grazing band the ground compresses
  // enormously, fwidth explodes, and an un-faded grid collapses into a smear of
  // aliased mush — which reads as the render being broken when it is not.
  #ifdef USE_GRID
    vec2 g = abs(fract(vLocalPos.xz * uGridScale) - 0.5);
    vec2 gw = fwidth(vLocalPos.xz * uGridScale) * uGridWidth;
    vec2 line = smoothstep(vec2(0.0), gw, g);
    float gridFade = 1.0 / (1.0 + w_dot * uGridFade);
    col *= mix(1.0, 0.55 + 0.45 * min(line.x, line.y), gridFade);
  #endif

  // Seamless surface mottling. Driven by the 3-sphere coordinate, so it is
  // continuous across tile boundaries — no grid direction to kink, nothing to
  // reveal where one tile ends and the next begins.
  #ifdef USE_MOTTLE
    vec3 sp = vec3(vSphere.x, vSphere.z, vSphere.w);
    float m = fbm(sp * uMottleScale);
    float coarse = fbm(sp * (uMottleScale * 0.17));
    float fine = vnoise(sp * (uMottleScale * 11.3));
    col *= 1.0 + uMottleAmount * (0.55 * (m - 0.5) + 0.7 * (coarse - 0.5) + 0.6 * (fine - 0.5));
    vec3 drift = mix(vec3(0.88, 1.0, 1.1), vec3(1.16, 1.04, 0.8), smoothstep(0.32, 0.68, coarse));
    col *= mix(vec3(1.0), drift, uMottleHue);
  #endif

  float sunward = max(dot(view, uLightDir), 0.0);
  float glow = sunward * sunward;
  glow *= glow;
  glow *= glow;
  vec3 air = mix(uFogHorizon, uFogZenith, pow(clamp(view.y, 0.0, 1.0), 0.75));
  // Only ever a broad glow. The light is fixed to the viewer, not the world,
  // and a disc in the sky makes it plain that the sun walks with you.
  air += uSunGlow * (0.3 * glow);

  col = mix(shoulder(col), air, fog_a);
  // Half a code value of noise, or the sky's gradients band in eight bits.
  col += (grain(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(col, alpha);
}
`;
