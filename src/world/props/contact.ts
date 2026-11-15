import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Path,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import {
  HyperObject,
  unitToPoincare,
  geodesicRadius,
  type GyroVector,
  type HyperMaterial,
  type HyperMaterialOptions,
  type HyperWorld,
} from '../../engine';
import { L, t, onLangChange } from '../../content/i18n';
import { isTouch } from '../../device';
import { lathe, merge, pos, roundedRect, trace, type Part, type Point } from '../geometry';
import type { IconName } from '../icons';
import { units } from '../placement';
import { FOOTING } from './mailbox';

interface LinkDef {
  id: string;
  href: string;
  icon: IconName;
  name: string;
  /** The enamel at rest. */
  enamel: number;
  /** The enamel under the crosshair. GitHub's black would read as a hole, so it gets a bright steel. */
  brand: number;
}

const LINKS: LinkDef[] = [
  {
    id: 'email',
    href: 'mailto:mr.muratozcan@gmail.com',
    icon: 'email',
    name: 'Email',
    enamel: 0xb44a2c,
    brand: 0xe8865f,
  },
  {
    id: 'linkedin',
    href: 'https://www.linkedin.com/in/muratozc/',
    icon: 'linkedin',
    name: 'LinkedIn',
    enamel: 0x2c5f96,
    brand: 0x4d9fdc,
  },
  {
    id: 'github',
    href: 'https://github.com/MuratOzc/',
    icon: 'github',
    name: 'GitHub',
    enamel: 0x535e6c,
    brand: 0xdfe6ee,
  },
  {
    id: 'instagram',
    href: 'https://www.instagram.com/murtileyto/',
    icon: 'instagram',
    name: 'Instagram',
    enamel: 0x86408f,
    brand: 0xe07aae,
  },
];

const BRASS: HyperMaterialOptions = { color: 0xe9cb7a, ambient: 0.58, gloss: 0.6, metal: 0.9 };
const GILT: HyperMaterialOptions = { color: 0xf6dd96, ambient: 0.62, gloss: 0.7, metal: 0.9 };
const STEEL: HyperMaterialOptions = { color: 0xdde1e4, ambient: 0.62, gloss: 0.5, metal: 0.6 };
const IRON: HyperMaterialOptions = { color: 0x5a6068, ambient: 0.6, gloss: 0.35, metal: 0.15 };
const STONE: HyperMaterialOptions = { color: 0xd3cdbf, ambient: 0.62, gloss: 0.04 };
const BED: HyperMaterialOptions = { color: 0x8f8a7f, ambient: 0.6, gloss: 0.02 };
const FLAGSTONES = [0xc7c1b3, 0xbcb7ab, 0xcfc7b4, 0xb5b1a8];

const DISC_R = 0.27;
const HALF_X = 0.42;
const HALF_Y = 0.4;
const CENTRE_Y = 0.95;
const RING_R = 0.297;
const FIELD_R = 0.2305;
const FIELD_Z = 0.012;
const RELIEF_TOP = 0.0205;

// Authored units, converted inside the builder: units() reads HM.unitScale, which is 1 until `new HyperWorld` runs.
const AIM_RANGE_UNITS = 4;
const AIM_RHO_UNITS = DISC_R * 1.3;
const AIM_MIN = 0.02;
/** How far a medallion swings toward you when aimed at. */
const LIFT = 0.12;

const GITHUB =
  'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12';

/** One contour of M, c and C commands on the 24-unit icon grid, centred and turned y-up. */
function outline(d: string): Shape {
  const shape = new Shape();
  let x = 0;
  let y = 0;
  for (const [, op, args] of d.matchAll(/([McC])([^McC]*)/g)) {
    const n = (args.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    if (op === 'M') {
      [x, y] = n;
      shape.moveTo(x - 12, 12 - y);
      continue;
    }
    for (let i = 0; i + 5 < n.length; i += 6) {
      const ox = op === 'c' ? x : 0;
      const oy = op === 'c' ? y : 0;
      shape.bezierCurveTo(
        n[i] + ox - 12,
        12 - n[i + 1] - oy,
        n[i + 2] + ox - 12,
        12 - n[i + 3] - oy,
        n[i + 4] + ox - 12,
        12 - n[i + 5] - oy,
      );
      x = n[i + 4] + ox;
      y = n[i + 5] + oy;
    }
  }
  return shape;
}

function circle<T extends Path>(path: T, x: number, y: number, r: number): T {
  for (let q = 0; q < 4; q++) path.absarc(x, y, r, (q * Math.PI) / 2, ((q + 1) * Math.PI) / 2, false);
  return path;
}

interface Mark {
  shapes: Shape[];
  /** Authored units per grid unit. */
  scale: number;
  /** Grid units the walls spread at the foot. Less than half the narrowest gap in the mark. */
  spread: number;
}

const MARKS: Record<IconName, () => Mark> = {
  email() {
    const envelope = roundedRect(new Shape(), 21.6, 14.8, 2.4);
    envelope.holes.push(
      trace(new Path(), [
        [-7.97, 5.97],
        [0, -0.32],
        [7.97, 5.97],
        [9.03, 4.63],
        [0, -2.48],
        [-9.03, 4.63],
      ]),
    );
    return { shapes: [envelope], scale: 0.0138, spread: 0.3 };
  },
  linkedin() {
    const tile = roundedRect(new Shape(), 22.4, 22.4, 2.8);
    tile.holes.push(
      trace(new Path(), [
        [-7.3, 2.7],
        [-4.2, 2.7],
        [-4.2, -7.5],
        [-7.3, -7.5],
      ]),
    );
    tile.holes.push(circle(new Path(), -5.75, 6.1, 1.95));
    const n = new Path();
    n.moveTo(-2.3, -7.5);
    n.lineTo(-2.3, 2.7);
    n.lineTo(0.15, 2.7);
    n.absarc(2.6, -1.6, 4.95, Math.atan2(4.3, -2.45), Math.PI / 2, true);
    n.absarc(2.6, -1.6, 4.95, Math.PI / 2, 0, true);
    n.lineTo(7.5, -7.5);
    n.lineTo(4.4, -7.5);
    n.lineTo(4.4, -1.6);
    n.absarc(2.6, -1.6, 1.75, 0, Math.PI / 2, false);
    n.absarc(2.6, -1.6, 1.75, Math.PI / 2, Math.PI, false);
    n.lineTo(0.8, -7.5);
    n.closePath();
    tile.holes.push(n);
    return { shapes: [tile], scale: 0.0122, spread: 0.3 };
  },
  github() {
    return { shapes: [outline(GITHUB)], scale: 0.0135, spread: 0.17 };
  },
  instagram() {
    const frame = roundedRect(new Shape(), 24, 24, 7);
    frame.holes.push(roundedRect(new Path(), 19.64, 19.64, 4.95));
    const lens = circle(new Shape(), 0, 0, 6.16);
    lens.holes.push(circle(new Path(), 0, 0, 4));
    return { shapes: [frame, lens, circle(new Shape(), 6.39, 6.42, 1.44)], scale: 0.0125, spread: 0.3 };
  },
};

/** Drops the triangles of a non-indexed geometry that lie wholly at or below z. */
function above(g: BufferGeometry, z: number): BufferGeometry {
  const out = new BufferGeometry();
  const position = g.attributes.position;
  const keep: number[] = [];
  for (let i = 0; i < position.count; i += 3) {
    if (Math.max(position.getZ(i), position.getZ(i + 1), position.getZ(i + 2)) > z + 1e-6) keep.push(i, i + 1, i + 2);
  }
  for (const name of ['position', 'normal', 'uv']) {
    const from = g.attributes[name];
    const array = new Float32Array(keep.length * from.itemSize);
    keep.forEach((v, k) => {
      for (let c = 0; c < from.itemSize; c++) array[k * from.itemSize + c] = from.getComponent(v, c);
    });
    out.setAttribute(name, new BufferAttribute(array, from.itemSize));
  }
  return out;
}

function relief(icon: IconName): BufferGeometry {
  const mark = MARKS[icon]();
  const g = new ExtrudeGeometry(mark.shapes, {
    depth: 0.004,
    curveSegments: 4,
    bevelEnabled: true,
    bevelThickness: 0.0045,
    bevelSize: mark.spread,
    bevelSegments: 1,
  });
  g.scale(mark.scale, mark.scale, 1);
  return above(g, 0).translate(0, 0, RELIEF_TOP - 0.0085);
}

function medallion(icon: IconName): Part[] {
  const rim: Point[] = [
    [0.229, -0.01],
    [0.231, -0.0165],
    [0.233, -0.0175],
    [0.2445, -0.0175],
    [0.2465, -0.021],
    [0.259, -0.021],
    [0.2665, -0.018],
    [DISC_R, -0.012],
    [DISC_R, 0.012],
    [0.2665, 0.018],
    [0.259, 0.021],
    [0.2465, 0.021],
    [0.2445, 0.0175],
    [0.233, 0.0175],
    [0.231, 0.0165],
    [0.229, 0.01],
  ];
  const cast: BufferGeometry[] = [
    lathe(rim, 28).rotateX(Math.PI / 2),
    new CylinderGeometry(0.2295, 0.2295, 0.006, 20).rotateX(Math.PI / 2),
  ];
  for (const s of [-1, 1]) {
    cast.push(pos(new CylinderGeometry(0.006, 0.006, 0.036, 8), 0, s * 0.28, 0));
  }

  const beads: BufferGeometry[] = [];
  const bead = new SphereGeometry(0.0048, 5, 1, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const front = bead.clone().translate(Math.cos(a) * 0.239, Math.sin(a) * 0.239, 0.0172);
    beads.push(front, front.clone().rotateY(Math.PI));
  }

  // The back copy is turned about Y, not mirrored, or the mark reads backwards for half of every turn.
  const front = relief(icon);
  return [
    [merge(cast), BRASS],
    [merge(beads), BRASS],
    [merge([front, front.clone().rotateY(Math.PI)]), GILT],
  ];
}

function enamel(): BufferGeometry {
  const front = new CircleGeometry(FIELD_R, 28).translate(0, 0, FIELD_Z);
  return merge([front, front.clone().rotateY(Math.PI)]);
}

function collar(from: number, to: number, bore: number, r: number): BufferGeometry {
  return lathe(
    [
      [bore, from],
      [r - 0.003, from],
      [r, from + 0.003],
      [r, to - 0.003],
      [r - 0.003, to],
      [bore, to],
    ],
    14,
  );
}

/** The arm that carries one medallion: a collar on the mast, a neck, and the gimbal ring. */
function yoke(side: number): Part[] {
  const cx = side * HALF_X;
  const steel: BufferGeometry[] = [new TorusGeometry(RING_R, 0.011, 7, 36).translate(cx, 0, 0)];

  const [from, to] = side < 0 ? [0.003, 0.049] : [-0.049, -0.003];
  steel.push(collar(from, to, 0.0308, 0.047));

  const yc = (from + to) / 2;
  const web = new Shape();
  trace(web, [
    [0.04, yc - 0.021],
    [0.118, yc - 0.013],
    [0.118, yc + 0.013],
    [0.04, yc + 0.021],
  ]);
  const neck = new ExtrudeGeometry(web, {
    depth: 0.01,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 1,
  }).translate(0, 0, -0.005);
  if (side < 0) neck.rotateY(Math.PI);
  steel.push(neck);

  steel.push(
    pos(
      lathe(
        [
          [0, -0.035],
          [0.012, -0.035],
          [0.0165, -0.029],
          [0.0165, 0.029],
          [0.012, 0.035],
          [0, 0.035],
        ],
        10,
      ),
      side * (HALF_X - RING_R),
      0,
      0,
    ),
  );

  const sleeve = lathe(
    [
      [0.007, 0.283],
      [0.016, 0.283],
      [0.018, 0.286],
      [0.018, 0.31],
      [0.016, 0.313],
      [0.011, 0.313],
    ],
    8,
  );
  const acorn = lathe(
    [
      [0.011, 0.313],
      [0.0145, 0.314],
      [0.0145, 0.322],
      [0.011, 0.331],
      [0.006, 0.339],
      [0, 0.342],
    ],
    8,
  );
  const brass: BufferGeometry[] = [];
  for (const turn of [0, Math.PI]) {
    steel.push(sleeve.clone().rotateZ(turn).translate(cx, 0, 0));
    brass.push(acorn.clone().rotateZ(turn).translate(cx, 0, 0));
  }

  return [
    [merge(steel), STEEL],
    [merge(brass), BRASS],
  ];
}

function flat(g: BufferGeometry): BufferGeometry {
  const out = g.toNonIndexed();
  out.computeVertexNormals();
  return out;
}

const PLINTH_TOP = 0.15;

function mast(): Part[] {
  const P = PLINTH_TOP;
  const column: Point[] = [
    [0.115, P],
    [0.115, P + 0.012],
    [0.108, P + 0.018],
    [0.072, P + 0.02],
    [0.072, P + 0.032],
    [0.079, P + 0.045],
    [0.072, P + 0.058],
    [0.058, P + 0.064],
    [0.044, P + 0.1],
    [0.036, P + 0.15],
    [0.032, P + 0.2],
    [0.03, P + 0.22],
    [0.03, 0.925],
    [0.0365, 0.935],
    [0.0365, 0.965],
    [0.03, 0.975],
    [0.03, 1.64],
    [0.038, 1.65],
    [0.038, 1.668],
    [0.03, 1.678],
    [0.022, 1.7],
    [0.024, 1.71],
    [0.03, 1.72],
    [0.04, 1.737],
    [0.042, 1.752],
    [0.037, 1.772],
    [0.025, 1.788],
    [0.01, 1.795],
    [0, 1.797],
  ];
  const parts: Part[] = [[lathe(column, 16), IRON]];

  const fixed: BufferGeometry[] = [];
  const screws: BufferGeometry[] = [];
  for (const cy of [CENTRE_Y - HALF_Y, CENTRE_Y + HALF_Y]) {
    for (const [from, to] of [[-0.081, -0.051], [0.051, 0.081]]) {
      fixed.push(collar(cy + from, cy + to, 0.0305, 0.045));
      screws.push(
        pos(new CylinderGeometry(0.005, 0.005, 0.008, 6).rotateX(Math.PI / 2), 0, cy + (from + to) / 2, -0.047),
      );
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    screws.push(pos(new CylinderGeometry(0.011, 0.011, 0.009, 6), Math.cos(a) * 0.092, P + 0.0225, Math.sin(a) * 0.092));
  }
  parts.push([merge(fixed), BRASS], [merge(screws), STEEL]);

  const plinth: Point[] = [
    [0.424, 0.03],
    [0.424, 0.085],
    [0.41, 0.097],
    [0.31, 0.1],
    [0.3, 0.113],
    [0.283, 0.118],
    [0.283, 0.142],
    [0.272, P],
    [0, P],
  ];
  parts.push([flat(lathe(plinth, 4).rotateY(Math.PI / 4)), STONE]);
  return parts;
}

/** A slab with a chamfered top edge, standing on y = -0.02 and rising to `top`. */
function flagstone(w: number, top: number, d: number): BufferGeometry {
  const r = Math.SQRT1_2;
  const chamfer = 0.02 / (w + d);
  const cap = new CylinderGeometry(r * (1 - chamfer * 2), r, 0.008, 4).translate(0, top - 0.004, 0);
  const sides = new CylinderGeometry(r, r, top + 0.012, 4, 1, true).translate(0, (top - 0.008 - 0.02) / 2, 0);
  return flat(merge([cap, sides]).rotateY(Math.PI / 4).scale(w, 1, d));
}

const PAD_X0 = -2.05;
const PAD_X1 = 0.95;

function paving(): Part[] {
  const JOINT = 0.012;
  const depth = FOOTING.d + JOINT;
  const z0 = FOOTING.z - depth * 1.5;

  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const tones = FLAGSTONES.map(() => [] as BufferGeometry[]);
  const course = (from: number, to: number, z: number): void => {
    let x = from;
    while (x < to - 1e-6) {
      let w = 0.36 + rnd() * 0.3;
      if (to - x - w < 0.24) w = to - x;
      const lift = rnd() * 0.006;
      tones[Math.floor(rnd() * tones.length)].push(pos(flagstone(w - JOINT, 0.04 + lift, depth - JOINT), x + w / 2, 0, z));
      x += w;
    }
  };
  for (let row = 0; row < 4; row++) {
    const z = z0 + (row + 0.5) * depth;
    if (row === 1) {
      course(PAD_X0, FOOTING.x - FOOTING.w / 2 - JOINT / 2, z);
      course(FOOTING.x + FOOTING.w / 2 + JOINT / 2, PAD_X1, z);
    } else {
      course(PAD_X0, PAD_X1, z);
    }
  }

  const parts: Part[] = tones.map((stones, i) => [
    merge(stones),
    { color: FLAGSTONES[i], ambient: 0.62, gloss: 0.04 },
  ]);
  parts.push([
    pos(new PlaneGeometry(PAD_X1 - PAD_X0 - 0.02, depth * 4 - 0.02, 10, 5).rotateX(-Math.PI / 2), (PAD_X0 + PAD_X1) / 2, 0.02, z0 + depth * 2),
    BED,
  ]);
  return parts;
}

interface Token {
  def: LinkDef;
  /** Swings about the mast. */
  arm: Group;
  /** Spins in the ring. */
  node: Group;
  side: number;
  mats: HyperMaterial[];
  /** Rest position in the object's Unit frame: what the aim test measures. */
  unitPos: Vector3;
  spin: number;
  /** 0 at rest, 1 fully highlighted. Eased. */
  aim: number;
  opened: boolean;
}

// A detached anchor, not window.open: mailto: through window.open leaves an orphaned blank tab on some browsers.
function openLink(href: string): void {
  const a = document.createElement('a');
  a.href = href;
  if (!href.startsWith('mailto:')) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  document.body.append(a);
  a.click();
  a.remove();
}

const PROMPT = isTouch ? L('tap', 'dokun') : L('press E', 'E’ye bas');

export interface ContactResult {
  object: HyperObject;
  tick: (worldGV: GyroVector, dt: number) => void;
}

export function buildContact(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): ContactResult {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  const aimRange = units(AIM_RANGE_UNITS);
  const sinRho = Math.sin(units(AIM_RHO_UNITS));

  for (const [g, opts] of [...mast(), ...paving()]) object.addGeometry(world.shared, g, opts);

  const tokens: Token[] = [];

  LINKS.forEach((def, i) => {
    const side = i % 2 === 0 ? -1 : 1;

    const arm = new Group();
    arm.position.set(0, CENTRE_Y + (i < 2 ? HALF_Y : -HALF_Y), 0);
    object.add(arm);

    const node = new Group();
    node.position.set(side * HALF_X, 0, 0);
    arm.add(node);

    for (const [g, opts] of yoke(side)) {
      object.addGeometry(world.shared, g, { ...opts, castShadow: false }, arm);
    }
    for (const [g, opts] of medallion(def.icon)) object.addGeometry(world.shared, g, opts, node);

    const mats = object.addLiveGeometry(
      world.shared,
      enamel(),
      {
        color: def.enamel,
        ambient: 0.62,
        gloss: 0.8,
        castShadow: false,
        receiveShadow: false,
      },
      node,
    );

    tokens.push({
      def,
      arm,
      node,
      side,
      mats,
      unitPos: new Vector3(),
      spin: 0.5 + i * 0.11,
      aim: 0,
      opened: false,
    });
  });

  world.add(object);

  object.updateMatrixWorld(true);
  for (const token of tokens) {
    token.unitPos.setFromMatrixPosition(token.node.matrixWorld);
  }

  const promptEl = document.createElement('div');
  promptEl.className = 'aim-prompt';
  document.body.append(promptEl);

  let hovered: Token | null = null;
  const repaintPrompt = () => {
    promptEl.textContent = hovered ? `${hovered.def.name} — ${t(PROMPT)}` : '';
    promptEl.style.opacity = hovered ? '1' : '0';
  };
  onLangChange(repaintPrompt);

  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || e.repeat || !hovered) return;
    hovered.opened = true;
    openLink(hovered.def.href);
  });

  const poincare = new Vector3();
  const point = new Vector3();
  const forward = new Vector3();
  const brand = new Color();

  const tick = (worldGV: GyroVector, dt: number) => {
    const composed = object.localGV.add(worldGV);
    forward.set(0, 0, -1).applyQuaternion(world.camera.quaternion);

    let best: Token | null = null;
    let bestRatio = 1;

    for (const token of tokens) {
      // The shader's own transform, not a Raycaster: a ray against the model matrix drifts from where the vertex shader draws.
      unitToPoincare(poincare.copy(token.unitPos), object.useTanKHeight, poincare);
      composed.transformPoint(poincare, point);
      const d = geodesicRadius(point);
      if (d > aimRange) continue;

      const half = Math.max(
        AIM_MIN,
        Math.asin(Math.min(1, sinRho / Math.max(1e-4, Math.sin(d)))),
      );

      const angle = Math.acos(
        Math.max(-1, Math.min(1, point.normalize().dot(forward))),
      );
      const ratio = angle / half;
      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = token;
      }
    }

    if (best !== hovered) {
      hovered = best;
      repaintPrompt();
    }

    for (const token of tokens) {
      const want = token === hovered ? 1 : 0;
      token.aim += (want - token.aim) * Math.min(1, dt * 11);

      token.node.rotation.y += token.spin * (1 - 0.88 * token.aim) * dt;
      token.arm.rotation.y = -token.side * Math.asin((token.aim * LIFT) / HALF_X);

      const held = token.opened ? 0.45 : 0;
      const mix = Math.max(held, token.aim);
      for (const mat of token.mats) {
        mat.uniforms.uColor.value.set(token.def.enamel).lerp(brand.set(token.def.brand), mix);
        mat.uniforms.uAmbient.value = 0.62 + 0.22 * token.aim;
      }
    }
  };

  return { object, tick };
}
