import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

const WIRE = 0.01;
const LINK_HALF_WIDTH = 0.024;
const LINK_HALF_STRAIGHT = 0.021;
const RING_RADIUS = 0.034;
const SIDES = 6;

export const LINK_PITCH = 2 * (LINK_HALF_STRAIGHT + LINK_HALF_WIDTH - WIRE);
export const RING_SPAN = 2 * (RING_RADIUS - WIRE);
export const CHAIN_REST = LINK_HALF_WIDTH * Math.SQRT1_2 + WIRE;

interface Template {
  position: number[];
  normal: number[];
  index: number[];
}

function tube(path: Array<[number, number]>): Template {
  const position: number[] = [];
  const normal: number[] = [];
  const index: number[] = [];
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const [px, py] = path[i];
    const [ax, ay] = path[(i + n - 1) % n];
    const [bx, by] = path[(i + 1) % n];
    const length = Math.hypot(bx - ax, by - ay);
    const ox = (by - ay) / length;
    const oy = -(bx - ax) / length;
    for (let j = 0; j < SIDES; j++) {
      const a = (j / SIDES) * Math.PI * 2;
      const nx = Math.cos(a) * ox;
      const ny = Math.cos(a) * oy;
      const nz = Math.sin(a);
      position.push(px + nx * WIRE, py + ny * WIRE, nz * WIRE);
      normal.push(nx, ny, nz);
      const i1 = (i + 1) % n;
      const j1 = (j + 1) % SIDES;
      index.push(i * SIDES + j, i1 * SIDES + j, i1 * SIDES + j1, i * SIDES + j, i1 * SIDES + j1, i * SIDES + j1);
    }
  }
  return { position, normal, index };
}

function linkPath(): Array<[number, number]> {
  const path: Array<[number, number]> = [];
  for (const end of [1, -1]) {
    for (let k = 0; k <= 5; k++) {
      const a = (k / 5) * Math.PI + (end > 0 ? 0 : Math.PI);
      path.push([Math.cos(a) * LINK_HALF_WIDTH, end * LINK_HALF_STRAIGHT + Math.sin(a) * LINK_HALF_WIDTH]);
    }
  }
  return path;
}

function ringPath(): Array<[number, number]> {
  const path: Array<[number, number]> = [];
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    path.push([Math.cos(a) * RING_RADIUS, Math.sin(a) * RING_RADIUS]);
  }
  return path;
}

export interface Chain {
  geometry: BufferGeometry;
  joints: number;
  lay(
    joints: Vector3[],
    count: number,
    stow: Vector3,
    target: BufferGeometry,
    shown: (y: number, z: number) => number,
    unlit: number,
  ): void;
}

const UP = new Vector3(0, 1, 0);

export function makeChain(links: number): Chain {
  const ring = tube(ringPath());
  const link = tube(linkPath());
  const ringVerts = ring.position.length / 3;
  const linkVerts = link.position.length / 3;
  const total = ringVerts + links * linkVerts;

  const base = new Float32Array(total * 3);
  const baseNormal = new Float32Array(total * 3);
  const index: number[] = [...ring.index];
  base.set(ring.position, 0);
  baseNormal.set(ring.normal, 0);
  for (let k = 0; k < links; k++) {
    const first = ringVerts + k * linkVerts;
    base.set(link.position, first * 3);
    baseNormal.set(link.normal, first * 3);
    for (const i of link.index) index.push(i + first);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(total * 3), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(total * 3), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(total * 2), 2));
  geometry.setIndex(index);

  const axis = new Vector3();
  const lift = new Vector3();
  const side = new Vector3();
  const across = new Vector3();
  const out = new Vector3();
  const centre = new Vector3();

  const lay: Chain['lay'] = (joints, count, stow, target, shown, unlit) => {
    const position = target.attributes.position.array as Float32Array;
    const normal = target.attributes.normal.array as Float32Array;
    const tint = target.attributes.aTint;
    lift.copy(UP);

    for (let e = 0; e <= links; e++) {
      const first = e === 0 ? 0 : ringVerts + (e - 1) * linkVerts;
      const verts = e === 0 ? ringVerts : linkVerts;
      if (e + 1 >= count) {
        for (let v = first; v < first + verts; v++) {
          position[v * 3] = stow.x;
          position[v * 3 + 1] = stow.y;
          position[v * 3 + 2] = stow.z;
        }
        continue;
      }

      const a = joints[e];
      const b = joints[e + 1];
      axis.subVectors(b, a).normalize();
      if (e === 0) centre.copy(a).addScaledVector(axis, RING_RADIUS);
      else centre.addVectors(a, b).multiplyScalar(0.5);

      // Carried from the previous link when this one points straight up, where "up" stops meaning anything.
      const along = UP.dot(axis);
      if (Math.abs(along) < 0.98) lift.copy(UP).addScaledVector(axis, -along).normalize();
      else lift.addScaledVector(axis, -lift.dot(axis)).normalize();
      side.crossVectors(axis, lift);

      const roll = e === 0 ? 0 : e * (Math.PI / 2) + (Math.PI / 4) * Math.min(1, e / 3);
      across.copy(side).multiplyScalar(Math.cos(roll)).addScaledVector(lift, Math.sin(roll));
      out.crossVectors(across, axis);

      for (let v = first; v < first + verts; v++) {
        const x = base[v * 3];
        const y = base[v * 3 + 1];
        const z = base[v * 3 + 2];
        position[v * 3] = centre.x + across.x * x + axis.x * y + out.x * z;
        position[v * 3 + 1] = centre.y + across.y * x + axis.y * y + out.y * z;
        position[v * 3 + 2] = centre.z + across.z * x + axis.z * y + out.z * z;
        const nx = baseNormal[v * 3];
        const ny = baseNormal[v * 3 + 1];
        const nz = baseNormal[v * 3 + 2];
        normal[v * 3] = across.x * nx + axis.x * ny + out.x * nz;
        normal[v * 3 + 1] = across.y * nx + axis.y * ny + out.y * nz;
        normal[v * 3 + 2] = across.z * nx + axis.z * ny + out.z * nz;
      }
    }
    if (tint) {
      const rgba = tint.array as Float32Array;
      for (let v = 0; v < total; v++) {
        const lit = shown(position[v * 3 + 1], position[v * 3 + 2]);
        rgba[v * 4] = rgba[v * 4 + 1] = rgba[v * 4 + 2] = lit;
        rgba[v * 4 + 3] = unlit + (1 - unlit) * lit;
      }
      tint.needsUpdate = true;
    }
    target.attributes.position.needsUpdate = true;
    target.attributes.normal.needsUpdate = true;
  };

  return { geometry, joints: links + 2, lay };
}

export function walk(line: Float32Array, points: number, first: number, pitch: number, joints: Vector3[]): number {
  joints[0].set(line[0], line[1], line[2]);
  let seg = 0;
  for (let j = 1; j < joints.length; j++) {
    const from = joints[j - 1];
    const reach = j === 1 ? first : pitch;
    let placed = false;
    while (seg < points - 1) {
      const ax = line[seg * 3] - from.x;
      const ay = line[seg * 3 + 1] - from.y;
      const az = line[seg * 3 + 2] - from.z;
      const bx = line[seg * 3 + 3] - from.x;
      const by = line[seg * 3 + 4] - from.y;
      const bz = line[seg * 3 + 5] - from.z;
      if (bx * bx + by * by + bz * bz < reach * reach) {
        seg++;
        continue;
      }
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const qa = dx * dx + dy * dy + dz * dz;
      const qb = 2 * (ax * dx + ay * dy + az * dz);
      const qc = ax * ax + ay * ay + az * az - reach * reach;
      const t = (-qb + Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc))) / (2 * qa);
      joints[j].set(from.x + ax + dx * t, from.y + ay + dy * t, from.z + az + dz * t);
      placed = true;
      break;
    }
    if (!placed) return j;
  }
  return joints.length;
}
