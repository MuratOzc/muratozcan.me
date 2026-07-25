import { BoxGeometry, DoubleSide, PlaneGeometry } from 'three';
import { HyperObject, type HyperWorld } from '../engine';
import { STATIONS, type Station } from '../content/stations';
import { pathYaw, placeAlongPath, units, type Poi } from './placement';
import { makeSignTexture } from './text';

/**
 * Stations, laid out as an exhibition.
 *
 *      path
 *   ====|====      sign, low and angled, at the path edge
 *       |  /_
 *       |          gap
 *       |  [####]  exhibit, set back
 *
 * Two pieces per station. A label at the path edge, half a person high and
 * tilted back so it reads while you walk past; and the object itself set back
 * behind it with space around, so the sign never occludes the exhibit and the
 * exhibit never blocks the path.
 *
 * The exhibit is a placeholder pad and volume for now. Once real models land,
 * only EXHIBIT_LATERAL and the pad size should need touching.
 */

/** Sign: just off the path edge, which is 0.8 units from the centre line. */
const SIGN_LATERAL = 1.5;
/** Exhibit: set back, with room to read the sign without it in the way. */
const EXHIBIT_LATERAL = 5.0;

/** Half a person. Low enough to look down at, like a museum label. */
const SIGN_TOP = 0.5;
const SIGN_W = 1.7;
const SIGN_H = 0.42;
/** Reading angle. Tilts the face up toward someone standing on the path. */
const SIGN_TILT = -0.62;

/**
 * Yaw that turns a station to face the path.
 *
 * pathYaw aligns local -z along the direction of travel, so local +x points
 * right. A PlaneGeometry faces +z, so it needs a further quarter turn — toward
 * -x from the right-hand side of the path, toward +x from the left.
 */
function facePath(at: number, lateral: number): number {
  const base = pathYaw(units(at), units(lateral));
  return base + (lateral > 0 ? -Math.PI / 2 : Math.PI / 2);
}

function buildSign(world: HyperWorld, s: Station): { object: HyperObject; poi: Poi } {
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

function buildExhibit(world: HyperWorld, s: Station): HyperObject {
  const lateral = Math.sign(s.lateral) * EXHIBIT_LATERAL;
  const object = new HyperObject(placeAlongPath(units(s.at), units(lateral)));
  object.rotation.y = facePath(s.at, lateral);

  const pad = new BoxGeometry(3.2, 0.12, 3.2, 3, 1, 3);
  pad.translate(0, 0.06, 0);
  object.addGeometry(world.shared, pad, { color: 0x9a9384, ambient: 0.62 });

  // Stand-in volume. Sized to roughly what most of the real objects will be,
  // so the sightlines being judged now are the sightlines you get later.
  const block = new BoxGeometry(1.5, 1.8, 1.5, 3, 5, 3);
  block.translate(0, 0.12 + 0.9, 0);
  object.addGeometry(world.shared, block, { color: 0xb0a893, ambient: 0.5 });

  world.add(object);
  return object;
}

export interface BuiltStations {
  objects: HyperObject[];
  pois: Poi[];
}

export function buildStations(world: HyperWorld): BuiltStations {
  const objects: HyperObject[] = [];
  const pois: Poi[] = [];
  for (const s of STATIONS) {
    const { object, poi } = buildSign(world, s);
    objects.push(object, buildExhibit(world, s));
    pois.push(poi);
  }
  return { objects, pois };
}
