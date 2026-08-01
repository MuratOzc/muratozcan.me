import { PlaneGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HyperObject, type HyperWorld } from '../../engine';
import type { Station } from '../../content/stations';
import { merge } from '../geometry';
import { facePath, placeAlongPath, units, type Poi } from '../placement';
import { makeSignTexture } from '../text';

/**
 * The station label: a lectern at the path edge.
 *
 *      path
 *   ====|====
 *       |  ___
 *       | /   \      board, tilted 40 degrees off vertical
 *       | |___|      pedestal on a stone footing
 *
 * A museum label, built like one: a footing, a pedestal, and a solid board
 * tilted back so the face angles up at someone standing on the path.
 *
 * Two things this has to get right and an earlier version did not.
 *
 * ASPECT. The sign texture is 1024x384, so the lettering is only undistorted
 * where the quad it is mapped onto is exactly 8:3. DECAL_W / DECAL_H is that
 * ratio, held exactly; the board around it is inset by a fixed margin rather
 * than sized independently, so the two cannot drift apart.
 *
 * RIGID TILT. Every part above the pedestal is authored flat, in board-local
 * coordinates, then tilted and lifted as one body by `mount`. Tilting the
 * pieces separately and then positioning each by hand is what leaves a panel
 * hanging in front of legs it never touches.
 */

/** Sign: just off the path edge, which is 0.8 units from the centre line. */
const SIGN_LATERAL = 1.5;

/** Reading angle, radians off vertical. Negative tips the face upward. */
const TILT = -0.7;

const BOARD_W = 1.4;
const BOARD_H = 0.525;
const BOARD_T = 0.07;
/** Exactly 8:3, matching the texture. Do not set these independently. */
const DECAL_W = 1.32;
const DECAL_H = DECAL_W * (3 / 8);

const FOOT_H = 0.08;
const PED_H = 0.24;
const PED_D = 0.44;
/** Top front edge of the pedestal: where the board's bottom edge lands. */
const PED_TOP = FOOT_H + PED_H;
const PED_FRONT = 0.15;

export function buildSign(
  world: HyperWorld,
  s: Station,
): { object: HyperObject; poi: Poi } {
  const lateral = Math.sign(s.lateral) * SIGN_LATERAL;
  const gv = placeAlongPath(units(s.at), units(lateral));
  const object = new HyperObject(gv);
  object.rotation.y = facePath(s.at, lateral);

  // ---------------- footing and pedestal.
  const foot = new RoundedBoxGeometry(BOARD_W + 0.16, FOOT_H, PED_D + 0.18, 6, 0.014);
  foot.translate(0, FOOT_H / 2, PED_FRONT - (PED_D + 0.18) / 2 + 0.09);
  object.addGeometry(world.shared, foot, { color: 0xb0aea6, ambient: 0.6 });

  const ped = new RoundedBoxGeometry(BOARD_W - 0.1, PED_H, PED_D, 5, 0.016);
  ped.translate(0, FOOT_H + PED_H / 2, PED_FRONT - PED_D / 2);
  object.addGeometry(world.shared, ped, { color: 0x8e8878, ambient: 0.55 });

  // ---------------- the board.
  //
  // Authored flat and centred, then tilted about its own centre and carried to
  // the pedestal. The offset is derived from where the tilt puts the board's
  // bottom edge, so changing TILT or BOARD_H moves the whole assembly to match
  // instead of tearing it apart.
  const half = BOARD_H / 2;
  const dropY = half * Math.cos(TILT);
  const dropZ = -half * Math.sin(TILT);
  const centreY = PED_TOP + dropY;
  const centreZ = PED_FRONT - dropZ;

  const mount = (g: { rotateX: (a: number) => unknown; translate: (x: number, y: number, z: number) => unknown }) => {
    g.rotateX(TILT);
    g.translate(0, centreY, centreZ);
    return g;
  };

  const board = new RoundedBoxGeometry(BOARD_W, BOARD_H, BOARD_T, 6, 0.012);
  mount(board);
  object.addGeometry(world.shared, board, { color: 0x5c574c, ambient: 0.5 });

  // A raised lip along the bottom edge of the face, which is what stops the
  // board reading as a slab with a sticker on it.
  const lip = new RoundedBoxGeometry(BOARD_W, 0.03, 0.026, 3, 0.008);
  lip.translate(0, -half + 0.015, BOARD_T / 2 + 0.006);
  mount(lip);
  object.addGeometry(world.shared, lip, { color: 0x74705f, ambient: 0.52 });

  // The face. A decal a few millimetres proud of the board, so it must opt out
  // of shadow sampling in both directions: the map cannot resolve that sliver
  // of depth and the board behind would otherwise shadow the text.
  const face = new PlaneGeometry(DECAL_W, DECAL_H, 1, 1);
  face.translate(0, 0, BOARD_T / 2 + 0.005);
  mount(face);
  object.addGeometry(world.shared, face, {
    map: makeSignTexture(s.n, s.title, s.object),
    color: 0xffffff,
    ambient: 0.9,
    castShadow: false,
    receiveShadow: false,
  });

  // ---------------- struts under the overhang. The tilt carries the board's
  // top edge back past the pedestal, and nothing in this world should be
  // visibly unsupported.
  //
  // Their height is the height of the point they hold up — the board's UNDER
  // face at its top edge, tilt included — not a fraction of anything. Guessing
  // it is how you end up with a strut that stops short of the board.
  const strutTop = centreY + half * Math.cos(TILT) + (BOARD_T / 2) * Math.sin(TILT);
  const strutZ = centreZ + half * Math.sin(TILT) - (BOARD_T / 2) * Math.cos(TILT);
  const strut = merge(
    [-1, 1].map((sx) => {
      const s2 = new RoundedBoxGeometry(0.07, strutTop, 0.07, 4, 0.014);
      s2.translate(sx * (BOARD_W / 2 - 0.14), strutTop / 2, strutZ + 0.035);
      return s2;
    }),
  );
  object.addGeometry(world.shared, strut, { color: 0x7d7868, ambient: 0.52 });

  world.add(object);

  return {
    object,
    // The board is read from the path, so the label triggers off the sign
    // rather than the exhibit behind it.
    poi: { id: s.id, title: s.title, body: s.body, gv, radius: units(4) },
  };
}
