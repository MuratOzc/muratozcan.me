import {
  BoxGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  DataTexture,
  ExtrudeGeometry,
  LinearFilter,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  Shape,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  WebGLRenderTarget,
  type BufferGeometry,
} from 'three';
import {
  HyperObject,
  type GyroVector,
  type HyperMaterial,
  type HyperMaterialOptions,
  type HyperWorld,
} from '../../engine';
import {
  box,
  grained,
  lathe,
  merge,
  pos,
  rod,
  roundedRect,
  trace,
  type Part,
} from '../geometry';
import { L, t, type Localized } from '../../content/i18n';
import { localizedCanvasTexture, shrinkToFit } from '../text';

/**
 * Station 5: frontend — a browser window standing in a field, showing this
 * site.
 *
 * Not a screenshot. The page is a live second render of the world from the
 * visitor's own viewpoint, so whatever you are looking at is in the window,
 * including the window. Two render targets ping-pong: the page samples last
 * frame's image while this frame is drawn into the other one, which means the
 * window inside the picture is showing the frame before that, and so on down.
 *
 * From the front it is all there is to see. Walk round it and it is a stage
 * flat a finger thick, clamped to two light stands, with the wiring taped to
 * its back.
 *
 * Cost is one extra scene pass, a few times a second and only while the
 * window is on screen. The shadow map is NOT re-rendered: the feed camera
 * shares the viewer's chart, so the existing map is already correct for it,
 * which is the whole reason the feed uses the viewer's viewpoint rather than
 * an independent one.
 */

const FEED_W = 640;
const FEED_H = 400;
/** Sine of the apparent half-angle at which the feed runs at its full rate. */
const FULL_RATE_SIZE = 0.3;
const MAX_INTERVAL = 2;
/** Page size in authored units: matches the feed's 1.6 aspect. */
const SCREEN_W = 1.04;
const SCREEN_H = 0.65;
/** Eye level: the viewer is one authored unit tall. */
const SCREEN_Y = 1.02;
const TILT = -0.12;

const BAR_H = 0.13;
const MARGIN = 0.025;
const WIN_W = SCREEN_W + MARGIN * 2;
const WIN_H = SCREEN_H + BAR_H + MARGIN;
const WIN_CY = (BAR_H - MARGIN) / 2;
const SHEET_T = 0.012;
/** Panel-local z of the sheet's faces. The page plane is at 0, a few millimetres proud of the front. */
const FRONT = -0.006;
const BACK = FRONT - SHEET_T - 0.004;

const PAD_TOP = 0.09;
const LEG_X = 0.36;

const WINDOW: HyperMaterialOptions = { color: 0xe4e9ee, ambient: 0.84, gloss: 0.45 };
const STAGE_BLACK: HyperMaterialOptions = { color: 0x5c6066, ambient: 0.62, gloss: 0.06 };
const PINE: HyperMaterialOptions = { color: 0xf2dcb2, ambient: 0.68, gloss: 0.1, grain: 0.2 };
const PLY: HyperMaterialOptions = { color: 0xe8cfa2, ambient: 0.68, gloss: 0.1, grain: 0.14 };
const STEEL: HyperMaterialOptions = { color: 0xdde1e4, ambient: 0.64, gloss: 0.5, metal: 0.6 };
const ALUMINIUM: HyperMaterialOptions = { color: 0xe2e5e8, ambient: 0.68, gloss: 0.5, metal: 0.7 };
const ANODISED: HyperMaterialOptions = { color: 0x5a5f66, ambient: 0.62, gloss: 0.55, metal: 0.35 };
const RUBBER: HyperMaterialOptions = { color: 0x55585d, ambient: 0.6, gloss: 0.1 };
const BLACK_PLASTIC: HyperMaterialOptions = { color: 0x5c6168, ambient: 0.62, gloss: 0.4 };
const CABLE: HyperMaterialOptions = { color: 0x55595f, ambient: 0.6, gloss: 0.2 };
const GAFFER_YELLOW: HyperMaterialOptions = { color: 0xffe066, ambient: 0.72, gloss: 0.15 };
const SILVER_TAPE: HyperMaterialOptions = { color: 0xb9bfc5, ambient: 0.68, gloss: 0.45 };
const CARDBOARD: HyperMaterialOptions = { color: 0xe0bf8f, ambient: 0.68, gloss: 0.03, grain: 0.1 };
const PLASTIC: HyperMaterialOptions = { color: 0xf5f4ef, ambient: 0.74, gloss: 0.35 };
const CONCRETE: HyperMaterialOptions = { color: 0xc9c7c0, ambient: 0.62, gloss: 0.03 };

export interface MonitorResult {
  object: HyperObject;
  tick: (worldGV: GyroVector, dt: number) => void;
}

function makeTarget(): WebGLRenderTarget {
  const t = new WebGLRenderTarget(FEED_W, FEED_H);
  // Sampled raw by the hyper shader, so it must already be encoded the way
  // the main framebuffer is or the feed comes back washed out.
  t.texture.colorSpace = SRGBColorSpace;
  t.texture.minFilter = LinearFilter;
  t.texture.magFilter = LinearFilter;
  return t;
}

function tilted<T extends BufferGeometry>(g: T): T {
  g.rotateX(TILT);
  g.translate(0, SCREEN_Y, 0);
  return g;
}

function standing(x: number, y: number, z: number): Vector3 {
  return new Vector3(x, y, z).applyAxisAngle(new Vector3(1, 0, 0), TILT).add(new Vector3(0, SCREEN_Y, 0));
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, square = false): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, square ? 0 : r);
  ctx.arcTo(x, y + h, x, y, square ? 0 : r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function toolbarTexture() {
  const W = 1024;
  const H = 128;
  return localizedCanvasTexture(W, H, (ctx) => {
    ctx.clearRect(0, 0, W, H);
    const MONO = 'ui-monospace, Consolas, monospace';

    ctx.fillStyle = '#ffffff';
    pill(ctx, 150, 10, 330, 70, 16, true);
    ctx.fillRect(0, 62, W, H - 62);

    ctx.fillStyle = '#78b4ff';
    ctx.beginPath();
    ctx.arc(180, 36, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a424b';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `600 24px ${MONO}`;
    ctx.fillText('muratozcan.me', 204, 37);
    ctx.fillStyle = '#8c959f';
    ctx.fillText('×', 446, 36);
    ctx.fillText('localhost:5173', 512, 37);
    ctx.fillText('+', 760, 36);

    ctx.strokeStyle = '#6b747e';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [x, turn] of [[34, 1], [86, -1]]) {
      ctx.beginPath();
      ctx.moveTo(x + turn * 9, 83);
      ctx.lineTo(x - turn * 9, 95);
      ctx.lineTo(x + turn * 9, 107);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(138, 95, 12, 0.5, Math.PI * 1.75);
    ctx.stroke();

    ctx.fillStyle = '#edf0f3';
    pill(ctx, 176, 72, 740, 46, 23);
    ctx.fillStyle = '#6b747e';
    ctx.fillRect(196, 90, 16, 14);
    ctx.beginPath();
    ctx.arc(204, 90, 6, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#3a424b';
    ctx.font = `500 25px ${MONO}`;
    ctx.fillText('https://muratozcan.me', 226, 96);

    ctx.fillStyle = '#6b747e';
    for (const y of [82, 95, 108]) {
      ctx.beginPath();
      ctx.arc(972, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

interface Note {
  text: Localized;
  /** Centre, as a fraction of the back seen from behind. */
  u: number;
  v: number;
  turn: number;
  paper: string;
}

// Placed in the clear panels of the back: the stands cross at u 0.12 and 0.88, the middle rail at
// v 0.5, the router fills the upper right and its leads hang through the lower middle.
const NOTES: Note[] = [
  { text: L('TODO:\nfix CSS', 'TODO:\nCSS düzelt'), u: 0.25, v: 0.75, turn: -0.06, paper: '#fff0a0' },
  { text: L('works on\nmy machine', 'bende\nçalışıyor'), u: 0.41, v: 0.74, turn: 0.05, paper: '#ffc9d8' },
  { text: L('z-index:\n9999', 'z-index:\n9999'), u: 0.785, v: 0.75, turn: -0.04, paper: '#c9ecff' },
];
const NOTES_W = 1280;
const NOTES_H = 896;
const NOTE_PX = 190;

function fitted(ctx: CanvasRenderingContext2D, lines: string[], width: number, from: number, font: string): number {
  return shrinkToFit(from, 10, width, (size) => {
    ctx.font = font.replace('SIZE', String(size));
    return Math.max(...lines.map((line) => ctx.measureText(line).width));
  });
}

function notesTexture() {
  return localizedCanvasTexture(NOTES_W, NOTES_H, (ctx) => {
    ctx.clearRect(0, 0, NOTES_W, NOTES_H);
    const hand = '600 SIZEpx "Segoe Script", "Comic Sans MS", "Segoe UI", cursive';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const note of NOTES) {
      const lines = t(note.text).split('\n');
      ctx.save();
      ctx.translate(note.u * NOTES_W, note.v * NOTES_H);
      ctx.rotate(note.turn);
      const half = NOTE_PX / 2;
      ctx.fillStyle = note.paper;
      ctx.fillRect(-half, -half, NOTE_PX, NOTE_PX);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
      ctx.fillRect(-half, -half, NOTE_PX, 24);
      ctx.fillStyle = '#39424c';
      const size = fitted(ctx, lines, NOTE_PX - 26, 34, hand);
      lines.forEach((line, i) => ctx.fillText(line, 0, 12 + (i - (lines.length - 1) / 2) * size * 1.35));
      ctx.restore();
    }

    ctx.fillStyle = '#eef1f3';
    const left = 0.3 * NOTES_W;
    const room = 0.24 * NOTES_W;
    const title = [t(L('BACK', 'ARKA'))];
    ctx.font = hand.replace('SIZE', String(fitted(ctx, title, room, 84, hand)));
    ctx.fillText(title[0], left, 0.17 * NOTES_H);
    const under = t(L('nobody\nlooks here', 'buraya kimse\nbakmaz')).split('\n');
    const size = fitted(ctx, under, room, 40, hand);
    ctx.font = hand.replace('SIZE', String(size));
    under.forEach((line, i) => ctx.fillText(line, left, 0.29 * NOTES_H + i * size * 1.4));
  });
}

function cable(points: Vector3[], r = 0.006): BufferGeometry {
  return new TubeGeometry(new CatmullRomCurve3(points), Math.max(16, points.length * 10), r, 6);
}

function dome(r: number, flat = 0.5): BufferGeometry {
  return new SphereGeometry(r, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, flat, 1);
}

const BAT_W = 0.05;
const BAT_T = 0.022;
const RAILS = [WIN_CY - WIN_H / 2 + 0.045, WIN_CY, WIN_CY + WIN_H / 2 - 0.045];
const STILE_X = WIN_W / 2 - 0.05;

function windowParts(): Part[] {
  const bevel = 0.003;
  const sheet = new ExtrudeGeometry(roundedRect(new Shape(), WIN_W - bevel * 2, WIN_H - bevel * 2, 0.03), {
    depth: SHEET_T - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  const parts: Part[] = [
    [pos(sheet, 0, WIN_CY, FRONT - SHEET_T + bevel), WINDOW],
    [pos(box(WIN_W - 0.05, WIN_H - 0.05, 0.004, 0.001), 0, WIN_CY, BACK + 0.002), STAGE_BLACK],
  ];

  const lights: Array<[number, number]> = [[0xff8a80, 0], [0xffdd77, 1], [0x86e59a, 2]];
  for (const [colour, i] of lights) {
    parts.push([
      pos(dome(0.014, 0.45).rotateX(Math.PI / 2), -SCREEN_W / 2 + 0.03 + i * 0.042, SCREEN_H / 2 + BAR_H * 0.74, FRONT),
      { color: colour, ambient: 0.84, gloss: 0.8 },
    ]);
  }

  const battenZ = BACK - BAT_T / 2;
  for (const y of RAILS) {
    parts.push([grained(pos(box(STILE_X * 2 + BAT_W, BAT_W, BAT_T, 0.003), 0, y, battenZ), 'x'), PINE]);
  }
  for (const sx of [-1, 1]) {
    for (const [lo, hi] of [[RAILS[0], RAILS[1]], [RAILS[1], RAILS[2]]]) {
      const long = hi - lo - BAT_W;
      parts.push([grained(pos(box(BAT_W, long, BAT_T, 0.003), sx * STILE_X, (lo + hi) / 2, battenZ), 'y'), PINE]);
    }
  }

  const blockZ = BACK - BAT_T;
  const screws: BufferGeometry[] = [];
  const screwAt = (x: number, y: number): void => {
    screws.push(pos(dome(0.006).rotateX(-Math.PI / 2), x, y, blockZ - 0.006));
  };
  const LEG = 0.15;
  const corners: Array<[number, number, number]> = [
    [-1, -1, 0],
    [1, -1, Math.PI / 2],
    [1, 1, Math.PI],
    [-1, 1, -Math.PI / 2],
  ];
  for (const [sx, sy, turn] of corners) {
    const x = sx * (STILE_X + BAT_W / 2);
    const y = sy > 0 ? RAILS[2] + BAT_W / 2 : RAILS[0] - BAT_W / 2;
    const block = new ExtrudeGeometry(trace(new Shape(), [[0, 0], [LEG, 0], [0, LEG]]), { depth: 0.006, bevelEnabled: false });
    parts.push([grained(block.rotateZ(turn).translate(x, y, blockZ - 0.006), 'x'), PLY]);
    for (const [u, v] of [[0.025, 0.025], [0.085, 0.022], [0.022, 0.085], [0.055, 0.05]]) {
      screwAt(x + (Math.cos(turn) * u - Math.sin(turn) * v), y + (Math.sin(turn) * u + Math.cos(turn) * v));
    }
  }
  for (const sx of [-1, 1]) {
    parts.push([grained(pos(box(0.06, 0.13, 0.006, 0.002), sx * STILE_X, RAILS[1], blockZ - 0.003), 'y'), PLY]);
    for (const [u, v] of [[-0.015, -0.045], [0.015, -0.045], [-0.015, 0.045], [0.015, 0.045]]) {
      screwAt(sx * STILE_X + u, RAILS[1] + v);
    }
  }
  parts.push([merge(screws), STEEL]);

  const RX = -0.1;
  const RY = WIN_CY + 0.19;
  const rz = BACK - 0.02;
  parts.push([pos(box(0.25, 0.15, 0.04, 0.012), RX, RY, rz), BLACK_PLASTIC]);
  const slots: BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) slots.push(pos(new BoxGeometry(0.11, 0.005, 0.003), RX + 0.04, RY - 0.04 + i * 0.013, rz - 0.0205));
  parts.push([merge(slots), { color: 0x3f4349, ambient: 0.6, gloss: 0.2 }]);
  const leds: BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) leds.push(pos(new BoxGeometry(0.008, 0.005, 0.003), RX - 0.095 + i * 0.016, RY + 0.05, rz - 0.0205));
  parts.push([merge(leds), { color: 0x8dff9a, ambient: 1, gloss: 0.01 }]);
  for (const sx of [-1, 1]) {
    const root = new Vector3(RX + sx * 0.1, RY + 0.075, rz);
    parts.push([pos(new CylinderGeometry(0.009, 0.009, 0.02, 10), root.x, root.y + 0.005, root.z), BLACK_PLASTIC]);
    parts.push([
      rod(new Vector3(root.x, root.y + 0.012, root.z), new Vector3(root.x + sx * 0.02, root.y + 0.105, root.z - 0.012), 0.006, 0.0045, 8),
      BLACK_PLASTIC,
    ]);
  }
  for (const y of [RY - 0.085, RY + 0.085]) {
    parts.push([pos(box(0.3, 0.045, 0.002, 0.0006), RX + 0.01, y, BACK - 0.001), GAFFER_YELLOW]);
  }

  const strips: Array<[number, number, number, number, HyperMaterialOptions]> = [
    [-0.02, WIN_CY - 0.3, 0.12, 0.2, SILVER_TAPE],
    [-0.2, WIN_CY - 0.06, -0.5, 0.13, GAFFER_YELLOW],
  ];
  for (const [x, y, turn, long, tape] of strips) {
    parts.push([pos(box(long, 0.05, 0.002, 0.0006).rotateZ(turn), x, y, BACK - 0.001), tape]);
  }

  for (const [g] of parts) tilted(g);
  return parts;
}

function knob(at: Vector3, out: Vector3): Part[] {
  const tip = at.clone().addScaledVector(out, 0.045);
  return [
    [rod(at, tip, 0.004, 0.004, 6), STEEL],
    [rod(tip, tip.clone().addScaledVector(out, 0.014), 0.016, 0.016, 5), BLACK_PLASTIC],
  ];
}

function lightStand(x: number, z: number, top: number): Part[] {
  const parts: Part[] = [];
  const floor = PAD_TOP;
  const sections: Array<[number, number, number]> = [
    [floor + 0.05, floor + 0.6, 0.018],
    [floor + 0.56, floor + 0.98, 0.0145],
    [floor + 0.94, top, 0.011],
  ];
  sections.forEach(([lo, hi, r], i) => {
    parts.push([rod(new Vector3(x, lo, z), new Vector3(x, hi, z), r, r, 12), i === 2 ? ALUMINIUM : ANODISED]);
    if (i < 2) {
      parts.push([
        pos(lathe([[r + 0.001, 0], [r + 0.009, 0.004], [r + 0.009, 0.034], [r + 0.003, 0.042], [r - 0.003, 0.042]], 14), x, hi - 0.03, z),
        ANODISED,
      ]);
      parts.push(...knob(new Vector3(x, hi - 0.012, z - r - 0.006), new Vector3(0, 0, -1)));
    }
  });

  const collar = floor + 0.36;
  const hub = floor + 0.11;
  for (const y of [collar, hub]) {
    parts.push([pos(lathe([[0.019, 0], [0.034, 0.004], [0.034, 0.034], [0.019, 0.04]], 14), x, y - 0.02, z), ANODISED]);
  }
  parts.push(...knob(new Vector3(x + 0.03, collar, z), new Vector3(1, 0, 0)));
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + (k * Math.PI * 2) / 3;
    const dir = new Vector3(Math.cos(a), 0, Math.sin(a));
    const shoulder = new Vector3(x, collar, z).addScaledVector(dir, 0.03);
    const footAt = new Vector3(x, floor + 0.014, z).addScaledVector(dir, 0.36);
    parts.push([rod(footAt, shoulder, 0.0095, 0.0095, 8), ANODISED]);
    parts.push([rod(new Vector3(x, hub, z).addScaledVector(dir, 0.03), footAt.clone().lerp(shoulder, 0.45), 0.006, 0.006, 6), ANODISED]);
    parts.push([pos(new CylinderGeometry(0.014, 0.016, 0.028, 10), footAt.x, floor + 0.014, footAt.z), RUBBER]);
  }
  return parts;
}

function rigging(): Part[] {
  const parts: Part[] = [[pos(box(1.6, PAD_TOP, 1.6, 0.02), 0, PAD_TOP / 2, -0.36), CONCRETE]];
  const backZ = BACK - BAT_T;
  for (const sx of [-1, 1]) {
    const x = sx * LEG_X;
    const grip = standing(x, RAILS[2], backZ);
    const z = grip.z - 0.055;
    const top = grip.y + 0.03;
    parts.push(...lightStand(x, z, top));

    parts.push([pos(box(0.05, 0.06, 0.045, 0.008), x, grip.y, z), ANODISED]);
    parts.push([pos(box(0.05, 0.02, 0.034, 0.005), x, grip.y + 0.036, grip.z - 0.012), ANODISED]);
    parts.push([pos(box(0.05, 0.02, 0.034, 0.005), x, grip.y - 0.036, grip.z - 0.012), ANODISED]);
    parts.push(...knob(new Vector3(x, grip.y, z - 0.022), new Vector3(0, 0, -1)));

    const low = standing(x, RAILS[0], backZ);
    const from = new Vector3(x, PAD_TOP + 0.8, z);
    const elbow = from.clone().lerp(low, 0.5).add(new Vector3(sx * 0.03, 0.07, -0.02));
    parts.push([pos(lathe([[0.019, 0], [0.03, 0.004], [0.03, 0.03], [0.019, 0.034]], 12), x, from.y - 0.017, z), ANODISED]);
    parts.push([rod(from, elbow, 0.008, 0.008, 8), ALUMINIUM]);
    parts.push([rod(elbow, low, 0.008, 0.008, 8), ALUMINIUM]);
    parts.push([pos(new SphereGeometry(0.018, 10, 8), elbow.x, elbow.y, elbow.z), ANODISED]);
    parts.push(...knob(elbow, new Vector3(sx, 0, 0)));
    parts.push([pos(box(0.045, 0.04, 0.04, 0.006), low.x, low.y, low.z - 0.012), ANODISED]);

  }
  return parts;
}

function plug(at: Vector3): Part[] {
  return [
    [pos(new CylinderGeometry(0.019, 0.019, 0.03, 12), at.x, at.y + 0.015, at.z), BLACK_PLASTIC],
    [pos(new CylinderGeometry(0.008, 0.014, 0.022, 10), at.x, at.y + 0.041, at.z), BLACK_PLASTIC],
  ];
}

function mess(): Part[] {
  const parts: Part[] = [];
  const floor = PAD_TOP;

  const strip = new Vector3(0.08, floor, -0.62);
  const turn = 0.35;
  const along = new Vector3(Math.cos(turn), 0, -Math.sin(turn));
  parts.push([pos(box(0.4, 0.04, 0.066, 0.012).rotateY(turn), strip.x, floor + 0.02, strip.z), PLASTIC]);
  const wells: BufferGeometry[] = [];
  const socketAt = (i: number): Vector3 => strip.clone().addScaledVector(along, -0.14 + i * 0.075);
  for (let i = 0; i < 4; i++) {
    const at = socketAt(i);
    wells.push(pos(new CylinderGeometry(0.021, 0.021, 0.004, 14), at.x, floor + 0.0405, at.z));
  }
  parts.push([merge(wells), { color: 0xd9d8d2, ambient: 0.7, gloss: 0.2 }]);
  const rocker = strip.clone().addScaledVector(along, 0.168);
  parts.push([
    pos(box(0.026, 0.012, 0.03, 0.003).rotateY(turn), rocker.x, floor + 0.043, rocker.z),
    { color: 0xff7466, ambient: 0.95, gloss: 0.3 },
  ]);

  const leads: BufferGeometry[] = [];
  const routerFoot = standing(-0.1, WIN_CY + 0.115, BACK - 0.02);
  for (let i = 0; i < 2; i++) {
    const at = socketAt(i);
    parts.push(...plug(new Vector3(at.x, floor + 0.04, at.z)));
    leads.push(
      cable([
        routerFoot.clone().add(new Vector3(-0.03 + i * 0.06, 0, 0)),
        routerFoot.clone().add(new Vector3(-0.03 + i * 0.06, -0.24, -0.03)),
        new Vector3(-0.2 + i * 0.3, floor + 0.34, -0.2 - i * 0.04),
        new Vector3(at.x - 0.1 + i * 0.16, floor + 0.2, at.z + 0.16),
        new Vector3(at.x, floor + 0.13, at.z + 0.02),
        new Vector3(at.x, floor + 0.056, at.z),
      ]),
    );
  }
  parts.push([merge(leads), CABLE]);

  const end = strip.clone().addScaledVector(along, -0.2);
  const coil = new Vector3(-0.45, floor + 0.011, -0.86);
  const route: Vector3[] = [
    new Vector3(end.x, floor + 0.02, end.z),
    new Vector3(end.x - 0.1, floor + 0.011, end.z - 0.06),
    new Vector3(coil.x + 0.13, floor + 0.011, coil.z + 0.2),
  ];
  const LOOPS = 3;
  for (let i = 0; i <= LOOPS * 8; i++) {
    const a = -(i / 8) * Math.PI * 2;
    const r = 0.1 + 0.006 * Math.sin(i * 1.7);
    route.push(new Vector3(coil.x + Math.cos(a) * r, coil.y + (i / 8) * 0.017, coil.z + Math.sin(a) * r));
  }
  route.push(
    new Vector3(coil.x + 0.12, floor + 0.03, coil.z - 0.14),
    new Vector3(coil.x + 0.24, floor + 0.011, coil.z - 0.24),
    new Vector3(coil.x + 0.4, floor + 0.011, coil.z - 0.3),
    new Vector3(coil.x + 0.46, floor - 0.07, coil.z - 0.38),
  );
  parts.push([
    new TubeGeometry(new CatmullRomCurve3(route), route.length * 4, 0.009, 6),
    { color: 0xffa25a, ambient: 0.66, gloss: 0.25 },
  ]);

  const BX = 0.48;
  const BZ = -0.84;
  const side = 0.3;
  const deep = 0.22;
  const tall = 0.18;
  const carton: BufferGeometry[] = [pos(box(side, 0.006, deep, 0.001), 0, 0.003, 0)];
  for (const sz of [-1, 1]) carton.push(pos(box(side, tall, 0.006, 0.001), 0, tall / 2, sz * (deep / 2)));
  for (const sx of [-1, 1]) carton.push(pos(box(0.006, tall, deep, 0.001), sx * (side / 2), tall / 2, 0));
  for (const sz of [-1, 1]) {
    carton.push(box(side, 0.005, 0.1, 0.001).translate(0, 0, sz * 0.05).rotateX(sz * 0.9).translate(0, tall, sz * (deep / 2)));
  }
  for (const sx of [-1, 1]) {
    carton.push(box(0.1, 0.005, deep, 0.001).translate(sx * 0.05, 0, 0).rotateZ(-sx * 1.2).translate(sx * (side / 2), tall, 0));
  }
  const cardboard = merge(carton).rotateY(-0.4).translate(BX, floor, BZ);
  parts.push([grained(cardboard, 'x', 26, 2), CARDBOARD]);

  const roll = (): BufferGeometry =>
    lathe([[0.036, 0], [0.058, 0], [0.058, 0.05], [0.036, 0.05], [0.036, 0]], 22);
  parts.push([pos(roll(), -0.02, floor, -0.92), GAFFER_YELLOW]);
  parts.push([pos(roll(), 0.12, floor, -0.86), STAGE_BLACK]);

  parts.push([pos(lathe([[0.001, 0], [0.028, 0], [0.038, 0.1], [0.001, 0.1]], 16), -0.62, floor, -0.62), PLASTIC]);
  parts.push([pos(lathe([[0.039, 0.098], [0.041, 0.104], [0.034, 0.112], [0.001, 0.112]], 16), -0.62, floor, -0.62), BLACK_PLASTIC]);
  parts.push([pos(lathe([[0.0305, 0.03], [0.0355, 0.075]], 16), -0.62, floor, -0.62), CARDBOARD]);

  const driver: Part[] = [
    [lathe([[0.001, 0], [0.012, 0.004], [0.014, 0.04], [0.011, 0.075], [0.013, 0.09], [0.001, 0.092]], 10), { color: 0xff7466, ambient: 0.66, gloss: 0.5 }],
    [pos(new CylinderGeometry(0.0035, 0.0035, 0.11, 6), 0, 0.146, 0), STEEL],
  ];
  for (const [g, opts] of driver) {
    parts.push([g.rotateZ(Math.PI / 2).rotateY(0.9).translate(0.52, floor + 0.014, -0.5), opts]);
  }
  return parts;
}

export function buildMonitor(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): MonitorResult {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  const targets = [makeTarget(), makeTarget()];

  // The page starts on a real (if tiny) texture rather than on a render
  // target: until a target has actually been drawn into, its texture is
  // unbacked, and sampling it is an invalid operation. The ticker swaps in
  // the live feed once there is one.
  const warmUp = new DataTexture(new Uint8Array([20, 26, 32, 255]), 1, 1, RGBAFormat);
  warmUp.colorSpace = SRGBColorSpace;
  warmUp.needsUpdate = true;

  for (const [g, opts] of [...windowParts(), ...rigging(), ...mess()]) {
    object.addGeometry(world.shared, g, opts);
  }

  const bar = new PlaneGeometry(SCREEN_W, BAR_H, 6, 1);
  bar.translate(0, SCREEN_H / 2 + BAR_H / 2, FRONT + 0.004);
  object.addGeometry(world.shared, tilted(bar), {
    map: toolbarTexture(),
    color: 0xffffff,
    ambient: 0.92,
    alphaTest: 0.3,
    alphaBlend: true,
    castShadow: false,
    receiveShadow: false,
  });

  const notes = new PlaneGeometry(WIN_W - 0.14, (WIN_W - 0.14) * (NOTES_H / NOTES_W), 6, 4);
  notes.rotateY(Math.PI);
  notes.translate(0, WIN_CY, BACK - 0.004);
  object.addGeometry(world.shared, tilted(notes), {
    map: notesTexture(),
    color: 0xffffff,
    ambient: 0.9,
    alphaTest: 0.3,
    alphaBlend: true,
    castShadow: false,
    receiveShadow: false,
  });

  const screen = tilted(new PlaneGeometry(SCREEN_W, SCREEN_H, 1, 1));
  const screenMats: HyperMaterial[] = object.addLiveGeometry(world.shared, screen, {
    map: warmUp,
    color: 0xffffff,
    ambient: 1.0,
    castShadow: false,
    receiveShadow: false,
  });

  world.add(object);

  // Its own camera so the feed keeps a 1.6 aspect regardless of the browser
  // window; it borrows the viewer's orientation, and the hyper shader strips
  // view translation anyway, so orientation is all it needs.
  const feedCam = new PerspectiveCamera(world.camera.fov, FEED_W / FEED_H, 0.0005, 20);
  feedCam.rotation.order = 'YXZ';

  let frame = 0;
  let since = Infinity;
  const tick = (_worldGV: GyroVector, dt: number) => {
    // Tickers run BEFORE the world renders, so on the very first frame the
    // shadow map has not been drawn yet and its uniform is still null.
    // Rendering the scene then would sample a null sampler2DShadow, which is
    // an invalid operation. Wait for the world to have rendered once.
    if (!world.shared.uShadowMap.value) return;

    // The feed is a second full scene pass. The window can be in view from
    // anywhere on the sphere, so distance cannot gate it; whether it is on
    // screen at all can, and so can rate. Wall-clock rather than
    // every-Nth-frame: the cost must not scale with how fast the machine
    // happens to run.
    since += dt;
    const size = Math.min(1, object.viewSine / FULL_RATE_SIZE);
    const interval = Math.min(MAX_INTERVAL, world.quality.auxInterval / (size * size));
    if (since < interval || !object.inView) return;
    since = 0;

    const read = frame === 0 ? null : targets[frame % 2];
    const write = targets[(frame + 1) % 2];

    // Show the previous frame while drawing the next one into the other
    // target. Reading and writing the same texture is what a feedback loop
    // is not allowed to do, and the ping-pong is what buys the recursion.
    if (read) {
      for (const m of screenMats) {
        if (m.uniforms.uMap) m.uniforms.uMap.value = read.texture;
      }
    }

    feedCam.rotation.copy(world.camera.rotation);
    world.renderView(feedCam, write);

    frame++;
  };

  return { object, tick };
}
