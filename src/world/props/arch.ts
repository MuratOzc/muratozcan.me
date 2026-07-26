import { BoxGeometry, PlaneGeometry } from 'three';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';
import { units, type Poi } from '../placement';
import { makeTextTexture } from '../text';

/**
 * The WELCOME arch: two posts, a lintel, and the sign as a cutout texture.
 * The first thing the walk shows you, and — because the aisle is a great
 * circle — also the last.
 */

const POST_H = 2.6;
const SPAN = 1.15;

export function buildArch(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): { object: HyperObject; poi: Poi } {
  const arch = new HyperObject(at);
  arch.rotation.y = yaw;

  for (const side of [-1, 1]) {
    const post = new BoxGeometry(0.22, POST_H, 0.22, 2, 12, 2);
    post.translate(side * SPAN, POST_H / 2, 0);
    arch.addGeometry(world.shared, post, { color: 0xd8d2c4, ambient: 0.55 });
  }
  const lintel = new BoxGeometry(SPAN * 2 + 0.5, 0.34, 0.3, 14, 2, 2);
  lintel.translate(0, POST_H + 0.17, 0);
  arch.addGeometry(world.shared, lintel, { color: 0xe2ddd1, ambient: 0.58 });

  // The sign itself: a plane on the lintel, text as a cutout texture.
  const signGeo = new PlaneGeometry(SPAN * 2, 0.5, 8, 2);
  signGeo.translate(0, POST_H + 0.17, 0.16);
  arch.addGeometry(world.shared, signGeo, {
    map: makeTextTexture('WELCOME', { letterSpacing: 18, color: '#2b3138' }),
    color: 0xffffff,
    ambient: 0.95,
    alphaTest: 0.35,
  });
  world.add(arch);

  return {
    object: arch,
    poi: {
      id: 'arch',
      title: 'muratozcan.me',
      body: 'Follow the path. It goes all the way round and comes back here.',
      gv: at,
      radius: units(4),
    },
  };
}
