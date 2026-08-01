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
  groundYaw,
  placeAlongPath,
  placeOnGround,
  placeOnGroundVec,
  pathYaw,
  units,
  toUnits,
  type Poi,
} from './world/placement';
import { onLangChange, t } from './content/i18n';
import { UI } from './content/ui';
import { ProximityPanel } from './world/panel';
import { buildLandmarks } from './world/landmarks';
import { buildSkeleton } from './world/skeleton';
import { buildStations } from './world/stations';
import { makeTextTexture } from './world/text';
import { done as loadingDone, setHint, stage, waitForAssets } from './ui/loading';
import { attachFullscreenButton } from './ui/fullscreen';
import { attachOrientationHint } from './ui/orientation';
import { createSettingsPanel } from './ui/settingsPanel';
import { attachTouchControls } from './ui/touch';
import { QUALITY, isTouch, onSettingsChange, settings } from './ui/settings';

/**
 * An empty world.
 *
 * Ground, sky, a viewer who can walk. Nothing placed on it yet.
 *
 * Scale: unitScale = 0.1, so you author at human scale. A person is 1 unit
 * tall and the world is 62.8 units around — a ~28 second lap. Everything the
 * engine does internally is still in radians; `units()` converts at the
 * authoring boundary.
 *
 * The build is staged behind a loading screen. Everything below the ground
 * tiles is many thousands of synchronous geometry operations, so the boot
 * sequence hands control back to the browser between stages — see ui/loading.
 */

const UNIT_SCALE = 0.1;
/** A person, in authored units. */
const EYE_UNITS = 1;
/** ...and in radians, which is what the engine wants. */
const EYE_HEIGHT = EYE_UNITS * UNIT_SCALE;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const tests = document.getElementById('tests') as HTMLDivElement;
const help = document.getElementById('help') as HTMLDivElement;

const world = new HyperWorld({
  canvas,
  curvature: 1,
  unitScale: UNIT_SCALE,
  background: 0xaebfd0,
  fogColor: [0.70, 0.78, 0.88],
  fogDensity: 0.9,
  fov: settings().fov,
});
world.setLightDirection(new Vector3(0.35, 0.9, 0.25));

const pois: Poi[] = [];

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

// -------------------------------------------------------------------- ground
// Six faces of a cube inflated onto the 3-sphere — the {4,3} tiling, the only
// way to tile a sphere with squares. All six lie on the SAME great 2-sphere,
// so the surface is seamless; give them different colours or a tile-local
// grid and the cube becomes visible, which is why neither is used here.
//
// Each face must reach Klein 1.0 to cover its 45 degrees, which at
// unitScale 0.1 means 10 authored units from the centre.
//
// THE CUBE IS TILTED, and has to be. Align a cube axis with spawn and its
// opposite face lands on the antipode — which has no Poincare coordinate at
// all, so that one tile can only be placed a hair short of where it belongs.
// A hair is enough: the whole face slides sideways and opens a crack along one
// edge while overlapping the opposite one. Tilting puts all six centres at
// finite distances, so every face sits exactly where the cube says and the
// seams close to machine precision.
const CUBE_TILT_AXIS = new Vector3(1, 0, 1).normalize();
const CUBE_TILT = 0.35;

function buildGround(): void {
  const FACE_REACH = 1 / UNIT_SCALE;
  const groundGeo = new PlaneGeometry(FACE_REACH * 2, FACE_REACH * 2, 96, 96);
  groundGeo.rotateX(-Math.PI / 2);

  const axis = (x: number, y: number, z: number) =>
    new Vector3(x, y, z).applyAxisAngle(CUBE_TILT_AXIS, CUBE_TILT);
  const [ex, ey, ez] = [axis(1, 0, 0), axis(0, 1, 0), axis(0, 0, 1)];

  // Each face is a cube axis, paired with one of the other two. The square is
  // four-fold symmetric, so aiming the tile at either neighbouring axis lines
  // its edges up with the cube — which is what makes the seams meet.
  const FACES: Array<[Vector3, Vector3]> = [
    [ex, ey], [ex.clone().negate(), ey],
    [ey, ez], [ey.clone().negate(), ez],
    [ez, ex], [ez.clone().negate(), ex],
  ];

  for (const [normal, reference] of FACES) {
    const tile = new HyperObject(placeOnGroundVec(normal));
    tile.rotation.y = groundYaw(normal, reference);
    tile.addGeometry(world.shared, groundGeo, {
      color: 0x8ab967,
      ambient: 0.62,
      mottleScale: 34,
      mottleAmount: 0.3,
    });
    world.add(tile);
  }
}

async function boot(): Promise<void> {
  setHint(UI.loadingHint);
  attachOrientationHint();
  attachFullscreenButton();

  await stage(UI.loadingWorld, 0.05);
  buildGround();

  // ------------------------------------------------------------------- world
  // Structure only: the aisle, the arch, and the model at your back. Detail
  // comes later.
  await stage(UI.loadingStructure, 0.2);
  const skeleton = buildSkeleton(world);

  await stage(UI.loadingStations, 0.4);
  const stations = buildStations(world);

  await stage(UI.loadingLandmarks, 0.65);
  const landmarks = buildLandmarks(world);

  pois.push(...skeleton.pois, ...stations.pois, ...landmarks.pois);
  const panel = new ProximityPanel();

  // ---------------------------------------------------------------- controls
  const controls = new Controls(world, canvas, {
    eyeHeight: EYE_HEIGHT,
    // Multiples of eye height per second. A lap takes about 28 seconds.
    speed: 2.25,
    pointerLock: !isTouch,
  });
  controls.reset();
  if (isTouch) attachTouchControls(controls, canvas);

  addEventListener('resize', () => world.resize());
  addEventListener('orientationchange', () => world.resize());

  // ---------------------------------------------------------------- settings
  const settingsPanel = createSettingsPanel((open) => {
    controls.inputEnabled = !open;
    if (open) controls.releaseInput();
  });

  const paintHelp = () => {
    help.textContent = t(isTouch ? UI.helpTouch : UI.helpDesktop);
  };
  onLangChange(paintHelp);

  onSettingsChange((s) => {
    world.setFov(s.fov);
    controls.sensitivityScale = s.sensitivity;
    controls.invertLook = s.invertLook;
    controls.headBob = s.headBob ? 0.018 : 0;

    const q = QUALITY[s.quality];
    world.setPixelRatioCap(s.resolution);
    world.setSamples(s.antialias);
    world.setShadowMapSize(q.shadowMapSize);
    world.setShadowsEnabled(q.shadows);

    help.hidden = !s.showHelp;
    hud.hidden = !s.showDetails;
    tests.hidden = !s.showTests;
    paintHelp();
  });

  // -------------------------------------------------------------- self tests
  const results = runSelfTests();
  const failed = results.filter((r) => !r.pass).length;
  tests.innerHTML =
    `<b class="${failed ? 'fail' : 'pass'}">${results.length - failed}/${results.length} math invariants hold</b>\n` +
    formatSelfTests(results);

  // Console handle for authoring and inspection.
  (window as unknown as Record<string, unknown>).demo = {
    world,
    controls,
    settingsPanel,
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

  await waitForAssets(UI.loadingTextures, 0.65, 0.92);

  // -------------------------------------------------------------------- loop
  let last = performance.now();
  let fps = 0;
  let acc = 0;
  let frames = 0;
  const objectCount =
    skeleton.objects.length + stations.objects.length + landmarks.objects.length;

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
    for (const watcher of stations.watchers) watcher.update(world.worldGV, dt);
    for (const tick of stations.tickers) tick(world.worldGV, dt);
    for (const tick of landmarks.tickers) tick(world.worldGV, dt);
    world.render();
    panel.update(pois, world.worldGV, dt);

    if (!hud.hidden) {
      hud.innerHTML =
        `<b>geometry</b>  spherical (K = ${HM.K})\n` +
        `<b>world</b>     ${toUnits(2 * Math.PI).toFixed(1)} units around\n` +
        // Straight-line distance from spawn peaks at PI at the antipode and then
        // counts back down. It is not an odometer — distanceWalked is.
        `<b>from spawn</b> ${toUnits(world.distanceFromOrigin()).toFixed(2)} u  (max ${toUnits(Math.PI).toFixed(1)} at the antipode)\n` +
        `<b>walked</b>    ${toUnits(controls.distanceWalked).toFixed(1)} u  = ${(controls.distanceWalked / (2 * Math.PI)).toFixed(2)} laps\n` +
        `<b>height</b>    ${toUnits(controls.height).toFixed(2)} u  (${(controls.height / EYE_HEIGHT).toFixed(2)}x eye)\n` +
        `<b>mode</b>      ${controls.mode}${controls.isLocked || isTouch ? '' : '  — click to look'}\n` +
        `<b>objects</b>   ${objectCount} placed, ${pois.length} labelled\n` +
        // Diagnostics for the camera-jump report: if a jump happens and the
        // spike count does not move, the cause is something other than a bad
        // delta.
        `<b>mouse</b>     peak ${controls.largestDelta.toFixed(0)}px  ·  ${controls.rejectedSpikes} spike${controls.rejectedSpikes === 1 ? '' : 's'} dropped\n` +
        `<b>fps</b>       ${fps.toFixed(0)}`;
    }

    requestAnimationFrame(frame);
  }

  // One full frame drawn before the curtain lifts, so the first thing anyone
  // sees is the world and not a flash of clear colour.
  await stage(UI.loadingFirstFrame, 0.97);
  world.render();
  requestAnimationFrame(frame);
  loadingDone();
}

void boot();
