import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  NearestFilter,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Texture,
} from 'three';
import type { Point } from '../geometry';

export const v3 = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);

export function fillet(points: Vector3[], radius: number, steps = 4): Vector3[] {
  const out: Vector3[] = [points[0].clone()];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const before = p.distanceTo(points[i - 1]);
    const after = p.distanceTo(points[i + 1]);
    const cut = Math.min(radius, before * 0.5, after * 0.5);
    const from = p.clone().lerp(points[i - 1], cut / before);
    const to = p.clone().lerp(points[i + 1], cut / after);
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      out.push(
        from
          .clone()
          .multiplyScalar((1 - u) * (1 - u))
          .addScaledVector(p, 2 * u * (1 - u))
          .addScaledVector(to, u * u),
      );
    }
  }
  out.push(points[points.length - 1].clone());
  return out;
}

export function sweep(points: Vector3[], r: number, sides = 6, closed = false): BufferGeometry {
  const n = points.length;
  const tangent = (i: number): Vector3 => {
    const a = closed ? points[(i - 1 + n) % n] : points[Math.max(i - 1, 0)];
    const b = closed ? points[(i + 1) % n] : points[Math.min(i + 1, n - 1)];
    return b.clone().sub(a).normalize();
  };

  let along = tangent(0);
  const seed = Math.abs(along.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
  const normal = new Vector3().crossVectors(along, seed).normalize();
  const turn = new Quaternion();
  const position = new Float32Array(n * sides * 3);

  for (let i = 0; i < n; i++) {
    const t = tangent(i);
    normal.applyQuaternion(turn.setFromUnitVectors(along, t)).normalize();
    along = t;
    const binormal = new Vector3().crossVectors(t, normal);
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const c = Math.cos(a) * r;
      const d = Math.sin(a) * r;
      position.set(
        [
          points[i].x + c * normal.x + d * binormal.x,
          points[i].y + c * normal.y + d * binormal.y,
          points[i].z + c * normal.z + d * binormal.z,
        ],
        (i * sides + s) * 3,
      );
    }
  }

  const index: number[] = [];
  const rings = closed ? n : n - 1;
  for (let i = 0; i < rings; i++) {
    const next = (i + 1) % n;
    for (let s = 0; s < sides; s++) {
      const a = i * sides + s;
      const b = i * sides + ((s + 1) % sides);
      const c = next * sides + s;
      const d = next * sides + ((s + 1) % sides);
      index.push(a, b, c, b, d, c);
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(position, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export function paver(outline: Point[], top: number, chamfer = 0, skirt = 0): BufferGeometry {
  const n = outline.length;
  let cx = 0;
  let cz = 0;
  for (const [x, z] of outline) {
    cx += x / n;
    cz += z / n;
  }
  const normals = outline.map(([x, z], i) => {
    const [x1, z1] = outline[(i + 1) % n];
    let nx = z1 - z;
    let nz = x - x1;
    const length = Math.hypot(nx, nz);
    nx /= length;
    nz /= length;
    const outward = ((x + x1) / 2 - cx) * nx + ((z + z1) / 2 - cz) * nz > 0;
    return outward ? [nx, nz] : [-nx, -nz];
  });
  const inner = outline.map(([x, z], i) => {
    const a = normals[(i - 1 + n) % n];
    const b = normals[i];
    const k = chamfer / (1 + a[0] * b[0] + a[1] * b[1]);
    return [x - (a[0] + b[0]) * k, z - (a[1] + b[1]) * k];
  });

  const position: number[] = [];
  const face = (a: number[], b: number[], c: number[], want: number[]): void => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const wx = c[0] - a[0];
    const wy = c[1] - a[1];
    const wz = c[2] - a[2];
    const facing =
      (uy * wz - uz * wy) * want[0] + (uz * wx - ux * wz) * want[1] + (ux * wy - uy * wx) * want[2];
    if (facing >= 0) position.push(...a, ...b, ...c);
    else position.push(...a, ...c, ...b);
  };

  const low = top - chamfer;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const out = [normals[i][0], 0.5, normals[i][1]];
    const a = [inner[i][0], top, inner[i][1]];
    const b = [inner[j][0], top, inner[j][1]];
    const c = [outline[i][0], low, outline[i][1]];
    const d = [outline[j][0], low, outline[j][1]];
    face([cx, top, cz], a, b, [0, 1, 0]);
    if (chamfer > 0) {
      face(a, b, c, out);
      face(b, d, c, out);
    }
    if (skirt > 0) {
      const e = [outline[i][0], low - skirt, outline[i][1]];
      const f = [outline[j][0], low - skirt, outline[j][1]];
      face(c, d, e, out);
      face(d, f, e, out);
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  g.computeVertexNormals();
  return g;
}

export type Region = [left: number, top: number, width: number, height: number];

export const ATLAS: Point = [1024, 512];

export function decal(w: number, h: number, region: Region): PlaneGeometry {
  const g = new PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      (region[0] + uv.getX(i) * region[2]) / ATLAS[0],
      1 - (region[1] + (1 - uv.getY(i)) * region[3]) / ATLAS[1],
    );
  }
  return g;
}

export type Lamp =
  | { kind: 'steady'; colour: string }
  | { kind: 'beat'; on: string; off: string; period: number; seed: number }
  | { kind: 'breathe'; rgb: [number, number, number]; period: number }
  | { kind: 'flicker'; on: string; off: string; rate: number; seed: number; busy: number };

export const GREEN = { on: '#9dff86', off: '#234d25' };
export const AMBER = { on: '#ffc655', off: '#4d3913' };
export const BLUE = { on: '#7fd2ff', off: '#1b3b52' };

const CELL = 4;
const COLUMNS = 16;
const ROWS = 4;

export class Lamps {
  readonly texture: Texture;
  readonly quads: BufferGeometry[] = [];
  private readonly lamps: Lamp[] = [];
  private readonly ctx: CanvasRenderingContext2D;

  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = COLUMNS * CELL;
    canvas.height = ROWS * CELL;
    this.ctx = canvas.getContext('2d')!;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    this.texture = texture;
  }

  add(quad: BufferGeometry, lamp: Lamp): void {
    const slot = this.lamps.length;
    if (slot >= COLUMNS * ROWS) throw new Error('trolley: lamp atlas is full');
    const u = ((slot % COLUMNS) + 0.5) / COLUMNS;
    const v = 1 - (Math.floor(slot / COLUMNS) + 0.5) / ROWS;
    const uv = quad.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
    this.lamps.push(lamp);
    this.quads.push(quad);
  }

  repaint(t: number): void {
    this.lamps.forEach((lamp, slot) => {
      let colour: string;
      if (lamp.kind === 'steady') {
        colour = lamp.colour;
      } else if (lamp.kind === 'beat') {
        colour = (t / lamp.period + lamp.seed) % 1 < 0.5 ? lamp.on : lamp.off;
      } else if (lamp.kind === 'breathe') {
        const k = 0.3 + 0.7 * (0.5 - 0.5 * Math.cos((t / lamp.period) * Math.PI * 2));
        colour = `rgb(${lamp.rgb.map((c) => Math.round(c * k)).join(',')})`;
      } else {
        const a = Math.sin(t * lamp.rate + lamp.seed * 3.1);
        const b = Math.sin(t * lamp.rate * 1.57 + lamp.seed * 1.7);
        colour = (a + b) * 0.5 > 1 - 2 * lamp.busy ? lamp.on : lamp.off;
      }
      this.ctx.fillStyle = colour;
      this.ctx.fillRect((slot % COLUMNS) * CELL, Math.floor(slot / COLUMNS) * CELL, CELL, CELL);
    });
    this.texture.needsUpdate = true;
  }
}
