import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Path,
  PlaneGeometry,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type Mesh,
} from 'three';
import {
  HM,
  HyperObject,
  poincareToUnit,
  type GyroVector,
  type HyperMaterialOptions,
  type HyperWorld,
} from '../../engine';
import { box, grained, lathe, merge, moved, pos, roundedRect, trace, type Part, type Point } from '../geometry';
import { CHAIN_REST, LINK_PITCH, RING_SPAN, makeChain, walk } from './chain';
import { BOWL_NAME, NAME_BOARD, SIGN_FACE, intoRegion, kennelAtlas } from './kennelArt';
import { safe } from './vault';

const EARTH = 0.028;

const KENNEL_X = -0.3;
const KENNEL_Z = -0.2;
const KENNEL_TURN = 0.12;

const ROOF_PITCH = (38 * Math.PI) / 180;
const TAN = Math.tan(ROOF_PITCH);
const COS = Math.cos(ROOF_PITCH);
const SIN = Math.sin(ROOF_PITCH);

const W = 1.2;
const D = 1.1;
const FRONT = D / 2;
const FLOOR = 0.15;
const ROW = 0.137;
const WALL = ROW * 6;
const RIDGE = WALL + (W / 2) * TAN;
const BOARD_T = 0.022;
const BACK_T = 0.018;
const EAVE = 0.11;
const VERGE = 0.12;
const DECK_T = 0.022;

const DOOR_R = 0.26;
const DOOR_STRAIGHT = 0.5;
const SILL = 0.03;
const SILL_FRONT = FRONT + 0.045;
const SILL_DEPTH = 0.13;

const STAKE_X = 0.3;
const STAKE_Z = FRONT + 1.12;
const EYE_BOLT_Y = 0.17;
const EYE_BOLT_REACH = 0.087;
const FAN_R = 1.02;
const FAN_HALF = 0.9;
const FAN_TOP = 0.004;

const CURTAIN = FRONT - 0.6;
const DARK_FROM = FRONT - 0.06;
const DARK_BY = FRONT - 0.46;
// Grass grows up through the kennel: the dark has to start above the tallest blade or it shows against the black.
const DARK_FLOOR = 0.1;

const WALL_PAINT = [0xd0705a, 0xc8664f, 0xd87c66];
const BOARDS: HyperMaterialOptions = { ambient: 0.6, gloss: 0.12, grain: 0.16 };
const CREAM: HyperMaterialOptions = { color: 0xf3ecd9, ambient: 0.64, gloss: 0.18, grain: 0.06 };
const FELT = [0x8fa196, 0x849789, 0x9aaa9c];
const ZINC: HyperMaterialOptions = { color: 0xc6cdd2, ambient: 0.6, gloss: 0.45, metal: 0.6 };
const TIMBER: HyperMaterialOptions = { color: 0xc8b28e, ambient: 0.58, gloss: 0.06, grain: 0.24 };
const RUNNER: HyperMaterialOptions = { color: 0x8a735d, ambient: 0.55, gloss: 0.06, grain: 0.3 };
const BACKING: HyperMaterialOptions = { color: 0x57483d, ambient: 0.5, gloss: 0.02 };
const BLACK: HyperMaterialOptions = { color: 0x000000, ambient: 0, gloss: 0.01 };
const NAIL: HyperMaterialOptions = { color: 0x5a5551, ambient: 0.55, gloss: 0.3, metal: 0.5 };
const IRON: HyperMaterialOptions = { color: 0x8d857d, ambient: 0.55, gloss: 0.3, metal: 0.55 };
const WALNUT: HyperMaterialOptions = { color: 0xa87c54, ambient: 0.55, gloss: 0.16, grain: 0.26 };
const BRASS: HyperMaterialOptions = { color: 0xe9cb7a, ambient: 0.58, gloss: 0.6, metal: 0.9 };
const SOIL: HyperMaterialOptions = { color: 0xb89f7c, ambient: 0.62, gloss: 0.02, grain: 0.16 };
const WORN: HyperMaterialOptions = { color: 0xd6c4a0, ambient: 0.64, gloss: 0.03, grain: 0.1 };
const SCRAPE: HyperMaterialOptions = { color: 0xa58d6b, ambient: 0.6, gloss: 0.02 };
const PRINT: HyperMaterialOptions = { color: 0x87724f, ambient: 0.58, gloss: 0.02 };
const POST: HyperMaterialOptions = { color: 0xb9a78d, ambient: 0.58, gloss: 0.05, grain: 0.3 };
const ENAMEL: HyperMaterialOptions = { color: 0xf5f2e9, ambient: 0.64, gloss: 0.6 };
const NAVY: HyperMaterialOptions = { color: 0x4a60a0, ambient: 0.58, gloss: 0.55 };
const BONE: HyperMaterialOptions = { color: 0xf3ead4, ambient: 0.64, gloss: 0.2 };
const PLATE: HyperMaterialOptions = { color: 0xc9ced2, ambient: 0.6, gloss: 0.4, metal: 0.6 };
const CHAIN: HyperMaterialOptions = { color: 0xc8cdd1, ambient: 0.58, gloss: 0.5, metal: 0.75 };
const DECAL: HyperMaterialOptions = { color: 0xffffff, ambient: 0.92, castShadow: false, receiveShadow: false };
const CUTOUT: HyperMaterialOptions = { ...DECAL, alphaTest: 0.3, alphaBlend: true };

function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function speckled(geometry: BufferGeometry, scale: number): BufferGeometry {
  const position = geometry.attributes.position;
  const out = new Float32Array(position.count * 3);
  for (let i = 0; i < out.length; i++) out[i] = (position.array[i] as number) * scale;
  geometry.setAttribute('grain', new BufferAttribute(out, 3));
  return geometry;
}

function plank(outline: Point[], thick: number, ease = 0.003): BufferGeometry {
  if (ease === 0) return new ExtrudeGeometry(trace(new Shape(), outline), { depth: thick, bevelEnabled: false });
  const g = new ExtrudeGeometry(trace(new Shape(), outline), {
    depth: thick - 2 * ease,
    bevelEnabled: true,
    bevelThickness: ease,
    bevelSize: ease,
    bevelOffset: -ease,
    bevelSegments: 1,
  });
  return g.translate(0, 0, ease);
}

function gableHalf(y: number): number {
  return y <= WALL ? W / 2 : Math.max(0, (RIDGE - y) / TAN);
}

function doorHalf(y: number): number {
  if (y <= DOOR_STRAIGHT) return DOOR_R;
  const up = y - DOOR_STRAIGHT;
  return up < DOOR_R ? Math.sqrt(DOOR_R * DOOR_R - up * up) : 0;
}

function sillTop(x: number): number {
  return FLOOR + SILL - 0.008 * Math.exp(-((x / 0.13) ** 2));
}

function gableRow(y0: number, y1: number, door: boolean): Point[][] {
  const edge = (sx: number): Point[] => {
    const pts: Point[] = [[sx * gableHalf(y0), y0]];
    if (y0 < WALL && y1 > WALL) pts.push([sx * (W / 2), WALL]);
    pts.push([sx * gableHalf(y1), y1]);
    return pts;
  };
  const right = edge(1);
  const left = edge(-1).reverse();
  const a0 = door ? doorHalf(y0) : 0;
  if (a0 === 0) return [[...right, ...left]];

  const a1 = doorHalf(y1);
  if (a1 > 0) {
    const jamb = (sx: number): Point[] => {
      const pts: Point[] = [];
      for (let k = 0; k <= 4; k++) {
        const y = y1 + ((y0 - y1) * k) / 4;
        pts.push([sx * doorHalf(y), y]);
      }
      return pts;
    };
    return [
      [...right, ...jamb(1)],
      [...jamb(-1).reverse(), ...left],
    ];
  }

  const from = y0 < DOOR_STRAIGHT ? 0 : Math.asin((y0 - DOOR_STRAIGHT) / DOOR_R);
  const arch: Point[] = [[-a0, y0]];
  for (let k = y0 < DOOR_STRAIGHT ? 0 : 1; k <= (y0 < DOOR_STRAIGHT ? 12 : 11); k++) {
    const a = Math.PI - from - ((Math.PI - 2 * from) * k) / 12;
    arch.push([Math.cos(a) * DOOR_R, DOOR_STRAIGHT + Math.sin(a) * DOOR_R]);
  }
  arch.push([a0, y0]);
  return [[...right, ...left, ...arch]];
}

function archBand(inner: number, outer: number, bottom: number): Point[] {
  const pts: Point[] = [[-(DOOR_R + outer), bottom]];
  for (let k = 0; k <= 14; k++) {
    const a = Math.PI - (k / 14) * Math.PI;
    pts.push([Math.cos(a) * (DOOR_R + outer), DOOR_STRAIGHT + Math.sin(a) * (DOOR_R + outer)]);
  }
  pts.push([DOOR_R + outer, bottom], [DOOR_R + inner, bottom]);
  for (let k = 0; k <= 14; k++) {
    const a = (k / 14) * Math.PI;
    pts.push([Math.cos(a) * (DOOR_R + inner), DOOR_STRAIGHT + Math.sin(a) * (DOOR_R + inner)]);
  }
  pts.push([-(DOOR_R + inner), bottom]);
  return pts;
}

function nailHead(): BufferGeometry {
  return new CylinderGeometry(0, 0.006, 0.004, 6, 1, true);
}

function walls(): Part[] {
  const parts: Part[] = [];
  const r = random(7);
  const byTint: BufferGeometry[][] = WALL_PAINT.map(() => []);
  const sideTint: BufferGeometry[][] = WALL_PAINT.map(() => []);
  const nails: BufferGeometry[] = [];
  const pick = (): number => Math.floor(r() * WALL_PAINT.length);

  for (let row = 0; row * ROW < RIDGE - 0.03; row++) {
    const y0 = row * ROW + 0.002;
    const y1 = Math.min((row + 1) * ROW - 0.002, RIDGE - 0.006);
    const mid = (y0 + y1) / 2;
    for (const outline of gableRow(y0, y1, true)) {
      byTint[pick()].push(plank(outline, BOARD_T).translate(0, FLOOR, FRONT - BOARD_T));
    }
    for (const outline of gableRow(y0, y1, false)) {
      byTint[pick()].push(plank(outline, BOARD_T, 0).translate(0, FLOOR, FRONT - BOARD_T).rotateY(Math.PI));
    }

    const half = gableHalf(mid);
    const studs: Array<[number, number]> = [];
    if (half > 0.22) {
      for (const sx of [-1, 1]) {
        studs.push([sx * (half - 0.1), 1], [sx * (half - 0.1), -1]);
        const beside = doorHalf(mid) + 0.1;
        if (doorHalf(mid) > 0 && beside < half - 0.2) studs.push([sx * beside, 1]);
      }
    }
    if (half > 0.06) studs.push([0, -1]);
    if (doorHalf(y0) === 0 && half > 0.06) studs.push([0, 1]);
    for (const [x, face] of studs) {
      for (const dy of half > 0.12 ? [-0.034, 0.034] : [0]) {
        nails.push(pos(nailHead().rotateX((face * Math.PI) / 2), x, FLOOR + mid + dy, face * (FRONT + 0.002)));
      }
    }
  }

  for (const sx of [-1, 1]) {
    for (let row = 0; row < 6; row++) {
      const y = FLOOR + (row + 0.5) * ROW;
      sideTint[pick()].push(pos(new BoxGeometry(BOARD_T, ROW - 0.004, D - 0.004), sx * (W / 2 - BOARD_T / 2), y, 0));
      for (const z of [-(FRONT - 0.11), 0, FRONT - 0.11]) {
        for (const dy of [-0.034, 0.034]) {
          nails.push(pos(nailHead().rotateZ((-sx * Math.PI) / 2), sx * (W / 2 + 0.002), y + dy, z));
        }
      }
    }
    parts.push([
      pos(new BoxGeometry(BACK_T, WALL - 0.004, D - 0.06), sx * (W / 2 - BOARD_T - BACK_T / 2), FLOOR + WALL / 2, 0),
      BACKING,
    ]);
    for (const sz of [-1, 1]) {
      parts.push([
        grained(pos(new BoxGeometry(0.07, WALL - 0.02, 0.07), sx * (W / 2 - 0.023), FLOOR + (WALL - 0.02) / 2, sz * (FRONT - 0.023)), 'y'),
        CREAM,
      ]);
    }
  }

  WALL_PAINT.forEach((color, i) => {
    if (byTint[i].length) parts.push([grained(merge(byTint[i]), 'x'), { ...BOARDS, color }]);
    if (sideTint[i].length) parts.push([grained(merge(sideTint[i]), 'z'), { ...BOARDS, color }]);
  });
  parts.push([merge(nails), NAIL]);

  const gable: Point[] = [
    [-(W / 2 - 0.008), 0],
    [W / 2 - 0.008, 0],
    [W / 2 - 0.008, WALL],
    [0, RIDGE - 0.012],
    [-(W / 2 - 0.008), WALL],
  ];
  const holed = trace(new Shape(), gable);
  const hole = new Path();
  hole.moveTo(-DOOR_R, 0.004);
  hole.lineTo(-DOOR_R, DOOR_STRAIGHT);
  hole.absarc(0, DOOR_STRAIGHT, DOOR_R, Math.PI, 0, true);
  hole.lineTo(DOOR_R, 0.004);
  hole.closePath();
  holed.holes.push(hole);
  const sheet = { depth: BACK_T, bevelEnabled: false, curveSegments: 14 };
  parts.push([new ExtrudeGeometry(holed, sheet).translate(0, FLOOR, FRONT - BOARD_T - BACK_T), BACKING]);
  parts.push([
    new ExtrudeGeometry(trace(new Shape(), gable), sheet).translate(0, FLOOR, FRONT - BOARD_T - BACK_T).rotateY(Math.PI),
    BACKING,
  ]);

  return parts;
}

function doorway(): Part[] {
  const parts: Part[] = [];
  parts.push([plank(archBand(-0.012, 0.055, SILL), 0.014).translate(0, FLOOR, FRONT), CREAM]);
  parts.push([
    new ExtrudeGeometry(trace(new Shape(), archBand(-0.012, 0.002, SILL)), { depth: 0.042, bevelEnabled: false }).translate(
      0,
      FLOOR,
      FRONT - 0.04,
    ),
    CREAM,
  ]);

  const HALF = DOOR_R + 0.055;
  const profile: Point[] = [[-HALF, 0], [HALF, 0], [HALF, SILL]];
  for (let k = 0; k <= 12; k++) {
    const x = 0.26 - (k / 12) * 0.52;
    profile.push([x, sillTop(x) - FLOOR]);
  }
  profile.push([-HALF, SILL]);
  const sill = new ExtrudeGeometry(trace(new Shape(), profile), {
    depth: SILL_DEPTH - 0.008,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelOffset: -0.004,
    bevelSegments: 1,
  }).translate(0, FLOOR, SILL_FRONT - SILL_DEPTH + 0.004);
  const at = sill.attributes.position;
  const wear = new Float32Array(at.count * 3);
  for (let i = 0; i < at.count; i++) {
    const bare = Math.exp(-((at.getX(i) / 0.17) ** 2));
    wear[i * 3] = 1 - 0.2 * bare;
    wear[i * 3 + 1] = 1 - 0.33 * bare;
    wear[i * 3 + 2] = 1 - 0.5 * bare;
  }
  sill.setAttribute('color', new BufferAttribute(wear, 3));
  parts.push([grained(sill, 'x'), CREAM]);

  parts.push([grained(pos(box(0.46, 0.105, 0.018, 0.006), 0, FLOOR + 0.9, FRONT + 0.009), 'x'), WALNUT]);
  const screws: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    screws.push(pos(new SphereGeometry(0.008, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), sx * 0.212, FLOOR + 0.9, FRONT + 0.018));
  }
  parts.push([merge(screws), BRASS]);

  return parts;
}

function roof(): Part[] {
  const parts: Part[] = [];
  const r = random(23);
  const SLOPE = (W / 2 + EAVE) / COS;
  const LONG = D + 2 * VERGE;
  const TAB = 0.165;
  const EXPOSED = 0.115;
  const T = 0.007;
  const tilt = Math.atan(T / TAB);
  const felt: BufferGeometry[][] = FELT.map(() => []);
  const ply: BufferGeometry[] = [];
  const underlay: BufferGeometry[] = [];
  const zinc: BufferGeometry[] = [];

  for (const side of [-1, 1]) {
    const onSlope = (g: BufferGeometry, s: number, n: number, z: number, lean = 0): BufferGeometry => {
      if (lean) g.rotateZ(side * lean);
      return g.translate(side * s, n, z).rotateZ(-side * ROOF_PITCH).translate(0, FLOOR + RIDGE, 0);
    };

    ply.push(onSlope(new BoxGeometry(SLOPE, DECK_T, LONG), SLOPE / 2, DECK_T / 2, 0));
    felt[0].push(onSlope(new BoxGeometry(0.06, T, LONG + 0.028), SLOPE + 0.014 - 0.03, DECK_T + T / 2, 0));
    underlay.push(onSlope(new BoxGeometry(SLOPE - 0.01, 0.003, LONG - 0.01), SLOPE / 2, DECK_T + 0.0015, 0));

    const span = LONG + 0.028;
    const pitch = span / 8;
    for (let course = 0; ; course++) {
      const low = SLOPE + 0.014 - course * EXPOSED;
      if (low < 0.05) break;
      const high = Math.max(0.004, low - TAB);
      const edges: number[] = [];
      if (course % 2) {
        edges.push(0);
        for (let i = 0; i < 8; i++) edges.push((i + 0.5) * pitch);
        edges.push(span);
      } else {
        for (let i = 0; i <= 8; i++) edges.push(i * pitch);
      }
      for (let i = 0; i + 1 < edges.length; i++) {
        const wide = edges[i + 1] - edges[i] - 0.005;
        const tab = new BoxGeometry(low - high, T, wide);
        felt[Math.floor(r() * FELT.length)].push(
          onSlope(tab, (low + high) / 2, DECK_T + T, -span / 2 + (edges[i] + edges[i + 1]) / 2, tilt),
        );
      }
    }

    for (let z = -LONG / 2 + 0.07; z < LONG / 2; z += 0.26) {
      const head = new CylinderGeometry(0, 0.008, 0.005, 6, 1, true);
      zinc.push(onSlope(head, 0.105, DECK_T + 0.012 + 0.0085, z));
    }
  }

  FELT.forEach((color, i) => parts.push([merge(felt[i]), { color, ambient: 0.62, gloss: 0.04, grain: 0.1 }]));
  parts.push([merge(underlay), { color: 0x5d6a62, ambient: 0.55, gloss: 0.02 }]);
  parts.push([grained(merge(ply), 'z'), TIMBER]);
  parts.push([grained(pos(new BoxGeometry(0.03, 0.06, LONG - 0.012), 0, FLOOR + RIDGE + 0.012, 0), 'z'), CREAM]);

  const FLANGE = 0.14;
  const apex = RIDGE + (DECK_T + 0.012) / COS + 0.0076;
  const cap: Point[] = [
    [-FLANGE * COS, -FLANGE * SIN],
    [0, 0],
    [FLANGE * COS, -FLANGE * SIN],
    [FLANGE * COS, -FLANGE * SIN - 0.0076],
    [0, -0.0076],
    [-FLANGE * COS, -FLANGE * SIN - 0.0076],
  ];
  zinc.push(
    new ExtrudeGeometry(trace(new Shape(), cap), { depth: LONG + 0.04, bevelEnabled: false }).translate(
      0,
      FLOOR + apex,
      -(LONG + 0.04) / 2,
    ),
  );
  zinc.push(pos(new CylinderGeometry(0.014, 0.014, LONG + 0.04, 8).rotateX(Math.PI / 2), 0, FLOOR + apex + 0.003, 0));
  parts.push([merge(zinc), ZINC]);

  const reach = W / 2 + EAVE - 0.01;
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const barge: Point[] = [
        [0, RIDGE],
        [sx * reach, RIDGE - reach * TAN],
        [sx * reach, RIDGE - reach * TAN - 0.08],
        [0, RIDGE - 0.08],
      ];
      const board = plank(barge, 0.02).translate(0, FLOOR, -0.01);
      parts.push([grained(board.translate(0, 0, sz * (FRONT + VERGE - 0.014)), 'x'), CREAM]);
    }
  }

  return parts;
}

function vent(): Part[] {
  const y = FLOOR + 1.0;
  const z = -(FRONT + 0.002);
  const slats: BufferGeometry[] = [new TorusGeometry(0.075, 0.012, 6, 20).translate(0, y, z)];
  for (const dy of [-0.034, 0, 0.034]) {
    const wide = 2 * Math.sqrt(0.07 * 0.07 - dy * dy);
    slats.push(pos(new BoxGeometry(wide, 0.02, 0.006).rotateX(-0.5), 0, y + dy, z - 0.004));
  }
  return [
    [merge(slats), CREAM],
    [pos(new CircleGeometry(0.072, 20).rotateY(Math.PI), 0, y, z - 0.0005), BLACK],
  ];
}

function base(): Part[] {
  const parts: Part[] = [];
  const skid: Point[] = [[-0.66, 0.05], [-0.61, 0], [0.61, 0], [0.66, 0.05], [0.66, 0.1], [-0.66, 0.1]];
  for (const sx of [-1, 1]) {
    const runner = new ExtrudeGeometry(trace(new Shape(), skid), { depth: 0.09, bevelEnabled: false });
    parts.push([grained(pos(runner.translate(0, 0, -0.045).rotateY(-Math.PI / 2), sx * 0.42, 0, 0), 'z'), RUNNER]);
  }
  const boards: BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) boards.push(pos(new BoxGeometry(W + 0.04, 0.05, 0.196), 0, 0.125, -0.5 + i * 0.2));
  parts.push([grained(merge(boards), 'x'), TIMBER]);
  return parts;
}

function liner(): Part[] {
  const X = W / 2 - BOARD_T - BACK_T - 0.004;
  const TOP = 0.84;
  const near = FRONT - 0.042;
  const deep = near - CURTAIN;
  const mid = (near + CURTAIN) / 2;
  return [
    [
      merge([
        pos(new PlaneGeometry(2 * X, TOP), 0, FLOOR + TOP / 2, CURTAIN),
        pos(new PlaneGeometry(2 * X, deep).rotateX(-Math.PI / 2), 0, FLOOR + DARK_FLOOR, mid),
        pos(new PlaneGeometry(2 * X, DARK_FLOOR), 0, FLOOR + DARK_FLOOR / 2, near),
        pos(new PlaneGeometry(2 * X, deep).rotateX(Math.PI / 2), 0, FLOOR + TOP, mid),
        pos(new PlaneGeometry(deep, TOP).rotateY(Math.PI / 2), -X, FLOOR + TOP / 2, mid),
        pos(new PlaneGeometry(deep, TOP).rotateY(-Math.PI / 2), X, FLOOR + TOP / 2, mid),
      ]),
      BLACK,
    ],
  ];
}

const TO_DOOR = new Vector3(0.12 - STAKE_X, 0, FRONT - STAKE_Z).normalize();
const ANCHOR = new Vector3(
  STAKE_X + TO_DOOR.x * EYE_BOLT_REACH,
  EYE_BOLT_Y,
  STAKE_Z + TO_DOOR.z * EYE_BOLT_REACH,
);

function stake(): Part[] {
  const parts: Part[] = [];
  parts.push([grained(pos(box(0.09, 0.28, 0.09, 0.008), 0, 0.11, 0), 'y'), POST]);
  parts.push([grained(pos(new CylinderGeometry(0.04, 0.0636, 0.035, 4).rotateY(Math.PI / 4), 0, 0.2675, 0), 'y'), POST]);
  parts.push([speckled(lathe([[0.125, 0], [0.09, 0.014], [0.046, 0.024]], 14), 26), SOIL]);

  const iron: BufferGeometry[] = [
    pos(new CylinderGeometry(0.009, 0.009, 0.135, 8).rotateX(Math.PI / 2), 0, EYE_BOLT_Y, 0.0045),
    pos(new TorusGeometry(0.022, 0.011, 8, 16).rotateY(Math.PI / 2), 0, EYE_BOLT_Y, EYE_BOLT_REACH),
    pos(new BoxGeometry(0.046, 0.046, 0.005), 0, EYE_BOLT_Y, 0.0475),
    pos(new BoxGeometry(0.046, 0.046, 0.005), 0, EYE_BOLT_Y, -0.0475),
    pos(new CylinderGeometry(0.015, 0.015, 0.012, 6).rotateX(Math.PI / 2), 0, EYE_BOLT_Y, -0.056),
  ];
  parts.push([merge(iron), IRON]);

  return moved(parts, STAKE_X, 0, STAKE_Z, Math.atan2(TO_DOOR.x, TO_DOOR.z));
}

function fanReach(bearing: number): number {
  const off = Math.abs(bearing) / FAN_HALF;
  if (off > 1) return 0.16;
  return FAN_R * (0.96 + 0.04 * Math.cos(5 * bearing + 1)) * (1 - 0.1 * off ** 4);
}

function inFan(x: number, z: number): boolean {
  const dx = x - STAKE_X;
  const dz = z - STAKE_Z;
  const bearing = Math.atan2(dz * TO_DOOR.x - dx * TO_DOOR.z, dx * TO_DOOR.x + dz * TO_DOOR.z);
  return Math.hypot(dx, dz) < fanReach(bearing);
}

function wornGround(): Part[] {
  const parts: Part[] = [];
  const centre = Math.atan2(-TO_DOOR.z, TO_DOOR.x);
  const flat = (g: BufferGeometry, y: number): BufferGeometry => pos(g.rotateX(-Math.PI / 2), STAKE_X, y, STAKE_Z);

  const edge: Array<[number, number]> = [];
  for (let k = 0; k <= 16; k++) {
    const bearing = -FAN_HALF + (k / 16) * 2 * FAN_HALF;
    edge.push([bearing, fanReach(bearing)]);
  }
  edge.push([FAN_HALF + 0.14, 0.5], [FAN_HALF + 0.75, 0.18], [Math.PI, 0.15], [-FAN_HALF - 0.75, 0.18], [-FAN_HALF - 0.14, 0.5]);
  const blob = new CatmullRomCurve3(
    edge.map(([bearing, reach]) => new Vector3(Math.cos(centre + bearing) * reach, Math.sin(centre + bearing) * reach, 0)),
    true,
    'centripetal',
  );
  const worn = new ShapeGeometry(new Shape(blob.getPoints(64).slice(0, -1).map((p) => new Vector2(p.x, p.y))));
  parts.push([speckled(flat(worn, FAN_TOP), 30), WORN]);
  const scrapes: BufferGeometry[] = [];
  for (const [radius, wide, from, to] of [
    [0.3, 0.012, -0.7, 0.55],
    [0.52, 0.016, -0.82, 0.8],
    [0.6, 0.008, -0.3, 0.84],
    [0.78, 0.014, -0.8, 0.6],
    [0.92, 0.01, -0.45, 0.5],
  ]) {
    scrapes.push(flat(new RingGeometry(radius - wide / 2, radius + wide / 2, 24, 1, centre + from, to - from), FAN_TOP + 0.003));
  }
  parts.push([merge(scrapes), SCRAPE]);

  const prints: BufferGeometry[] = [];
  const track: Array<[number, number]> = [[-0.08, 0.74], [-0.17, 0.92], [-0.2, 1.11], [-0.3, 1.28], [-0.33, 1.47]];
  track.forEach(([x, z], i) => {
    const heading = Math.atan2(-0.36, 1) + (i % 2 ? 0.18 : -0.12);
    const y = (inFan(x, z) ? FAN_TOP : 0) + 0.004;
    const pad = new CircleGeometry(0.03, 10).scale(1.15, 0.9, 1);
    const toes: BufferGeometry[] = [pad];
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 2 + (k - 1.5) * 0.52;
      toes.push(new CircleGeometry(0.0125, 8).scale(0.85, 1.2, 1).rotateZ(a - Math.PI / 2).translate(Math.cos(a) * 0.05, Math.sin(a) * 0.045 + 0.004, 0));
    }
    // Drawn toes-up in x and y, so laid flat they point along -z: the extra half turn aims them out of the door.
    prints.push(pos(merge(toes).rotateX(-Math.PI / 2).rotateY(Math.PI + heading), x + (i % 2 ? 0.06 : -0.06), y, z));
  });
  parts.push([merge(prints), PRINT]);

  return parts;
}

function bowl(): { parts: Part[]; name: BufferGeometry } {
  const profile: Point[] = [
    [0.001, 0],
    [0.15, 0],
    [0.152, 0.006],
    [0.1455, 0.016],
    [0.139, 0.026],
    [0.1325, 0.037],
    [0.126, 0.047],
    [0.119, 0.058],
    [0.121, 0.064],
    [0.116, 0.069],
    [0.109, 0.066],
    [0.106, 0.058],
    [0.094, 0.018],
    [0.082, 0.012],
    [0.001, 0.012],
  ];
  const SEGMENTS = 28;
  const dents: Array<[number, number, number, number]> = [
    [2.3, 0.03, 0.016, 0.045],
    [-1.6, 0.064, 0.009, 0.03],
  ];
  const dented = (g: BufferGeometry, skip: (i: number) => boolean): BufferGeometry => {
    const at = g.attributes.position;
    for (let i = 0; i < at.count; i++) {
      if (skip(i)) continue;
      const x = at.getX(i);
      const y = at.getY(i);
      const z = at.getZ(i);
      const radius = Math.hypot(x, z);
      const bearing = Math.atan2(x, z);
      let push = 0;
      for (const [where, high, deep, spread] of dents) {
        const round = Math.atan2(Math.sin(bearing - where), Math.cos(bearing - where)) * radius;
        push += deep * Math.exp(-(round * round + (y - high) ** 2) / (spread * spread));
      }
      at.setXYZ(i, (x * (radius - push)) / radius, y - push * 0.35, (z * (radius - push)) / radius);
    }
    g.computeVertexNormals();
    return g;
  };
  const body = dented(lathe(profile, SEGMENTS), (i) => i % profile.length < 2 || i % profile.length > 11);
  const rim = dented(new TorusGeometry(0.1185, 0.0065, 6, SEGMENTS).rotateX(Math.PI / 2).translate(0, 0.066, 0), () => false);

  const HALF = 0.93;
  const COLS = 14;
  const LOW = 0.014;
  const HIGH = 0.05;
  const lean = (0.152 - 0.119) / (0.058 - 0.006);
  const slope = Math.hypot(1, lean);
  const position: number[] = [];
  const normal: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (let c = 0; c <= COLS; c++) {
    const a = -HALF + (c / COLS) * 2 * HALF;
    for (const [y, v] of [[LOW, 0], [HIGH, 1]]) {
      const radius = 0.152 - (y - 0.006) * lean + 0.003;
      position.push(Math.sin(a) * radius, y, Math.cos(a) * radius);
      normal.push(Math.sin(a) / slope, lean / slope, Math.cos(a) / slope);
      uv.push(c / COLS, v);
    }
    if (c < COLS) index.push(c * 2, c * 2 + 2, c * 2 + 3, c * 2, c * 2 + 3, c * 2 + 1);
  }
  const name = new BufferGeometry();
  name.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  name.setAttribute('normal', new BufferAttribute(new Float32Array(normal), 3));
  name.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  name.setIndex(index);

  return {
    parts: [
      [body, ENAMEL],
      [rim, NAVY],
    ],
    name: intoRegion(name, BOWL_NAME),
  };
}

function bone(): Part[] {
  const shaft = lathe(
    [[0.001, -0.115], [0.02, -0.112], [0.017, -0.06], [0.015, 0], [0.017, 0.06], [0.02, 0.112], [0.001, 0.115]],
    10,
  ).rotateZ(Math.PI / 2);
  const knobs: BufferGeometry[] = [shaft];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) knobs.push(pos(new SphereGeometry(0.03, 10, 6), sx * 0.125, 0, sz * 0.022));
  }
  return [[pos(merge(knobs), 0, 0.03, 0), BONE]];
}

function signPost(): { parts: Part[]; face: BufferGeometry } {
  const parts: Part[] = [];
  const HIGH = 1.3;
  const CENTRE = 1.04;
  const PW = 0.6;
  const PH = 0.44;
  const LEAN = -0.045;
  const FACE_Z = 0.0375 + 0.008;

  parts.push([grained(pos(box(0.075, HIGH + 0.03, 0.075, 0.006), 0, HIGH / 2 - 0.015, 0), 'y'), POST]);
  parts.push([grained(pos(new CylinderGeometry(0, 0.053, 0.03, 4).rotateY(Math.PI / 4), 0, HIGH + 0.015, 0), 'y'), POST]);
  parts.push([speckled(lathe([[0.12, 0], [0.085, 0.014], [0.039, 0.024]], 14), 26), SOIL]);

  const hung = (g: BufferGeometry, z: number): BufferGeometry => g.rotateZ(LEAN).translate(0, CENTRE, z);

  const plate = new ExtrudeGeometry(roundedRect(new Shape(), PW, PH, 0.035), {
    depth: 0.004,
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.002,
    bevelOffset: -0.002,
    bevelSegments: 1,
    curveSegments: 5,
  });
  parts.push([hung(plate, 0.0375 + 0.002), PLATE]);

  const bolts: BufferGeometry[] = [];
  for (const sy of [-1, 1]) {
    bolts.push(
      hung(
        pos(lathe([[0.012, 0], [0.011, 0.003], [0.007, 0.0055], [0.001, 0.0065]], 10).rotateX(Math.PI / 2), 0, sy * 0.182, 0),
        FACE_Z - 0.001,
      ),
    );
  }
  for (const sy of [-1, 1]) {
    const y = Math.cos(LEAN) * sy * 0.182;
    bolts.push(pos(new BoxGeometry(0.03, 0.03, 0.003), 0, CENTRE + y, -0.039));
    bolts.push(pos(new CylinderGeometry(0.011, 0.011, 0.009, 6).rotateX(Math.PI / 2), 0, CENTRE + y, -0.045));
  }
  parts.push([merge(bolts), ZINC]);

  const FW = PW - 0.012;
  const FH = PH - 0.012;
  const face = new ShapeGeometry(roundedRect(new Shape(), FW, FH, 0.03), 5);
  const uv = face.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / FW + 0.5, uv.getY(i) / FH + 0.5);

  return { parts, face: hung(intoRegion(face, SIGN_FACE), FACE_Z + 0.004) };
}

function earth(): Part {
  const rim: Array<[number, number]> = [
    [-1.1, -0.6],
    [-0.95, -1.0],
    [-0.3, -1.1],
    [0.28, -0.96],
    [0.55, -0.45],
    [1.1, 0.2],
    [1.72, 0.58],
    [1.86, 1.05],
    [1.58, 1.46],
    [0.9, 1.53],
    [0.1, 1.55],
    [-0.6, 1.42],
    [-1.03, 0.9],
    [-1.15, 0.1],
  ];
  const curve = new CatmullRomCurve3(rim.map(([x, z]) => new Vector3(x, -z, 0)), true, 'centripetal');
  const outline = new Shape(curve.getPoints(72).slice(0, -1).map((p) => new Vector2(p.x, p.y)));
  const patch = new ExtrudeGeometry(outline, {
    depth: EARTH - 0.012,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.05,
    bevelOffset: -0.05,
    bevelSegments: 2,
  }).rotateX(-Math.PI / 2);
  return [speckled(patch, 26), SOIL];
}

function eyes(): BufferGeometry[] {
  const R = 0.03;
  const out: BufferGeometry[][] = [[], []];
  for (const sx of [-1, 1]) {
    const lid: Point[] = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const x = Math.cos(a) * R;
      lid.push([x, Math.min(Math.sin(a) * R, 0.3 * R + sx * 0.55 * x)]);
    }
    out[0].push(new ShapeGeometry(trace(new Shape(), lid)).translate(sx * 0.058, 0, 0));
    out[1].push(new CircleGeometry(0.011, 10).translate(sx * 0.058, -0.005, 0.002));
  }
  return [merge(out[0]), merge(out[1])];
}

export interface KennelResult {
  object: HyperObject;
  tick: (worldGV: GyroVector, dt: number) => void;
}

const UP = new Vector3(0, 1, 0);
const LINKS = 36;
const SAMPLES = 150;
const NEAR = 2.5;
const RELEASE = 2.9;
const HEAD_X = -0.06;
const HEAD_Z = FRONT - 0.27;
const HEAD_SWAY = 0.42;

export function buildKennel(world: HyperWorld, at: GyroVector, yaw: number): KennelResult {
  const object = new HyperObject(at);
  object.rotation.y = yaw;
  const put = (parts: Part[], node?: Group): void => {
    for (const [g, opts] of parts) object.addGeometry(world.shared, g, opts, node);
  };
  const atlas = kennelAtlas();

  put([earth()]);

  const dish = bowl();
  const BOWL_AT: [number, number, number, number] = [0.86, 0, 0.8, 0.2];
  const nameBoard = pos(intoRegion(new PlaneGeometry(0.4, 0.078, 2, 1), NAME_BOARD), 0, FLOOR + 0.9, FRONT + 0.022);
  const kennel: Part[] = [
    ...base(),
    ...walls(),
    ...doorway(),
    ...roof(),
    ...vent(),
    ...liner(),
    ...stake(),
    ...wornGround(),
    ...moved(dish.parts, ...BOWL_AT),
    ...moved(bone(), -0.64, 0, 0.9, 0.55),
    [nameBoard, { ...CUTOUT, map: atlas }],
    ...moved([[dish.name, { ...CUTOUT, map: atlas }]], ...BOWL_AT),
  ];
  put(moved(kennel, KENNEL_X, EARTH, KENNEL_Z, KENNEL_TURN));

  const sign = signPost();
  put(moved([...sign.parts, [sign.face, { ...DECAL, map: atlas }]], 1.5, EARTH, 1.05, 0.22));

  const strongbox = safe();
  put(moved([...strongbox.parts, [strongbox.gilding, { ...CUTOUT, map: atlas }]], 0.95, 0, -1.08, 0.7));

  const kennelNode = new Group();
  kennelNode.position.set(KENNEL_X, EARTH, KENNEL_Z);
  kennelNode.rotation.y = KENNEL_TURN;
  object.add(kennelNode);

  const headNode = new Group();
  headNode.rotation.order = 'YXZ';
  kennelNode.add(headNode);
  const lids = new Group();
  headNode.add(lids);
  const [iris, pupil] = eyes();
  const glow = { ambient: 1, castShadow: false, receiveShadow: false };
  object.addGeometry(world.shared, iris, { ...glow, color: 0xfff07a }, lids);
  object.addGeometry(world.shared, pupil, { ...glow, color: 0x050505 }, lids);

  const chain = makeChain(LINKS);
  const joints = Array.from({ length: chain.joints }, () => new Vector3());
  const line = new Float32Array(SAMPLES * 3);
  const stow = new Vector3(0.1, FLOOR + 0.06, CURTAIN - 0.2);
  const collar = new Vector3();
  const lying = new Vector3(0.1, FLOOR + CHAIN_REST, FRONT - 0.66);
  const standing = new Vector3(0.08, FLOOR + 0.42, FRONT - 0.74);
  const ground = FAN_TOP + CHAIN_REST;

  const restAt = (x: number, z: number): number => {
    const out = z - SILL_FRONT;
    const onSill = sillTop(x) + CHAIN_REST;
    const drape = Math.min(1, Math.max(0, (0.2 - out) / 0.188));
    let y = ground + (onSill - ground) * drape * drape * (3 - 2 * drape);
    const inside = Math.min(1, Math.max(0, (-SILL_DEPTH - out) / 0.05));
    y += (FLOOR + CHAIN_REST - onSill) * inside * inside * (3 - 2 * inside);
    return y;
  };

  const unit = (t: number): number => Math.min(1, Math.max(0, t));
  const shown = (y: number, z: number): number => {
    const deep = unit((z - DARK_BY) / (DARK_FROM - DARK_BY));
    const indoors = unit((FRONT - z) / 0.04);
    const clear = unit((y - FLOOR - DARK_FLOOR - 0.03) / 0.1);
    return deep * deep * (3 - 2 * deep) * (1 - indoors * (1 - clear));
  };

  const lay = (pull: number, sag: number, target: BufferGeometry): void => {
    collar.lerpVectors(lying, standing, pull);
    const ux = collar.x - ANCHOR.x;
    const uz = collar.z - ANCHOR.z;
    const span = Math.hypot(ux, uz);
    const toSill = (span * (ANCHOR.z - SILL_FRONT)) / (ANCHOR.z - collar.z);
    const slack = (1 - pull) * (1 - pull);
    const reach = span + 0.2;
    for (let i = 0; i < SAMPLES; i++) {
      const along = (i / (SAMPLES - 1)) * reach;
      const f = along / span;
      const g = Math.min(1, along / toSill);
      const wander = 0.2 * slack * Math.sin(Math.PI * g) ** 2 * Math.sin(Math.PI * 2 * 1.1 * g + 0.6);
      const x = ANCHOR.x + (ux * along - uz * wander) / span;
      const z = ANCHOR.z + (uz * along + ux * wander) / span;
      const hung = f < 1 ? ANCHOR.y + (collar.y - ANCHOR.y) * f - sag * 4 * f * (1 - f) : collar.y;
      const rest = restAt(x, z);
      line[i * 3] = x;
      line[i * 3 + 1] = 0.5 * (rest + hung + Math.sqrt((hung - rest) ** 2 + 0.0004));
      line[i * 3 + 2] = z;
    }
    chain.lay(joints, walk(line, SAMPLES, RING_SPAN, LINK_PITCH, joints), stow, target, shown, 1 / CHAIN.ambient!);
  };

  lay(0, 0.92, chain.geometry);
  object.addLiveGeometry(world.shared, chain.geometry, CHAIN, kennelNode);
  const links = (kennelNode.children.find((c) => (c as Mesh).isMesh) as Mesh).geometry;
  const tint = links.attributes.aTint as BufferAttribute;

  world.add(object);

  const viewer = new Vector3();
  let clock = 0;
  let pull = 0;
  let taut = false;
  let laid = 0;
  let trembled = 0;
  let shaded = -1;
  let headYaw = 0;
  let headPitch = 0;
  let headX = HEAD_X;

  const tick = (worldGV: GyroVector, dt: number): void => {
    clock += dt;

    object.localGV.add(worldGV).inverse().point(viewer);
    const far = (2 * Math.atan(viewer.length())) / HM.unitScale;
    let aimYaw = 0;
    let aimPitch = 0;
    let aimX = HEAD_X;
    let near = false;
    const stood = pull * pull * (3 - 2 * pull);
    const headY = FLOOR + 0.2 + 0.44 * stood + 0.006 * Math.sin(clock * 1.7);
    // Unit coordinates go through the gnomonic chart, which turns inside out a quarter of the way round the world.
    if (far < 13) {
      poincareToUnit(viewer, true, viewer).applyAxisAngle(UP, -yaw);
      viewer.set(viewer.x - KENNEL_X, viewer.y - EARTH, viewer.z - KENNEL_Z).applyAxisAngle(UP, -KENNEL_TURN);
      const reach = Math.hypot(viewer.x, viewer.z - FRONT);
      near = reach < (taut ? RELEASE : NEAR);
      if (viewer.z > FRONT + 0.2) {
        const k = (FRONT - HEAD_Z) / (viewer.z - HEAD_Z);
        aimX = Math.max(-HEAD_SWAY, Math.min(HEAD_SWAY, (HEAD_X - viewer.x * k) / (1 - k)));
      }
      const dx = viewer.x - headX;
      const dz = viewer.z - HEAD_Z;
      aimYaw = Math.max(-1.15, Math.min(1.15, Math.atan2(dx, dz)));
      aimPitch = Math.max(-0.5, Math.min(0.3, -Math.atan2(viewer.y - headY, Math.hypot(dx, dz))));
    }
    taut = near;

    pull += ((taut ? 1 : 0) - pull) * (1 - Math.exp(-dt * (taut ? 9 : 1.8)));
    const eased = pull * pull * (3 - 2 * pull);
    const tremble = eased > 0.9 ? 0.004 * Math.sin(clock * 34) * Math.sin(clock * 2.3) ** 2 : 0;
    // The crevice bake multiplies the tint in place when it lands, which would undo the fade into the dark.
    if (Math.abs(eased - laid) > 1e-4 || tremble !== trembled || tint.version !== shaded) {
      laid = eased;
      trembled = tremble;
      lay(eased, 0.9 * (1 - eased) ** 2 + 0.022 + tremble, links);
      shaded = tint.version;
    }

    const turn = 1 - Math.exp(-dt * 5);
    headYaw += (aimYaw - headYaw) * turn;
    headPitch += (aimPitch - headPitch) * turn;
    headX += (aimX - headX) * (1 - Math.exp(-dt * 3));
    headNode.position.set(headX, headY, HEAD_Z);
    headNode.rotation.y = headYaw;
    headNode.rotation.x = headPitch;

    const a = clock % 5.3;
    const b = clock % 7.9;
    const shut = Math.min(Math.abs(a - 0.07), Math.abs(b - 7.8)) / 0.07;
    lids.scale.y = (0.06 + 0.94 * Math.min(1, shut)) * (1 - 0.22 * eased);
  };

  return { object, tick };
}
