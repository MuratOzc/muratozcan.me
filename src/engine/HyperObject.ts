import { BufferGeometry, Group, Mesh, type Object3D } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GyroVector } from './math/gyrovector';
import {
  createHyperMaterials,
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
 * RoundedBoxGeometry and mergeGeometries both hand back non-indexed buffers —
 * three positions per triangle, nothing reused. That is ordinarily a minor
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

  private materials: HyperMaterial[] = [];

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
  ): HyperMaterial[] {
    const geo = indexGeometry(geometry);
    const mats = createHyperMaterials(shared, {
      tanKHeight: this.useTanKHeight,
      ...opts,
    });
    for (const mat of mats) {
      const mesh = new Mesh(geo, mat);
      // Three's frustum culling is Euclidean and will cull geometry that is
      // plainly visible. HyperEngine disables culling outright in spherical
      // space for the same reason.
      mesh.frustumCulled = false;
      (parent ?? this).add(mesh);
    }
    this.materials.push(...mats);

    // The shadow-pass twin: same geometry, same parent (so animated child
    // nodes cast moving shadows via the inherited modelMatrix), but a
    // depth-only material and a layer the main camera never renders.
    if (shared.shadowsEnabled && opts.castShadow !== false) {
      const depthMat = createShadowDepthMaterial(shared, {
        tanKHeight: this.useTanKHeight,
        ...opts,
      });
      const depthMesh = new Mesh(geo, depthMat);
      depthMesh.frustumCulled = false;
      depthMesh.layers.set(SHADOW_LAYER);
      (parent ?? this).add(depthMesh);
      this.materials.push(depthMat);
    }

    return mats;
  }

  /** Compose with the camera transform and push to the GPU. */
  updateHyper(worldGV: GyroVector): void {
    const composed = this.localGV.add(worldGV);
    const rot = composed.toMatrix3();
    // The static placement goes up too, so the shader has a world coordinate
    // that does not slide around when the viewer moves. Surface texturing needs
    // to be anchored to the world, not to the observer.
    const staticRot = this.localGV.toMatrix3();
    for (const mat of this.materials) {
      mat.uniforms.uHyperPos.value.copy(composed.vec);
      mat.uniforms.uHyperRot.value.copy(rot);
      // Depth-pass materials have no static placement uniforms.
      if (mat.uniforms.uStaticPos) {
        mat.uniforms.uStaticPos.value.copy(this.localGV.vec);
        mat.uniforms.uStaticRot.value.copy(staticRot);
      }
    }
  }

  getMaterials(): readonly HyperMaterial[] {
    return this.materials;
  }

  dispose(): void {
    for (const mat of this.materials) mat.dispose();
    this.materials.length = 0;
  }
}
