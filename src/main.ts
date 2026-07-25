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
const EYE_HEIGHT = 0.06;

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

// ------------------------------------------------- markers at known distances
// Walking toward these shows the signature spherical behaviour: they shrink
// until a quarter turn away, then grow again as you keep going.
const markerGeo = new BoxGeometry(0.018, 0.11, 0.018, 3, 10, 3);
markerGeo.translate(0, 0.055, 0);

const MARKERS = [0.3, 0.6, 1.0, 1.4, QUARTER, 2.0, 2.4, 2.8];
for (let i = 0; i < MARKERS.length; i++) {
  const d = MARKERS[i];
  const obj = new HyperObject(GyroVector.fromGeodesic(new Vector3(0, 0, -1), d));
  obj.addGeometry(world.shared, markerGeo, {
    color: i % 2 === 0 ? 0xe8e2d4 : 0xc0392b,
    ambient: 0.5,
  });
  world.add(obj);
}

// ------------------------------------------------------ the antipode landmark
// Whatever sits here is visible from everywhere in the world, smeared across
// the whole sky. In the real site this is the slot for the hero element.
const landmarkGeo = new BoxGeometry(0.05, 0.34, 0.05, 5, 26, 5);
landmarkGeo.translate(0, 0.17, 0);
const landmark = new HyperObject(
  GyroVector.fromGeodesic(new Vector3(0, 0, -1), HALF_TURN - 0.12),
);
landmark.addGeometry(world.shared, landmarkGeo, { color: 0x2f4f8f, ambient: 0.45 });
world.add(landmark);

// ------------------------------------------------------------ scattered props
const propGeo = new BoxGeometry(0.035, 0.035, 0.035, 3, 3, 3);
propGeo.translate(0, 0.0175, 0);
for (let i = 0; i < 40; i++) {
  const ang = (i / 40) * Math.PI * 2 * 3.7;
  const dist = 0.25 + (i / 40) * 2.6;
  const dir = new Vector3(Math.cos(ang), 0, Math.sin(ang));
  const obj = new HyperObject(GyroVector.fromGeodesic(dir, dist));
  obj.addGeometry(world.shared, propGeo, {
    color: [0xd98c5f, 0x7a9e7e, 0xcfc09a, 0x9b6b9e][i % 4],
    ambient: 0.5,
  });
  world.add(obj);
}

// ------------------------------------------------------------------ controls
const controls = new Controls(world, canvas, { speed: 0.28, levelHorizon: true });

// Stand on the ground rather than in it.
world.worldGV = new GyroVector(new Vector3(0, -Math.tan(EYE_HEIGHT / 2), 0));

addEventListener('resize', () => world.resize());

// Debug handle for inspecting the world from the console.
(window as unknown as Record<string, unknown>).demo = { world, controls, GyroVector, Vector3 };

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
  hud.innerHTML =
    `<b>geometry</b>  spherical (K = ${HM.K})\n` +
    `<b>world</b>     circumference 2π = ${(2 * Math.PI).toFixed(4)} rad\n` +
    `<b>position</b>  ${travelled.toFixed(4)} rad from spawn\n` +
    `<b>          </b>${((travelled / (2 * Math.PI)) * 100).toFixed(1)}% of the way around\n` +
    `<b>poincare</b>  |p| = ${gv.vec.length().toFixed(4)}\n` +
    `<b>holonomy</b>  ${gv.gyr.w.toFixed(6)} (w component)\n` +
    `<b>fps</b>       ${fps.toFixed(0)}`;

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
