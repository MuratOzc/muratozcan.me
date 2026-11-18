import { CylinderGeometry, ExtrudeGeometry, PlaneGeometry, Shape, type BufferGeometry, type Texture } from 'three';
import type { HyperMaterialOptions } from '../../engine';
import { sfx } from '../../audio';
import { L, t, upper } from '../../content/i18n';
import { box, grained, merge, pos, roundedRect, type Part } from '../geometry';
import { localizedCanvasTexture, shrinkToFit } from '../text';

const CONCRETE: HyperMaterialOptions = { color: 0xc9c7c0, ambient: 0.62, gloss: 0.03 };
const POST: HyperMaterialOptions = { color: 0xb9a78d, ambient: 0.58, gloss: 0.05, grain: 0.3 };
const BACK: HyperMaterialOptions = { color: 0x55606c, ambient: 0.58, gloss: 0.35, metal: 0.3 };
const ZINC: HyperMaterialOptions = { color: 0xc6cdd2, ambient: 0.6, gloss: 0.45, metal: 0.6 };

const HIGH = 1.8;
const CENTRE = 1.46;
const PW = 0.84;
const PH = 0.56;
const POST_HALF = 0.04;

const TEX_W = 768;
const TEX_H = 512;
const POSTER = '"Arial Black", "Segoe UI Black", "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, Consolas, monospace';

const ABOVE = L('Since the last incident', 'Son kazadan bu yana');
const BELOW = L('days', 'gün');

const DIGITS = 4;
const STEP = 0.05;
// Each wheel starts on 9 and steps down, so it reaches 0 on step 9 and every tenth step after.
const SETTLES = [9, 19, 29, 39];

export interface IncidentBoard {
  parts: Part[];
  face: BufferGeometry;
  map: Texture;
  trip(): void;
  tick(dt: number): void;
}

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, digits: number[]): void {
  ctx.fillStyle = '#1f6f4d';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#f4f1e6';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(22, 22, w - 44, h - 44, 26);
  ctx.stroke();

  ctx.fillStyle = '#f4f1e6';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const line = (text: string, y: number, max: number): void => {
    shrinkToFit(max, 14, w - 120, (size) => {
      ctx.font = `900 ${size}px ${POSTER}`;
      return ctx.measureText(text).width;
    });
    ctx.fillText(text, w / 2, y);
  };
  line(upper(t(ABOVE)), 96, 54);
  line(upper(t(BELOW)), h - 84, 50);

  const cellW = 118;
  const cellH = 176;
  const gap = 18;
  const left = (w - (DIGITS * cellW + (DIGITS - 1) * gap)) / 2;
  const top = 150;
  ctx.font = `700 150px ${MONO}`;
  for (let i = 0; i < DIGITS; i++) {
    const x = left + i * (cellW + gap);
    ctx.fillStyle = '#17191c';
    ctx.beginPath();
    ctx.roundRect(x, top, cellW, cellH, 12);
    ctx.fill();
    ctx.fillStyle = '#f4f1e6';
    ctx.fillText(String(digits[i]), x + cellW / 2, top + cellH / 2 + 8);
    ctx.fillStyle = '#0a0b0d';
    ctx.fillRect(x, top + cellH / 2 - 2, cellW, 4);
  }
}

export function incidentBoard(): IncidentBoard {
  const parts: Part[] = [];
  parts.push([pos(box(0.3, 0.07, 0.3, 0.01), 0, 0.035, 0), CONCRETE]);
  parts.push([grained(pos(box(POST_HALF * 2, HIGH, POST_HALF * 2, 0.006), 0, HIGH / 2, 0), 'y'), POST]);
  parts.push([
    grained(pos(new CylinderGeometry(0, POST_HALF * Math.SQRT2 + 0.002, 0.032, 4).rotateY(Math.PI / 4), 0, HIGH + 0.016, 0), 'y'),
    POST,
  ]);

  const plate = new ExtrudeGeometry(roundedRect(new Shape(), PW, PH, 0.03), {
    depth: 0.008,
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.002,
    bevelOffset: -0.002,
    bevelSegments: 1,
    curveSegments: 5,
  });
  parts.push([plate.translate(0, CENTRE, POST_HALF + 0.002), BACK]);

  const bolts: BufferGeometry[] = [];
  for (const sy of [-1, 1]) {
    bolts.push(pos(box(0.034, 0.034, 0.004, 0.001), 0, CENTRE + sy * 0.2, -POST_HALF - 0.002));
    bolts.push(pos(new CylinderGeometry(0.011, 0.011, 0.01, 6).rotateX(Math.PI / 2), 0, CENTRE + sy * 0.2, -POST_HALF - 0.008));
  }
  parts.push([merge(bolts), ZINC]);

  const face = new PlaneGeometry(PW - 0.03, PH - 0.03, 6, 4).translate(0, CENTRE, POST_HALF + 0.016);

  const digits = [9, 9, 9, 9];
  const map = localizedCanvasTexture(TEX_W, TEX_H, (ctx, w, h) => paint(ctx, w, h, digits));
  const ctx = (map.image as HTMLCanvasElement).getContext('2d')!;

  let rolling = -1;
  let step = 0;
  let tripped = false;

  const trip = (): void => {
    if (tripped) return;
    tripped = true;
    rolling = 0;
    step = 0;
  };

  const tick = (dt: number): void => {
    if (rolling < 0) return;
    rolling += dt;
    const now = Math.min(SETTLES[DIGITS - 1], Math.floor(rolling / STEP));
    if (now === step) return;
    step = now;
    for (let i = 0; i < DIGITS; i++) digits[i] = (9 - Math.min(step, SETTLES[i]) + 40) % 10;
    paint(ctx, TEX_W, TEX_H, digits);
    map.needsUpdate = true;
    sfx.flap();
    if (step >= SETTLES[DIGITS - 1]) rolling = -1;
  };

  return { parts, face, map, trip, tick };
}
