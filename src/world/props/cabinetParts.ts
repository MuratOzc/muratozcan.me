import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Path,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { HyperMaterialOptions } from '../../engine';
import { box, grained, lathe, pos, rod, roundedRect, trace, type Point } from '../geometry';
import { poleHeight, widening } from './cabinetTower';

// Everything here is in tower space: x across, z toward the front, y the distance along the cabinet from the station floor.

export type Zone = 'floor' | 'run' | 'crown' | 'farRun' | 'end';
export type Slot = 'solid' | 'text' | 'tray';
export type Cell = [number, number, number, number];
export type Emit = (g: BufferGeometry, m: HyperMaterialOptions, zone: Zone, slot?: Slot, drawer?: number) => void;

const W = 0.5;
const D = 0.66;
const HW = W / 2;
const FRONT = D / 2;
const BACK = -D / 2;
const STILE = 0.015;
const RECESS = 0.024;
const PROUD = 0.004;

// Lawn tufts stand up to 0.27 and are scattered without regard to what is built on them.
const SLAB_TOP = 0.3;
const PAD_TOP = SLAB_TOP + 0.04;
const BODY_FROM = PAD_TOP + 0.07;
// Twenty-six modules at this pitch leave the far end about 1.5 above the lawn: over a visitor's head, not in their face.
const PITCH = 0.268;
const RAIL = 0.06;
const PER_MODULE = 4;
const MODULE = PER_MODULE * PITCH + RAIL;
const MODULES = 26;
const TOP_PANEL = 0.03;
const ZONE_ENDS: Array<[number, Zone]> = [[3, 'floor'], [6, 'run'], [20, 'crown'], [24, 'farRun'], [MODULES, 'end']];

const HALF = MODULES / 2;

export const DRAWERS = MODULES * PER_MODULE;
export const LABELLED = 3 * PER_MODULE;

const moduleBase = (k: number): number => BODY_FROM + k * MODULE;
const drawerBase = (i: number): number =>
  moduleBase(Math.floor(i / PER_MODULE)) + (i % PER_MODULE) * PITCH;
const zoneOf = (k: number): Zone => ZONE_ENDS.find(([end]) => k < end)![1];
const isFine = (zone: Zone): boolean => zone === 'floor' || zone === 'end';

export const CABINET_LENGTH = moduleBase(MODULES) + TOP_PANEL;

export function reachOf(zone: Zone, lo: number, hi: number): number {
  const pole = poleHeight();
  if (zone === 'crown') return Math.max(pole - lo, hi - pole);
  return zone === 'floor' || zone === 'run' ? hi : 2 * pole - lo;
}

export const TRAVEL = 0.36;
// The key's tag hangs in front of drawer 3, and the ladder rail's hooks in front of 7 and 8.
const FIXED = [3, 7, 8];
export const MOVING = Array.from({ length: DRAWERS }, (_, i) => i).filter((i) => !FIXED.includes(i));

export function drawerSeat(i: number): { zone: Zone; y: number; z: number } {
  return { zone: zoneOf(Math.floor(i / PER_MODULE)), y: drawerBase(i) + PITCH / 2, z: D / 2 };
}

const PAINT: HyperMaterialOptions = { color: 0xdad3bf, ambient: 0.74, gloss: 0.34, metal: 0.1 };
const FRONT_PAINT: HyperMaterialOptions = { color: 0xe2dccb, ambient: 0.74, gloss: 0.36, metal: 0.1 };
const SHADOW_GAP: HyperMaterialOptions = { color: 0x4b4e52, ambient: 0.45, gloss: 0.05 };
const INSIDE: HyperMaterialOptions = { color: 0xa5a193, ambient: 0.5, gloss: 0.12, metal: 0.1 };
const TRAY: HyperMaterialOptions = { color: 0xcbc5b3, ambient: 0.72, gloss: 0.2, metal: 0.1 };
const KICK: HyperMaterialOptions = { color: 0x5c6168, ambient: 0.55, gloss: 0.28, metal: 0.15 };
const NICKEL: HyperMaterialOptions = { color: 0xdde1e4, ambient: 0.62, gloss: 0.55, metal: 0.65 };
const GALVANISED: HyperMaterialOptions = { color: 0xc6ccce, ambient: 0.6, gloss: 0.4, metal: 0.5 };
const BRASS: HyperMaterialOptions = { color: 0xe9cb7a, ambient: 0.55, gloss: 0.6, metal: 0.9 };
const IRON: HyperMaterialOptions = { color: 0x53565a, ambient: 0.55, gloss: 0.35, metal: 0.35 };
const CARD: HyperMaterialOptions = { color: 0xf7f3e6, ambient: 0.72, gloss: 0.04 };
const CONCRETE: HyperMaterialOptions = { color: 0xc9c7c0, ambient: 0.62, gloss: 0.02 };
const PAD: HyperMaterialOptions = { color: 0xd6d3cb, ambient: 0.62, gloss: 0.02 };
const BEECH: HyperMaterialOptions = { color: 0xe8c592, ambient: 0.55, gloss: 0.38, grain: 0.22 };
const TREAD: HyperMaterialOptions = { color: 0xd2a672, ambient: 0.55, gloss: 0.3, grain: 0.26 };
const RUBBER: HyperMaterialOptions = { color: 0x484a4e, ambient: 0.55, gloss: 0.12 };
const HANGING: HyperMaterialOptions = { color: 0x9fbf7e, ambient: 0.64, gloss: 0.05 };
const MANILA: HyperMaterialOptions = { color: 0xecd9a6, ambient: 0.64, gloss: 0.05 };
const PAPER: HyperMaterialOptions = { color: 0xf7f3e6, ambient: 0.7, gloss: 0.04 };
const TAG_RED: HyperMaterialOptions = { color: 0xea6452, ambient: 0.62, gloss: 0.35 };
const TABS: HyperMaterialOptions[] = [0xea6452, 0xf3cb52, 0x62a1dc, 0xeef1ee, 0xf19f50].map((color) => ({
  color,
  ambient: 0.66,
  gloss: 0.4,
}));
const SIGN_FACE: HyperMaterialOptions = { color: 0xffffff, ambient: 0.92 };

type Outline = Array<[number, number, number?, number?]>;

function arc(cx: number, cz: number, r: number, from: number, segments: number): Outline {
  const out: Outline = [];
  for (let i = 0; i <= segments; i++) {
    const t = from + (Math.PI / 2) * (i / segments);
    out.push([cx + r * Math.cos(t), cz + r * Math.sin(t), Math.cos(t), Math.sin(t)]);
  }
  return out;
}

function corners(w: number, d: number, r: number, segments: number, cz = 0): Outline {
  const x = w / 2 - r;
  const z = d / 2 - r;
  return [
    ...arc(-x, cz + z, r, Math.PI / 2, segments),
    ...arc(-x, cz - z, r, Math.PI, segments),
    ...arc(x, cz - z, r, Math.PI * 1.5, segments),
    ...arc(x, cz + z, r, 0, segments),
  ];
}

function shell(fine: boolean): Outline {
  return [
    [-HW + STILE, FRONT - RECESS],
    [-HW + STILE, FRONT],
    ...corners(W, D, fine ? 0.01 : 0, fine ? 2 : 1),
    [HW - STILE, FRONT],
    [HW - STILE, FRONT - RECESS],
  ];
}

// The outline has to run front edge toward -x, then round by the back: that is what makes the faces look outward.
function wall(points: Outline, y0: number, y1: number, closed = false, cell?: [number, number]): BufferGeometry {
  const position: number[] = [];
  const normal: number[] = [];
  const count = closed ? points.length : points.length - 1;
  const rows = cell ? Math.ceil((y1 - y0) / cell[1]) : 1;
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 1e-9) continue;
    const na = a[2] === undefined ? [dz / length, -dx / length] : [a[2], a[3]!];
    const nb = b[2] === undefined ? [dz / length, -dx / length] : [b[2], b[3]!];
    const cols = cell ? Math.ceil(length / cell[0]) : 1;
    const corner = (u: number, v: number) => {
      position.push(a[0] + dx * u, y0 + (y1 - y0) * v, a[1] + dz * u);
      normal.push(na[0] + (nb[0] - na[0]) * u, 0, na[1] + (nb[1] - na[1]) * u);
    };
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const u0 = c / cols;
        const u1 = (c + 1) / cols;
        const v0 = r / rows;
        const v1 = (r + 1) / rows;
        corner(u0, v0);
        corner(u1, v1);
        corner(u1, v0);
        corner(u0, v0);
        corner(u0, v1);
        corner(u1, v1);
      }
    }
  }
  return plain(position, normal);
}

function plain(position: number[], normal: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(normal), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array((position.length / 3) * 2), 2));
  return g;
}

function loft(lower: Outline, y0: number, upper: Outline, y1: number): BufferGeometry {
  const position: number[] = [];
  const normal: number[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const n = new Vector3();
  const face = (p: Vector3, q: Vector3, r: Vector3): void => {
    n.subVectors(q, p).cross(c.subVectors(r, p));
    if (n.lengthSq() < 1e-16) return;
    n.normalize();
    for (const v of [p, q, r]) {
      position.push(v.x, v.y, v.z);
      normal.push(n.x, n.y, n.z);
    }
  };
  for (let i = 0; i < lower.length; i++) {
    const j = (i + 1) % lower.length;
    a.set(lower[i][0], y0, lower[i][1]);
    b.set(lower[j][0], y0, lower[j][1]);
    const bi = new Vector3(upper[i][0], y1, upper[i][1]);
    const bj = new Vector3(upper[j][0], y1, upper[j][1]);
    face(a.clone(), bj, b.clone());
    face(a.clone(), bi, bj);
  }
  return plain(position, normal);
}

function cap(points: Outline, y: number, up: boolean): BufferGeometry {
  const ring = points.filter(([x, z], i) => {
    const [px, pz] = points[(i + points.length - 1) % points.length];
    return Math.hypot(x - px, z - pz) > 1e-9;
  });
  const shape = new Shape(ring.map(([x, z]) => new Vector2(x, up ? -z : z)));
  return new ShapeGeometry(shape).rotateX(up ? -Math.PI / 2 : Math.PI / 2).translate(0, y, 0);
}

function bar(a: number, b: number, length: number, chamfer: number): BufferGeometry[] {
  const section: Outline = corners(a, b, chamfer, 1).map(([x, z]) => [x, z]);
  return [wall(section, 0, length, true, [1, 0.26]), cap(section, 0, false), cap(section, length, true)];
}

function block(w: number, d: number, y0: number, y1: number, r: number, bevel: number): BufferGeometry[] {
  const outer = corners(w, d, r, 2);
  const inner = corners(w - 2 * bevel, d - 2 * bevel, r - bevel, 2);
  return [wall(outer, y0, y1 - bevel, true), loft(outer, y1 - bevel, inner, y1), cap(inner, y1, true)];
}

function openBox(w: number, h: number, d: number, without: string): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  const index = g.index!.array;
  const kept: number[] = [];
  ['X', 'x', 'Y', 'y', 'Z', 'z'].forEach((face, i) => {
    if (!without.includes(face)) for (let k = 0; k < 6; k++) kept.push(index[i * 6 + k]);
  });
  g.setIndex(kept);
  return g;
}

function dome(r: number, facing: 'x' | 'X' | 'z' | 'Z' | 'Y'): BufferGeometry {
  const g = new SphereGeometry(r, 5, 2, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1);
  if (facing === 'Z') g.rotateX(Math.PI / 2);
  if (facing === 'z') g.rotateX(-Math.PI / 2);
  if (facing === 'X') g.rotateZ(-Math.PI / 2);
  if (facing === 'x') g.rotateZ(Math.PI / 2);
  return g;
}

function hexBolt(x: number, y: number, z: number, r = 0.011): BufferGeometry[] {
  return [
    pos(new CylinderGeometry(r * 1.5, r * 1.5, 0.002, 10), x, y + 0.001, z),
    pos(new CylinderGeometry(r, r, 0.007, 6), x, y + 0.0055, z),
  ];
}

function mapTo(g: BufferGeometry, [u0, v0, u1, v1]: Cell): BufferGeometry {
  const uv = g.attributes.uv as BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  return g;
}

function footing(emit: Emit, x0: number, x1: number, z0: number, z1: number): void {
  for (const part of block(x1 - x0, z1 - z0, -0.04, SLAB_TOP, 0.03, 0.012)) {
    emit(pos(part, (x0 + x1) / 2, 0, (z0 + z1) / 2), CONCRETE, 'floor');
  }
  for (const part of block(0.76, 0.84, SLAB_TOP - 0.005, PAD_TOP, 0.02, 0.008)) emit(pos(part, 0, 0, -0.01), PAD, 'floor');

  const plinth = corners(W - 0.03, D - 0.045, 0.008, 2, -0.0075);
  emit(wall(plinth, PAD_TOP, BODY_FROM, true), KICK, 'floor');
  emit(pos(new PlaneGeometry(W, D).rotateX(Math.PI / 2), 0, BODY_FROM, 0), PAINT, 'floor');

  for (const side of [-1, 1]) {
    for (const z of [-0.2, 0.19]) {
      const profile: Point[] = [
        [0, 0],
        [side * 0.058, 0],
        [side * 0.058, 0.006],
        [side * 0.006, 0.006],
        [side * 0.006, 0.055],
        [0, 0.055],
      ];
      const cleat = new ExtrudeGeometry(trace(new Shape(), profile), { depth: 0.07, bevelEnabled: false });
      const edge = side * (HW - 0.015);
      emit(pos(cleat, edge, PAD_TOP, z - 0.035), GALVANISED, 'floor');
      for (const part of hexBolt(edge + side * 0.036, PAD_TOP + 0.006, z)) emit(part, GALVANISED, 'floor');
      emit(pos(dome(0.007, side > 0 ? 'X' : 'x'), edge + side * 0.006, PAD_TOP + 0.036, z), GALVANISED, 'floor');
    }
  }
}

function carcass(emit: Emit, k: number, open: number[]): void {
  const band = zoneOf(k);
  const fine = isFine(band);
  const y0 = moduleBase(k);
  const y1 = y0 + PER_MODULE * PITCH;
  const y2 = y0 + MODULE;
  const wide = widening(reachOf(band, y0, y2));
  const cell: [number, number] = [0.195 / wide, 0.195 / (band === 'crown' ? wide : 1)];
  emit(wall(shell(fine), y0, y1, false, cell), PAINT, band);

  const gap = (from: number, slots: number): void => {
    const w = W - 2 * STILE;
    const h = slots * PITCH;
    const sheet = new PlaneGeometry(w, h, Math.ceil(w / cell[0]), Math.ceil(h / cell[1]));
    emit(pos(sheet, 0, y0 + from * PITCH + h / 2, FRONT - RECESS), SHADOW_GAP, band);
  };
  if (open.length === 0) gap(0, PER_MODULE);
  else for (let d = 0; d < PER_MODULE; d++) if (!open.includes(d)) gap(d, 1);

  const strap = corners(W + 2 * PROUD, D + 2 * PROUD, fine ? 0.009 + PROUD : 0, fine ? 2 : 1);
  emit(wall(strap, y1, y2, true, cell), PAINT, band);
  // Only the lip that faces the nearer ground can ever be looked at.
  if (band !== 'crown' && k < HALF) emit(cap(strap, y1, false), PAINT, band);
  if (band !== 'crown' && k >= HALF) emit(cap(strap, y2, true), PAINT, band);
  if (!fine) return;

  const y = (y1 + y2) / 2;
  for (const x of [-0.225, 0.225]) emit(pos(dome(0.007, 'Z'), x, y, FRONT + PROUD), NICKEL, band);
  for (const x of [-0.17, -0.057, 0.057, 0.17]) emit(pos(dome(0.007, 'z'), x, y, BACK - PROUD), NICKEL, band);
  for (const z of [-0.25, -0.125, 0, 0.125, 0.25]) {
    emit(pos(dome(0.007, 'X'), HW + PROUD, y, z), NICKEL, band);
    emit(pos(dome(0.007, 'x'), -HW - PROUD, y, z), NICKEL, band);
  }
}

function bowPull(): BufferGeometry[] {
  const path = new CatmullRomCurve3(
    [
      new Vector3(-0.06, 0, -0.004),
      new Vector3(-0.06, 0, 0.018),
      new Vector3(-0.046, 0, 0.03),
      new Vector3(0.046, 0, 0.03),
      new Vector3(0.06, 0, 0.018),
      new Vector3(0.06, 0, -0.004),
    ],
    false,
    'catmullrom',
    0.25,
  );
  const parts: BufferGeometry[] = [new TubeGeometry(path, 10, 0.0065, 5, false)];
  for (const x of [-0.06, 0.06]) {
    parts.push(pos(new CylinderGeometry(0.012, 0.015, 0.004, 8).rotateX(Math.PI / 2), x, 0, 0.002));
  }
  return parts;
}

function cardFrame(): BufferGeometry {
  const outline = roundedRect(new Shape(), 0.15, 0.06, 0.006);
  outline.holes.push(trace(new Path(), [[-0.063, -0.02], [0.063, -0.02], [0.063, 0.02], [-0.063, 0.02]]));
  return new ExtrudeGeometry(outline, { depth: 0.008, bevelEnabled: false, curveSegments: 2 });
}

const HOLDER_Y = 0.19;
const PULL_Y = 0.095;

function drawerFront(emit: Emit, y: number, z: number, band: Zone, slot: Slot, cell?: Cell): void {
  const add = (g: BufferGeometry, m: HyperMaterialOptions) => emit(g, m, band, slot);
  const face = FRONT + z;
  const w = W - 2 * STILE - 0.006;
  const h = PITCH - 0.01;
  const centre = y + PITCH / 2;

  if (isFine(band)) {
    add(pos(box(w, h, 0.02, 0.005), 0, centre, face - 0.01), FRONT_PAINT);
    add(pos(cardFrame(), 0, y + HOLDER_Y, face), BRASS);
    const card = pos(new PlaneGeometry(0.13, 0.044), 0, y + HOLDER_Y, face + PROUD);
    if (cell) emit(mapTo(card, cell), SIGN_FACE, band, 'text');
    else add(card, CARD);
    for (const part of bowPull()) add(pos(part, 0, y + PULL_Y, face), NICKEL);
    return;
  }

  const far = band === 'crown';
  add(pos(openBox(w, h, 0.02, 'z'), 0, centre, face - 0.01), FRONT_PAINT);
  const holder = far ? 0.014 : 0.01;
  const card = far ? 0.026 : 0.016;
  add(pos(openBox(0.15, 0.06, holder, 'z'), 0, y + HOLDER_Y, face + holder / 2), BRASS);
  add(pos(openBox(0.124, 0.038, card, 'z'), 0, y + HOLDER_Y, face + card / 2), CARD);
  if (far) {
    add(pos(openBox(0.13, 0.018, 0.03, 'z'), 0, y + PULL_Y, face + 0.015), NICKEL);
    return;
  }
  add(pos(new BoxGeometry(0.134, 0.014, 0.012), 0, y + PULL_Y, face + 0.028), NICKEL);
  for (const x of [-0.06, 0.06]) {
    add(pos(openBox(0.014, 0.014, 0.022, 'zZ'), x, y + PULL_Y, face + 0.011), NICKEL);
  }
}

const SLIDE_INNER = 0.213;
const SLIDE_MID = 0.224;
const SLIDE_OUTER = HW - STILE;
const TRAY_LENGTH = 0.58;
const TRAY_FLOOR = 0.03;
const TRAY_RIM = 0.21;

function cavity(emit: Emit, y: number, zone: Zone): void {
  const depth = FRONT - RECESS - (BACK + 0.006);
  const zc = (FRONT - RECESS + BACK + 0.006) / 2;
  const width = 2 * SLIDE_OUTER;
  for (const side of [-1, 1]) {
    const lining = new PlaneGeometry(depth, PITCH).rotateY((-side * Math.PI) / 2);
    emit(pos(lining, side * SLIDE_OUTER, y + PITCH / 2, zc), INSIDE, zone);
    const runner = new BoxGeometry(SLIDE_OUTER - SLIDE_MID, 0.04, 0.56);
    emit(pos(runner, (side * (SLIDE_OUTER + SLIDE_MID)) / 2, y + 0.11, FRONT - 0.32), GALVANISED, zone);
  }
  emit(pos(new PlaneGeometry(width, depth).rotateX(-Math.PI / 2), 0, y, zc), INSIDE, zone);
  emit(pos(new PlaneGeometry(width, depth).rotateX(Math.PI / 2), 0, y + PITCH, zc), INSIDE, zone);
  emit(pos(new PlaneGeometry(width, PITCH), 0, y + PITCH / 2, BACK + 0.006), INSIDE, zone);
}

function plainTray(emit: Emit, y: number, zone: Zone, contents: HyperMaterialOptions): void {
  const length = TRAVEL + 0.06;
  const z = FRONT - 0.02 - length / 2;
  const height = TRAY_RIM - TRAY_FLOOR;
  emit(pos(openBox(2 * SLIDE_INNER, height, length, 'zZY'), 0, y + TRAY_FLOOR + height / 2, z), PAINT, zone, 'tray');
  emit(pos(new PlaneGeometry(2 * SLIDE_INNER, length).rotateX(-Math.PI / 2), 0, y + TRAY_RIM, z), contents, zone, 'tray');
}

function tray(emit: Emit, y: number, zone: Zone, filed: boolean): void {
  const add = (g: BufferGeometry, m: HyperMaterialOptions) => emit(g, m, zone, 'tray');
  const front = FRONT - 0.02;
  const mid = front - TRAY_LENGTH / 2;
  const height = TRAY_RIM - TRAY_FLOOR;
  const wallX = SLIDE_INNER - 0.003;

  for (const side of [-1, 1]) {
    add(pos(new BoxGeometry(0.006, height, TRAY_LENGTH), side * wallX, y + TRAY_FLOOR + height / 2, mid), TRAY);
    add(pos(new BoxGeometry(0.02, 0.004, TRAY_LENGTH), side * (SLIDE_INNER - 0.01), y + TRAY_RIM + 0.002, mid), TRAY);
    const runner = new BoxGeometry(SLIDE_MID - SLIDE_INNER, 0.03, 0.5);
    add(pos(runner, (side * (SLIDE_MID + SLIDE_INNER)) / 2, y + 0.11, front - 0.31), NICKEL);
  }
  add(pos(new BoxGeometry(2 * SLIDE_INNER, 0.006, TRAY_LENGTH), 0, y + TRAY_FLOOR + 0.003, mid), TRAY);
  add(pos(new BoxGeometry(2 * SLIDE_INNER, height, 0.006), 0, y + TRAY_FLOOR + height / 2, front - TRAY_LENGTH + 0.003), TRAY);
  if (!filed) return;

  const bar = y + TRAY_RIM + 0.004;
  const SLOTS = 12;
  const tabX = [-0.15, -0.075, 0, 0.075, 0.15];
  for (let i = 0; i < SLOTS; i++) {
    const wave = Math.sin(i * 2.3);
    if (i % 7 === 5) continue;
    const at = front - 0.05 - i * 0.041;
    const lean = wave * 0.05;
    const hung = (g: BufferGeometry, m: HyperMaterialOptions): void => add(pos(g.rotateX(lean), 0, bar, at), m);

    for (const leaf of [-0.005, 0.005]) {
      hung(pos(new BoxGeometry(0.418, 0.005, 0.003), 0, 0.0025, leaf), HANGING);
      hung(pos(new BoxGeometry(0.376, 0.172, 0.003), 0, -0.086, leaf), HANGING);
    }
    hung(pos(new BoxGeometry(0.052, 0.015, 0.003), tabX[(i * 2) % 5], 0.012, 0.005), TABS[i % TABS.length]);

    if (i % 3 === 0) continue;
    const lifted = i % 5 === 2 ? 0.028 : 0.008;
    hung(pos(new BoxGeometry(0.34, 0.178, 0.004), 0, lifted - 0.089, 0), MANILA);
    hung(pos(new BoxGeometry(0.1, 0.014, 0.004), [-0.11, 0, 0.11][i % 3], lifted + 0.006, 0), MANILA);
    if (lifted > 0.01) hung(pos(new BoxGeometry(0.3, 0.176, 0.002), 0.01, lifted - 0.08, 0), PAPER);
  }
}

function lock(emit: Emit, x: number, y: number): void {
  const face = FRONT + PROUD;
  const rose = lathe([[0.021, 0], [0.021, 0.003], [0.017, 0.006], [0.0125, 0.006]], 14);
  emit(pos(rose.rotateX(Math.PI / 2), x, y, face), BRASS, 'floor');
  emit(pos(new CylinderGeometry(0.0125, 0.0125, 0.009, 14).rotateX(Math.PI / 2), x, y, face + 0.0045), NICKEL, 'floor');

  const bow = face + 0.045;
  emit(pos(new BoxGeometry(0.009, 0.003, 0.03), x, y, face + 0.021), NICKEL, 'floor');
  emit(pos(new TorusGeometry(0.011, 0.003, 6, 14).rotateX(Math.PI / 2), x, y, bow), NICKEL, 'floor');
  const RING = 0.015;
  const rim = bow + 0.011;
  const hang = y + 0.003 - RING;
  emit(pos(new TorusGeometry(RING, 0.0012, 5, 18).rotateY(Math.PI / 2), x, hang, rim), NICKEL, 'floor');

  const tag = roundedRect(new Shape(), 0.026, 0.046, 0.005);
  tag.holes.push(new Path().absarc(0, 0.015, 0.0035, 0, Math.PI * 2, true));
  const fob = new ExtrudeGeometry(tag, { depth: 0.003, bevelEnabled: false, curveSegments: 3 });
  emit(pos(fob, x, hang - RING - 0.0125, rim - 0.0015), TAG_RED, 'floor');
}

function ladder(emit: Emit, side: number, railY: number): void {
  const add = (g: BufferGeometry, m: HyperMaterialOptions) => emit(g, m, 'floor');
  const RAIL_R = 0.014;
  const railZ = FRONT + PROUD + 0.085;
  const LEAN = 0.25;
  const sin = Math.sin(LEAN);
  const cos = Math.cos(LEAN);
  const STILE_T = 0.03;
  const STILE_D = 0.085;
  const SPREAD = 0.19;
  const centre = side * 0.53;

  const restY = railY + sin * (RAIL_R + STILE_D / 2);
  const restZ = railZ + cos * (RAIL_R + STILE_D / 2);
  const footY = SLAB_TOP + 0.108;
  const run = (restY - footY) / cos;
  const footZ = restZ + run * sin;
  const length = run + 0.1;
  const stand = (g: BufferGeometry): BufferGeometry => g.rotateX(-LEAN).translate(centre, footY, footZ);

  for (const s of [-1, 1]) {
    const x = s * SPREAD;
    for (const part of bar(STILE_T, STILE_D, length, 0.005)) add(stand(pos(grained(part, 'y'), x, 0, 0)), BEECH);
    add(stand(pos(box(STILE_T + 0.008, 0.085, STILE_D + 0.008, 0.003), x, 0.0375, 0)), IRON);
    for (const z of [-0.016, 0.016]) {
      add(pos(new BoxGeometry(0.03, 0.09, 0.004), centre + x, SLAB_TOP + 0.065, footZ + z), IRON);
    }
    const tyre = lathe(
      [[0.02, -0.011], [0.036, -0.011], [0.04, -0.006], [0.04, 0.006], [0.036, 0.011], [0.02, 0.011]],
      14,
    );
    add(pos(tyre.rotateX(Math.PI / 2), centre + x, SLAB_TOP + 0.04, footZ), RUBBER);
    add(pos(new CylinderGeometry(0.021, 0.021, 0.024, 10).rotateX(Math.PI / 2), centre + x, SLAB_TOP + 0.04, footZ), BRASS);
    add(pos(new CylinderGeometry(0.006, 0.006, 0.046, 8).rotateX(Math.PI / 2), centre + x, SLAB_TOP + 0.04, footZ), IRON);

    const outer = s * (SPREAD + STILE_T / 2);
    add(stand(pos(new BoxGeometry(0.006, 0.26, 0.055), outer + s * 0.003, run - 0.05, -0.015)), BRASS);
    for (const up of [-0.13, -0.03]) {
      add(stand(pos(dome(0.006, s > 0 ? 'X' : 'x'), outer + s * 0.006, run + up, -0.0125)), BRASS);
    }
    const inner = RAIL_R + 0.002;
    const hook = new Shape();
    hook.absarc(0, 0, inner + 0.01, -0.35, Math.PI * 1.3, false);
    hook.absarc(0, 0, inner, Math.PI * 1.3, -0.35, true);
    const HOOK_W = STILE_T + 0.014;
    const bent = new ExtrudeGeometry(hook, { depth: HOOK_W, bevelEnabled: false, curveSegments: 8 });
    add(pos(bent.rotateY(-Math.PI / 2), centre + x + HOOK_W / 2, railY, railZ), BRASS);
  }

  const STEP = 0.27;
  const steps = Math.floor((run - 0.3) / STEP) + 1;
  for (let i = 0; i < steps; i++) {
    const at = 0.22 + i * STEP;
    const span = 2 * SPREAD - STILE_T + 0.012;
    for (const part of bar(0.022, 0.078, span, 0.004)) {
      const tread = grained(part.translate(0, -span / 2, 0).rotateZ(Math.PI / 2), 'x').rotateX(LEAN);
      add(stand(pos(tread, 0, at, 0)), TREAD);
    }
    if (i % 3 !== 1) continue;
    const tie = new CylinderGeometry(0.004, 0.004, 2 * SPREAD + STILE_T + 0.02, 6).rotateZ(Math.PI / 2);
    add(stand(pos(tie, 0, at - 0.032, 0)), IRON);
    for (const s of [-1, 1]) {
      const nut = new CylinderGeometry(0.009, 0.009, 0.007, 6).rotateZ(Math.PI / 2);
      add(stand(pos(nut, s * (SPREAD + STILE_T / 2 + 0.0035), at - 0.032, 0)), IRON);
    }
  }

  const from = side * -0.33;
  const to = side * 0.98;
  const rail = new CylinderGeometry(RAIL_R, RAIL_R, Math.abs(to - from), 10, 5).rotateZ(Math.PI / 2);
  add(pos(rail, (from + to) / 2, railY, railZ), BRASS);
  for (const end of [from, to]) add(pos(new SphereGeometry(0.021, 8, 5), end, railY, railZ), BRASS);

  const stem = railZ - FRONT - PROUD;
  for (const x of [-0.16, 0.16]) {
    const post = lathe([[0.027, 0], [0.027, 0.004], [0.014, 0.012], [0.01, 0.022], [0.01, stem]], 12);
    add(pos(post.rotateX(Math.PI / 2), x, railY, FRONT + PROUD), IRON);
    add(pos(new CylinderGeometry(0.021, 0.021, 0.034, 12).rotateZ(Math.PI / 2), x, railY, railZ), IRON);
  }

  const collar = to - side * 0.07;
  add(pos(new CylinderGeometry(0.021, 0.021, 0.03, 12).rotateZ(Math.PI / 2), collar, railY, railZ), IRON);
  const plateX = side * (HW + 0.003);
  const plateY = railY + 0.72;
  const plateZ = FRONT - 0.12;
  add(pos(box(0.006, 0.1, 0.06, 0.002), plateX, plateY, plateZ), IRON);
  for (const dy of [-0.034, 0.034]) {
    add(pos(dome(0.006, side > 0 ? 'X' : 'x'), plateX + side * 0.003, plateY + dy, plateZ), NICKEL);
  }
  add(pos(new BoxGeometry(0.024, 0.022, 0.016), plateX + side * 0.012, plateY, plateZ), IRON);
  add(
    rod(
      new Vector3(collar, railY + 0.018, railZ),
      new Vector3(plateX + side * 0.014, plateY, plateZ),
      0.0055,
      0.0055,
      6,
    ),
    GALVANISED,
  );
}

export interface CabinetOptions {
  label: (drawer: number) => Cell | undefined;
}

const LADDER_SIDE = -1;

export function buildCabinet(emit: Emit, o: CabinetOptions): void {
  footing(emit, -1.02, 0.55, -0.55, 1.35);

  for (let k = 0; k < MODULES; k++) {
    const open: number[] = [];
    for (let d = 0; d < PER_MODULE; d++) {
      if (isFine(zoneOf(k)) && !FIXED.includes(k * PER_MODULE + d)) open.push(d);
    }
    carcass(emit, k, open);
  }
  for (let i = 0; i < DRAWERS; i++) {
    const k = Math.floor(i / PER_MODULE);
    const zone = zoneOf(k);
    const y = drawerBase(i);
    if (FIXED.includes(i)) {
      drawerFront(emit, y, 0, zone, 'solid', o.label(i));
      continue;
    }
    const mine: Emit = (g, m, z, slot) => emit(g, m, z, slot, i);
    drawerFront(mine, y, 0, zone, 'solid', o.label(i));
    if (isFine(zone)) cavity(emit, y, zone);
    if (zone === 'floor') tray(mine, y, zone, i < 2);
    else plainTray(mine, y, zone, k < HALF ? HANGING : INSIDE);
  }

  const top = moduleBase(MODULES);
  const lid = corners(W + 0.016, D + 0.016, 0.014, 3);
  emit(wall(lid, top, CABINET_LENGTH, true), PAINT, 'end');
  emit(cap(lid, top, false), PAINT, 'end');
  emit(cap(lid, CABINET_LENGTH, true), PAINT, 'end');
  // The engine culls shadow casters by a ball it assumes rests on the ground: without this point the hanging end loses its shadow whenever it is off screen.
  const ground = 2 * poleHeight();
  emit(plain([0, ground, 0, 0, ground, 0, 0, ground, 0], [0, 1, 0, 0, 1, 0, 0, 1, 0]), PAINT, 'end');

  lock(emit, 0.165, moduleBase(0) + PER_MODULE * PITCH + RAIL / 2);
  ladder(emit, LADDER_SIDE, moduleBase(1) + PER_MODULE * PITCH + RAIL / 2);
}
