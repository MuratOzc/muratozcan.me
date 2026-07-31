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
 * The passes then split the depth buffer between them by writing gl_FragDepth
 * manually — bottom occupies [0, 0.5], top occupies [0.5, 1] reversed. The
 * overlap between 0.5 and 2.0 is deliberate: both passes draw there, the nearer
 * bottom pass wins, and the seam disappears.
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
uniform float uK;
uniform float uUnitScale;
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
uniform vec3 uStaticPos;
uniform mat3 uStaticRot;

#ifdef USE_SHADOWMAP
uniform mat4 uShadowMatrix;
out vec4 vShadowCoord;
#endif

out vec3 vNormal;
out vec2 vUv;
out float vWDot;
out vec3 vLocalPos;
out vec4 vSphere;

void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  vLocalPos = position;
` + HYPER_LIFT + /* glsl */ `
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
  vec3 dummyN = vec3(0.0, 1.0, 0.0);
  vec3 ps = mobius_add(p, uStaticPos, dummyN);
  ps = uStaticRot * ps;
  float rs = dot(ps, ps);
  vSphere = vec4(2.0 * ps, 1.0 - rs) / (1.0 + rs);

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

  // The camera never translates — the world moves instead — so strip any
  // translation from the view matrix and keep only its rotation.
  gl_Position = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(p, w);
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
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
` + HYPER_LIFT + /* glsl */ `
  p = mobius_add(p, uHyperPos, n);
  p = uHyperRot * p;

  vWDot = dot(p, p);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const HYPER_DEPTH_FRAGMENT = /* glsl */ `
uniform float uShadowMaxWDot;

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
uniform vec3 uLightDir;
uniform vec4 uFog;
uniform float uFogInvDist;
uniform float uGridScale;
uniform float uGridWidth;
uniform float uGridFade;
uniform float uMottleScale;
uniform float uMottleAmount;

#ifdef USE_MAP
uniform sampler2D uMap;
uniform float uAlphaTest;
#endif

#ifdef USE_SHADOWMAP
// A comparison sampler: texture() returns how much of the bilinear footprint
// passes the depth test, so each tap is already softened in hardware.
uniform highp sampler2DShadow uShadowMap;
uniform float uShadowBias;
uniform float uShadowStrength;
uniform float uShadowTexel;
in vec4 vShadowCoord;
#endif

in vec3 vNormal;
in vec2 vUv;
in float vWDot;
in vec3 vLocalPos;
in vec4 vSphere;

layout(location = 0) out vec4 fragColor;

float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}

float fbm(vec3 p) {
  return 0.5 * vnoise(p) + 0.3 * vnoise(p * 2.17) + 0.2 * vnoise(p * 4.61);
}

#ifdef USE_SHADOWMAP
// 1 = fully lit, 0 = fully occluded. ndl is dot(n, uLightDir), used to scale
// the bias: grazing surfaces need more slack or they self-shadow into acne.
float shadowFactor(float ndl) {
  vec3 sc = vShadowCoord.xyz;
  if (sc.z <= 0.0 || sc.z >= 1.0) return 1.0;

  // Fade out toward the edge of the map so shadows dissolve with distance
  // instead of being clipped by an invisible square.
  vec2 edge = abs(sc.xy * 2.0 - 1.0);
  float fade = 1.0 - smoothstep(0.7, 0.95, max(edge.x, edge.y));
  if (fade <= 0.0) return 1.0;

  float bias = uShadowBias * (0.3 + 0.7 * (1.0 - clamp(ndl, 0.0, 1.0)));
  float z = sc.z - bias;

  float lit = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      lit += texture(uShadowMap, vec3(sc.xy + vec2(float(x), float(y)) * uShadowTexel, z));
    }
  }
  lit /= 9.0;

  return 1.0 - fade * uShadowStrength * (1.0 - lit);
}
#endif

void main() {
  // w_dot is strictly positive, but MSAA can extrapolate it negative at edges,
  // so clamp before using it. (CodeParade hit this too.)
  float w_dot = max(vWDot, 0.0);

  #ifdef TOP_HEMISPHERE
    if (w_dot < 0.5) discard;
    gl_FragDepth = 1.0 - 0.5 * gl_FragCoord.z;
  #endif
  #ifdef BOTTOM_HEMISPHERE
    if (w_dot > 2.0) discard;
    gl_FragDepth = 0.5 * gl_FragCoord.z;
  #endif

  // Fog doubles as the depth cue. Spherical space needs its own curve because
  // w_dot is not monotonic in distance the way it is when K <= 0.
  float fog_a;
  if (uK > 0.5) {
    fog_a = uFog.a * w_dot / (2.0 + uK * w_dot);
    fog_a *= fog_a;
    fog_a *= fog_a;
  } else {
    fog_a = uFog.a * (1.0 - max(1.0 - uFogInvDist * w_dot, 0.0));
  }

  vec3 n = normalize(vNormal);
  float ndl = dot(n, uLightDir);
  float diffuse = clamp(0.5 + 0.5 * ndl, 0.0, 1.0);

  // Shadow scales the DIRECT light only; the ambient floor below is what a
  // fully shadowed surface is left with.
  #ifdef USE_SHADOWMAP
    diffuse *= shadowFactor(ndl);
  #endif

  diffuse = uAmbient + (1.0 - uAmbient) * diffuse;

  vec3 base = uColor;
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

  vec3 col = base * diffuse;

  // Optional surface grid, in authored Unit coordinates so the lines follow the
  // geometry rather than the screen.
  //
  // It has to fade with distance. Near the grazing band the ground compresses
  // enormously, fwidth explodes, and an un-faded grid collapses into a smear of
  // aliased mush — which reads as the render being broken when it is not.
  if (uGridScale > 0.0) {
    vec2 g = abs(fract(vLocalPos.xz * uGridScale) - 0.5);
    vec2 w = fwidth(vLocalPos.xz * uGridScale) * uGridWidth;
    vec2 line = smoothstep(vec2(0.0), w, g);
    float fade = 1.0 / (1.0 + w_dot * uGridFade);
    col *= mix(1.0, 0.55 + 0.45 * min(line.x, line.y), fade);
  }

  // Seamless surface mottling. Driven by the 3-sphere coordinate, so it is
  // continuous across tile boundaries — no grid direction to kink, nothing to
  // reveal where one tile ends and the next begins.
  if (uMottleAmount > 0.0) {
    vec3 sp = vec3(vSphere.x, vSphere.z, vSphere.w);
    float m = fbm(sp * uMottleScale);
    float coarse = fbm(sp * (uMottleScale * 0.17));
    col *= 1.0 + uMottleAmount * ((m - 0.5) + 0.8 * (coarse - 0.5));
  }

  col = mix(col, uFog.rgb, fog_a);
  fragColor = vec4(col, alpha);
}
`;
