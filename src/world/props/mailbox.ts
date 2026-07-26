import { BoxGeometry, PlaneGeometry } from 'three';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';
import { makeTextTexture } from '../text';

/**
 * Station 10: contact.
 *
 * A mailbox with its flag up, and a signpost whose plates point off in
 * different directions — one per link. The actual clickable links live in the
 * proximity panel (DOM); the plates are wayfinding, not UI.
 */

const LINKS = ['GMAIL', 'LINKEDIN', 'GITHUB', 'INSTAGRAM'];

export function buildMailbox(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): HyperObject {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  // ---- mailbox on a post
  const post = new BoxGeometry(0.09, 1.0, 0.09, 1, 6, 1);
  post.translate(-0.45, 0.5, 0);
  object.addGeometry(world.shared, post, { color: 0x6f6252, ambient: 0.5 });
  const box = new BoxGeometry(0.36, 0.3, 0.56, 2, 2, 3);
  box.translate(-0.45, 1.14, 0);
  object.addGeometry(world.shared, box, { color: 0x89544a, ambient: 0.5 });
  const lid = new BoxGeometry(0.4, 0.05, 0.6, 2, 1, 3);
  lid.translate(-0.45, 1.31, 0);
  object.addGeometry(world.shared, lid, { color: 0x743b32, ambient: 0.5 });
  // Flag up: mail waiting. (It is your move.)
  const flag = new BoxGeometry(0.035, 0.26, 0.035, 1, 2, 1);
  flag.translate(-0.25, 1.42, 0.2);
  object.addGeometry(world.shared, flag, { color: 0xc8552e, ambient: 0.6 });
  const flagTip = new BoxGeometry(0.14, 0.09, 0.03, 1, 1, 1);
  flagTip.translate(-0.2, 1.52, 0.2);
  object.addGeometry(world.shared, flagTip, { color: 0xc8552e, ambient: 0.6 });

  // ---- the link signpost
  const pole = new BoxGeometry(0.1, 2.15, 0.1, 1, 10, 1);
  pole.translate(0.45, 1.075, 0);
  object.addGeometry(world.shared, pole, { color: 0x8e8878, ambient: 0.55 });

  LINKS.forEach((name, i) => {
    // Each plate swings a different way, like fingerposts at a crossroads.
    const swing = [0.5, -0.55, 0.25, -0.2][i];
    const y = 1.95 - i * 0.3;

    const plate = new BoxGeometry(0.78, 0.17, 0.03, 4, 1, 1);
    plate.translate(0.14, 0, 0);
    plate.rotateY(swing);
    plate.translate(0.45, y, 0.05);
    object.addGeometry(world.shared, plate, { color: 0xd8d2c4, ambient: 0.6 });

    const face = new PlaneGeometry(0.7, 0.13, 4, 1);
    face.translate(0.14, 0, 0.017);
    face.rotateY(swing);
    face.translate(0.45, y, 0.05);
    object.addGeometry(world.shared, face, {
      map: makeTextTexture(`${name} →`, {
        width: 768,
        height: 144,
        color: '#2b3138',
        letterSpacing: 4,
      }),
      color: 0xffffff,
      ambient: 0.9,
      alphaTest: 0.3,
      castShadow: false,
    });
  });

  world.add(object);
  return object;
}
