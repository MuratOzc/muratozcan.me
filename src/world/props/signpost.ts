import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  Path,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  HyperObject,
  type GyroVector,
  type HyperMaterialOptions,
  type HyperWorld,
} from '../../engine';
import { L, type Localized } from '../../content/i18n';
import { RoundedBoxGeometry, grained } from '../geometry';
import { makeLocalizedTextTexture } from '../text';

const PLATES: Localized[] = [
  L('SOFTWARE ENGINEER', 'YAZILIM MÜHENDİSİ'),
  L('DEVOPS', 'DEVOPS'),
  L('CTO', 'CTO'),
  L('IT GUY', 'IT’Cİ'),
  L('MATHS GUY', 'MATEMATİKÇİ'),
  L('COMPUTER GUY', 'BİLGİSAYARCI'),
];

const FINGER_L = 1.5;
const FINGER_H = 0.24;
const FINGER_T = 0.032;
const TIP = 0.13;
const HEEL = 0.15;
const RIM_W = 0.009;
const RIM_PROUD = 0.005;
const FIRST_AT_Y = 0.68;
const SPACING = 0.34;
const TEXT_PX: [number, number] = [1024, 176];

const POST = 0.075;
const FACE = POST + FINGER_T;

const OAK: HyperMaterialOptions = { color: 0xe3cda6, ambient: 0.62, gloss: 0.16, grain: 0.3 };
const ENAMEL = [0xfbf7ec, 0xf6f1e2, 0xfdfaf2];
const RIM: HyperMaterialOptions = { color: 0x4a525b, ambient: 0.7, gloss: 0.4 };
const BOLT: HyperMaterialOptions = { color: 0xd3d8dc, ambient: 0.7, gloss: 0.45, metal: 0.45 };
const STEEL: HyperMaterialOptions = { color: 0xdde1e4, ambient: 0.62, gloss: 0.5, metal: 0.6 };
const PAPER: HyperMaterialOptions = { color: 0xf3ecd9, ambient: 0.7, gloss: 0.1 };
const RED = 0xff7c6c;
const WHITE = 0xffffff;

type Point = [number, number];

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inset(outline: Point[], d: number): Point[] {
  const n = outline.length;
  const inward = (a: Point, b: Point): Point => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  };
  return outline.map((p, i) => {
    const a = inward(outline[(i + n - 1) % n], p);
    const b = inward(p, outline[(i + 1) % n]);
    const k = d / (1 + a[0] * b[0] + a[1] * b[1]);
    return [p[0] + (a[0] + b[0]) * k, p[1] + (a[1] + b[1]) * k];
  });
}

function trace<T extends Path>(path: T, points: Point[]): T {
  points.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
  path.closePath();
  return path;
}

function lathe(profile: Point[], segments: number): BufferGeometry {
  return new LatheGeometry(profile.map(([x, y]) => new Vector2(x, y)), segments);
}

function fingerGeometry(): { board: BufferGeometry; rim: BufferGeometry } {
  const h = FINGER_H / 2;
  const outline: Point[] = [
    [0, -h],
    [FINGER_L - TIP, -h],
    [FINGER_L, 0],
    [FINGER_L - TIP, h],
    [0, h],
  ];

  const board = new ExtrudeGeometry(trace(new Shape(), inset(outline, 0.003)), {
    depth: FINGER_T,
    bevelEnabled: false,
  });
  board.translate(-HEEL, 0, -FINGER_T / 2);

  const frame = trace(new Shape(), outline);
  frame.holes.push(trace(new Path(), inset(outline, RIM_W)));
  const bevel = 0.0025;
  const rim = new ExtrudeGeometry(frame, {
    depth: FINGER_T + 2 * (RIM_PROUD - bevel),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
  });
  rim.translate(-HEEL, 0, -FINGER_T / 2 - RIM_PROUD + bevel);

  return { board: grained(board, 'x'), rim };
}

function postGeometry(height: number): BufferGeometry {
  const rings: Array<[number, number]> = [
    [-0.06, 0],
    [0.44, 0],
    [0.54, 0.03],
    [height - 0.4, 0.03],
    [height - 0.3, 0],
    [height, 0],
  ];
  const ring = ([y, c]: [number, number]): Array<[number, number, number]> => {
    const a = POST;
    const b = POST - c;
    return [
      [b, y, a], [a, y, b], [a, y, -b], [b, y, -a],
      [-b, y, -a], [-a, y, -b], [-a, y, b], [-b, y, a],
    ];
  };
  const pos: number[] = [];
  for (let k = 0; k + 1 < rings.length; k++) {
    const lo = ring(rings[k]);
    const hi = ring(rings[k + 1]);
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      pos.push(...lo[i], ...lo[j], ...hi[j], ...lo[i], ...hi[j], ...hi[i]);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

function strokeGeometry(r: () => number, length: number, width: number): BufferGeometry {
  const BANDS = 6;
  const STEPS = 12;
  const pos: number[] = [];
  const bow = (r() - 0.5) * 0.014;
  const phase = r() * 6;
  const centre = (t: number): number => bow * Math.sin(Math.PI * t) + 0.003 * Math.sin(t * 8 + phase);
  const spread = (t: number): number => width * (0.9 + 0.14 * Math.sin(t * 5 + phase * 2));
  const quad = (a: Point, b: Point, c: Point, d: Point): void => {
    pos.push(a[0], a[1], 0, b[0], b[1], 0, c[0], c[1], 0, a[0], a[1], 0, c[0], c[1], 0, d[0], d[1], 0);
  };

  for (let k = 0; k < BANDS; k++) {
    const middle = 1 - Math.abs((k + 0.5) / BANDS - 0.5) * 2;
    const start = r() * 0.025;
    const end = 1 - (0.02 + r() * 0.13) * (1.3 - middle);
    const lo = k / BANDS - 0.01;
    const hi = (k + 1) / BANDS + 0.01;
    const mid = (lo + hi) / 2;
    const edges = (i: number): [Point, Point] => {
      const t = start + ((end - start) * i) / STEPS;
      const full = Math.max(0, Math.min(1, (t - start) / 0.012, (end - t) / 0.09));
      const w = spread(t);
      const y = centre(t);
      return [
        [t * length, y + (mid + (lo - mid) * full - 0.5) * w],
        [t * length, y + (mid + (hi - mid) * full - 0.5) * w],
      ];
    };
    let prev = edges(0);
    for (let i = 1; i <= STEPS; i++) {
      const next = edges(i);
      quad(prev[0], next[0], next[1], prev[1]);
      prev = next;
    }
  }

  const runs = 1 + Math.floor(r() * 2);
  for (let k = 0; k < runs; k++) {
    const t = 0.15 + r() * 0.6;
    const x = t * length;
    const top = centre(t) - spread(t) * 0.3;
    const drop = 0.025 + r() * 0.05;
    const w = 0.0035;
    quad([x - w, top], [x - w * 0.7, top - drop], [x + w * 0.7, top - drop], [x + w, top]);
    const bead = 0.0055;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = ((i + 1) / 8) * Math.PI * 2;
      pos.push(
        x, top - drop, 0,
        x + Math.cos(a) * bead, top - drop + Math.sin(a) * bead * 1.3, 0,
        x + Math.cos(b) * bead, top - drop + Math.sin(b) * bead * 1.3, 0,
      );
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

function boltGeometry(): BufferGeometry {
  const g = new SphereGeometry(0.017, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, 0.6, 1);
  g.rotateX(Math.PI / 2);
  return g;
}

function tinGeometry(radius: number, height: number, open: boolean): BufferGeometry {
  const r = radius;
  const profile: Point[] = [
    [0.001, 0],
    [r, 0],
    [r, height * 0.04],
    [r - 0.003, height * 0.07],
    [r - 0.003, height * 0.9],
    [r, height * 0.93],
    [r + 0.004, height * 0.97],
    [r + 0.002, height],
  ];
  if (open) {
    profile.push([r - 0.012, height], [r - 0.012, height * 0.72], [0.001, height * 0.72]);
  } else {
    profile.push(
      [r - 0.01, height + 0.004],
      [r - 0.014, height - 0.005],
      [r - 0.03, height - 0.005],
      [r - 0.034, height + 0.002],
      [0.001, height + 0.002],
    );
  }
  return lathe(profile, 28);
}

export function buildSignpost(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): HyperObject {
  const object = new HyperObject(at);
  object.rotation.y = yaw;
  const r = seeded(0x51627);
  const add = (g: BufferGeometry, opts: HyperMaterialOptions) =>
    object.addGeometry(world.shared, g, opts);

  const blankY = FIRST_AT_Y + PLATES.length * SPACING + 0.04;
  const postH = blankY + 0.4;
  add(grained(postGeometry(postH), 'y'), OAK);

  const collar = new RoundedBoxGeometry(POST * 2 + 0.03, 0.022, POST * 2 + 0.03, 2, 0.006);
  collar.translate(0, postH - 0.07, 0);
  add(grained(collar, 'x'), OAK);
  const cap = new RoundedBoxGeometry(POST * 2 + 0.06, 0.032, POST * 2 + 0.06, 2, 0.009);
  cap.translate(0, postH + 0.016, 0);
  add(grained(cap, 'x'), OAK);
  const finial = lathe(
    [
      [0.04, 0],
      [0.058, 0.018],
      [0.034, 0.042],
      [0.034, 0.058],
      [0.07, 0.11],
      [0.074, 0.15],
      [0.058, 0.2],
      [0.024, 0.235],
      [0.001, 0.24],
    ],
    20,
  );
  finial.translate(0, postH + 0.032, 0);
  add(grained(finial, 'y'), OAK);

  const finger = fingerGeometry();
  const bolt = boltGeometry();
  const from = 0.09;
  const to = FINGER_L - HEEL - TIP - 0.02;
  const span = to - from;

  PLATES.forEach((title, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const y = FIRST_AT_Y + i * SPACING;
    const turn = side * 0.05 + (r() - 0.5) * 0.04;
    const sag = -side * (0.012 + r() * 0.02);
    const mount = (g: BufferGeometry, z: number): BufferGeometry => {
      g.rotateZ(sag);
      g.translate(0, y, z);
      g.rotateY(turn);
      return g;
    };
    const flipped = (g: BufferGeometry): BufferGeometry => (side < 0 ? g.rotateY(Math.PI) : g);

    add(mount(flipped(finger.board.clone()), POST + FINGER_T / 2), {
      color: ENAMEL[i % ENAMEL.length],
      ambient: 0.84,
      gloss: 0.3,
      grain: 0.07,
    });
    add(mount(flipped(finger.rim.clone()), POST + FINGER_T / 2), RIM);
    for (const dy of [-0.06, 0.06]) {
      const head = bolt.clone();
      head.translate(0, dy, 0);
      add(mount(head, FACE), BOLT);
    }

    // Slid across, never turned over: a rotated plane shows its lettering mirrored.
    const shift = side < 0 ? -(from + to) : 0;

    const face = new PlaneGeometry(span, span * (TEXT_PX[1] / TEXT_PX[0]), 6, 2);
    face.translate((from + to) / 2 + shift, 0, 0);
    add(mount(face, FACE + 0.004), {
      map: makeLocalizedTextTexture(title, {
        width: TEXT_PX[0],
        height: TEXT_PX[1],
        padding: 38,
        font: '700 SIZEpx ui-monospace, Consolas, monospace',
        color: '#22272d',
        letterSpacing: 3,
      }),
      color: 0xffffff,
      ambient: 0.9,
      alphaTest: 0.3,
      alphaBlend: true,
      castShadow: false,
      receiveShadow: false,
    });

    const strike = strokeGeometry(r, span * 0.98, 0.033 + r() * 0.008);
    strike.rotateZ((r() - 0.5) * 0.07);
    strike.translate(from + span * 0.01 + shift, (r() - 0.5) * 0.014, 0);
    add(mount(strike, FACE + 0.007), {
      color: RED,
      ambient: 0.7,
      gloss: 0.7,
      castShadow: false,
      receiveShadow: false,
    });
  });

  const scale = 1.12;
  const blank = finger.board.clone().scale(scale, scale, 1);
  blank.translate(0, blankY, POST + FINGER_T / 2);
  add(blank, { color: WHITE, ambient: 0.84, gloss: 0.85, grain: 0.02 });
  const blankRim = finger.rim.clone().scale(scale, scale, 1);
  blankRim.translate(0, blankY, POST + FINGER_T / 2);
  add(blankRim, RIM);
  for (const dy of [-0.07, 0.07]) {
    const head = bolt.clone();
    head.translate(0, blankY + dy, FACE);
    add(head, BOLT);
  }

  for (const [count, radius] of [[9, 0.21], [14, 0.36]] as Array<[number, number]>) {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + r() * 0.3;
      const size = 0.058 + r() * 0.032;
      const rough = new IcosahedronGeometry(size, 2);
      rough.deleteAttribute('normal');
      rough.deleteAttribute('uv');
      const cobble = mergeVertices(rough, 1e-6);
      const lump = [r() * 6, r() * 6, r() * 6];
      const p = cobble.attributes.position;
      for (let v = 0; v < p.count; v++) {
        const x = p.getX(v);
        const y = p.getY(v);
        const z = p.getZ(v);
        const k =
          1 +
          0.1 * Math.sin((x / size) * 2.3 + lump[0]) * Math.sin((z / size) * 2.1 + lump[1]) +
          0.07 * Math.sin((y / size) * 3.1 + lump[2]);
        p.setXYZ(v, x * k, y * k, z * k);
      }
      cobble.computeVertexNormals();
      cobble.scale(1, 0.46, 0.75 + r() * 0.35);
      cobble.rotateY(r() * Math.PI);
      cobble.translate(Math.cos(a) * radius, size * 0.12, Math.sin(a) * radius);
      const tone = 0x8c + Math.floor(r() * 0x34);
      add(cobble, {
        color: (tone << 16) | ((tone - 4) << 8) | (tone - 12),
        ambient: 0.62,
        gloss: 0.08,
      });
    }
  }

  const redAt: Point = [0.56, 0.34];
  const redH = 0.13;
  const redTin = tinGeometry(0.105, redH, true);
  redTin.translate(redAt[0], 0, redAt[1]);
  add(redTin, STEEL);
  const redPaint = new CylinderGeometry(0.094, 0.094, 0.004, 24);
  redPaint.translate(redAt[0], redH * 0.72 + 0.002, redAt[1]);
  add(redPaint, { color: RED, ambient: 0.7, gloss: 0.9 });
  const band = new CylinderGeometry(0.1035, 0.1035, 0.066, 28, 1, true);
  band.translate(redAt[0], 0.064, redAt[1]);
  add(band, PAPER);
  for (const [angle, drop] of [[0.5, 0.075], [0.95, 0.045], [2.6, 0.06]]) {
    const run = new CylinderGeometry(0.007, 0.0045, drop, 6);
    run.translate(
      redAt[0] + Math.cos(angle) * 0.106,
      redH - drop / 2,
      redAt[1] + Math.sin(angle) * 0.106,
    );
    add(run, { color: RED, ambient: 0.7, gloss: 0.85 });
  }
  const bail = new TorusGeometry(0.109, 0.0035, 5, 22, Math.PI);
  bail.rotateX(-Math.PI * 0.62);
  bail.translate(redAt[0], redH * 0.8, redAt[1]);
  add(bail, BOLT);

  const whiteAt: Point = [0.34, 0.5];
  const whiteH = 0.105;
  const whiteTin = tinGeometry(0.085, whiteH, false);
  whiteTin.translate(whiteAt[0], 0, whiteAt[1]);
  add(whiteTin, STEEL);
  const whiteBand = new CylinderGeometry(0.0835, 0.0835, 0.054, 28, 1, true);
  whiteBand.translate(whiteAt[0], 0.052, whiteAt[1]);
  add(whiteBand, PAPER);
  for (const [angle, drop] of [[1.1, 0.06], [1.5, 0.035]]) {
    const run = new CylinderGeometry(0.006, 0.004, drop, 6);
    run.translate(
      whiteAt[0] + Math.cos(angle) * 0.086,
      whiteH - drop / 2,
      whiteAt[1] + Math.sin(angle) * 0.086,
    );
    add(run, { color: WHITE, ambient: 0.8, gloss: 0.85 });
  }

  const brush: Array<[BufferGeometry, HyperMaterialOptions]> = [];
  const handle = lathe(
    [
      [0.001, 0],
      [0.011, 0.004],
      [0.013, 0.05],
      [0.009, 0.11],
      [0.012, 0.15],
    ],
    10,
  );
  brush.push([grained(handle, 'y'), { color: 0xf0c98c, ambient: 0.62, gloss: 0.45, grain: 0.14 }]);
  const ferrule = new RoundedBoxGeometry(0.05, 0.03, 0.014, 2, 0.003);
  ferrule.translate(0, 0.165, 0);
  brush.push([ferrule, STEEL]);
  const bristles = new RoundedBoxGeometry(0.048, 0.05, 0.012, 2, 0.004);
  bristles.translate(0, 0.205, 0);
  brush.push([bristles, { color: 0x8a7a66, ambient: 0.6, gloss: 0.08 }]);
  const loaded = new RoundedBoxGeometry(0.05, 0.022, 0.014, 2, 0.005);
  loaded.translate(0, 0.222, 0);
  brush.push([loaded, { color: RED, ambient: 0.7, gloss: 0.85 }]);
  for (const [g, opts] of brush) {
    g.translate(0, -0.14, 0);
    g.rotateX(Math.PI / 2);
    g.rotateY(0.7);
    g.translate(redAt[0], redH + 0.016, redAt[1]);
    add(g, opts);
  }

  world.add(object);
  return object;
}
