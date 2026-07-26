import {
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GyroVector, HM, HyperObject, type HyperWorld } from '../../engine';
import { STATIONS } from '../../content/stations';
import { ARCH_AT, MODEL_AT } from '../skeleton';
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
 * as a pair of opposite meridians, and the far pole is the antipode.
 */

const GLOBE_R = 0.38;
/**
 * The cradle's lean — ring, pole caps and stand. Purely cosmetic furniture,
 * exactly as a desk globe's fork is.
 */
const CRADLE_TILT = -0.32;
/**
 * How the MAP sits inside that cradle: tuned by eye so the aisle meridian and
 * the station dots face a visitor standing on the path. The sphere turning
 * independently of its fork is what real globes do, and it means the map can
 * be aimed without knocking the furniture over.
 */
const MAP_ROTATION = { x: -0.227, y: 3.142, z: -1.571 };

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

function worldMapTexture(unitScale: number): CanvasTexture {
  const W = 1024;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Grass, with a seeded mottle so the globe reads as terrain, not plastic.
  ctx.fillStyle = '#7fa968';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 340; i++) {
    const rx = (Math.sin(i * 127.1) * 0.5 + 0.5) * W;
    const ry = (Math.sin(i * 311.7) * 0.5 + 0.5) * H;
    const rr = 8 + (Math.sin(i * 74.3) * 0.5 + 0.5) * 26;
    ctx.fillStyle = i % 2 ? '#78a161' : '#86af6f';
    ctx.beginPath();
    ctx.ellipse(rx, ry, rr, rr * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const mark = (g: Vector3, color: string, r: number) => {
    const { u, v } = toUV(g);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(u * W, v * H, r, 0, Math.PI * 2);
    ctx.fill();
  };

  // The aisle: a great circle through spawn = two opposite meridians,
  // dashed like the real slabs. The gap at the very bottom is the real gap
  // at the antipode.
  ctx.strokeStyle = '#c9bd9d';
  ctx.lineWidth = 7;
  ctx.setLineDash([10, 5]);
  for (const g of [pathVec(0.3, 0), pathVec(Math.PI + 0.3, 0)]) {
    const { u } = toUV(g);
    ctx.beginPath();
    ctx.moveTo(u * W, 4);
    ctx.lineTo(u * W, H - 14);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // The triangle, on its lawn around the "right pole".
  const C = triangleCorners();
  ctx.strokeStyle = '#5f7052';
  ctx.lineWidth = 4;
  for (let s = 0; s < 3; s++) {
    const a = C[s];
    const b = C[(s + 1) % 3];
    ctx.beginPath();
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      const p = a.clone().multiplyScalar(1 - t).addScaledVector(b, t).normalize();
      const { u, v } = toUV(p);
      if (i === 0) ctx.moveTo(u * W, v * H);
      else ctx.lineTo(u * W, v * H);
    }
    ctx.stroke();
  }
  // The chess table at its centre.
  mark(new Vector3(1, 0, 0), '#8a7460', 6);

  // Stations, from the same table the world builds from.
  for (const s of STATIONS) {
    mark(pathVec(s.at * unitScale, s.lateral * unitScale), '#efece3', 6);
  }
  // The arch, and the figure at your back.
  mark(pathVec(ARCH_AT * unitScale, 0), '#e2ddd1', 8);
  mark(pathVec(-MODEL_AT * unitScale, 0), '#57504a', 8);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 8;
  return tex;
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
