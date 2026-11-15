import {
  BufferAttribute,
  BufferGeometry,
  ExtrudeGeometry,
  Group,
  Path,
  PlaneGeometry,
  Shape,
  TorusGeometry,
  type Texture,
} from 'three';
import {
  HyperObject,
  type GyroVector,
  type HyperMaterialOptions,
  type HyperWorld,
} from '../../engine';
import { L, t, type Localized } from '../../content/i18n';
import { grained, trace, type Point } from '../geometry';
import { units, type Poi } from '../placement';
import { localizedCanvasTexture } from '../text';

const POST_X = 1.23;
const POST = 0.11;
const INNER = POST_X - POST;

const PLINTH = 0.366;
const PLINTH_TOP = 0.3;
const PLATE = 0.012;
const FOOT = PLINTH_TOP + PLATE;

const LINTEL_BOTTOM = 2.98;
const LINTEL_H = 0.16;
const LINTEL_TOP = LINTEL_BOTTOM + LINTEL_H;
const LINTEL_T = 0.14;
const LINTEL_BEVEL = 0.006;
const LINTEL_END = POST_X + POST + 0.17;

const BRACE_RISE = 0.33;
const BRACE_W = 0.08;
const BRACE_T = 0.08;
const BRACE_FROM = 0.6;

const BOARD_W = 1.72;
const BOARD_H = 0.27;
const BOARD_TOP = 2.88;
const BOARD_MID = BOARD_TOP - BOARD_H / 2;
const BOARD_T = 0.046;
const RIM = 0.018;
const GROOVE = 0.01;
const PROUD = 0.005;
const FIELD_W = BOARD_W - 2 * (RIM + GROOVE);
const FIELD_H = BOARD_H - 2 * (RIM + GROOVE);

const HANG_X = 0.72;
const EYE = 0.0105;
const WIRE = 0.0045;
const COLLAR = 0.004;
const LINKS = 3;
const LINK_BEND = 0.0095;

const UPPER_EYE = LINTEL_BOTTOM - COLLAR - EYE - WIRE;
const LOWER_EYE = BOARD_TOP + COLLAR + EYE + WIRE;
const PIVOT = UPPER_EYE - EYE;
const LINK_HALF = (PIVOT - (LOWER_EYE + EYE) + 2 * WIRE * (LINKS + 1)) / (2 * LINKS);

const SWING = 0.028;

const FACE_PX: [number, number] = [2048, 288];
const ART_PX = Math.round((FACE_PX[0] * FIELD_H) / FIELD_W);
const SWATCH_PX = 16;
const PAINT = '#5aa585';
const PAINT_HEX = 0x5aa585;
const FONT = '700 SIZEpx "Palatino Linotype", Palatino, Georgia, "Noto Serif", serif';
const TRACKING = 0.13;

const OAK: HyperMaterialOptions = { color: 0xe2cca4, ambient: 0.62, gloss: 0.12, grain: 0.2 };
const OAK_BEAM: HyperMaterialOptions = { color: 0xe8d3ad, ambient: 0.62, gloss: 0.12, grain: 0.2 };
const OAK_BRACE: HyperMaterialOptions = { color: 0xd8be92, ambient: 0.62, gloss: 0.12, grain: 0.2 };
const PEG: HyperMaterialOptions = { color: 0xb38a58, ambient: 0.62, gloss: 0.2, grain: 0.15 };
const STONE: HyperMaterialOptions = { color: 0xd6d1c4, ambient: 0.66, gloss: 0.05, grain: 0.13 };
const IRON: HyperMaterialOptions = { color: 0x8b9198, ambient: 0.62, gloss: 0.4, metal: 0.45 };
const BOLT: HyperMaterialOptions = { color: 0xc6ccd1, ambient: 0.66, gloss: 0.45, metal: 0.4 };
const LEAD: HyperMaterialOptions = { color: 0xb9c0c5, ambient: 0.66, gloss: 0.2, metal: 0.15 };
const GREEN: HyperMaterialOptions = { color: PAINT_HEX, ambient: 0.76, gloss: 0.28, grain: 0.05 };
const CREAM: HyperMaterialOptions = { color: 0xf4e7bf, ambient: 0.74, gloss: 0.28 };
const FACE: HyperMaterialOptions = { color: 0xffffff, ambient: 0.8, gloss: 0.28 };

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let k = Math.imul(s ^ (s >>> 15), 1 | s);
    k = (k + Math.imul(k ^ (k >>> 7), 61 | k)) ^ k;
    return ((k ^ (k >>> 14)) >>> 0) / 4294967296;
  };
}

function flat(positions: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  g.computeVertexNormals();
  return g;
}

function rect(w: number, h: number): Point[] {
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
}

function prism(outline: Point[], depth: number, bevel = 0, hole?: Point[]): BufferGeometry {
  const shape = trace(new Shape(), outline);
  if (hole) shape.holes.push(trace(new Path(), hole));
  const g = new ExtrudeGeometry(shape, {
    depth: depth - 2 * bevel,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 1,
    curveSegments: 1,
  });
  return g.translate(0, 0, bevel - depth / 2);
}

function upright(outline: Point[], height: number, bevel = 0): BufferGeometry {
  return prism(outline, height, bevel).rotateX(-Math.PI / 2);
}

function stud(r: number, h: number, sides = 6, taper = 0.8): BufferGeometry {
  const p: number[] = [];
  const at = (i: number, k: number, z: number): [number, number, number] => {
    const a = ((i + 0.5) / sides) * Math.PI * 2;
    return [Math.cos(a) * r * k, Math.sin(a) * r * k, z];
  };
  for (let i = 0; i < sides; i++) {
    const a = at(i, 1, 0);
    const b = at(i + 1, 1, 0);
    const c = at(i + 1, taper, h);
    const d = at(i, taper, h);
    p.push(...a, ...b, ...c, ...a, ...c, ...d);
    if (i > 0 && i < sides - 1) p.push(...at(0, taper, h), ...d, ...c);
  }
  return flat(p);
}

type Ring = Array<[number, number, number]>;

function loft(rings: Ring[], closedPath = false, closedRing = true): BufferGeometry {
  const p: number[] = [];
  const spans = closedPath ? rings.length : rings.length - 1;
  for (let k = 0; k < spans; k++) {
    const lo = rings[k];
    const hi = rings[(k + 1) % rings.length];
    const sides = closedRing ? lo.length : lo.length - 1;
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % lo.length;
      p.push(...lo[i], ...lo[j], ...hi[j], ...lo[i], ...hi[j], ...hi[i]);
    }
  }
  return flat(p);
}

function steps(from: number, to: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
}

function postGeometry(): BufferGeometry {
  const chamfered = (c: number) => (y: number): Point => [y, c];
  const stations: Point[] = [
    ...[FOOT, ...steps(FOOT, 0.62, 2)].map(chamfered(0.004)),
    ...[0.7, ...steps(0.7, 2.46, 8)].map(chamfered(0.03)),
    ...[2.54, ...steps(2.54, LINTEL_TOP, 3)].map(chamfered(0.004)),
  ];
  const ring = ([y, c]: Point): Ring => {
    const a = POST;
    const b = POST - c;
    return [
      [b, y, a], [a, y, b], [a, y, -b], [b, y, -a],
      [-b, y, -a], [-a, y, -b], [-a, y, b], [-b, y, a],
    ];
  };
  return loft(stations.map(ring));
}

function plinthGeometry(): BufferGeometry {
  const ring = (y: number, half: number, c: number): Ring => [
    [half - c, y, half], [half, y, half - c], [half, y, -half + c], [half - c, y, -half],
    [-half + c, y, -half], [-half, y, -half + c], [-half, y, half - c], [-half + c, y, half],
  ];
  const top = ring(PLINTH_TOP, PLINTH / 2 - 0.035, 0.008);
  const p: number[] = [];
  for (let i = 1; i + 1 < top.length; i++) p.push(...top[0], ...top[i], ...top[i + 1]);
  const sides = loft([
    ring(-0.06, PLINTH / 2, 0.014),
    ring(PLINTH_TOP - 0.035, PLINTH / 2, 0.014),
    top,
  ]);
  p.push(...(sides.attributes.position.array as Float32Array));
  return flat(p);
}

function raised(w: number, h: number, proud: number, bevel: number): BufferGeometry {
  const ring = (inset: number, z: number): Ring => [
    [-w / 2 + inset, -h / 2 + inset, z],
    [w / 2 - inset, -h / 2 + inset, z],
    [w / 2 - inset, h / 2 - inset, z],
    [-w / 2 + inset, h / 2 - inset, z],
  ];
  const top = ring(bevel, proud);
  const p: number[] = [...top[0], ...top[1], ...top[2], ...top[0], ...top[2], ...top[3]];
  p.push(...(loft([ring(0, 0), top]).attributes.position.array as Float32Array));
  return flat(p);
}

function beamGeometry(): BufferGeometry {
  const hh = LINTEL_H / 2;
  const ht = LINTEL_T / 2;
  const b = LINTEL_BEVEL;
  const y = LINTEL_BOTTOM + hh;
  const ring = (x: number): Ring => [
    [x, y + hh, -ht + b], [x, y + hh, ht - b], [x, y + hh - b, ht], [x, y - hh + b, ht],
    [x, y - hh, ht - b], [x, y - hh, -ht + b], [x, y - hh + b, -ht], [x, y + hh - b, -ht],
  ];
  return loft([-POST_X - 0.02, ...steps(-POST_X - 0.02, POST_X + 0.02, 10)].map(ring));
}

function beamEndOutline(side: number): Point[] {
  const cove = 0.085;
  const nib = 0.012;
  const out: Point[] = [[POST_X, LINTEL_BOTTOM]];
  const arc = 4;
  for (let i = 0; i <= arc; i++) {
    const a = Math.PI - (i / arc) * (Math.PI / 2);
    out.push([LINTEL_END - nib + Math.cos(a) * cove, LINTEL_BOTTOM + Math.sin(a) * cove]);
  }
  out.push([LINTEL_END, LINTEL_BOTTOM + cove], [LINTEL_END, LINTEL_TOP], [POST_X, LINTEL_TOP]);
  return out.map(([x, y]): Point => [side * x, y]);
}

function around(w: number, h: number, parts: number, section: Point[]): Ring[] {
  const x = w / 2;
  const y = h / 2;
  const stations: Array<[number, number, number, number]> = [[-x, -y, 1, 1]];
  for (const at of steps(-x, x, parts).slice(0, -1)) stations.push([at, -y, 0, 1]);
  stations.push([x, -y, -1, 1], [x, y, -1, -1]);
  for (const at of steps(x, -x, parts).slice(0, -1)) stations.push([at, y, 0, -1]);
  stations.push([-x, y, 1, -1]);
  return stations.map(([ox, oy, ix, iy]) =>
    section.map(([d, z]): [number, number, number] => [ox + ix * d, oy + iy * d, z]),
  );
}

function braceOutline(side: number): Point[] {
  const cx = INNER - BRACE_FROM;
  const cy = LINTEL_BOTTOM - BRACE_FROM;
  const inner = Math.hypot(BRACE_FROM, BRACE_FROM - BRACE_RISE);
  const from = Math.atan2(BRACE_FROM - BRACE_RISE, BRACE_FROM) - 0.05;
  const to = Math.PI / 2 - from;
  const cuts = 6;
  const arc = (radius: number): Point[] =>
    Array.from({ length: cuts + 1 }, (_, i): Point => {
      const a = from + ((to - from) * i) / cuts;
      return [side * (cx + Math.cos(a) * radius), cy + Math.sin(a) * radius];
    });
  return [...arc(inner), ...arc(inner + BRACE_W).reverse()];
}

function linkGeometry(): BufferGeometry {
  const straight = LINK_HALF - LINK_BEND;
  const perBend = 3;
  const spine: Array<[number, number, number, number]> = [];
  for (const end of [1, -1]) {
    for (let i = 0; i <= perBend; i++) {
      const a = (end > 0 ? 0 : Math.PI) + (i / perBend) * Math.PI;
      spine.push([
        Math.cos(a) * LINK_BEND,
        end * straight + Math.sin(a) * LINK_BEND,
        Math.cos(a),
        Math.sin(a),
      ]);
    }
  }
  const around = 4;
  const position: number[] = [];
  const normal: number[] = [];
  const index: number[] = [];
  spine.forEach(([x, y, nx, ny], i) => {
    for (let k = 0; k < around; k++) {
      const a = (k / around) * Math.PI * 2;
      const out = Math.cos(a);
      const up = Math.sin(a);
      position.push(x + nx * out * WIRE, y + ny * out * WIRE, up * WIRE);
      normal.push(nx * out, ny * out, up);
      const j = (i + 1) % spine.length;
      const l = (k + 1) % around;
      const a0 = i * around + k;
      const a1 = j * around + k;
      const b0 = i * around + l;
      const b1 = j * around + l;
      index.push(a0, a1, b1, a0, b1, b0);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(normal), 3));
  g.setIndex(index);
  return g;
}

function eyeGeometry(): BufferGeometry {
  const g = new TorusGeometry(EYE, WIRE, 4, 8);
  g.deleteAttribute('uv');
  return g;
}

function faceTexture(text: Localized): Texture {
  const cut = document.createElement('canvas');
  const lit = document.createElement('canvas');
  const [W, H] = FACE_PX;
  cut.width = lit.width = W;
  cut.height = lit.height = ART_PX;
  const cutCtx = cut.getContext('2d')!;
  const litCtx = lit.getContext('2d')!;

  return localizedCanvasTexture(W, H, (ctx, w, h) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = PAINT;
    ctx.fillRect(0, 0, w, h);

    const r = seeded(0xa2c4);
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(r() * w - 200, r() * ART_PX, 300 + r() * 700, 2 + r() * 5);
    }

    const line = t(text);
    const boxW = w - 2 * 64;
    const boxH = ART_PX - 2 * 24;
    const set = (c: CanvasRenderingContext2D, size: number): void => {
      c.font = FONT.replace('SIZE', String(size));
      c.letterSpacing = `${size * TRACKING}px`;
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
    };
    set(ctx, 100);
    const m = ctx.measureText(line);
    const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    const tall = boxH / inkH;
    const wide = boxW / inkW;
    const squeeze = Math.min(1, Math.max(0.86, wide / tall));
    const k = Math.min(tall, wide / squeeze);
    const size = 100 * k;
    const x = w / 2 / squeeze + (m.actualBoundingBoxLeft - inkW / 2) * k;
    const y = ART_PX / 2 + ((m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2) * k;
    const depth = Math.max(2, size * 0.034);

    const write = (c: CanvasRenderingContext2D, mode: GlobalCompositeOperation, fill: string, dy: number): void => {
      c.setTransform(squeeze, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = mode;
      set(c, size);
      c.fillStyle = fill;
      c.fillText(line, x, y + dy);
    };
    for (const c of [cutCtx, litCtx]) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, w, ART_PX);
    }
    write(cutCtx, 'source-over', '#9d8a55', 0);
    write(cutCtx, 'source-atop', '#f3e4b3', depth);
    write(litCtx, 'source-over', '#fffaea', 0);
    write(litCtx, 'destination-out', '#000', -depth * 0.8);
    cutCtx.setTransform(1, 0, 0, 1, 0, 0);
    cutCtx.globalCompositeOperation = 'source-atop';
    cutCtx.drawImage(lit, 0, 0);
    ctx.drawImage(cut, 0, 0);

    // The board's solid parts carry no uv and so sample this corner: it must stay white.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, h - SWATCH_PX, SWATCH_PX, SWATCH_PX);
  });
}

function facePlane(): BufferGeometry {
  const g = new PlaneGeometry(FIELD_W, FIELD_H, 8, 1);
  const uv = g.attributes.uv as BufferAttribute;
  const from = 1 - ART_PX / FACE_PX[1];
  for (let i = 0; i < uv.count; i++) uv.setY(i, from + uv.getY(i) * (1 - from));
  return g.translate(0, 0, BOARD_T / 2 + PROUD);
}

class Arch extends HyperObject {
  readonly sign = new Group();
  private readonly clock: { value: number };

  constructor(at: GyroVector, clock: { value: number }) {
    super(at);
    this.clock = clock;
    this.sign.position.y = PIVOT;
    this.add(this.sign);
  }

  override syncMatrices(): void {
    const s = this.clock.value;
    this.sign.rotation.x = SWING * Math.sin(s * 1.9) * (0.55 + 0.45 * Math.sin(s * 0.37));
    super.syncMatrices();
  }
}

export function buildArch(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): { object: HyperObject; poi: Poi } {
  const arch = new Arch(at, world.shared.uTime);
  arch.rotation.y = yaw;
  const add = (g: BufferGeometry, opts: HyperMaterialOptions): void =>
    arch.addGeometry(world.shared, g, opts);
  const facing = (g: BufferGeometry, z: number): BufferGeometry =>
    z < 0 ? g.rotateY(Math.PI) : g;

  const postShape = postGeometry();
  const strap: Point[] = [
    [-0.06, 0], [0.06, 0], [0.06, 0.185], [0.035, 0.21], [-0.035, 0.21], [-0.06, 0.185],
  ];

  for (const side of [-1, 1]) {
    const x = side * POST_X;

    const plinth = plinthGeometry().translate(x, 0, 0);
    add(grained(plinth, 'y', 26, 26), { ...STONE, color: side < 0 ? 0xdad5c8 : 0xd4cfc0 });
    for (let face = 0; face < 4; face++) {
      const panel = raised(PLINTH - 0.09, 0.2, 0.007, 0.007);
      panel.translate(0, 0.135, PLINTH / 2);
      panel.rotateY((face * Math.PI) / 2);
      panel.translate(x, 0, 0);
      add(grained(panel, 'y', 60, 60), { ...STONE, color: 0xc9c3b3, grain: 0.22 });
    }

    const plate = upright(rect(0.29, 2 * POST + 0.016), PLATE, 0.002);
    plate.translate(x, PLINTH_TOP + PLATE / 2, 0);
    add(plate, IRON);
    for (const dx of [-1, 1]) {
      const nut = stud(0.011, 0.009).rotateX(-Math.PI / 2);
      nut.translate(x + dx * 0.128, FOOT, 0);
      add(nut, BOLT);
    }
    for (const z of [-1, 1]) {
      const cheek = prism(strap, 0.008);
      cheek.translate(x, FOOT, z * (POST + 0.004));
      add(cheek, IRON);
      for (const dy of [0.055, 0.145]) {
        const head = facing(stud(0.016, 0.009), z);
        head.translate(x, FOOT + dy, z * (POST + 0.008));
        add(head, BOLT);
      }
    }

    add(grained(postShape.clone().translate(x, 0, 0), 'y'), OAK);

    const cap = upright(rect(2 * POST + 0.024, 2 * POST + 0.024), 0.01, 0.004);
    cap.translate(x, LINTEL_TOP + 0.005, 0);
    add(grained(cap, 'y', 40, 40), { ...LEAD, grain: 0.08 });

    const brace = prism(braceOutline(side), BRACE_T, 0.005);
    brace.rotateZ(side * (Math.PI / 4));
    grained(brace, 'x');
    brace.rotateZ(-side * (Math.PI / 4));
    add(brace, OAK_BRACE);

    const braceOnPost = LINTEL_BOTTOM - BRACE_RISE + BRACE_W * 0.95;
    const braceOnLintel = side * (INNER - BRACE_RISE + BRACE_W * 0.95);
    for (const z of [-1, 1]) {
      for (const dx of [-0.045, 0.045]) {
        const peg = facing(stud(0.012, 0.007, 6, 0.85), z);
        peg.translate(x + dx, LINTEL_BOTTOM + LINTEL_H / 2, z * POST);
        add(peg, PEG);
      }
      const low = facing(stud(0.012, 0.007, 6, 0.85), z);
      low.translate(side * (INNER + 0.05), braceOnPost, z * POST);
      add(low, PEG);
      const high = facing(stud(0.012, 0.007, 6, 0.85), z);
      high.translate(braceOnLintel, LINTEL_BOTTOM + 0.05, z * (LINTEL_T / 2));
      add(high, PEG);
    }
  }

  add(grained(beamGeometry(), 'x'), OAK_BEAM);
  for (const side of [-1, 1]) {
    add(grained(prism(beamEndOutline(side), LINTEL_T, LINTEL_BEVEL), 'x'), OAK_BEAM);
  }

  const eye = eyeGeometry();
  const link = linkGeometry();
  const face = faceTexture(L('WELCOME', 'HOŞ GELDİNİZ'));
  const hang = (g: BufferGeometry, opts: HyperMaterialOptions): void => {
    g.translate(0, -PIVOT, 0);
    arch.addGeometry(world.shared, g, { ...opts, map: face }, arch.sign);
  };
  const solid = (g: BufferGeometry, opts: HyperMaterialOptions): void => {
    g.deleteAttribute('uv');
    hang(g, opts);
  };

  for (const side of [-1, 1]) {
    const x = side * HANG_X;

    const washer = upright(rect(0.034, 0.034), 0.004);
    washer.translate(x, LINTEL_TOP + 0.002, 0);
    add(washer, IRON);
    const nut = stud(0.011, 0.01).rotateX(-Math.PI / 2);
    nut.translate(x, LINTEL_TOP + 0.004, 0);
    add(nut, IRON);
    const shank = stud(0.008, COLLAR + WIRE, 6, 0.9).rotateX(Math.PI / 2);
    shank.translate(x, LINTEL_BOTTOM, 0);
    add(shank, IRON);
    add(eye.clone().translate(x, UPPER_EYE, 0), IRON);

    for (let i = 0; i < LINKS; i++) {
      const g = link.clone();
      if (i % 2 === 0) g.rotateY(Math.PI / 2);
      g.translate(x, PIVOT + 2 * WIRE - LINK_HALF - i * 2 * (LINK_HALF - WIRE), 0);
      solid(g, IRON);
    }

    solid(eye.clone().translate(x, LOWER_EYE, 0), IRON);
    const screw = stud(0.008, COLLAR + WIRE, 6, 0.9).rotateX(-Math.PI / 2);
    screw.translate(x, BOARD_TOP, 0);
    solid(screw, IRON);
  }

  const lip = BOARD_T / 2 + PROUD - 0.001;
  const rim = loft(
    around(BOARD_W, BOARD_H, 7, [
      [RIM, lip], [0.006, lip], [0, lip - 0.006], [0, 0.006 - lip], [0.006, -lip], [RIM, -lip],
    ]),
    true,
  );
  solid(grained(rim.translate(0, BOARD_MID, 0), 'x'), GREEN);
  for (const z of [-1, 1]) {
    const floor = new PlaneGeometry(BOARD_W - 2 * RIM + 0.006, BOARD_H - 2 * RIM + 0.006, 7, 2);
    floor.translate(0, 0, BOARD_T / 2);
    solid(facing(floor, z).translate(0, BOARD_MID, 0), CREAM);
    hang(facing(facePlane(), z).translate(0, BOARD_MID, 0), FACE);
  }
  const edge = BOARD_T / 2 + PROUD;
  const walls = loft(around(FIELD_W, FIELD_H, 7, [[0, edge], [0, -edge]]), true, false);
  solid(walls.translate(0, BOARD_MID, 0), GREEN);

  world.add(arch);

  return {
    object: arch,
    poi: {
      id: 'arch',
      title: L('muratozcan.me', 'muratozcan.me'),
      body: L(
        'You are about to meet spherical geometry. Or you just did. Either way, expect to leave a little dizzy.',
        'Küresel geometri ile tanışacaksınız. Belki de çoktan tanıştınız. Baş döndürücü bir deneyim sizi bekliyor.',
      ),
      gv: at,
      radius: units(4),
    },
  };
}
