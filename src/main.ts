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
  units,
  toUnits,
  type Poi,
} from './world/placement';
import { lang, onLangChange, setLang, type Lang } from './content/i18n';
import { ProximityPanel } from './world/panel';
import { buildLandmarks } from './world/landmarks';
import { buildFigure, buildSkeleton } from './world/skeleton';
import { buildStations } from './world/stations';
import { makeTextTexture } from './world/text';

/**
 * An empty world.
 *
 * Ground, sky, a viewer who can walk. Nothing placed on it yet.
 *
 * Scale: unitScale = 0.1, so you author at human scale. A person is 1 unit
 * tall and the world is 62.8 units around — a ~28 second lap. Everything the
 * engine does internally is still in radians; `units()` converts at the
 * authoring boundary.
 */

const UNIT_SCALE = 0.1;
/** A person, in authored units. */
const EYE_UNITS = 1;
/** ...and in radians, which is what the engine wants. */
const EYE_HEIGHT = EYE_UNITS * UNIT_SCALE;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const tests = document.getElementById('tests') as HTMLDivElement;

const world = new HyperWorld({
  canvas,
  curvature: 1,
  unitScale: UNIT_SCALE,
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
//
// Each face must reach Klein 1.0 to cover its 45 degrees, which at
// unitScale 0.1 means 10 authored units from the centre.
const FACE_REACH = 1 / UNIT_SCALE;
const groundGeo = new PlaneGeometry(FACE_REACH * 2, FACE_REACH * 2, 96, 96);
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
// Structure only: the aisle, the arch, and the model at your back. Detail
// comes later.
const panel = new ProximityPanel();
const skeleton = buildSkeleton(world);
const stations = buildStations(world);
const landmarks = buildLandmarks(world);
buildFigure(world).catch((e) => console.error('figure failed to load:', e));
const pois: Poi[] = [...skeleton.pois, ...stations.pois, ...landmarks.pois];

// ------------------------------------------------------------------ language
// Two languages, one world: the toggle repaints every canvas texture and the
// proximity panel through the i18n listeners.
const langEl = document.getElementById('lang') as HTMLDivElement;
const syncLang = () => {
  for (const s of langEl.querySelectorAll<HTMLSpanElement>('span')) {
    s.classList.toggle('active', s.dataset.l === lang());
  }
};
langEl.addEventListener('click', (e) => {
  const l = (e.target as HTMLElement).dataset?.l;
  if (l === 'en' || l === 'tr') setLang(l as Lang);
});
onLangChange(syncLang);
syncLang();

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
  // Console-authored labels are monolingual; show the same text in both.
  pois.push({
    id: `poi-${pois.length}`,
    title: { en: title, tr: title },
    body: { en: body, tr: body },
    gv,
    radius,
  });
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
  stations,
  skeleton,
  GyroVector,
  Vector3,
  HyperObject,
  BoxGeometry,
  spawn,
  label,
  placeOnGround,
  placeAlongPath,
  pathYaw,
  units,
  toUnits,
  ANTIPODE_DISTANCE,
  makeTextTexture,
  /** Quick test box: size, tessellation, placement. */
  box(opts: {
    w?: number; h?: number; d?: number; seg?: number;
    along?: number; lateral?: number;
    bearing?: number; distance?: number;
    color?: number; tanK?: boolean;
  } = {}) {
    const w = opts.w ?? 1, h = opts.h ?? 2, dd = opts.d ?? 1;
    const seg = opts.seg ?? 4;
    const g = new BoxGeometry(w, h, dd, seg, seg, seg);
    g.translate(0, h / 2, 0);
    // Distances are given in authored units and converted here, so the whole
    // console API speaks one scale.
    const at = opts.along !== undefined
      ? placeAlongPath(units(opts.along), units(opts.lateral ?? 0))
      : placeOnGround(opts.bearing ?? 0, units(opts.distance ?? 6));
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
  for (const w of stations.watchers) w.update(world.worldGV, dt);
  world.render();
  panel.update(pois, world.worldGV, dt);

  hud.innerHTML =
    `<b>geometry</b>  spherical (K = ${HM.K})\n` +
    `<b>world</b>     ${toUnits(2 * Math.PI).toFixed(1)} units around\n` +
    // Straight-line distance from spawn peaks at PI at the antipode and then
    // counts back down. It is not an odometer — distanceWalked is.
    `<b>from spawn</b> ${toUnits(world.distanceFromOrigin()).toFixed(2)} u  (max ${toUnits(Math.PI).toFixed(1)} at the antipode)\n` +
    `<b>walked</b>    ${toUnits(controls.distanceWalked).toFixed(1)} u  = ${(controls.distanceWalked / (2 * Math.PI)).toFixed(2)} laps\n` +
    `<b>height</b>    ${toUnits(controls.height).toFixed(2)} u  (${(controls.height / EYE_HEIGHT).toFixed(2)}x eye)\n` +
    `<b>mode</b>      ${controls.mode}${controls.isLocked ? '' : '  — click to look'}\n` +
    `<b>objects</b>   ${skeleton.objects.length + stations.objects.length + landmarks.objects.length} placed, ${pois.length} labelled\n` +
    // Diagnostics for the camera-jump report: if a jump happens and the spike
    // count does not move, the cause is something other than a bad delta.
    `<b>mouse</b>     peak ${controls.largestDelta.toFixed(0)}px  ·  ${controls.rejectedSpikes} spike${controls.rejectedSpikes === 1 ? '' : 's'} dropped\n` +
    `<b>fps</b>       ${fps.toFixed(0)}`;

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
