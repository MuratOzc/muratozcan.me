import { BoxGeometry, CylinderGeometry, type BufferGeometry } from 'three';
import { RoundedBoxGeometry } from '../geometry';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';
import { merge } from '../geometry';

/**
 * Station 10: contact — the mailbox, with its flag up.
 *
 * Set dressing beside the link board (props/contact.ts), which is where the
 * interaction lives. It used to carry a fingerpost of arrow plates labelled
 * GMAIL / LINKEDIN / GITHUB / INSTAGRAM; those are gone, because they looked
 * like buttons and were not, and a thing that invites a click and ignores it
 * teaches the visitor that nothing here responds.
 */

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
  // Off to the left of the tokens — it shares the station's placement, so its
  // own local X is the only thing separating them.
  const MB_X = -1.7;
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

  world.add(object);
  return object;
}
