import { BoxGeometry, PlaneGeometry } from 'three';
import { HyperObject, type HyperWorld } from '../engine';
import { pathYaw, placeAlongPath, units, type Poi } from './placement';
import { makeTextTexture } from './text';

/**
 * The skeleton of the world.
 *
 *        [ you ]  spawn  [ arch: WELCOME ]  ==== the aisle ====>
 *            ^                                                 |
 *            +---------------- comes back round ---------------+
 *
 * The aisle is a great circle through spawn, so walking it returns you to
 * where you began — and to the model, which stands just behind the start.
 *
 * Putting the model at spawn rather than at the antipode is what makes the
 * walk work. Distance from it shrinks its apparent size only until a quarter
 * turn; past that it GROWS, and at the halfway point it is directly antipodal
 * and fills the entire sky. You spend the second half of the walk unable to
 * look away from the thing you started with your back to.
 *
 * Everything here is structure. Detail comes later.
 */

/** Distance ahead of spawn where the arch stands, in units. */
export const ARCH_AT = 5.0;
/** How far behind spawn the model stands, in units. */
export const MODEL_AT = 2.6;
/** Total aisle length: once around. */
export const AISLE_LENGTH = 2 * Math.PI;

/** Where along the aisle a bay sits, in units from spawn. */
export function aisleUnits(u: number) {
  return placeAlongPath(units(u), 0);
}

function slabGeometry() {
  const g = new BoxGeometry(1.6, 0.04, 0.9, 2, 1, 2);
  return g;
}

export interface Skeleton {
  pois: Poi[];
  objects: HyperObject[];
}

export function buildSkeleton(world: HyperWorld): Skeleton {
  const pois: Poi[] = [];
  const objects: HyperObject[] = [];
  const add = (o: HyperObject) => {
    world.add(o);
    objects.push(o);
    return o;
  };

  // ------------------------------------------------------------- the aisle
  // Slabs the whole way round. Skipped near the antipode, where the Poincare
  // radius diverges — a gap of a couple of units that later content covers.
  const slab = slabGeometry();
  const STEP = 1.1;
  const total = 2 * Math.PI;
  for (let a = 0; a < total; a += units(STEP)) {
    if (Math.abs(a - Math.PI) < 0.05) continue;
    const o = new HyperObject(placeAlongPath(a, 0));
    o.rotation.y = pathYaw(a, 0);
    o.addGeometry(world.shared, slab, {
      color: 0xb9ae94,
      ambient: 0.66,
      mottleScale: 90,
      mottleAmount: 0.22,
    });
    add(o);
  }

  // -------------------------------------------------------------- the arch
  const archAt = units(ARCH_AT);
  const arch = new HyperObject(placeAlongPath(archAt, 0));
  arch.rotation.y = pathYaw(archAt, 0);

  const POST_H = 2.6;
  const SPAN = 1.15;
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
  add(arch);

  pois.push({
    id: 'arch',
    title: 'muratozcan.me',
    body: 'Follow the path. It goes all the way round and comes back here.',
    gv: placeAlongPath(archAt, 0),
    radius: units(4),
  });

  // -------------------------------------------------------------- the model
  // Placeholder standing in for the real scan. Behind spawn, so you begin with
  // your back to it.
  const modelAt = -units(MODEL_AT);
  const model = new HyperObject(placeAlongPath(modelAt, 0));
  model.rotation.y = pathYaw(modelAt, 0) + Math.PI;

  const PLINTH_H = 0.14;
  const BODY_H = 0.85;
  const HEAD_H = 0.3;

  const plinth = new BoxGeometry(1.1, PLINTH_H, 1.1, 2, 1, 2);
  plinth.translate(0, PLINTH_H / 2, 0);
  model.addGeometry(world.shared, plinth, { color: 0x8d8778, ambient: 0.6 });

  const body = new BoxGeometry(0.42, BODY_H, 0.26, 3, 8, 2);
  body.translate(0, PLINTH_H + BODY_H / 2, 0);
  model.addGeometry(world.shared, body, { color: 0x4a5b7a, ambient: 0.5 });

  const head = new BoxGeometry(0.28, HEAD_H, 0.26, 2, 3, 2);
  head.translate(0, PLINTH_H + BODY_H + HEAD_H / 2, 0);
  model.addGeometry(world.shared, head, { color: 0xc99b7a, ambient: 0.52 });
  add(model);

  pois.push({
    id: 'me',
    title: 'Murat Özcan',
    body: 'Placeholder. The real model goes here.',
    gv: placeAlongPath(modelAt, 0),
    radius: units(3.5),
  });

  return { pois, objects };
}
