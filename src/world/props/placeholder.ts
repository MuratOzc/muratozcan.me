import { BoxGeometry } from 'three';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';

/**
 * The stand-in exhibit: a pad and a volume.
 *
 * Sized to roughly what most of the real objects will be, so the sightlines
 * being judged now are the sightlines you get later.
 */
export function buildPlaceholderExhibit(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): HyperObject {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  const pad = new BoxGeometry(3.2, 0.12, 3.2, 3, 1, 3);
  pad.translate(0, 0.06, 0);
  object.addGeometry(world.shared, pad, { color: 0x9a9384, ambient: 0.62 });

  const block = new BoxGeometry(1.5, 1.8, 1.5, 3, 5, 3);
  block.translate(0, 0.12 + 0.9, 0);
  object.addGeometry(world.shared, block, { color: 0xb0a893, ambient: 0.5 });

  world.add(object);
  return object;
}
