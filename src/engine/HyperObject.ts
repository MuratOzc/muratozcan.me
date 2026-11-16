import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  Quaternion,
  Vector3,
  type Object3D,
} from 'three';
import { HM } from './math/curvature';
import { unitToPoincare } from './math/coords';
import { GyroVector } from './math/gyrovector';
import { mobiusAdd } from './math/mobius';
import { crevices } from './crevices';
import {
  createHyperMaterials,
  createObjectUniforms,
  createShadowDepthMaterial,
  hasSurface,
  type HyperMaterial,
  type HyperMaterialOptions,
  type SharedUniforms,
} from './HyperMaterial';

/**
 * Depth-pass meshes live on this layer: invisible to the main camera, and the
 * only thing the light camera renders.
 */
export const SHADOW_LAYER = 1;

const prepared = new WeakMap<BufferGeometry, BufferGeometry>();

/**
 * Longest triangle edge allowed, in authored units.
 *
 * A triangle is flat in the viewer's chart, and a flat thing in curved space
 * is a chord: it cuts inside the surface it stands for, toward the viewer, by
 * about the square of its length, and by more the further away it is. A sign
 * board drawn as one quad bulges two centimetres at five units, straight
 * through lettering that sits a few millimetres proud of it. At this length
 * the error stays near a millimetre out to the quarter turn.
 */
const MAX_EDGE = 0.3;

const KEPT = ['position', 'normal', 'uv', 'color', 'grain'];

/**
 * Make a geometry fit to draw: indexed, so shared vertices are transformed
 * once, and no edge longer than MAX_EDGE.
 *
 * Vertices are welded only where every attribute agrees to six decimals:
 * geometry at this scale has real detail in the fourth. Each edge gets one
 * midpoint, so an edge shared by two triangles is cut at the same point from
 * both sides and no crack opens.
 */
function prepare(geometry: BufferGeometry): BufferGeometry {
  let g = prepared.get(geometry);
  if (!g) {
    g = refine(geometry);
    prepared.set(geometry, g);
  }
  return g;
}

function refine(geometry: BufferGeometry): BufferGeometry {
  const sources = KEPT.filter((name) => geometry.attributes[name]).map(
    (name) => [name, geometry.attributes[name] as BufferAttribute] as const,
  );
  const stride = sources.reduce((n, [, a]) => n + a.itemSize, 0);
  const count = geometry.attributes.position.count;
  const values = new Float64Array(count * stride);
  let at = 0;
  for (const [, a] of sources) {
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < a.itemSize; c++) values[i * stride + at + c] = a.getComponent(i, c);
    }
    at += a.itemSize;
  }
  const pool: number[] = [];
  let index: ArrayLike<number>;
  if (geometry.index) {
    for (let i = 0; i < values.length; i++) pool.push(values[i]);
    index = geometry.index.array;
  } else {
    const same = (v: number): boolean => {
      for (let k = 0; k < stride; k++) if (Math.round(pool[v * stride + k] * 1e6) !== key[k]) return false;
      return true;
    };
    const first = new Map<number, number>();
    const next: number[] = [];
    const key = new Int32Array(stride);
    const welded: number[] = [];
    for (let i = 0; i < count; i++) {
      let hash = 0;
      for (let k = 0; k < stride; k++) {
        key[k] = Math.round(values[i * stride + k] * 1e6);
        hash = Math.imul(hash ^ key[k], 16777619);
      }
      let v = first.get(hash) ?? -1;
      while (v >= 0 && !same(v)) v = next[v];
      if (v < 0) {
        v = pool.length / stride;
        next.push(first.get(hash) ?? -1);
        first.set(hash, v);
        for (let k = 0; k < stride; k++) pool.push(values[i * stride + k]);
      }
      welded.push(v);
    }
    index = welded;
  }

  const limit = MAX_EDGE * MAX_EDGE;
  const normalAt = geometry.attributes.normal ? 3 : -1;
  const midpoints = new Map<number, number>();
  const out: number[] = [];
  const length2 = (a: number, b: number): number => {
    const p = a * stride;
    const q = b * stride;
    return (pool[p] - pool[q]) ** 2 + (pool[p + 1] - pool[q + 1]) ** 2 + (pool[p + 2] - pool[q + 2]) ** 2;
  };
  const midpoint = (a: number, b: number): number => {
    const key = Math.min(a, b) * 2 ** 26 + Math.max(a, b);
    let m = midpoints.get(key);
    if (m === undefined) {
      m = pool.length / stride;
      midpoints.set(key, m);
      for (let k = 0; k < stride; k++) pool.push((pool[a * stride + k] + pool[b * stride + k]) / 2);
      if (normalAt >= 0) {
        const n = m * stride + normalAt;
        const length = Math.hypot(pool[n], pool[n + 1], pool[n + 2]) || 1;
        for (let k = 0; k < 3; k++) pool[n + k] /= length;
      }
    }
    return m;
  };
  const split = (a: number, b: number, c: number): void => {
    const ab = length2(a, b);
    const bc = length2(b, c);
    const ca = length2(c, a);
    const longest = Math.max(ab, bc, ca);
    if (longest <= limit) {
      out.push(a, b, c);
    } else if (ab === longest) {
      const m = midpoint(a, b);
      split(a, m, c);
      split(m, b, c);
    } else if (bc === longest) {
      const m = midpoint(b, c);
      split(a, b, m);
      split(a, m, c);
    } else {
      const m = midpoint(c, a);
      split(a, b, m);
      split(m, b, c);
    }
  };
  for (let t = 0; t + 2 < index.length; t += 3) split(index[t], index[t + 1], index[t + 2]);
  if (geometry.index && midpoints.size === 0) return geometry;

  const vertices = pool.length / stride;
  const result = new BufferGeometry();
  let offset = 0;
  for (const [name, a] of sources) {
    const size = a.itemSize;
    const array = new Float32Array(vertices * size);
    for (let i = 0; i < vertices; i++) {
      for (let c = 0; c < size; c++) array[i * size + c] = pool[i * stride + offset + c];
    }
    result.setAttribute(name, new BufferAttribute(array, size));
    offset += size;
  }
  result.setIndex(out);
  return result;
}

type Tint = [number, number, number, number];

/**
 * A part that can be slid about inside its batch, by rewriting its own
 * vertices: movement with no node, and so no draw call, of its own.
 */
export class MovingPart {
  private position: BufferAttribute | null = null;
  private rest: Float32Array | null = null;
  private start = 0;

  constructor(readonly shaded: boolean) {}

  bind(position: BufferAttribute, start: number, count: number): void {
    this.position = position;
    this.start = start;
    this.rest = (position.array as Float32Array).slice(start * 3, (start + count) * 3);
  }

  /** Offset from where the part was authored, in the object's own units. Does nothing until the object is in a world. */
  moveTo(x: number, y: number, z: number): void {
    const { position, rest } = this;
    if (!position || !rest) return;
    const array = position.array as Float32Array;
    const from = this.start * 3;
    for (let i = 0; i < rest.length; i += 3) {
      array[from + i] = rest[i] + x;
      array[from + i + 1] = rest[i + 1] + y;
      array[from + i + 2] = rest[i + 2] + z;
    }
    position.addUpdateRange(from, rest.length);
    position.needsUpdate = true;
  }
}

interface Part {
  geometry: BufferGeometry;
  tint: Tint;
  surface: [number, number, number] | null;
  mover?: MovingPart;
}

interface Pending extends Part {
  opts: HyperMaterialOptions;
  parent: Object3D;
  key: string;
}

export interface ViewBall {
  readonly viewDir: Vector3;
  viewNear: number;
  viewFar: number;
  /** 2 when the ball surrounds the viewer and so covers every direction. */
  viewSine: number;
}

export interface Cull {
  sees(ball: ViewBall): boolean;
  castsIntoMap(ball: ViewBall): boolean;
}

interface Batch extends ViewBall {
  bottom: Mesh;
  top: Mesh | null;
  depth: Mesh | null;
  centre: Vector3;
  radius: number;
}

const WHITE: Tint = [1, 1, 1, 1];

function surfaceOf(opts: HyperMaterialOptions): [number, number, number] | null {
  return hasSurface(opts) ? [opts.gloss ?? 0, opts.metal ?? 0, opts.grain ?? 0] : null;
}
const tintColor = new Color();
const textureIds = new WeakMap<object, number>();
let nextTextureId = 1;

// Every HyperMaterialOptions field except color, ambient and the values of gloss, metal and grain has to
// appear here, or parts that differ in it are merged and one of them draws wrong.
function batchKey(parent: Object3D, opts: HyperMaterialOptions): string {
  let map = 0;
  if (opts.map) {
    map = textureIds.get(opts.map) ?? 0;
    if (!map) textureIds.set(opts.map, (map = nextTextureId++));
  }
  return [
    parent.id,
    map,
    opts.alphaBlend ? 1 : 0,
    opts.alphaTest ?? '',
    opts.castShadow === false ? 0 : 1,
    opts.receiveShadow === false ? 0 : 1,
    opts.side ?? '',
    opts.tanKHeight === false ? 0 : 1,
    opts.gridScale ?? 0,
    opts.gridWidth ?? '',
    opts.gridFade ?? '',
    opts.sway ?? 0,
    hasSurface(opts) ? 1 : 0,
    (opts.mottleAmount ?? 0) > 0
      ? `${opts.mottleScale ?? ''}/${opts.mottleAmount}/${opts.mottleHue ?? 0}`
      : '',
  ].join('|');
}

const mergedCache = new Map<string, BufferGeometry[]>();

function shade(geometry: BufferGeometry, tints: BufferAttribute[]): void {
  const position = geometry.attributes.position.array as Float32Array;
  const normal = geometry.attributes.normal.array as Float32Array;
  const index = geometry.index!.array as Uint16Array | Uint32Array;
  const unshaded = geometry.userData.unshaded as Uint8Array | undefined;
  const apply = (open: Float32Array | null): void => {
    if (!open) return;
    const rgba = geometry.attributes.aTint.array as Float32Array;
    for (let v = 0; v < open.length; v++) {
      for (let c = 0; c < 3; c++) rgba[v * 4 + c] *= open[v];
    }
    for (const t of tints) t.needsUpdate = true;
  };
  const job = { position, normal, index, unshaded, apply };
  const w = baker();
  if (w) {
    jobs.set(++lastJob, job);
    w.postMessage({ id: lastJob, position: position.slice(), normal: normal.slice(), index: index.slice(), unshaded });
  } else idle(job);
}

interface Job {
  position: Float32Array;
  normal: Float32Array;
  index: Uint16Array | Uint32Array;
  unshaded?: Uint8Array;
  apply: (open: Float32Array | null) => void;
}

const jobs = new Map<number, Job>();
let lastJob = 0;
let worker: Worker | null | undefined;

function baker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./creviceWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent) => {
      const { id, open } = event.data;
      jobs.get(id)?.apply(open);
      jobs.delete(id);
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      for (const job of jobs.values()) idle(job);
      jobs.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

const bakes: Array<Generator<void>> = [];
let bakeQueued = false;

function idle(job: Job): void {
  bakes.push(
    (function* () {
      job.apply(yield* crevices(job.position, job.normal, job.index, job.unshaded));
    })(),
  );
  queueBakes();
}

function runBakes(deadline?: IdleDeadline): void {
  bakeQueued = false;
  const budget = deadline && !deadline.didTimeout ? Math.min(deadline.timeRemaining(), 8) : 4;
  const began = performance.now();
  while (bakes.length > 0 && performance.now() - began < budget) {
    if (bakes[0].next().done) bakes.shift();
  }
  if (bakes.length > 0) queueBakes();
}

function queueBakes(): void {
  if (bakeQueued) return;
  bakeQueued = true;
  if (typeof requestIdleCallback === 'function') requestIdleCallback(runBakes, { timeout: 100 });
  else setTimeout(runBakes, 32);
}

function copyAttribute(
  source: BufferAttribute | undefined,
  target: Float32Array,
  offset: number,
  count: number,
  itemSize: number,
): void {
  if (!source) return;
  const direct =
    source.array instanceof Float32Array &&
    source.itemSize === itemSize &&
    !(source as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute;
  if (direct) {
    target.set((source.array as Float32Array).subarray(0, count * itemSize), offset * itemSize);
    return;
  }
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < itemSize; c++) {
      target[(offset + i) * itemSize + c] = source.getComponent(i, c);
    }
  }
}

const PIECE_TRIANGLES = 4000;
// Authored units.
const PIECE_SPAN = 0.6;

function triangles(parts: Part[]): number {
  return parts.reduce((n, p) => n + p.geometry.index!.count / 3, 0);
}

function centre(part: Part): Vector3 {
  const g = part.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  return g.boundingBox!.getCenter(new Vector3());
}

function group(parts: Part[]): Part[][] {
  const total = triangles(parts);
  if (total <= PIECE_TRIANGLES || parts.length < 2) return [parts];
  const centres = new Map(parts.map((p) => [p, centre(p)]));
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const c of centres.values()) {
    min.min(c);
    max.max(c);
  }
  const span = max.sub(min);
  const axis = span.x >= span.y && span.x >= span.z ? 'x' : span.y >= span.z ? 'y' : 'z';
  if (span[axis] < PIECE_SPAN) return [parts];
  const sorted = [...parts].sort((a, b) => centres.get(a)![axis] - centres.get(b)![axis]);
  let half = 0;
  for (let n = 0; half < sorted.length - 1 && n < total / 2; half++) n += triangles([sorted[half]]);
  return [...group(sorted.slice(0, half)), ...group(sorted.slice(half))];
}

function slice(merged: BufferGeometry, firstVertex: number, endVertex: number, from: number, to: number): BufferGeometry {
  const piece = new BufferGeometry();
  for (const [name, a] of Object.entries(merged.attributes)) {
    const array = (a.array as Float32Array).subarray(firstVertex * a.itemSize, endVertex * a.itemSize);
    piece.setAttribute(name, new BufferAttribute(array, a.itemSize));
  }
  piece.setIndex(new BufferAttribute(merged.index!.array.slice(from, to).map((i) => i - firstVertex), 1));
  piece.computeBoundingSphere();
  return piece;
}

function mergeParts(parts: Part[], divisible: boolean): BufferGeometry[] {
  const signature = parts
    .map((p) => {
      const version = (p.geometry.attributes.position as BufferAttribute).version;
      return `${p.geometry.id}.${version}:${p.tint.join(',')}:${p.surface?.join(',') ?? ''}`;
    })
    .join(';');
  // A batch with moving parts is rewritten in place, so it is never shared.
  const moves = parts.some((p) => p.mover);
  const cached = moves ? undefined : mergedCache.get(signature + divisible);
  if (cached) return cached;
  // A moving part is found again by its place in the merged buffer, so its batch stays whole.
  const groups = divisible && !moves ? group(parts) : [parts];
  parts = groups.flat();

  let vertexCount = 0;
  let indexCount = 0;
  for (const p of parts) {
    vertexCount += p.geometry.attributes.position.count;
    indexCount += p.geometry.index!.count;
  }

  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);
  const tint = new Float32Array(vertexCount * 4);
  const surfaced = parts[0].surface !== null;
  const surface = surfaced ? new Float32Array(vertexCount * 3) : null;
  const grain = surfaced ? new Float32Array(vertexCount * 3) : null;
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);

  const ranges: Array<[MovingPart, number, number]> = [];
  let v = 0;
  let i = 0;
  for (const part of parts) {
    let g = part.geometry;
    if (!g.attributes.normal) {
      g = g.clone();
      g.computeVertexNormals();
    }
    const count = g.attributes.position.count;
    copyAttribute(g.attributes.position as BufferAttribute, position, v, count, 3);
    copyAttribute(g.attributes.normal as BufferAttribute, normal, v, count, 3);
    copyAttribute(g.attributes.uv as BufferAttribute | undefined, uv, v, count, 2);
    for (let k = 0; k < count; k++) tint.set(part.tint, (v + k) * 4);
    if (surface && grain) {
      for (let k = 0; k < count; k++) surface.set(part.surface!, (v + k) * 3);
      const along = (g.attributes.grain ?? g.attributes.position) as BufferAttribute;
      copyAttribute(along, grain, v, count, 3);
    }
    const shade = g.attributes.color;
    if (shade) {
      for (let k = 0; k < count; k++) {
        for (let c = 0; c < 3; c++) tint[(v + k) * 4 + c] *= shade.getComponent(k, c);
      }
    }

    const src = g.index!;
    for (let k = 0; k < src.count; k++) index[i++] = src.getX(k) + v;
    if (part.mover) ranges.push([part.mover, v, count]);
    v += count;
  }

  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(position, 3));
  merged.setAttribute('normal', new BufferAttribute(normal, 3));
  merged.setAttribute('uv', new BufferAttribute(uv, 2));
  merged.setAttribute('aTint', new BufferAttribute(tint, 4));
  if (surface && grain) {
    merged.setAttribute('aSurface', new BufferAttribute(surface, 3));
    merged.setAttribute('aGrain', new BufferAttribute(grain, 3));
  }
  merged.setIndex(new BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  let pieces = [merged];
  if (groups.length > 1) {
    pieces = [];
    let vertex = 0;
    let corner = 0;
    for (const g of groups) {
      const vertices = g.reduce((n, p) => n + p.geometry.attributes.position.count, 0);
      const corners = triangles(g) * 3;
      pieces.push(slice(merged, vertex, vertex + vertices, corner, corner + corners));
      vertex += vertices;
      corner += corners;
    }
  }
  if (moves) {
    const unshaded = new Uint8Array(vertexCount);
    for (const [mover, start, count] of ranges) {
      mover.bind(merged.attributes.position as BufferAttribute, start, count);
      if (!mover.shaded) unshaded.fill(1, start, start + count);
    }
    merged.userData.unshaded = unshaded;
  } else mergedCache.set(signature + divisible, pieces);
  // Shades the whole batch, so what shades a vertex need not be in its piece; pieces share its buffers.
  shade(merged, pieces.map((p) => p.attributes.aTint as BufferAttribute));
  return pieces;
}

const MOVING_PARTS_PAD = 1.25;

// Must match the BOTTOM_HEMISPHERE discard in hyperCore.ts (w_dot > 2).
const NEAR_PASS_REACH = 2 * Math.atan(Math.SQRT2);

// Render orders are geodesic distances, at most PI, so these sort after all of them.
const BACKDROP_ORDER = 4;
const FAR_PASS_ORDER = 8;

const scratch = new Vector3();

function lifted(mesh: Mesh, point: Vector3): Vector3 {
  const tanK = (mesh.material as HyperMaterial).uniforms.uTanKHeight.value > 0.5;
  return unitToPoincare(point.applyMatrix4(mesh.matrixWorld), tanK, point);
}

function onSphere(p: Vector3, out: number[] | Float32Array, at: number): void {
  const r2 = p.lengthSq();
  const s = 1 / (1 + r2);
  out[at] = 2 * p.x * s;
  out[at + 1] = 2 * p.y * s;
  out[at + 2] = 2 * p.z * s;
  out[at + 3] = (1 - r2) * s;
}

function angularReach(points: Float32Array, from: number, to: number, centre: number[]): number {
  let cosine = 1;
  for (let k = from; k < to; k++) {
    const dot =
      points[k * 4] * centre[0] +
      points[k * 4 + 1] * centre[1] +
      points[k * 4 + 2] * centre[2] +
      points[k * 4 + 3] * centre[3];
    if (dot < cosine) cosine = dot;
  }
  return Math.acos(Math.max(-1, cosine)) + 1e-3;
}

function subtendedSine(distance: number, radius: number): number {
  if (radius >= distance || distance + radius >= Math.PI || radius >= Math.PI / 2) return 2;
  const sine = Math.sin(radius) / Math.sin(distance);
  return sine >= 1 ? 2 : sine;
}

// Blended surfaces have to draw back to front, the opposite of everything else.
function sorted(mesh: Mesh, order: number): number {
  return (mesh.material as HyperMaterial).transparent ? -order : order;
}

/**
 * Anything that lives in curved space.
 *
 * Ported from HyperEngine's HyperObject component. The object's placement is
 * `localGV`; each frame the world composes it with the camera transform and
 * uploads the result to the shader.
 *
 * Child meshes keep ordinary transforms, interpreted as Unit coordinates
 * relative to this object's root — exactly like Unity transforms under a
 * HyperObject. Keep them small: a point far from the root in Unit coordinates
 * gets mapped toward infinity very quickly.
 */
export class HyperObject extends Group implements ViewBall {
  localGV: GyroVector;
  useTanKHeight: boolean;
  backdrop = false;

  readonly viewDir = new Vector3();
  viewNear = 0;
  viewFar = Math.PI;
  /** 2 when the bounding ball surrounds the viewer and so covers every direction. */
  viewSine = 2;
  inView = true;

  private shared: SharedUniforms | null = null;
  private placement = createObjectUniforms();
  private materials: HyperMaterial[] = [];
  private pending: Pending[] = [];
  private batches: Batch[] = [];
  private bottom: Mesh[] = [];
  private top: Mesh[] = [];
  private depth: Mesh[] = [];
  private hasMovingParts = false;
  private boundsStale = false;
  private sway = 0;

  private boundCenter = new Vector3();
  private boundRadius = Math.PI;

  private composed = new GyroVector();
  private posed = false;
  private posePosition = new Vector3();
  private poseQuaternion = new Quaternion();
  private poseScale = new Vector3();
  private placementStale = true;
  private staticVec = new Vector3(NaN, NaN, NaN);
  private staticGyr = new Quaternion(NaN, NaN, NaN, NaN);
  /** null when the meshes of that pass are not all set the same way. */
  private showBottom: boolean | null = true;
  private showTop: boolean | null = true;
  private showDepth: boolean | null = true;

  constructor(localGV = new GyroVector(), useTanKHeight = true) {
    super();
    this.localGV = localGV;
    this.useTanKHeight = useTanKHeight;
  }

  /**
   * Attach geometry. In a spherical world this creates two meshes sharing one
   * BufferGeometry — one per hemisphere pass. That doubling is not optional;
   * see hyperCore.ts.
   */
  /**
   * @param parent Attach under a child node instead of the root. The shader
   *   reads `modelMatrix`, which is the full world matrix, so a nested node's
   *   own rotation flows through automatically — that is how a part can move
   *   independently of the object it belongs to.
   */
  addGeometry(
    shared: SharedUniforms,
    geometry: BufferGeometry,
    opts: HyperMaterialOptions = {},
    parent?: Object3D,
  ): void {
    this.shared = shared;
    const full = { tanKHeight: this.useTanKHeight, ...opts };
    const node = parent ?? this;
    tintColor.set(full.color ?? 0xffffff);
    this.pending.push({
      surface: surfaceOf(full),
      // Welded now, not at flush: a caller may go on to move this geometry
      // and add it again, and each call has to keep the shape it was given.
      geometry: prepare(geometry),
      tint: [tintColor.r, tintColor.g, tintColor.b, full.ambient ?? 0.55],
      opts: full,
      parent: node,
      key: batchKey(node, full),
    });
  }

  /**
   * Like addGeometry, for a part that will be slid about afterwards. Pass
   * `shaded: false` for parts that are hidden at rest: crevice shading is
   * worked out once, where the part was authored.
   */
  addMovingGeometry(
    shared: SharedUniforms,
    geometry: BufferGeometry,
    opts: HyperMaterialOptions = {},
    parent?: Object3D,
    shaded = true,
  ): MovingPart {
    this.addGeometry(shared, geometry, opts, parent);
    const mover = new MovingPart(shaded);
    this.pending[this.pending.length - 1].mover = mover;
    return mover;
  }

  addLiveGeometry(
    shared: SharedUniforms,
    geometry: BufferGeometry,
    opts: HyperMaterialOptions = {},
    parent?: Object3D,
  ): HyperMaterial[] {
    this.shared = shared;
    const full = { tanKHeight: this.useTanKHeight, ...opts };
    this.boundsStale = true;
    const part = { geometry: prepare(geometry), tint: WHITE, surface: surfaceOf(full) };
    // Callers rewrite a live geometry's buffers through its mesh, so it has to stay one mesh.
    return this.build([part], full, parent ?? this, false);
  }

  private build(parts: Part[], opts: HyperMaterialOptions, parent: Object3D, divisible = true): HyperMaterial[] {
    const shared = this.shared!;
    // Blended paint draws in the order it was added, which pieces drawn apart would not keep.
    const pieces = mergeParts(parts, divisible && !(opts.map && opts.alphaBlend));
    if (parent !== this) this.hasMovingParts = true;
    this.sway = Math.max(this.sway, opts.sway ?? 0);

    const mats = createHyperMaterials(shared, this.placement, opts);
    this.materials.push(...mats);
    // The shadow-pass twin: same geometry, same parent (so animated child
    // nodes cast moving shadows via the inherited modelMatrix), but a
    // depth-only material and a layer the main camera never renders.
    const depthMat =
      shared.shadowsEnabled && opts.castShadow !== false
        ? createShadowDepthMaterial(shared, this.placement, opts)
        : null;
    if (depthMat) this.materials.push(depthMat);

    const mesh = (geometry: BufferGeometry, mat: HyperMaterial): Mesh => {
      const m = new Mesh(geometry, mat);
      // Three's frustum culling is Euclidean and will cull geometry that is
      // plainly visible. HyperEngine disables culling outright in spherical
      // space for the same reason.
      m.frustumCulled = false;
      m.matrixAutoUpdate = false;
      parent.add(m);
      return m;
    };
    for (const geometry of pieces) {
      const bottom = mesh(geometry, mats[0]);
      const top = mats[1] ? mesh(geometry, mats[1]) : null;
      const depth = depthMat ? mesh(geometry, depthMat) : null;
      this.bottom.push(bottom);
      if (top) this.top.push(top);
      if (depth) {
        depth.layers.set(SHADOW_LAYER);
        this.depth.push(depth);
      }
      this.batches.push({
        bottom,
        top,
        depth,
        centre: geometry.boundingSphere!.center,
        radius: Math.PI,
        viewDir: new Vector3(),
        viewNear: 0,
        viewFar: Math.PI,
        viewSine: 2,
      });
    }

    this.showBottom = this.showTop = this.showDepth = true;
    return mats;
  }

  flush(): void {
    if (this.pending.length > 0) {
      const batches = new Map<string, Pending[]>();
      for (const part of this.pending) {
        const batch = batches.get(part.key);
        if (batch) batch.push(part);
        else batches.set(part.key, [part]);
      }
      this.pending.length = 0;
      for (const batch of batches.values()) {
        // White and 1: the tint attribute carries colour and ambient, and the
        // shader multiplies the two together.
        this.build(batch, { ...batch[0].opts, color: 0xffffff, ambient: 1 }, batch[0].parent);
      }
      this.boundsStale = true;
    }
    if (this.boundsStale) {
      this.boundsStale = false;
      this.measure();
    }
  }

  private measure(): void {
    if (HM.K <= 0) return;
    this.updateMatrixWorld(true);

    let total = 0;
    for (const mesh of this.bottom) total += mesh.geometry.attributes.position.count;
    if (total === 0) return;

    const points = new Float32Array(total * 4);
    const min = [Infinity, Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity, -Infinity];
    // The vertex shader moves swaying geometry after these bounds are taken.
    const slack = 2 * this.sway * HM.unitScale;
    const pad = (radius: number) =>
      (this.hasMovingParts ? radius * MOVING_PARTS_PAD + 0.01 : radius) + slack;
    const centre = [0, 0, 0, 0];
    let n = 0;
    for (const batch of this.batches) {
      const mesh = batch.bottom;
      const position = mesh.geometry.attributes.position;
      const first = n;
      for (let i = 0; i < position.count; i++) {
        onSphere(lifted(mesh, scratch.fromBufferAttribute(position, i)), points, n * 4);
        for (let c = 0; c < 4; c++) {
          const v = points[n * 4 + c];
          if (v < min[c]) min[c] = v;
          if (v > max[c]) max[c] = v;
        }
        n++;
      }
      onSphere(lifted(mesh, scratch.copy(batch.centre)), centre, 0);
      batch.radius = pad(angularReach(points, first, n, centre));
    }

    for (let c = 0; c < 4; c++) centre[c] = (min[c] + max[c]) / 2;
    const length = Math.hypot(...centre) || 1;
    for (let c = 0; c < 4; c++) centre[c] /= length;

    this.boundCenter.set(centre[0], centre[1], centre[2]).divideScalar(1 + centre[3]);
    this.boundRadius = pad(angularReach(points, 0, n, centre));
  }

  place(worldGV: GyroVector): void {
    if (this.pending.length > 0 || this.boundsStale) this.flush();
    this.localGV.composeInto(worldGV, this.composed);
    this.placementStale = true;

    if (HM.K <= 0) {
      this.viewNear = 0;
      this.viewFar = Math.PI;
      this.viewSine = 2;
      return;
    }

    mobiusAdd(this.composed.vec, this.boundCenter, scratch).applyQuaternion(this.composed.gyr);
    const r = scratch.length();
    const distance = 2 * Math.atan(r);
    const radius = this.boundRadius;
    this.viewNear = distance - radius;
    this.viewFar = distance + radius;
    if (r > 1e-9) this.viewDir.copy(scratch).divideScalar(r);

    this.viewSine = subtendedSine(distance, radius);
  }

  syncMatrices(): void {
    if (
      this.posed &&
      !this.hasMovingParts &&
      this.posePosition.equals(this.position) &&
      this.poseQuaternion.equals(this.quaternion) &&
      this.poseScale.equals(this.scale)
    ) {
      return;
    }
    this.posed = true;
    this.posePosition.copy(this.position);
    this.poseQuaternion.copy(this.quaternion);
    this.poseScale.copy(this.scale);
    this.updateMatrixWorld();
  }

  /** With `cull`, each batch is tested on its own; without, they all follow the object. */
  show(inFrustum: boolean, castsShadow: boolean, cull?: Cull): void {
    let bottom = inFrustum && this.viewNear < NEAR_PASS_REACH;
    let top = inFrustum && this.viewFar > NEAR_PASS_REACH;
    castsShadow &&= this.depth.length > 0;

    if (cull && this.batches.length > 1 && (inFrustum || castsShadow)) {
      let casts = false;
      bottom = top = false;
      for (const batch of this.batches) {
        const p = lifted(batch.bottom, scratch.copy(batch.centre));
        mobiusAdd(this.composed.vec, p, p).applyQuaternion(this.composed.gyr);
        const r = p.length();
        const distance = 2 * Math.atan(r);
        batch.viewNear = distance - batch.radius;
        batch.viewFar = distance + batch.radius;
        if (r > 1e-9) batch.viewDir.copy(p).divideScalar(r);
        batch.viewSine = subtendedSine(distance, batch.radius);

        const seen = inFrustum && cull.sees(batch);
        batch.bottom.visible = seen && batch.viewNear < NEAR_PASS_REACH;
        bottom ||= batch.bottom.visible;
        if (batch.top) {
          batch.top.visible = seen && batch.viewFar > NEAR_PASS_REACH;
          top ||= batch.top.visible;
        }
        if (batch.depth) {
          // Whether the object's shadow can fall in view is decided for the whole object: the test assumes it stands on the ground.
          batch.depth.visible = castsShadow && cull.castsIntoMap(batch);
          casts ||= batch.depth.visible;
        }
      }
      castsShadow = casts;
      this.showBottom = this.showTop = this.showDepth = null;
    } else {
      if (bottom !== this.showBottom) {
        this.showBottom = bottom;
        for (const mesh of this.bottom) mesh.visible = bottom;
      }
      if (top !== this.showTop) {
        this.showTop = top;
        for (const mesh of this.top) mesh.visible = top;
      }
      if (castsShadow !== this.showDepth) {
        this.showDepth = castsShadow;
        for (const mesh of this.depth) mesh.visible = castsShadow;
      }
    }

    this.visible = bottom || top || castsShadow;
    if (!this.visible) return;

    if (bottom || top) {
      const order = this.backdrop ? BACKDROP_ORDER : Math.max(0, this.viewNear);
      if (bottom) for (const mesh of this.bottom) mesh.renderOrder = sorted(mesh, order);
      if (top) for (const mesh of this.top) mesh.renderOrder = sorted(mesh, FAR_PASS_ORDER + order);
    }

    if (this.placementStale) {
      this.placementStale = false;
      const { uHyperPos, uHyperRot, uStaticPos, uStaticRot } = this.placement;
      uHyperPos.value.copy(this.composed.vec);
      this.composed.toMatrix3(uHyperRot.value);
      // The static placement goes up too, so the shader has a world coordinate
      // that does not slide around when the viewer moves. Surface texturing
      // needs to be anchored to the world, not to the observer.
      if (!this.staticVec.equals(this.localGV.vec) || !this.staticGyr.equals(this.localGV.gyr)) {
        this.staticVec.copy(this.localGV.vec);
        this.staticGyr.copy(this.localGV.gyr);
        uStaticPos.value.copy(this.localGV.vec);
        this.localGV.toMatrix3(uStaticRot.value);
      }
    }
  }

  showAll(): void {
    this.show(true, true);
    this.showBottom = this.showTop = this.showDepth = this.visible = true;
    for (const mesh of this.bottom) mesh.visible = true;
    for (const mesh of this.top) mesh.visible = true;
    for (const mesh of this.depth) mesh.visible = true;
  }

  getMaterials(): readonly HyperMaterial[] {
    return this.materials;
  }

  dispose(): void {
    for (const mat of this.materials) mat.dispose();
    this.materials.length = 0;
  }
}
