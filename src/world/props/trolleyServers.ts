import { BoxGeometry, CylinderGeometry, PlaneGeometry, type BufferGeometry, type Vector3 } from 'three';
import type { HyperMaterialOptions } from '../../engine';
import { box, pos, type Part } from '../geometry';
import {
  AMBER,
  BLUE,
  GREEN,
  decal,
  fillet,
  sweep,
  v3,
  type Lamp,
  type Region,
} from './trolleyKit';

const CHASSIS: HyperMaterialOptions = { color: 0xcdd2d7, ambient: 0.62, gloss: 0.4, metal: 0.45 };
const SHELL: HyperMaterialOptions = { color: 0xe4e7ea, ambient: 0.66, gloss: 0.5, metal: 0.5 };
const CHROME: HyperMaterialOptions = { color: 0xeceff1, ambient: 0.66, gloss: 0.75, metal: 0.75 };
const CADDY: HyperMaterialOptions = { color: 0x8a9098, ambient: 0.62, gloss: 0.3 };
const HOLE: HyperMaterialOptions = { color: 0x43474d, ambient: 0.6, gloss: 0.1 };
const BLACK: HyperMaterialOptions = { color: 0x565a61, ambient: 0.6, gloss: 0.35 };
const PSU: HyperMaterialOptions = { color: 0x9aa1a9, ambient: 0.6, gloss: 0.3, metal: 0.3 };
const VGA: HyperMaterialOptions = { color: 0x5b8de0, ambient: 0.64, gloss: 0.3 };
const TAB: HyperMaterialOptions = { color: 0x7fcf7a, ambient: 0.64, gloss: 0.3 };
const RUBBER: HyperMaterialOptions = { color: 0x62666c, ambient: 0.6, gloss: 0.1 };

export interface ServerSpec {
  form: 'rack2u' | 'unit1u';
  bezel: number;
  latch: number;
  label: Region;
  seed: number;
}

export interface Server {
  parts: Part[];
  lamps: Array<[BufferGeometry, Lamp]>;
  labels: BufferGeometry[];
  power: Vector3;
  network: Vector3;
  top: number;
}

interface Face {
  box(x: number, y: number, w: number, h: number, d: number, m: HyperMaterialOptions, lift?: number): void;
  disc(x: number, y: number, r: number, d: number, m: HyperMaterialOptions, lift?: number, sides?: number): void;
  lamp(x: number, y: number, w: number, h: number, lamp: Lamp, lift: number): void;
  label(x: number, y: number, w: number, h: number, region: Region): void;
  at(x: number, y: number): Vector3;
}

/** On the rear face x runs the way a person standing behind the machine sees it. */
function face(out: Server, z: number, rear: boolean): Face {
  const place = <T extends BufferGeometry>(g: T): T => {
    if (rear) g.rotateY(Math.PI);
    g.translate(0, 0, rear ? -z : z);
    return g;
  };
  return {
    box(x, y, w, h, d, m, lift = 0) {
      out.parts.push([place(new BoxGeometry(w, h, d).translate(x, y, lift + d / 2)), m]);
    },
    disc(x, y, r, d, m, lift = 0, sides = 10) {
      const g = new CylinderGeometry(r, r, d, sides).rotateX(Math.PI / 2);
      out.parts.push([place(g.translate(x, y, lift + d / 2)), m]);
    },
    lamp(x, y, w, h, lamp, lift) {
      out.lamps.push([place(new PlaneGeometry(w, h).translate(x, y, lift)), lamp]);
    },
    label(x, y, w, h, region) {
      out.labels.push(place(decal(w, h, region).translate(x, y, 0.002)));
    },
    at(x, y) {
      return v3(rear ? -x : x, y, rear ? -z : z);
    },
  };
}

const steady = (colour: string): Lamp => ({ kind: 'steady', colour });
const disk = (seed: number): Lamp => ({ kind: 'flicker', ...GREEN, rate: 6.5, seed, busy: 0.2 });
const traffic = (seed: number): Lamp => ({ kind: 'flicker', ...AMBER, rate: 12, seed, busy: 0.42 });
const locate = (seed: number): Lamp => ({ kind: 'beat', ...BLUE, period: 1.6, seed });

function caddy(f: Face, x: number, y: number, w: number, h: number, latch: number, seed: number): void {
  f.box(x, y, w, h, 0.003, CADDY);
  for (let top = y + h / 2 - 0.009; top > y - h / 2 + 0.014; top -= 0.009) {
    f.box(x - 0.007, top, w - 0.026, 0.004, 0.0008, HOLE, 0.003);
  }
  f.box(x + w / 2 - 0.008, y, 0.009, h - 0.008, 0.0035, { color: latch, ambient: 0.64, gloss: 0.4 }, 0.003);
  f.lamp(x - w / 2 + 0.008, y - h / 2 + 0.0055, 0.008, 0.005, disk(seed), 0.0045);
  f.lamp(x - w / 2 + 0.019, y - h / 2 + 0.0055, 0.008, 0.005, steady(BLUE.off), 0.0045);
}

function socket(f: Face, x: number, y: number): void {
  f.box(x, y, 0.017, 0.008, 0.0015, SHELL);
  f.box(x, y, 0.013, 0.0045, 0.0022, HOLE);
}

function jack(f: Face, x: number, y: number, seed: number): void {
  f.box(x, y, 0.022, 0.019, 0.002, SHELL);
  f.box(x, y - 0.0015, 0.016, 0.012, 0.0026, HOLE);
  f.lamp(x - 0.007, y + 0.0072, 0.005, 0.0032, steady(GREEN.on), 0.0035);
  f.lamp(x + 0.007, y + 0.0072, 0.005, 0.0032, traffic(seed), 0.0035);
}

function fan(f: Face, x: number, y: number): void {
  f.disc(x, y, 0.016, 0.0012, HOLE, 0.002, 12);
  f.box(x, y, 0.034, 0.002, 0.001, SHELL, 0.0032);
  f.box(x, y, 0.002, 0.034, 0.001, SHELL, 0.0032);
}

function supply(f: Face, x: number, y: number, live: boolean): void {
  f.box(x, y, 0.078, 0.058, 0.002, PSU);
  f.box(x - 0.02, y - 0.006, 0.03, 0.024, 0.003, BLACK, 0.001);
  fan(f, x + 0.02, y - 0.006);
  f.box(x + 0.02, y + 0.0225, 0.026, 0.005, 0.009, TAB, 0.002);
  f.lamp(x - 0.03, y + 0.02, 0.008, 0.005, steady(live ? GREEN.on : AMBER.on), 0.0035);
}

function video(f: Face, x: number, y: number): void {
  f.box(x, y, 0.034, 0.014, 0.007, VGA);
  for (const sx of [-1, 1]) f.disc(x + sx * 0.022, y, 0.0035, 0.006, CHROME, 0, 6);
}

function lid(out: Server, w: number, top: number, depth: number): void {
  out.parts.push([pos(new BoxGeometry(w - 0.006, 0.0008, 0.0025), 0, top + 0.0004, depth * 0.12), HOLE]);
  for (const sx of [-1, 1]) {
    for (const z of [-depth * 0.42, depth * 0.06]) {
      out.parts.push([pos(new CylinderGeometry(0.0045, 0.0045, 0.0015, 6), sx * (w / 2 - 0.014), top + 0.0007, z), CHROME]);
    }
  }
  for (let i = 0; i < 6; i++) {
    out.parts.push([pos(new BoxGeometry(w * 0.2, 0.0008, 0.004), -w * 0.24, top + 0.0004, -depth * 0.1 - i * 0.011), HOLE]);
  }
}

function feet(out: Server, x: number, z: number, h: number): void {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.parts.push([pos(new CylinderGeometry(0.012, 0.012, h, 10), sx * x, h / 2, sz * z), RUBBER]);
    }
  }
}

function rack2u(spec: ServerSpec): Server {
  const W = 0.38;
  const H = 0.13;
  const D = 0.28;
  const FOOT = 0.005;
  const out: Server = { parts: [], lamps: [], labels: [], power: v3(0, 0, 0), network: v3(0, 0, 0), top: FOOT + H };
  const bezel: HyperMaterialOptions = { color: spec.bezel, ambient: 0.6, gloss: 0.35 };

  out.parts.push([pos(box(W, H, D - 0.014, 0.004), 0, FOOT + H / 2, -0.007), CHASSIS]);
  out.parts.push([pos(box(W - 0.006, H - 0.004, 0.016, 0.004), 0, FOOT + H / 2, D / 2 - 0.008), bezel]);
  feet(out, 0.16, 0.105, FOOT);
  lid(out, W, FOOT + H, D);

  const f = face(out, D / 2, false);
  let bay = 0;
  for (const y of [0.0345, 0.0955]) {
    for (const x of [-0.15, -0.085, -0.02, 0.045]) caddy(f, x, FOOT + y, 0.061, 0.056, spec.latch, spec.seed + bay++);
  }

  f.disc(0.16, FOOT + 0.036, 0.014, 0.003, CHROME, 0, 14);
  f.disc(0.16, FOOT + 0.036, 0.0095, 0.004, BLACK, 0, 12);
  f.lamp(0.16, FOOT + 0.036, 0.0075, 0.0075, steady(GREEN.on), 0.0052);
  for (const y of [0.026, 0.044]) socket(f, 0.098, FOOT + y);
  f.lamp(0.128, FOOT + 0.02, 0.009, 0.0055, steady(GREEN.on), 0.0015);
  f.lamp(0.128, FOOT + 0.035, 0.009, 0.0055, locate(spec.seed), 0.0015);
  f.lamp(0.128, FOOT + 0.05, 0.009, 0.0055, traffic(spec.seed), 0.0015);
  f.lamp(0.1335, FOOT + 0.074, 0.094, 0.006, { kind: 'breathe', rgb: [110, 200, 255], period: 4.5 }, 0.0015);
  f.label(0.1335, FOOT + 0.101, 0.098, 0.0172, spec.label);

  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 0.011);
    out.parts.push([pos(new BoxGeometry(0.026, H, 0.003), x, FOOT + H / 2, D / 2 - 0.0125), CHASSIS]);
    const grip = fillet(
      [
        v3(x, FOOT + 0.03, D / 2 - 0.012),
        v3(x, FOOT + 0.03, D / 2 + 0.01),
        v3(x, FOOT + 0.1, D / 2 + 0.01),
        v3(x, FOOT + 0.1, D / 2 - 0.012),
      ],
      0.012,
      3,
    );
    out.parts.push([sweep(grip, 0.0042, 6), CHROME]);
    for (const y of [0.011, 0.119]) f.disc(x, FOOT + y, 0.005, 0.004, CHROME, -0.011, 8);
  }

  for (const sx of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      out.parts.push([pos(new BoxGeometry(0.0008, 0.0035, 0.07), sx * (W / 2 + 0.0004), FOOT + 0.034 + i * 0.01, 0.03), HOLE]);
    }
    for (const z of [-0.05, -0.11]) {
      const stud = new CylinderGeometry(0.005, 0.005, 0.004, 8).rotateZ(Math.PI / 2);
      out.parts.push([pos(stud, sx * (W / 2 + 0.002), FOOT + 0.065, z), CHROME]);
    }
  }

  const r = face(out, D / 2, true);
  supply(r, -0.13, FOOT + 0.035, true);
  supply(r, -0.048, FOOT + 0.035, false);
  for (let i = 0; i < 6; i++) r.box(-0.089, FOOT + 0.076 + i * 0.008, 0.16, 0.0035, 0.0008, HOLE);
  jack(r, 0.022, FOOT + 0.024, spec.seed);
  jack(r, 0.05, FOOT + 0.024, spec.seed + 4);
  video(r, 0.1, FOOT + 0.024);
  for (const y of [0.016, 0.032]) socket(r, 0.145, FOOT + y);
  r.disc(0.172, FOOT + 0.024, 0.006, 0.002, CHROME, 0, 8);
  r.lamp(0.172, FOOT + 0.024, 0.006, 0.006, locate(spec.seed), 0.0032);
  for (let i = 0; i < 4; i++) {
    const y = FOOT + 0.058 + i * 0.018;
    r.box(0.097, y, 0.166, 0.013, 0.0015, SHELL);
    r.box(0.105, y, 0.12, 0.003, 0.0008, HOLE, 0.0015);
    r.disc(0.022, y, 0.004, 0.002, CHROME, 0.0015, 6);
  }
  out.power = r.at(-0.15, FOOT + 0.029);
  out.network = r.at(0.022, FOOT + 0.0225);
  return out;
}

function unit1u(spec: ServerSpec): Server {
  const W = 0.27;
  const H = 0.066;
  const D = 0.22;
  const FOOT = 0.004;
  const out: Server = { parts: [], lamps: [], labels: [], power: v3(0, 0, 0), network: v3(0, 0, 0), top: FOOT + H };
  const bezel: HyperMaterialOptions = { color: spec.bezel, ambient: 0.62, gloss: 0.35 };

  out.parts.push([pos(box(W, H, D - 0.012, 0.003), 0, FOOT + H / 2, -0.006), CHASSIS]);
  out.parts.push([pos(box(W - 0.004, H - 0.003, 0.014, 0.003), 0, FOOT + H / 2, D / 2 - 0.007), bezel]);
  feet(out, 0.11, 0.085, FOOT);
  lid(out, W, FOOT + H, D);

  const f = face(out, D / 2, false);
  caddy(f, -0.094, FOOT + 0.033, 0.06, 0.054, spec.latch, spec.seed);
  caddy(f, -0.03, FOOT + 0.033, 0.06, 0.054, spec.latch, spec.seed + 1);
  for (let i = 0; i < 4; i++) f.box(0.04, FOOT + 0.01 + i * 0.008, 0.05, 0.0035, 0.0008, HOLE);
  f.lamp(0.081, FOOT + 0.011, 0.009, 0.0055, steady(GREEN.on), 0.0015);
  f.lamp(0.081, FOOT + 0.022, 0.009, 0.0055, disk(spec.seed + 2), 0.0015);
  f.lamp(0.081, FOOT + 0.033, 0.009, 0.0055, traffic(spec.seed), 0.0015);
  f.disc(0.111, FOOT + 0.022, 0.0105, 0.003, CHROME, 0, 12);
  f.disc(0.111, FOOT + 0.022, 0.007, 0.004, BLACK, 0, 10);
  f.lamp(0.111, FOOT + 0.022, 0.0055, 0.0055, steady(GREEN.on), 0.0052);
  f.label(0.068, FOOT + 0.0515, 0.098, 0.0172, spec.label);

  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 0.007);
    out.parts.push([pos(new BoxGeometry(0.018, H, 0.003), x, FOOT + H / 2, D / 2 - 0.0125), CHASSIS]);
    f.disc(x, FOOT + H / 2, 0.0055, 0.005, CHROME, -0.011, 8);
    for (let i = 0; i < 4; i++) {
      out.parts.push([pos(new BoxGeometry(0.0008, 0.0035, 0.06), sx * (W / 2 + 0.0004), FOOT + 0.018 + i * 0.01, 0.02), HOLE]);
    }
  }

  const r = face(out, D / 2, true);
  r.box(-0.08, FOOT + 0.033, 0.092, 0.056, 0.002, PSU);
  r.box(-0.103, FOOT + 0.027, 0.03, 0.024, 0.003, BLACK, 0.001);
  fan(r, -0.058, FOOT + 0.029);
  r.lamp(-0.103, FOOT + 0.052, 0.008, 0.005, steady(GREEN.on), 0.0035);
  jack(r, 0.0, FOOT + 0.024, spec.seed);
  jack(r, 0.028, FOOT + 0.024, spec.seed + 5);
  video(r, 0.074, FOOT + 0.024);
  for (const y of [0.016, 0.032]) socket(r, 0.112, FOOT + y);
  for (let i = 0; i < 2; i++) r.box(0.056, FOOT + 0.048 + i * 0.008, 0.13, 0.0035, 0.0008, HOLE);
  out.power = r.at(-0.103, FOOT + 0.027);
  out.network = r.at(0.0, FOOT + 0.0225);
  return out;
}

export function buildServer(spec: ServerSpec): Server {
  return spec.form === 'rack2u' ? rack2u(spec) : unit1u(spec);
}
