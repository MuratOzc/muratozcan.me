import { BoxGeometry, DoubleSide, PlaneGeometry } from 'three';
import { HyperObject, type HyperWorld } from '../../engine';
import type { Station } from '../../content/stations';
import { facePath, placeAlongPath, units, type Poi } from '../placement';
import { makeSignTexture } from '../text';

/**
 * The station label: a low sign at the path edge.
 *
 *      path
 *   ====|====      sign, low and angled, at the path edge
 *       |  /_
 *
 * Half a person high and tilted back so it reads while you walk past, like a
 * museum label.
 */

/** Sign: just off the path edge, which is 0.8 units from the centre line. */
const SIGN_LATERAL = 1.5;

/** Half a person. Low enough to look down at, like a museum label. */
const SIGN_TOP = 0.5;
const SIGN_W = 1.7;
const SIGN_H = 0.42;
/** Reading angle. Tilts the face up toward someone standing on the path. */
const SIGN_TILT = -0.62;

export function buildSign(
  world: HyperWorld,
  s: Station,
): { object: HyperObject; poi: Poi } {
  const lateral = Math.sign(s.lateral) * SIGN_LATERAL;
  const gv = placeAlongPath(units(s.at), units(lateral));
  const object = new HyperObject(gv);
  object.rotation.y = facePath(s.at, lateral);

  // Two short legs.
  for (const side of [-1, 1]) {
    const leg = new BoxGeometry(0.07, SIGN_TOP - 0.06, 0.07, 1, 3, 1);
    leg.translate(side * (SIGN_W / 2 - 0.15), (SIGN_TOP - 0.06) / 2, 0);
    object.addGeometry(world.shared, leg, { color: 0x8e8878, ambient: 0.55 });
  }

  // The panel, tilted back so its face angles up toward the path.
  const panel = new PlaneGeometry(SIGN_W, SIGN_H, 6, 3);
  panel.rotateX(SIGN_TILT);
  panel.translate(0, SIGN_TOP - (SIGN_H * Math.cos(SIGN_TILT)) / 2, 0.04);
  object.addGeometry(world.shared, panel, {
    map: makeSignTexture(s.n, s.title, s.object),
    color: 0xffffff,
    ambient: 0.9,
    side: DoubleSide,
  });

  world.add(object);

  return {
    object,
    // The panel is read from the path, so the label triggers off the sign
    // rather than the exhibit behind it.
    poi: { id: s.id, title: s.title, body: s.body, gv, radius: units(4) },
  };
}
