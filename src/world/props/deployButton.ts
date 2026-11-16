import {
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  CurvePath,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LineCurve3,
  LinearFilter,
  Path,
  PlaneGeometry,
  QuadraticBezierCurve3,
  SRGBColorSpace,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Texture,
} from 'three';
import {
  HyperObject,
  geodesicRadius,
  unitToPoincare,
  type GyroVector,
  type HyperMaterial,
  type HyperMaterialOptions,
  type HyperWorld,
} from '../../engine';
import { L, onLangChange, t, upper } from '../../content/i18n';
import { isTouch } from '../../device';
import { across, box, grained, lathe, merge, pos, roundedRect, trace, type Part, type Point } from '../geometry';
import { units } from '../placement';
import { largestFitting, localizedCanvasTexture, shrinkToFit } from '../text';

const BLUE: HyperMaterialOptions = { color: 0x9cc4ea, ambient: 0.66, gloss: 0.38 };
const BLUE_DARK: HyperMaterialOptions = { color: 0x6f7f96, ambient: 0.6, gloss: 0.25 };
const STAINLESS: HyperMaterialOptions = { color: 0xdde1e4, ambient: 0.62, gloss: 0.5, metal: 0.6, grain: 0.1 };
const GALV: HyperMaterialOptions = { color: 0xcdd3d6, ambient: 0.6, gloss: 0.3, metal: 0.45 };
const CHROME: HyperMaterialOptions = { color: 0xeef1f3, ambient: 0.6, gloss: 0.8, metal: 0.9 };
const BLACK: HyperMaterialOptions = { color: 0x4a4d52, ambient: 0.55, gloss: 0.35 };
const FASCIA: HyperMaterialOptions = { color: 0x747a83, ambient: 0.6, gloss: 0.2 };
const RUBBER: HyperMaterialOptions = { color: 0x44474b, ambient: 0.55, gloss: 0.1 };
const RED: HyperMaterialOptions = { color: 0xea4a3c, ambient: 0.6, gloss: 0.55 };
const YELLOW: HyperMaterialOptions = { color: 0xf5cd3d, ambient: 0.6, gloss: 0.4 };
const CONCRETE: HyperMaterialOptions = { color: 0xc9c7c0, ambient: 0.62, gloss: 0.03 };
const CORK: HyperMaterialOptions = { color: 0xdcb681, ambient: 0.6, gloss: 0.02, grain: 0.3 };
const HARDBOARD: HyperMaterialOptions = { color: 0xab8763, ambient: 0.58, gloss: 0.15 };
const ALU: HyperMaterialOptions = { color: 0xd9dde0, ambient: 0.62, gloss: 0.4, metal: 0.5 };
const PAPER: HyperMaterialOptions = { color: 0xf7f3e6, ambient: 0.66, gloss: 0.06 };
const KRAFT: HyperMaterialOptions = { color: 0xcba978, ambient: 0.6, gloss: 0.05 };
const ENAMEL: HyperMaterialOptions = { color: 0xf4f1e8, ambient: 0.6, gloss: 0.6 };
const NAVY: HyperMaterialOptions = { color: 0x4f6fa3, ambient: 0.58, gloss: 0.5 };
const COFFEE: HyperMaterialOptions = { color: 0x70503a, ambient: 0.6, gloss: 0.6 };
const BRASS: HyperMaterialOptions = { color: 0xf0d488, ambient: 0.6, gloss: 0.6, metal: 0.55 };
const PVC: HyperMaterialOptions = { color: 0xb9bec2, ambient: 0.6, gloss: 0.25 };
const TAPE: HyperMaterialOptions = { color: 0xe9dcae, ambient: 0.64, gloss: 0.1 };
const PINS = [0xea4a3c, 0x4f8fd6, 0x5fbf73, 0xf5cd3d, 0xf4f1e8];

const DECAL: HyperMaterialOptions = { color: 0xffffff, ambient: 0.93, castShadow: false, receiveShadow: false };

const PAD_TOP = 0.06;
const DECK_TOP = 0.11;

const BEV = 0.006;
const HEAD: Point[] = [[-0.22, 0.52], [0.16, 0.52], [0.35, 0.575], [0.35, 0.615], [-0.01, 0.865], [-0.07, 1.32], [-0.22, 1.32]];
const SLOPE = Math.atan2(0.25, 0.36);
const LEAN = Math.atan2(0.06, 0.455);
const CONSOLE_TOP = 1.32 + BEV;
const PLATE_T = 0.006;
const BUTTON_Z = 0.01;
const HINGE_Y = PLATE_T + 0.012;
const HINGE_Z = BUTTON_Z - 0.1;
const GUARD_OPEN = 1.5;
const TRAVEL = 0.018;

const BOARD_Z = -0.6;
const POST_X = 1.0;
const POST_Z = -0.695;
const BEACON_Y = 2.21;
const CLOCK_AT: [number, number] = [-0.84, 1.27];
const CALENDAR_AT: [number, number] = [0.86, 1.26];

const T_GUARD = 0.32;
const T_PRESS = 0.38;
const T_BUILD = 0.62;
const T_TEST = 1.9;
const T_PROD = 3.4;
const T_FAIL = 5.4;
const T_DARK = 9.0;
const T_CLOSE = 9.3;
const BEACON_ON = 0.58;
const BEACON_OFF = 8.6;
const SPIN_UP = 0.7;
const SPIN_DOWN = 1.6;
const T_END = BEACON_OFF + SPIN_DOWN + 0.1;
// A whole number of turns over the run, so the reflector parks where it started.
const BEACON_RATE = (2 * Math.PI * 12) / (BEACON_OFF - BEACON_ON - SPIN_UP / 2 + SPIN_DOWN / 2);

const AIM_RANGE_UNITS = 3.2;
const AIM_RHO_UNITS = 0.15;
const AIM_MIN = 0.03;

const PROMPT = isTouch ? L('tap', 'dokun') : L('press E', 'E’ye bas');

const ease = (u: number) => u * u * (3 - 2 * u);
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

function spun(profile: Point[], segments: number, arc = Math.PI * 2): BufferGeometry {
  const g = lathe(profile, segments, arc);
  // three leaves the last ring of lathe normals unnormalised, and the crevice bake offsets its rays by the normal.
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const length = Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) || 1;
    n.setXYZ(i, n.getX(i) / length, n.getY(i) / length, n.getZ(i) / length);
  }
  return g;
}

function turned(profile: Point[], segments = 20): BufferGeometry {
  const runs: Point[][] = [[profile[0]]];
  for (let i = 1; i < profile.length; i++) {
    runs[runs.length - 1].push(profile[i]);
    if (i === profile.length - 1) break;
    const [ax, ay] = profile[i - 1];
    const [bx, by] = profile[i];
    const [cx, cy] = profile[i + 1];
    let turn = Math.abs(Math.atan2(cy - by, cx - bx) - Math.atan2(by - ay, bx - ax));
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if (turn > 0.6) runs.push([profile[i]]);
  }
  return merge(runs.map((run) => spun(run, segments)));
}

const forward = (g: BufferGeometry): BufferGeometry => g.rotateX(Math.PI / 2);

function cyl(r: number, h: number, axis: 'x' | 'y' | 'z' = 'y', segments = 12): BufferGeometry {
  const g = new CylinderGeometry(r, r, h, segments);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return g;
}

function bar(length: number, a: number, b: number, axis: 'x' | 'y' | 'z', chamfer: number): BufferGeometry {
  const x = a / 2;
  const y = b / 2;
  const c = Math.min(chamfer, x * 0.45, y * 0.45);
  const section = trace(new Shape(), [[-x + c, -y], [x - c, -y], [x, -y + c], [x, y - c], [x - c, y], [-x + c, y], [-x, y - c], [-x, -y + c]]);
  const g = new ExtrudeGeometry(section, {
    depth: length,
    // Kept under HyperObject's MAX_EDGE, or the engine re-splits every side into slivers.
    steps: Math.max(1, Math.ceil(length / 0.27)),
    bevelEnabled: false,
  });
  g.translate(0, 0, -length / 2);
  if (axis === 'x') g.rotateY(Math.PI / 2);
  if (axis === 'y') g.rotateX(-Math.PI / 2);
  return g;
}

function beam(w: number, h: number, d: number, chamfer = 0.004): BufferGeometry {
  if (w >= h && w >= d) return bar(w, d, h, 'x', chamfer);
  if (h >= d) return bar(h, w, d, 'y', chamfer);
  return bar(d, w, h, 'z', chamfer);
}

function pipe(points: Vector3[], r: number, bend: number, segments: number): BufferGeometry {
  const path = new CurvePath<Vector3>();
  let from = points[0];
  for (let i = 1; i < points.length; i++) {
    const corner = points[i];
    if (i === points.length - 1) {
      path.add(new LineCurve3(from, corner));
      break;
    }
    const before = corner.clone().add(from.clone().sub(corner).setLength(bend));
    const after = corner.clone().add(points[i + 1].clone().sub(corner).setLength(bend));
    path.add(new LineCurve3(from, before));
    path.add(new QuadraticBezierCurve3(before, corner, after));
    from = after;
  }
  return new TubeGeometry(path, segments, r, 7);
}

const ATLAS_W = 2048;
const ATLAS_H = 1536;
type Region = [number, number, number, number];
const REGION = {
  tread: [0, 0, 1024, 912],
  dial: [1040, 0, 640, 640],
  page: [1040, 656, 448, 496],
  key: [1696, 656, 192, 192],
  rating: [1504, 880, 320, 176],
  card: [0, 928, 1024, 348],
  hazard: [0, 1360, 1024, 32],
  deploy: [0, 1408, 512, 112],
  build: [528, 1408, 256, 64],
  test: [800, 1408, 256, 64],
  prod: [1072, 1408, 256, 64],
  ready: [1344, 1408, 208, 64],
  fault: [1568, 1408, 208, 64],
  arrow: [1792, 1408, 64, 64],
  shock: [1872, 1408, 112, 112],
} satisfies Record<string, Region>;

function mapTo<T extends BufferGeometry>(g: T, [x, y, w, h]: Region): T {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (x + 1 + uv.getX(i) * (w - 2)) / ATLAS_W, 1 - (y + 1 + (1 - uv.getY(i)) * (h - 2)) / ATLAS_H);
  }
  return g;
}

function decal(w: number, h: number, region: Region): BufferGeometry {
  return mapTo(new PlaneGeometry(w, h), region);
}

const SANS = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

function fitLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number, weight = 700): void {
  shrinkToFit(startPx, 8, maxWidth, (size) => {
    ctx.font = `${weight} ${size}px ${SANS}`;
    return ctx.measureText(text).width;
  });
}

function fitBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  startPx: number,
): { lines: string[]; size: number } {
  const words = text.split(/\s+/).filter(Boolean);
  const layout = (size: number): { lines: string[]; size: number; fits: boolean } => {
    ctx.font = `800 ${size}px ${SANS}`;
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const joined = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(joined).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = joined;
      }
    }
    lines.push(line);
    const fits = lines.every((l) => ctx.measureText(l).width <= maxWidth) && lines.length * size * 1.12 <= maxHeight;
    return { lines, size, fits };
  };
  const { lines, size } = layout(largestFitting(10, startPx, (size) => layout(size).fits));
  return { lines, size };
}

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function within(
  ctx: CanvasRenderingContext2D,
  [x, y, w, h]: Region,
  background: string | null,
  paint: (w: number, h: number) => void,
): void {
  ctx.save();
  ctx.translate(x, y);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(-6, -6, w + 12, h + 12);
  }
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '0px';
  paint(w, h);
  ctx.restore();
}

function legend(ctx: CanvasRenderingContext2D, region: Region, text: string, spacing: number): void {
  within(ctx, region, '#2a2e33', (w, h) => {
    ctx.strokeStyle = '#f1f0ea';
    ctx.lineWidth = Math.max(2, h * 0.035);
    ctx.strokeRect(h * 0.09, h * 0.09, w - h * 0.18, h - h * 0.18);
    ctx.fillStyle = '#f6f5ef';
    ctx.letterSpacing = `${spacing}px`;
    fitLine(ctx, text, w - h * 0.5 - spacing, Math.round(h * 0.6));
    ctx.fillText(text, w / 2 + spacing / 2, h / 2 + h * 0.03);
  });
}

function paintTread(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const random = seeded(1659);
  const NOSING = 52;
  ctx.fillStyle = '#f0c63c';
  ctx.fillRect(0, h - NOSING, w, NOSING);

  ctx.strokeStyle = 'rgba(70, 76, 82, 0.2)';
  for (let i = 0; i < 70; i++) {
    const x = random() * w;
    const y = random() * h;
    const angle = random() * Math.PI;
    const long = 20 + random() * 90;
    ctx.lineWidth = 1 + random() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * long, y + Math.sin(angle) * long);
    ctx.stroke();
  }

  const worn = ctx.createRadialGradient(w / 2, h * 0.72, 30, w / 2, h * 0.72, 300);
  worn.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
  worn.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = worn;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(176, 183, 189, ${0.25 + random() * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(random() * w, h - NOSING + random() * NOSING, 8 + random() * 34, 3 + random() * 9, random(), 0, 7);
    ctx.fill();
  }

  const PITCH = 30;
  for (let row = 0; row * PITCH < h + PITCH; row++) {
    for (let col = 0; col * PITCH < w + PITCH; col++) {
      const x = col * PITCH + 4;
      const y = row * PITCH + 4;
      const turn = ((row + col) % 2 === 0 ? 1 : -1) * (Math.PI / 4);
      ctx.fillStyle = 'rgba(40, 46, 52, 0.42)';
      ctx.beginPath();
      ctx.ellipse(x + 1.5, y + 2.5, 12, 3.6, turn, 0, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
      ctx.beginPath();
      ctx.ellipse(x, y, 11.5, 3.1, turn, 0, 7);
      ctx.fill();
    }
  }
}

function paintDial(ctx: CanvasRenderingContext2D, w: number): void {
  const c = w / 2;
  const R = w / 2;
  ctx.strokeStyle = '#1d2228';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(c, c, R * 0.93, 0, 7);
  ctx.stroke();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const hour = i % 5 === 0;
    ctx.lineWidth = hour ? 11 : 4;
    ctx.beginPath();
    ctx.moveTo(c + Math.sin(a) * R * (hour ? 0.8 : 0.85), c - Math.cos(a) * R * (hour ? 0.8 : 0.85));
    ctx.lineTo(c + Math.sin(a) * R * 0.91, c - Math.cos(a) * R * 0.91);
    ctx.stroke();
  }
  ctx.fillStyle = '#1d2228';
  ctx.font = `700 ${Math.round(R * 0.2)}px ${SANS}`;
  for (let n = 1; n <= 12; n++) {
    const a = (n / 12) * Math.PI * 2;
    ctx.fillText(String(n), c + Math.sin(a) * R * 0.66, c - Math.cos(a) * R * 0.66 + R * 0.01);
  }
  ctx.fillStyle = '#7b8288';
  ctx.letterSpacing = '5px';
  ctx.font = `600 ${Math.round(R * 0.065)}px ${SANS}`;
  ctx.fillText('QUARTZ', c + 2, c + R * 0.34);
}

function paintPage(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#c9c4b6';
  for (let x = 10; x < w; x += 18) ctx.fillRect(x, 5, 9, 3);

  ctx.fillStyle = '#1d2228';
  ctx.letterSpacing = '8px';
  const month = upper(t(L('November', 'Kasım')));
  fitLine(ctx, month, w - 90, 46);
  ctx.fillText(month, w / 2 + 4, 52);

  ctx.fillStyle = '#d5372c';
  ctx.fillRect(40, 88, w - 80, 5);

  ctx.fillStyle = '#1d2228';
  ctx.letterSpacing = '0px';
  ctx.font = `800 262px ${SANS}`;
  ctx.fillText('13', w / 2, 236);

  const BAND = 118;
  ctx.fillStyle = '#d5372c';
  ctx.fillRect(0, h - BAND, w, BAND);
  ctx.fillStyle = '#fffaf0';
  ctx.letterSpacing = '6px';
  const day = upper(t(L('Friday', 'Cuma')));
  fitLine(ctx, day, w - 70, 84, 800);
  ctx.fillText(day, w / 2 + 3, h - BAND / 2 + 4);
}

function paintCard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.strokeStyle = '#d5372c';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.roundRect(18, 18, w - 36, h - 36, 24);
  ctx.stroke();

  const cx = 184;
  const cy = h / 2;
  const R = 112;
  ctx.fillStyle = '#23272b';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 14, 70, 38, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(cx - 70, cy - 16, 140, 10);
  ctx.fillRect(cx - 26, cy - 8, 52, 38);
  ctx.fillRect(cx - 60, cy + 30, 120, 18);
  ctx.strokeStyle = '#d5372c';
  ctx.lineWidth = 25;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 7);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - R * 0.7, cy - R * 0.7);
  ctx.lineTo(cx + R * 0.7, cy + R * 0.7);
  ctx.stroke();

  const left = 340;
  const right = w - 52;
  const text = upper(t(L('Do not press on Fridays', 'Cuma günleri basmayın')));
  const fit = fitBlock(ctx, text, right - left, h - 96, 108);
  ctx.fillStyle = '#1d2228';
  const lineHeight = fit.size * 1.12;
  fit.lines.forEach((line, i) => {
    ctx.fillText(line, (left + right) / 2, cy + (i - (fit.lines.length - 1) / 2) * lineHeight + fit.size * 0.04);
  });
}

function atlasTexture(): Texture {
  return localizedCanvasTexture(ATLAS_W, ATLAS_H, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);

    within(ctx, REGION.tread, '#d3d8dc', (rw, rh) => paintTread(ctx, rw, rh));
    within(ctx, REGION.dial, '#f6f3ea', (rw) => paintDial(ctx, rw));
    within(ctx, REGION.page, '#fbf8ef', (rw, rh) => paintPage(ctx, rw, rh));
    within(ctx, REGION.card, '#fdfcf7', (rw, rh) => paintCard(ctx, rw, rh));

    within(ctx, REGION.hazard, '#f2c53a', (rw, rh) => {
      ctx.fillStyle = '#2a2e33';
      for (let x = -rh; x < rw + rh; x += 56) {
        ctx.beginPath();
        ctx.moveTo(x, rh);
        ctx.lineTo(x + rh, 0);
        ctx.lineTo(x + rh + 28, 0);
        ctx.lineTo(x + 28, rh);
        ctx.fill();
      }
    });

    legend(ctx, REGION.deploy, 'DEPLOY', 10);
    legend(ctx, REGION.build, 'BUILD', 5);
    legend(ctx, REGION.test, 'TEST', 5);
    legend(ctx, REGION.prod, 'PROD', 5);
    legend(ctx, REGION.ready, upper(t(L('Ready', 'Hazır'))), 3);
    legend(ctx, REGION.fault, upper(t(L('Fault', 'Arıza'))), 3);

    within(ctx, REGION.arrow, null, (rw, rh) => {
      ctx.fillStyle = '#f6f5ef';
      ctx.beginPath();
      ctx.moveTo(rw * 0.24, rh * 0.2);
      ctx.lineTo(rw * 0.8, rh * 0.5);
      ctx.lineTo(rw * 0.24, rh * 0.8);
      ctx.fill();
    });

    within(ctx, REGION.shock, null, (rw, rh) => {
      ctx.lineJoin = 'round';
      ctx.fillStyle = '#f4c430';
      ctx.strokeStyle = '#23272b';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(rw / 2, 10);
      ctx.lineTo(rw - 8, rh - 12);
      ctx.lineTo(8, rh - 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#23272b';
      ctx.beginPath();
      ctx.moveTo(rw * 0.56, rh * 0.3);
      ctx.lineTo(rw * 0.4, rh * 0.58);
      ctx.lineTo(rw * 0.5, rh * 0.58);
      ctx.lineTo(rw * 0.43, rh * 0.84);
      ctx.lineTo(rw * 0.62, rh * 0.5);
      ctx.lineTo(rw * 0.52, rh * 0.5);
      ctx.closePath();
      ctx.fill();
    });

    within(ctx, REGION.key, '#d6dadd', (rw, rh) => {
      ctx.fillStyle = '#23272b';
      ctx.font = `800 40px ${SANS}`;
      ctx.fillText('0', rw * 0.12, rh * 0.42);
      ctx.fillText('1', rw * 0.88, rh * 0.42);
      ctx.fillRect(rw * 0.07, rh * 0.57, rw * 0.1, 4);
      ctx.fillRect(rw * 0.83, rh * 0.57, rw * 0.1, 4);
      ctx.letterSpacing = '4px';
      ctx.font = `800 30px ${SANS}`;
      ctx.fillText('PROD', rw / 2 + 2, rh * 0.89);
    });

    within(ctx, REGION.rating, '#d6dadd', (rw, rh) => {
      ctx.strokeStyle = '#23272b';
      ctx.lineWidth = 3;
      ctx.strokeRect(8, 8, rw - 16, rh - 16);
      ctx.fillStyle = '#23272b';
      const rows = ['TYPE  FRI-1659', 'S/N  000013', '230 V ~   50 Hz   IP54', upper(t(L('Made on a Friday', 'Cuma günü üretildi')))];
      rows.forEach((row, i) => {
        fitLine(ctx, row, rw - 44, i === 0 ? 30 : 24, i === 3 ? 800 : 600);
        ctx.fillText(row, rw / 2, 34 + i * 37);
      });
    });
  });
}

const CELL_PX = 32;
const CELLS = 16;
const CELL = { white: 0, build: 1, test: 2, prod: 3, ready: 4, fault: 5, bulb: 6, beam: 7, dome: 8, clear: 9 };

type Tone = [string, string, string];
const TONE = {
  frost: ['#f4f5f2', '#d9dcda', '#a4a9aa'],
  green: ['#f6fff8', '#52f58c', '#17a852'],
  amber: ['#fffbe6', '#ffc93c', '#c78a12'],
  red: ['#fff0ec', '#ff4f3d', '#b3231a'],
  greenDark: ['#7d9f85', '#4f7359', '#2f4536'],
  redDark: ['#a2706b', '#7a4844', '#4a2a27'],
  bulbDark: ['#d0d4d7', '#abb0b4', '#888d91'],
  bulbLit: ['#ffffff', '#fff3c0', '#ffd76a'],
} satisfies Record<string, Tone>;
type ToneName = keyof typeof TONE;

function toCell<T extends BufferGeometry>(g: T, cell: number): T {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (cell + 0.5) / CELLS, 0.5);
  return g;
}

function lens(R: number, h: number, cell: number): BufferGeometry {
  const g = spun([[R, 0], [R * 0.97, h * 0.45], [R * 0.8, h * 0.8], [R * 0.45, h * 0.97], [0, h]], 16);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (cell + 0.5 + (p.getX(i) / R) * 0.4) / CELLS, 0.5 + (p.getZ(i) / R) * 0.4);
  }
  return g;
}

interface Lamps {
  build: [ToneName, number];
  test: [ToneName, number];
  prod: [ToneName, number];
  ready: number;
  fault: number;
  beacon: number;
}

function lampTexture(): { texture: Texture; show: (lamps: Lamps) => void } {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_PX * CELLS;
  canvas.height = CELL_PX;
  const ctx = canvas.getContext('2d')!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // Unfiltered across levels: a mip chain would average neighbouring lamps into each other.
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;

  const glow = (cell: number, tone: Tone, alpha: number): void => {
    if (alpha <= 0) return;
    const x = cell * CELL_PX;
    const c = CELL_PX / 2;
    const gradient = ctx.createRadialGradient(x + c - 2, c + 2, 0, x + c, c, c * 0.95);
    gradient.addColorStop(0, tone[0]);
    gradient.addColorStop(0.5, tone[1]);
    gradient.addColorStop(1, tone[2]);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, CELL_PX, CELL_PX);
    ctx.globalAlpha = 1;
  };
  const flat = (cell: number, color: string, alpha = 1): void => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(cell * CELL_PX, 0, CELL_PX, CELL_PX);
    ctx.globalAlpha = 1;
  };

  let shown = '';
  const show = (lamps: Lamps): void => {
    const step = (k: number) => Math.round(clamp01(k) * 14);
    const signature = [
      lamps.build[0],
      step(lamps.build[1]),
      lamps.test[0],
      step(lamps.test[1]),
      lamps.prod[0],
      step(lamps.prod[1]),
      step(lamps.ready),
      step(lamps.fault),
      step(lamps.beacon),
    ].join();
    if (signature === shown) return;
    shown = signature;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    flat(CELL.white, '#ffffff');
    for (const [cell, [tone, k]] of [
      [CELL.build, lamps.build],
      [CELL.test, lamps.test],
      [CELL.prod, lamps.prod],
    ] as Array<[number, [ToneName, number]]>) {
      glow(cell, TONE.frost, 1);
      glow(cell, TONE[tone], step(k) / 14);
    }
    glow(CELL.ready, TONE.greenDark, 1);
    glow(CELL.ready, TONE.green, step(lamps.ready) / 14);
    glow(CELL.fault, TONE.redDark, 1);
    glow(CELL.fault, TONE.red, step(lamps.fault) / 14);
    const lit = step(lamps.beacon) / 14;
    glow(CELL.bulb, TONE.bulbDark, 1);
    glow(CELL.bulb, TONE.bulbLit, lit);
    flat(CELL.beam, '#aeb5bb');
    flat(CELL.beam, '#fff2b4', lit);
    flat(CELL.dome, '#f29a22', 0.56);
    flat(CELL.dome, '#ffc04a', 0.3 * lit);
    flat(CELL.clear, '#cfe2ee', 0.22);
    texture.needsUpdate = true;
  };

  return { texture, show };
}

interface Kit {
  solid: Part[];
  decals: BufferGeometry[];
  lenses: BufferGeometry[];
}

const kit = (): Kit => ({ solid: [], decals: [], lenses: [] });

function placed(k: Kit, place: (g: BufferGeometry) => void): Kit {
  for (const [g] of k.solid) place(g);
  for (const g of [...k.decals, ...k.lenses]) place(g);
  return k;
}

function join(into: Kit, from: Kit): void {
  into.solid.push(...from.solid);
  into.decals.push(...from.decals);
  into.lenses.push(...from.lenses);
}

const up = (g: BufferGeometry): BufferGeometry => g.rotateX(-Math.PI / 2);

function screws(at: Array<[number, number, number]>, r: number, axis: 'y' | 'z'): BufferGeometry {
  return merge(
    at.map(([x, y, z]) => {
      const head = turned([[r, 0], [r, r * 0.25], [r * 0.6, r * 0.5], [0, r * 0.55]], 8);
      const slot = new BoxGeometry(r * 1.5, r * 0.2, r * 0.22).translate(0, r * 0.52, 0);
      const g = merge([head, slot]).rotateY(x * 31 + y * 17 + z * 7);
      if (axis === 'z') forward(g);
      return g.translate(x, y, z);
    }),
  );
}

function deck(): Kit {
  const k = kit();
  const T = PLATE_T;

  k.solid.push([grained(pos(box(0.8, T, 0.41, 0.002), 0, T / 2, 0), 'x', 90, 6), STAINLESS]);
  k.solid.push([screws([[-0.38, T, -0.188], [0.38, T, -0.188], [-0.38, T, 0.188], [0.38, T, 0.188]], 0.008, 'y'), CHROME]);

  k.solid.push([pos(box(0.3, 0.003, 0.066, 0.001), 0, T + 0.0015, 0.166), BLACK]);
  k.decals.push(pos(up(decal(0.25, 0.055, REGION.deploy)), 0, T + 0.0045, 0.166));
  k.solid.push([screws([[-0.137, T + 0.003, 0.166], [0.137, T + 0.003, 0.166]], 0.006, 'y'), CHROME]);

  k.solid.push([pos(turned([[0, 0], [0.084, 0], [0.084, 0.003], [0.08, 0.005], [0, 0.005]], 28), 0, T, BUTTON_Z), YELLOW]);
  k.solid.push([
    pos(turned([[0.05, 0.005], [0.05, 0.02], [0.046, 0.024], [0.034, 0.024], [0.034, 0.005]], 24), 0, T, BUTTON_Z),
    BLACK,
  ]);

  k.solid.push([pos(box(0.2, 0.003, 0.03, 0.001), 0, T + 0.0015, HINGE_Z - 0.019), GALV]);
  k.solid.push([pos(new BoxGeometry(0.066, 0.012, 0.004), 0, T + 0.006, HINGE_Z - 0.007), GALV]);
  k.solid.push([pos(cyl(0.008, 0.066, 'x', 10), 0, HINGE_Y, HINGE_Z), GALV]);
  k.solid.push([pos(cyl(0.0035, 0.196, 'x', 8), 0, HINGE_Y, HINGE_Z), CHROME]);
  k.solid.push([screws([[-0.075, T + 0.003, HINGE_Z - 0.022], [0.075, T + 0.003, HINGE_Z - 0.022]], 0.005, 'y'), CHROME]);

  const KX = -0.27;
  const KZ = -0.005;
  k.solid.push([pos(box(0.114, 0.002, 0.114, 0.001), KX, T + 0.001, KZ), ALU]);
  k.decals.push(pos(up(decal(0.11, 0.11, REGION.key)), KX, T + 0.0035, KZ));
  k.solid.push([
    pos(turned([[0.016, 0.002], [0.03, 0.002], [0.03, 0.008], [0.026, 0.012], [0.016, 0.012]], 18), KX, T, KZ),
    CHROME,
  ]);
  k.solid.push([pos(cyl(0.017, 0.012, 'y', 14), KX, T + 0.008, KZ), BLACK]);
  const bow = roundedRect(new Shape(), 0.034, 0.03, 0.009);
  bow.holes.push(new Path().absarc(0, 0.004, 0.0055, 0, Math.PI * 2, true));
  const key = merge([
    new ExtrudeGeometry(bow, { depth: 0.004, bevelEnabled: false, curveSegments: 5 }).translate(0, 0.031, -0.002),
    new BoxGeometry(0.013, 0.02, 0.003).translate(0, 0.009, 0),
  ]);
  k.solid.push([pos(key.rotateY(0.35), KX, T + 0.014, KZ), BRASS]);

  const LX = 0.27;
  for (const [z, cell, region] of [[-0.08, CELL.ready, REGION.ready], [0.06, CELL.fault, REGION.fault]] as Array<[number, number, Region]>) {
    k.solid.push([pos(turned([[0.015, 0], [0.027, 0], [0.027, 0.005], [0.023, 0.009], [0.015, 0.009]], 16), LX, T, z), CHROME]);
    k.lenses.push(pos(lens(0.019, 0.013, cell), LX, T + 0.006, z));
    k.solid.push([pos(box(0.086, 0.002, 0.028, 0.001), LX, T + 0.001, z + 0.047), BLACK]);
    k.decals.push(pos(up(decal(0.078, 0.024, region)), LX, T + 0.0035, z + 0.047));
  }

  return k;
}

function lampPanel(): Kit {
  const k = kit();
  const T = 0.005;
  const LAMP_Y = 0.11;
  k.solid.push([pos(box(0.8, 0.41, T, 0.002), 0, 0, T / 2), FASCIA]);
  k.solid.push([screws([[-0.38, 0.185, T], [0.38, 0.185, T], [-0.38, -0.185, T], [0.38, -0.185, T]], 0.008, 'z'), CHROME]);

  const lamps: Array<[number, number, Region]> = [[-0.24, CELL.build, REGION.build], [0, CELL.test, REGION.test], [0.24, CELL.prod, REGION.prod]];
  for (const [x, cell, region] of lamps) {
    k.solid.push([
      pos(
        forward(turned([[0.036, 0], [0.056, 0], [0.056, 0.008], [0.049, 0.015], [0.04, 0.015], [0.04, 0.006]], 24)),
        x,
        LAMP_Y,
        T,
      ),
      CHROME,
    ]);
    k.lenses.push(pos(forward(lens(0.041, 0.03, cell)), x, LAMP_Y, T + 0.006));
    k.solid.push([pos(box(0.17, 0.046, 0.003, 0.001), x, LAMP_Y - 0.102, T + 0.0015), BLACK]);
    k.decals.push(pos(decal(0.16, 0.04, region), x, LAMP_Y - 0.102, T + 0.0045));
  }
  for (const x of [-0.12, 0.12]) k.decals.push(pos(decal(0.036, 0.036, REGION.arrow), x, LAMP_Y, T + 0.0015));

  const note: BufferGeometry[] = [
    pos(box(0.5, 0.17, 0.002, 0.001), 0, 0, T + 0.001),
    pos(decal(0.49, 0.1665, REGION.card), 0, 0, T + 0.0035),
  ];
  const tape = [-1, 1].map((sx) => pos(new BoxGeometry(0.026, 0.06, 0.0008).rotateZ(sx * 0.12), sx * 0.12, 0.082, T + 0.0045));
  for (const g of [...note, ...tape]) g.rotateZ(-0.025).translate(0.01, -0.108, 0);
  k.solid.push([note[0], PAPER], [merge(tape), TAPE]);
  k.decals.push(note[1]);

  return k;
}

function mug(): Part[] {
  const body = spun([[0, 0], [0.034, 0], [0.04, 0.005], [0.042, 0.082], [0.0405, 0.086], [0.038, 0.083], [0.0365, 0.02]], 18);
  const handle = new TorusGeometry(0.023, 0.006, 6, 12, Math.PI).rotateZ(-Math.PI / 2).translate(0.041, 0.045, 0);
  return [
    [body, ENAMEL],
    [handle, ENAMEL],
    [pos(new TorusGeometry(0.0405, 0.0028, 5, 18).rotateX(Math.PI / 2), 0, 0.085, 0), NAVY],
    [pos(up(new CircleGeometry(0.0375, 18)), 0, 0.068, 0), COFFEE],
  ];
}

function consoleDesk(): Kit {
  const k = kit();

  k.solid.push([pos(box(0.5, 0.07, 0.38, 0.008), 0, 0.035, -0.03), BLUE_DARK]);
  k.solid.push([pos(box(0.46, 0.48, 0.34, 0.012), 0, 0.3, -0.03), BLUE]);
  k.solid.push([across(HEAD, 0.86, BEV), BLUE]);

  const slats: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    k.solid.push([pos(new BoxGeometry(0.004, 0.2, 0.21), sx * 0.2305, 0.29, -0.03), RUBBER]);
    for (let i = 0; i < 6; i++) {
      slats.push(pos(new BoxGeometry(0.016, 0.005, 0.22).rotateZ(sx * 0.55), sx * 0.236, 0.2 + i * 0.036, -0.03));
    }
  }
  k.solid.push([merge(slats), BLUE]);

  k.decals.push(pos(decal(0.1, 0.1, REGION.shock), 0, 0.4, 0.1415));

  const BACK = -0.2;
  k.solid.push([pos(box(0.38, 0.36, 0.01, 0.004), 0, 0.34, BACK - 0.004), BLUE]);
  for (const y of [0.23, 0.45]) k.solid.push([pos(cyl(0.008, 0.055, 'y', 8), -0.196, y, BACK - 0.008), BLACK]);
  k.solid.push([
    pos(
      forward(turned([[0, 0], [0.021, 0], [0.021, 0.005], [0.017, 0.009], [0, 0.009]], 14)).rotateY(Math.PI),
      0.145,
      0.34,
      BACK - 0.009,
    ),
    CHROME,
  ]);
  k.solid.push([pos(new BoxGeometry(0.005, 0.024, 0.003), 0.145, 0.34, BACK - 0.0185), RUBBER]);
  k.solid.push([pos(box(0.155, 0.09, 0.002, 0.001), 0, 0.45, BACK - 0.01), ALU]);
  k.decals.push(pos(decal(0.145, 0.08, REGION.rating).rotateY(Math.PI), 0, 0.45, BACK - 0.0125));

  k.solid.push([pos(cyl(0.021, 0.012, 'z', 6), 0.14, 0.115, BACK - 0.006), GALV]);
  k.solid.push([pos(cyl(0.016, 0.016, 'z', 10), 0.14, 0.115, BACK - 0.02), BLACK]);

  const n = [Math.cos(SLOPE), Math.sin(SLOPE)];
  join(
    k,
    placed(deck(), (g) => {
      g.rotateX(SLOPE).translate(0, 0.74 + BEV * n[0], 0.17 + BEV * n[1]);
    }),
  );
  join(
    k,
    placed(lampPanel(), (g) => {
      g.rotateX(-LEAN).translate(0, 1.0925 + BEV * Math.sin(LEAN), -0.04 + BEV * Math.cos(LEAN));
    }),
  );

  for (const [g, opts] of mug()) k.solid.push([pos(g.rotateY(-2.3), 0.36, CONSOLE_TOP, -0.145), opts]);

  return k;
}

function hand(length: number, tail: number, root: number, tip: number): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(-root / 2, -tail);
  shape.lineTo(root / 2, -tail);
  shape.lineTo(tip / 2, length);
  shape.lineTo(0, length + tip);
  shape.lineTo(-tip / 2, length);
  shape.closePath();
  return new ExtrudeGeometry(shape, { depth: 0.002, bevelEnabled: false });
}

const DIAL_R = 0.209;
const DIAL_Z = 0.03;

function wallClock(): Kit {
  const k = kit();
  k.solid.push([
    forward(
      turned([[0.228, 0], [0.24, 0.006], [0.24, 0.036], [0.233, 0.046], [0.219, 0.049], [0.211, 0.045], [DIAL_R, DIAL_Z]], 40),
    ),
    BLACK,
  ]);
  k.decals.push(pos(mapTo(new CircleGeometry(DIAL_R, 40), REGION.dial), 0, 0, DIAL_Z));

  const hour = (4 + 59 / 60) / 12;
  k.solid.push([pos(hand(0.105, 0.028, 0.018, 0.01).rotateZ(-hour * Math.PI * 2), 0, 0, DIAL_Z + 0.004), RUBBER]);
  k.solid.push([pos(hand(0.165, 0.032, 0.013, 0.006).rotateZ(-(59 / 60) * Math.PI * 2), 0, 0, DIAL_Z + 0.007), RUBBER]);
  k.solid.push([
    pos(forward(turned([[0, 0], [0.013, 0], [0.013, 0.01], [0.009, 0.014], [0, 0.014]], 12)), 0, 0, DIAL_Z + 0.001),
    BRASS,
  ]);
  return k;
}

function calendar(): Kit {
  const k = kit();
  k.solid.push([pos(box(0.34, 0.52, 0.006, 0.002), 0, 0, 0.003), KRAFT]);
  k.solid.push([pos(new BoxGeometry(0.3, 0.05, 0.0015), 0, 0.172, 0.0068), RED]);
  k.solid.push([pos(new TorusGeometry(0.008, 0.0025, 5, 12), 0, 0.232, 0.006), BRASS]);
  k.solid.push([pos(cyl(0.0035, 0.016, 'z', 6), 0, 0.234, 0.008), GALV]);
  k.solid.push([pos(cyl(0.007, 0.002, 'z', 8), 0, 0.234, 0.016), GALV]);

  k.solid.push([pos(box(0.3, 0.345, 0.034, 0.002), 0, -0.07, 0.023), PAPER]);
  k.solid.push([pos(box(0.306, 0.028, 0.038, 0.002), 0, 0.098, 0.0255), GALV]);
  const rivet = new SphereGeometry(0.005, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
  k.solid.push([merge([-0.11, 0.11].map((x) => pos(rivet.clone(), x, 0.098, 0.0445))), CHROME]);

  const W = 0.296;
  const H = 0.325;
  const page = mapTo(new PlaneGeometry(W, H, 10, 10), REGION.page);
  const p = page.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const s = p.getX(i) / W + 0.5;
    const v = p.getY(i) / H + 0.5;
    const curl = Math.max(0, s - v - 0.5);
    p.setXYZ(i, p.getX(i) - 0.07 * curl * curl, p.getY(i) + 0.05 * curl * curl, 0.11 * curl * curl);
  }
  page.computeVertexNormals();
  k.decals.push(pos(page, 0, -0.079, 0.0412));
  return k;
}

function board(): Kit {
  const k = kit();
  const W = 2.5;
  const BOTTOM = 0.72;
  const TOP = 1.78;
  const midY = (BOTTOM + TOP) / 2;
  const tall = TOP - BOTTOM;

  k.solid.push([grained(pos(new PlaneGeometry(W - 0.04, tall - 0.04, 9, 4), 0, midY, BOARD_Z), 'x', 55, 55), CORK]);
  k.solid.push([pos(new PlaneGeometry(W - 0.04, tall - 0.04, 9, 4).rotateY(Math.PI), 0, midY, BOARD_Z - 0.026), HARDBOARD]);
  for (const y of [BOTTOM + 0.0175, TOP - 0.0175]) {
    k.solid.push([pos(beam(W, 0.035, 0.04, 0.005), 0, y, BOARD_Z - 0.008), ALU]);
  }
  for (const sx of [-1, 1]) {
    k.solid.push([pos(beam(0.035, tall - 0.07, 0.04, 0.005), sx * (W / 2 - 0.0175), midY, BOARD_Z - 0.008), ALU]);
  }

  const nuts: BufferGeometry[] = [];
  const RAILS = [0.95, 1.58];
  for (const y of RAILS) {
    k.solid.push([pos(beam(2.3, 0.05, 0.034), 0, y, BOARD_Z - 0.043), GALV]);
    for (const sx of [-1, 1]) {
      nuts.push(pos(cyl(0.02, 0.003, 'z', 12), sx * POST_X, y, POST_Z - 0.0365));
      nuts.push(pos(cyl(0.013, 0.012, 'z', 6), sx * POST_X, y, POST_Z - 0.044));
    }
  }

  k.solid.push([pos(beam(0.05, RAILS[1] - RAILS[0] - 0.05, 0.034), 0, (RAILS[0] + RAILS[1]) / 2, BOARD_Z - 0.043), GALV]);

  for (const sx of [-1, 1]) {
    const top = sx > 0 ? BEACON_Y - 0.01 : 1.84;
    k.solid.push([pos(beam(0.07, top - PAD_TOP, 0.07, 0.007), sx * POST_X, (top + PAD_TOP) / 2, POST_Z), GALV]);
    k.solid.push([pos(box(0.18, 0.012, 0.18, 0.003), sx * POST_X, PAD_TOP + 0.006, POST_Z), GALV]);
    for (const bx of [-1, 1]) {
      for (const bz of [-1, 1]) {
        nuts.push(pos(cyl(0.012, 0.012, 'y', 6), sx * POST_X + bx * 0.062, PAD_TOP + 0.018, POST_Z + bz * 0.062));
      }
    }
  }
  k.solid.push([merge(nuts), CHROME]);
  k.solid.push([pos(box(0.078, 0.014, 0.078, 0.005), -POST_X, 1.846, POST_Z), RUBBER]);
  k.solid.push([pos(box(0.15, 0.01, 0.15, 0.003), POST_X, BEACON_Y - 0.005, POST_Z), GALV]);

  const pin = forward(
    spun(
      [[0, 0], [0.0095, 0], [0.0095, 0.003], [0.0045, 0.006], [0.004, 0.013], [0.008, 0.017], [0.008, 0.021], [0, 0.022]],
      10,
    ),
  );
  const pinned: Array<[number, number]> = [[-0.31, 1.64], [-0.4, 0.88], [0.47, 0.9], [1.13, 0.86], [-1.13, 1.66]];
  pinned.forEach(([x, y], i) => {
    k.solid.push([pos(pin.clone(), x, y, BOARD_Z + 0.001), { color: PINS[i], ambient: 0.6, gloss: 0.6 }]);
  });
  const scrap = new Shape();
  scrap.moveTo(-0.03, 0.014);
  scrap.lineTo(0.034, 0.016);
  scrap.lineTo(0.03, -0.012);
  scrap.lineTo(0.012, -0.02);
  scrap.lineTo(0.002, -0.011);
  scrap.lineTo(-0.014, -0.022);
  scrap.lineTo(-0.028, -0.01);
  scrap.closePath();
  k.solid.push([
    pos(new ExtrudeGeometry(scrap, { depth: 0.001, bevelEnabled: false }).rotateZ(0.2), pinned[2][0], pinned[2][1] - 0.002, BOARD_Z),
    PAPER,
  ]);

  join(k, placed(wallClock(), (g) => void g.translate(CLOCK_AT[0], CLOCK_AT[1], BOARD_Z)));
  join(k, placed(calendar(), (g) => void g.rotateZ(0.012).translate(CALENDAR_AT[0], CALENDAR_AT[1], BOARD_Z)));
  return k;
}

function footing(): Kit {
  const k = kit();
  const slab = new ExtrudeGeometry(roundedRect(new Shape(), 3.36, 2.16, 0.03), {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
    curveSegments: 3,
  });
  k.solid.push([pos(up(slab), 0, PAD_TOP - 0.14, 0.05), CONCRETE]);

  const X = 0.7;
  const BACK = -0.3;
  const FRONT = 0.95;
  const midZ = (BACK + FRONT) / 2;
  const tall = DECK_TOP - PAD_TOP - 0.002;
  const y = PAD_TOP + tall / 2;
  k.solid.push([pos(beam(2 * X, tall, 0.014, 0.003), 0, y, FRONT - 0.007), YELLOW]);
  k.solid.push([pos(beam(2 * X, tall, 0.014, 0.003), 0, y, BACK + 0.007), GALV]);
  for (const sx of [-1, 1]) k.solid.push([pos(beam(0.014, tall, FRONT - BACK, 0.003), sx * (X - 0.007), y, midZ), GALV]);
  k.decals.push(pos(decal(2 * X - 0.02, 0.04, REGION.hazard), 0, y, FRONT + 0.0015));

  const bolts: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const z of [BACK + 0.045, FRONT - 0.1]) bolts.push(pos(cyl(0.013, 0.006, 'y', 6), sx * (X - 0.045), DECK_TOP + 0.003, z));
  }
  k.solid.push([merge(bolts), CHROME]);
  return k;
}

function treadPlate(): BufferGeometry {
  return pos(up(mapTo(new PlaneGeometry(1.4, 1.25), REGION.tread)), 0, DECK_TOP, 0.325);
}

function wiring(): Part[] {
  const parts: Part[] = [];
  const BX = 0.14;
  const BZ = -0.646;
  const BY = PAD_TOP + 0.0225;

  parts.push([pos(box(0.14, 0.045, 0.14, 0.006), BX, BY, BZ), GALV]);
  parts.push([pos(box(0.152, 0.008, 0.152, 0.003), BX, PAD_TOP + 0.049, BZ), GALV]);
  parts.push([
    screws(
      [-1, 1].flatMap((sx) => [-1, 1].map((sz): [number, number, number] => [BX + sx * 0.058, PAD_TOP + 0.053, BZ + sz * 0.058])),
      0.007,
      'y',
    ),
    CHROME,
  ]);

  const GLAND_Y = DECK_TOP + 0.115;
  const ENTRY_Y = PAD_TOP + 0.027;
  parts.push([pos(cyl(0.02, 0.012, 'z', 6), BX, ENTRY_Y, BZ + 0.076), GALV]);
  const flex = new CatmullRomCurve3([
    new Vector3(BX, GLAND_Y, -0.226),
    new Vector3(BX, GLAND_Y - 0.002, -0.285),
    new Vector3(BX, GLAND_Y - 0.04, -0.375),
    new Vector3(BX, ENTRY_Y + 0.05, -0.47),
    new Vector3(BX, ENTRY_Y + 0.006, -0.535),
    new Vector3(BX, ENTRY_Y, -0.566),
  ]);
  parts.push([new TubeGeometry(flex, 26, 0.012, 7), RUBBER]);
  parts.push([pos(cyl(0.0145, 0.02, 'z', 10), BX, ENTRY_Y, BZ + 0.09), BLACK]);

  const R = 0.012;
  const runY = PAD_TOP + R;
  const riseZ = POST_Z + 0.035 + R;
  parts.push([pos(cyl(0.019, 0.012, 'x', 6), BX + 0.076, runY, BZ), GALV]);
  parts.push([
    pipe(
      [
        new Vector3(BX + 0.07, runY, BZ),
        new Vector3(0.72, runY, BZ),
        new Vector3(POST_X - 0.1, runY, riseZ),
        new Vector3(POST_X, runY, riseZ),
        new Vector3(POST_X, 0.36, riseZ),
      ],
      R,
      0.06,
      44,
    ),
    PVC,
  ]);
  parts.push([pos(box(0.06, 0.085, 0.036, 0.005), POST_X, 0.395, POST_Z + 0.035 + 0.018), PVC]);
  parts.push([screws([[POST_X - 0.02, 0.425, POST_Z + 0.071], [POST_X + 0.02, 0.365, POST_Z + 0.071]], 0.005, 'z'), CHROME]);

  const saddles: BufferGeometry[] = [];
  for (const x of [0.38, 0.6]) {
    saddles.push(pos(new TorusGeometry(R + 0.002, 0.003, 4, 8, Math.PI).rotateY(Math.PI / 2), x, runY, BZ));
    for (const sz of [-1, 1]) {
      saddles.push(pos(new BoxGeometry(0.016, runY - PAD_TOP, 0.004), x, (runY + PAD_TOP) / 2, BZ + sz * (R + 0.002)));
      saddles.push(pos(new BoxGeometry(0.016, 0.004, 0.02), x, PAD_TOP + 0.002, BZ + sz * (R + 0.012)));
    }
  }
  const strap = new TorusGeometry(R + 0.002, 0.003, 4, 8, Math.PI).rotateX(Math.PI / 2);
  saddles.push(pos(strap, POST_X, 0.22, riseZ - R + 0.012));
  for (const sx of [-1, 1]) saddles.push(pos(new BoxGeometry(0.004, 0.016, R + 0.004), POST_X + sx * (R + 0.002), 0.22, riseZ - R / 2 + 0.002));
  parts.push([merge(saddles), GALV]);

  return parts;
}

function beacon(): { solid: Part[]; dome: BufferGeometry; bulb: BufferGeometry } {
  const solid: Part[] = [
    [turned([[0, 0], [0.084, 0], [0.084, 0.012], [0.077, 0.022], [0.077, 0.05], [0.07, 0.056], [0, 0.056]], 24), BLACK],
    [pos(cyl(0.018, 0.016, 'y', 12), 0, 0.064, 0), RUBBER],
    [pos(cyl(0.007, 0.05, 'y', 8), 0, 0.094, 0), CHROME],
  ];
  const dome = toCell(
    spun([[0.0705, 0.05], [0.0705, 0.135], [0.066, 0.16], [0.052, 0.18], [0.03, 0.192], [0, 0.196]], 24),
    CELL.dome,
  );
  const bulb = toCell(pos(new SphereGeometry(0.017, 12, 8), 0, 0.13, 0), CELL.bulb);
  return { solid, dome, bulb };
}

const ROTOR_Y = 0.072;

function rotor(): Part[] {
  const mirror: Point[] = [[0.034, 0.012], [0.046, 0.034], [0.05, 0.058], [0.046, 0.082], [0.034, 0.104]];
  const reflect = (g: BufferGeometry): BufferGeometry => g.rotateY(Math.PI / 2);
  const back = toCell(reflect(spun(mirror.map(([r, y]): Point => [r + 0.003, y]), 12, Math.PI)), CELL.white);
  const face = toCell(reflect(spun([...mirror].reverse(), 12, Math.PI)), CELL.beam);
  const table = toCell(turned([[0.011, 0], [0.054, 0], [0.054, 0.006], [0.011, 0.006]], 20), CELL.white);
  const foot = toCell(pos(new BoxGeometry(0.03, 0.012, 0.008), 0, 0.012, -0.036), CELL.white);
  const steel: HyperMaterialOptions = { ...CHROME, castShadow: false, receiveShadow: false };
  return [
    [back, steel],
    [table, { ...steel, color: 0x8a9096, metal: 0.4 }],
    [foot, steel],
    [face, { color: 0xffffff, ambient: 1, gloss: 0.01, castShadow: false, receiveShadow: false }],
  ];
}

const GUARD_W = 0.2;
const GUARD_D = 0.2;
const GUARD_LOW = PLATE_T - HINGE_Y + 0.0002;
const GUARD_HIGH = 0.088;

function guard(): { frame: BufferGeometry; clear: BufferGeometry } {
  const B = 0.012;
  const x = GUARD_W / 2 - B / 2;
  const tall = GUARD_HIGH - GUARD_LOW;
  const midY = (GUARD_HIGH + GUARD_LOW) / 2;
  const bars: BufferGeometry[] = [];
  for (const y of [GUARD_LOW + B / 2, GUARD_HIGH - B / 2]) {
    for (const sx of [-1, 1]) bars.push(pos(beam(B, B, GUARD_D, 0.003), sx * x, y, GUARD_D / 2));
    for (const z of [B / 2, GUARD_D - B / 2]) bars.push(pos(beam(GUARD_W, B, B, 0.003), 0, y, z));
  }
  for (const sx of [-1, 1]) {
    for (const z of [B / 2, GUARD_D - B / 2]) bars.push(pos(beam(B, tall, B, 0.003), sx * x, midY, z));
    bars.push(pos(cyl(0.008, 0.05, 'x', 10), sx * 0.06, 0, 0));
  }
  bars.push(pos(box(0.07, 0.006, 0.022, 0.002), 0, GUARD_LOW + 0.003, GUARD_D + 0.008));

  const inset = 0.004;
  const w = GUARD_W - 2 * inset;
  const d = GUARD_D - 2 * inset;
  const panes = [
    pos(up(new PlaneGeometry(w, d)), 0, GUARD_HIGH - inset, GUARD_D / 2),
    pos(new PlaneGeometry(w, tall), 0, midY, GUARD_D - inset),
    pos(new PlaneGeometry(w, tall).rotateY(Math.PI), 0, midY, inset),
    pos(new PlaneGeometry(d, tall).rotateY(Math.PI / 2), GUARD_W / 2 - inset, midY, GUARD_D / 2),
    pos(new PlaneGeometry(d, tall).rotateY(-Math.PI / 2), -GUARD_W / 2 + inset, midY, GUARD_D / 2),
  ];
  return { frame: merge(bars), clear: toCell(merge(panes), CELL.clear) };
}

function plunger(): Part[] {
  return [
    [pos(cyl(0.03, 0.05, 'y', 16), 0, 0.027, 0), BLACK],
    [
      turned(
        [[0.03, 0.046], [0.058, 0.046], [0.066, 0.052], [0.0675, 0.06], [0.061, 0.072], [0.046, 0.083], [0.025, 0.089], [0, 0.091]],
        28,
      ),
      RED,
    ],
  ];
}

function guardOpen(time: number): number {
  if (time < 0) return 0;
  if (time < T_GUARD) {
    const u = time / T_GUARD - 1;
    return 1 + 2 * u * u * u + u * u;
  }
  if (time < T_CLOSE) return 1;
  const fall = (time - T_CLOSE) / 0.36;
  if (fall < 1) return 1 - fall * fall;
  const since = time - T_CLOSE - 0.36;
  return 0.07 * Math.abs(Math.sin(since * 15)) * Math.exp(-8 * since);
}

function plungerDrop(time: number): number {
  const since = time - T_PRESS;
  if (since < 0) return 0;
  if (since < 0.08) return -TRAVEL * ease(since / 0.08);
  if (since < 0.2) return -TRAVEL;
  const free = since - 0.2;
  return -TRAVEL * Math.exp(-13 * free) * Math.cos(27 * free);
}

function beaconTurn(time: number): number {
  const on = time - BEACON_ON;
  if (on <= 0) return 0;
  if (on < SPIN_UP) return (BEACON_RATE * on * on) / (2 * SPIN_UP);
  if (time < BEACON_OFF) return BEACON_RATE * (on - SPIN_UP / 2);
  const off = Math.min(SPIN_DOWN, time - BEACON_OFF);
  return BEACON_RATE * (BEACON_OFF - BEACON_ON - SPIN_UP / 2 + off - (off * off) / (2 * SPIN_DOWN));
}

const SECONDS_FROM = 45;
const SECONDS_LOOP = 17;

function secondsShown(clock: number): number {
  const s = clock % SECONDS_LOOP;
  if (s < 14.6) {
    const beat = Math.min(14, Math.floor(s));
    if (beat === 0) return SECONDS_FROM;
    const since = s - beat;
    return SECONDS_FROM + beat - Math.exp(-30 * since) * Math.cos(55 * since);
  }
  if (s < 16.2) {
    const strain = s - 14.6;
    return 59 + 0.55 * Math.abs(Math.sin(strain * Math.PI * 2.5)) * Math.exp(-0.8 * strain);
  }
  const slip = s - 16.2;
  const fall = ease(clamp01(slip / 0.7));
  return 59 - 14 * fall - 0.4 * Math.sin((slip - 0.7) * 30) * Math.exp(-14 * (slip - 0.7)) * (slip > 0.7 ? 1 : 0);
}

function heartbeat(clock: number): number {
  const p = clock % 1.6;
  const lub = Math.exp(-(((p - 0.1) / 0.07) ** 2));
  const dub = 0.75 * Math.exp(-(((p - 0.4) / 0.08) ** 2));
  return 0.1 + 0.9 * Math.max(lub, dub);
}

function stage(time: number, from: number, until: number, verdict: ToneName): [ToneName, number] {
  if (time < from || time >= T_DARK) return ['amber', 0];
  if (time < until) return ['amber', 0.35 + 0.65 * (0.5 - 0.5 * Math.cos((time - from) * 11))];
  return [verdict, 1];
}

function lampsAt(time: number | null, clock: number): Lamps {
  if (time === null) {
    return { build: ['amber', 0], test: ['amber', 0], prod: ['amber', 0], ready: heartbeat(clock), fault: 0, beacon: 0 };
  }
  const failed = time >= T_FAIL && time < T_DARK;
  const since = time - T_FAIL;
  const prod = stage(time, T_PROD, T_FAIL, 'red');
  if (failed && since < 1.2) prod[1] = Math.floor(since * 5) % 2 === 0 ? 1 : 0.15;
  return {
    build: stage(time, T_BUILD, T_TEST, 'green'),
    test: stage(time, T_TEST, T_PROD, 'green'),
    prod,
    ready: time < T_FAIL ? 1 : time < T_DARK ? 0 : clamp01((time - T_DARK) / 1.2) * heartbeat(clock),
    fault: failed ? (Math.floor(since * 6) % 2 === 0 ? 1 : 0) : 0,
    beacon: time > BEACON_ON && time < BEACON_OFF + SPIN_DOWN * 0.55 ? 1 : 0,
  };
}

// Both hemisphere passes draw 0.5 < w_dot < 2 (hyperCore.ts), which blends a translucent surface twice.
function blendOnce(mats: HyperMaterial[]): void {
  const far = mats.find((mat) => mat.hemisphere === 'top');
  if (!far) return;
  const overlap = 'if (w_dot < 0.5) discard;';
  if (far.fragmentShader.includes(overlap)) far.fragmentShader = far.fragmentShader.replace(overlap, 'if (w_dot <= 2.0) discard;');
  else far.visible = false;
}

export interface DeployButtonResult {
  object: HyperObject;
  tick: (worldGV: GyroVector, dt: number) => void;
}

export function buildDeployButton(world: HyperWorld, at: GyroVector, yaw: number): DeployButtonResult {
  const object = new HyperObject(at);
  object.rotation.y = yaw;
  const put = (parts: Part[], node?: Group): void => {
    for (const [g, opts] of parts) object.addGeometry(world.shared, g, opts, node);
  };

  const atlas = atlasTexture();
  const lampTex = lampTexture();
  const LENS: HyperMaterialOptions = {
    map: lampTex.texture,
    color: 0xffffff,
    ambient: 0.96,
    gloss: 0.3,
    castShadow: false,
    receiveShadow: false,
  };
  const CLEAR: HyperMaterialOptions = {
    map: lampTex.texture,
    color: 0xffffff,
    ambient: 0.78,
    gloss: 0.75,
    alphaBlend: true,
    castShadow: false,
    receiveShadow: false,
  };

  const all = kit();
  join(all, footing());
  join(all, placed(consoleDesk(), (g) => void g.translate(0, DECK_TOP, 0)));
  join(all, board());
  all.solid.push(...wiring());

  const lamp = beacon();
  const beaconAt = new Vector3(POST_X, BEACON_Y, POST_Z);
  for (const [g] of lamp.solid) g.translate(beaconAt.x, beaconAt.y, beaconAt.z);
  all.solid.push(...lamp.solid);
  all.lenses.push(lamp.bulb.translate(beaconAt.x, beaconAt.y, beaconAt.z));

  put(all.solid);
  object.addGeometry(world.shared, merge(all.decals), { ...DECAL, map: atlas });
  object.addGeometry(world.shared, treadPlate(), { map: atlas, color: 0xffffff, ambient: 0.64, gloss: 0.35, metal: 0.2 });
  object.addGeometry(world.shared, merge(all.lenses), LENS);
  const glass = toCell(new CircleGeometry(DIAL_R + 0.001, 28), CELL.clear).translate(CLOCK_AT[0], CLOCK_AT[1], BOARD_Z + 0.047);
  blendOnce(object.addLiveGeometry(world.shared, merge([lamp.dome.translate(beaconAt.x, beaconAt.y, beaconAt.z), glass]), CLEAR));

  const deckNode = new Group();
  deckNode.position.set(0, DECK_TOP + 0.74 + BEV * Math.cos(SLOPE), 0.17 + BEV * Math.sin(SLOPE));
  deckNode.rotation.x = SLOPE;
  object.add(deckNode);

  const guardNode = new Group();
  guardNode.position.set(0, HINGE_Y, HINGE_Z);
  deckNode.add(guardNode);
  const cover = guard();
  object.addGeometry(world.shared, cover.frame, RED, guardNode);
  blendOnce(object.addLiveGeometry(world.shared, cover.clear, CLEAR, guardNode));

  const plungerNode = new Group();
  plungerNode.position.set(0, PLATE_T, BUTTON_Z);
  deckNode.add(plungerNode);
  put(plunger(), plungerNode);

  const rotorNode = new Group();
  rotorNode.position.set(beaconAt.x, beaconAt.y + ROTOR_Y, beaconAt.z);
  object.add(rotorNode);
  for (const [g, opts] of rotor()) object.addGeometry(world.shared, g, { ...opts, map: lampTex.texture }, rotorNode);

  const secondNode = new Group();
  secondNode.position.set(CLOCK_AT[0], CLOCK_AT[1], BOARD_Z + DIAL_Z + 0.011);
  object.add(secondNode);
  object.addGeometry(
    world.shared,
    merge([hand(0.178, 0.05, 0.004, 0.003), new CylinderGeometry(0.011, 0.011, 0.002, 12).rotateX(Math.PI / 2).translate(0, -0.04, 0.001)]),
    { ...RED, castShadow: false },
    secondNode,
  );

  const aimNode = new Group();
  aimNode.position.set(0, PLATE_T + 0.055, BUTTON_Z);
  deckNode.add(aimNode);

  world.add(object);

  object.updateMatrixWorld(true);
  const aimAt = new Vector3().setFromMatrixPosition(aimNode.matrixWorld);
  const frontOf = new Vector3(0, 0, 0.5).applyQuaternion(object.quaternion).add(aimAt);
  const aimRange = units(AIM_RANGE_UNITS);
  const sinRho = Math.sin(units(AIM_RHO_UNITS));

  const promptEl = document.createElement('div');
  promptEl.className = 'aim-prompt';
  document.body.append(promptEl);

  let hovered = false;
  const repaintPrompt = () => {
    promptEl.textContent = hovered ? `DEPLOY — ${t(PROMPT)}` : '';
    promptEl.style.opacity = hovered ? '1' : '0';
  };
  onLangChange(repaintPrompt);

  let clock = 0;
  let pressedAt: number | null = null;
  let lift = 0;

  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || e.repeat || !hovered || pressedAt !== null) return;
    pressedAt = clock;
    hovered = false;
    repaintPrompt();
  });

  const poincare = new Vector3();
  const point = new Vector3();
  const ahead = new Vector3();
  const forwardDir = new Vector3();

  const tick = (worldGV: GyroVector, dt: number) => {
    clock += dt;
    if (pressedAt !== null && clock - pressedAt >= T_END) pressedAt = null;
    const time = pressedAt === null ? null : clock - pressedAt;
    if (!object.inView && !hovered) return;

    let aimed = false;
    if (time === null) {
      const composed = object.localGV.add(worldGV);
      composed.transformPoint(unitToPoincare(poincare.copy(aimAt), object.useTanKHeight, poincare), point);
      const d = geodesicRadius(point);
      if (d < aimRange) {
        composed.transformPoint(unitToPoincare(poincare.copy(frontOf), object.useTanKHeight, poincare), ahead);
        if (geodesicRadius(ahead) < d) {
          const half = Math.max(AIM_MIN, Math.asin(Math.min(1, sinRho / Math.max(1e-4, Math.sin(d)))));
          forwardDir.set(0, 0, -1).applyQuaternion(world.camera.quaternion);
          aimed = Math.acos(Math.max(-1, Math.min(1, point.normalize().dot(forwardDir)))) < half;
        }
      }
    }
    if (aimed !== hovered) {
      hovered = aimed;
      repaintPrompt();
    }

    lift += ((hovered ? 1 : 0) - lift) * Math.min(1, dt * 10);
    const run = time ?? -1;
    guardNode.rotation.x = -GUARD_OPEN * Math.max(guardOpen(run), 0.11 * lift);
    plungerNode.position.y = PLATE_T + plungerDrop(run);
    rotorNode.rotation.y = beaconTurn(run);
    secondNode.rotation.z = (-secondsShown(clock) / 60) * Math.PI * 2;
    lampTex.show(lampsAt(time, clock));
  };

  lampTex.show(lampsAt(null, 0));
  return { object, tick };
}
