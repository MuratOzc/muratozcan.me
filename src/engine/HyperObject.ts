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
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HM } from './math/curvature';
import { unitToPoincare } from './math/coords';
import { GyroVector } from './math/gyrovector';
import { mobiusAdd } from './math/mobius';
import {
  createHyperMaterials,
  createObjectUniforms,
  createShadowDepthMaterial,
  type HyperMaterial,
  type HyperMaterialOptions,
  type SharedUniforms,
} from './HyperMaterial';

/**
 * Depth-pass meshes live on this layer: invisible to the main camera, and the
 * only thing the light camera renders.
 */
export const SHADOW_LAYER = 1;

const indexed = new WeakMap<BufferGeometry, BufferGeometry>();

/**
 * Index a geometry so shared vertices are transformed once.
 *
 * RoundedBoxGeometry and the extrusions hand back non-indexed buffers — three
 * positions per triangle, nothing reused. That is ordinarily a minor
 * waste; here the vertex shader runs two Möbius additions, a quaternion
 * transform and a tan per vertex, and runs it again for the second hemisphere
 * and again for the shadow pass. Welding is exact (positions, normals and UVs
 * must all match), so this changes nothing on screen: measured bit-identical
 * across a 1280x720 frame, at 4.07x fewer vertices.
 *
 * The tolerance is deliberately far tighter than the 1e-4 default — geometry
 * at this scale has real detail in the fourth decimal.
 */
function indexGeometry(geometry: BufferGeometry): BufferGeometry {
  if (geometry.index) return geometry;
  let g = indexed.get(geometry);
  if (!g) {
    g = mergeVertices(geometry, 1e-6);
    indexed.set(geometry, g);
  }
  return g;
}

type Tint = [number, number, number, number];

interface Part {
  geometry: BufferGeometry;
  tint: Tint;
}

interface Pending extends Part {
  opts: HyperMaterialOptions;
  parent: Object3D;
  key: string;
}

interface Batch {
  bottom: Mesh;
  top: Mesh | null;
  centre: Vector3;
  radius: number;
}

const WHITE: Tint = [1, 1, 1, 1];
const tintColor = new Color();
const textureIds = new WeakMap<object, number>();
let nextTextureId = 1;

// Every HyperMaterialOptions field except color and ambient has to appear
// here, or parts that differ in it are merged and one of them draws wrong.
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
    (opts.mottleAmount ?? 0) > 0
      ? `${opts.mottleScale ?? ''}/${opts.mottleAmount}/${opts.mottleHue ?? 0}`
      : '',
  ].join('|');
}

const mergedCache = new Map<string, BufferGeometry>();

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

function mergeParts(parts: Part[]): BufferGeometry {
  const signature = parts
    .map((p) => {
      const version = (p.geometry.attributes.position as BufferAttribute).version;
      return `${p.geometry.id}.${version}:${p.tint.join(',')}`;
    })
    .join(';');
  const cached = mergedCache.get(signature);
  if (cached) return cached;

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
  const index = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);

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
    const shade = g.attributes.color;
    if (shade) {
      for (let k = 0; k < count; k++) {
        for (let c = 0; c < 3; c++) tint[(v + k) * 4 + c] *= shade.getComponent(k, c);
      }
    }

    const src = g.index!;
    for (let k = 0; k < src.count; k++) index[i++] = src.getX(k) + v;
    v += count;
  }

  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(position, 3));
  merged.setAttribute('normal', new BufferAttribute(normal, 3));
  merged.setAttribute('uv', new BufferAttribute(uv, 2));
  merged.setAttribute('aTint', new BufferAttribute(tint, 4));
  merged.setIndex(new BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  mergedCache.set(signature, merged);
  return merged;
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
export class HyperObject extends Group {
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
  private showDepth = true;

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
      // Welded now, not at flush: a caller may go on to move this geometry
      // and add it again, and each call has to keep the shape it was given.
      geometry: indexGeometry(geometry),
      tint: [tintColor.r, tintColor.g, tintColor.b, full.ambient ?? 0.55],
      opts: full,
      parent: node,
      key: batchKey(node, full),
    });
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
    return this.build([{ geometry: indexGeometry(geometry), tint: WHITE }], full, parent ?? this);
  }

  private build(parts: Part[], opts: HyperMaterialOptions, parent: Object3D): HyperMaterial[] {
    const shared = this.shared!;
    const geometry = mergeParts(parts);
    if (parent !== this) this.hasMovingParts = true;
    this.sway = Math.max(this.sway, opts.sway ?? 0);

    const mats = createHyperMaterials(shared, this.placement, opts);
    const meshes = mats.map((mat) => {
      const mesh = new Mesh(geometry, mat);
      // Three's frustum culling is Euclidean and will cull geometry that is
      // plainly visible. HyperEngine disables culling outright in spherical
      // space for the same reason.
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      (mat.hemisphere === 'top' ? this.top : this.bottom).push(mesh);
      return mesh;
    });
    this.materials.push(...mats);
    this.batches.push({
      bottom: meshes[0],
      top: meshes[1] ?? null,
      centre: geometry.boundingSphere!.center,
      radius: Math.PI,
    });

    // The shadow-pass twin: same geometry, same parent (so animated child
    // nodes cast moving shadows via the inherited modelMatrix), but a
    // depth-only material and a layer the main camera never renders.
    if (shared.shadowsEnabled && opts.castShadow !== false) {
      const depthMat = createShadowDepthMaterial(shared, this.placement, opts);
      const depthMesh = new Mesh(geometry, depthMat);
      depthMesh.frustumCulled = false;
      depthMesh.matrixAutoUpdate = false;
      depthMesh.layers.set(SHADOW_LAYER);
      parent.add(depthMesh);
      this.depth.push(depthMesh);
      this.materials.push(depthMat);
    }

    this.showBottom = this.showTop = this.showDepth = true;
    return mats;
  }

  private flush(): void {
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

  show(inFrustum: boolean, castsShadow: boolean): void {
    const bottom = inFrustum && this.viewNear < NEAR_PASS_REACH;
    const top = inFrustum && this.viewFar > NEAR_PASS_REACH;
    castsShadow &&= this.depth.length > 0;

    if (bottom && top && this.batches.length > 1) {
      for (const batch of this.batches) {
        const p = lifted(batch.bottom, scratch.copy(batch.centre));
        const distance = 2 * Math.atan(mobiusAdd(this.composed.vec, p, p).length());
        batch.bottom.visible = distance - batch.radius < NEAR_PASS_REACH;
        if (batch.top) batch.top.visible = distance + batch.radius > NEAR_PASS_REACH;
      }
      this.showBottom = this.showTop = null;
    } else {
      if (bottom !== this.showBottom) {
        this.showBottom = bottom;
        for (const mesh of this.bottom) mesh.visible = bottom;
      }
      if (top !== this.showTop) {
        this.showTop = top;
        for (const mesh of this.top) mesh.visible = top;
      }
    }
    if (castsShadow !== this.showDepth) {
      this.showDepth = castsShadow;
      for (const mesh of this.depth) mesh.visible = castsShadow;
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
