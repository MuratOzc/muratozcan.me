import { BoxGeometry } from 'three';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';
import { units, type Poi } from '../placement';
import { loadModel, spawnModel } from '../model';

/**
 * The figure at your back, and the plinth it stands on.
 *
 * The plinth is synchronous so the spot reads as occupied from the first
 * frame; the figure itself loads a model, so it arrives when it arrives.
 */

export function buildPlinth(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): { object: HyperObject; poi: Poi } {
  const plinthObj = new HyperObject(at);
  plinthObj.rotation.y = yaw;
  const plinth = new BoxGeometry(3.6, 0.45, 3.6, 4, 1, 4);
  plinth.translate(0, 0.225, 0);
  plinthObj.addGeometry(world.shared, plinth, { color: 0x8d8778, ambient: 0.6 });
  world.add(plinthObj);

  return {
    object: plinthObj,
    poi: {
      id: 'me',
      title: 'Murat Özcan',
      body: 'Stand-in figure. The real scan goes here.',
      gv: at,
      radius: units(6),
    },
  };
}

/**
 * The figure on the plinth.
 *
 * Separate and async because it fetches a model. Deliberately oversized —
 * roughly four times a person — so that when you are halfway round the world
 * and it sits exactly antipodal, it reads as a presence filling the sky rather
 * than a speck.
 */
export async function buildFigure(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): Promise<HyperObject> {
  const model = await loadModel('/models/figure.glb');
  return spawnModel(world, at, model, {
    height: 5.0,
    yaw,
    ambient: 0.58,
  });
}
