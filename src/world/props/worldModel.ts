import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type Texture,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GyroVector, HM, HyperObject, type HyperWorld } from '../../engine';
import { L, t, type Localized } from '../../content/i18n';
import { STATIONS } from '../../content/stations';
import { EXHIBIT_LATERAL, SENTRIES } from '../layout';
import { ARCH_AT, MODEL_AT } from '../skeleton';
import { localizedCanvasTexture } from '../text';
import { easelPole, easelSpots } from './easels';
import { triangleCorners } from './triangle';

/**
 * Station 3: architecture — a desk globe of THIS world, under a canopy.
 *
 * Not an illustration: the map is drawn from the same data that places the
 * real things. The path is the real path, the dots are the real stations,
 * the triangle is the real triangle, and the pin — the pin is YOU. It tracks
 * the visitor's position live as they walk. The station's text claims the
 * honest architecture diagram is one the designer has to live in; the model
 * proves it by putting the viewer on the map.
 *
 * Map convention: the world's ground is a 2-sphere with SPAWN at the north
 * pole, so the aisle — a great circle through spawn — appears on the globe
 * as a pair of opposite meridians, and the far pole is the antipode. The
 * outbound half of the walk runs down one meridian and the return half comes
 * up the other; that is why the stations split between the two.
 *
 * LEGIBILITY. Everything on this map has to be identifiable from a metre away
 * with no key to consult, so each kind of thing is drawn as a picture of
 * itself and the stations carry the same two-digit numbers their signs do.
 * Match a number here to a number out there and the map is decoded.
 */

const GLOBE_R = 0.38;
/**
 * The cradle's lean — ring, pole caps and stand. Purely cosmetic furniture,
 * exactly as a desk globe's fork is.
 */
const CRADLE_TILT = -0.355;
/**
 * How the MAP sits inside that cradle: tuned by eye so the aisle meridian and
 * the station dots face a visitor standing on the path. The sphere turning
 * independently of its fork is what real globes do, and it means the map can
 * be aimed without knocking the furniture over.
 */
const MAP_ROTATION = { x: -0.487, y: 2.942, z: -1.571 };

/** Ground point (bearing, geodesic distance from spawn) -> unit vector. */
function groundVec(bearing: number, dist: number): Vector3 {
  return new Vector3(
    Math.sin(dist) * Math.sin(bearing),
    Math.cos(dist),
    -Math.sin(dist) * Math.cos(bearing),
  );
}

/** (along, lateral) in radians -> ground unit vector, spherical Pythagoras. */
function pathVec(along: number, lateral: number): Vector3 {
  const dist = Math.acos(
    Math.max(-1, Math.min(1, Math.cos(along) * Math.cos(lateral))),
  );
  const bearing = Math.atan2(Math.tan(lateral), Math.sin(along));
  return groundVec(bearing, dist);
}

/**
 * Ground vector -> texture UV, matching three's SphereGeometry mapping
 * (v = 0 at +y, u from atan2 around the axis).
 */
function toUV(g: Vector3): { u: number; v: number } {
  const u = (Math.atan2(g.z, -g.x) / (2 * Math.PI) + 1) % 1;
  const v = Math.acos(Math.max(-1, Math.min(1, g.y))) / Math.PI;
  return { u, v };
}

const MAP_W = 2048;
const MAP_H = 1024;
const MONO = 'ui-monospace, Consolas, monospace';

const TURF = '#7fa968';
const PATH = '#c9bd9d';
const CREAM = '#efece3';
const CASE = '#5c574c';
const INK = '#20262c';
const HALO = '#eae6d8';

/** Radius of the plate painted at spawn, in radians of ground. */
const SPAWN_CAP = 0.09;
/** The aisle's real gap at the antipode, in radians. */
const ANTIPODE_GAP = 0.05;

type Paint = (ctx: CanvasRenderingContext2D) => void;

/**
 * Horizontal stretch that makes a shape painted flat come out ROUND on the
 * sphere.
 *
 * Meridians crowd together toward the poles, so a circle drawn on an
 * equirectangular canvas is squeezed into a lens up there; this is the
 * inverse. Clamped, because the correction diverges at the pole itself and
 * nothing legible fits within a few units of spawn anyway.
 */
function stretch(v: number): number {
  return 1 / Math.max(0.3, Math.sin(v * Math.PI));
}

/**
 * Run a paint in a frame centred on a ground point, aspect-corrected, three
 * times across the seam so a mark at u = 0 is not cut in half. Everything
 * below draws in local pixels around an origin and lets this place it.
 */
function atPoint(ctx: CanvasRenderingContext2D, g: Vector3, paint: Paint): void {
  const { u, v } = toUV(g);
  const s = stretch(v);
  for (const dx of [-MAP_W, 0, MAP_W]) {
    ctx.save();
    ctx.translate(u * MAP_W + dx, v * MAP_H);
    ctx.scale(s, 1);
    paint(ctx);
    ctx.restore();
  }
}

/**
 * Stroke a chain of ground points.
 *
 * u is unwrapped as the chain is walked, so a line crossing the seam carries
 * on off the edge instead of streaking back across the entire map — and the
 * whole chain is then drawn on both sides of that edge.
 */
function polyline(ctx: CanvasRenderingContext2D, pts: Vector3[]): void {
  const xs: number[] = [];
  const ys: number[] = [];
  let prev = 0;
  for (const p of pts) {
    const { u, v } = toUV(p);
    const x = xs.length ? u - Math.round(u - prev) : u;
    prev = x;
    xs.push(x * MAP_W);
    ys.push(v * MAP_H);
  }
  for (const dx of [-MAP_W, 0, MAP_W]) {
    ctx.beginPath();
    for (let i = 0; i < xs.length; i++) {
      if (i) ctx.lineTo(xs[i] + dx, ys[i]);
      else ctx.moveTo(xs[i] + dx, ys[i]);
    }
    ctx.stroke();
  }
}

/** A place name, haloed so it survives whatever it lands on. */
function label(ctx: CanvasRenderingContext2D, g: Vector3, text: string, dy: number): void {
  atPoint(ctx, g, (c) => {
    c.font = `600 27px ${MONO}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.letterSpacing = '2px';
    c.lineWidth = 8;
    c.lineJoin = 'round';
    c.strokeStyle = HALO;
    c.strokeText(text, 0, dy);
    c.fillStyle = '#2f3a2a';
    c.fillText(text, 0, dy);
  });
}

/**
 * The exhibits, numbered exactly as their signs are. This is the map's key:
 * there is no legend anywhere on the globe, because the legend is the world.
 */
function stationMark(ctx: CanvasRenderingContext2D, g: Vector3, n: number): void {
  atPoint(ctx, g, (c) => {
    c.beginPath();
    c.arc(0, 0, 27, 0, Math.PI * 2);
    c.fillStyle = CREAM;
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = CASE;
    c.stroke();

    c.font = `700 26px ${MONO}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.letterSpacing = '0px';
    c.fillStyle = INK;
    c.fillText(String(n).padStart(2, '0'), 0, 1);
  });
}

/** The arch: drawn as an arch, so it needs no naming. */
function archMark(ctx: CanvasRenderingContext2D, g: Vector3): void {
  atPoint(ctx, g, (c) => {
    c.lineWidth = 10;
    c.lineCap = 'round';
    c.strokeStyle = '#e6e1d4';
    c.beginPath();
    c.moveTo(-21, 20);
    c.lineTo(-21, -2);
    c.arc(0, -2, 21, Math.PI, 0);
    c.lineTo(21, 20);
    c.stroke();
  });
}

/** The figure on its plinth, at your back the moment you spawn. */
function figureMark(ctx: CanvasRenderingContext2D, g: Vector3): void {
  atPoint(ctx, g, (c) => {
    c.fillStyle = '#4f4842';
    c.beginPath();
    c.arc(0, -13, 8, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(-12, 19);
    c.lineTo(-6, -3);
    c.lineTo(6, -3);
    c.lineTo(12, 19);
    c.closePath();
    c.fill();
  });
}

/** The chess table, dead centre of the triangle. */
function chessMark(ctx: CanvasRenderingContext2D, g: Vector3): void {
  atPoint(ctx, g, (c) => {
    const s = 11;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        c.fillStyle = (i + j) % 2 ? '#3f3a33' : '#e6dfcf';
        c.fillRect(-1.5 * s + i * s, -1.5 * s + j * s, s, s);
      }
    }
    c.lineWidth = 3;
    c.strokeStyle = '#6b5b48';
    c.strokeRect(-1.5 * s, -1.5 * s, 3 * s, 3 * s);
  });
}

/** One easel: canvas, frame, two splayed legs. */
function easelMark(ctx: CanvasRenderingContext2D, g: Vector3): void {
  atPoint(ctx, g, (c) => {
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.strokeStyle = '#8d6f4a';
    c.beginPath();
    c.moveTo(-9, 5);
    c.lineTo(-14, 18);
    c.moveTo(9, 5);
    c.lineTo(14, 18);
    c.stroke();
    c.fillStyle = '#d8cdb6';
    c.fillRect(-12, -15, 24, 21);
    c.strokeRect(-12, -15, 24, 21);
  });
}

/** A sentry camera on its pole, still turning to face you. */
function cameraMark(ctx: CanvasRenderingContext2D, g: Vector3): void {
  atPoint(ctx, g, (c) => {
    c.strokeStyle = '#7e858c';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(0, 16);
    c.lineTo(0, 0);
    c.stroke();
    c.fillStyle = '#4b5359';
    c.fillRect(-11, -12, 18, 11);
    c.beginPath();
    c.arc(-11, -6, 5, 0, Math.PI * 2);
    c.fill();
  });
}

function paintMap(ctx: CanvasRenderingContext2D, unitScale: number): void {
  const W = MAP_W;
  const H = MAP_H;

  // ---------------- turf, with a seeded mottle so the globe reads as terrain
  // rather than plastic. Seeded, so a language switch repaints it identically.
  ctx.fillStyle = TURF;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 1360; i++) {
    const rx = (Math.sin(i * 127.1) * 0.5 + 0.5) * W;
    const ry = (Math.sin(i * 311.7) * 0.5 + 0.5) * H;
    const rr = 16 + (Math.sin(i * 74.3) * 0.5 + 0.5) * 52;
    ctx.fillStyle = i % 2 ? '#78a161' : '#86af6f';
    ctx.beginPath();
    ctx.ellipse(rx, ry, rr, rr * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------- graticule: rings of distance from spawn and spokes of
  // bearing, every 30 degrees. Faint, but it is the thing that turns a green
  // ball into a globe, and it gives the eye somewhere to measure from.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.lineWidth = 2;
  for (let k = 1; k < 6; k++) {
    const y = (k / 6) * H;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  for (let k = 0; k < 12; k++) {
    const x = (k / 12) * W;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  // ---------------- spawn.
  //
  // It is the map's north pole, where the canvas's entire top edge collapses
  // to a point — so a band across the top paints a CAP on the ground there.
  // That is the only way to mark the pole at all, and it costs nothing: the
  // aisle's two meridians visibly run out of it, which is the truth.
  ctx.fillStyle = PATH;
  ctx.fillRect(0, 0, W, (SPAWN_CAP / Math.PI) * H);

  // ---------------- the aisle: a great circle through spawn = two opposite
  // meridians, dashed like the real slabs. The gap at the very bottom is the
  // real gap in the slabs at the antipode.
  ctx.strokeStyle = PATH;
  ctx.lineWidth = 13;
  ctx.setLineDash([20, 11]);
  for (const g of [pathVec(0.3, 0), pathVec(Math.PI + 0.3, 0)]) {
    const { u } = toUV(g);
    ctx.beginPath();
    ctx.moveTo(u * W, 0);
    ctx.lineTo(u * W, H - (ANTIPODE_GAP / Math.PI) * H);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ---------------- the triangle, on its lawn around the "right pole", with
  // the same 90° at every corner that is painted on the real ground.
  const C = triangleCorners();
  const centroid = new Vector3(1, 0, 0);
  ctx.strokeStyle = '#5f7052';
  ctx.lineWidth = 7;
  for (let s = 0; s < 3; s++) {
    const a = C[s];
    const b = C[(s + 1) % 3];
    const side: Vector3[] = [];
    for (let i = 0; i <= 32; i++) {
      const f = i / 32;
      side.push(a.clone().multiplyScalar(1 - f).addScaledVector(b, f).normalize());
    }
    polyline(ctx, side);
  }
  for (const c of C) {
    label(ctx, c.clone().multiplyScalar(0.86).addScaledVector(centroid, 0.14).normalize(), '90°', 0);
  }

  // ---------------- the station bays. Same tables the world builds from: a
  // spur off the path out to where the exhibit really stands, set back at
  // EXHIBIT_LATERAL, not at the nominal lateral in the content table.
  for (const s of STATIONS) {
    const along = s.at * unitScale;
    const lateral = Math.sign(s.lateral) * EXHIBIT_LATERAL * unitScale;
    const spur: Vector3[] = [];
    for (let i = 0; i <= 6; i++) spur.push(pathVec(along, (lateral * i) / 6));
    ctx.strokeStyle = PATH;
    ctx.lineWidth = 7;
    polyline(ctx, spur);
  }

  // ---------------- the landmarks off the path.
  chessMark(ctx, centroid);
  for (const spot of easelSpots()) easelMark(ctx, spot);
  for (const [at, lateral] of SENTRIES) {
    cameraMark(ctx, pathVec(at * unitScale, lateral * unitScale));
  }

  // ---------------- the arch ahead of spawn, and the figure behind it.
  archMark(ctx, pathVec(ARCH_AT * unitScale, 0));
  figureMark(ctx, pathVec(-MODEL_AT * unitScale, 0));

  // ---------------- the numbered exhibits, last, so nothing crosses them.
  for (const s of STATIONS) {
    stationMark(
      ctx,
      pathVec(s.at * unitScale, Math.sign(s.lateral) * EXHIBIT_LATERAL * unitScale),
      s.n,
    );
  }

  // ---------------- names, for the handful of things a picture cannot carry
  // on its own. Kept to single short words: the map has room for text only
  // out near its equator, where the meridians are still far apart.
  const NAMES: Array<[Vector3, Localized, number]> = [
    [pathVec(-MODEL_AT * unitScale, 0), L('me', 'ben'), -34],
    [centroid, L('chess', 'satranç'), 38],
    [easelPole(), L('easels', 'sehpalar'), 74],
  ];
  for (const [g, text, dy] of NAMES) label(ctx, g, t(text), dy);
}

function worldMapTexture(unitScale: number): Texture {
  return localizedCanvasTexture(MAP_W, MAP_H, (ctx) => paintMap(ctx, unitScale));
}

export interface WorldModelHandle {
  object: HyperObject;
  /** Moves the you-are-here pin. Called every frame by the station tickers. */
  tick: (worldGV: GyroVector, dt: number) => void;
}

export function buildWorldModel(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): WorldModelHandle {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  // The canopy keeps this exhibit in permanent shade, so the wood is
  // authored brighter than its neighbours to land at the same apparent tone.
  const WOOD = 0xb59a78;
  const BRASS = 0xd9c187;

  // ---------------- the canopy: four posts and a roof, so the model reads
  // as something worth sheltering.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new CylinderGeometry(0.05, 0.06, 2.3, 10);
      post.translate(sx * 1.1, 1.15, sz * 1.1);
      object.addGeometry(world.shared, post, { color: 0x9a8a72, ambient: 0.5 });
    }
  }
  const roof = new RoundedBoxGeometry(2.7, 0.08, 2.7, 2, 0.03);
  roof.translate(0, 2.36, 0);
  object.addGeometry(world.shared, roof, { color: 0xd8d2c4, ambient: 0.6 });
  const trim = new RoundedBoxGeometry(2.5, 0.06, 2.5, 2, 0.02);
  trim.translate(0, 2.3, 0);
  object.addGeometry(world.shared, trim, { color: 0xb5a98f, ambient: 0.55 });

  // ---------------- the table: turned pedestal, round top.
  const table = new LatheGeometry(
    [
      [0.001, 0], [0.3, 0], [0.3, 0.025], [0.24, 0.05], [0.09, 0.09],
      [0.07, 0.42], [0.09, 0.58], [0.24, 0.64], [0.62, 0.68], [0.64, 0.73], [0.001, 0.73],
    ].map(([x, y]) => new Vector2(x, y)),
    22,
  );
  object.addGeometry(world.shared, table, { color: WOOD, ambient: 0.62 });

  // ---------------- the globe assembly: a leaning brass CRADLE holding a map
  // sphere that turns inside it. Splitting the two is what a real desk globe
  // does, and it lets the map be aimed at the visitor without tipping the
  // furniture over with it.
  const centre = new Vector3(0, 0.73 + 0.06 + GLOBE_R, 0);

  const cradleNode = new Group();
  cradleNode.position.copy(centre);
  cradleNode.rotation.z = CRADLE_TILT;
  object.add(cradleNode);

  // Brass meridian ring and pole caps.
  const ring = new TorusGeometry(GLOBE_R + 0.028, 0.014, 8, 48);
  object.addGeometry(world.shared, ring, { color: BRASS, ambient: 0.6 }, cradleNode);
  for (const s of [-1, 1]) {
    const cap = new CylinderGeometry(0.02, 0.02, 0.05, 10);
    cap.translate(0, s * (GLOBE_R + 0.028), 0);
    object.addGeometry(world.shared, cap, { color: BRASS, ambient: 0.6 }, cradleNode);
  }

  // The stand: down from the ring's south cap to the table.
  const stem = new CylinderGeometry(0.035, 0.05, 0.1, 10);
  stem.translate(0, -(GLOBE_R + 0.055), 0);
  object.addGeometry(world.shared, stem, { color: BRASS, ambient: 0.55 }, cradleNode);

  // The map sphere, aimed independently of the cradle. The pin hangs off this
  // node, so it reads clean map coordinates and inherits the aim for free.
  const mapNode = new Group();
  mapNode.position.copy(centre);
  mapNode.rotation.set(MAP_ROTATION.x, MAP_ROTATION.y, MAP_ROTATION.z);
  object.add(mapNode);

  const globe = new SphereGeometry(GLOBE_R, 40, 28);
  object.addGeometry(
    world.shared,
    globe,
    {
      map: worldMapTexture(HM.unitScale),
      color: 0xffffff,
      ambient: 0.72,
      receiveShadow: false,
    },
    mapNode,
  );

  // ---------------- the pin: YOU ARE HERE, updated every frame.
  const pinNode = new Group();
  mapNode.add(pinNode);

  const needle = new ConeGeometry(0.02, 0.06, 10);
  needle.rotateX(Math.PI); // tip down, into the map
  needle.translate(0, 0.04, 0);
  object.addGeometry(world.shared, needle, { color: 0xe0714f, ambient: 0.68 }, pinNode);
  const head = new SphereGeometry(0.019, 10, 8);
  head.translate(0, 0.082, 0);
  object.addGeometry(world.shared, head, { color: 0xef8262, ambient: 0.72 }, pinNode);

  const up = new Vector3(0, 1, 0);
  const viewer = new Vector3();
  let clock = 0;

  const tick = (worldGV: GyroVector, dt: number) => {
    clock += dt;
    // Where the viewer is, in the world's own chart: invert the world
    // transform and read the point. Chart radius -> geodesic distance,
    // chart direction -> bearing; both drop straight onto the map sphere.
    worldGV.inverse().point(viewer);
    const dist = 2 * Math.atan(viewer.length());
    const bearing = Math.atan2(viewer.x, -viewer.z);
    const g = groundVec(bearing, dist);

    const bob = 1 + Math.sin(clock * 2.4) * 0.012;
    pinNode.position.copy(g).multiplyScalar(GLOBE_R * bob);
    pinNode.quaternion.setFromUnitVectors(up, g);
  };

  // Place the pin before the first frame renders.
  tick(new GyroVector(), 0);

  world.add(object);
  return { object, tick };
}
