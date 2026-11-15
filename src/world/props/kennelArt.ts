import type { BufferGeometry, Texture } from 'three';
import { L, t, upper } from '../../content/i18n';
import { localizedCanvasTexture } from '../text';

const ATLAS_W = 2048;
const ATLAS_H = 1024;

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SIGN_FACE: Region = { x: 24, y: 24, w: 1024, h: 752 };
export const GILDING: Region = { x: 1096, y: 24, w: 608, h: 800 };
export const NAME_BOARD: Region = { x: 24, y: 824, w: 900, h: 176 };
export const BOWL_NAME: Region = { x: 960, y: 872, w: 760, h: 128 };

export const DOG_NAME = 'KERBEROS';
const WARNING = L('Beware of the dog', 'Dikkat köpek çıkabilir');

const POSTER = '"Arial Black", "Segoe UI Black", "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

export function intoRegion(geometry: BufferGeometry, region: Region): BufferGeometry {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      (region.x + uv.getX(i) * region.w) / ATLAS_W,
      1 - (region.y + (1 - uv.getY(i)) * region.h) / ATLAS_H,
    );
  }
  return geometry;
}

function wrap(ctx: CanvasRenderingContext2D, words: string[], width: number): string[] | null {
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (ctx.measureText(word).width > width) return null;
    const joined = line ? `${line} ${word}` : word;
    if (ctx.measureText(joined).width <= width) line = joined;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitLine(ctx: CanvasRenderingContext2D, text: string, font: string, width: number, max: number): void {
  for (let size = max; size > 8; size -= 2) {
    ctx.font = font.replace('SIZE', String(size));
    if (ctx.measureText(text).width <= width) return;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paintSign(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Painted past the region so the mip levels do not pull in the transparent border.
  ctx.fillStyle = '#f4c62f';
  ctx.fillRect(-16, -16, w + 32, h + 32);

  const fade = ctx.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, 'rgba(255, 244, 190, 0.35)');
  fade.addColorStop(0.5, 'rgba(255, 244, 190, 0)');
  fade.addColorStop(1, 'rgba(150, 96, 20, 0.22)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, h);

  for (const [x, y, long] of [[w / 2, 58, 150], [w / 2 + 14, 58, 90], [w / 2, h - 52, 46]]) {
    const rust = ctx.createLinearGradient(0, y, 0, y + long);
    rust.addColorStop(0, 'rgba(140, 70, 24, 0.55)');
    rust.addColorStop(1, 'rgba(140, 70, 24, 0)');
    ctx.fillStyle = rust;
    ctx.fillRect(x - 9, y, 18, long);
  }

  ctx.strokeStyle = '#17191c';
  ctx.lineWidth = 20;
  roundRect(ctx, 34, 34, w - 68, h - 68, 44);
  ctx.stroke();

  const top = 92;
  const base = 296;
  const half = 122;
  ctx.fillStyle = '#17191c';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(w / 2, top);
  ctx.lineTo(w / 2 + half, base);
  ctx.lineTo(w / 2 - half, base);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f4c62f';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 17, top + 62);
  ctx.lineTo(w / 2 + 17, top + 62);
  ctx.lineTo(w / 2 + 9, base - 60);
  ctx.lineTo(w / 2 - 9, base - 60);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w / 2, base - 28, 16, 0, Math.PI * 2);
  ctx.fill();

  const box = { x: 92, y: 338, w: w - 184, h: 328 };
  const words = upper(t(WARNING)).split(' ');
  ctx.fillStyle = '#17191c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let size = 170; size >= 30; size -= 2) {
    ctx.font = `900 ${size}px ${POSTER}`;
    const lines = wrap(ctx, words, box.w);
    const lineHeight = size * 1.06;
    if (!lines || lines.length * lineHeight > box.h) continue;
    const first = box.y + box.h / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, w / 2, first + i * lineHeight + size * 0.04));
    break;
  }
}

function paintGilding(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const GOLD = '#e7c463';
  const SHADE = '#3a2c10';
  ctx.lineJoin = 'round';
  for (const [inset, width, radius] of [[26, 9, 40], [50, 3, 22]]) {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = width;
    roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, radius);
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitLine(ctx, '.env', `700 SIZEpx ${SERIF}`, w - 190, 210);
  ctx.fillStyle = SHADE;
  ctx.fillText('.env', w / 2 + 5, 172 + 6);
  ctx.fillStyle = GOLD;
  ctx.fillText('.env', w / 2, 172);

  ctx.fillRect(w / 2 - 150, 272, 300, 4);

  fitLine(ctx, 'chmod 600', '600 SIZEpx ui-monospace, Consolas, monospace', w - 240, 50);
  ctx.fillText('chmod 600', w / 2, h - 96);
}

function paintName(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, font: string, spacing: number): void {
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${spacing}px`;
  fitLine(ctx, DOG_NAME, font, w - 36 - spacing, h - 28);
  ctx.fillText(DOG_NAME, w / 2 + spacing / 2, h / 2 + 4);
}

export function kennelAtlas(): Texture {
  return localizedCanvasTexture(ATLAS_W, ATLAS_H, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const into = (region: Region, paint: () => void): void => {
      ctx.save();
      ctx.translate(region.x, region.y);
      paint();
      ctx.restore();
    };
    into(SIGN_FACE, () => paintSign(ctx, SIGN_FACE.w, SIGN_FACE.h));
    into(GILDING, () => paintGilding(ctx, GILDING.w, GILDING.h));
    into(NAME_BOARD, () => paintName(ctx, NAME_BOARD.w, NAME_BOARD.h, '#f6edd4', `700 SIZEpx ${SERIF}`, 14));
    into(BOWL_NAME, () => paintName(ctx, BOWL_NAME.w, BOWL_NAME.h, '#27375f', `900 SIZEpx ${POSTER}`, 6));
  });
}
