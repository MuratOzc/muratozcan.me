import { BufferGeometry, Group, Mesh } from 'three';
import { GyroVector } from './math/gyrovector';
import {
  createHyperMaterials,
  type HyperMaterial,
  type HyperMaterialOptions,
  type SharedUniforms,
} from './HyperMaterial';

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
  addGeometry(
    shared: SharedUniforms,
    geometry: BufferGeometry,
    opts: HyperMaterialOptions = {},
  ): HyperMaterial[] {
    const mats = createHyperMaterials(shared, {
      tanKHeight: this.useTanKHeight,
      ...opts,
    });
    for (const mat of mats) {
      const mesh = new Mesh(geometry, mat);
      // Three's frustum culling is Euclidean and will cull geometry that is
      // plainly visible. HyperEngine disables culling outright in spherical
      // space for the same reason.
      mesh.frustumCulled = false;
      this.add(mesh);
    }
    this.materials.push(...mats);
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
      mat.uniforms.uStaticPos.value.copy(this.localGV.vec);
      mat.uniforms.uStaticRot.value.copy(staticRot);
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
