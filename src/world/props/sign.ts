import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import { HyperObject, type HyperMaterialOptions, type HyperWorld } from '../../engine';
import type { Station } from '../../content/stations';
import { lathe, merge, rod, trace, type Part, type Point } from '../geometry';
import { facePath, placeAlongPath, units, type Poi } from '../placement';
import { makeSignTexture } from '../text';

const SIGN_LATERAL = 1.5;

const TILT = -0.7;
const FACE_Y = 0.5465;
const FACE_Z = 0.0115;

// 8:3, the aspect of the sign texture: the lettering stretches if these drift apart.
const FACE_W = 1.32;
const FACE_H = FACE_W * (3 / 8);

const RIM = 0.0215;
const PLATE_W = FACE_W + 2 * RIM;
const PLATE_H = FACE_H + 2 * RIM;
const PLATE_R = 0.04;
const PAN_BACK = -0.018;

// The texture keeps 44 px (0.057) clear at its edges; a washer further in than that covers lettering.
const SCREW_IN = 0.03;
const SCREW_X = FACE_W / 2 - SCREW_IN;
const SCREW_Y = FACE_H / 2 - SCREW_IN;

const STRAP_T = 0.008;
const STRAP_BACK = PAN_BACK - STRAP_T;
const RAIL_D = 0.03;
const RAIL_BACK = STRAP_BACK - RAIL_D;
const HEAD_T = 0.008;
const HEAD_BACK = RAIL_BACK - HEAD_T;

const SIN = Math.sin(-TILT);
const COS = Math.cos(-TILT);
const STEM = 0.08;
const STEM_Y = FACE_Y + HEAD_BACK * SIN;
const STEM_Z = FACE_Z + HEAD_BACK * COS;

const STONE_W = 0.82;
const STONE_D = 0.46;
const STONE_TOP = 0.16;
const STONE_Z = STEM_Z;
const FLANGE = 0.2;
const GROUT_T = 0.006;
const FLANGE_T = 0.012;
const FLANGE_TOP = STONE_TOP + GROUT_T + FLANGE_T;
const COLLAR_Y = 0.335;
const COLLAR_H = 0.06;
const COLLAR_T = 0.009;

const STONE: HyperMaterialOptions = { color: 0xd9d2c0, ambient: 0.62, gloss: 0.04 };
const MORTAR: HyperMaterialOptions = { color: 0xa9a59a, ambient: 0.6, gloss: 0.02 };
const STEEL: HyperMaterialOptions = { color: 0xbcc4ca, ambient: 0.62, gloss: 0.42, metal: 0.5 };
const ZINC: HyperMaterialOptions = { color: 0xd6dbdf, ambient: 0.68, gloss: 0.45, metal: 0.45 };
const ENAMEL: HyperMaterialOptions = { color: 0x4a6288, ambient: 0.62, gloss: 0.7 };
const GROUND_COAT: HyperMaterialOptions = { color: 0x9aa2aa, ambient: 0.78, gloss: 0.3 };
const BRASS: HyperMaterialOptions = { color: 0xe9cb7a, ambient: 0.6, gloss: 0.6, metal: 0.9 };
const INK: HyperMaterialOptions = { color: 0x3a342a, ambient: 0.6, gloss: 0.1 };

interface Plan {
  w: number;
  h: number;
  r: number;
  corner: number;
}

interface Loop {
  points: Point[];
  normals: Point[];
}

const MAX_RUN = 0.28;

function loopOf(plan: Plan, inset: number): Loop {
  const { w, h, r, corner } = plan;
  const radius = r - inset;
  const cx = w / 2 - r;
  const cy = h / 2 - r;
  const centres: Point[] = [
    [cx, -cy],
    [cx, cy],
    [-cx, cy],
    [-cx, -cy],
  ];
  const runs = [Math.ceil((h - 2 * r) / MAX_RUN), Math.ceil((w - 2 * r) / MAX_RUN)];
  const points: Point[] = [];
  const normals: Point[] = [];
  for (let k = 0; k < 4; k++) {
    const [ax, ay] = centres[k];
    let dir: Point = [0, 0];
    for (let j = 0; j <= corner; j++) {
      const a = -Math.PI / 2 + (k + j / corner) * (Math.PI / 2);
      dir = [Math.cos(a), Math.sin(a)];
      points.push([ax + radius * dir[0], ay + radius * dir[1]]);
      normals.push(dir);
    }
    const [bx, by] = centres[(k + 1) % 4];
    const n = Math.max(1, runs[k % 2]);
    for (let m = 1; m < n; m++) {
      const t = m / n;
      points.push([ax + (bx - ax) * t + radius * dir[0], ay + (by - ay) * t + radius * dir[1]]);
      normals.push(dir);
    }
  }
  return { points, normals };
}

/**
 * Sweeps a section round a rounded rectangle lying in XY. Each section point
 * is [inset from the plan's edge, z]; walk it so the outside is on the left:
 * up the outer wall, then inward across the top.
 */
function sweep(plan: Plan, section: Point[], hard = false): BufferGeometry {
  const loops = section.map(([inset]) => loopOf(plan, inset));
  const count = loops[0].points.length;
  const slopes = section.slice(1).map(([d, z], i): Point => {
    const dd = d - section[i][0];
    const dz = z - section[i][1];
    const length = Math.hypot(dd, dz) || 1;
    return [dz / length, dd / length];
  });

  const position: number[] = [];
  const normal: number[] = [];
  const index: number[] = [];
  const row = (at: number, [out, up]: Point): number => {
    const first = position.length / 3;
    const { points, normals } = loops[at];
    for (let i = 0; i < count; i++) {
      position.push(points[i][0], points[i][1], section[at][1]);
      normal.push(normals[i][0] * out, normals[i][1] * out, up);
    }
    return first;
  };
  const strip = (a: number, b: number): void => {
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      index.push(a + i, a + j, b + i, a + j, b + j, b + i);
    }
  };

  if (hard) {
    slopes.forEach((slope, i) => strip(row(i, slope), row(i + 1, slope)));
  } else {
    const rows = section.map((_, i) => {
      const before = slopes[i - 1] ?? slopes[i];
      const after = slopes[i] ?? slopes[i - 1];
      const x = before[0] + after[0];
      const y = before[1] + after[1];
      const length = Math.hypot(x, y) || 1;
      return row(i, [x / length, y / length]);
    });
    for (let i = 0; i + 1 < rows.length; i++) strip(rows[i], rows[i + 1]);
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(normal), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array((position.length / 3) * 2), 2));
  g.setIndex(index);
  return g;
}

function cap(plan: Plan, inset: number, z: number, facing: 1 | -1 = 1): BufferGeometry {
  const g = new ShapeGeometry(trace(new Shape(), loopOf(plan, inset).points));
  if (facing < 0) g.rotateY(Math.PI);
  return g.translate(0, 0, z);
}

// Closed at `shown` only: the face at `hidden` has to be buried in whatever the slab is fixed to.
function slab(plan: Plan, hidden: number, shown: number, ease: number): BufferGeometry {
  const section: Point[] =
    shown > hidden
      ? [
          [0, hidden],
          [0, shown - ease],
          [ease, shown],
        ]
      : [
          [ease, shown],
          [0, shown + ease],
          [0, hidden],
        ];
  return merge([sweep(plan, section, true), cap(plan, ease, shown, shown > hidden ? 1 : -1)]);
}

function upright(g: BufferGeometry): BufferGeometry {
  return g.rotateX(-Math.PI / 2);
}

function turned(profile: Point[], segments: number, flat = true): BufferGeometry {
  const source = lathe(profile, segments).toNonIndexed();
  const names = ['position', 'normal', 'uv'] as const;
  const kept: Record<string, number[]> = { position: [], normal: [], uv: [] };
  const at = source.attributes.position;
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let i = 0; i < at.count; i += 3) {
    a.fromBufferAttribute(at, i);
    b.fromBufferAttribute(at, i + 1).sub(a);
    c.fromBufferAttribute(at, i + 2).sub(a);
    if (b.cross(c).lengthSq() < 1e-18) continue;
    for (const name of names) {
      const attribute = source.attributes[name];
      for (let k = i; k < i + 3; k++) {
        for (let n = 0; n < attribute.itemSize; n++) kept[name].push(attribute.getComponent(k, n));
      }
    }
  }
  const g = new BufferGeometry();
  for (const name of names) {
    const size = source.attributes[name].itemSize;
    g.setAttribute(name, new BufferAttribute(new Float32Array(kept[name]), size));
  }
  if (flat) g.computeVertexNormals();
  return g;
}

function hexBolt(across: number, height: number, washer: number, stud = 0): BufferGeometry {
  const nut = across * 0.58;
  const top = 0.003 + height;
  return merge([
    turned(
      [
        [washer, 0],
        [washer, 0.003],
        [nut * 0.9, 0.003],
      ],
      8,
    ),
    turned(
      stud > 0
        ? [
            [nut, 0.003],
            [nut, top],
            [across * 0.27, top],
            [across * 0.27, top + stud],
            [0, top + stud],
          ]
        : [
            [nut, 0.003],
            [nut, top - height * 0.2],
            [nut * 0.8, top],
            [0, top],
          ],
      6,
    ),
  ]);
}

const DIGITS: Point[][][] = [
  [[[0.2, 0], [0.8, 0], [1, 0.25], [1, 1.75], [0.8, 2], [0.2, 2], [0, 1.75], [0, 0.25], [0.2, 0]]],
  [[[0.15, 1.55], [0.6, 2], [0.6, 0]]],
  [[[0, 1.7], [0.25, 2], [0.75, 2], [1, 1.7], [1, 1.25], [0, 0], [1, 0]]],
  [
    [[0, 1.75], [0.25, 2], [0.75, 2], [1, 1.75], [1, 1.3], [0.75, 1.05], [0.35, 1.05]],
    [[0.75, 1.05], [1, 0.8], [1, 0.25], [0.75, 0], [0.25, 0], [0, 0.25]],
  ],
  [[[0.75, 0], [0.75, 2], [0, 0.65], [1, 0.65]]],
  [[[1, 2], [0.1, 2], [0, 1.1], [0.7, 1.15], [1, 0.9], [1, 0.3], [0.75, 0], [0.25, 0], [0, 0.25]]],
  [
    [
      [0.9, 2], [0.45, 2], [0, 1.5], [0, 0.25], [0.25, 0], [0.75, 0], [1, 0.25],
      [1, 0.8], [0.75, 1.05], [0.25, 1.05], [0, 0.8],
    ],
  ],
  [[[0, 2], [1, 2], [0.35, 0]]],
  [
    [
      [0.25, 1.05], [0, 1.3], [0, 1.75], [0.25, 2], [0.75, 2], [1, 1.75], [1, 1.3], [0.75, 1.05],
      [0.25, 1.05], [0, 0.8], [0, 0.25], [0.25, 0], [0.75, 0], [1, 0.25], [1, 0.8], [0.75, 1.05],
    ],
  ],
  [
    [
      [0.1, 0], [0.55, 0], [1, 0.5], [1, 1.75], [0.75, 2], [0.25, 2], [0, 1.75],
      [0, 1.2], [0.25, 0.95], [0.75, 0.95], [1, 1.2],
    ],
  ],
];

function numerals(n: number, cell: number, stroke: number, proud: number): BufferGeometry {
  const text = String(n).padStart(2, '0');
  const pitch = cell * 1.7;
  const bars: BufferGeometry[] = [];
  [...text].forEach((ch, i) => {
    const left = (i - (text.length - 1) / 2) * pitch - cell / 2;
    for (const line of DIGITS[Number(ch)]) {
      for (let k = 0; k + 1 < line.length; k++) {
        const [ax, ay] = line[k];
        const [bx, by] = line[k + 1];
        const length = Math.hypot(bx - ax, by - ay) * cell;
        const bar = new PlaneGeometry(length + stroke, stroke);
        bar.rotateZ(Math.atan2(by - ay, bx - ax));
        bar.translate(left + ((ax + bx) / 2) * cell, ((ay + by) / 2 - 1) * cell, proud);
        bars.push(bar);
      }
    }
  });
  return merge(bars);
}

function footing(): Part[] {
  const stone: Plan = { w: STONE_W, h: STONE_D, r: 0.04, corner: 3 };
  const bed: Plan = { w: STONE_W + 0.1, h: STONE_D + 0.1, r: stone.r + 0.05, corner: 3 };
  const parts: Part[] = [
    [
      upright(
        sweep(
          bed,
          [
            [0, -0.04],
            [0.008, 0.013],
            [0.03, 0.018],
            [0.058, 0.04],
          ],
          true,
        ),
      ),
      MORTAR,
    ],
    [
      upright(
        merge([
          sweep(
            stone,
            [
              [0, -0.04],
              [0.014, STONE_TOP - 0.022],
              [0.036, STONE_TOP],
            ],
            true,
          ),
          cap(stone, 0.036, STONE_TOP),
        ]),
      ),
      STONE,
    ],
  ];
  for (const [g] of parts) g.translate(0, 0, STONE_Z);
  return parts;
}

function stem(n: number): Part[] {
  const post = upright(
    sweep({ w: STEM, h: STEM, r: 0.011, corner: 2 }, [
      [0, FLANGE_TOP - 0.002],
      [0, 1],
    ]),
  );
  const at = post.attributes.position;
  for (let i = 0; i < at.count; i++) {
    if (at.getY(i) > 0.9) at.setY(i, STEM_Y - at.getZ(i) * (COS / SIN));
  }

  const weld = upright(
    sweep({ w: STEM + 0.018, h: STEM + 0.018, r: 0.02, corner: 2 }, [
      [0, FLANGE_TOP - 0.001],
      [0.0095, FLANGE_TOP + 0.009],
    ]),
  );

  const flange = upright(
    slab({ w: FLANGE, h: FLANGE, r: 0.02, corner: 2 }, STONE_TOP + GROUT_T - 0.001, FLANGE_TOP, 0.003),
  );

  const grout = upright(
    sweep(
      { w: FLANGE + 0.03, h: FLANGE + 0.03, r: 0.03, corner: 2 },
      [
        [0, STONE_TOP - 0.002],
        [0.005, STONE_TOP + GROUT_T],
        [0.02, STONE_TOP + GROUT_T],
      ],
      true,
    ),
  );

  const bolts = merge(
    [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) =>
        hexBolt(0.021, 0.011, 0.017, 0.009).translate(
          sx * (FLANGE / 2 - 0.028),
          FLANGE_TOP,
          sz * (FLANGE / 2 - 0.028),
        ),
      ),
    ),
  );

  const band = STEM + 2 * COLLAR_T;
  const collar = upright(
    sweep(
      { w: band, h: band, r: 0.011 + COLLAR_T, corner: 2 },
      [
        [COLLAR_T + 0.001, COLLAR_Y - COLLAR_H / 2],
        [0, COLLAR_Y - COLLAR_H / 2 + 0.006],
        [0, COLLAR_Y + COLLAR_H / 2 - 0.006],
        [COLLAR_T + 0.001, COLLAR_Y + COLLAR_H / 2],
      ],
      true,
    ),
  );

  const stamped = numerals(n, 0.019, 0.0048, 0.002)
    .rotateY(Math.PI)
    .translate(0, COLLAR_Y, -band / 2);

  const railMid = (RAIL_BACK + STRAP_BACK) / 2;
  const braces = [-1, 1].map((sx) =>
    rod(
      new Vector3(sx * 0.02, 0.405, 0),
      new Vector3(sx * 0.36, FACE_Y + railMid * SIN, FACE_Z + railMid * COS - STEM_Z),
      0.011,
    ),
  );

  const parts: Part[] = [
    [merge([post, weld, flange, ...braces]), STEEL],
    [grout, MORTAR],
    [bolts, ZINC],
    [collar, BRASS],
    [stamped, INK],
  ];
  for (const [g] of parts) g.translate(0, 0, STEM_Z);
  return parts;
}

function carrier(): Part[] {
  const strapPlan: Plan = { w: 0.042, h: 2 * SCREW_Y + 0.05, r: 0.008, corner: 1 };
  const straps = [-1, 1].map((sx) =>
    slab(strapPlan, PAN_BACK + 0.001, STRAP_BACK, 0.0015).translate(sx * SCREW_X, 0, 0),
  );
  const rail = slab(
    { w: 2 * SCREW_X + 0.042, h: 0.06, r: 0.01, corner: 2 },
    STRAP_BACK + 0.0005,
    RAIL_BACK,
    0.004,
  );
  const head = slab({ w: 0.18, h: 0.144, r: 0.012, corner: 2 }, RAIL_BACK + 0.0005, HEAD_BACK, 0.002);

  const headBolts = [-1, 1].map((sx) =>
    hexBolt(0.02, 0.009, 0.016)
      .rotateX(-Math.PI / 2)
      .translate(sx * 0.064, 0, HEAD_BACK),
  );

  const nuts = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sy) =>
      turned(
        [
          [0.0105, 0],
          [0.0105, 0.0075],
          [0.0048, 0.0075],
          [0.0048, 0.012],
          [0, 0.0125],
        ],
        6,
      )
        .rotateX(-Math.PI / 2)
        .translate(sx * SCREW_X, sy * SCREW_Y, STRAP_BACK),
    ),
  );

  return [
    [merge([...straps, rail, head]), STEEL],
    [merge(headBolts), ZINC],
    [merge(nuts), BRASS],
  ];
}

function plate(): Part[] {
  const plan: Plan = { w: PLATE_W, h: PLATE_H, r: PLATE_R, corner: 3 };
  const pressing = sweep(plan, [
    [0.014, PAN_BACK],
    [0.01, -0.027],
    [0, -0.024],
    [0, 0.005],
    [0.004, 0.0105],
    [0.0135, 0.011],
    [0.0185, 0.008],
    [0.0235, -0.004],
  ]);

  const screws = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sy) =>
      turned(
        [
          [0.0135, 0],
          [0.0125, 0.0026],
          [0.0068, 0.0046],
          [0.0045, 0.007],
          [0, 0.0076],
        ],
        8,
        false,
      )
        .rotateX(Math.PI / 2)
        .translate(sx * SCREW_X, sy * SCREW_Y, 0),
    ),
  );
  const slots = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sy) =>
      new BoxGeometry(0.009, 0.0018, 0.003)
        .rotateZ(0.5 + sx * 0.9 + sy * 0.35)
        .translate(sx * SCREW_X, sy * SCREW_Y, 0.0064),
    ),
  );

  return [
    [pressing, ENAMEL],
    [cap(plan, 0.014, PAN_BACK, -1), GROUND_COAT],
    [merge(screws), BRASS],
    [merge(slots), INK],
  ];
}

function tilted<T extends BufferGeometry>(g: T): T {
  g.rotateX(TILT);
  g.translate(0, FACE_Y, FACE_Z);
  return g;
}

function faceGeometry(): BufferGeometry {
  const g = cap({ w: PLATE_W, h: PLATE_H, r: PLATE_R, corner: 3 }, RIM, 0);
  const at = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < at.count; i++) {
    uv.setXY(i, at.getX(i) / FACE_W + 0.5, at.getY(i) / FACE_H + 0.5);
  }
  return g;
}

export function buildSign(
  world: HyperWorld,
  s: Station,
): { object: HyperObject; poi: Poi } {
  const lateral = Math.sign(s.lateral) * SIGN_LATERAL;
  const gv = placeAlongPath(units(s.at), units(lateral));
  const object = new HyperObject(gv);
  object.rotation.y = facePath(s.at, lateral);

  for (const [g, material] of [...footing(), ...stem(s.n)]) {
    object.addGeometry(world.shared, g, material);
  }
  for (const [g, material] of [...carrier(), ...plate()]) {
    object.addGeometry(world.shared, tilted(g), material);
  }

  object.addGeometry(world.shared, tilted(faceGeometry()), {
    map: makeSignTexture(s.n, s.title, s.object),
    color: 0xffffff,
    ambient: 0.9,
    castShadow: false,
    receiveShadow: false,
  });

  world.add(object);

  return {
    object,
    poi: { id: s.id, title: s.title, body: s.body, gv, radius: units(4) },
  };
}
