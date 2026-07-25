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

export const HYPER_VERTEX = /* glsl */ `
uniform vec3 uHyperPos;
uniform mat3 uHyperRot;
uniform vec3 uStaticPos;
uniform mat3 uStaticRot;

out vec3 vNormal;
out vec2 vUv;
out float vWDot;
out vec3 vLocalPos;
out vec4 vSphere;

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

void main() {
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  vLocalPos = position;

  // Unit -> Klein
  p *= uUnitScale;
  if (uTanKHeight > 0.5) {
    p.y = tan_k(p.y) * sqrt(1.0 + uK * dot(p.xz, p.xz));
  }

  // Klein -> Poincare. Written as K*(K + dot) rather than 1 + K*dot so that
  // K = 0 falls out as an exact identity with no branch.
  p /= sqrt(uK * (uK + dot(p, p))) + 1.0;

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
  float diffuse = clamp(0.5 + 0.5 * dot(n, uLightDir), 0.0, 1.0);
  diffuse = uAmbient + (1.0 - uAmbient) * diffuse;

  vec3 col = uColor * diffuse;

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
  fragColor = vec4(col, 1.0);
}
`;
