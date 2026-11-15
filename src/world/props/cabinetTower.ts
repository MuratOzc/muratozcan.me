import {
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Quaternion,
  Vector3,
  Vector4,
} from 'three';
import { GyroVector } from '../../engine';
import { units } from '../placement';

export function poleHeight(): number {
  return Math.PI / 2 / units(1);
}

const TAN_EIGHTH = Math.tan(Math.PI / 8);
const AXES = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];

function onSphere(p: Vector3): Vector4 {
  const r2 = p.lengthSq();
  const k = 1 / (1 + r2);
  return new Vector4(2 * p.x * k, 2 * p.y * k, 2 * p.z * k, (1 - r2) * k);
}

function fromColumns(c: Vector4[]): Matrix4 {
  return new Matrix4().set(
    c[0].x, c[1].x, c[2].x, c[3].x,
    c[0].y, c[1].y, c[2].y, c[3].y,
    c[0].z, c[1].z, c[2].z, c[3].z,
    c[0].w, c[1].w, c[2].w, c[3].w,
  );
}

/** The placement's local x, y, z and origin directions on the 3-sphere, as columns. */
function frameOf(gv: GyroVector, turn = new Quaternion()): Matrix4 {
  const origin = onSphere(gv.transformPoint(new Vector3()));
  const columns = AXES.map((axis) => {
    const p = axis.clone().multiplyScalar(TAN_EIGHTH).applyQuaternion(turn);
    return onSphere(gv.transformPoint(p)).multiplyScalar(Math.SQRT2).sub(origin);
  });
  return fromColumns([...columns, origin]);
}

function gvFromFrame(frame: Matrix4): GyroVector {
  const e = frame.elements;
  const centre = new Vector3(e[12], e[13], e[14]).divideScalar(1 + e[15]);
  const bare = frameOf(new GyroVector(centre));
  const turn = new Quaternion().setFromRotationMatrix(bare.transpose().multiply(frame));
  return new GyroVector(centre.applyQuaternion(turn.clone().invert()), turn);
}

// Tower space is the cabinet laid straight: x across, z front to back, y along it from the station floor, over the sky pole, to the far ground at twice the pole's height.
export interface Chart {
  gv: GyroVector;
  toLocal: Matrix4;
  tanK: boolean;
}

export interface Charts {
  station: Chart;
  far: Chart;
  pole: Chart;
}

// The shader darkens anything below 0.7 authored units of local height, so the pole chart's origin stands this far off the axis.
const POLE_STANDOFF = 0.12;

export function chartsFor(at: GyroVector, yaw: number): Charts {
  const station = frameOf(at, new Quaternion().setFromAxisAngle(AXES[1], yaw));
  const chart = (basis: Vector4[], tanK: boolean): Chart => {
    const gv = gvFromFrame(station.clone().multiply(fromColumns(basis)));
    return { gv, toLocal: frameOf(gv).transpose().multiply(station), tanK };
  };
  const c = Math.cos(POLE_STANDOFF);
  const s = Math.sin(POLE_STANDOFF);
  return {
    station: { gv: at, toLocal: new Matrix4(), tanK: true },
    far: chart(
      [new Vector4(1, 0, 0, 0), new Vector4(0, 1, 0, 0), new Vector4(0, 0, -1, 0), new Vector4(0, 0, 0, -1)],
      true,
    ),
    pole: chart(
      [new Vector4(0, 0, 1, 0), new Vector4(c, s, 0, 0), new Vector4(0, 0, 0, -1), new Vector4(-s, c, 0, 0)],
      false,
    ),
  };
}

const lifted = new Vector4();

export function place(chart: Chart, x: number, y: number, z: number, out: Vector3): Vector3 {
  const S = units(1);
  const h = y * S;
  lifted.set(x * S, Math.sin(h), z * S, Math.cos(h)).applyMatrix4(chart.toLocal);
  const kx = lifted.x / lifted.w;
  const ky = lifted.y / lifted.w;
  const kz = lifted.z / lifted.w;
  if (chart.tanK) return out.set(kx / S, Math.atan(ky / Math.sqrt(1 + kx * kx + kz * kz)) / S, kz / S);
  return out.set(kx / S, ky / S, kz / S);
}

export function intoChart(g: BufferGeometry, chart: Chart): BufferGeometry {
  const position = g.attributes.position;
  const normal = g.attributes.normal;
  const p = new Vector3();
  const n = new Vector3();
  const a = new Vector3();
  const b = new Vector3();
  const at = new Vector3();
  const da = new Vector3();
  const db = new Vector3();
  const STEP = 1e-3;
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    n.fromBufferAttribute(normal, i);
    a.set(Math.abs(n.x) < 0.9 ? 1 : 0, Math.abs(n.x) < 0.9 ? 0 : 1, 0).cross(n).normalize();
    b.crossVectors(n, a);
    place(chart, p.x, p.y, p.z, at);
    place(chart, p.x + a.x * STEP, p.y + a.y * STEP, p.z + a.z * STEP, da).sub(at);
    place(chart, p.x + b.x * STEP, p.y + b.y * STEP, p.z + b.z * STEP, db).sub(at);
    n.crossVectors(da, db).normalize();
    position.setXYZ(i, at.x, at.y, at.z);
    normal.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

export function widening(reach: number): number {
  return 1 / Math.cos(units(reach));
}

// Has to run before intoChart: the engine splits long edges along straight lines in authored space, which are curves on the cabinet.
export function tessellate(g: BufferGeometry, limit: number, across = 1, along = 1): BufferGeometry {
  const index = g.index;
  const position = g.attributes.position;
  const corners = index ? index.count : position.count;
  const sources = [position, g.attributes.normal, g.attributes.uv, g.attributes.grain ?? position];
  const sizes = [3, 3, 2, 3];
  const STRIDE = 11;
  const read = (i: number): number[] => {
    const v: number[] = [];
    sources.forEach((source, k) => {
      for (let c = 0; c < sizes[k]; c++) v.push(source ? source.getComponent(i, c) : 0);
    });
    return v;
  };
  const mid = (a: number[], b: number[]): number[] => {
    const m = a.map((x, k) => (x + b[k]) / 2);
    const length = Math.hypot(m[3], m[4], m[5]) || 1;
    for (let k = 3; k < 6; k++) m[k] /= length;
    return m;
  };
  const edge = (a: number[], b: number[]) =>
    ((a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2) * across * across + ((a[1] - b[1]) * along) ** 2;
  const most = limit * limit;
  const out: number[] = [];
  const split = (a: number[], b: number[], c: number[]): void => {
    const ab = edge(a, b);
    const bc = edge(b, c);
    const ca = edge(c, a);
    const longest = Math.max(ab, bc, ca);
    if (longest <= most) out.push(...a, ...b, ...c);
    else if (ab === longest) {
      const m = mid(a, b);
      split(a, m, c);
      split(m, b, c);
    } else if (bc === longest) {
      const m = mid(b, c);
      split(a, b, m);
      split(a, m, c);
    } else {
      const m = mid(c, a);
      split(a, b, m);
      split(m, b, c);
    }
  };
  const at = (i: number) => (index ? index.getX(i) : i);
  for (let i = 0; i < corners; i += 3) split(read(at(i)), read(at(i + 1)), read(at(i + 2)));

  const count = out.length / STRIDE;
  const result = new BufferGeometry();
  let offset = 0;
  ['position', 'normal', 'uv', 'grain'].forEach((name, k) => {
    const array = new Float32Array(count * sizes[k]);
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < sizes[k]; c++) array[i * sizes[k] + c] = out[i * STRIDE + offset + c];
    }
    result.setAttribute(name, new BufferAttribute(array, sizes[k]));
    offset += sizes[k];
  });
  return result;
}
