import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  NoColorSpace,
  Path,
  PlaneGeometry,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  ShapeUtils,
  SphereGeometry,
  TextureLoader,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Texture,
} from 'three';
import { HyperObject, type HyperMaterialOptions, type HyperWorld } from '../../engine';
import { L } from '../../content/i18n';
import { aimed, grained, lathe, merge, rod, trace, type Part, type Point } from '../geometry';
import { placeOnGround, units, type Poi } from '../placement';

/**
 * Three easels, ringed around the left pole — the exact mirror of the chess
 * table, which stands on the right one.
 *
 * The stations are the job. This is the other half: digital images and video
 * made for no client, some of it what the inside of my head looks like and some
 * of it a joke I wanted to see rendered properly.
 *
 * ARRANGEMENT. The three stand on a small circle facing OUTWARD, 120 degrees
 * apart, like a pinwheel. Approach from any bearing and one canvas is square on
 * to you — a row facing one way is invisible from three quarters of the world,
 * which for a landmark at the pole is most of it.
 *
 * ASPECT IS TAKEN FROM THE IMAGE, NOT AUTHORED. Each easel declares a box the
 * canvas has to fit inside, and the canvas is sized from the loaded texture's
 * real pixel dimensions to fill that box without distortion. These files are
 * meant to be swapped, so no dimension here is written down twice.
 *
 * THE FRAME LEANS WITH THE CANVAS. Legs, rails, mast, tray and canvas are all
 * authored upright in one frame space (x across, y up the rake, z out of the
 * face) and tipped back together, so nothing in the frame can cross the picture
 * whatever the rake. The front faces of the legs are z = 0 and the canvas sits
 * in front of that plane.
 */

interface EaselSpec {
  /** Azimuth around the pole, degrees. Sets both the spot and the facing. */
  azimuth: number;
  /** The box the canvas must fit inside, in authored units. */
  maxW: number;
  maxH: number;
  url: string;
  rake: number;
  rear: number;
  trayHole: number;
  /** Spare pegs: leg side, hole. Only holes below the tray: a peg above it comes out through the canvas. */
  spare: Array<[number, number]>;
  left: 'brush' | null;
  wood: number;
  sag: number;
  mess: number;
  seed: number;
}

/** Angular radius of the ring, radians. 0.14 is 1.4 authored units. */
const RING = 0.14;

const EASELS: EaselSpec[] = [
  { azimuth: 90, maxW: 1, maxH: 1, url: '/images/easel1.webp', rake: 0.14, rear: 0.37, trayHole: 1, spare: [[-1, 0]], left: null, wood: 0xe8c592, sag: 0.05, mess: 0.6, seed: 11 },
  { azimuth: 210, maxW: 1, maxH: 1, url: '/images/easel2.webp', rake: 0.11, rear: 0.4, trayHole: 0, spare: [], left: 'brush', wood: 0xdcb47c, sag: 0.075, mess: 1, seed: 23 },
  { azimuth: 330, maxW: 1, maxH: 1, url: '/images/easel3.webp', rake: 0.17, rear: 0.35, trayHole: 2, spare: [[1, 0], [-1, 1]], left: null, wood: 0xecd2a6, sag: 0.035, mess: 0.35, seed: 37 },
];

const DECK = 0.1;
const DECK_INRADIUS = 1.8;

const LEG_S = 1.66;
const FOOT_X = 0.36;
const TOP_X = 0.048;
const LEG_W = 0.048;
const LEG_D = 0.024;
const HOLE0 = 0.27;
const HOLE_STEP = 0.08;
const HOLES = 10;
const HINGE_S = 1.598;
const Z_FOOT = 0.1;
const MARGIN = 0.012;
const FACE_N = 0.024;

const PAINTS = [0xe5533d, 0xf2c53a, 0x4a6fd0, 0x3fa07c, 0xf5f1e6, 0xdca545, 0xbd4466, 0x52b7c2, 0xf08c3c, 0x8d66bd];

const STEEL: HyperMaterialOptions = { color: 0xdde1e4, ambient: 0.62, gloss: 0.5, metal: 0.6 };
const IRON: HyperMaterialOptions = { color: 0xaeb4ba, ambient: 0.6, gloss: 0.42, metal: 0.7 };
const BRASS: HyperMaterialOptions = { color: 0xe6c672, ambient: 0.55, gloss: 0.6, metal: 0.9 };
const DARK: HyperMaterialOptions = { color: 0x3a2e25, ambient: 0.5, gloss: 0.02 };
const PINE: HyperMaterialOptions = { color: 0xf8e4b0, ambient: 0.68, gloss: 0.12, grain: 0.4 };
const LINEN: HyperMaterialOptions = { color: 0xd9cfba, ambient: 0.7, gloss: 0.02 };
const LINEN_FOLD: HyperMaterialOptions = { color: 0xe2d9c6, ambient: 0.7, gloss: 0.02 };
const PRIMED: HyperMaterialOptions = { color: 0xf1ecdf, ambient: 0.64, gloss: 0.04 };
const BEECH: HyperMaterialOptions = { color: 0xe8c592, ambient: 0.55, gloss: 0.36, grain: 0.22 };

const paint = (color: number): HyperMaterialOptions => ({ color, ambient: 0.62, gloss: 0.55 });

/**
 * The left pole, and the plane tangent to the ground sphere there.
 *
 * The path runs through x = 0, so x = -1 is a quarter turn to its left and the
 * mirror of the chess table's (1, 0, 0). Note that placeAlongPath cannot express
 * this point: a lateral offset of exactly a quarter turn is the degenerate case
 * where the perpendicular from the path stops being unique.
 */
const POLE = new Vector3(-1, 0, 0);
const TANGENT_A = new Vector3(0, 1, 0);
const TANGENT_B = new Vector3(0, 0, 1);

/** Ground-sphere unit vector -> a placement. */
function groundGV(v: Vector3) {
  return placeOnGround(Math.atan2(v.x, -v.z), Math.acos(Math.max(-1, Math.min(1, v.y))));
}

/** Where one easel stands, as a ground-sphere unit vector. */
function easelSpot(azimuth: number): Vector3 {
  const a = (azimuth * Math.PI) / 180;
  return POLE.clone()
    .multiplyScalar(Math.cos(RING))
    .addScaledVector(TANGENT_A, Math.sin(RING) * Math.cos(a))
    .addScaledVector(TANGENT_B, Math.sin(RING) * Math.sin(a))
    .normalize();
}

/** The three spots, and the pole they ring. Both read by the architecture
 *  station's world model, which draws this ring on its globe. */
export function easelSpots(): Vector3[] {
  return EASELS.map((spec) => easelSpot(spec.azimuth));
}

export function easelPole(): Vector3 {
  return POLE.clone();
}

/**
 * Yaw at `from` that points local -z at `to`.
 *
 * Measured rather than derived: a GyroVector built by translation carries a
 * parallel-transported frame, so an object out at the pole is not already
 * pointing anywhere in particular.
 */
function yawToward(from: Vector3, to: Vector3): number {
  const here = groundGV(from);
  const local = here.inverse().transformPoint(groundGV(to).point());
  return Math.atan2(-local.x, -local.z);
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const v3 = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);
const X = v3(1, 0, 0);
const Y = v3(0, 1, 0);
const Z = v3(0, 0, 1);
type Rgb = [number, number, number];

class Soup {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];

  tri(a: Vector3, b: Vector3, c: Vector3, out: Vector3, rgb?: Rgb[]): this {
    const n = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
    const flip = n.dot(out) < 0;
    if (flip) n.negate();
    const order = flip ? [a, c, b] : [a, b, c];
    const tints = rgb && (flip ? [rgb[0], rgb[2], rgb[1]] : rgb);
    order.forEach((p, i) => {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      if (tints) this.col.push(...tints[i]);
    });
    return this;
  }

  quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, out: Vector3, rgb?: Rgb[]): this {
    this.tri(a, b, c, out, rgb && [rgb[0], rgb[1], rgb[2]]);
    return this.tri(a, c, d, out, rgb && [rgb[0], rgb[2], rgb[3]]);
  }

  /** A quad cut along a-b so that no edge is long enough for the engine to cut it again. */
  strip(a: Vector3, b: Vector3, c: Vector3, d: Vector3, out: Vector3): this {
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / 0.25));
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      this.quad(a.clone().lerp(b, t0), a.clone().lerp(b, t1), d.clone().lerp(c, t1), d.clone().lerp(c, t0), out);
    }
    return this;
  }

  disc(centre: Vector3, u: Vector3, v: Vector3, r: number, sides: number, out: Vector3, turn = 0): this {
    const at = (i: number) => {
      const a = turn + (i / sides) * Math.PI * 2;
      return centre.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
    };
    for (let i = 1; i < sides - 1; i++) this.tri(at(0), at(i), at(i + 1), out);
    return this;
  }

  get empty(): boolean {
    return this.pos.length === 0;
  }

  done(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    if (this.col.length) g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    return g;
  }
}

function prism(profile: Point[], len: number): BufferGeometry {
  const soup = new Soup();
  let area = 0;
  profile.forEach(([x0, z0], i) => {
    const [x1, z1] = profile[(i + 1) % profile.length];
    area += x0 * z1 - x1 * z0;
  });
  const sign = Math.sign(area) || 1;
  profile.forEach(([x0, z0], i) => {
    const [x1, z1] = profile[(i + 1) % profile.length];
    soup.quad(v3(x0, 0, z0), v3(x1, 0, z1), v3(x1, len, z1), v3(x0, len, z0), v3(sign * (z1 - z0), 0, -sign * (x1 - x0)));
  });
  const flat = profile.map(([x, z]) => new Vector2(x, z));
  for (const [a, b, c] of ShapeUtils.triangulateShape(flat, [])) {
    for (const [y, out] of [[0, v3(0, -1, 0)], [len, Y]] as Array<[number, Vector3]>) {
      soup.tri(v3(profile[a][0], y, profile[a][1]), v3(profile[b][0], y, profile[b][1]), v3(profile[c][0], y, profile[c][1]), out);
    }
  }
  return soup.done();
}

function stick(w: number, d: number, len: number, c = 0.003): BufferGeometry {
  const x = w / 2;
  const z = d / 2;
  return grained(
    prism([[-x + c, -z], [x - c, -z], [x, -z + c], [x, z - c], [x - c, z], [-x + c, z], [-x, z - c], [-x, -z + c]], len),
    'y',
  );
}

function alongX(profile: Point[], len: number): BufferGeometry {
  const g = prism(profile, len);
  g.applyMatrix4(new Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  return g.translate(-len / 2, 0, 0);
}

function alongZ(profile: Point[], depth: number, front: number): BufferGeometry {
  return prism(profile, depth).rotateX(-Math.PI / 2).translate(0, 0, front);
}

function trim(g: BufferGeometry, axis: Vector3, n: Vector3, d: number): BufferGeometry {
  const p = g.attributes.position;
  const v = new Vector3();
  const k = axis.dot(n);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const over = v.dot(n) - d;
    if (over > 0) {
      v.addScaledVector(axis, -over / k);
      p.setXYZ(i, v.x, v.y, v.z);
    }
  }
  return g;
}

function dome(r: number): BufferGeometry {
  return new SphereGeometry(r, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1);
}

function blob(r: number, h: number, rnd: () => number): BufferGeometry {
  return new SphereGeometry(r, 9, 3, 0, Math.PI * 2, 0, Math.PI / 2)
    .scale(0.8 + rnd() * 0.5, h / r, 0.8 + rnd() * 0.5)
    .rotateY(rnd() * 6);
}

function drip(len: number, w: number): BufferGeometry {
  const pts: Point[] = [
    [-w * 0.9, 0], [-w * 0.5, -len * 0.12], [-w * 0.3, -len * 0.3], [-w * 0.3, -len * 0.8],
    [-w * 0.5, -len * 0.9], [-w * 0.4, -len * 0.97], [0, -len], [w * 0.4, -len * 0.97],
    [w * 0.5, -len * 0.9], [w * 0.3, -len * 0.8], [w * 0.3, -len * 0.3], [w * 0.6, -len * 0.1],
    [w, 0], [w * 0.5, w * 0.5], [-w * 0.4, w * 0.45],
  ];
  return new ShapeGeometry(trace(new Shape(), pts));
}

function smear(len: number, w: number, rnd: () => number): BufferGeometry {
  const pts: Point[] = [];
  const N = 11;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = 0.36 + rnd() * 0.14;
    pts.push([Math.cos(a) * r * len, Math.sin(a) * r * w]);
  }
  return new ShapeGeometry(trace(new Shape(), pts));
}

interface Stance {
  toEasel: Matrix4;
  foot: Vector3;
  up: Vector3;
  face: Vector3;
  len: number;
}

function stance(spec: EaselSpec): Stance {
  const toEasel = new Matrix4().makeTranslation(0, DECK, Z_FOOT).multiply(new Matrix4().makeRotationX(-spec.rake));
  const hinge = v3(0, HINGE_S, -0.0295).applyMatrix4(toEasel);
  const up = v3(0, Math.cos(spec.rear), Math.sin(spec.rear));
  const face = v3(0, -Math.sin(spec.rear), Math.cos(spec.rear));
  const top = hinge.clone().addScaledVector(face, -0.0165);
  const run = (top.y - DECK) / up.y;
  return { toEasel, up, face, foot: top.clone().addScaledVector(up, -run), len: run + 0.014 };
}

const LINK = (() => {
  const a = 0.0255;
  const b = 0.0105;
  const path = new CatmullRomCurve3(
    [v3(0.012, b, 0), v3(-0.012, b, 0), v3(-a, 0, 0), v3(-0.012, -b, 0), v3(0.012, -b, 0), v3(a, 0, 0)],
    true,
  );
  return new TubeGeometry(path, 8, 0.0033, 3, true);
})();
const LINK_PITCH = 0.038;

function chain(from: Vector3, to: Vector3, sag: number): BufferGeometry {
  const span = from.distanceTo(to);
  const count = Math.max(2, Math.round((span * (1 + 2.4 * (sag / span) ** 2)) / LINK_PITCH));
  const at = (t: number) => from.clone().lerp(to, t).add(v3(0, -sag * 4 * t * (1 - t), 0));
  const links: BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const along = at(t + 0.01).sub(at(t - 0.01)).normalize();
    const side = new Vector3().crossVectors(along, X).normalize();
    const basis = new Matrix4().makeBasis(along, i % 2 ? side : X, i % 2 ? X.clone().negate() : side);
    links.push(LINK.clone().applyMatrix4(basis.setPosition(at(t))));
  }
  for (const end of [from, to]) links.push(new TorusGeometry(0.0075, 0.0024, 4, 8).rotateY(Math.PI / 2).translate(end.x, end.y, end.z));
  return merge(links);
}

/** Colour of the picture at (u, v), as the shader will show it. */
function sampler(tex: Texture | null): (u: number, v: number) => Rgb {
  const bare: Rgb = [0.93, 0.91, 0.86];
  if (!tex) return () => bare;
  try {
    const N = 40;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = N;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(tex.image as CanvasImageSource, 0, 0, N, N);
    const data = ctx.getImageData(0, 0, N, N).data;
    return (u, v) => {
      const x = Math.min(N - 1, Math.max(0, Math.floor(u * N)));
      const y = Math.min(N - 1, Math.max(0, Math.floor((1 - v) * N)));
      const i = (y * N + x) * 4;
      return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
    };
  } catch {
    return () => bare;
  }
}

function canvas(w: number, h: number, bottom: number, tex: Texture | null, rnd: () => number): { parts: Part[]; face: BufferGeometry } {
  const parts: Part[] = [];
  const W = w + 2 * MARGIN;
  const H = h + 2 * MARGIN;
  const cy = bottom + H / 2;
  const colour = sampler(tex);
  const BACK = 0.002;

  const sides: Array<{ a: Vector3; o: Vector3; half: number; reach: number; uv: (t: number) => [number, number] }> = [
    { a: X, o: v3(0, -1, 0), half: w / 2, reach: h / 2, uv: (t) => [t, 0.012] },
    { a: X, o: Y, half: w / 2, reach: h / 2, uv: (t) => [t, 0.988] },
    { a: Y, o: v3(-1, 0, 0), half: h / 2, reach: w / 2, uv: (t) => [0.012, t] },
    { a: Y, o: X, half: h / 2, reach: w / 2, uv: (t) => [0.988, t] },
  ];

  const margin = new Soup();
  const wrap = new Soup();
  const edge = new Soup();
  const fold = new Soup();
  const staples = new Soup();
  const centre = v3(0, cy, 0);
  const SEG = 18;
  for (const { a, o, half, reach, uv } of sides) {
    const at = (t: number, alongHalf: number, out: number, n: number) =>
      centre.clone().addScaledVector(a, (t * 2 - 1) * alongHalf).addScaledVector(o, out).add(v3(0, 0, n));
    const depth: number[] = [];
    const rgb: Rgb[] = [];
    for (let i = 0; i <= SEG; i++) {
      depth.push(0.004 + rnd() * 0.011);
      rgb.push(colour(...uv(i / SEG)));
    }
    for (let i = 0; i < SEG; i++) {
      const t0 = i / SEG;
      const t1 = (i + 1) / SEG;
      const tint = [rgb[i], rgb[i + 1], rgb[i + 1], rgb[i]];
      margin.quad(at(t0, half, reach, FACE_N), at(t1, half, reach, FACE_N), at(t1, half + MARGIN, reach + MARGIN, FACE_N), at(t0, half + MARGIN, reach + MARGIN, FACE_N), Z, tint);
      const out = reach + MARGIN;
      const wide = half + MARGIN;
      wrap.quad(at(t0, wide, out, FACE_N), at(t1, wide, out, FACE_N), at(t1, wide, out, FACE_N - depth[i + 1]), at(t0, wide, out, FACE_N - depth[i]), o, tint);
      edge.quad(at(t0, wide, out, FACE_N - depth[i]), at(t1, wide, out, FACE_N - depth[i + 1]), at(t1, wide, out, BACK), at(t0, wide, out, BACK), o);
    }

    const FOLDS = 14;
    const lap: number[] = [];
    for (let i = 0; i <= FOLDS; i++) lap.push(0.026 + rnd() * 0.009);
    const back = v3(0, 0, -1);
    for (let i = 0; i < FOLDS; i++) {
      const t0 = i / FOLDS;
      const t1 = (i + 1) / FOLDS;
      const out = reach + MARGIN - 0.0005;
      const wide = half + MARGIN - 0.0005;
      fold.quad(at(t0, wide, out, 0.0012), at(t1, wide, out, 0.0012), at(t1, wide - lap[i + 1], out - lap[i + 1], 0.0012), at(t0, wide - lap[i], out - lap[i], 0.0012), back);
    }
    const count = Math.round((2 * half) / 0.07);
    for (let i = 0; i < count; i++) {
      const mid = at((i + 0.5 + (rnd() - 0.5) * 0.3) / count, half - 0.02, reach + MARGIN - 0.011 - rnd() * 0.004, 0.0006);
      const run = a.clone().applyAxisAngle(Z, (rnd() - 0.5) * 0.5);
      const across = new Vector3().crossVectors(Z, run);
      const corner = (i: number, j: number) => mid.clone().addScaledVector(run, i * 0.006).addScaledVector(across, j * 0.0011);
      staples.quad(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), back);
    }
  }
  parts.push([margin.done(), { color: 0xffffff, ambient: 0.95, gloss: 0.02 }]);
  parts.push([wrap.done(), { color: 0xffffff, ambient: 0.7, gloss: 0.2 }]);
  parts.push([edge.done(), PRIMED]);
  parts.push([fold.done(), LINEN_FOLD]);
  parts.push([staples.done(), STEEL]);

  parts.push([new PlaneGeometry(W - 0.004, H - 0.004).rotateY(Math.PI).translate(0, cy, FACE_N - 0.0015), LINEN]);

  const BAR = 0.046;
  const DEEP = 0.02;
  const x1 = W / 2 - 0.0015;
  const y0 = bottom + 0.0015;
  const y1 = bottom + H - 0.0015;
  const bars: Array<[Point[], 'x' | 'y', number]> = [
    [[[-x1, y0], [x1, y0], [x1 - BAR, y0 + BAR], [-x1 + BAR, y0 + BAR]], 'x', 0xf8e4b0],
    [[[-x1, y1], [x1, y1], [x1 - BAR, y1 - BAR], [-x1 + BAR, y1 - BAR]], 'x', 0xf8e4b0],
    [[[-x1, y0], [-x1, y1], [-x1 + BAR, y1 - BAR], [-x1 + BAR, y0 + BAR]], 'y', 0xf3dba2],
    [[[x1, y0], [x1, y1], [x1 - BAR, y1 - BAR], [x1 - BAR, y0 + BAR]], 'y', 0xf3dba2],
    [[[-x1 + BAR, cy - 0.019], [x1 - BAR, cy - 0.019], [x1 - BAR, cy + 0.019], [-x1 + BAR, cy + 0.019]], 'x', 0xf5dfa8],
  ];
  for (const [profile, axis, color] of bars) {
    parts.push([grained(alongZ(profile, DEEP - BACK, DEEP), axis), { ...PINE, color }]);
  }

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cxn = sx * (x1 - BAR);
      const cyn = sy > 0 ? y1 - BAR : y0 + BAR;
      const keys: Point[][] = [
        [[cxn - sx * 0.004, cyn - sy * 0.001], [cxn - sx * 0.07, cyn - sy * 0.001], [cxn - sx * 0.004, cyn - sy * 0.021]],
        [[cxn - sx * 0.001, cyn - sy * 0.025], [cxn - sx * 0.001, cyn - sy * 0.09], [cxn - sx * 0.02, cyn - sy * 0.025]],
      ];
      for (const key of keys) parts.push([alongZ(key, 0.003, 0.012), BEECH]);
    }
  }

  const face = new PlaneGeometry(w, h, 1, 1).translate(0, cy, FACE_N);
  return { parts, face };
}

const loader = new TextureLoader();

function buildEasel(world: HyperWorld, spec: EaselSpec): HyperObject {
  const spot = easelSpot(spec.azimuth);
  const object = new HyperObject(groundGV(spot));
  // -z at the pole means +z, the painted face, points out of the ring.
  object.rotation.y = yawToward(spot, POLE);
  world.add(object);

  const finish = (tex: Texture | null): void => {
    const rnd = rng(spec.seed);
    const pick = () => PAINTS[Math.floor(rnd() * PAINTS.length)];
    const wood: HyperMaterialOptions = { color: spec.wood, ambient: 0.55, gloss: 0.36, grain: 0.22 };
    const { toEasel, foot, up, face: rearFace, len: rearLen } = stance(spec);
    const frame: Part[] = [];
    const direct: Part[] = [];
    const steel: BufferGeometry[] = [];
    const legX = (s: number) => FOOT_X - ((FOOT_X - TOP_X) * s) / LEG_S;

    const splay = Math.atan((FOOT_X - TOP_X) / LEG_S);
    const down = v3(0, -Math.cos(spec.rake), -Math.sin(spec.rake));
    const holes = new Soup();
    for (const sx of [-1, 1]) {
      const g = stick(LEG_W, LEG_D - 0.001, LEG_S / Math.cos(splay) + 0.1).translate(0, -0.05, -LEG_D / 2);
      g.rotateZ(sx * splay).translate(sx * FOOT_X, 0, 0);
      const axis = v3(-sx * Math.sin(splay), Math.cos(splay), 0);
      trim(g, axis, Y, LEG_S);
      trim(g, axis, down, 0);
      frame.push([g, wood]);
      for (let k = 0; k < HOLES; k++) {
        const s = HOLE0 + k * HOLE_STEP;
        holes.disc(v3(sx * legX(s), s, 0.0003), X, Y, 0.0066, 8, Z);
        holes.disc(v3(sx * legX(s), s, -LEG_D - 0.0003), X, Y, 0.0066, 8, v3(0, 0, -1));
      }
    }
    frame.push([holes.done(), DARK]);

    const peg = (): BufferGeometry =>
      lathe([[0.0001, -0.031], [0.0074, -0.03], [0.0078, 0.083], [0.012, 0.085], [0.0136, 0.093], [0.011, 0.1], [0.0001, 0.102]], 7).rotateX(Math.PI / 2);
    const pegs: BufferGeometry[] = [];
    const traySeat = HOLE0 + spec.trayHole * HOLE_STEP;
    for (const [sx, hole] of [[-1, spec.trayHole], [1, spec.trayHole], ...spec.spare]) {
      const s = HOLE0 + hole * HOLE_STEP;
      pegs.push(peg().translate(sx * legX(s), s, 0));
    }
    frame.push([grained(merge(pegs), 'z'), { ...wood, color: 0xd9b27c }]);

    const floor = traySeat + 0.03;
    const TRAY_W = 0.92;
    const tray: Point[] = [
      [0.001, -0.022], [0.079, -0.022], [0.081, -0.019], [0.081, 0.009], [0.078, 0.012],
      [0.07, 0.012], [0.067, 0.009], [0.067, 0], [0.001, 0],
    ];
    frame.push([grained(alongX(tray, TRAY_W).translate(0, floor, 0), 'x'), wood]);

    for (const s of [0.14, 0.66, 1.15]) {
      const len = 2 * (legX(s) - LEG_W / 2 + 0.004);
      frame.push([stick(0.05, 0.021, len).rotateZ(Math.PI / 2).translate(len / 2, s, -0.012), wood]);
      for (const sx of [-1, 1]) {
        steel.push(dome(0.0075).rotateZ((-sx * Math.PI) / 2).translate(sx * (legX(s) + LEG_W / 2 + 0.0005), s, -0.012));
      }
    }

    const head: Point[] = [[-0.0475, 1.535], [0.0475, 1.535], [0.0245, LEG_S], [-0.0245, LEG_S]];
    frame.push([grained(alongZ(head, 0.022, -0.001), 'y'), wood]);
    const plate: Point[] = [[-0.086, 1.55], [0.086, 1.55], [0.068, 1.648], [-0.068, 1.648]];
    frame.push([alongZ(plate, 0.002, 0.0018), STEEL]);
    for (const [x, s] of [[-0.062, 1.572], [0.062, 1.572], [-0.052, 1.63], [0.052, 1.63]]) {
      steel.push(dome(0.005).rotateX(Math.PI / 2).translate(x, s, 0.0018));
    }
    frame.push([new BoxGeometry(0.044, 0.05, 0.0016).translate(0, HINGE_S + 0.03, -0.0248), STEEL]);
    steel.push(new CylinderGeometry(0.0055, 0.0055, 0.048, 8).rotateZ(Math.PI / 2).translate(0, HINGE_S, -0.0295));

    const w0 = tex ? (tex.image as { width: number }).width : 1;
    const h0 = tex ? (tex.image as { height: number }).height : 1;
    const aspect = w0 / h0;
    const w = Math.min(spec.maxW, spec.maxH * aspect);
    const h = w / aspect;
    const top = floor + h + 2 * MARGIN;

    const MAST = 0.95;
    frame.push([stick(0.044, 0.021, MAST).translate(0, top + 0.002 - MAST, -0.0355), wood]);
    frame.push([new PlaneGeometry(0.008, 0.66).rotateY(Math.PI).translate(0, top - 0.46, -0.0463), DARK]);

    const PITCH = 0.022;
    const TEETH = 22;
    const rackBase = top - 0.74;
    const rack: Point[] = [[0.022, rackBase]];
    for (let k = 0; k <= TEETH; k++) {
      rack.push([0.025, rackBase + k * PITCH]);
      if (k < TEETH) rack.push([0.031, rackBase + k * PITCH]);
    }
    rack.push([0.022, rackBase + TEETH * PITCH]);
    frame.push([alongZ(rack, 0.0145, -0.0255), IRON]);

    const tooth = rackBase + Math.round((1.148 - rackBase) / PITCH) * PITCH;
    const pawl: Point[] = [[0.0298, tooth + 0.001], [0.036, tooth - 0.004], [0.079, tooth + 0.006], [0.079, tooth + 0.018], [0.066, tooth + 0.02]];
    frame.push([alongZ(pawl, 0.003, -0.0255), STEEL]);
    steel.push(dome(0.0045).rotateX(-Math.PI / 2).translate(0.072, tooth + 0.012, -0.0285));

    const nut = merge([
      new CylinderGeometry(0.012, 0.012, 0.0016, 10).translate(0, 0.0008, 0),
      new CylinderGeometry(0.0062, 0.0072, 0.008, 6).translate(0, 0.0056, 0),
      new CylinderGeometry(0.003, 0.003, 0.005, 6).translate(0, 0.012, 0),
      ...[-1, 1].map((sx) => new BoxGeometry(0.016, 0.012, 0.003).translate(sx * 0.0135, 0.0105, 0).rotateZ(-sx * 0.3)),
    ]);
    steel.push(nut.rotateY(rnd() * 3).rotateX(-Math.PI / 2).translate(0, 1.15, -0.0462));

    const strap = [
      new BoxGeometry(0.054, 0.03, 0.002).translate(0, 0.66, -0.0478),
      ...[-1, 1].flatMap((sx) => [
        new BoxGeometry(0.002, 0.03, 0.024).translate(sx * 0.026, 0.66, -0.0358),
        new BoxGeometry(0.026, 0.03, 0.002).translate(sx * 0.039, 0.66, -0.0248),
        dome(0.004).rotateX(-Math.PI / 2).translate(sx * 0.042, 0.66, -0.0258),
      ]),
    ];
    steel.push(...strap);

    const clamp: Point[] = [
      [-0.046, 0.002], [0.026, 0.002], [0.026, -0.011], [0.04, -0.011], [0.04, 0.03],
      [0.036, 0.034], [-0.042, 0.034], [-0.046, 0.03],
    ];
    frame.push([grained(alongX(clamp, 0.08).translate(0, top, 0), 'x'), wood]);
    for (const sx of [-1, 1]) frame.push([dome(0.0045).translate(sx * 0.013, top + 0.034, -0.035), BRASS]);

    const picture = canvas(w, h, floor, tex, rnd);
    frame.push(...picture.parts);

    const drips = Math.round(3 + spec.mess * 7);
    for (let i = 0; i < drips; i++) {
      const x = (rnd() - 0.5) * (TRAY_W - 0.1);
      const color = pick();
      const run = 0.012 + rnd() * 0.014;
      frame.push([drip(run, 0.0025 + rnd() * 0.0025).translate(x, floor + 0.0085, 0.0818), paint(color)]);
      if (rnd() < 0.6) frame.push([blob(0.006 + rnd() * 0.008, 0.003, rnd).translate(x + (rnd() - 0.5) * 0.03, floor + 0.012, 0.074), paint(color)]);
      const lying = spec.left === 'brush' && x > -0.42 && x < -0.08;
      if (rnd() < 0.7 && !lying) frame.push([blob(0.007 + rnd() * 0.011, 0.0035, rnd).translate(x + (rnd() - 0.5) * 0.06, floor, 0.034 + rnd() * 0.024), paint(pick())]);
    }
    for (const sx of [-1, 1]) {
      const runs = Math.round(1.5 + spec.mess * 3 * rnd());
      for (let i = 0; i < runs; i++) {
        const s = 0.12 + rnd() * (traySeat - 0.2);
        const long = Math.min(s - 0.03, 0.035 + rnd() * 0.06);
        frame.push([drip(long, 0.004 + rnd() * 0.0035).translate(sx * (legX(s) + 0.012 - rnd() * 0.004), s, 0.0006), paint(pick())]);
      }
      if (spec.mess > 0.5) {
        const s = 0.16 + rnd() * 0.06;
        frame.push([smear(0.03, 0.012, rnd).rotateZ(rnd() * 3).translate(sx * legX(s), s, 0.0006), paint(pick())]);
      }
    }

    if (spec.left === 'brush') {
      for (const [g, opts] of brush(0.25, 0.0048, false, 0x2f3338, 0xe6d9b4, 0xf08c3c, STEEL)) {
        frame.push([g.rotateZ(Math.PI / 2).rotateY(-0.05).translate(-0.12, floor + 0.0052, 0.048), opts]);
      }
    }

    frame.push([merge(steel), STEEL]);
    for (const [g] of frame) g.applyMatrix4(toEasel);
    picture.face.applyMatrix4(toEasel);

    const turn = new Matrix4().makeTranslation(foot.x, foot.y, foot.z).multiply(new Matrix4().makeRotationX(spec.rear));
    const rear = stick(0.044, 0.024, rearLen + 0.05).translate(0, -0.05, 0).applyMatrix4(turn);
    direct.push([trim(rear, up, v3(0, -1, 0), -DECK), wood]);
    direct.push([new BoxGeometry(0.04, 0.05, 0.0016).translate(0, rearLen - 0.042, 0.0128).applyMatrix4(turn), STEEL]);
    for (let i = 0; i < Math.round(spec.mess * 3); i++) {
      const at = rearLen * (0.45 + rnd() * 0.3);
      direct.push([smear(0.028, 0.014, rnd).rotateZ(rnd() * 3).rotateY(Math.PI).translate(0, at, -0.0126).applyMatrix4(turn), paint(pick())]);
    }

    const tie = foot.clone().addScaledVector(up, 0.2 / up.y).addScaledVector(rearFace, 0.021);
    const rail = v3(0, 0.14, -0.0325).applyMatrix4(toEasel);
    direct.push([chain(tie, rail, spec.sag), IRON]);
    direct.push([rod(tie.clone().addScaledVector(rearFace, -0.016), tie.clone().addScaledVector(rearFace, -0.006), 0.0024, 0.0024, 5), IRON]);
    direct.push([rod(v3(0, 0.14, -0.018).applyMatrix4(toEasel), v3(0, 0.14, -0.026).applyMatrix4(toEasel), 0.0024, 0.0024, 5), IRON]);

    for (const [g, opts] of [...frame, ...direct]) object.addGeometry(world.shared, g, opts);

    if (tex) {
      // No shadows either way: the linen back is 1.5 mm behind this plane and the shadow map cannot tell them apart.
      object.addGeometry(world.shared, picture.face, {
        map: tex,
        color: 0xffffff,
        ambient: 0.95,
        alphaTest: 0.05,
        alphaBlend: true,
        castShadow: false,
        receiveShadow: false,
      });
    }
  };

  loader.load(
    spec.url,
    (tex: Texture) => {
      tex.colorSpace = NoColorSpace;
      tex.minFilter = LinearMipmapLinearFilter;
      tex.magFilter = LinearFilter;
      tex.anisotropy = 8;
      finish(tex);
    },
    undefined,
    () => finish(null),
  );

  return object;
}

const SHEET = { cx: 0.16, cz: 0.2, turn: 0.31, lx: 2.3, lz: 1.9 };
/** The dust sheet takes this much of its texture's width; the strip beyond is the cloth the rag is cut from. */
const SHEET_U = 0.78;
const RAG_UV: [number, number] = [0.89, 0.5];

function sheetUv(x: number, z: number): [number, number] {
  const dx = x - SHEET.cx;
  const dz = z - SHEET.cz;
  const c = Math.cos(SHEET.turn);
  const s = Math.sin(SHEET.turn);
  return [(dx * c - dz * s) / SHEET.lx + 0.5, (dx * s + dz * c) / SHEET.lz + 0.5];
}

function sheetTexture(spills: Array<[number, number]>): Texture {
  const SIZE = 1024;
  const el = document.createElement('canvas');
  el.width = el.height = SIZE;
  const ctx = el.getContext('2d')!;
  const rnd = rng(77);
  const WIDE = SIZE * SHEET_U;
  const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

  ctx.fillStyle = '#ece5d2';
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,252,240,0.16)' : 'rgba(150,135,105,0.1)';
    const long = 20 + rnd() * 90;
    if (rnd() < 0.5) ctx.fillRect(rnd() * SIZE, rnd() * SIZE, long, 1);
    else ctx.fillRect(rnd() * SIZE, rnd() * SIZE, 1, long);
  }
  for (let i = 0; i < 16; i++) {
    const x = rnd() * SIZE;
    const y = rnd() * SIZE;
    const r = 60 + rnd() * 150;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(120,108,90,0.12)');
    g.addColorStop(1, 'rgba(120,108,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  for (const [fx, fy] of [[0.25, 0], [0.5, 0], [0.75, 0], [0, 1 / 3], [0, 2 / 3]]) {
    for (const [shift, tone] of [[-1.5, 'rgba(255,255,248,0.5)'], [1.5, 'rgba(120,105,80,0.28)']] as Array<[number, string]>) {
      ctx.strokeStyle = tone;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (fx) {
        ctx.moveTo(fx * WIDE + shift, 0);
        ctx.lineTo(fx * WIDE + shift, SIZE);
      } else {
        ctx.moveTo(0, fy * SIZE + shift);
        ctx.lineTo(WIDE, fy * SIZE + shift);
      }
      ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(140,125,98,0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.strokeRect(13, 13, WIDE - 26, SIZE - 26);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(205,195,172,0.5)';
  ctx.fillRect(0, 0, WIDE, 9);
  ctx.fillRect(0, SIZE - 9, WIDE, 9);
  ctx.fillRect(0, 0, 9, SIZE);
  ctx.fillRect(WIDE - 9, 0, 9, SIZE);

  // The sheet is not square and neither is its share of the texture: a round drop is this much narrower in texels.
  const narrow = SHEET.lz / SIZE / (SHEET.lx / WIDE);
  let squash = narrow;
  const dot = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.ellipse(x, y, r * squash * (0.8 + rnd() * 0.4), r * (0.8 + rnd() * 0.4), 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const splat = (x: number, y: number, r: number, color: number) => {
    ctx.fillStyle = css(color);
    for (let i = 0; i < 5; i++) dot(x + (rnd() - 0.5) * r * squash, y + (rnd() - 0.5) * r, r * (0.5 + rnd() * 0.5));
    const drops = 8 + Math.floor(rnd() * 16);
    for (let i = 0; i < drops; i++) {
      const a = rnd() * Math.PI * 2;
      const d = r * (1.3 + rnd() * rnd() * 5);
      dot(x + Math.cos(a) * d * squash, y + Math.sin(a) * d, r * (0.06 + rnd() * 0.22));
    }
  };
  for (const [u, v] of spills) {
    const marks = 7 + Math.floor(rnd() * 6);
    for (let i = 0; i < marks; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * 150;
      const x = Math.min(WIDE - 40, u * WIDE + Math.cos(a) * d * squash);
      const y = (1 - v) * SIZE + Math.sin(a) * d;
      splat(x, y, 3 + rnd() * rnd() * 20, PAINTS[Math.floor(rnd() * PAINTS.length)]);
    }
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = css(PAINTS[Math.floor(rnd() * PAINTS.length)]);
    dot(30 + rnd() * (WIDE - 60), 30 + rnd() * (SIZE - 60), 1 + rnd() * 4);
  }
  squash = 1;
  ctx.fillStyle = '#ece5d2';
  ctx.fillRect(WIDE, 0, SIZE - WIDE, SIZE);
  ctx.lineCap = 'round';
  for (let i = 0; i < 34; i++) {
    const x = RAG_UV[0] * SIZE + (rnd() - 0.5) * 180;
    const y = (1 - RAG_UV[1]) * SIZE + (rnd() - 0.5) * 430;
    if (i % 3 === 0) {
      ctx.fillStyle = css(PAINTS[Math.floor(rnd() * PAINTS.length)]);
      ctx.globalAlpha = 0.5 + rnd() * 0.4;
      for (let j = 0; j < 4; j++) dot(x + (rnd() - 0.5) * 26, y + (rnd() - 0.5) * 26, 8 + rnd() * 14);
      continue;
    }
    const a = rnd() * Math.PI;
    const long = 12 + rnd() * 34;
    ctx.strokeStyle = css(PAINTS[Math.floor(rnd() * PAINTS.length)]);
    ctx.globalAlpha = 0.55 + rnd() * 0.45;
    ctx.lineWidth = 5 + rnd() * 9;
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * long, y - Math.sin(a) * long);
    ctx.quadraticCurveTo(x + (rnd() - 0.5) * 20, y + (rnd() - 0.5) * 20, x + Math.cos(a) * long, y + Math.sin(a) * long);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const [u, v, color] of [[0.3, 0.62, 0x4a6fd0], [0.68, 0.3, 0xf5f1e6]] as Array<[number, number, number]>) {
    ctx.strokeStyle = css(color);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(u * WIDE, (1 - v) * SIZE, 36 * narrow, 36, 0, 0.4, 5.9);
    ctx.stroke();
  }

  const tex = new CanvasTexture(el);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 8;
  return tex;
}

function sheet(feet: Vector2[]): BufferGeometry {
  const NX = 24;
  const NZ = 20;
  const rnd = rng(5);
  const c = Math.cos(SHEET.turn);
  const s = Math.sin(SHEET.turn);
  const step = (lo: number, hi: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
  };
  const pos: number[] = [];
  const uv: number[] = [];
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      const u = i / NX;
      const v = j / NZ;
      const rim = Math.min(u, 1 - u, v, 1 - v);
      const border = rim === 0;
      const a = (u - 0.5) * SHEET.lx + (border ? (rnd() - 0.5) * 0.03 : 0) + 0.02 * Math.sin(v * 9);
      const b = (v - 0.5) * SHEET.lz + (border ? (rnd() - 0.5) * 0.03 : 0) + 0.018 * Math.sin(u * 7 + 1);
      const x = SHEET.cx + a * c + b * s;
      const z = SHEET.cz - a * s + b * c;
      const ruck =
        Math.abs(Math.sin(a * 3.1 + b * 1.7 + 0.6)) ** 3 * 0.6 +
        Math.abs(Math.sin(a * 1.3 - b * 4.2 + 2)) ** 4 * 0.5 +
        Math.abs(Math.sin(a * 6.3 + b * 5.1)) ** 5 * 0.3;
      let free = step(0, 0.1, rim);
      for (const foot of feet) free *= step(0.05, 0.2, Math.hypot(x - foot.x, z - foot.y));
      free *= step(0.22, 0.5, Math.hypot(x, z));
      pos.push(x, DECK + 0.0035 + 0.034 * ruck * free, z);
      uv.push(u * SHEET_U, v);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const k = j * (NX + 1) + i;
      index.push(k, k + NX + 1, k + 1, k + 1, k + NX + 1, k + NX + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function deck(): Part[] {
  const parts: Part[] = [];
  const R = DECK_INRADIUS;
  const COS = Math.cos(Math.PI / 6);
  const rnd = rng(301);
  const reach = (z: number) => (R - Math.abs(z) / 2) / COS;

  const ROWS = 24;
  const pitch = (2 * R) / ROWS;
  const nails = new Soup();
  for (let j = 0; j < ROWS; j++) {
    const z0 = -R + j * pitch + 0.003;
    const z1 = z0 + pitch - 0.006;
    const joint = (rnd() - 0.5) * 1.6;
    for (const [from, to] of [[-1, joint - 0.002], [joint + 0.002, 1]] as Array<[number, number]>) {
      const edge = (z: number, at: number) => (Math.abs(at) === 1 ? at * reach(z) : at);
      const board = new Soup().strip(v3(edge(z0, from), DECK, z0), v3(edge(z0, to), DECK, z0), v3(edge(z1, to), DECK, z1), v3(edge(z1, from), DECK, z1), Y);
      const tone = 0.86 + rnd() * 0.14;
      const warm = rnd() * 0.05;
      parts.push([
        grained(board.done(), 'x'),
        { color: (Math.round(0xcf * tone) << 16) | (Math.round(0xc8 * (tone - warm * 0.4)) << 8) | Math.round(0xba * (tone - warm)), ambient: 0.6, gloss: 0.07, grain: 0.34 },
      ]);
    }
    const inner = Math.min(reach(z0), reach(z1));
    for (const x of [-1.2, 0, 1.2, joint - 0.03, joint + 0.03]) {
      if (Math.abs(x) > inner - 0.04) continue;
      for (const z of [z0 + 0.03, z1 - 0.03]) nails.disc(v3(x, DECK + 0.0006, z), X, Z, 0.0055, 4, Y, rnd() * 3);
    }
  }
  parts.push([nails.done(), IRON]);

  const corner = (k: number, r: number, y: number) => v3(Math.sin((k + 0.5) * (Math.PI / 3)) * r, y, Math.cos((k + 0.5) * (Math.PI / 3)) * r);
  const under = new Soup();
  const band = new Soup();
  const C = R / COS;
  for (let k = 0; k < 6; k++) {
    const out = v3(Math.sin((k + 1) * (Math.PI / 3)), 0, Math.cos((k + 1) * (Math.PI / 3)));
    under.tri(v3(0, DECK - 0.012, 0), corner(k, C - 0.01, DECK - 0.012), corner(k + 1, C - 0.01, DECK - 0.012), Y);
    band.strip(corner(k, C, DECK - 0.028), corner(k + 1, C, DECK - 0.028), corner(k + 1, C, DECK), corner(k, C, DECK), out);
    band.strip(corner(k, C, DECK - 0.028), corner(k + 1, C, DECK - 0.028), corner(k + 1, C - 0.05, DECK - 0.028), corner(k, C - 0.05, DECK - 0.028), v3(0, -1, 0));
  }
  parts.push([under.done(), { color: 0x4a443c, ambient: 0.4, gloss: 0.02 }]);
  parts.push([band.done(), { color: 0xb4ab98, ambient: 0.58, gloss: 0.05 }]);

  const SKIRT: HyperMaterialOptions = { color: 0xc6dcd4, ambient: 0.72, gloss: 0.16, grain: 0.1 };
  const side = 2 * R * Math.tan(Math.PI / 6);
  const screws = new Soup();
  for (let k = 0; k < 6; k++) {
    const turn = k * (Math.PI / 3);
    const top = DECK - 0.028;
    for (const [y, tall] of [[(top - 0.03) / 2, top + 0.03]]) {
      const len = side - 0.1;
      const x = len / 2;
      const t = tall / 2;
      const z = R - 0.024;
      const plank = new Soup()
        .strip(v3(-x, y - t + 0.004, z), v3(x, y - t + 0.004, z), v3(x, y + t - 0.004, z), v3(-x, y + t - 0.004, z), Z)
        .strip(v3(-x, y + t - 0.004, z), v3(x, y + t - 0.004, z), v3(x, y + t, z - 0.004), v3(-x, y + t, z - 0.004), v3(0, 1, 1))
        .strip(v3(-x, y - t, z - 0.004), v3(x, y - t, z - 0.004), v3(x, y - t + 0.004, z), v3(-x, y - t + 0.004, z), v3(0, -1, 1));
      parts.push([grained(plank.done(), 'x').rotateY(turn), SKIRT]);
      for (const sx of [-1, 1]) {
        for (const dy of [0.004, 0.034]) {
          const at = v3(sx * (len / 2 - 0.035), y + dy, R - 0.0235).applyAxisAngle(Y, turn);
          screws.disc(at, v3(Math.cos(turn), 0, -Math.sin(turn)), Y, 0.0055, 6, v3(Math.sin(turn), 0, Math.cos(turn)));
        }
      }
    }
    const post = stick(0.085, 0.085, DECK - 0.028 + 0.05, 0.006).translate(0, -0.05, C - 0.07);
    parts.push([post.rotateY(turn + Math.PI / 6), SKIRT]);
  }
  parts.push([screws.done(), IRON]);
  return parts;
}

function brush(len: number, r: number, flat: boolean, handle: number, hair: number, tip: number, metal: HyperMaterialOptions): Part[] {
  const grip = len * 0.68;
  const band = len * 0.13;
  const tuft = len - grip - band;
  const y1 = grip + band;
  const shape = (g: BufferGeometry): BufferGeometry => {
    if (!flat) return g;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = Math.max(0, Math.min(1, (p.getY(i) - grip) / band));
      p.setXYZ(i, p.getX(i) * (1 + 0.7 * t), p.getY(i), p.getZ(i) * (1 - 0.62 * t));
    }
    return g;
  };
  const end: Array<[number, number]> = flat
    ? [[r * 1.02, y1 + tuft * 0.55], [r * 0.98, len - 0.001], [0.0001, len]]
    : [[r * 1.08, y1 + tuft * 0.5], [r * 0.6, y1 + tuft * 0.82], [0.0001, len]];
  return [
    [lathe([[0.0001, 0], [r * 0.5, 0.003], [r * 0.8, grip * 0.4], [r * 1.05, grip * 0.75], [r * 0.82, grip]], 7), { color: handle, ambient: 0.58, gloss: 0.6 }],
    [shape(lathe([[r * 0.82, grip], [r * 0.95, grip + band * 0.2], [r, y1]], 7)), metal],
    [shape(lathe([[r, y1], [r * 1.04, y1 + tuft * 0.5]], 7)), { color: hair, ambient: 0.62, gloss: 0.05 }],
    [shape(lathe([[r * 1.04, y1 + tuft * 0.5], ...end], 7)), paint(tip)],
  ];
}

function cloth(rows: Vector3[][], uv: (i: number, k: number) => [number, number], facing: Vector3): BufferGeometry {
  const pos: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  const n = rows[0].length;
  rows.forEach((row, k) =>
    row.forEach((p, i) => {
      pos.push(p.x, p.y, p.z);
      uvs.push(...uv(i, k));
    }),
  );
  const flip = new Vector3().subVectors(rows[0][1], rows[0][0]).cross(new Vector3().subVectors(rows[1][0], rows[0][0])).dot(facing) < 0;
  for (let k = 0; k < rows.length - 1; k++) {
    for (let i = 0; i < n - 1; i++) {
      const q = k * n + i;
      if (flip) index.push(q, q + n, q + 1, q + 1, q + n, q + n + 1);
      else index.push(q, q + 1, q + n, q + 1, q + n + 1, q + n);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function stool(): { parts: Part[]; rag: BufferGeometry[] } {
  const parts: Part[] = [];
  const rnd = rng(912);
  const SEAT = 0.46;
  const RED: HyperMaterialOptions = { color: 0xea8468, ambient: 0.58, gloss: 0.3, grain: 0.08 };

  parts.push([
    grained(lathe([[0.0001, 0.425], [0.185, 0.425], [0.198, 0.431], [0.202, 0.443], [0.198, 0.455], [0.188, SEAT], [0.0001, SEAT]], 24), 'x'),
    BEECH,
  ]);
  const legs: BufferGeometry[] = [];
  const at = (k: number, y: number) => {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const r = 0.13 + (0.07 * (0.43 - y)) / 0.44;
    return v3(Math.sin(a) * r, y, Math.cos(a) * r);
  };
  for (let k = 0; k < 4; k++) {
    const long = at(k, -0.012).distanceTo(at(k, 0.43));
    legs.push(aimed(lathe([[0.015, 0], [0.0165, long * 0.28], [0.0205, long * 0.31], [0.0205, long * 0.33], [0.0175, long * 0.36], [0.0185, long * 0.7], [0.021, long]], 8), at(k, -0.012), at(k, 0.43)));
    const y = k % 2 ? 0.2 : 0.135;
    legs.push(rod(at(k, y), at((k + 1) % 4, y), 0.0085, 0.0085, 6));
  }
  parts.push([merge(legs), RED]);

  const PAL_X = -0.06;
  const PAL_Z = 0.035;
  const DENT = -0.55;
  const radius = (a: number) => {
    const e = 1 / Math.hypot(Math.cos(a) / 0.125, Math.sin(a) / 0.09);
    const d = Math.atan2(Math.sin(a - DENT), Math.cos(a - DENT));
    return e * (1 - 0.3 * Math.exp(-((d / 0.4) ** 2)));
  };
  const outline: Point[] = [];
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    outline.push([Math.cos(a) * radius(a), Math.sin(a) * radius(a)]);
  }
  const board = trace(new Shape(), outline);
  const hx = Math.cos(DENT + 0.12) * 0.07;
  const hy = Math.sin(DENT + 0.12) * 0.07;
  board.holes.push(new Path().absellipse(hx, hy, 0.016, 0.011, 0, Math.PI * 2, true, DENT + 0.9));
  const TOP = SEAT + 0.0045;
  const onPalette = (g: BufferGeometry) => g.rotateY(0.25).translate(PAL_X, 0, PAL_Z);
  parts.push([
    grained(onPalette(new ExtrudeGeometry(board, { depth: 0.0035, bevelEnabled: true, bevelThickness: 0.0005, bevelSize: 0.0008, bevelSegments: 1, curveSegments: 8 }).rotateX(-Math.PI / 2).translate(0, SEAT + 0.0005, 0)), 'x'),
    { color: 0xb98a5c, ambient: 0.56, gloss: 0.3, grain: 0.24 },
  ]);
  const COLOURS = [0xf5f1e6, 0xf2c53a, 0xf08c3c, 0xe5533d, 0xbd4466, 0x8d66bd, 0x4a6fd0, 0x3fa07c];
  COLOURS.forEach((color, i) => {
    const a = 0.25 + (i / (COLOURS.length - 1)) * 3.4;
    const r = radius(a) * 0.78;
    parts.push([onPalette(blob(0.0095 + rnd() * 0.004, 0.006 + rnd() * 0.003, rnd).translate(Math.cos(a) * r, TOP, -Math.sin(a) * r)), paint(color)]);
  });
  for (const [x, z, color, size] of [[0.0, 0.0, 0x9db9a0, 0.03], [-0.035, 0.012, 0xe9a9a0, 0.022], [0.03, -0.018, 0x9fb3e0, 0.024], [-0.01, -0.03, 0xe0b46a, 0.018]]) {
    parts.push([onPalette(smear(size * 1.6, size, rnd).rotateX(-Math.PI / 2).rotateY(rnd() * 3).translate(x, TOP + 0.0006, z)), paint(color)]);
  }

  const JAR_X = 0.07;
  const JAR_Z = -0.14;
  const jar: Part[] = [];
  const GLASS: HyperMaterialOptions = { color: 0xd4ebe6, ambient: 0.72, gloss: 0.92 };
  jar.push([lathe([[0.0001, 0], [0.033, 0], [0.037, 0.005], [0.037, 0.052]], 16), { color: 0xa6a3c2, ambient: 0.66, gloss: 0.9 }]);
  jar.push([lathe([[0.037, 0.052], [0.037, 0.086], [0.033, 0.096], [0.031, 0.099], [0.031, 0.113], [0.0285, 0.113], [0.0285, 0.098], [0.0345, 0.087], [0.0345, 0.052]], 16), GLASS]);
  jar.push([merge([0.103, 0.108].map((y) => new TorusGeometry(0.0312, 0.0012, 3, 16).rotateX(Math.PI / 2).translate(0, y, 0))), GLASS]);
  jar.push([new CircleGeometry(0.0345, 16).rotateX(-Math.PI / 2).translate(0, 0.052, 0), { color: 0x8f8ba6, ambient: 0.6, gloss: 0.8 }]);
  const BRUSHES: Array<[number, number, boolean, number, number, number, HyperMaterialOptions]> = [
    [0.27, 0.0052, true, 0xd94f3d, 0xe6d9b4, 0x4a6fd0, STEEL],
    [0.23, 0.0038, false, 0x2f3338, 0x8a5a36, 0xe5533d, BRASS],
    [0.25, 0.0046, true, 0xe9c78a, 0xe6d9b4, 0xf2c53a, STEEL],
    [0.2, 0.003, false, 0x3f7fb0, 0x8a5a36, 0x3fa07c, BRASS],
    [0.29, 0.006, false, 0x3a8a68, 0xe6d9b4, 0xf5f1e6, STEEL],
  ];
  BRUSHES.forEach(([len, r, flat, handle, hair, tip, metal], i) => {
    const a = 0.4 + i * 1.257;
    const from = v3(Math.sin(a + 2.2) * 0.015, 0.006, Math.cos(a + 2.2) * 0.015);
    const lean = v3(Math.sin(a) * 0.0225, 0.113, Math.cos(a) * 0.0225).sub(from).normalize();
    const to = from.clone().add(lean);
    for (const [g, opts] of brush(len, r, flat, handle, hair, tip, metal)) jar.push([aimed(g.rotateY(a), from, to), opts]);
  });
  for (const [g, opts] of jar) parts.push([g.translate(JAR_X, SEAT, JAR_Z), opts]);


  const RAG_AT = 1.22;
  const path: Array<[number, number, number]> = [
    [0.1, SEAT + 0.0065, 0], [0.125, SEAT + 0.008, 0], [0.15, SEAT + 0.0065, 0], [0.172, SEAT + 0.0075, 0], [0.188, SEAT + 0.006, 0],
    [0.198, 0.4605, 0], [0.2046, 0.4535, 0], [0.207, 0.4435, 0.1],
    [0.2065, 0.42, 0.4], [0.2055, 0.39, 0.7], [0.2045, 0.36, 0.9], [0.2035, 0.33, 1], [0.203, 0.306, 1],
  ];
  const HALF = 0.068;
  const ACROSS = 8;
  const point = (i: number, k: number, inset: number): Vector3 => {
    const u = (i / ACROSS) * 2 - 1;
    const [r, y, hang] = path[k];
    const wave = hang * 0.008 * (0.5 + 0.5 * Math.sin(u * 6.5 + 1));
    const hem = k === path.length - 1 ? 0.016 * Math.sin(u * 2.3 + 0.7) : 0;
    const a = RAG_AT + (u * HALF * (1 - 0.12 * hang * Math.abs(u))) / Math.max(r, 0.15);
    const crease = k < 5 ? 0.0028 * Math.sin(u * 7 + k * 1.7) + 0.0014 * Math.sin(u * 13 - k * 2.3) : 0;
    return v3(Math.sin(a) * (r + wave - inset), y + hem + crease, Math.cos(a) * (r + wave - inset));
  };
  const uv = (i: number, k: number): [number, number] => [RAG_UV[0] + (i / ACROSS - 0.5) * 0.19, RAG_UV[1] + (k / (path.length - 1) - 0.5) * 0.44];
  const across = Array.from({ length: ACROSS + 1 }, (_, i) => i);
  const outer = path.map((_, k) => across.map((i) => point(i, k, 0)));
  const HANG = 6;
  const inner = path.slice(HANG).map((_, k) => across.map((i) => point(i, k + HANG, 0.0015)));
  const out = v3(Math.sin(RAG_AT), 0, Math.cos(RAG_AT));
  const rag = [cloth(outer, uv, Y), cloth(inner, (i, k) => uv(i, k + HANG), out.negate())];

  return { parts, rag };
}

function buildStudio(world: HyperWorld): HyperObject {
  const pole = groundGV(POLE);
  const object = new HyperObject(pole);
  const bearings = EASELS.map((spec) => {
    const local = pole.inverse().transformPoint(groundGV(easelSpot(spec.azimuth)).point());
    return Math.atan2(local.x, local.z);
  });
  object.rotation.y = bearings[0];

  const R0 = Math.tan(RING) / units(1);
  const feet: Vector2[] = [];
  const spills: Array<[number, number]> = [];
  const drops: Array<[Vector3, number]> = [];
  const rnd = rng(640);
  EASELS.forEach((spec, k) => {
    const turn = bearings[k] - bearings[0];
    const onDeck = (x: number, z: number) => new Vector2(x, R0 + z).rotateAround(new Vector2(), -turn);
    const rear = stance(spec).foot.z;
    feet.push(onDeck(-FOOT_X, Z_FOOT), onDeck(FOOT_X, Z_FOOT), onDeck(0, rear));
    const under = onDeck((rnd() - 0.5) * 0.3, rear + 0.35);
    spills.push(sheetUv(under.x, under.y));
    for (let i = 0; i < 4 + spec.mess * 9; i++) {
      const p = onDeck((rnd() - 0.5) * 0.9, Z_FOOT - 0.12 + rnd() * 0.3);
      drops.push([v3(p.x, DECK + 0.0008, p.y), 0.004 + rnd() * rnd() * 0.02]);
    }
  });

  const STOOL_R = 0.74;
  const STOOL_AT = (bearings[1] - bearings[0]) / 2;
  const seat = new Vector2(Math.sin(STOOL_AT) * STOOL_R, Math.cos(STOOL_AT) * STOOL_R);
  for (let k = 0; k < 4; k++) {
    const a = STOOL_AT + Math.PI + Math.PI / 4 + (k * Math.PI) / 2;
    feet.push(new Vector2(seat.x + Math.sin(a) * 0.2, seat.y + Math.cos(a) * 0.2));
  }
  spills.push(sheetUv(seat.x, seat.y), sheetUv(seat.x * 0.4, seat.y * 0.4));

  for (const [g, opts] of deck()) object.addGeometry(world.shared, g, opts);
  const onDeck = (g: BufferGeometry) => g.rotateY(STOOL_AT + Math.PI).translate(seat.x, DECK, seat.y);
  const standing = stool();
  for (const [g, opts] of standing.parts) object.addGeometry(world.shared, onDeck(g), opts);

  const spots = PAINTS.map(() => new Soup());
  for (const [at, r] of drops) {
    const [u, v] = sheetUv(at.x, at.z);
    if (u > -0.03 && u < 1.03 && v > -0.03 && v < 1.03) continue;
    spots[Math.floor(rnd() * PAINTS.length)].disc(at, X, Z, r, 7, Y, rnd() * 3);
  }
  spots.forEach((soup, i) => {
    if (!soup.empty) object.addGeometry(world.shared, soup.done(), paint(PAINTS[i]));
  });

  const cotton: HyperMaterialOptions = { map: sheetTexture(spills), color: 0xffffff, ambient: 0.66, castShadow: false };
  object.addGeometry(world.shared, sheet(feet), cotton);
  for (const g of standing.rag) object.addGeometry(world.shared, onDeck(g), cotton);

  world.add(object);
  return object;
}

export function buildEasels(world: HyperWorld): { objects: HyperObject[]; poi: Poi } {
  return {
    objects: [buildStudio(world), ...EASELS.map((spec) => buildEasel(world, spec))],
    poi: {
      id: 'easels',
      title: L('Art-ish Things, For Art’s Sake', 'Sanat için Sanatımsı Bi Şeyler'),
      body: L(
        'Digital images and video are another one of my hobbies. Some exist to give my absurdity a physical form, others to get the inside of my head out where it can be seen. Nothing I make is without a thought behind it — though some of them are not being understood at all. Perhaps that is on me for not explaining it well.',
        'Dijital resimler ve videolar hobilerimden bir diğeri. Bazıları absürtlüğümü materyalleştirmek, bazıları ise kafamın içini dışarı dökebilmek için varoldu. Arkasında bir düşünce olmayan içeriğim yok, ancak bazılarını anlayan da yok. Belki de anlatamadığım içindir.',
      ),
      gv: groundGV(POLE),
      radius: units(9),
    },
  };
}
