import { BoxGeometry, PlaneGeometry, Vector3, type BufferGeometry } from 'three';
import {
  Controls,
  GyroVector,
  HM,
  HyperObject,
  HyperWorld,
  formatSelfTests,
  runSelfTests,
  type HyperMaterialOptions,
} from './engine';
import {
  ANTIPODE_DISTANCE,
  placeAlongPath,
  placeOnGround,
  pathYaw,
  type Poi,
} from './world/placement';
import { ProximityPanel } from './world/panel';

/**
 * An empty world.
 *
 * Ground, sky, a viewer who can walk. Nothing placed on it yet.
 *
 * Scale discipline, because it is the easiest thing to get wrong here: with
 * unitScale = 1, one authored unit IS one radian of geodesic distance, and the
 * whole universe is only 2*PI around. A person is EYE_HEIGHT tall and
 * everything else is sized against that. The world is roughly 63 eye-heights
 * around and takes ~28 seconds to lap.
 */

const EYE_HEIGHT = 0.1;

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

// -------------------------------------------------------------------- ground
// Six faces of a cube inflated onto the 3-sphere — the {4,3} tiling, the only
// way to tile a sphere with squares. All six lie on the SAME great 2-sphere,
// so the surface is seamless; give them different colours or a tile-local
// grid and the cube becomes visible, which is why neither is used here.
const groundGeo = new PlaneGeometry(2, 2, 96, 96);
groundGeo.rotateX(-Math.PI / 2);

const QUARTER = Math.PI / 2;
const GROUND_FACES: Array<[number, number]> = [
  [0, 0],
  [0, QUARTER],
  [Math.PI, QUARTER],
  [QUARTER, QUARTER],
  [-QUARTER, QUARTER],
  [0, Math.PI - 1e-3],
];

for (const [bearing, distance] of GROUND_FACES) {
  const tile = new HyperObject(
    distance === 0 ? new GyroVector() : placeOnGround(bearing, distance),
  );
  tile.addGeometry(world.shared, groundGeo, {
    color: 0x8ab967,
    ambient: 0.62,
    mottleScale: 34,
    mottleAmount: 0.3,
  });
  world.add(tile);
}

// --------------------------------------------------------------------- world
// Nothing here yet. Add objects via `spawn(...)` below, or from the console
// through the `world` debug handle.
const pois: Poi[] = [];
const panel = new ProximityPanel();

/**
 * Put something in the world.
 *
 * `at` is the placement. `yaw` rotates the object about its own up axis, in
 * its local Unit frame — that is an ordinary Three rotation applied before the
 * curved-space lift, so it behaves the way you expect.
 */
export function spawn(
  at: GyroVector,
  geometry: BufferGeometry,
  options: HyperMaterialOptions = {},
  yaw = 0,
): HyperObject {
  const object = new HyperObject(at);
  object.rotation.y = yaw;
  object.addGeometry(world.shared, geometry, options);
  world.add(object);
  return object;
}

/** Attach text to a place, shown when the viewer walks near it. */
export function label(gv: GyroVector, title: string, body: string, radius = 0.25): void {
  pois.push({ id: `poi-${pois.length}`, title, body, gv, radius });
}

// ------------------------------------------------------------------ controls
const controls = new Controls(world, canvas, {
  eyeHeight: EYE_HEIGHT,
  // Multiples of eye height per second. A lap takes about 28 seconds.
  speed: 2.25,
});
controls.reset();

addEventListener('resize', () => world.resize());

// Console handle for authoring and inspection.
(window as unknown as Record<string, unknown>).demo = {
  world,
  controls,
  pois,
  GyroVector,
  Vector3,
  HyperObject,
  BoxGeometry,
  spawn,
  label,
  placeOnGround,
  placeAlongPath,
  pathYaw,
  ANTIPODE_DISTANCE,
  /** Quick test box: size, tessellation, placement. */
  box(opts: {
    w?: number; h?: number; d?: number; seg?: number;
    along?: number; lateral?: number;
    bearing?: number; distance?: number;
    color?: number; tanK?: boolean;
  } = {}) {
    const w = opts.w ?? 0.1, h = opts.h ?? 0.2, dd = opts.d ?? 0.1;
    const seg = opts.seg ?? 4;
    const g = new BoxGeometry(w, h, dd, seg, seg, seg);
    g.translate(0, h / 2, 0);
    const at = opts.along !== undefined
      ? placeAlongPath(opts.along, opts.lateral ?? 0)
      : placeOnGround(opts.bearing ?? 0, opts.distance ?? 0.6);
    const object = new HyperObject(at, opts.tanK ?? true);
    object.addGeometry(world.shared, g, { color: opts.color ?? 0xdd5522, ambient: 0.5 });
    world.add(object);
    return object;
  },
};

// ---------------------------------------------------------------- self tests
const results = runSelfTests();
const failed = results.filter((r) => !r.pass).length;
tests.innerHTML =
  `<b class="${failed ? 'fail' : 'pass'}">${results.length - failed}/${results.length} math invariants hold</b>\n` +
  formatSelfTests(results);

// ---------------------------------------------------------------------- loop
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
  panel.update(pois, world.worldGV, dt);

  hud.innerHTML =
    `<b>geometry</b>  spherical (K = ${HM.K})\n` +
    `<b>world</b>     2π = ${(2 * Math.PI).toFixed(3)} rad around, empty\n` +
    // Straight-line distance from spawn peaks at PI at the antipode and then
    // counts back down. It is not an odometer — distanceWalked is.
    `<b>from spawn</b> ${world.distanceFromOrigin().toFixed(3)} rad  (max ${Math.PI.toFixed(3)})\n` +
    `<b>walked</b>    ${controls.distanceWalked.toFixed(2)} rad  = ${(controls.distanceWalked / (2 * Math.PI)).toFixed(2)} laps\n` +
    `<b>height</b>    ${controls.height.toFixed(4)} rad  (${(controls.height / EYE_HEIGHT).toFixed(2)}x eye)\n` +
    `<b>mode</b>      ${controls.mode}${controls.isLocked ? '' : '  — click to look'}\n` +
    `<b>objects</b>   ${pois.length} labelled\n` +
    `<b>fps</b>       ${fps.toFixed(0)}`;

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
