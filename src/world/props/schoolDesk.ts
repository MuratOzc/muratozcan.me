import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Path,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { RoundedBoxGeometry, grained, lathe, merge, smooth } from '../geometry';
import {
  HyperObject,
  type GyroVector,
  type HyperMaterialOptions,
  type HyperWorld,
} from '../../engine';
import { localizedCanvasTexture } from '../text';

interface Chalk {
  text: string;
  /** Left edge and centre line, in texture pixels. */
  x: number;
  y: number;
  size: number;
  /** Radians of tilt. Nothing on a real board is level. */
  rot: number;
  /** Chalk that went on lighter, or has been leaned on since. */
  tone?: string;
  underline?: boolean;
  ring?: boolean;
}

/**
 * Every line is the real arithmetic of this world: spherical Pythagoras and
 * the bearing beside it are what placement.ts uses to put each object where
 * it is, and the rest are the invariants the engine self-tests hold the
 * renderer to.
 *
 * Angle letters and side letters are kept apart on purpose: α β γ are always
 * interior angles, a b r are always arc lengths, φ is a bearing and θ is the
 * distance from the eye. Reuse one across two lines and the board stops being
 * checkable.
 */
const CHALK: Chalk[] = [
  { text: 'cos r = cos a · cos b', x: 48, y: 96, size: 76, rot: -0.03, underline: true },
  { text: 'K = +1', x: 1000, y: 88, size: 58, rot: 0.06 },

  { text: 'tan φ = tan b / sin a', x: 96, y: 216, size: 54, rot: 0.025 },
  { text: 'δ = s / sin θ', x: 790, y: 206, size: 60, rot: -0.05 },

  { text: 'sin α / sin a = sin β / sin b', x: 56, y: 332, size: 44, rot: -0.018, tone: '#c3d0bd' },
  { text: 'C = 2π sin r', x: 800, y: 326, size: 52, rot: 0.055 },

  { text: 'α + β + γ = π + E', x: 88, y: 448, size: 62, rot: 0.02 },
  { text: '2π ≡ 0', x: 880, y: 440, size: 68, rot: -0.07, ring: true },

  { text: 'Σ = 3π/2  ⇒  E = π/2', x: 60, y: 558, size: 44, rot: 0.04, tone: '#b9c6b4' },
  { text: 'A = 4π', x: 860, y: 546, size: 48, rot: -0.035 },

  { text: 'd(p,q) = 2 arctan |p ⊕ (−q)|', x: 76, y: 652, size: 40, rot: -0.022, tone: '#c3d0bd' },
  { text: 'r ∈ [0, π]', x: 900, y: 644, size: 38, rot: 0.05, tone: '#b9c6b4' },
];

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  family: string,
): void {
  let size = startPx;
  do {
    ctx.font = `400 ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 3;
  } while (size > 12);
}

function chalkboardTexture() {
  return localizedCanvasTexture(1280, 720, (ctx, w, h) => {
    ctx.fillStyle = '#2e4038';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#374a41';
    ctx.lineWidth = 30;
    for (let i = 0; i < 7; i++) {
      const y = 80 + i * 96;
      ctx.beginPath();
      ctx.moveTo(30, y + Math.sin(i * 2.1) * 16);
      ctx.lineTo(w - 30, y + Math.sin(i * 1.3 + 1) * 20);
      ctx.stroke();
    }

    // Greek and the maths signs are not in the script faces: without the text font at the end they render as tofu.
    const script = '"Segoe Script", "Comic Sans MS", "Segoe UI", cursive';

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (const line of CHALK) {
      ctx.save();
      ctx.translate(line.x, line.y);
      ctx.rotate(line.rot);

      fitText(ctx, line.text, w - line.x - 32, line.size, script);
      const tw = ctx.measureText(line.text).width;

      ctx.fillStyle = line.tone ?? '#e6ecdf';
      ctx.fillText(line.text, 0, 0);

      ctx.strokeStyle = ctx.fillStyle;
      if (line.underline) {
        ctx.lineWidth = 3;
        for (const [dy, from, to] of [[0.62, 0, 1], [0.72, 0.06, 0.93]]) {
          ctx.beginPath();
          ctx.moveTo(tw * from, line.size * dy);
          ctx.lineTo(tw * to, line.size * dy + 3);
          ctx.stroke();
        }
      }
      if (line.ring) {
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(tw / 2, 0, tw * 0.72, line.size * 0.82, 0.06, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  });
}

const LISTING = ['10 FOR I=1 TO 9', '20 PRINT I*I', '30 NEXT I', 'RUN', ' 1', ' 4', ' 9'];

function screenTexture() {
  return localizedCanvasTexture(512, 400, (ctx, w, h) => {
    ctx.fillStyle = '#0d1a10';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#7be08a';
    ctx.font = '600 42px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    LISTING.forEach((line, i) => ctx.fillText(line, 34, 20 + i * 46));
    ctx.fillRect(34, 20 + LISTING.length * 46, 24, 38);
    ctx.fillStyle = '#0a130baa';
    for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2);
  });
}

type Point = [number, number];
type Part = [BufferGeometry, HyperMaterialOptions];

const BEECH: HyperMaterialOptions = { color: 0xe8c592, ambient: 0.55, gloss: 0.38, grain: 0.22 };
const WALNUT: HyperMaterialOptions = { color: 0xb08258, ambient: 0.52, gloss: 0.16, grain: 0.26 };
const BEIGE: HyperMaterialOptions = { color: 0xebe3cf, ambient: 0.58, gloss: 0.3 };
const BEIGE_DARK: HyperMaterialOptions = { color: 0xd3cab4, ambient: 0.58, gloss: 0.25 };
const KEY_GREY: HyperMaterialOptions = { color: 0xb6b2a6, ambient: 0.58, gloss: 0.25 };
const DARK: HyperMaterialOptions = { color: 0x55585c, ambient: 0.55, gloss: 0.3 };
const STEEL: HyperMaterialOptions = { color: 0xdde1e4, ambient: 0.62, gloss: 0.5, metal: 0.6 };
const BRASS: HyperMaterialOptions = { color: 0xe6c672, ambient: 0.55, gloss: 0.6, metal: 0.9 };
const PAPER: HyperMaterialOptions = { color: 0xf7f3e6, ambient: 0.66, gloss: 0.06 };
const LEATHER: HyperMaterialOptions = { color: 0xcf9258, ambient: 0.55, gloss: 0.34 };
const STRAP: HyperMaterialOptions = { color: 0x94633a, ambient: 0.55, gloss: 0.3 };
const BEADS = [0xea6452, 0xf3cb52, 0x74c279, 0x62a1dc, 0xf19f50];

function trace<T extends Path>(path: T, points: Point[]): T {
  points.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
  path.closePath();
  return path;
}

function roundedRect<T extends Path>(path: T, w: number, h: number, r: number): T {
  const x = w / 2;
  const y = h / 2;
  path.moveTo(-x + r, -y);
  path.lineTo(x - r, -y);
  path.absarc(x - r, -y + r, r, -Math.PI / 2, 0, false);
  path.lineTo(x, y - r);
  path.absarc(x - r, y - r, r, 0, Math.PI / 2, false);
  path.lineTo(-x + r, y);
  path.absarc(-x + r, y - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(-x, -y + r);
  path.absarc(-x + r, -y + r, r, Math.PI, Math.PI * 1.5, false);
  return path;
}

function box(w: number, h: number, d: number, r = 0.006): BufferGeometry {
  return new RoundedBoxGeometry(w, h, d, 2, r);
}

function pos(g: BufferGeometry, x: number, y: number, z: number): BufferGeometry {
  return g.translate(x, y, z);
}

function across(profile: Point[], width: number, bevel: number): BufferGeometry {
  const g = new ExtrudeGeometry(trace(new Shape(), profile), {
    depth: width - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  g.translate(0, 0, -width / 2 + bevel);
  return g.rotateY(-Math.PI / 2);
}

function moved(parts: Part[], x: number, y: number, z: number, turn = 0): Part[] {
  for (const [g] of parts) {
    if (turn) g.rotateY(turn);
    g.translate(x, y, z);
  }
  return parts;
}

const BENCH_W = 1.2;
const DESK_TOP = 0.72;
const SEAT_TOP = 0.414;

function bench(): Part[] {
  const parts: Part[] = [];
  const W = BENCH_W;

  const side: Point[] = [
    [-0.22, 0],
    [0.74, 0],
    [0.74, 0.055],
    [0.645, 0.055],
    [0.645, 0.39],
    [0.735, 0.8],
    [0.685, 0.8],
    [0.598, 0.39],
    [0.4, 0.39],
    [0.4, 0.055],
    [0.02, 0.055],
    [0.02, 0.69],
    [-0.22, 0.69],
  ];
  for (const sx of [-1, 1]) {
    parts.push([grained(pos(across(side, 0.034, 0.004), sx * (W / 2 - 0.017), 0, 0), 'y'), BEECH]);
  }

  const top: Point[] = [
    [-0.28, 0],
    [0.24, 0],
    [0.24, 0.03],
    [-0.2, 0.03],
    [-0.212, 0.021],
    [-0.232, 0.021],
    [-0.244, 0.03],
    [-0.28, 0.03],
  ];
  parts.push([grained(pos(across(top, W + 0.05, 0.004), 0, DESK_TOP - 0.03, 0), 'x'), BEECH]);

  const inner = W - 0.066;
  parts.push([grained(pos(box(inner, 0.02, 0.22), 0, 0.52, -0.1), 'x'), BEECH]);
  parts.push([grained(pos(box(inner, 0.37, 0.018), 0, 0.505, -0.2), 'x'), BEECH]);
  parts.push([grained(pos(box(inner, 0.03, 0.045), 0, 0.13, -0.1), 'x'), BEECH]);
  parts.push([grained(pos(box(inner, 0.03, 0.045), 0, 0.2, 0.52), 'x'), BEECH]);

  for (const z of [0.42, 0.545]) {
    parts.push([grained(pos(box(W, 0.024, 0.115, 0.008), 0, SEAT_TOP - 0.012, z), 'x'), BEECH]);
  }
  const back = box(W, 0.14, 0.022, 0.008).rotateX(0.209);
  parts.push([grained(pos(back, 0, 0.68, 0.648), 'x'), BEECH]);

  const screw = new SphereGeometry(0.009, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2);
  const screws: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const [z, y] of [[-0.1, 0.52], [-0.1, 0.13], [0.52, 0.2], [0.662, 0.68]]) {
      const head = screw.clone();
      if (sx < 0) head.rotateY(Math.PI);
      screws.push(pos(head, sx * (W / 2), y, z));
    }
  }
  parts.push([merge(screws), BRASS]);

  return parts;
}

function keyboard(): Part[] {
  const light: BufferGeometry[] = [];
  const grey: BufferGeometry[] = [];
  const PITCH = 0.019;
  const key = (x: number, z: number, wide = 1): BufferGeometry =>
    pos(new BoxGeometry(PITCH * wide - 0.0035, 0.008, PITCH - 0.0035), x, 0.014, z);

  const left = -0.217 + PITCH / 2;
  for (let row = 0; row < 5; row++) {
    const z = -0.03 + row * PITCH;
    for (let col = 0; col < 15; col++) {
      if (row === 4 && col >= 4 && col <= 9) continue;
      const edge = col === 0 || col === 14 || row === 4;
      (edge ? grey : light).push(key(left + col * PITCH, z));
    }
  }
  light.push(key(left + 6.5 * PITCH, -0.03 + 4 * PITCH, 6));

  for (let col = 0; col < 15; col++) {
    if (col === 1 || col === 6 || col === 11) continue;
    (col === 0 ? grey : light).push(key(left + col * PITCH, -0.058));
  }

  const nav = left + 15 * PITCH + 0.008;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if (row === 2 || (row === 3 && col !== 1)) continue;
      grey.push(key(nav + col * PITCH, -0.03 + row * PITCH));
    }
  }
  const pad = nav + 3 * PITCH + 0.008;
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 4; col++) {
      (col === 3 || row === 0 ? grey : light).push(key(pad + col * PITCH, -0.03 + row * PITCH));
    }
  }

  const parts: Part[] = [
    [box(0.47, 0.02, 0.152, 0.006), BEIGE],
    [merge(light), { color: 0xf3eee0, ambient: 0.6, gloss: 0.22 }],
    [merge(grey), KEY_GREY],
  ];
  for (const [g] of parts) g.rotateX(0.07);
  return parts;
}

function computer(): { parts: Part[]; screen: BufferGeometry } {
  const parts: Part[] = [];
  const CW = 0.44;
  const CH = 0.115;
  const CD = 0.35;
  const FOOT = 0.008;
  const front = CD / 2;

  parts.push([pos(box(CW, CH, CD, 0.012), 0, FOOT + CH / 2, 0), BEIGE]);
  const feet: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      feet.push(pos(new CylinderGeometry(0.014, 0.014, FOOT, 10), sx * 0.18, FOOT / 2, sz * 0.13));
    }
  }
  parts.push([merge(feet), DARK]);

  parts.push([pos(box(CW - 0.03, 0.03, 0.004, 0.002), 0, FOOT + 0.028, front + 0.001), BEIGE_DARK]);
  const slits: BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) {
    slits.push(pos(new BoxGeometry(0.004, 0.02, 0.003), -0.19 + i * 0.009, FOOT + 0.028, front + 0.003));
  }
  for (const x of [0.005, 0.135]) {
    parts.push([pos(box(0.118, 0.032, 0.004, 0.002), x, FOOT + 0.08, front + 0.001), BEIGE_DARK]);
  }
  slits.push(pos(new BoxGeometry(0.096, 0.005, 0.003), 0.135, FOOT + 0.084, front + 0.003));
  parts.push([merge(slits), DARK]);
  parts.push([pos(box(0.016, 0.007, 0.005, 0.002), 0.172, FOOT + 0.072, front + 0.003), BEIGE]);
  parts.push([pos(box(0.024, 0.016, 0.007, 0.003), -0.17, FOOT + 0.082, front + 0.002), BEIGE_DARK]);
  parts.push([
    pos(new BoxGeometry(0.009, 0.005, 0.004), -0.135, FOOT + 0.082, front + 0.002),
    { color: 0x8dff9a, ambient: 1, gloss: 0.01 },
  ]);
  parts.push([
    pos(new BoxGeometry(0.009, 0.005, 0.004), -0.118, FOOT + 0.082, front + 0.002),
    { color: 0xb07a2a, ambient: 0.6, gloss: 0.4 },
  ]);

  const monitor: Part[] = [];
  const SW = 0.38;
  const SH = 0.31;
  const SD = 0.34;
  const shell = new RoundedBoxGeometry(SW, SH, SD, 3, 0.026);
  const p = shell.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const t = Math.max(0, (0.07 - z) / (0.07 + SD / 2));
    const k = 1 - 0.36 * t * t * (3 - 2 * t);
    p.setXYZ(i, p.getX(i) * k, (p.getY(i) + SH / 2) * k - SH / 2, z);
  }
  monitor.push([smooth(shell), BEIGE]);

  const ring = roundedRect(new Shape(), SW - 0.006, SH - 0.006, 0.024);
  ring.holes.push(roundedRect(new Path(), 0.29, 0.22, 0.02));
  const bezel = new ExtrudeGeometry(ring, {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.004,
    bevelSegments: 2,
    curveSegments: 5,
  });
  monitor.push([pos(bezel, 0, 0, SD / 2 - 0.002), BEIGE]);
  for (const x of [0.105, 0.132]) {
    const knob = new CylinderGeometry(0.0065, 0.0065, 0.008, 10).rotateX(Math.PI / 2);
    monitor.push([pos(knob, x, -SH / 2 + 0.022, SD / 2 + 0.018), BEIGE_DARK]);
  }
  monitor.push([
    pos(new BoxGeometry(0.01, 0.005, 0.004), -0.13, -SH / 2 + 0.022, SD / 2 + 0.016),
    { color: 0x8dff9a, ambient: 1, gloss: 0.01 },
  ]);

  const screen = new PlaneGeometry(0.3, 0.23, 2, 2);
  screen.translate(0, 0, SD / 2 + 0.004);

  const caseTop = FOOT + CH;
  const lift = caseTop + 0.03 + SH / 2;
  for (const g of [...monitor.map(([m]) => m), screen]) {
    g.rotateX(-0.07);
    g.translate(0, lift, 0);
  }
  parts.push(...monitor);
  parts.push([
    pos(lathe([[0.001, 0], [0.125, 0], [0.125, 0.008], [0.108, 0.02], [0.09, 0.026], [0.084, 0.05], [0.001, 0.05]], 20), 0, caseTop, -0.02),
    BEIGE,
  ]);

  return { parts, screen };
}

function mouse(): Part[] {
  const body = new RoundedBoxGeometry(0.058, 0.03, 0.095, 3, 0.014);
  const seams = merge([
    pos(new BoxGeometry(0.0012, 0.002, 0.04), 0, 0.0145, -0.026),
    pos(new BoxGeometry(0.052, 0.002, 0.0012), 0, 0.0145, -0.006),
  ]);
  return [
    [pos(body, 0, 0.015, 0), BEIGE],
    [pos(seams, 0, 0.015, 0), DARK],
  ];
}

function abacus(): Part[] {
  const parts: Part[] = [];
  const W = 0.34;
  const H = 0.33;
  const B = 0.022;
  const LIFT = 0.012;

  for (const sx of [-1, 1]) {
    parts.push([grained(pos(box(B, H, B, 0.004), sx * (W - B) / 2, LIFT + H / 2, 0), 'y'), BEECH]);
    parts.push([grained(pos(box(B + 0.008, 0.018, 0.14, 0.005), sx * (W - B) / 2, 0.009, 0), 'z'), BEECH]);
  }
  for (const y of [B / 2, H - B / 2]) {
    parts.push([grained(pos(box(W - B, B, B * 0.9, 0.004), 0, LIFT + y, 0), 'x'), BEECH]);
  }

  const reach = W / 2 - B;
  const LONG = 0.0165;
  const bead = lathe(
    [[0.0028, -LONG / 2], [0.0085, -LONG * 0.42], [0.0108, 0], [0.0085, LONG * 0.42], [0.0028, LONG / 2]],
    6,
  ).rotateZ(Math.PI / 2);
  const rods: BufferGeometry[] = [];
  const byColour: BufferGeometry[][] = BEADS.map(() => []);
  for (let row = 0; row < 10; row++) {
    const y = LIFT + H - B - 0.018 - row * ((H - 2 * B - 0.036) / 9);
    rods.push(pos(new CylinderGeometry(0.0022, 0.0022, W - B, 5).rotateZ(Math.PI / 2), 0, y, 0));
    for (let i = 0; i < 10; i++) {
      const x = i <= row ? -reach + LONG * (i + 0.5) : reach - LONG * (9 - i + 0.5);
      byColour[row % BEADS.length].push(pos(bead.clone(), x, y, 0));
    }
  }
  parts.push([merge(rods), STEEL]);
  byColour.forEach((beads, c) => {
    parts.push([merge(beads), { color: BEADS[c], ambient: 0.58, gloss: 0.55 }]);
  });
  return parts;
}

function pencil(colour: number): Part[] {
  const L = 0.15;
  const R = 0.0038;
  const lie = (g: BufferGeometry, x: number): BufferGeometry => pos(g.rotateZ(-Math.PI / 2), x, R, 0);
  return [
    [lie(new CylinderGeometry(R, R, L, 6), 0), { color: colour, ambient: 0.58, gloss: 0.5 }],
    [lie(new CylinderGeometry(0.0012, R, 0.014, 6), L / 2 + 0.007), { color: 0xf0d2a4, ambient: 0.58, gloss: 0.1 }],
    [lie(new CylinderGeometry(0.0002, 0.0012, 0.005, 6), L / 2 + 0.0165), DARK],
    [lie(new CylinderGeometry(R + 0.0003, R + 0.0003, 0.011, 8), -L / 2 - 0.0055), STEEL],
    [lie(new CylinderGeometry(R, R, 0.009, 8), -L / 2 - 0.0155), { color: 0xf2a39b, ambient: 0.6, gloss: 0.1 }],
  ];
}

function notebook(): Part[] {
  const parts: Part[] = [[pos(box(0.212, 0.003, 0.15, 0.001), 0, 0.0015, 0), { color: 0x6f8fc0, ambient: 0.58, gloss: 0.2 }]];
  for (const sx of [-1, 1]) {
    const page = box(0.101, 0.006, 0.142, 0.002).rotateZ(-sx * 0.03);
    parts.push([pos(page, sx * 0.0515, 0.0065, 0), PAPER]);
  }
  parts.push(...moved(pencil(0xf2c84b), 0.02, 0.0095, 0.01, 0.6));
  return parts;
}

function floppy(): Part[] {
  return [
    [pos(box(0.09, 0.0035, 0.094, 0.001), 0, 0.00175, 0), { color: 0x5e7396, ambient: 0.56, gloss: 0.3 }],
    [pos(new BoxGeometry(0.044, 0.001, 0.03), 0.008, 0.004, -0.031), STEEL],
    [pos(new BoxGeometry(0.07, 0.001, 0.046), 0, 0.004, 0.02), PAPER],
  ];
}

function satchel(): Part[] {
  const parts: Part[] = [];
  const W = 0.36;
  const H = 0.26;
  const D = 0.11;
  parts.push([pos(box(W, H, D, 0.03), 0, H / 2, 0), LEATHER]);
  parts.push([pos(box(W + 0.008, 0.014, D + 0.008, 0.007), 0, H - 0.004, 0), LEATHER]);
  parts.push([pos(box(W + 0.008, 0.15, 0.012, 0.006), 0, H - 0.072, D / 2 + 0.004), LEATHER]);
  for (const sx of [-1, 1]) {
    parts.push([pos(box(0.032, 0.19, 0.006, 0.002), sx * 0.095, H - 0.11, D / 2 + 0.012), STRAP]);
    const buckle = new TorusGeometry(0.014, 0.003, 5, 4).rotateZ(Math.PI / 4).scale(1.25, 1, 1);
    parts.push([pos(buckle, sx * 0.095, H - 0.165, D / 2 + 0.017), BRASS]);
  }
  const handle = new TorusGeometry(0.05, 0.008, 6, 14, Math.PI);
  parts.push([pos(handle, 0, H + 0.002, 0), STRAP]);
  return parts;
}

function board(width: number, height: number, centreY: number): Part[] {
  const parts: Part[] = [];
  const F = 0.07;

  const bars: Array<[number, number, number, number, 'x' | 'y']> = [
    [0, height / 2, width, F, 'x'],
    [0, -height / 2, width, F, 'x'],
    [width / 2 - F / 2 + 0.001, 0, F, height + F, 'y'],
    [-(width / 2 - F / 2 + 0.001), 0, F, height + F, 'y'],
  ];
  for (const [dx, dy, w, h, axis] of bars) {
    parts.push([grained(pos(box(w, h, 0.05, 0.012), dx, centreY + dy, 0), axis), WALNUT]);
  }
  parts.push([pos(box(width - F, height - F, 0.02, 0.004), 0, centreY, 0.002), { color: 0x6b6357, ambient: 0.5, gloss: 0.05 }]);
  parts.push([grained(pos(box(width - F, height - F, 0.008, 0.002), 0, centreY, -0.012), 'x'), { color: 0xd9bd92, ambient: 0.55, gloss: 0.1, grain: 0.2 }]);

  const postH = centreY + height / 2 + 0.1;
  const postX = width / 2 - 0.14;
  const Z = -0.046;
  for (const sx of [-1, 1]) {
    const x = sx * postX;
    parts.push([grained(pos(box(0.06, postH, 0.05, 0.008), x, 0.05 + postH / 2, Z), 'y'), WALNUT]);
    parts.push([grained(pos(box(0.075, 0.022, 0.065, 0.006), x, 0.05 + postH + 0.011, Z), 'x'), WALNUT]);
    parts.push([grained(pos(box(0.07, 0.06, 0.64, 0.014), x, 0.03, Z), 'z'), WALNUT]);
    for (const sz of [-1, 1]) {
      const brace = box(0.034, 0.44, 0.034, 0.006).rotateX(-sz * 0.607);
      parts.push([grained(pos(brace, x, 0.24, Z + sz * 0.15), 'y'), WALNUT]);
    }
  }
  parts.push([grained(pos(box(postX * 2 - 0.06, 0.045, 0.03, 0.006), 0, 0.3, Z), 'x'), WALNUT]);

  const trayY = centreY - height / 2 - 0.014;
  const trayW = width - 0.16;
  parts.push([grained(pos(box(trayW, 0.02, 0.09, 0.006), 0, trayY, 0.06), 'x'), WALNUT]);
  parts.push([grained(pos(box(trayW, 0.03, 0.014, 0.005), 0, trayY + 0.012, 0.105), 'x'), WALNUT]);

  const chalkY = trayY + 0.01 + 0.007;
  const sticks: Array<[number, number, number, number]> = [
    [-0.42, 0.075, 0.1, 0xf6f6f0],
    [-0.31, 0.05, -0.2, 0xf6f6f0],
    [0.18, 0.068, 0.05, 0xf5e394],
  ];
  for (const [x, long, turn, colour] of sticks) {
    const stick = new CylinderGeometry(0.007, 0.007, long, 8).rotateZ(Math.PI / 2).rotateY(turn);
    parts.push([pos(stick, x, chalkY, 0.065), { color: colour, ambient: 0.7, gloss: 0.02 }]);
  }
  parts.push([grained(pos(box(0.12, 0.022, 0.05, 0.005), 0.5, trayY + 0.01 + 0.027, 0.062), 'x'), BEECH]);
  parts.push([pos(box(0.12, 0.016, 0.05, 0.004), 0.5, trayY + 0.01 + 0.008, 0.062), DARK]);

  return parts;
}

export function buildSchoolDesk(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): HyperObject {
  const object = new HyperObject(at);
  object.rotation.y = yaw;
  const put = (parts: Part[], node: Group): void => {
    for (const [g, opts] of parts) object.addGeometry(world.shared, g, opts, node);
  };

  const boardNode = new Group();
  boardNode.position.set(-0.5, 0, -0.6);
  boardNode.rotation.y = -0.16;
  object.add(boardNode);

  const BOARD_W = 2.4;
  const BOARD_H = 1.3;
  const BOARD_CY = 1.2;
  put(board(BOARD_W, BOARD_H, BOARD_CY), boardNode);

  const chalkFace = new PlaneGeometry(BOARD_W - 0.07, BOARD_H - 0.07, 8, 5);
  chalkFace.translate(0, BOARD_CY, 0.016);
  object.addGeometry(
    world.shared,
    chalkFace,
    {
      map: chalkboardTexture(),
      color: 0xffffff,
      ambient: 0.92,
      castShadow: false,
      receiveShadow: false,
    },
    boardNode,
  );

  const deskNode = new Group();
  deskNode.position.set(1.5, 0, 0.1);
  deskNode.rotation.y = 0.12;
  object.add(deskNode);

  put(bench(), deskNode);

  const PC_X = -0.28;
  const pc = computer();
  put(moved(pc.parts, PC_X, DESK_TOP, -0.095), deskNode);
  pc.screen.translate(PC_X, DESK_TOP, -0.095);
  object.addGeometry(
    world.shared,
    pc.screen,
    {
      map: screenTexture(),
      color: 0xffffff,
      ambient: 0.98,
      castShadow: false,
      receiveShadow: false,
    },
    deskNode,
  );
  put(moved(keyboard(), PC_X, DESK_TOP + 0.011, 0.158), deskNode);
  put(moved(mouse(), 0.03, DESK_TOP, 0.16, 0.12), deskNode);

  const lead = new CatmullRomCurve3([
    new Vector3(0.024, DESK_TOP + 0.01, 0.112),
    new Vector3(0.036, DESK_TOP + 0.004, 0.02),
    new Vector3(0.0, DESK_TOP + 0.004, -0.12),
    new Vector3(-0.03, DESK_TOP + 0.004, -0.24),
    new Vector3(-0.1, DESK_TOP + 0.02, -0.262),
  ]);
  put([[new TubeGeometry(lead, 28, 0.003, 5), BEIGE_DARK]], deskNode);

  put(moved(abacus(), 0.36, DESK_TOP, -0.11, -0.22), deskNode);
  put(moved(notebook(), 0.33, DESK_TOP, 0.13, 0.14), deskNode);
  put(moved(pencil(0xe8604e), 0.2, DESK_TOP - 0.009, -0.222), deskNode);
  put(moved(floppy(), -0.22, SEAT_TOP, 0.48, 0.35), deskNode);

  const bag = satchel();
  for (const [g] of bag) {
    g.rotateX(-0.16);
    g.rotateY(-Math.PI / 2 + 0.25);
  }
  put(moved(bag, -(BENCH_W / 2 + 0.11), 0, 0.42), deskNode);

  world.add(object);
  return object;
}
