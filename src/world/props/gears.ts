import {
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Path,
  RingGeometry,
  Shape,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import {
  HyperObject,
  type GyroVector,
  type HyperMaterialOptions,
  type HyperWorld,
} from '../../engine';
import { box, lathe, merge, pos, rod, trace, type Part, type Point } from '../geometry';
import { localizedCanvasTexture } from '../text';

/**
 * Station 4: backend — a request goes in at the crank and a bell rings.
 *
 * A hand crank turns the big wheel at the front. From there the train runs
 * through twenty-eight gears on three layers, the solid ones stamped with the
 * names of what a request passes through, before the last pinion lifts a
 * hammer and drops it on the bell.
 *
 * Every gear has one parent: it either MESHES with it (same layer, centre
 * distance fixed at the sum of the pitch radii) or shares its SHAFT (another
 * layer, same teeth, same rate). Ratios come out of the tooth counts, and the
 * sign flips at every mesh because meshed gears counter-rotate.
 *
 * The part that has to be right is the PHASE. For a parent P and child C
 * meshing along direction phi (measured from P's centre), the child's start
 * angle is
 *
 *     theta_C = phi + pi + pi/N_C + (N_P/N_C) * (phi - theta_P)
 *
 * which is "P has a tooth pointing at C exactly when C has a gap pointing at
 * P", solved for theta_C. Rotation is read off a clock as theta_0 + omega * t
 * rather than accumulated per frame, so the mesh never drifts.
 */

/** Tooth size. Pitch radius of an N-tooth gear is MODULE * N / 2. */
const MODULE = 0.026;
const THICK = 0.07;
const HALF_T = THICK / 2;
/** Z of each layer's mid-plane. Gears occupy +-HALF_T around it. */
const LAYER_Z = [0.055, 0.155, 0.255];
const STRAP_T = 0.012;
const strapZ = (layer: number): number => LAYER_Z[layer] - HALF_T - 0.015;

const ROOT_TEETH = 48;
const ROOT_AT: Point = [0.55, 1.45];
const ROOT_RATE = 0.5;
const OUT_TEETH = 12;
const OUT_RATE = (ROOT_RATE * ROOT_TEETH) / OUT_TEETH;

/**
 * The train. A tuple is a mesh (teeth, direction in degrees from the parent,
 * and a name if the gear carries one); a bare number moves to that layer on
 * the same shaft. A shaft always carries the same tooth count on both layers,
 * so every gear turns at the root's rate times ROOT_TEETH over its own teeth.
 */
const TRAIN: Array<number | [number, number] | [number, number, string]> = [
  [20, 150, 'ROUTER'], [12, 170], [16, 230, 'AUTH'],
  1,
  [26, 330, 'API'], [20, 230, 'DTO'], [16, 320], [20, 10, 'VALIDATOR'], [30, 15, 'SERVICE'], [16, 120],
  0,
  [32, 330, 'REPOSITORY'], [20, 215, 'ORM'], [26, 150], [20, 195], [26, 110, 'CACHE'], [36, 75, 'DATABASE'], [26, 350], [32, 5, 'QUEUE'],
  1,
  [22, 160, 'LOGGER'], [15, 190], [16, 185], [16, 150],
  2,
  [15, 360], [OUT_TEETH, 5], [OUT_TEETH, 355],
];

const IRON: HyperMaterialOptions = { color: 0x86a898, ambient: 0.6, gloss: 0.36 };
const STRAP: HyperMaterialOptions = { color: 0x7b828a, ambient: 0.56, gloss: 0.3, metal: 0.3 };
const BOLT: HyperMaterialOptions = { color: 0xd3d8dc, ambient: 0.62, gloss: 0.5, metal: 0.6 };
const BRASS: HyperMaterialOptions = { color: 0xe9cb7a, ambient: 0.58, gloss: 0.6, metal: 0.9 };
const BRONZE: HyperMaterialOptions = { color: 0xe2b56a, ambient: 0.58, gloss: 0.7, metal: 0.9 };
const BLACK: HyperMaterialOptions = { color: 0x62686f, ambient: 0.62, gloss: 0.5 };
const STEEL: HyperMaterialOptions[] = [
  { color: 0x97a1ac, ambient: 0.52, gloss: 0.45, metal: 0.6 },
  { color: 0xbcc4cc, ambient: 0.58, gloss: 0.5, metal: 0.6 },
  { color: 0xe6eaed, ambient: 0.64, gloss: 0.58, metal: 0.6 },
];

const pitchRadius = (teeth: number): number => (MODULE * teeth) / 2;
const outerRadius = (teeth: number): number => pitchRadius(teeth) + 0.8 * MODULE;

function toothOutline(teeth: number): Point[] {
  const rp = pitchRadius(teeth);
  const ro = rp + 0.8 * MODULE;
  const rr = rp - 1.0 * MODULE;
  const h = Math.PI / teeth;
  // The tooth is narrower than the gap: teeth of exactly half the pitch bind where they enter it.
  const profile: Point[] = [
    [-0.55, rr],
    [-0.22, ro],
    [0.22, ro],
    [0.55, rr],
  ];
  const pts: Point[] = [];
  for (let k = 0; k < teeth; k++) {
    const a = (2 * Math.PI * k) / teeth;
    for (const [f, r] of profile) pts.push([Math.cos(a + f * h) * r, Math.sin(a + f * h) * r]);
  }
  return pts;
}

function arc(radius: number, from: number, to: number, steps: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return pts;
}

function gearGeometry(teeth: number, solid: boolean): BufferGeometry {
  const shape = trace(new Shape(), toothOutline(teeth));
  const rim = pitchRadius(teeth) - MODULE - 0.055;
  let boss = 0.05;

  if (solid) {
    boss = teeth >= 26 ? 0.06 : 0.05;
  } else if (teeth >= 26) {
    const hub = 0.085;
    const spokes = teeth >= 40 ? 6 : 5;
    const half = 0.026;
    for (let s = 0; s < spokes; s++) {
      const a0 = (2 * Math.PI * s) / spokes;
      const a1 = (2 * Math.PI * (s + 1)) / spokes;
      const inner = Math.asin(half / hub);
      const outer = Math.asin(half / rim);
      shape.holes.push(
        trace(new Path(), [
          ...arc(hub, a0 + inner, a1 - inner, 4),
          ...arc(rim, a1 - outer, a0 + outer, 8),
        ]),
      );
    }
    boss = 0.06;
  } else if (teeth >= 18) {
    const hub = 0.07;
    const r = ((rim - hub) / 2) * 0.82;
    const mid = (rim + hub) / 2;
    for (let s = 0; s < 5; s++) {
      const a = (2 * Math.PI * (s + 0.5)) / 5;
      shape.holes.push(
        trace(
          new Path(),
          arc(r, 0, Math.PI * 2 * (9 / 10), 9).map(([x, y]) => [x + Math.cos(a) * mid, y + Math.sin(a) * mid] as Point),
        ),
      );
    }
  }

  const body = new ExtrudeGeometry(shape, { depth: THICK, bevelEnabled: false });
  body.translate(0, 0, -HALF_T);
  return merge([
    body,
    new CylinderGeometry(boss, boss, THICK + 0.012, 14).rotateX(Math.PI / 2),
    new CylinderGeometry(0.02, 0.02, 0.014, 6).rotateX(Math.PI / 2).translate(0, 0, HALF_T + 0.012),
  ]);
}

const stampReach = (teeth: number): number => pitchRadius(teeth) - MODULE - 0.012;
const stampBore = (teeth: number): number => (teeth >= 26 ? 0.06 : 0.05) + 0.012;

function stampGeometry(teeth: number): BufferGeometry {
  const front = new RingGeometry(stampBore(teeth), stampReach(teeth), 40, 1);
  const back = front.clone().rotateY(Math.PI);
  return merge([front.translate(0, 0, HALF_T + 0.004), back.translate(0, 0, -HALF_T - 0.004)]);
}

function stampMaterial(teeth: number, name: string): HyperMaterialOptions {
  const reach = stampReach(teeth);
  const bore = stampBore(teeth);
  const size = reach * 2 > 0.6 ? 1024 : 512;
  const map = localizedCanvasTexture(size, size, (ctx, w) => {
    ctx.clearRect(0, 0, w, w);
    const px = w / (2 * reach);
    const band = reach - bore;
    const height = Math.min(band * 0.62, 0.105);
    const radius = bore + band / 2;
    const step = (height * 0.66) / radius;
    const sweep = step * name.length;
    const copies = Math.max(1, Math.min(3, Math.floor((Math.PI * 2) / (sweep + 0.7))));
    ctx.font = `700 ${Math.round(height * px)}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#23282e';
    for (let c = 0; c < copies; c++) {
      const start = (c / copies) * Math.PI * 2 - sweep / 2 + step / 2;
      [...name].forEach((letter, i) => {
        ctx.save();
        ctx.translate(w / 2, w / 2);
        ctx.rotate(start + i * step);
        ctx.fillText(letter, 0, -radius * px);
        ctx.restore();
      });
    }
  });
  return {
    map,
    color: 0xffffff,
    ambient: 0.92,
    alphaTest: 0.3,
    alphaBlend: true,
    castShadow: false,
    receiveShadow: false,
  };
}

interface Gear {
  teeth: number;
  layer: number;
  x: number;
  y: number;
  /** rad/s. Negative is clockwise. */
  omega: number;
  /** Angle of the tooth centred on local angle 0, at t = 0. */
  phase: number;
  node: Group;
  parent: number;
  label: string | null;
  /** Same-layer neighbours it is allowed to touch. */
  meshed: Set<number>;
}

interface Train {
  gears: Gear[];
  last: number;
}

function buildTrain(): Train {
  const gears: Gear[] = [];
  const add = (
    teeth: number,
    layer: number,
    x: number,
    y: number,
    omega: number,
    phase: number,
    parent: number,
    label: string | null = null,
  ): number => {
    gears.push({ teeth, layer, x, y, omega, phase, parent, label, node: new Group(), meshed: new Set() });
    return gears.length - 1;
  };

  const mesh = (parent: number, teeth: number, angleDeg: number, label: string | null): number => {
    const p = gears[parent];
    const phi = (angleDeg * Math.PI) / 180;
    const d = pitchRadius(p.teeth) + pitchRadius(teeth);
    const i = add(
      teeth,
      p.layer,
      p.x + Math.cos(phi) * d,
      p.y + Math.sin(phi) * d,
      (-p.omega * p.teeth) / teeth,
      phi + Math.PI + Math.PI / teeth + (p.teeth / teeth) * (phi - p.phase),
      parent,
      label,
    );
    p.meshed.add(i);
    gears[i].meshed.add(parent);
    return i;
  };

  let last = add(ROOT_TEETH, 2, ROOT_AT[0], ROOT_AT[1], ROOT_RATE, 0, -1);
  for (const step of TRAIN) {
    if (typeof step === 'number') {
      const p = gears[last];
      last = add(p.teeth, step, p.x, p.y, p.omega, 0, last);
    } else {
      last = mesh(last, step[0], step[1], step[2] ?? null);
    }
  }
  return { gears, last };
}

/**
 * Two gears on the same layer may only come within touching distance if they
 * are a declared mesh pair. Changing an angle or a tooth count in TRAIN
 * without this check can quietly bury a gear inside its neighbour.
 */
function warnOnCollisions(gears: Gear[]): void {
  for (let i = 0; i < gears.length; i++) {
    for (let j = i + 1; j < gears.length; j++) {
      const a = gears[i];
      const b = gears[j];
      if (a.layer !== b.layer || a.meshed.has(j)) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < outerRadius(a.teeth) + outerRadius(b.teeth)) {
        console.warn(
          `gears: ${a.teeth}T and ${b.teeth}T on layer ${a.layer} overlap by ` +
            `${(outerRadius(a.teeth) + outerRadius(b.teeth) - d).toFixed(3)}`,
        );
      }
    }
  }
}

const INNER_X = 1.45;
const INNER_Y: Point = [0.31, 2.79];
const FRAME_Z = 0.155;
const FRAME_D = 0.5;
const FRAME_FRONT = FRAME_Z + FRAME_D / 2;
const BEAM_TOP = INNER_Y[1] + 0.1;

function strap(from: Point, to: Point, z: number): BufferGeometry {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const g = box(length + 0.05, 0.045, STRAP_T, 0.004);
  g.rotateZ(Math.atan2(to[1] - from[1], to[0] - from[0]));
  return g.translate((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, z);
}

/** What holds the gears up: a strap behind each layer from every gear to its parent, shafts between layers, ties to the frame. */
function skeleton(gears: Gear[]): BufferGeometry {
  const parts: BufferGeometry[] = [];
  gears.forEach((g) => {
    let front = LAYER_Z[g.layer] + HALF_T + 0.004;
    let back = strapZ(g.layer) - STRAP_T / 2;
    if (g.parent >= 0) {
      const p = gears[g.parent];
      if (p.layer === g.layer) parts.push(strap([p.x, p.y], [g.x, g.y], strapZ(g.layer)));
      else {
        back = Math.min(back, strapZ(p.layer) - STRAP_T / 2);
        front = Math.max(front, LAYER_Z[p.layer] + HALF_T + 0.004);
      }
    } else {
      back = strapZ(0) - STRAP_T / 2;
      parts.push(strap([g.x, g.y], [INNER_X, g.y], strapZ(0)));
    }
    parts.push(rod(new Vector3(g.x, g.y, back), new Vector3(g.x, g.y, front), 0.016, 0.016, 8));
  });

  const rear = gears.filter((g) => g.layer === 0);
  const by = (pick: (g: Gear) => number): Gear => rear.reduce((a, b) => (pick(b) > pick(a) ? b : a));
  const left = by((g) => -g.x);
  const right = by((g) => g.x);
  const low = by((g) => -g.y);
  const high = by((g) => g.y);
  parts.push(strap([left.x, left.y], [-INNER_X, left.y], strapZ(0)));
  parts.push(strap([right.x, right.y], [INNER_X, right.y], strapZ(0)));
  parts.push(strap([low.x, low.y], [low.x, INNER_Y[0]], strapZ(0)));
  parts.push(strap([high.x, high.y], [high.x, INNER_Y[1]], strapZ(0)));
  return merge(parts);
}

function frame(): Part[] {
  const iron: BufferGeometry[] = [];
  const bolts: BufferGeometry[] = [];
  const midY = (INNER_Y[0] + INNER_Y[1]) / 2;
  const tall = INNER_Y[1] - INNER_Y[0] + 0.2;
  const wide = INNER_X * 2 + 0.24;

  for (const sx of [-1, 1]) {
    iron.push(pos(box(0.12, tall, FRAME_D, 0.01), sx * (INNER_X + 0.06), midY, FRAME_Z));
    for (const sz of [-1, 1]) {
      iron.push(pos(box(0.18, tall, 0.03, 0.008), sx * (INNER_X + 0.06), midY, FRAME_Z + sz * (FRAME_D / 2 - 0.015)));
    }
    iron.push(pos(box(0.34, 0.035, FRAME_D + 0.16, 0.008), sx * (INNER_X + 0.06), INNER_Y[0] - 0.1 + 0.0175, FRAME_Z));
    for (const bx of [-0.12, 0.12]) {
      for (const bz of [-1, 1]) {
        bolts.push(
          pos(
            new CylinderGeometry(0.022, 0.022, 0.02, 6),
            sx * (INNER_X + 0.06) + bx,
            INNER_Y[0] - 0.1 + 0.045,
            FRAME_Z + bz * (FRAME_D / 2 + 0.045),
          ),
        );
      }
    }
  }
  for (const y of [INNER_Y[0] - 0.05, INNER_Y[1] + 0.05]) {
    iron.push(pos(box(wide - 0.24, 0.1, FRAME_D, 0.01), 0, y, FRAME_Z));
    for (const sz of [-1, 1]) {
      iron.push(pos(box(wide - 0.24, 0.15, 0.03, 0.008), 0, y, FRAME_Z + sz * (FRAME_D / 2 - 0.015)));
    }
  }

  const LEG = 0.26;
  const corners: Array<[number, number, number]> = [
    [-INNER_X, INNER_Y[0], 0],
    [INNER_X, INNER_Y[0], Math.PI / 2],
    [INNER_X, INNER_Y[1], Math.PI],
    [-INNER_X, INNER_Y[1], -Math.PI / 2],
  ];
  for (const [x, y, turn] of corners) {
    for (const z of [FRAME_FRONT - 0.03, FRAME_Z - FRAME_D / 2 + 0.012]) {
      const gusset = new ExtrudeGeometry(trace(new Shape(), [[0, 0], [LEG, 0], [0, LEG]]), {
        depth: 0.018,
        bevelEnabled: false,
      });
      iron.push(gusset.rotateZ(turn).translate(x, y, z));
      for (const [bx, by] of [[0.045, 0.045], [0.15, 0.045], [0.045, 0.15]]) {
        const head = new CylinderGeometry(0.016, 0.016, 0.014, 6).rotateX(Math.PI / 2).translate(bx, by, 0.009);
        bolts.push(head.rotateZ(turn).translate(x, y, z + (z > FRAME_Z ? 0.014 : -0.014)));
      }
    }
  }

  return [
    [merge(iron), IRON],
    [merge(bolts), BOLT],
    [pos(box(wide + 0.3, 0.04, FRAME_D + 0.5, 0.008), 0, INNER_Y[0] - 0.12, FRAME_Z), STRAP],
    [
      pos(box(wide + 0.6, INNER_Y[0] - 0.14, FRAME_D + 0.9, 0.02), 0, (INNER_Y[0] - 0.14) / 2, FRAME_Z),
      { color: 0xc9c7c0, ambient: 0.62, gloss: 0.03 },
    ],
  ];
}

const CAM_BASE = 0.07;
const CAM_LIFT = 0.06;
const RISE_UNTIL = 0.92;
const FALLEN_BY = 0.95;
const ROD_TO_PIVOT = 0.2;
const HEAD_REACH = 0.42;
const PIVOT_Y = BEAM_TOP + 0.19;
const CAM_Z = LAYER_Z[2] + HALF_T + 0.035;

function lift(u: number): number {
  if (u < RISE_UNTIL) return CAM_LIFT * (u / RISE_UNTIL);
  if (u < FALLEN_BY) return CAM_LIFT * (1 - (u - RISE_UNTIL) / (FALLEN_BY - RISE_UNTIL));
  return 0;
}

function camGeometry(gear: Gear): BufferGeometry {
  const turn = Math.sign(gear.omega);
  const outline: Point[] = [];
  const at = (u: number, r: number): void => {
    const beta = Math.PI / 2 - gear.phase - turn * 2 * Math.PI * u;
    outline.push([Math.cos(beta) * r, Math.sin(beta) * r]);
  };
  for (let k = 0; k <= 40; k++) at((k / 40) * RISE_UNTIL, CAM_BASE + (CAM_LIFT * k) / 40);
  at(RISE_UNTIL + 0.002, CAM_BASE);
  at(0.96, CAM_BASE);
  const g = new ExtrudeGeometry(trace(new Shape(), outline), { depth: 0.03, bevelEnabled: false });
  return g.translate(0, 0, CAM_Z - LAYER_Z[gear.layer] - 0.015);
}

interface Striker {
  rod: Group;
  arm: Group;
  bell: Group;
}

function buildStriker(object: HyperObject, world: HyperWorld, gear: Gear): Striker {
  const put = (parts: Part[], node?: Group): void => {
    for (const [g, opts] of parts) object.addGeometry(world.shared, g, opts, node);
  };

  put([[camGeometry(gear), BRASS]], gear.node);

  const restTop = PIVOT_Y - 0.012;
  const restFoot = gear.y + CAM_BASE;
  const rodNode = new Group();
  rodNode.position.set(gear.x, 0, CAM_Z);
  object.add(rodNode);
  put(
    [
      [rod(new Vector3(0, restFoot + 0.02, 0), new Vector3(0, restTop, 0), 0.011, 0.011, 8), BOLT],
      [pos(new CylinderGeometry(0.022, 0.022, 0.034, 10).rotateX(Math.PI / 2), 0, restFoot + 0.022, 0), BOLT],
    ],
    rodNode,
  );

  const pivotX = gear.x - ROD_TO_PIVOT;
  const armNode = new Group();
  armNode.position.set(pivotX, PIVOT_Y, CAM_Z);
  object.add(armNode);
  put(
    [
      [pos(box(HEAD_REACH + 0.04, 0.022, 0.02, 0.005), HEAD_REACH / 2, 0, 0), BOLT],
      [pos(new SphereGeometry(0.04, 12, 8), HEAD_REACH, -0.03, 0), BOLT],
    ],
    armNode,
  );

  const bellAt = new Vector3(pivotX + HEAD_REACH, PIVOT_Y - 0.07, CAM_Z);
  const bellNode = new Group();
  bellNode.position.copy(bellAt);
  object.add(bellNode);
  put(
    [
      [
        lathe([[0.13, -0.085], [0.125, -0.06], [0.1, -0.025], [0.06, -0.006], [0.02, 0], [0.001, 0]], 20),
        BRONZE,
      ],
      [lathe([[0.001, -0.012], [0.055, -0.016], [0.095, -0.036], [0.12, -0.085]], 20), { ...BRONZE, color: 0xb98e52 }],
    ],
    bellNode,
  );

  put([
    [
      rod(new Vector3(bellAt.x, BEAM_TOP, CAM_Z), new Vector3(bellAt.x, bellAt.y - 0.012, CAM_Z), 0.014, 0.014, 8),
      IRON,
    ],
    [pos(box(0.03, PIVOT_Y - BEAM_TOP + 0.03, 0.07, 0.006), pivotX, (PIVOT_Y + BEAM_TOP) / 2, CAM_Z), IRON],
    [pos(new CylinderGeometry(0.014, 0.014, 0.09, 8).rotateX(Math.PI / 2), pivotX, PIVOT_Y, CAM_Z), BOLT],
  ]);

  return { rod: rodNode, arm: armNode, bell: bellNode };
}

export interface GearsResult {
  object: HyperObject;
  tick: (worldGV: GyroVector, dt: number) => void;
}

export function buildGears(world: HyperWorld, at: GyroVector, yaw: number): GearsResult {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  const { gears, last } = buildTrain();
  warnOnCollisions(gears);

  for (const [g, opts] of frame()) object.addGeometry(world.shared, g, opts);
  object.addGeometry(world.shared, skeleton(gears), STRAP);

  const blanks = new Map<string, BufferGeometry>();
  for (const g of gears) {
    const solid = g.label !== null;
    const key = `${g.teeth}:${solid}`;
    if (!blanks.has(key)) blanks.set(key, gearGeometry(g.teeth, solid));
    g.node.position.set(g.x, g.y, LAYER_Z[g.layer]);
    g.node.rotation.z = g.phase;
    object.add(g.node);
    object.addGeometry(world.shared, blanks.get(key)!, STEEL[g.layer], g.node);
    if (g.label !== null) object.addGeometry(world.shared, stampGeometry(g.teeth), stampMaterial(g.teeth, g.label), g.node);
  }

  const crank = gears[0].node;
  const grip = new Vector3(0.24, 0, HALF_T + 0.05);
  object.addGeometry(
    world.shared,
    merge([
      pos(box(0.3, 0.04, 0.016, 0.006), 0.12, 0, HALF_T + 0.03),
      new CylinderGeometry(0.03, 0.03, 0.03, 12).rotateX(Math.PI / 2).translate(0, 0, HALF_T + 0.03),
    ]),
    BOLT,
    crank,
  );
  object.addGeometry(
    world.shared,
    rod(grip, new Vector3(grip.x, 0, grip.z + 0.13), 0.022, 0.026, 10),
    BLACK,
    crank,
  );

  const striker = buildStriker(object, world, gears[last]);

  world.add(object);

  const period = (2 * Math.PI) / OUT_RATE;
  let clock = 0;
  const tick = (_worldGV: GyroVector, dt: number) => {
    clock += dt;
    for (const g of gears) g.node.rotation.z = g.phase + g.omega * clock;

    const u = (clock / period) % 1;
    const up = lift(u);
    const since = ((u - FALLEN_BY + 1) % 1) * period;
    const ring = 0.06 * Math.exp(-5 * since) * Math.sin(38 * since);
    striker.rod.position.y = up;
    striker.arm.rotation.z = Math.atan2(up, ROD_TO_PIVOT);
    striker.bell.rotation.z = ring;
  };

  return { object, tick };
}
