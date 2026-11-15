import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  IcosahedronGeometry,
  PlaneGeometry,
  Shape,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import type { HyperMaterialOptions } from '../../engine';
import { L, t, upper } from '../../content/i18n';
import { across, grained, lathe, moved, pos, rod, roundedRect, trace, type Part, type Point } from '../geometry';
import { localizedCanvasTexture } from '../text';
import { pencil } from './stationery';

// Every solid here needs gloss, metal or grain above zero: a part with none of them lands in a second batch.
const CONCRETE: HyperMaterialOptions = { color: 0xd2d0c8, ambient: 0.62, gloss: 0.05, grain: 0.16 };
const GRAVEL_BED: HyperMaterialOptions = { color: 0xb4ae9f, ambient: 0.6, gloss: 0.03, grain: 0.34 };
const PEBBLES = [0xc3bdae, 0xa39f95, 0xd6d1c4];
const LINE_PAINT: HyperMaterialOptions = { color: 0x86957b, ambient: 0.8, gloss: 0.04 };
const BRASS: HyperMaterialOptions = { color: 0xe9cb7a, ambient: 0.55, gloss: 0.6, metal: 0.9 };
const STEEL: HyperMaterialOptions = { color: 0xdde1e4, ambient: 0.62, gloss: 0.5, metal: 0.6 };
const YELLOW: HyperMaterialOptions = { color: 0xf6c935, ambient: 0.62, gloss: 0.46 };
const BLACK: HyperMaterialOptions = { color: 0x4d5157, ambient: 0.55, gloss: 0.34 };
const TRIBRACH: HyperMaterialOptions = { color: 0x6a7078, ambient: 0.56, gloss: 0.3 };
const GLASS: HyperMaterialOptions = { color: 0x56788f, ambient: 0.5, gloss: 0.95, metal: 0.35 };
const VIAL: HyperMaterialOptions = { color: 0xdcf09a, ambient: 0.9, gloss: 0.8 };
const ASH: HyperMaterialOptions = { color: 0xe8c592, ambient: 0.56, gloss: 0.36, grain: 0.22 };
const CAST_GREEN: HyperMaterialOptions = { color: 0x86a898, ambient: 0.58, gloss: 0.32 };
const CORD: HyperMaterialOptions = { color: 0xf3efe2, ambient: 0.7, gloss: 0.02 };
const POLE_RED: HyperMaterialOptions = { color: 0xea5440, ambient: 0.62, gloss: 0.4 };
const POLE_WHITE: HyperMaterialOptions = { color: 0xf6f4ec, ambient: 0.62, gloss: 0.4 };
const WALNUT: HyperMaterialOptions = { color: 0xb08258, ambient: 0.52, gloss: 0.16, grain: 0.26 };
const CANVAS: HyperMaterialOptions = { color: 0xd9c9a0, ambient: 0.62, gloss: 0.03, grain: 0.14 };
const PAPER: HyperMaterialOptions = { color: 0xf7f3e6, ambient: 0.66, gloss: 0.06 };
const COVER: HyperMaterialOptions = { color: 0xf0934a, ambient: 0.6, gloss: 0.2 };

export const DECAL: HyperMaterialOptions = {
  color: 0xffffff,
  ambient: 0.9,
  alphaTest: 0.3,
  alphaBlend: true,
  castShadow: false,
  receiveShadow: false,
};

export const PAD_TOP = 0.075;
const PAD_HALF = 0.23;
const DISC_R = 0.108;
const DISC_RISE = 0.0122;
export const DISC_TOP = PAD_TOP + DISC_RISE;
export const HEAD_TOP = 0.7;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let v = Math.imul(s ^ (s >>> 15), 1 | s);
    v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

function cyl(r: number, length: number, segments = 10, rTop = r): BufferGeometry {
  return new CylinderGeometry(rTop, r, length, segments);
}

function alongX(g: BufferGeometry): BufferGeometry {
  return g.rotateZ(-Math.PI / 2);
}

function alongZ(g: BufferGeometry): BufferGeometry {
  return g.rotateX(Math.PI / 2);
}

/** A chamfered bar, centred, its length along y. */
function bar(w: number, length: number, d: number, c = 0.003): BufferGeometry {
  const x = w / 2;
  const z = d / 2;
  const section = trace(new Shape(), [
    [-x + c, -z],
    [x - c, -z],
    [x, -z + c],
    [x, z - c],
    [x - c, z],
    [-x + c, z],
    [-x, z - c],
    [-x, -z + c],
  ]);
  return new ExtrudeGeometry(section, { depth: length, bevelEnabled: false })
    .translate(0, 0, -length / 2)
    .rotateX(-Math.PI / 2);
}

/** A flat extrusion standing on y = 0, `height` tall, bevelled top and bottom. */
function slab(shape: Shape, height: number, bevel: number, curveSegments = 4): BufferGeometry {
  return new ExtrudeGeometry(shape, {
    depth: height - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments,
  })
    .translate(0, 0, bevel)
    .rotateX(-Math.PI / 2);
}

function turned(parts: Part[], angle: number): Part[] {
  for (const [g] of parts) g.rotateX(angle);
  return parts;
}

/** Map a geometry's 0..1 UVs onto a pixel rectangle of the atlas. */
function inAtlas(g: BufferGeometry, x0: number, y0: number, x1: number, y1: number): BufferGeometry {
  const uv = g.attributes.uv as BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      (x0 + uv.getX(i) * (x1 - x0)) / ATLAS,
      1 - (y1 - uv.getY(i) * (y1 - y0)) / ATLAS,
    );
  }
  return g;
}

const ATLAS = 1024;
const SANS = '"Segoe UI", Arial, sans-serif';
const SCRIPT = '"Segoe Script", "Comic Sans MS", "Segoe UI", cursive';

function stamped(ctx: CanvasRenderingContext2D, draw: () => void): void {
  ctx.save();
  ctx.translate(1.6, 2.2);
  ctx.fillStyle = ctx.strokeStyle = 'rgba(255, 246, 210, 0.62)';
  draw();
  ctx.restore();
  ctx.fillStyle = ctx.strokeStyle = 'rgba(72, 52, 20, 0.94)';
  draw();
}

function arcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  r: number,
  middle: number,
  maxSpan: number,
  startPx: number,
  topsInward: boolean,
): void {
  const chars = [...text];
  let size = startPx;
  let widths: number[] = [];
  let total = 0;
  do {
    ctx.font = `700 ${size}px ${SANS}`;
    widths = chars.map((ch) => ctx.measureText(ch).width + size * 0.14);
    total = widths.reduce((a, b) => a + b, 0);
    if (total / r <= maxSpan) break;
    size -= 1;
  } while (size > 10);

  const dir = topsInward ? -1 : 1;
  let angle = middle - (dir * total) / r / 2;
  chars.forEach((ch, i) => {
    const half = widths[i] / r / 2;
    angle += dir * half;
    ctx.save();
    ctx.translate(r * Math.cos(angle), r * Math.sin(angle));
    ctx.rotate(angle + (dir * Math.PI) / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    angle += dir * half;
  });
}

function paintDisc(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(256, 256);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const D = Math.SQRT1_2;
  stamped(ctx, () => {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 179, 0, Math.PI * 2);
    ctx.stroke();

    arcText(ctx, upper(t(L('triangulation station', 'nirengi noktası'))), 201, -Math.PI / 2, 2.5, 27, false);
    arcText(ctx, upper(t(L('do not disturb this mark', 'bu işarete dokunmayın'))), 201, Math.PI / 2, 2.5, 27, true);
    for (const x of [-201, 201]) {
      ctx.beginPath();
      ctx.arc(x, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.lineWidth = 5;
    ctx.beginPath();
    for (const sx of [-1, 1]) {
      ctx.moveTo(0, 0);
      ctx.lineTo(sx * 172 * D, 172 * D);
      ctx.moveTo(0, 0);
      ctx.lineTo(sx * 42 * D, -42 * D);
    }
    ctx.stroke();

    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-26, 26);
    ctx.lineTo(0, 52);
    ctx.lineTo(26, 26);
    ctx.stroke();

    ctx.font = `700 84px ${SANS}`;
    ctx.fillText('90°', 5, 124);
    ctx.font = `700 30px ${SANS}`;
    ctx.fillText('K = +1', 0, -110);
  });

  ctx.fillStyle = 'rgba(255, 246, 210, 0.7)';
  ctx.beginPath();
  ctx.arc(1.5, 2, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(40, 28, 10, 0.96)';
  ctx.beginPath();
  ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintGroundAngle(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(512, 0);
  ctx.fillStyle = '#3f4a3a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 240;
  do {
    ctx.font = `600 ${size}px ui-monospace, Consolas, monospace`;
    if (ctx.measureText('90°').width <= 470) break;
    size -= 4;
  } while (size > 40);
  ctx.fillText('90°', 256, 134);
  ctx.restore();
}

function paintNameplate(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(PLATE_PX[0], PLATE_PX[1]);
  ctx.fillStyle = '#2a2d32';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#d9d3c0';
  ctx.lineWidth = 4;
  ctx.strokeRect(9, 9, 238, 110);
  ctx.fillStyle = '#ece6d2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 58px ${SANS}`;
  ctx.fillText('T·270', 128, 50);
  ctx.font = `600 26px ${SANS}`;
  ctx.fillText('№ 090 090 090', 128, 96);
  ctx.restore();
}

function fitLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startPx: number, family: string): void {
  let size = startPx;
  do {
    ctx.font = `400 ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  } while (size > 12);
}

const BOOK_PX: [number, number, number, number] = [0, 512, 768, 1024];
const PLATE_PX: [number, number] = [768, 896];

function paintFieldBook(ctx: CanvasRenderingContext2D): void {
  const W = 768;
  const H = 512;
  ctx.save();
  ctx.translate(0, 512);
  ctx.fillStyle = '#f7f3e4';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(96, 140, 186, 0.42)';
  ctx.lineWidth = 2;
  for (let y = 64; y < H - 20; y += 44) {
    ctx.beginPath();
    ctx.moveTo(14, y);
    ctx.lineTo(W - 14, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(200, 84, 70, 0.5)';
  for (const x of [58, W / 2 + 34]) {
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x, H - 10);
    ctx.stroke();
  }

  const PENCIL = '#3b4048';
  const RED = '#c9463a';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = PENCIL;

  ['A', 'B', 'C'].forEach((corner, i) => {
    ctx.save();
    ctx.translate(74, 86 + i * 66);
    ctx.rotate(-0.02 + i * 0.015);
    fitLine(ctx, `${corner}   90° 00′ 00″`, 280, 44, SCRIPT);
    ctx.fillText(`${corner}   90° 00′ 00″`, 0, 0);
    ctx.restore();
  });
  ctx.strokeStyle = PENCIL;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(70, 262);
  ctx.lineTo(356, 256);
  ctx.stroke();
  ctx.save();
  ctx.translate(74, 306);
  ctx.rotate(-0.015);
  fitLine(ctx, 'Σ   270° 00′ 00″', 280, 44, SCRIPT);
  ctx.fillText('Σ   270° 00′ 00″', 0, 0);
  ctx.restore();

  ctx.fillStyle = RED;
  ctx.save();
  ctx.translate(74, 402);
  ctx.rotate(-0.05);
  const note = t(L('measured it 3 times!', '3 kez ölçtüm!'));
  fitLine(ctx, note, 284, 40, SCRIPT);
  ctx.fillText(note, 0, 0);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = PENCIL;
  ctx.save();
  ctx.translate(W * 0.75 + 16, 92);
  ctx.rotate(-0.025);
  fitLine(ctx, '90° + 90° + 90°', 300, 50, SCRIPT);
  ctx.fillText('90° + 90° + 90°', 0, 0);
  ctx.restore();

  ctx.save();
  ctx.translate(W * 0.75 + 16, 190);
  ctx.rotate(0.03);
  fitLine(ctx, '= 270° ?!', 270, 72, SCRIPT);
  ctx.fillText('= 270° ?!', 0, 0);
  const tw = ctx.measureText('= 270° ?!').width;
  ctx.strokeStyle = RED;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(6, 2, tw * 0.6, 50, -0.04, 0.2, Math.PI * 2 + 0.5);
  ctx.stroke();
  ctx.restore();

  const cx = W * 0.75 + 16;
  const cy = 392;
  const R = 84;
  const corners: Point[] = [0, 1, 2].map((i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    return [cx + R * Math.cos(a), cy + 10 + R * Math.sin(a)];
  });
  ctx.strokeStyle = PENCIL;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  corners.forEach(([x, y], i) => {
    const [nx, ny] = corners[(i + 1) % 3];
    const mx = (x + nx) / 2;
    const my = (y + ny) / 2;
    const bulge = 0.42;
    if (i === 0) ctx.moveTo(x, y);
    ctx.quadraticCurveTo(mx + (mx - cx) * bulge * 2, my + (my - cy - 10) * bulge * 2, nx, ny);
  });
  ctx.stroke();
  ctx.fillStyle = RED;
  ctx.font = `400 26px ${SCRIPT}`;
  corners.forEach(([x, y]) => {
    ctx.fillText('90°', x + (x - cx) * 0.36, y + (y - cy - 10) * 0.36);
  });
  ctx.restore();
}

export function surveyAtlas() {
  return localizedCanvasTexture(ATLAS, ATLAS, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    paintDisc(ctx);
    paintGroundAngle(ctx);
    paintNameplate(ctx);
    paintFieldBook(ctx);
  });
}

const DISC_PROFILE: Point[] = [
  [DISC_R, 0],
  [DISC_R, 0.004],
  [DISC_R - 0.003, 0.0072],
  [DISC_R - 0.0085, 0.0072],
  [DISC_R - 0.0115, 0.0046],
  [0.07, 0.007],
  [0.036, 0.0106],
  [0.0005, DISC_RISE],
];

/**
 * A brass survey disc in a concrete pad with a gravel skirt. Authored with one
 * painted side leaving along -z and the other along +x.
 */
export function surveyMarker(seed: number): { parts: Part[]; decals: BufferGeometry[] } {
  const parts: Part[] = [];
  const BEVEL = 0.012;

  const pad = slab(
    roundedRect(new Shape(), 2 * (PAD_HALF - BEVEL), 2 * (PAD_HALF - BEVEL), 0.03),
    PAD_TOP + 0.02,
    BEVEL,
    2,
  );
  parts.push([grained(pos(pad, 0, -0.02, 0), 'y', 62, 62), CONCRETE]);

  parts.push([grained(gravelBed(), 'y', 170, 170), GRAVEL_BED]);

  const random = rng(seed);
  for (let i = 0; i < 22; i++) {
    const along = (random() * 2 - 1) * (PAD_HALF + 0.05);
    const out = PAD_HALF + 0.014 + random() * 0.062;
    const side = Math.floor(random() * 4);
    const [x, z] = [
      [along, -out],
      [out, along],
      [along, out],
      [-out, along],
    ][side];
    const r = 0.013 + random() * 0.013;
    const colour = PEBBLES[Math.floor(random() * PEBBLES.length)];
    const spin = random() * Math.PI;
    if ((Math.abs(x) < 0.17 && z < 0) || (Math.abs(z) < 0.17 && x > 0)) continue;
    const pebble = new IcosahedronGeometry(1, 0).scale(r, r * 0.55, r * (0.75 + random() * 0.4)).rotateY(spin);
    parts.push([pos(pebble, x, 0.014 + r * 0.2, z), { color: colour, ambient: 0.6, gloss: 0.06 }]);
  }

  parts.push([pos(lathe(DISC_PROFILE, 18), 0, PAD_TOP, 0), BRASS]);

  const reach = PAD_HALF - BEVEL;
  const stripe = reach - DISC_R - 0.004;
  const mid = DISC_R + 0.004 + stripe / 2;
  parts.push([pos(bar(0.022, 0.003, stripe, 0.0008), 0, PAD_TOP + 0.0006, -mid), LINE_PAINT]);
  parts.push([pos(bar(stripe, 0.003, 0.022, 0.0008), mid, PAD_TOP + 0.0006, 0), LINE_PAINT]);

  const LIFT = 0.0022;
  const cap = lathe(
    DISC_PROFILE.slice(2).map(([r, y]) => [r, y + LIFT] as Point),
    18,
  );
  const p = cap.attributes.position;
  const uv = cap.attributes.uv as BufferAttribute;
  const SPAN = 2 * (DISC_R + 0.003);
  for (let i = 0; i < p.count; i++) {
    uv.setXY(i, 0.5 + p.getX(i) / SPAN, 0.5 - p.getZ(i) / SPAN);
  }
  // The stamp's top edge has to end up on the outward bisector, so the two long cross arms run down the painted sides.
  cap.rotateY((3 * Math.PI) / 4);
  const decals = [pos(inAtlas(cap, 0, 0, 512, 512), 0, PAD_TOP, 0)];

  const painted = new PlaneGeometry(0.85, 0.425, 3, 2).rotateX(-Math.PI / 2).rotateY(-Math.PI / 4);
  const d = 0.86 * Math.SQRT1_2;
  decals.push(pos(inAtlas(painted, 514, 2, 1022, 254), d, 0.045, -d));

  return { parts, decals };
}

function contour(size: number, r: number): Vector2[] {
  const points = roundedRect(new Shape(), size, size, r).getPoints(2);
  if (points[0].distanceTo(points[points.length - 1]) < 1e-6) points.pop();
  return points;
}

function gravelBed(): BufferGeometry {
  const rings: Array<[Vector2[], number]> = [
    [contour(0.67, 0.1), -0.003],
    [contour(0.62, 0.08), 0.015],
    [contour(2 * PAD_HALF - 0.02, 0.03), 0.015],
  ];
  const n = rings[0][0].length;
  const position: number[] = [];
  const index: number[] = [];
  rings.forEach(([points, y], j) => {
    points.forEach((p, i) => {
      position.push(p.x, y, -p.y);
      if (j === 0) return;
      const a = (j - 1) * n + i;
      const b = (j - 1) * n + ((i + 1) % n);
      index.push(a, b, a + n, b, b + n, a + n);
    });
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array((position.length / 3) * 2), 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function trefoil(lobe: number, reach: number): Shape {
  const s = new Shape();
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
    s.absarc(reach * Math.cos(a), reach * Math.sin(a), lobe, a - Math.PI / 3, a + Math.PI / 3, false);
  }
  s.closePath();
  return s;
}

const TRUNNION = 0.225;

/** The instrument, standing on y = 0 (the tripod head) and sighting along -z. */
export function theodolite(): { parts: Part[]; decals: BufferGeometry[] } {
  const parts: Part[] = [];
  const REACH = 0.055;

  parts.push([slab(trefoil(0.018, REACH), 0.008, 0.002), TRIBRACH]);
  parts.push([pos(slab(trefoil(0.018, REACH), 0.016, 0.002), 0, 0.042, 0), TRIBRACH]);
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3;
    const x = -REACH * Math.sin(a);
    const z = -REACH * Math.cos(a);
    parts.push([pos(cyl(0.006, 0.04, 8), x, 0.026, z), STEEL]);
    parts.push([pos(cyl(0.0175, 0.014, 12), x, 0.024, z), BLACK]);
    parts.push([pos(cyl(0.0185, 0.003, 12), x, 0.024, z), STEEL]);
  }
  parts.push([rod(new Vector3(0.866 * 0.04, 0.05, -0.5 * 0.04), new Vector3(0.866 * 0.066, 0.05, -0.5 * 0.066), 0.0065, 0.0065, 8), BLACK]);

  const EAR_Z = 0.052;
  parts.push([pos(cyl(0.0145, 0.016, 12), 0, 0.05, EAR_Z), TRIBRACH]);
  parts.push([pos(cyl(0.0125, 0.003, 12), 0, 0.0595, EAR_Z), BRASS]);
  parts.push([pos(cyl(0.0098, 0.0034, 12), 0, 0.0602, EAR_Z), VIAL]);
  parts.push([pos(cyl(0.0028, 0.0036, 8), 0.001, 0.0604, EAR_Z - 0.0012), BLACK]);

  parts.push([
    lathe(
      [
        [0.045, 0.058],
        [0.056, 0.062],
        [0.056, 0.106],
        [0.052, 0.112],
        [0.001, 0.112],
      ],
      20,
    ),
    YELLOW,
  ]);
  parts.push([
    lathe(
      [
        [0.056, 0.0735],
        [0.0615, 0.0745],
        [0.0615, 0.0835],
        [0.056, 0.0845],
      ],
      20,
    ),
    STEEL,
  ]);
  for (let i = 0; i < 24; i++) {
    const tick = new CylinderGeometry(0.001, 0.001, i % 3 === 0 ? 0.007 : 0.004, 3, 1, true);
    parts.push([pos(tick, 0.0617, 0.079, 0).rotateY((i * Math.PI) / 12), BLACK]);
  }

  const standard: Point[] = [
    [-0.024, 0.112],
    [0.024, 0.112],
    [0.023, 0.16],
    [0.019, 0.235],
    [0.016, 0.262],
    [0.008, 0.272],
    [-0.008, 0.272],
    [-0.016, 0.262],
    [-0.019, 0.235],
    [-0.023, 0.16],
  ];
  const STAND_X = 0.042;
  for (const sx of [-1, 1]) {
    parts.push([pos(across(standard, 0.02, 0.003), sx * STAND_X, 0, 0), YELLOW]);
  }

  parts.push([pos(alongX(cyl(0.027, 0.064, 14)), 0, TRUNNION, 0), YELLOW]);
  const scope = (profile: Point[], opts: HyperMaterialOptions): void => {
    parts.push([pos(alongZ(lathe(profile, 14)), 0, TRUNNION, 0), opts]);
  };
  scope(
    [
      [0.0235, -0.104],
      [0.027, -0.104],
      [0.027, -0.078],
      [0.0225, -0.074],
    ],
    BLACK,
  );
  scope(
    [
      [0.0005, -0.1],
      [0.012, -0.0992],
      [0.0236, -0.097],
    ],
    GLASS,
  );
  scope(
    [
      [0.0225, -0.076],
      [0.0215, -0.03],
      [0.0215, 0.03],
      [0.019, 0.035],
    ],
    YELLOW,
  );
  scope(
    [
      [0.019, 0.034],
      [0.0235, 0.036],
      [0.0235, 0.056],
      [0.019, 0.058],
    ],
    BLACK,
  );
  for (const z of [0.041, 0.046, 0.051]) {
    parts.push([pos(alongZ(cyl(0.0241, 0.0016, 14)), 0, TRUNNION, z), TRIBRACH]);
  }
  scope(
    [
      [0.0175, 0.057],
      [0.015, 0.08],
      [0.013, 0.083],
    ],
    YELLOW,
  );
  scope(
    [
      [0.013, 0.082],
      [0.0165, 0.084],
      [0.0165, 0.098],
      [0.0145, 0.104],
      [0.008, 0.104],
    ],
    BLACK,
  );
  scope(
    [
      [0.008, 0.1032],
      [0.0005, 0.1032],
    ],
    GLASS,
  );

  const OUTER = STAND_X + 0.01;
  parts.push([pos(alongX(cyl(0.038, 0.014, 18)), -OUTER - 0.007, TRUNNION, 0), YELLOW]);
  parts.push([pos(alongX(cyl(0.031, 0.003, 18)), -OUTER - 0.0155, TRUNNION, 0), BLACK]);
  parts.push([pos(alongX(cyl(0.008, 0.004, 10)), -OUTER - 0.019, TRUNNION, 0), STEEL]);
  parts.push([pos(alongX(cyl(0.017, 0.007, 12)), OUTER + 0.0035, TRUNNION, 0), BLACK]);
  parts.push([pos(alongX(cyl(0.006, 0.004, 8)), OUTER + 0.009, TRUNNION, 0), STEEL]);

  const tangent = (axis: 'x' | 'z', x: number, y: number, z: number): void => {
    const lay = axis === 'x' ? alongX : alongZ;
    const step = (d: number): [number, number, number] => (axis === 'x' ? [x + d, y, z] : [x, y, z + d]);
    parts.push([pos(lay(cyl(0.0035, 0.01, 6)), ...step(0.004)), STEEL]);
    parts.push([pos(lay(cyl(0.0098, 0.011, 10)), ...step(0.0125)), BLACK]);
    parts.push([pos(lay(cyl(0.0058, 0.009, 8)), ...step(0.0225)), TRIBRACH]);
  };
  tangent('x', 0.055, 0.092, 0.006);
  tangent('z', STAND_X, 0.185, 0.0205);

  parts.push([pos(alongZ(cyl(0.0062, 0.05, 8)), STAND_X, 0.25, 0.036), YELLOW]);
  parts.push([pos(alongZ(cyl(0.0088, 0.012, 10)), STAND_X, 0.25, 0.066), BLACK]);

  parts.push([pos(alongX(cyl(0.005, 0.036, 8)), 0, 0.1182, 0.03), VIAL]);
  for (const sx of [-1, 1]) {
    parts.push([pos(alongX(cyl(0.0062, 0.006, 8)), sx * 0.02, 0.1182, 0.03), BLACK]);
  }

  const grip = new CatmullRomCurve3(
    [
      [-STAND_X, 0.264],
      [-STAND_X, 0.297],
      [-0.035, 0.312],
      [-0.02, 0.317],
      [0.02, 0.317],
      [0.035, 0.312],
      [STAND_X, 0.297],
      [STAND_X, 0.264],
    ].map(([x, y]) => new Vector3(x, y, 0)),
    false,
    'catmullrom',
    0.25,
  );
  parts.push([new TubeGeometry(grip, 22, 0.0062, 6), BLACK]);
  for (const sx of [-1, 1]) {
    parts.push([pos(cyl(0.009, 0.006, 8), sx * STAND_X, 0.274, 0), BLACK]);
  }

  const plate = new PlaneGeometry(0.034, 0.017).rotateY(-Math.PI / 2);
  const decals = [pos(inAtlas(plate, PLATE_PX[0] + 2, PLATE_PX[1] + 2, PLATE_PX[0] + 254, PLATE_PX[1] + 126), -OUTER - 0.0018, 0.146, 0)];

  return { parts, decals };
}

const HINGE_R = 0.108;
const HINGE_Y = HEAD_TOP - 0.022;
const FOOT_R = 0.48;
const LEG_AZIMUTHS = [(5 * Math.PI) / 6, Math.PI / 6, -Math.PI / 2];

function tripodLeg(): Part[] {
  const parts: Part[] = [];
  for (const sx of [-1, 1]) {
    parts.push([pos(grained(bar(0.014, 0.44, 0.024), 'y'), sx * 0.024, -0.208, 0), ASH]);
  }
  parts.push([pos(grained(bar(0.026, 0.45, 0.02), 'y'), 0, -0.515, 0), ASH]);

  parts.push([pos(bar(0.078, 0.032, 0.036, 0.004), 0, -0.405, 0), BLACK]);
  parts.push([pos(alongZ(cyl(0.004, 0.014, 6)), 0, -0.405, 0.024), STEEL]);
  parts.push([pos(alongZ(cyl(0.012, 0.007, 10)), 0, -0.405, 0.0335), BRASS]);
  parts.push([pos(bar(0.03, 0.006, 0.005, 0.001), 0, -0.405, 0.0385), BRASS]);

  parts.push([alongX(cyl(0.0048, 0.078, 6)), STEEL]);
  for (const sx of [-1, 1]) {
    parts.push([pos(alongX(cyl(0.0095, 0.006, 6)), sx * 0.036, 0, 0), STEEL]);
  }
  parts.push([pos(bar(0.034, 0.02, 0.012, 0.002), 0, -0.2, 0), CAST_GREEN]);

  parts.push([pos(cyl(0.008, 0.06, 8, 0.0185), 0, -0.745, 0), STEEL]);
  parts.push([pos(cyl(0.0008, 0.045, 8, 0.008), 0, -0.7975, 0), STEEL]);
  parts.push([pos(bar(0.036, 0.006, 0.05, 0.002), 0, -0.728, 0.03), STEEL]);
  return parts;
}

/** A wooden surveyor's tripod centred on the origin, with the plumb bob hanging over `markY`. */
export function tripod(markY: number): Part[] {
  const parts: Part[] = [];
  const H = HEAD_TOP;

  parts.push([
    lathe(
      [
        [0.014, H - 0.036],
        [0.03, H - 0.036],
        [0.034, H - 0.022],
        [0.08, H - 0.022],
        [0.084, H - 0.018],
        [0.084, H - 0.003],
        [0.081, H],
        [0.001, H],
      ],
      18,
    ),
    CAST_GREEN,
  ]);

  const tilt = Math.atan2(FOOT_R - HINGE_R, HINGE_Y);
  for (const azimuth of LEG_AZIMUTHS) {
    const leg = moved(turned(tripodLeg(), -tilt), 0, HINGE_Y, HINGE_R);
    leg.push([pos(bar(0.03, 0.03, 0.05, 0.004), 0, H - 0.02, 0.1), CAST_GREEN]);
    parts.push(...moved(leg, 0, 0, 0, azimuth));
  }

  parts.push([pos(cyl(0.008, 0.045, 8), 0, H - 0.0575, 0), STEEL]);
  parts.push([pos(cyl(0.024, 0.016, 12), 0, H - 0.062, 0), BLACK]);
  parts.push([pos(new TorusGeometry(0.006, 0.0016, 5, 10), 0, H - 0.0855, 0), BRASS]);

  const tip = markY + 0.012;
  const BOB = 0.102;
  parts.push([
    pos(
      lathe(
        [
          [0.0003, 0],
          [0.0035, 0.018],
          [0.012, 0.05],
          [0.0145, 0.07],
          [0.0145, 0.082],
          [0.011, 0.09],
          [0.006, 0.093],
          [0.005, 0.1],
          [0.0025, BOB],
          [0.0003, BOB],
        ],
        10,
      ),
      0,
      tip,
      0,
    ),
    BRASS,
  ]);
  const top = H - 0.09;
  const bottom = tip + BOB - 0.002;
  parts.push([pos(cyl(0.0017, top - bottom, 5), 0, (top + bottom) / 2, 0), CORD]);

  return parts;
}

/** A folding camp stool with the field book open on it. The pages read from +z. */
export function fieldStool(): { parts: Part[]; decals: BufferGeometry[] } {
  const parts: Part[] = [];
  const RAIL_Y = 0.395;
  const RAIL_Z = 0.15;
  const FOOT_Z = 0.17;
  const rise = RAIL_Y - 0.01;
  const run = RAIL_Z + FOOT_Z;
  const length = Math.hypot(rise, run);
  const lean = Math.atan2(run, rise);

  for (const sx of [-1, 1]) {
    for (const [sz, x] of [[1, 0.201], [-1, 0.179]]) {
      const leg = grained(bar(0.02, length + 0.03, 0.028, 0.004), 'y').rotateX(sz * lean);
      parts.push([pos(leg, sx * x, (RAIL_Y + 0.01) / 2, (sz * (RAIL_Z - FOOT_Z)) / 2), WALNUT]);
      parts.push([pos(alongX(cyl(0.009, 0.004, 8)), sx * (x + sz * 0.012), 0.2145, 0), STEEL]);
    }
    parts.push([pos(alongX(cyl(0.0045, 0.05, 6)), sx * 0.19, 0.2145, 0), STEEL]);
  }
  for (const sz of [-1, 1]) {
    parts.push([pos(grained(alongX(cyl(0.014, 0.46, 8)), 'x'), 0, RAIL_Y, sz * RAIL_Z), WALNUT]);
    const stretcher = grained(alongX(cyl(0.009, sz > 0 ? 0.376 : 0.42, 8)), 'x');
    parts.push([pos(stretcher, 0, 0.01 + rise * 0.14, sz * (FOOT_Z - run * 0.14)), WALNUT]);
    parts.push([pos(grained(alongX(cyl(0.0178, 0.3, 8)), 'x', 150, 150), 0, RAIL_Y, sz * RAIL_Z), CANVAS]);
  }

  const SAG = 0.016;
  const seatTop = (z: number): number => RAIL_Y + 0.0178 - SAG * (1 - (z / RAIL_Z) ** 2);
  const upper: Point[] = [];
  const lower: Point[] = [];
  for (let i = 0; i <= 8; i++) {
    const z = -RAIL_Z + (i * 2 * RAIL_Z) / 8;
    upper.push([z, seatTop(z)]);
    lower.unshift([z, seatTop(z) - 0.005]);
  }
  parts.push([grained(across([...upper, ...lower], 0.3, 0.0012), 'x', 150, 150), CANVAS]);

  const BOOK_W = 0.134;
  const BOOK_D = 0.18;
  const bookY = seatTop(BOOK_D / 2) + 0.0015;
  const COVER_T = 0.004;
  const book: Part[] = [];
  book.push([pos(bar(2 * BOOK_W + 0.008, COVER_T, BOOK_D + 0.008, 0.001), 0, COVER_T / 2, 0), COVER]);
  const page: Point[] = [
    [0.002, 0],
    [BOOK_W, 0],
    [BOOK_W, 0.009],
    [0.11, 0.0115],
    [0.03, 0.0115],
    [0.01, 0.009],
    [0.002, 0.004],
  ];
  for (const sx of [-1, 1]) {
    const block = new ExtrudeGeometry(trace(new Shape(), page.map(([x, y]) => [sx * x, y] as Point)), {
      depth: BOOK_D,
      bevelEnabled: false,
    });
    book.push([pos(block, 0, COVER_T, -BOOK_D / 2), PAPER]);
  }
  book.push(...moved(pencil(0xf2c84b), 0, COVER_T + 0.0034, 0.012, Math.PI / 2));

  const sheets: BufferGeometry[] = [];
  const LIFT = 0.0013;
  for (const sx of [-1, 1]) {
    const edge = page.slice(2, 6).map(([x, y]) => [sx * x, y + COVER_T + LIFT] as Point);
    if (sx > 0) edge.reverse();
    const position: number[] = [];
    const uv: number[] = [];
    const index: number[] = [];
    edge.forEach(([x, y], i) => {
      const u = (x + BOOK_W) / (2 * BOOK_W);
      position.push(x, y, -BOOK_D / 2, x, y, BOOK_D / 2);
      uv.push(u, 1, u, 0);
      if (i > 0) {
        const a = (i - 1) * 2;
        index.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
      }
    });
    const sheet = new BufferGeometry();
    sheet.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
    sheet.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    sheet.setIndex(index);
    sheet.computeVertexNormals();
    sheets.push(inAtlas(sheet, BOOK_PX[0] + 3, BOOK_PX[1] + 3, BOOK_PX[2] - 3, BOOK_PX[3] - 3));
  }

  const TURN = 0.08;
  parts.push(...moved(book, 0, bookY, 0, TURN));
  const decals = sheets.map((g) => g.rotateY(TURN).translate(0, bookY, 0));

  return { parts, decals };
}

/** A banded ranging pole on its folding support. Local -z looks back at the instrument. */
export function rangingPole(): Part[] {
  const parts: Part[] = [];
  const R = 0.017;
  const BAND = 0.2;
  const BASE = 0.07;
  for (let i = 0; i < 8; i++) {
    const band = new CylinderGeometry(R, R, BAND, 8, 1, true);
    parts.push([pos(band, 0, BASE + BAND * (i + 0.5), 0), i % 2 === 0 ? POLE_RED : POLE_WHITE]);
  }
  const top = BASE + 8 * BAND;
  parts.push([
    pos(
      lathe(
        [
          [R, 0],
          [R * 0.92, 0.008],
          [R * 0.55, 0.014],
          [0.0005, 0.016],
        ],
        10,
      ),
      0,
      top,
      0,
    ),
    BLACK,
  ]);
  parts.push([pos(cyl(R + 0.003, 0.03, 10), 0, BASE + 0.005, 0), STEEL]);
  parts.push([pos(cyl(0.0008, 0.115, 10, R), 0, BASE - 0.0675, 0), STEEL]);

  const CLAMP = 0.58;
  parts.push([pos(cyl(R + 0.011, 0.04, 12), 0, CLAMP, 0), BLACK]);
  parts.push([pos(alongZ(cyl(0.0035, 0.02, 6)), 0, CLAMP, -(R + 0.018)), STEEL]);
  parts.push([pos(alongZ(cyl(0.011, 0.008, 10)), 0, CLAMP, -(R + 0.03)), BRASS]);
  for (let i = 0; i < 3; i++) {
    const a = (i * 2 * Math.PI) / 3;
    const dir = new Vector3(Math.sin(a), 0, Math.cos(a));
    const lug = bar(0.016, 0.02, 0.022, 0.003).rotateY(a);
    parts.push([pos(lug, dir.x * (R + 0.018), CLAMP - 0.008, dir.z * (R + 0.018)), BLACK]);
    const from = dir.clone().multiplyScalar(R + 0.02).setY(CLAMP - 0.01);
    const to = dir.clone().multiplyScalar(0.3).setY(0.012);
    parts.push([rod(from, to, 0.0058, 0.0058, 5), YELLOW]);
    const sunk = dir.clone().multiplyScalar(0.316).setY(-0.022);
    parts.push([rod(to, sunk, 0.0058, 0.0008, 5), STEEL]);
  }
  return parts;
}
