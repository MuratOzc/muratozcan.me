import { BoxGeometry, PlaneGeometry, Vector3 } from 'three';
import {
  Controls,
  GyroVector,
  HM,
  HyperObject,
  HyperWorld,
  formatSelfTests,
  runSelfTests,
} from './engine';
import { ANTIPODE, buildAntipode, buildStack } from './world/layout';

/**
 * Demo world exercising the engine.
 *
 * The ground is built as the six faces of a cube inflated onto the 3-sphere —
 * the {4,3} tiling, which is what `setTileType(3)` describes. Each face spans
 * 90 degrees of the world, so six of them close it up completely.
 */

const canvas = document.getElementById('view') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const tests = document.getElementById('tests') as HTMLDivElement;

const world = new HyperWorld({
  canvas,
  curvature: 1,
  unitScale: 1,
  background: 0xaebfd0,
  fogColor: [0.70, 0.78, 0.88],
  fogDensity: 0.9,
  fov: 58,
});
world.setLightDirection(new Vector3(0.35, 0.9, 0.25));

const HALF_TURN = Math.PI;
const QUARTER = Math.PI / 2;

// Scale discipline. In Unit coordinates with unitScale = 1, one unit IS one
// radian of geodesic distance, and the whole universe is only 2*PI around. So
// a person is EYE_HEIGHT tall and everything else is sized against that. Get
// this wrong and objects are literally continent-sized.
// 0.1 is CodeParade's value for Hyperbolica. It makes the world about 63 eye
// heights around, which is what gives it the feel of a small planet rather
// than a room or a continent.
const EYE_HEIGHT = 0.1;

// -------------------------------------------------------------- ground
const groundGeo = new PlaneGeometry(2, 2, 96, 96);
groundGeo.rotateX(-Math.PI / 2);

interface Face {
  dir: Vector3;
  dist: number;
}

// The six faces of a cube inflated onto the 3-sphere. They all lie on the SAME
// great 2-sphere, so the surface is genuinely seamless — give them different
// colours or a tile-local grid, though, and the cube becomes obvious. Uniform
// colour plus world-anchored mottling keeps the tiling invisible.
const faces: Face[] = [
  { dir: new Vector3(0, 0, 0), dist: 0 },
  { dir: new Vector3(1, 0, 0), dist: QUARTER },
  { dir: new Vector3(-1, 0, 0), dist: QUARTER },
  { dir: new Vector3(0, 0, 1), dist: QUARTER },
  { dir: new Vector3(0, 0, -1), dist: QUARTER },
  // The sixth face sits at the antipode, where the Poincare radius is
  // infinite. Nudging it a hair short keeps it finite; the far-hemisphere
  // inversion in the shader maps it back to a sane magnitude.
  { dir: new Vector3(1, 0, 0), dist: HALF_TURN - 1e-3 },
];

for (const f of faces) {
  const gv = f.dist === 0 ? new GyroVector() : GyroVector.fromGeodesic(f.dir, f.dist);
  const tile = new HyperObject(gv);
  tile.addGeometry(world.shared, groundGeo, {
    color: 0x8ab967,
    ambient: 0.62,
    mottleScale: 34,
    mottleAmount: 0.3,
  });
  world.add(tile);
}

// --------------------------------------------------------------- the stack
// Every layer of the technology, laid out as a descent along one geodesic.
// Walk forward from spawn and you go down the stack; the antipode holds the
// person all of it terminates at.
const stack = buildStack(world);
buildAntipode(world);

// ------------------------------------------------------------ scattered props
// Ground detail. Without something small and irregular nearby there is no cue
// for speed or scale while walking.
const propGeo = new BoxGeometry(0.022, 0.022, 0.022, 2, 2, 2);
propGeo.translate(0, 0.011, 0);
for (let i = 0; i < 60; i++) {
  const ang = (i / 60) * Math.PI * 2 * 5.3;
  const dist = 0.2 + (i / 60) * 2.9;
  const dir = new Vector3(Math.cos(ang), 0, Math.sin(ang));
  const obj = new HyperObject(GyroVector.fromGeodesic(dir, dist));
  obj.addGeometry(world.shared, propGeo, {
    color: [0x9aa878, 0x8b9c6e, 0xa8b184, 0x7f8f66][i % 4],
    ambient: 0.55,
  });
  world.add(obj);
}

// ------------------------------------------------------------------ controls
const controls = new Controls(world, canvas, {
  eyeHeight: EYE_HEIGHT,
  // Multiples of eye height per second — HyperEngine's convention, and
  // CodeParade's number. A full lap takes about 28 seconds.
  speed: 2.25,
});
controls.reset();

addEventListener('resize', () => world.resize());

// Debug handle for inspecting the world from the console.
(window as unknown as Record<string, unknown>).demo = {
  world,
  controls,
  GyroVector,
  Vector3,
  HyperObject,
  /** Drop a test box of a given size, tessellation and placement. */
  box(opts: {
    w?: number; h?: number; d?: number;
    seg?: number;
    dist?: number; dir?: Vector3;
    color?: number; tanK?: boolean;
  }) {
    const w = opts.w ?? 0.4, h = opts.h ?? 0.4, dd = opts.d ?? 0.4;
    const seg = opts.seg ?? 1;
    const g = new BoxGeometry(w, h, dd, seg, seg, seg);
    g.translate(0, h / 2, 0);
    const gv = opts.dist
      ? GyroVector.fromGeodesic(opts.dir ?? new Vector3(0, 0, -1), opts.dist)
      : new GyroVector();
    const o = new HyperObject(gv, opts.tanK ?? true);
    o.addGeometry(world.shared, g, { color: opts.color ?? 0xdd5522, ambient: 0.5 });
    world.add(o);
    return o;
  },
  clearBoxes(objs: HyperObject[]) {
    for (const o of objs) world.remove(o);
  },
};

// --------------------------------------------------------------- self tests
const results = runSelfTests();
const failed = results.filter((r) => !r.pass).length;
tests.innerHTML =
  `<b class="${failed ? 'fail' : 'pass'}">${results.length - failed}/${results.length} math invariants hold</b>\n` +
  formatSelfTests(results);

// -------------------------------------------------------------------- loop
let last = performance.now();
let fps = 0;
let acc = 0;
let frames = 0;

function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  acc += dt;
  frames++;
  if (acc > 0.4) {
    fps = frames / acc;
    acc = 0;
    frames = 0;
  }

  controls.update(dt);
  world.render();

  const gv = world.worldGV;
  const travelled = world.distanceFromOrigin();

  // Which layer of the stack are you standing in? Geodesic distance to each
  // domain, cheapest possible: compose and read the Poincare radius.
  let nearest: string = ANTIPODE.title;
  let nearestBlurb: string = ANTIPODE.blurb;
  let nearestDist = Infinity;
  for (const p of stack) {
    const d = 2 * Math.atan(p.object.localGV.add(gv).vec.length());
    if (d < nearestDist) {
      nearestDist = d;
      nearest = p.domain.title;
      nearestBlurb = p.domain.blurb;
    }
  }
  hud.innerHTML =
    `<b>geometry</b>  spherical (K = ${HM.K})\n` +
    `<b>world</b>     circumference 2π = ${(2 * Math.PI).toFixed(4)} rad\n` +
    // Straight-line distance from spawn peaks at PI, at the antipode, and then
    // counts back down. It is not an odometer — distanceWalked is.
    `<b>from spawn</b> ${travelled.toFixed(3)} rad  (max ${Math.PI.toFixed(3)} at the antipode)\n` +
    `<b>walked</b>    ${controls.distanceWalked.toFixed(2)} rad  = ${(controls.distanceWalked / (2 * Math.PI)).toFixed(2)} laps\n` +
    `<b>poincare</b>  |p| = ${gv.vec.length().toFixed(4)}\n` +
    `<b>height</b>    ${controls.height.toFixed(4)} rad  (${(controls.height / EYE_HEIGHT).toFixed(2)}x eye)\n` +
    `<b>mode</b>      ${controls.mode}${controls.isLocked ? '' : '  — click to look'}\n` +
    `\n<b>nearest</b>   ${nearest}  (${nearestDist.toFixed(2)} rad)\n` +
    `          ${nearestBlurb}\n` +
    `<b>holonomy</b>  ${gv.gyr.w.toFixed(6)} (w component)\n` +
    `<b>fps</b>       ${fps.toFixed(0)}`;

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
