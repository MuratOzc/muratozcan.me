import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  PlaneGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  Vector3,
  type Texture,
} from 'three';
import {
  HyperObject,
  type GyroVector,
  type HyperMaterialOptions,
  type HyperWorld,
} from '../../engine';
import { L, t, upper, type Localized } from '../../content/i18n';
import {
  RoundedBoxGeometry,
  across,
  box,
  grained,
  moved,
  pos,
  rod,
  type Part,
  type Point,
} from '../geometry';
import { localizedCanvasTexture, shrinkToFit } from '../text';

const SQ = 0.058;
const FIELD = 8 * SQ;
const BORDER = 0.046;
const FACE = FIELD + 2 * BORDER;

const FLOOR = 0.06;
const TOP_Y = FLOOR + 0.455;
const BOARD_Y = TOP_Y + 0.018;

const HALF_X = 0.42;
const HALF_Z = 0.62;
const RIM = 0.045;
const LEG_X = 0.355;
const LEG_Z = 0.555;

const DAIS = { x0: -0.98, x1: 0.98, z0: -0.8, z1: 1.5 };

const MONO = 'ui-monospace, Consolas, monospace';

const MAHOGANY: HyperMaterialOptions = { color: 0xa66f4e, ambient: 0.55, gloss: 0.42, grain: 0.24 };
const WALNUT: HyperMaterialOptions = { color: 0xb08258, ambient: 0.54, gloss: 0.3, grain: 0.26 };
const PLYWOOD: HyperMaterialOptions = { color: 0xd9bd92, ambient: 0.55, gloss: 0.1, grain: 0.2 };
const BAIZE: HyperMaterialOptions = { color: 0x5c9a70, ambient: 0.62, gloss: 0.01 };
const CARPET: HyperMaterialOptions = { color: 0xb4484c, ambient: 0.62, gloss: 0.01 };
const FASCIA: HyperMaterialOptions = { color: 0x6f665e, ambient: 0.55, gloss: 0.12 };
const LEATHER: HyperMaterialOptions = { color: 0x9a6248, ambient: 0.56, gloss: 0.36 };
const BRASS: HyperMaterialOptions = { color: 0xe9cb7a, ambient: 0.56, gloss: 0.6, metal: 0.9 };
const STEEL: HyperMaterialOptions = { color: 0xdde1e4, ambient: 0.62, gloss: 0.5, metal: 0.6 };
const ENAMEL: HyperMaterialOptions = { color: 0x5c6168, ambient: 0.56, gloss: 0.45, metal: 0.3 };
const PLASTIC: HyperMaterialOptions = { color: 0x5c6168, ambient: 0.56, gloss: 0.35 };
const RUBBER: HyperMaterialOptions = { color: 0x4a4d52, ambient: 0.55, gloss: 0.05 };
const PAPER: HyperMaterialOptions = { color: 0xf7f3e6, ambient: 0.7, gloss: 0.04 };
const BOXWOOD: HyperMaterialOptions = { color: 0xf2deae, ambient: 0.56, gloss: 0.5 };
const EBONY: HyperMaterialOptions = { color: 0x5e4f49, ambient: 0.5, gloss: 0.62 };
const FELT: HyperMaterialOptions = { color: 0x4f8a64, ambient: 0.6, gloss: 0.01 };
const CUT: HyperMaterialOptions = { color: 0x43382f, ambient: 0.4, gloss: 0.02 };
const BOARD_EDGE: HyperMaterialOptions = { color: 0x8f6748, ambient: 0.52, gloss: 0.4, grain: 0.2 };

type PieceKind = 'P' | 'R' | 'N' | 'B' | 'Q' | 'K';
/** [file 0-7 = a-h, rank 0-7 = 1-8] */
type Square = [number, number];

const WHITE_STATIC: Array<[PieceKind, number, number]> = [
  ['P', 0, 1], ['P', 1, 1], ['P', 2, 1], ['P', 3, 1], ['P', 5, 1], ['P', 6, 1], ['P', 7, 1],
  ['R', 0, 0], ['N', 1, 0], ['B', 2, 0], ['K', 4, 0], ['N', 6, 0], ['R', 7, 0],
];
const BLACK_STATIC: Array<[PieceKind, number, number]> = [
  ['P', 0, 6], ['P', 1, 6], ['P', 2, 6], ['P', 3, 6], ['P', 6, 6], ['P', 7, 6],
  ['R', 0, 7], ['B', 2, 7], ['Q', 3, 7], ['B', 5, 7], ['R', 7, 7],
];
const BLACK_KING: Square = [4, 7];

/** White faces -x, black +x. PLIES index into this list. */
const MOVERS: Array<{ kind: PieceKind; facing: 1 | -1; start: Square }> = [
  { kind: 'P', facing: 1, start: [4, 1] },
  { kind: 'P', facing: -1, start: [4, 6] },
  { kind: 'B', facing: 1, start: [5, 0] },
  { kind: 'N', facing: -1, start: [1, 7] },
  { kind: 'Q', facing: 1, start: [3, 0] },
  { kind: 'N', facing: -1, start: [6, 7] },
  { kind: 'P', facing: -1, start: [5, 6] },
];

const SLIDE_LIFT = 0.5 * SQ;
const HOP_LIFT = 1.5 * SQ;

interface Ply {
  mover: number;
  to: Square;
  lift: number;
  captures?: number;
}

const PLIES: Ply[] = [
  { mover: 0, to: [4, 3], lift: SLIDE_LIFT },
  { mover: 1, to: [4, 4], lift: SLIDE_LIFT },
  { mover: 2, to: [2, 3], lift: SLIDE_LIFT },
  { mover: 3, to: [2, 5], lift: HOP_LIFT },
  { mover: 4, to: [7, 4], lift: SLIDE_LIFT },
  { mover: 5, to: [5, 5], lift: HOP_LIFT },
  { mover: 4, to: [5, 6], lift: SLIDE_LIFT, captures: 6 },
];

const MOVES: Array<[string, string]> = [
  ['e4', 'e5'],
  ['Bc4', 'Nc6'],
  ['Qh5', 'Nf6'],
  ['Qxf7#', ''],
];

const DWELL = 1.05;
const TRAVEL = 0.78;
const PLY = DWELL + TRAVEL;
const GAME = PLIES.length * PLY;
const HOLD = 6.0;
const RESET = 1.5;
const SETTLE = 1.2;
const CYCLE = GAME + HOLD + RESET + SETTLE;
const TIP_DELAY = 0.55;
const FALL = 0.5;

/** Radius, height, and 1 where the turning has a hard edge. */
type Ring = [number, number, 1?];

function turn(profile: Ring[], segments: number, scale = 1): BufferGeometry {
  const position: number[] = [];
  const normal: number[] = [];
  const index: number[] = [];
  const n = profile.length;

  const slopes: Array<[number, number]> = [];
  for (let j = 0; j < n - 1; j++) {
    const dr = profile[j + 1][0] - profile[j][0];
    const dy = profile[j + 1][1] - profile[j][1];
    const len = Math.hypot(dr, dy) || 1;
    slopes.push([dy / len, -dr / len]);
  }

  const ring = (j: number, nr: number, ny: number): number => {
    const start = position.length / 3;
    const [r, y] = profile[j];
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      position.push(r * Math.sin(a) * scale, y * scale, r * Math.cos(a) * scale);
      normal.push(nr * Math.sin(a), ny, nr * Math.cos(a));
    }
    return start;
  };

  let below = -1;
  for (let j = 0; j < n; j++) {
    const into = j > 0 ? slopes[j - 1] : null;
    const out = j < n - 1 ? slopes[j] : null;
    let arrive = -1;
    let leave = -1;
    if (into && out && !profile[j][2]) {
      const nr = into[0] + out[0];
      const ny = into[1] + out[1];
      const len = Math.hypot(nr, ny) || 1;
      arrive = leave = ring(j, nr / len, ny / len);
    } else {
      if (into) arrive = ring(j, into[0], into[1]);
      if (out) leave = ring(j, out[0], out[1]);
    }
    if (j > 0) {
      for (let s = 0; s < segments; s++) {
        const next = (s + 1) % segments;
        if (profile[j - 1][0] > 1e-6) index.push(below + s, below + next, arrive + s);
        if (profile[j][0] > 1e-6) index.push(below + next, arrive + next, arrive + s);
      }
    }
    below = leave;
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  g.setAttribute('uv', new Float32BufferAttribute(new Float32Array((position.length / 3) * 2), 2));
  g.setIndex(index);
  return g;
}

function ball(cy: number, r: number, neck: number, steps: number): Ring[] {
  const a0 = -Math.acos(Math.min(1, neck / r));
  const out: Ring[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (Math.PI / 2 - a0) * (i / steps);
    out.push([i === steps ? 0 : r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  out[0][2] = 1;
  return out;
}

function plinth(r: number): Ring[] {
  return [
    [r * 0.78, 0.03],
    [r * 0.97, 0.03, 1],
    [r, 0.055],
    [r, 0.115, 1],
    [r * 0.93, 0.14, 1],
    [r * 0.935, 0.165],
    [r * 0.9, 0.205],
    [r * 0.8, 0.25],
    [r * 0.68, 0.285],
    [r * 0.585, 0.32],
  ];
}

const BASE: Record<PieceKind, number> = { P: 0.31, R: 0.36, N: 0.37, B: 0.35, Q: 0.4, K: 0.4 };
const AROUND: Record<PieceKind, number> = { P: 12, R: 14, N: 14, B: 14, Q: 14, K: 14 };

const PAWN: Ring[] = [
  ...plinth(BASE.P),
  [0.165, 0.36], [0.132, 0.42], [0.115, 0.49], [0.11, 0.535, 1],
  [0.18, 0.555, 1], [0.19, 0.572], [0.18, 0.59, 1], [0.118, 0.61, 1],
  ...ball(0.755, 0.168, 0.118, 7),
];

const ROOK: Ring[] = [
  ...plinth(BASE.R),
  [0.195, 0.38], [0.185, 0.5], [0.18, 0.62, 1],
  [0.24, 0.645, 1], [0.25, 0.662], [0.24, 0.68, 1], [0.19, 0.7, 1],
  [0.2, 0.73], [0.245, 0.785], [0.272, 0.81, 1], [0.272, 0.93, 1],
  [0.205, 0.93, 1], [0.205, 0.875, 1], [0, 0.875],
];

const BISHOP: Ring[] = [
  ...plinth(BASE.B),
  [0.17, 0.39], [0.142, 0.5], [0.128, 0.62], [0.122, 0.7, 1],
  [0.2, 0.72, 1], [0.21, 0.738], [0.2, 0.756, 1], [0.135, 0.775, 1],
  [0.165, 0.79, 1], [0.165, 0.805, 1], [0.13, 0.82, 1],
  [0.165, 0.86], [0.2, 0.93], [0.205, 0.99], [0.185, 1.07], [0.14, 1.15], [0.085, 1.215], [0.05, 1.245, 1],
  ...ball(1.295, 0.07, 0.05, 5),
];

const QUEEN: Ring[] = [
  ...plinth(BASE.Q),
  [0.19, 0.4], [0.158, 0.58], [0.142, 0.78], [0.136, 0.93, 1],
  [0.215, 0.95, 1], [0.225, 0.97], [0.215, 0.99, 1], [0.15, 1.01, 1],
  [0.18, 1.025, 1], [0.18, 1.04, 1], [0.145, 1.055, 1],
  [0.155, 1.11], [0.19, 1.19], [0.235, 1.28], [0.262, 1.34, 1], [0.225, 1.34, 1], [0.2, 1.29, 1],
  [0.16, 1.325], [0.1, 1.365], [0.05, 1.38, 1],
  ...ball(1.435, 0.075, 0.05, 5),
];

const KING: Ring[] = [
  ...plinth(BASE.K),
  [0.195, 0.4], [0.165, 0.58], [0.15, 0.8], [0.144, 0.99, 1],
  [0.22, 1.01, 1], [0.23, 1.03], [0.22, 1.05, 1], [0.155, 1.07, 1],
  [0.185, 1.085, 1], [0.185, 1.1, 1], [0.15, 1.115, 1],
  [0.16, 1.17], [0.195, 1.25], [0.24, 1.34], [0.268, 1.4, 1], [0.24, 1.415],
  [0.19, 1.45], [0.12, 1.485], [0.06, 1.5, 1], [0.06, 1.53, 1],
  [0.085, 1.54, 1], [0.085, 1.56, 1], [0, 1.56],
];

const KNIGHT: Ring[] = [
  ...plinth(BASE.N),
  [0.2, 0.345], [0.205, 0.365, 1],
  [0.25, 0.375, 1], [0.26, 0.39], [0.25, 0.405, 1], [0.215, 0.415, 1], [0, 0.415],
];

const TURNINGS: Record<PieceKind, Ring[]> = { P: PAWN, R: ROOK, N: KNIGHT, B: BISHOP, Q: QUEEN, K: KING };

class Soup {
  private readonly p: number[] = [];

  face(corners: Vector3[], outward: Vector3): void {
    const n = new Vector3()
      .subVectors(corners[1], corners[0])
      .cross(new Vector3().subVectors(corners[2], corners[0]));
    const c = n.dot(outward) < 0 ? [...corners].reverse() : corners;
    for (let i = 1; i < c.length - 1; i++) {
      for (const v of [c[0], c[i], c[i + 1]]) this.p.push(v.x, v.y, v.z);
    }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new Float32BufferAttribute(new Float32Array((this.p.length / 3) * 2), 2));
    g.computeVertexNormals();
    return g;
  }
}

function merlons(): BufferGeometry {
  const soup = new Soup();
  const COUNT = 6;
  const R0 = 0.205;
  const R1 = 0.272;
  const Y0 = 0.93;
  const Y1 = 1.02;
  const at = (r: number, y: number, a: number) => new Vector3(r * Math.sin(a), y, r * Math.cos(a));
  for (let k = 0; k < COUNT; k++) {
    const a0 = ((k + 0.18) / COUNT) * Math.PI * 2;
    const a1 = ((k + 0.82) / COUNT) * Math.PI * 2;
    const STEPS = 2;
    for (let s = 0; s < STEPS; s++) {
      const b0 = a0 + ((a1 - a0) * s) / STEPS;
      const b1 = a0 + ((a1 - a0) * (s + 1)) / STEPS;
      const out = at(1, 0, (b0 + b1) / 2);
      soup.face([at(R1, Y0, b0), at(R1, Y0, b1), at(R1, Y1, b1), at(R1, Y1, b0)], out);
      soup.face([at(R0, Y0, b0), at(R0, Y0, b1), at(R0, Y1, b1), at(R0, Y1, b0)], out.clone().negate());
      soup.face([at(R0, Y1, b0), at(R1, Y1, b0), at(R1, Y1, b1), at(R0, Y1, b1)], new Vector3(0, 1, 0));
    }
    const side0 = new Vector3(-Math.cos(a0), 0, Math.sin(a0));
    const side1 = new Vector3(Math.cos(a1), 0, -Math.sin(a1));
    soup.face([at(R0, Y0, a0), at(R1, Y0, a0), at(R1, Y1, a0), at(R0, Y1, a0)], side0);
    soup.face([at(R0, Y0, a1), at(R1, Y0, a1), at(R1, Y1, a1), at(R0, Y1, a1)], side1);
  }
  return soup.build().scale(SQ, SQ, SQ);
}

function radiusAt(profile: Ring[], y: number, from: number): number {
  for (let j = 0; j < profile.length - 1; j++) {
    const [r0, y0] = profile[j];
    const [r1, y1] = profile[j + 1];
    if (y0 >= from && y1 > y0 && y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0;
}

function mitreCut(): BufferGeometry {
  const N = 10;
  const position: number[] = [];
  const normal: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= N; i++) {
    const phi = -Math.PI / 2 + (Math.PI * i) / N;
    let y = 0.98;
    for (let k = 0; k < 5; k++) y = 0.98 + 0.75 * radiusAt(BISHOP, y, 0.82) * Math.cos(phi);
    const a = Math.PI + phi;
    const half = 0.004 + 0.012 * Math.cos(phi);
    for (const dy of [-half, half]) {
      const r = radiusAt(BISHOP, y + dy, 0.82) * 1.03;
      position.push(r * Math.sin(a) * SQ, (y + dy) * SQ, r * Math.cos(a) * SQ);
      normal.push(Math.sin(a) * 0.97, 0.24, Math.cos(a) * 0.97);
    }
    if (i < N) index.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 2, 2 * i + 3, 2 * i + 1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  g.setAttribute('uv', new Float32BufferAttribute(new Float32Array((position.length / 3) * 2), 2));
  g.setIndex(index);
  return g;
}

function coronet(): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    out.push(
      new SphereGeometry(0.037 * SQ, 5, 3).translate(Math.sin(a) * 0.244 * SQ, 1.348 * SQ, Math.cos(a) * 0.244 * SQ),
    );
  }
  return out;
}

function kingCross(): BufferGeometry {
  const s = new Shape();
  const outline: Point[] = [
    [0.028, 0.028], [0.1, 0.05], [0.1, -0.05], [0.028, -0.028],
    [0.045, -0.15], [-0.045, -0.15], [-0.028, -0.028],
    [-0.1, -0.05], [-0.1, 0.05], [-0.028, 0.028],
    [-0.05, 0.11], [0.05, 0.11],
  ];
  outline.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  const g = new ExtrudeGeometry(s, {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.008,
    bevelSegments: 1,
  });
  return g.translate(0, 1.7, -0.015).scale(SQ, SQ, SQ);
}

/**
 * Stations up the neck and down the face: centre, the bearing of the mane/forehead
 * side in degrees, depth across the silhouette, half width. Authored looking +x.
 */
const HORSE: Array<[number, number, number, number, number]> = [
  [-0.005, 0.4, 180, 0.41, 0.17],
  [0.005, 0.53, 177, 0.47, 0.18],
  [0.0, 0.66, 170, 0.45, 0.17],
  [-0.02, 0.78, 160, 0.38, 0.155],
  [-0.03, 0.89, 145, 0.31, 0.14],
  [-0.02, 0.98, 122, 0.27, 0.13],
  [0.02, 1.03, 95, 0.26, 0.128],
  [0.09, 1.015, 68, 0.27, 0.125],
  [0.155, 0.955, 50, 0.27, 0.12],
  [0.21, 0.885, 42, 0.235, 0.108],
  [0.26, 0.82, 40, 0.195, 0.094],
  [0.305, 0.76, 40, 0.168, 0.086],
  [0.34, 0.715, 40, 0.158, 0.086],
  [0.362, 0.688, 40, 0.11, 0.064],
];

function horseAt(s: number): { c: Vector3; b: Vector3; depth: number; width: number } {
  const i = Math.min(HORSE.length - 2, Math.floor(s));
  const f = s - i;
  const mix = (k: number) => HORSE[i][k] + (HORSE[i + 1][k] - HORSE[i][k]) * f;
  const beta = (mix(2) * Math.PI) / 180;
  return {
    c: new Vector3(mix(0), mix(1), 0),
    b: new Vector3(Math.cos(beta), Math.sin(beta), 0),
    depth: mix(3),
    width: mix(4),
  };
}

function knightHead(): BufferGeometry[] {
  const AROUND_HEAD = 12;
  const position: number[] = [];
  const index: number[] = [];
  const last = HORSE.length - 1;

  for (let i = 0; i <= last; i++) {
    const { c, b, depth, width } = horseAt(i);
    for (let k = 0; k < AROUND_HEAD; k++) {
      const phi = (k / AROUND_HEAD) * Math.PI * 2;
      const u = Math.cos(phi);
      const narrow = 1 - 0.42 * Math.pow(0.5 + 0.5 * u, 1.6);
      position.push(
        c.x + b.x * (depth / 2) * u,
        c.y + b.y * (depth / 2) * u,
        width * Math.sin(phi) * narrow,
      );
    }
  }
  const tip = position.length / 3;
  position.push(0.378, 0.668, 0);

  for (let i = 0; i < last; i++) {
    for (let k = 0; k < AROUND_HEAD; k++) {
      const a = i * AROUND_HEAD + k;
      const b = i * AROUND_HEAD + ((k + 1) % AROUND_HEAD);
      index.push(a, b, a + AROUND_HEAD, b, b + AROUND_HEAD, a + AROUND_HEAD);
    }
  }
  for (let k = 0; k < AROUND_HEAD; k++) {
    index.push(last * AROUND_HEAD + k, last * AROUND_HEAD + ((k + 1) % AROUND_HEAD), tip);
  }

  const head = new BufferGeometry();
  head.setAttribute('position', new Float32BufferAttribute(position, 3));
  head.setAttribute('uv', new Float32BufferAttribute(new Float32Array((position.length / 3) * 2), 2));
  head.setIndex(index);
  head.computeVertexNormals();

  const mane = new Soup();
  const crest: Array<{ left: Vector3; right: Vector3; top: Vector3; out: Vector3 }> = [];
  const FROM = 1;
  const TO = 6;
  const SAMPLES = (TO - FROM) * 2;
  for (let j = 0; j <= SAMPLES; j++) {
    const { c, b, depth } = horseAt(FROM + j / 2);
    const root = c.clone().addScaledVector(b, depth / 2 - 0.035);
    const lock = j === 0 || j === SAMPLES ? 0 : j % 2 === 1 ? 0.062 : 0.022;
    crest.push({
      left: root.clone().setZ(0.04),
      right: root.clone().setZ(-0.04),
      top: c.clone().addScaledVector(b, depth / 2 + lock),
      out: b,
    });
  }
  for (let j = 0; j < SAMPLES; j++) {
    const p = crest[j];
    const q = crest[j + 1];
    mane.face([p.left, q.left, q.top, p.top], p.out.clone().setZ(1.4));
    mane.face([p.right, q.right, q.top, p.top], p.out.clone().setZ(-1.4));
  }

  const parts: BufferGeometry[] = [head, mane.build()];

  for (const side of [-1, 1]) {
    const ear = new ConeGeometry(0.042, 0.15, 5, 1);
    ear.translate(0, 0.075, 0).rotateZ(-0.3).rotateX(side * 0.22);
    parts.push(ear.translate(0.018, 1.095, side * 0.056));
    parts.push(new SphereGeometry(0.024, 6, 4).translate(0.172, 0.99, side * 0.084));
    const cheek = new SphereGeometry(0.075, 6, 4).scale(1, 1.1, 0.34);
    parts.push(cheek.translate(0.105, 0.925, side * 0.092));
  }

  return parts.map((g) => g.rotateY(Math.PI / 2).scale(SQ, SQ, SQ));
}

/** A piece standing at the origin, looking down -z. */
function piece(kind: PieceKind, wood: HyperMaterialOptions): Part[] {
  const around = AROUND[kind];
  const pad = BASE[kind] * 0.9;
  const parts: Part[] = [
    [turn(TURNINGS[kind], around, SQ), wood],
    [turn([[0, 0], [pad, 0, 1], [pad, 0.03]], around, SQ), FELT],
  ];
  if (kind === 'R') parts.push([merlons(), wood]);
  if (kind === 'B') parts.push([mitreCut(), CUT]);
  if (kind === 'Q') for (const g of coronet()) parts.push([g, wood]);
  if (kind === 'K') parts.push([kingCross(), wood]);
  if (kind === 'N') for (const g of knightHead()) parts.push([g, wood]);
  return parts;
}

/** Files run along z, ranks along x: white sits at +x, so a1 lands at (+3.5, +3.5) squares. */
function square(file: number, rank: number): [number, number] {
  return [(3.5 - rank) * SQ, (3.5 - file) * SQ];
}

function jitter(file: number, rank: number): [number, number, number] {
  const n = file * 8 + rank;
  return [
    (((n * 7919) % 97) / 97 - 0.5) * 0.035 * SQ,
    (((n * 6271) % 89) / 89 - 0.5) * 0.035 * SQ,
    (((n * 5417) % 83) / 83 - 0.5) * 0.14,
  ];
}

interface Pose {
  x: number;
  y: number;
  z: number;
  rot: number;
}

function restPose([file, rank]: Square): Pose {
  const [x, z] = square(file, rank);
  const [jx, jz, jr] = jitter(file, rank);
  return { x: x + jx, y: BOARD_Y, z: z + jz, rot: jr };
}

const CAPTURED: Pose = { x: 0.33, y: TOP_Y, z: 0.1, rot: -0.42 };

function glide(a: Pose, b: Pose, u: number, lift: number): Pose {
  const s = u * u * (3 - 2 * u);
  return {
    x: a.x + (b.x - a.x) * s,
    y: a.y + (b.y - a.y) * s + Math.sin(Math.PI * u) * lift,
    z: a.z + (b.z - a.z) * s,
    rot: a.rot + (b.rot - a.rot) * s,
  };
}

/**
 * A turned piece tipping over on a flat board without sliding: for each tilt,
 * how far its foot has to rise and travel so that the lowest ring of the
 * profile is the one touching. Ends where the crown comes down.
 */
function fallTable(hull: Ring[]): { end: number; at: (theta: number) => { lift: number; slide: number } } {
  const STEP = 0.002;
  const lift = [0];
  const slide = [0];
  const lowest = (theta: number): number => {
    let best = 0;
    let h = Infinity;
    hull.forEach(([r, y], i) => {
      const v = y * Math.cos(theta) - r * Math.sin(theta);
      if (v < h) {
        h = v;
        best = i;
      }
    });
    return best;
  };

  let theta = 0;
  while (theta < 2) {
    const [r, y] = hull[lowest(theta + STEP)];
    if (y > 0.7) break;
    const along = (a: number) => r * Math.cos(a) + y * Math.sin(a);
    slide.push(slide[slide.length - 1] + along(theta) - along(theta + STEP));
    theta += STEP;
    lift.push(r * Math.sin(theta) - y * Math.cos(theta));
  }

  return {
    end: theta,
    at: (a: number) => {
      const f = Math.min(Math.max(a, 0), theta) / STEP;
      const i = Math.min(lift.length - 2, Math.floor(f));
      const k = f - i;
      return {
        lift: lift[i] + (lift[i + 1] - lift[i]) * k,
        slide: slide[i] + (slide[i + 1] - slide[i]) * k,
      };
    },
  };
}

// The renderer writes linearised texels out raw, which crushes mid tones: the dark squares are painted a stop and a half light.
function boardTexture(): Texture {
  const FILES = 'abcdefgh';
  return localizedCanvasTexture(1024, 1024, (ctx, size) => {
    const m = size * (BORDER / FACE);
    const cell = (size - 2 * m) / 8;

    ctx.fillStyle = '#b98d63';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#a87f57';
    ctx.lineWidth = 2;
    for (let y = 0; y < size; y += 7) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(y * 0.11) * 3);
      ctx.lineTo(size, y + Math.sin(y * 0.09 + 2) * 3);
      ctx.stroke();
    }

    for (let f = 0; f < 8; f++) {
      for (let i = 0; i < 8; i++) {
        const dark = (f + i) % 2 === 1;
        const x = m + f * cell;
        const y = m + i * cell;
        ctx.fillStyle = dark ? '#c8a677' : '#f7f0de';
        ctx.fillRect(x, y, cell, cell);
        ctx.strokeStyle = '#c19f70';
        ctx.lineWidth = 1.5;
        for (let k = 1; dark && k < 9; k++) {
          const gy = y + (k * cell) / 9 + Math.sin(f * 3.1 + i * 1.7 + k) * 2;
          ctx.beginPath();
          ctx.moveTo(x, gy);
          ctx.bezierCurveTo(x + cell * 0.3, gy + 3, x + cell * 0.7, gy - 3, x + cell, gy + 1);
          ctx.stroke();
        }
      }
    }

    ctx.strokeStyle = '#8d6a49';
    ctx.lineWidth = 3;
    ctx.strokeRect(m - 4, m - 4, size - 2 * m + 8, size - 2 * m + 8);
    ctx.strokeRect(5, 5, size - 10, size - 10);

    ctx.fillStyle = '#7a5535';
    ctx.font = `600 ${Math.round(m * 0.52)}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 8; i++) {
      const along = m + (i + 0.5) * cell;
      // Turning the far pair upside down also carries each slot to the other end of its edge, so that pair counts back from h8.
      for (const flip of [0, Math.PI]) {
        const j = flip === 0 ? i : 7 - i;
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.rotate(flip);
        ctx.translate(-size / 2, -size / 2);
        ctx.fillText(FILES[j], along, size - m / 2);
        ctx.fillText(String(j + 1), m / 2, size - m - (i + 0.5) * cell);
        ctx.restore();
      }
    }
  });
}

type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function paintScoresheet(forWhite: boolean): Paint {
  const HAND = '"Segoe Script", "Comic Sans MS", cursive';
  const WHITE_L: Localized = L('White', 'Beyaz');
  const BLACK_L: Localized = L('Black', 'Siyah');
  const ROUND_L: Localized = L('Private match · July 2024', 'Özel maç · Temmuz 2024');
  const RESULT_L: Localized = L('Result', 'Sonuç');

  return (ctx, w, h) => {
    ctx.fillStyle = '#fbf7ec';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e6dfcd';
    ctx.fillRect(0, 0, w, 6);

    const pad = 34;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const fit = (text: string, font: string, size: number, room: number) =>
      shrinkToFit(size, 8, room, (px) => {
        ctx.font = font.replace('SIZE', String(px));
        return ctx.measureText(text).width;
      });

    ctx.fillStyle = '#8b8272';
    fit(upper(t(ROUND_L)), `400 SIZEpx ${MONO}`, 20, w - 2 * pad);
    ctx.fillText(upper(t(ROUND_L)), pad, 44);

    ctx.strokeStyle = '#cfc6b2';
    ctx.lineWidth = 2;
    const rule = (y: number) => {
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
    };
    rule(64);

    const names: Array<[Localized, string]> = [
      [WHITE_L, 'ÖZCAN, M.'],
      [BLACK_L, 'CARLSEN, M.'],
    ];
    names.forEach(([label, name], i) => {
      const y = 100 + i * 40;
      ctx.fillStyle = '#8b8272';
      fit(upper(t(label)), `400 SIZEpx ${MONO}`, 20, 96);
      ctx.fillText(upper(t(label)), pad, y);
      ctx.fillStyle = '#2a2f35';
      ctx.font = `26px ${HAND}`;
      ctx.fillText(name, pad + 110, y);
    });
    rule(160);

    const top = 196;
    const row = 62;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ded5c1';
    for (let i = 0; i <= MOVES.length; i++) {
      ctx.beginPath();
      ctx.moveTo(pad, top + i * row);
      ctx.lineTo(w - pad, top + i * row);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(pad + 62, top);
    ctx.lineTo(pad + 62, top + MOVES.length * row);
    ctx.moveTo(pad + 240, top);
    ctx.lineTo(pad + 240, top + MOVES.length * row);
    ctx.stroke();

    MOVES.forEach(([wm, bm], i) => {
      const y = top + i * row + row / 2;
      ctx.fillStyle = '#9c927f';
      ctx.font = `400 22px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), pad + 31, y);
      ctx.fillStyle = '#2a2f35';
      ctx.font = `30px ${HAND}`;
      ctx.textAlign = 'left';
      ctx.fillText(wm, pad + 84, y);
      if (bm) ctx.fillText(bm, pad + 262, y);
    });

    const resultY = top + MOVES.length * row + 54;
    ctx.fillStyle = '#8b8272';
    fit(upper(t(RESULT_L)), `400 SIZEpx ${MONO}`, 20, 96);
    ctx.fillText(upper(t(RESULT_L)), pad, resultY);
    ctx.fillStyle = '#2a2f35';
    ctx.font = `34px ${HAND}`;
    ctx.fillText('1 – 0', pad + 110, resultY);

    ctx.strokeStyle = '#2f3a48';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const sy = resultY + 76;
    ctx.moveTo(pad + 10, sy);
    const span = forWhite ? 210 : 120;
    for (let x = 0; x <= span; x += 6) {
      ctx.lineTo(pad + 10 + x, sy - Math.sin(x * 0.11) * 16 - (forWhite ? 0 : x * 0.05));
    }
    ctx.stroke();
    ctx.strokeStyle = '#cfc6b2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, sy + 22);
    ctx.lineTo(w - pad, sy + 22);
    ctx.stroke();
    ctx.fillStyle = '#e6dfcd';
    ctx.fillRect(0, h - 6, w, 6);
  };
}

function paintCard(name: string, colour: Localized, federation: string, chip: string): Paint {
  return (ctx, w, h) => {
    ctx.fillStyle = '#fbf8ef';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3c4a3f';
    ctx.fillRect(0, 0, w, 16);
    ctx.fillStyle = '#d9d2c0';
    ctx.fillRect(0, h - 8, w, 8);

    const pad = 34;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#20262c';
    ctx.letterSpacing = '6px';
    shrinkToFit(112, 20, w - 2 * pad, (size) => {
      ctx.font = `700 ${size}px ${MONO}`;
      return ctx.measureText(name).width;
    });
    ctx.fillText(name, w / 2, 100);

    ctx.letterSpacing = '3px';
    const line = `${upper(t(colour))} · ${federation}`;
    shrinkToFit(34, 12, w - 2 * pad - 70, (size) => {
      ctx.font = `500 ${size}px ${MONO}`;
      return ctx.measureText(line).width;
    });
    const tw = ctx.measureText(line).width;
    const y = 190;
    const left = (w - tw - 52) / 2;
    ctx.fillStyle = chip;
    ctx.fillRect(left, y - 18, 36, 36);
    ctx.strokeStyle = '#8c8474';
    ctx.lineWidth = 3;
    ctx.strokeRect(left, y - 18, 36, 36);
    ctx.fillStyle = '#5c655f';
    ctx.textAlign = 'left';
    ctx.fillText(line, left + 52, y + 2);
  };
}

const SEGMENTS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];

function paintDisplay(time: string, running: boolean): Paint {
  return (ctx, w, h) => {
    ctx.fillStyle = '#c6d1b4';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#a9b498';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);

    const DW = 46;
    const DH = 88;
    const T = 11;
    const top = (h - DH) / 2 + 6;

    const bar = (x0: number, y0: number, x1: number, y1: number) => {
      const horizontal = y0 === y1;
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + T / 2, y0 - T / 2);
        ctx.lineTo(x1 - T / 2, y0 - T / 2);
        ctx.lineTo(x1, y0);
        ctx.lineTo(x1 - T / 2, y0 + T / 2);
        ctx.lineTo(x0 + T / 2, y0 + T / 2);
      } else {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + T / 2, y0 + T / 2);
        ctx.lineTo(x0 + T / 2, y1 - T / 2);
        ctx.lineTo(x0, y1);
        ctx.lineTo(x0 - T / 2, y1 - T / 2);
        ctx.lineTo(x0 - T / 2, y0 + T / 2);
      }
      ctx.closePath();
      ctx.fill();
    };

    const digit = (x: number, mask: number) => {
      const l = x + T / 2;
      const r = x + DW - T / 2;
      const y0 = top + T / 2;
      const y1 = top + DH / 2;
      const y2 = top + DH - T / 2;
      const G = 1.5;
      const bars: Array<[number, number, number, number]> = [
        [l + G, y0, r - G, y0],
        [r, y0 + G, r, y1 - G],
        [r, y1 + G, r, y2 - G],
        [l + G, y2, r - G, y2],
        [l, y1 + G, l, y2 - G],
        [l, y0 + G, l, y1 - G],
        [l + G, y1, r - G, y1],
      ];
      bars.forEach((b, i) => {
        ctx.fillStyle = mask & (1 << i) ? '#27302a' : '#b9c4a7';
        bar(...b);
      });
    };

    let x = 44;
    for (const ch of time) {
      if (ch === ':') {
        ctx.fillStyle = '#27302a';
        ctx.fillRect(x + 2, top + DH * 0.3 - 6, 12, 12);
        ctx.fillRect(x + 2, top + DH * 0.7 - 6, 12, 12);
        x += 26;
      } else {
        digit(x, SEGMENTS[Number(ch)]);
        x += DW + 12;
      }
    }

    ctx.fillStyle = running ? '#27302a' : '#b9c4a7';
    ctx.beginPath();
    ctx.moveTo(20, 14);
    ctx.lineTo(38, 23);
    ctx.lineTo(20, 32);
    ctx.closePath();
    ctx.fill();
  };
}

const paintTurkiye: Paint = (ctx, w, h) => {
  ctx.fillStyle = '#ee2a35';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0.5 * h, 0.5 * h, 0.25 * h, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ee2a35';
  ctx.beginPath();
  ctx.arc(0.5625 * h, 0.5 * h, 0.2 * h, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI + (i * Math.PI) / 5;
    const r = (i % 2 === 0 ? 0.125 : 0.125 * 0.382) * h;
    const x = 0.8208 * h + Math.cos(a) * r;
    const y = 0.5 * h + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
};

const paintNorway: Paint = (ctx, w, h) => {
  const u = w / 22;
  const v = h / 16;
  ctx.fillStyle = '#dc2c46';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(6 * u, 0, 4 * u, h);
  ctx.fillRect(0, 6 * v, w, 4 * v);
  ctx.fillStyle = '#24449a';
  ctx.fillRect(7 * u, 0, 2 * u, h);
  ctx.fillRect(0, 7 * v, w, 2 * v);
};

type Region = [number, number, number, number];
const ATLAS_W = 2048;
const ATLAS_H = 1024;
const AT_SHEET_WHITE: Region = [8, 8, 512, 730];
const AT_SHEET_BLACK: Region = [536, 8, 512, 730];
const AT_CARD_WHITE: Region = [1064, 8, 640, 240];
const AT_CARD_BLACK: Region = [1064, 264, 640, 240];
const AT_TIME_WHITE: Region = [1064, 520, 400, 144];
const AT_TIME_BLACK: Region = [1064, 680, 400, 144];
const AT_TURKIYE: Region = [1720, 8, 312, 208];
const AT_NORWAY: Region = [1720, 232, 286, 208];

function atlasTexture(): Texture {
  const regions: Array<[Region, string, Paint]> = [
    [AT_SHEET_WHITE, '#fbf7ec', paintScoresheet(true)],
    [AT_SHEET_BLACK, '#fbf7ec', paintScoresheet(false)],
    [AT_CARD_WHITE, '#fbf8ef', paintCard('ÖZCAN', L('White', 'Beyaz'), 'TUR', '#f6f1e2')],
    [AT_CARD_BLACK, '#fbf8ef', paintCard('CARLSEN', L('Black', 'Siyah'), 'NOR', '#4a4038')],
    [AT_TIME_WHITE, '#c6d1b4', paintDisplay('1:31:34', false)],
    [AT_TIME_BLACK, '#c6d1b4', paintDisplay('1:28:07', true)],
    [AT_TURKIYE, '#ee2a35', paintTurkiye],
    [AT_NORWAY, '#dc2c46', paintNorway],
  ];
  return localizedCanvasTexture(ATLAS_W, ATLAS_H, (ctx) => {
    ctx.fillStyle = '#fbf7ec';
    ctx.fillRect(0, 0, ATLAS_W, ATLAS_H);
    for (const [[x, y, w, h], bleed, paint] of regions) {
      ctx.fillStyle = bleed;
      ctx.fillRect(x - 8, y - 8, w + 16, h + 16);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.translate(x, y);
      paint(ctx, w, h);
      ctx.restore();
    }
  });
}

function mapped(g: BufferGeometry, [x, y, w, h]: Region): BufferGeometry {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (x + uv.getX(i) * w) / ATLAS_W, 1 - (y + (1 - uv.getY(i)) * h) / ATLAS_H);
  }
  return g;
}

function scoreboardTexture(): Texture {
  const NOTE: Localized = L("Scholar's mate · 4 moves", 'Çoban matı · 4 hamle');

  return localizedCanvasTexture(1024, 616, (ctx, w, h) => {
    ctx.fillStyle = '#f2ece0';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3c4a3f';
    ctx.fillRect(0, 0, w, 12);
    ctx.fillRect(0, h - 12, w, 12);

    const pad = 62;
    ctx.textBaseline = 'middle';

    const rows: Array<[string, string, string]> = [
      ['#f6f1e2', 'ÖZCAN, Murat', '1'],
      ['#4a4038', 'CARLSEN, Magnus', '0'],
    ];
    ctx.textAlign = 'left';
    rows.forEach(([chip, name, score], i) => {
      const y = 168 + i * 112;
      ctx.fillStyle = chip;
      ctx.fillRect(pad, y - 26, 52, 52);
      ctx.strokeStyle = '#8c8474';
      ctx.lineWidth = 3;
      ctx.strokeRect(pad, y - 26, 52, 52);

      ctx.fillStyle = '#23282e';
      ctx.font = `500 52px ${MONO}`;
      ctx.fillText(name, pad + 84, y);

      ctx.textAlign = 'right';
      ctx.font = `700 60px ${MONO}`;
      ctx.fillText(score, w - pad, y);
      ctx.textAlign = 'left';
    });

    ctx.beginPath();
    ctx.strokeStyle = '#c6bfae';
    ctx.lineWidth = 3;
    ctx.moveTo(pad, 360);
    ctx.lineTo(w - pad, 360);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#4c5a4d';
    shrinkToFit(44, 16, w - 2 * pad, (size) => {
      ctx.font = `500 ${size}px ${MONO}`;
      return ctx.measureText(t(NOTE)).width;
    });
    ctx.fillText(t(NOTE), w / 2, 440);

    ctx.fillStyle = '#9c9484';
    ctx.font = `400 28px ${MONO}`;
    ctx.fillText(MOVES.map(([a, b], i) => `${i + 1}.${a}${b ? ` ${b}` : ''}`).join('  '), w / 2, 522);
  });
}

function dome(r: number, around = 6): BufferGeometry {
  return new SphereGeometry(r, around, 1, 0, Math.PI * 2, 0, Math.PI / 2);
}

function dais(): Part[] {
  const w = DAIS.x1 - DAIS.x0;
  const d = DAIS.z1 - DAIS.z0;
  const cx = (DAIS.x0 + DAIS.x1) / 2;
  const cz = (DAIS.z0 + DAIS.z1) / 2;
  const H = FLOOR - 0.012;
  const parts: Part[] = [
    [pos(box(w, H, d, 0.004), cx, H / 2, cz), FASCIA],
    [pos(new BoxGeometry(w - 0.02, 0.014, d - 0.02), cx, FLOOR - 0.007, cz), CARPET],
  ];
  for (const s of [-1, 1]) {
    parts.push([pos(new BoxGeometry(w + 0.004, 0.017, 0.016), cx, FLOOR - 0.0075, cz + s * (d / 2 - 0.006)), STEEL]);
    parts.push([pos(new BoxGeometry(0.016, 0.017, d + 0.004), cx + s * (w / 2 - 0.006), FLOOR - 0.0075, cz), STEEL]);
  }
  const screws: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const x = DAIS.x0 + 0.12 + (i * (w - 0.24)) / 5;
    screws.push([x, DAIS.z0 + 0.006], [x, DAIS.z1 - 0.006]);
  }
  for (let i = 0; i < 7; i++) {
    const z = DAIS.z0 + 0.12 + (i * (d - 0.24)) / 6;
    screws.push([DAIS.x0 + 0.006, z], [DAIS.x1 - 0.006, z]);
  }
  for (const [x, z] of screws) parts.push([pos(dome(0.004, 5), x, FLOOR + 0.0008, z), ENAMEL]);
  return parts;
}

function tableLeg(): Part[] {
  const AROUND_LEG = 12;
  return [
    [turn([[0, 0], [0.023, 0, 1], [0.025, 0.004], [0.025, 0.013, 1], [0.019, 0.017, 1], [0, 0.017]], AROUND_LEG), BRASS],
    [
      grained(
        turn([[0.017, 0.014], [0.026, 0.03], [0.029, 0.045], [0.026, 0.06], [0.02, 0.07, 1], [0.02, 0.08]], AROUND_LEG),
        'y',
      ),
      MAHOGANY,
    ],
    [grained(pos(box(0.056, 0.06, 0.056, 0.005), 0, 0.105, 0), 'y'), MAHOGANY],
    [
      grained(
        turn(
          [
            [0.02, 0.13], [0.02, 0.14, 1], [0.027, 0.146, 1], [0.027, 0.154, 1], [0.019, 0.16, 1],
            [0.0175, 0.175], [0.021, 0.2], [0.0275, 0.235], [0.028, 0.255], [0.0245, 0.285],
            [0.019, 0.305, 1], [0.026, 0.31, 1], [0.026, 0.318, 1], [0.02, 0.322, 1], [0.02, 0.335],
          ],
          AROUND_LEG,
        ),
        'y',
      ),
      MAHOGANY,
    ],
    [grained(pos(box(0.056, 0.086, 0.056, 0.005), 0, 0.37, 0), 'y'), MAHOGANY],
  ];
}

function table(): Part[] {
  const parts: Part[] = [];
  const W = HALF_X * 2;
  const D = HALF_Z * 2;
  const rimY = TOP_Y + 0.002 - 0.018;

  for (const s of [-1, 1]) {
    parts.push([grained(pos(box(RIM, 0.036, D, 0.008), s * (HALF_X - RIM / 2), rimY, 0), 'z'), MAHOGANY]);
    parts.push([
      grained(pos(box(W - 2 * RIM + 0.006, 0.036, RIM, 0.008), 0, rimY, s * (HALF_Z - RIM / 2)), 'x'),
      MAHOGANY,
    ]);
  }
  parts.push([pos(new BoxGeometry(W - 2 * RIM + 0.012, 0.008, D - 2 * RIM + 0.012), 0, TOP_Y - 0.004, 0), BAIZE]);
  parts.push([pos(new BoxGeometry(W - 2 * RIM + 0.012, 0.024, D - 2 * RIM + 0.012), 0, TOP_Y - 0.02, 0), MAHOGANY]);
  parts.push([grained(pos(box(W - 0.024, 0.012, D - 0.024, 0.005), 0, TOP_Y - 0.04, 0), 'z'), MAHOGANY]);

  const apronY = TOP_Y - 0.046 - 0.036;
  for (const s of [-1, 1]) {
    parts.push([grained(pos(box(0.02, 0.072, 2 * LEG_Z - 0.05, 0.004), s * LEG_X, apronY, 0), 'z'), MAHOGANY]);
    parts.push([grained(pos(box(2 * LEG_X - 0.05, 0.072, 0.02, 0.004), 0, apronY, s * LEG_Z), 'x'), MAHOGANY]);
    parts.push([
      grained(pos(box(2 * LEG_X - 0.05, 0.03, 0.022, 0.006), 0, FLOOR + 0.105, s * LEG_Z), 'x'),
      MAHOGANY,
    ]);
    for (const sz of [-1, 1]) parts.push(...moved(tableLeg(), s * LEG_X, FLOOR, sz * LEG_Z));
  }
  parts.push([grained(pos(box(0.022, 0.03, 2 * LEG_Z - 0.018, 0.006), 0, FLOOR + 0.105, 0), 'z'), MAHOGANY]);

  parts.push([grained(pos(box(FACE + 0.014, 0.016, FACE + 0.014, 0.004), 0, TOP_Y + 0.008, 0), 'x'), BOARD_EDGE]);
  return parts;
}

/** A side chair standing on y = 0, looking down -z. */
function chair(): Part[] {
  const parts: Part[] = [];
  const HX = 0.142;
  const RAKE = 0.197;
  const postZ = (y: number) =>
    (0.12 + ((y - 0.28) * 0.066) / 0.318 + 0.152 + ((y - 0.275) * 0.062) / 0.323) / 2;

  const side: Point[] = [
    [0.14, 0.004], [0.172, 0.004], [0.152, 0.275], [0.214, 0.598], [0.207, 0.606],
    [0.193, 0.606], [0.186, 0.598], [0.12, 0.28], [0.12, 0.2],
  ];
  for (const s of [-1, 1]) {
    parts.push([grained(pos(across(side, 0.026, 0.003), s * HX, 0, 0), 'y'), WALNUT]);

    const leg = new RoundedBoxGeometry(0.03, 0.272, 0.03, 2, 0.004);
    const p = leg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 0.72 + 0.28 * (p.getY(i) / 0.272 + 0.5);
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    parts.push([grained(pos(leg, s * HX, 0.139, -0.125), 'y'), WALNUT]);

    parts.push([grained(pos(box(0.018, 0.055, 0.25, 0.004), s * HX, 0.2425, 0.006), 'z'), WALNUT]);
    parts.push([grained(pos(box(0.014, 0.022, 0.27, 0.004), s * HX, 0.11, 0.012), 'z'), WALNUT]);

    parts.push([pos(new CylinderGeometry(0.009, 0.009, 0.004, 8), s * HX, 0.002, -0.125), RUBBER]);
    parts.push([pos(new CylinderGeometry(0.009, 0.009, 0.004, 8), s * HX, 0.002, 0.156), RUBBER]);

    for (let i = 0; i < 7; i++) {
      parts.push([pos(dome(0.0042).rotateZ(-s * (Math.PI / 2)), s * (HX + 0.009), 0.258, -0.1 + i * 0.033), BRASS]);
    }
  }
  parts.push([grained(pos(box(2 * HX - 0.02, 0.055, 0.018, 0.004), 0, 0.2425, -0.125), 'x'), WALNUT]);
  parts.push([grained(pos(box(2 * HX - 0.02, 0.055, 0.018, 0.004), 0, 0.2425, 0.137), 'x'), WALNUT]);
  parts.push([grained(pos(box(2 * HX, 0.022, 0.014, 0.004), 0, 0.11, 0.0), 'x'), WALNUT]);
  for (let i = 0; i < 9; i++) {
    parts.push([pos(dome(0.0042).rotateX(-Math.PI / 2), -0.116 + i * 0.029, 0.258, -0.134), BRASS]);
  }

  parts.push([pos(new RoundedBoxGeometry(0.3, 0.045, 0.27, 2, 0.021), 0, 0.2865, -0.018), LEATHER]);

  const leaning = (g: BufferGeometry, y: number, forward = 0): BufferGeometry =>
    g.rotateX(RAKE).translate(0, y, postZ(y) - forward);

  parts.push([grained(leaning(box(2 * HX + 0.026, 0.052, 0.024, 0.009), 0.578), 'x'), WALNUT]);
  parts.push([grained(leaning(box(2 * HX - 0.02, 0.03, 0.02, 0.005), 0.318), 'x'), WALNUT]);
  parts.push([leaning(new RoundedBoxGeometry(0.25, 0.2, 0.034, 2, 0.016), 0.44, 0.004), LEATHER]);
  const studs: Array<[number, number]> = [];
  for (let i = 0; i < 7; i++) studs.push([-0.105 + i * 0.035, 0.085], [-0.105 + i * 0.035, -0.085]);
  for (let i = 1; i < 4; i++) studs.push([-0.111, -0.085 + i * 0.0425], [0.111, -0.085 + i * 0.0425]);
  for (const [x, y] of studs) {
    parts.push([leaning(dome(0.0042).rotateX(-Math.PI / 2).translate(x, y, -0.017), 0.44, 0.004), BRASS]);
  }

  return parts;
}

/** Tip a standing chair over backwards until its feet and the top of its back are both down on y = 0. */
function laidOnItsBack(parts: Part[], split: number): Part[] {
  const points: Array<[number, number, boolean]> = [];
  for (const [g] of parts) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) points.push([p.getY(i), p.getZ(i), p.getY(i) > split]);
  }
  const lows = (theta: number): [number, number] => {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    let feet = Infinity;
    let back = Infinity;
    for (const [y, z, upper] of points) {
      const h = y * c - z * s;
      if (upper) back = Math.min(back, h);
      else feet = Math.min(feet, h);
    }
    return [feet, back];
  };
  let a = 1.2;
  let b = 1.9;
  for (let i = 0; i < 40; i++) {
    const mid = (a + b) / 2;
    const [feet, back] = lows(mid);
    if (back > feet) a = mid;
    else b = mid;
  }
  const theta = (a + b) / 2;
  const drop = Math.min(...lows(theta));
  for (const [g] of parts) g.rotateX(theta).translate(0, -drop, 0);
  return parts;
}

/** The clock stands on y = 0 with its displays toward -z and white's end at +x. */
function clock(): { parts: Part[]; displays: BufferGeometry[] } {
  const parts: Part[] = [];
  const B = 0.004;
  const profile: Point[] = [
    [-0.046, 0.008], [0.038, 0.008], [0.038, 0.05], [0.03, 0.06], [-0.014, 0.06], [-0.046, 0.016],
  ];
  parts.push([across(profile, 0.2, B), PLASTIC]);

  const TILT = Math.atan2(0.032, 0.044);
  const nz = -Math.cos(TILT);
  const ny = Math.sin(TILT);
  const onFace = (g: BufferGeometry, x: number, f: number, proud: number): BufferGeometry =>
    g.rotateX(TILT).translate(x, 0.016 + 0.044 * f + ny * (B + proud), -0.046 + 0.032 * f + nz * (B + proud));

  parts.push([onFace(box(0.184, 0.034, 0.003, 0.001), 0, 0.64, 0.0015), { color: 0xc3c7cb, ambient: 0.6, gloss: 0.45, metal: 0.4 }]);
  for (let i = 0; i < 5; i++) {
    parts.push([
      onFace(new BoxGeometry(0.016, 0.009, 0.005), (i - 2) * 0.026, 0.16, 0.001),
      i === 2 ? { color: 0xdd5a50, ambient: 0.6, gloss: 0.3 } : { color: 0xb6b2a6, ambient: 0.58, gloss: 0.25 },
    ]);
  }
  const displays = [1, -1].map((s) =>
    onFace(
      mapped(new PlaneGeometry(0.078, 0.028), s === 1 ? AT_TIME_WHITE : AT_TIME_BLACK).rotateY(Math.PI),
      s * 0.047,
      0.64,
      0.0042,
    ),
  );

  const TOP = 0.06 + B;
  parts.push([pos(box(0.036, 0.02, 0.046, 0.004), 0, TOP + 0.008, 0.012), PLASTIC]);
  const lever: Part[] = [[box(0.198, 0.011, 0.042, 0.004), { color: 0x7d838b, ambient: 0.58, gloss: 0.4 }]];
  for (const s of [-1, 1]) {
    lever.push([pos(box(0.052, 0.007, 0.038, 0.003), s * 0.07, 0.0075, 0), { color: 0xdd5a50, ambient: 0.6, gloss: 0.3 }]);
  }
  for (const [g, m] of lever) parts.push([g.rotateZ(-0.105).translate(0, TOP + 0.016, 0.012), m]);

  for (const sx of [-1, 1]) {
    for (const z of [-0.034, 0.028]) {
      parts.push([pos(new CylinderGeometry(0.007, 0.007, 0.004, 8), sx * 0.08, 0.002, z), RUBBER]);
    }
  }
  return { parts, displays };
}

/** A table flag on y = 0, flying toward +x. */
function tableFlag(region: Region, length: number): { parts: Part[]; cloth: BufferGeometry[] } {
  const H = 0.058;
  const HOIST = 0.146;
  const parts: Part[] = [
    [
      turn(
        [
          [0, 0], [0.026, 0, 1], [0.028, 0.003], [0.028, 0.008, 1], [0.022, 0.011], [0.012, 0.018],
          [0.006, 0.024], [0.0045, 0.03, 1], [0.0045, 0.034, 1], [0, 0.034],
        ],
        12,
      ),
      BRASS,
    ],
    [pos(new CylinderGeometry(0.0022, 0.0022, 0.18, 6), 0, 0.12, 0), BRASS],
    [pos(new SphereGeometry(0.0055, 8, 5), 0, 0.212, 0), BRASS],
  ];

  const NU = 8;
  const NV = 3;
  const position: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (let j = 0; j <= NV; j++) {
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      const v = j / NV;
      position.push(
        0.002 + u * length * 0.97,
        HOIST + v * H - 0.07 * H * u * u,
        0.006 * u * Math.sin(u * 7.2 + 0.5 + v * 0.6),
      );
      uv.push(u, v);
    }
  }
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i;
      index.push(a, a + 1, a + NU + 1, a + 1, a + NU + 2, a + NU + 1);
    }
  }
  const front = new BufferGeometry();
  front.setAttribute('position', new Float32BufferAttribute(position, 3));
  front.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  front.setIndex(index);
  front.computeVertexNormals();
  mapped(front, region);

  const back = front.clone();
  const reversed: number[] = [];
  for (let i = 0; i < index.length; i += 3) reversed.push(index[i], index[i + 2], index[i + 1]);
  back.setIndex(reversed);
  const n = back.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));

  return { parts, cloth: [front, back] };
}

/** A folded card on y = 0, lettered on both slopes. */
function tentCard(region: Region): { parts: Part[]; faces: BufferGeometry[] } {
  const W = 0.17;
  const SLOPE = 0.064;
  const SPREAD = 0.022;
  const lean = Math.asin(SPREAD / SLOPE);
  const cy = (SLOPE * Math.cos(lean)) / 2;
  const faces = [
    mapped(new PlaneGeometry(W, SLOPE).rotateY(Math.PI).rotateX(lean).translate(0, cy, -SPREAD / 2), region),
    mapped(new PlaneGeometry(W, SLOPE).rotateX(-lean).translate(0, cy, SPREAD / 2), region),
  ];
  const parts: Part[] = [
    [new PlaneGeometry(W, SLOPE).rotateX(lean).translate(0, cy, -SPREAD / 2 + 0.0008), PAPER],
    [new PlaneGeometry(W, SLOPE).rotateY(Math.PI).rotateX(-lean).translate(0, cy, SPREAD / 2 - 0.0008), PAPER],
  ];
  return { parts, faces };
}

/** A ballpoint lying on y = 0 along x, clip up. */
function pen(colour: number): Part[] {
  const R = 0.0042;
  const lie = (g: BufferGeometry, x: number): BufferGeometry => pos(g.rotateZ(-Math.PI / 2), x, R, 0);
  const body: HyperMaterialOptions = { color: colour, ambient: 0.58, gloss: 0.5 };
  return [
    [lie(new CylinderGeometry(R, R, 0.078, 8), -0.006), body],
    [lie(new CylinderGeometry(R * 0.82, R + 0.0003, 0.024, 8), 0.045), RUBBER],
    [lie(new CylinderGeometry(0.0008, R * 0.8, 0.012, 8), 0.063), STEEL],
    [lie(new CylinderGeometry(R + 0.0004, R + 0.0004, 0.004, 8), -0.045), STEEL],
    [lie(new CylinderGeometry(0.0028, 0.0028, 0.009, 8), -0.0515), STEEL],
    [pos(new BoxGeometry(0.034, 0.0012, 0.003), -0.03, 2 * R + 0.001, 0), STEEL],
    [pos(new BoxGeometry(0.004, 0.003, 0.003), -0.045, 2 * R, 0), STEEL],
  ];
}

/** The result board on y = 0, reading toward -z. */
function scoreboard(): { parts: Part[]; placard: BufferGeometry } {
  const parts: Part[] = [];
  const W = 0.96;
  const H = 0.58;
  const CY = 0.98;
  const F = 0.055;
  const POST_X = 0.36;
  const POST_Z = 0.038;

  for (const s of [-1, 1]) {
    parts.push([grained(pos(box(W, F, 0.046, 0.011), 0, CY + (s * H) / 2, 0), 'x'), WALNUT]);
    parts.push([grained(pos(box(F, H - F + 0.006, 0.046, 0.011), s * (W / 2 - F / 2), CY, 0), 'y'), WALNUT]);
    parts.push([pos(new BoxGeometry(W - F, 0.008, 0.01), 0, CY + s * (H / 2 - F / 2 - 0.004), -0.014), BRASS]);
    parts.push([pos(new BoxGeometry(0.008, H - F, 0.01), s * (W / 2 - F / 2 - 0.004), CY, -0.014), BRASS]);

    const top = CY + H / 2 + 0.05;
    parts.push([pos(box(0.03, top - 0.028, 0.03, 0.004), s * POST_X, (top + 0.028) / 2, POST_Z), ENAMEL]);
    parts.push([pos(new BoxGeometry(0.034, 0.008, 0.034), s * POST_X, top + 0.003, POST_Z), RUBBER]);
    parts.push([pos(box(0.044, 0.026, 0.42, 0.006), s * POST_X, 0.019, POST_Z), ENAMEL]);
    for (const end of [-1, 1]) {
      parts.push([pos(new CylinderGeometry(0.02, 0.02, 0.006, 10), s * POST_X, 0.003, POST_Z + end * 0.18), RUBBER]);
    }
    parts.push([
      rod(new Vector3(s * POST_X, 0.028, POST_Z + 0.185), new Vector3(s * POST_X, 0.4, POST_Z + 0.012), 0.008),
      ENAMEL,
    ]);
    parts.push([
      rod(new Vector3(s * POST_X, 0.028, POST_Z - 0.185), new Vector3(s * POST_X, 0.27, POST_Z - 0.012), 0.008),
      ENAMEL,
    ]);
    for (const y of [CY - H / 2, CY + H / 2]) {
      parts.push([pos(dome(0.008, 8).rotateX(Math.PI / 2), s * POST_X, y, POST_Z + 0.015), BRASS]);
    }
  }
  parts.push([pos(new BoxGeometry(2 * POST_X - 0.03, 0.022, 0.022), 0, 0.2, POST_Z), ENAMEL]);
  parts.push([grained(pos(new BoxGeometry(W - F + 0.006, H - F + 0.006, 0.018), 0, CY, 0.004), 'x'), PLYWOOD]);

  const placard = new PlaneGeometry(W - F, H - F, 6, 4).rotateY(Math.PI).translate(0, CY, -0.009);
  return { parts, placard };
}

export interface ChessResult {
  object: HyperObject;
  tick: (worldGV: GyroVector, dt: number) => void;
}

export function buildChessTable(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): ChessResult {
  const object = new HyperObject(at);
  object.rotation.y = yaw;
  const put = (parts: Part[], node?: Group): void => {
    for (const [g, opts] of parts) {
      object.addGeometry(world.shared, g, opts, node);
    }
  };

  put(dais());
  put(table());

  const boardFace = new PlaneGeometry(FACE, FACE, 1, 1);
  boardFace.rotateX(-Math.PI / 2);
  // The canvas is painted as white sees the board; this turn puts a1 at the +x/+z corner where square() puts it.
  boardFace.rotateY(Math.PI / 2);
  boardFace.translate(0, BOARD_Y, 0);
  object.addGeometry(world.shared, boardFace, {
    map: boardTexture(),
    color: 0xffffff,
    ambient: 0.85,
    castShadow: false,
  });

  const standing = (list: Array<[PieceKind, number, number]>, facing: 1 | -1, wood: HyperMaterialOptions) => {
    for (const [kind, file, rank] of list) {
      const home = restPose([file, rank]);
      put(moved(piece(kind, wood), home.x, home.y, home.z, facing * (Math.PI / 2) + home.rot));
    }
  };
  standing(WHITE_STATIC, 1, BOXWOOD);
  standing(BLACK_STATIC, -1, EBONY);

  const carried = (kind: PieceKind, facing: 1 | -1): Group => {
    const node = new Group();
    object.add(node);
    put(moved(piece(kind, facing === 1 ? BOXWOOD : EBONY), 0, 0, 0, facing * (Math.PI / 2)), node);
    return node;
  };
  const movers = MOVERS.map(({ kind, facing, start }) => ({
    node: carried(kind, facing),
    home: restPose(start),
  }));
  const king = carried('K', -1);
  const kingHome = restPose(BLACK_KING);

  const decals: BufferGeometry[] = [];
  const placed = (g: BufferGeometry, x: number, y: number, z: number, turn = 0): BufferGeometry =>
    g.rotateY(turn).translate(x, y, z);

  const timer = clock();
  put(moved(timer.parts, 0, TOP_Y, 0.4, 0.04));
  for (const g of timer.displays) decals.push(placed(g, 0, TOP_Y, 0.4, 0.04));

  const sheet = (region: Region, x: number, z: number, turn: number): void => {
    const g = mapped(new PlaneGeometry(0.145, 0.205, 1, 1).rotateX(-Math.PI / 2), region);
    decals.push(placed(g, x, TOP_Y + 0.003, z, turn));
  };
  sheet(AT_SHEET_WHITE, 0.255, -0.385, Math.PI / 2);
  sheet(AT_SHEET_BLACK, -0.255, 0.385, -Math.PI / 2 + 0.2);
  put(moved(pen(0x4f74b0), 0.25, TOP_Y + 0.003, -0.447, 0.07));
  put(moved(pen(0x4f74b0), -0.63, FLOOR, 0.5, 0.9));

  const seats: Array<[Region, Region, number, number]> = [
    [AT_CARD_WHITE, AT_TURKIYE, 1, 0.087],
    [AT_CARD_BLACK, AT_NORWAY, -1, 0.08],
  ];
  for (const [cardRegion, flagRegion, side, length] of seats) {
    const card = tentCard(cardRegion);
    put(moved(card.parts, side * 0.19, TOP_Y, -0.535, side * -0.05));
    for (const g of card.faces) decals.push(placed(g, side * 0.19, TOP_Y, -0.535, side * -0.05));

    const flag = tableFlag(flagRegion, length);
    put(moved(flag.parts, side * 0.33 - 0.01, TOP_Y, -0.53, -0.6));
    for (const g of flag.cloth) decals.push(placed(g, side * 0.33 - 0.01, TOP_Y, -0.53, -0.6));
  }

  const atlas = atlasTexture();
  for (const g of decals) {
    object.addGeometry(world.shared, g, {
      map: atlas,
      color: 0xffffff,
      ambient: 0.9,
      castShadow: false,
      receiveShadow: false,
    });
  }

  put(moved(chair(), 0.41, FLOOR, 0, Math.PI / 2));
  put(moved(laidOnItsBack(chair(), 0.45), -1.07, 0, 0.06, -Math.PI / 2 + 0.2));

  const result = scoreboard();
  put(moved(result.parts, 0.3, FLOOR, 1.1, 0.3));
  object.addGeometry(world.shared, placed(result.placard, 0.3, FLOOR, 1.1, 0.3), {
    map: scoreboardTexture(),
    color: 0xffffff,
    ambient: 0.9,
    castShadow: false,
    receiveShadow: false,
  });

  world.add(object);

  // rest[m][p] is where mover m stands once p plies have been played.
  const rest: Pose[][] = movers.map((m) => [m.home]);
  PLIES.forEach((ply, p) => {
    rest.forEach((poses, m) => {
      poses.push(
        ply.mover === m ? restPose(ply.to) : ply.captures === m ? CAPTURED : poses[p],
      );
    });
  });
  const FINAL = PLIES.length;

  let elapsed = 0;

  const poseAt = (m: number, at: number): Pose => {
    if (at >= GAME + HOLD) {
      const u = Math.min(1, (at - GAME - HOLD) / RESET);
      return glide(rest[m][FINAL], movers[m].home, u, SLIDE_LIFT);
    }
    if (at >= GAME) return rest[m][FINAL];

    const p = Math.floor(at / PLY);
    const local = at - p * PLY;
    const ply = PLIES[p];

    if (local < DWELL) return rest[m][p];

    const u = (local - DWELL) / TRAVEL;
    if (ply.mover === m) return glide(rest[m][p], rest[m][p + 1], u, ply.lift);
    // The man being taken has to be off f7 before the queen lands on it.
    if (ply.captures === m) {
      return glide(rest[m][p], rest[m][p + 1], Math.min(1, u / 0.62), 0.8 * SQ);
    }
    return rest[m][p];
  };

  const fall = fallTable([[BASE.K * 0.9, 0], ...KING]);
  const TIP_TOWARD = 0.12;
  const tipX = Math.cos(TIP_TOWARD);
  const tipZ = Math.sin(TIP_TOWARD);
  const tipAxis = new Vector3(tipZ, 0, -tipX);
  const UP = new Vector3(0, 1, 0);
  const spin = new Quaternion();

  const poseKing = (at: number): void => {
    let theta = 0;
    let roll = 0;
    let raise = 0;
    const since = at - GAME - TIP_DELAY;
    if (at >= GAME + HOLD) {
      const u = Math.min(1, (at - GAME - HOLD) / (RESET * 0.75));
      theta = fall.end * (1 - u * u * (3 - 2 * u));
      raise = Math.sin(Math.PI * u) * 0.35 * SQ;
    } else if (since > FALL) {
      const s = since - FALL;
      theta = fall.end - 0.1 * Math.abs(Math.sin(s * 12)) * Math.exp(-s * 6);
      roll = 0.3 * Math.sin(s * 7) * Math.exp(-s * 2.4);
    } else if (since > 0) {
      theta = fall.end * Math.pow(since / FALL, 2.2);
    }
    const { lift, slide } = fall.at(theta);
    king.position.set(
      kingHome.x + tipX * slide * SQ,
      kingHome.y + lift * SQ + raise,
      kingHome.z + tipZ * slide * SQ,
    );
    king.quaternion
      .setFromAxisAngle(tipAxis, theta)
      .multiply(spin.setFromAxisAngle(UP, kingHome.rot + roll));
  };

  const tick = (_worldGV: GyroVector, dt: number) => {
    elapsed = (elapsed + dt) % CYCLE;

    for (let m = 0; m < movers.length; m++) {
      const pose = poseAt(m, elapsed);
      movers[m].node.position.set(pose.x, pose.y, pose.z);
      movers[m].node.rotation.y = pose.rot;
    }
    poseKing(elapsed);
  };

  return { object, tick };
}
