import {
  Box3,
  Color,
  Matrix4,
  Mesh,
  SkinnedMesh,
  Vector3,
  type BufferGeometry,
  type Object3D,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HyperObject, type GyroVector, type HyperWorld } from '../engine';

/**
 * Loading downloaded models into curved space.
 *
 * Three things make this less trivial than dropping a GLTF into a scene:
 *
 * 1. **Our shader replaces the world transform entirely.** A model's node
 *    hierarchy has to be flattened — every mesh's world matrix baked into its
 *    vertices — because the curved-space lift happens per vertex from Unit
 *    coordinates, and there is no room in that pipeline for a parent chain.
 *
 * 2. **Skinning is not supported.** A rigged model renders in its bind pose.
 *    That is fine for statues and props; anything that needs to animate would
 *    have to bake the pose or the shader would need skinning added.
 *
 * 3. **Scale is the thing that goes wrong.** Downloaded models arrive in
 *    whatever units their author used. Everything here normalises by measured
 *    bounding box to a height in OUR units, then drops the feet to y = 0, so
 *    placement is predictable regardless of the source.
 */

export interface ModelPart {
  geometry: BufferGeometry;
  map?: Texture;
  color: Color;
}

const loader = new GLTFLoader();

function collect(root: Object3D): ModelPart[] {
  const parts: ModelPart[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    const mesh = node as Mesh | SkinnedMesh;
    if (!(mesh as Mesh).isMesh) return;
    const geometry = mesh.geometry.clone();
    // Bake the node's place in the hierarchy into the vertices.
    geometry.applyMatrix4(mesh.matrixWorld);
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const src = material as { map?: Texture; color?: Color };
    // A GLTF can reference an external texture that fails to load; GLTFLoader
    // still hands back a Texture object, just one with no image. Sampling that
    // returns black, so check for actual image data rather than presence.
    const map = src?.map?.image ? src.map : undefined;
    parts.push({
      geometry,
      map,
      color: src?.color ? src.color.clone() : new Color(0xffffff),
    });
  });
  return parts;
}

export interface LoadedModel {
  parts: ModelPart[];
  /** Height of the source model, in its own units, before normalisation. */
  sourceHeight: number;
}

export async function loadModel(url: string): Promise<LoadedModel> {
  const gltf = await loader.loadAsync(url);
  const parts = collect(gltf.scene);
  if (parts.length === 0) throw new Error(`no meshes in ${url}`);

  // Measure once across every part.
  const box = new Box3();
  for (const p of parts) {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox!);
  }
  const size = new Vector3();
  box.getSize(size);

  return { parts, sourceHeight: size.y };
}

export interface SpawnModelOptions {
  /** Desired height in authored units. A person is 1. */
  height: number;
  yaw?: number;
  /** Override the model's own colours. */
  color?: number;
  ambient?: number;
  /**
   * Horospherical height stretching. Off by default for models: it bends
   * verticals, which is right for buildings that should stand up straight
   * relative to the ground, but distorts a figure's proportions.
   */
  tanKHeight?: boolean;
}

/**
 * Place a loaded model in the world, normalised to `height` authored units
 * with its feet on the ground.
 */
export function spawnModel(
  world: HyperWorld,
  at: GyroVector,
  model: LoadedModel,
  opts: SpawnModelOptions,
): HyperObject {
  const object = new HyperObject(at, opts.tanKHeight ?? false);
  object.rotation.y = opts.yaw ?? 0;

  // Re-measure so the transform below is derived from the same box every time.
  const box = new Box3();
  for (const p of model.parts) {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox!);
  }
  const size = new Vector3();
  const centre = new Vector3();
  box.getSize(size);
  box.getCenter(centre);

  const scale = opts.height / (size.y || 1);
  const transform = new Matrix4()
    .makeScale(scale, scale, scale)
    // Centre horizontally and stand the feet at y = 0.
    .multiply(new Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z));

  for (const part of model.parts) {
    const geometry = part.geometry.clone();
    geometry.applyMatrix4(transform);
    object.addGeometry(world.shared, geometry, {
      map: part.map,
      color: opts.color ?? part.color,
      ambient: opts.ambient ?? 0.55,
      alphaTest: 0.25,
    });
  }

  world.add(object);
  return object;
}
