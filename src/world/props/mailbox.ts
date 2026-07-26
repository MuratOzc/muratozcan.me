import {
  BoxGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';
import { makeTextTexture } from '../text';

/**
 * Station 10: contact.
 *
 * A round-top mailbox with its flag up, and a fingerpost whose arrow plates
 * swing off in different directions — one per link. The clickable links live
 * in the proximity panel (DOM); the plates are wayfinding, not UI.
 */

const LINKS = ['GMAIL', 'LINKEDIN', 'GITHUB', 'INSTAGRAM'];

/**
 * RoundedBoxGeometry is non-indexed while the primitives are indexed, and
 * mergeGeometries refuses to mix the two — flatten everything first.
 */
function merge(parts: BufferGeometry[]): BufferGeometry {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

/** The classic silhouette: box bottom, half-cylinder top, capped ends. */
function mailboxBody(): BufferGeometry {
  const W = 0.32;
  const H = 0.18;
  const D = 0.5;
  const R = W / 2;

  const parts: BufferGeometry[] = [];

  const lower = new BoxGeometry(W, H, D, 2, 2, 3);
  lower.translate(0, H / 2, 0);
  parts.push(lower);

  const barrel = new CylinderGeometry(R, R, D, 16, 1, false, 0, Math.PI);
  barrel.rotateZ(Math.PI / 2);
  barrel.rotateY(Math.PI / 2);
  barrel.translate(0, H, 0);
  parts.push(barrel);

  // End caps: a rounded slab front and back closing the tube.
  for (const s of [-1, 1]) {
    const cap = new RoundedBoxGeometry(W, H + R, 0.03, 2, 0.012);
    cap.translate(0, (H + R) / 2, s * (D / 2 - 0.012));
    parts.push(cap);
  }

  return merge(parts);
}

export function buildMailbox(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): HyperObject {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  const WOOD = 0x9a7d5c;
  const RED = 0xd8604a;

  // ---------------- the mailbox: post, cross-arm brace, body, door, flag.
  const MB_X = -0.55;
  const MB_Y = 1.06;

  const post = new CylinderGeometry(0.042, 0.05, MB_Y, 12);
  post.translate(MB_X, MB_Y / 2, 0);
  object.addGeometry(world.shared, post, { color: WOOD, ambient: 0.5 });

  const arm = new RoundedBoxGeometry(0.1, 0.05, 0.46, 2, 0.015);
  arm.translate(MB_X, MB_Y - 0.02, 0);
  object.addGeometry(world.shared, arm, { color: WOOD, ambient: 0.5 });

  const body = mailboxBody();
  body.translate(MB_X, MB_Y, 0);
  object.addGeometry(world.shared, body, { color: 0xb0b6bd, ambient: 0.55 });

  // Door: a proud disc-and-plate on the path-facing end.
  const door = new RoundedBoxGeometry(0.28, 0.3, 0.025, 2, 0.05);
  door.translate(MB_X, MB_Y + 0.17, 0.245);
  object.addGeometry(world.shared, door, { color: 0x9ba1a8, ambient: 0.5 });
  const latch = new CylinderGeometry(0.022, 0.022, 0.03, 10);
  latch.rotateX(Math.PI / 2);
  latch.translate(MB_X, MB_Y + 0.1, 0.262);
  object.addGeometry(world.shared, latch, { color: 0x757b82, ambient: 0.5 });

  // Flag up: mail waiting. (It is your move.) Pole, pivot, pennant.
  const flagPivot = new CylinderGeometry(0.018, 0.018, 0.03, 8);
  flagPivot.rotateZ(Math.PI / 2);
  flagPivot.translate(MB_X - 0.175, MB_Y + 0.1, 0.05);
  object.addGeometry(world.shared, flagPivot, { color: RED, ambient: 0.55 });
  const flagArm = new RoundedBoxGeometry(0.025, 0.3, 0.025, 1, 0.008);
  flagArm.translate(MB_X - 0.175, MB_Y + 0.25, 0.05);
  object.addGeometry(world.shared, flagArm, { color: RED, ambient: 0.55 });
  const pennant = new RoundedBoxGeometry(0.025, 0.09, 0.16, 1, 0.008);
  pennant.translate(MB_X - 0.175, MB_Y + 0.36, 0.12);
  object.addGeometry(world.shared, pennant, { color: RED, ambient: 0.55 });

  // ---------------- the fingerpost: tapered pole, finial, arrow plates.
  const FP_X = 0.55;
  const FP_H = 2.3;

  const pole = new CylinderGeometry(0.035, 0.055, FP_H, 12);
  pole.translate(FP_X, FP_H / 2, 0);
  object.addGeometry(world.shared, pole, { color: WOOD, ambient: 0.5 });
  const finial = new SphereGeometry(0.055, 12, 10);
  finial.translate(FP_X, FP_H + 0.03, 0);
  object.addGeometry(world.shared, finial, { color: WOOD, ambient: 0.55 });

  LINKS.forEach((name, i) => {
    const swing = [0.55, -0.5, 0.15, -1.05][i];
    const y = FP_H - 0.25 - i * 0.3;

    // Collar the plate clamps onto, so it visibly attaches to the pole.
    const collar = new CylinderGeometry(0.052, 0.052, 0.06, 12);
    collar.translate(FP_X, y, 0);
    object.addGeometry(world.shared, collar, { color: 0x7a6248, ambient: 0.5 });

    // Plate: rounded slab with a diamond tip — an arrow, pointing somewhere
    // that is not here.
    const plateParts: BufferGeometry[] = [];
    const slab = new RoundedBoxGeometry(0.62, 0.15, 0.03, 2, 0.012);
    slab.translate(0.36, 0, 0);
    plateParts.push(slab);
    const tip = new BoxGeometry(0.11, 0.11, 0.03, 1, 1, 1);
    tip.rotateZ(Math.PI / 4);
    tip.translate(0.67, 0, 0);
    plateParts.push(tip);
    const plate = merge(plateParts);
    plate.rotateY(swing);
    plate.translate(FP_X, y, 0);
    object.addGeometry(world.shared, plate, { color: 0xe6dfd0, ambient: 0.62 });

    const face = new PlaneGeometry(0.56, 0.115, 4, 1);
    face.translate(0.36, 0, 0.017);
    face.rotateY(swing);
    face.translate(FP_X, y, 0);
    object.addGeometry(world.shared, face, {
      map: makeTextTexture(name, {
        width: 768,
        height: 144,
        color: '#2b3138',
        letterSpacing: 5,
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
