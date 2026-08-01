import { BufferGeometry, Float32BufferAttribute, Group } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';
import { merge } from '../geometry';

/**
 * Station 4: backend — thirty gears in a case, all of them driven.
 *
 * The exhibit is a real gear train, not a wall of spinning discs. Every gear
 * has one parent: it either MESHES with it (same layer, centre distance fixed
 * at the sum of the pitch radii) or shares its SHAFT (next layer forward, same
 * rate). Ratios come out of the tooth counts — a 60-tooth wheel driving a
 * 13-tooth pinion turns it 4.6 times faster, and the sign flips at every mesh
 * because meshed gears counter-rotate.
 *
 * The part that actually has to be right is the PHASE. Getting the rate ratio
 * correct only guarantees the teeth pass the line of centres at the same
 * frequency; landing each tooth in a gap needs the starting angles to agree.
 * For a parent P and child C meshing along direction phi (measured from P's
 * centre), the child's start angle is
 *
 *     theta_C = phi + pi + pi/N_C + (N_P/N_C) * (phi - theta_P)
 *
 * which is the condition "P has a tooth pointing at C exactly when C has a gap
 * pointing at P", solved for theta_C. Because the ratio is exact and the phase
 * is set once, the mesh never drifts: rotation is read straight off a clock as
 * theta_0 + omega * t rather than accumulated per frame.
 *
 * Layers exist because a plane can only hold so many circles. Three of them,
 * each 0.1 apart, with the fast small work at the front where it is visible.
 *
 * Why gears for backend: the copy on the sign says requests in, correct
 * answers out, every time, for years. That is a movement, not a metaphor.
 */

/** Tooth size. Pitch radius of an N-tooth gear is MODULE * N / 2. */
const MODULE = 0.026;
const THICK = 0.07;
const HALF_T = THICK / 2;
const BORE = 0.034;
/** Z of each layer's mid-plane. Gears occupy +-HALF_T around it. */
const LAYER_Z = [0.055, 0.155, 0.255];

/** Above this tooth count a gear is built as rim, spokes and hub. */
const SPOKED_FROM = 26;

const TONES: number[][] = [
  [0x9d7642, 0xae8b52],
  [0xc79c58, 0xd4ae6c],
  [0xe3c078, 0xefd292],
];
const LAYER_AMBIENT = [0.46, 0.52, 0.58];

const pitchRadius = (teeth: number) => (MODULE * teeth) / 2;

type P2 = [number, number];
type P3 = [number, number, number];

function quad(out: number[], a: P3, b: P3, c: P3, d: P3): void {
  out.push(...a, ...b, ...c, ...a, ...c, ...d);
}

/**
 * The gear's cross-section, counter-clockwise, with a tooth centred on angle 0.
 *
 * Six points per tooth: root, flank, tip, tip, flank, root. The tooth spans
 * 0.76 of the angular pitch at the pitch circle and the gap spans 1.24, so
 * there is real backlash — teeth that are exactly half-pitch bind visibly at
 * the point where they enter the gap.
 */
function toothOutline(teeth: number): P2[] {
  const rp = pitchRadius(teeth);
  const ro = rp + 0.8 * MODULE;
  const rr = rp - 1.0 * MODULE;
  const h = Math.PI / teeth;
  const profile: P2[] = [
    [-0.55, rr],
    [-0.38, rp],
    [-0.22, ro],
    [0.22, ro],
    [0.38, rp],
    [0.55, rr],
  ];
  const pts: P2[] = [];
  for (let k = 0; k < teeth; k++) {
    const a = (2 * Math.PI * k) / teeth;
    for (const [f, r] of profile) {
      const t = a + f * h;
      pts.push([Math.cos(t) * r, Math.sin(t) * r]);
    }
  }
  return pts;
}

function circleOutline(radius: number, segments: number): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return pts;
}

/**
 * Extrude a closed outline into a ring of thickness THICK, hollow to
 * `innerR`. Emitted non-indexed with flat normals — machined brass reads
 * better faceted than smoothed, and it keeps the merge with the box spokes
 * attribute-compatible.
 */
function extrudeRing(outline: P2[], innerR: number): BufferGeometry {
  const pos: number[] = [];
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % n];
    const l0 = Math.hypot(x0, y0);
    const l1 = Math.hypot(x1, y1);
    const a0 = (x0 / l0) * innerR;
    const b0 = (y0 / l0) * innerR;
    const a1 = (x1 / l1) * innerR;
    const b1 = (y1 / l1) * innerR;

    quad(pos, [x0, y0, -HALF_T], [x1, y1, -HALF_T], [x1, y1, HALF_T], [x0, y0, HALF_T]);
    quad(pos, [a0, b0, HALF_T], [x0, y0, HALF_T], [x1, y1, HALF_T], [a1, b1, HALF_T]);
    quad(pos, [a1, b1, -HALF_T], [x1, y1, -HALF_T], [x0, y0, -HALF_T], [a0, b0, -HALF_T]);
    quad(pos, [a0, b0, HALF_T], [a1, b1, HALF_T], [a1, b1, -HALF_T], [a0, b0, -HALF_T]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

function gearGeometry(teeth: number): BufferGeometry {
  const outline = toothOutline(teeth);
  if (teeth < SPOKED_FROM) return extrudeRing(outline, BORE);

  const rimInner = pitchRadius(teeth) - MODULE - 0.09;
  const hubR = 0.09;
  const spokes = teeth >= 40 ? 6 : 5;
  const spokeW = teeth >= 40 ? 0.07 : 0.055;

  const parts: BufferGeometry[] = [
    extrudeRing(outline, rimInner),
    extrudeRing(circleOutline(hubR, 18), BORE),
  ];
  const len = rimInner - hubR + 0.03;
  const mid = (hubR + rimInner) / 2;
  for (let s = 0; s < spokes; s++) {
    const a = (2 * Math.PI * s) / spokes;
    const spoke = new RoundedBoxGeometry(len, spokeW, THICK * 0.72, 1, 0.012);
    spoke.rotateZ(a);
    spoke.translate(Math.cos(a) * mid, Math.sin(a) * mid, 0);
    parts.push(spoke);
  }
  return merge(parts);
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
  /** Same-layer neighbours it is allowed to touch. */
  meshed: Set<number>;
}

/**
 * The train, declared as a graph. Nothing here writes a position: `mesh` puts
 * the child exactly one pitch-radius-sum away along `angleDeg`, so a tooth
 * count cannot be changed without the geometry following it.
 */
function buildTrain(): Gear[] {
  const gears: Gear[] = [];

  const add = (teeth: number, layer: number, x: number, y: number, omega: number, phase: number) => {
    const g: Gear = { teeth, layer, x, y, omega, phase, node: new Group(), meshed: new Set() };
    gears.push(g);
    return gears.length - 1;
  };

  const root = (teeth: number, x: number, y: number, omega: number) => add(teeth, 0, x, y, omega, 0);

  const mesh = (parent: number, teeth: number, angleDeg: number) => {
    const p = gears[parent];
    const phi = (angleDeg * Math.PI) / 180;
    const d = pitchRadius(p.teeth) + pitchRadius(teeth);
    const i = add(
      teeth,
      p.layer,
      p.x + Math.cos(phi) * d,
      p.y + Math.sin(phi) * d,
      (-p.omega * p.teeth) / teeth,
      phi + Math.PI + Math.PI / teeth + ((p.teeth / teeth) * (phi - p.phase)),
    );
    p.meshed.add(i);
    gears[i].meshed.add(parent);
    return i;
  };

  /** Same centre, next layer forward, same rate: a compound gear on one shaft. */
  const stack = (parent: number, teeth: number) => {
    const p = gears[parent];
    return add(teeth, p.layer + 1, p.x, p.y, p.omega, 0);
  };

  // ---------------- layer 0: the slow end. One 60-tooth main wheel driving
  // everything, at 0.18 rad/s — a hair under two turns a minute.
  const g0 = root(60, -0.4, 1.45, 0.18);
  const g1 = mesh(g0, 32, 45);
  const g2 = mesh(g1, 20, -25);
  const g3 = mesh(g2, 13, -105);
  mesh(g3, 26, -95);
  mesh(g0, 20, -50);
  const g6 = mesh(g0, 20, 115);
  mesh(g6, 13, 15);
  mesh(g3, 11, 170);

  // ---------------- layer 1: taken off the main wheel's shaft, so the whole
  // layer is still driven by the same input.
  const h0 = stack(g0, 26);
  const h1 = mesh(h0, 40, -35);
  const h2 = mesh(h1, 20, 20);
  const h3 = mesh(h2, 30, 100);
  mesh(h3, 13, 75);
  const h5 = mesh(h0, 20, 145);
  mesh(h5, 26, 55);
  mesh(h5, 13, 235);
  const h8 = mesh(h1, 16, 200);
  mesh(h8, 11, 190);
  mesh(h1, 11, -30);

  // ---------------- layer 2: the front, where the small work happens.
  const k0 = stack(h2, 13);
  const k1 = mesh(k0, 32, 165);
  const k2 = mesh(k1, 13, 245);
  const k3 = mesh(k2, 26, 180);
  const k4 = mesh(k3, 13, 135);
  const k5 = mesh(k4, 32, 100);
  const k6 = mesh(k5, 13, 55);
  const k7 = mesh(k6, 20, 20);
  const k8 = mesh(k7, 13, -25);
  mesh(k8, 16, 20);

  return gears;
}

/**
 * Two gears on the same layer may only come within touching distance if they
 * are a declared mesh pair. Every angle in `buildTrain` was chosen against
 * this; the check is here so that changing one does not quietly bury a gear
 * inside its neighbour.
 */
function warnOnCollisions(gears: Gear[]): void {
  const outer = (g: Gear) => pitchRadius(g.teeth) + 0.8 * MODULE;
  for (let i = 0; i < gears.length; i++) {
    for (let j = i + 1; j < gears.length; j++) {
      const a = gears[i];
      const b = gears[j];
      if (a.layer !== b.layer || a.meshed.has(j)) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < outer(a) + outer(b)) {
        console.warn(
          `gears: ${a.teeth}T and ${b.teeth}T on layer ${a.layer} overlap by ` +
            `${(outer(a) + outer(b) - d).toFixed(3)}`,
        );
      }
    }
  }
}

export interface GearsResult {
  object: HyperObject;
  tick: (worldGV: GyroVector, dt: number) => void;
}

export function buildGears(world: HyperWorld, at: GyroVector, yaw: number): GearsResult {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  // ---------------- the case: paving, a plinth, a dark backing plate, and a
  // brass frame deep enough to box all three gear layers in.
  //
  // The plate is tessellated at 8 segments rather than 2 for the reason the
  // cabinet floor is: every quad renders as a flat chord of the true curved
  // surface, and a coarse plate bulges forward mid-quad far enough to swallow
  // the 0.02 clearance in front of it.
  const pad = new RoundedBoxGeometry(3.6, 0.1, 1.5, 8, 0.02);
  pad.translate(0, 0.05, 0.1);
  object.addGeometry(world.shared, pad, { color: 0xb0aea6, ambient: 0.62 });

  const plinth = new RoundedBoxGeometry(3.3, 0.12, 1.1, 4, 0.02);
  plinth.translate(0, 0.16, 0.08);
  object.addGeometry(world.shared, plinth, { color: 0x9a968c, ambient: 0.55 });

  const frame: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const post = new RoundedBoxGeometry(0.1, 2.68, 0.49, 4, 0.014);
    post.translate(sx * 1.5, 1.55, 0.155);
    frame.push(post);
  }
  for (const y of [0.26, 2.84]) {
    const rail = new RoundedBoxGeometry(3.1, 0.1, 0.49, 4, 0.014);
    rail.translate(0, y, 0.155);
    frame.push(rail);
  }
  object.addGeometry(world.shared, merge(frame), {
    color: 0xc9a35e,
    ambient: 0.52,
  });

  // ---------------- the train.
  const gears = buildTrain();
  warnOnCollisions(gears);

  // One geometry per tooth count, shared by every gear that has it.
  const blanks = new Map<number, BufferGeometry>();
  for (const g of gears) {
    if (!blanks.has(g.teeth)) blanks.set(g.teeth, gearGeometry(g.teeth));
  }

  gears.forEach((g, i) => {
    g.node.position.set(g.x, g.y, LAYER_Z[g.layer]);
    g.node.rotation.z = g.phase;
    object.add(g.node);
    object.addGeometry(
      world.shared,
      blanks.get(g.teeth)!,
      { color: TONES[g.layer][i % 2], ambient: LAYER_AMBIENT[g.layer] },
      g.node,
    );
  });

  world.add(object);

  // Rotation is read off a clock rather than integrated per frame. Adding
  // omega * dt every frame would let the meshes drift apart over a long
  // session; theta_0 + omega * t cannot.
  let clock = 0;
  const tick = (_worldGV: GyroVector, dt: number) => {
    clock += dt;
    for (const g of gears) g.node.rotation.z = g.phase + g.omega * clock;
  };

  return { object, tick };
}
