import { BoxGeometry, CylinderGeometry, PlaneGeometry } from 'three';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';
import { L } from '../../content/i18n';
import { makeLocalizedTextTexture, makeTextTexture } from '../text';

/**
 * Security, minor exhibits: the things that go next to the camera mast.
 *
 * A safe with `.env` stencilled on the door — the file that stays in the
 * safe — and a TLS certificate framed on a post like a diploma, because
 * around here a certificate that never lapses IS the diploma.
 */

export function buildVault(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): HyperObject {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  // ---- the safe
  const body = new BoxGeometry(0.62, 0.78, 0.6, 3, 4, 3);
  body.translate(1.05, 0.39, 0);
  object.addGeometry(world.shared, body, { color: 0x3a4048, ambient: 0.45 });
  const door = new BoxGeometry(0.5, 0.62, 0.04, 3, 3, 1);
  door.translate(1.05, 0.42, 0.31);
  object.addGeometry(world.shared, door, { color: 0x474e58, ambient: 0.5 });
  const handle = new CylinderGeometry(0.075, 0.075, 0.05, 12);
  handle.rotateX(Math.PI / 2);
  handle.translate(1.18, 0.36, 0.345);
  object.addGeometry(world.shared, handle, { color: 0x9aa0a6, ambient: 0.55 });
  const label = new PlaneGeometry(0.34, 0.13, 2, 1);
  label.translate(1.05, 0.62, 0.335);
  object.addGeometry(world.shared, label, {
    map: makeTextTexture('.env', { color: '#e8edf2', width: 512, height: 192 }),
    color: 0xffffff,
    ambient: 0.9,
    alphaTest: 0.3,
    castShadow: false,
  });

  // ---- the framed certificate
  const post = new BoxGeometry(0.08, 1.5, 0.08, 1, 8, 1);
  post.translate(1.95, 0.75, 0);
  object.addGeometry(world.shared, post, { color: 0x8e8878, ambient: 0.55 });
  const frame = new BoxGeometry(0.56, 0.72, 0.04, 3, 3, 1);
  frame.translate(1.95, 1.52, 0.02);
  object.addGeometry(world.shared, frame, { color: 0x8a7a5e, ambient: 0.55 });
  const paper = new PlaneGeometry(0.46, 0.6, 3, 3);
  paper.translate(1.95, 1.52, 0.045);
  object.addGeometry(world.shared, paper, {
    map: makeLocalizedTextTexture(L('TLS · VALID', 'TLS · GEÇERLİ'), {
      width: 512,
      height: 640,
      color: '#3b4148',
      background: '#efece3',
    }),
    color: 0xffffff,
    ambient: 0.9,
    castShadow: false,
  });

  world.add(object);
  return object;
}
