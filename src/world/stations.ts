import { BoxGeometry, DoubleSide, PlaneGeometry } from 'three';
import { HyperObject, type HyperWorld } from '../engine';
import { STATIONS, type Station } from '../content/stations';
import { pathYaw, placeAlongPath, units, type Poi } from './placement';
import { makeTextTexture } from './text';

/**
 * Placeholder markers for the twelve stations.
 *
 * Deliberately provisional: a post, a numbered placard, and a ground plate,
 * all in one flat grey. The point is to judge pacing and reading rhythm on the
 * walk before any of the real objects exist — if the spacing is wrong, it is
 * far cheaper to find out now than after twelve models are placed.
 *
 * Each placard names the station and what will eventually stand there.
 */

const POST_H = 2.2;
const PLACARD_W = 2.4;
const PLACARD_H = 0.62;

/**
 * Yaw that turns a station to face the path.
 *
 * pathYaw aligns local -z along the direction of travel, so local +x points
 * right. A placard is a PlaneGeometry, which faces +z, so it needs a further
 * quarter turn — toward -x from the right-hand side, toward +x from the left.
 */
function facePath(at: number, lateral: number): number {
  const base = pathYaw(units(at), units(lateral));
  return base + (lateral > 0 ? -Math.PI / 2 : Math.PI / 2);
}

function buildStation(world: HyperWorld, s: Station): { object: HyperObject; poi: Poi } {
  const gv = placeAlongPath(units(s.at), units(s.lateral));
  const object = new HyperObject(gv);
  object.rotation.y = facePath(s.at, s.lateral);

  // Ground plate, so the spot reads as occupied from a distance.
  const plate = new BoxGeometry(1.8, 0.06, 1.8, 2, 1, 2);
  plate.translate(0, 0.03, 0);
  object.addGeometry(world.shared, plate, { color: 0x9a9384, ambient: 0.62 });

  const post = new BoxGeometry(0.16, POST_H, 0.16, 2, 8, 2);
  post.translate(0, POST_H / 2, 0);
  object.addGeometry(world.shared, post, { color: 0xb4ad9d, ambient: 0.56 });

  // Placard. Double-sided so it stays readable from either approach — you walk
  // past these twice, once out and once on the way back round.
  const placard = new PlaneGeometry(PLACARD_W, PLACARD_H, 8, 2);
  placard.translate(0, POST_H + PLACARD_H / 2 - 0.1, 0.02);
  object.addGeometry(world.shared, placard, {
    map: makeTextTexture(`${String(s.n).padStart(2, '0')}  ${s.title.toUpperCase()}`, {
      width: 1024,
      height: 256,
      letterSpacing: 6,
      color: '#20262c',
      background: '#e6e1d4',
    }),
    color: 0xffffff,
    ambient: 0.92,
    side: DoubleSide,
  });

  // A second, smaller line naming what will stand here eventually.
  const note = new PlaneGeometry(PLACARD_W, 0.3, 8, 2);
  note.translate(0, POST_H + PLACARD_H / 2 - 0.52, 0.02);
  object.addGeometry(world.shared, note, {
    map: makeTextTexture(s.object, {
      width: 1024,
      height: 128,
      color: '#5d6670',
      background: '#efece3',
    }),
    color: 0xffffff,
    ambient: 0.92,
    side: DoubleSide,
  });

  world.add(object);

  return {
    object,
    poi: {
      id: s.id,
      title: s.title,
      body: s.body,
      gv,
      radius: units(4.5),
    },
  };
}

export interface BuiltStations {
  objects: HyperObject[];
  pois: Poi[];
}

export function buildStations(world: HyperWorld): BuiltStations {
  const objects: HyperObject[] = [];
  const pois: Poi[] = [];
  for (const s of STATIONS) {
    const { object, poi } = buildStation(world, s);
    objects.push(object);
    pois.push(poi);
  }
  return { objects, pois };
}
