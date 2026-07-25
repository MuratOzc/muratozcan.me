import { BoxGeometry, PlaneGeometry } from 'three';
import { HyperObject, type HyperWorld } from '../engine';
import { pathYaw, placeAlongPath, units, type Poi } from './placement';
import { makeArrowTexture, makeTextTexture } from './text';
import { loadModel, spawnModel } from './model';

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
export const MODEL_AT = 8.0;
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

  // Direction markers. Painted on the path rather than signposted, so they
  // guide without cluttering the skyline — and because a chevron stays
  // readable when foreshortened to almost nothing down a curving path.
  const arrowTex = makeArrowTexture('#63705a');
  const arrowGeo = new PlaneGeometry(0.8, 0.8, 3, 3);
  arrowGeo.rotateX(-Math.PI / 2);
  arrowGeo.translate(0, 0.045, 0);

  let step = 0;
  for (let a = 0; a < total; a += units(STEP)) {
    if (Math.abs(a - Math.PI) < 0.05) continue;
    const yaw = pathYaw(a, 0);
    const o = new HyperObject(placeAlongPath(a, 0));
    o.rotation.y = yaw;
    o.addGeometry(world.shared, slab, {
      color: 0xb9ae94,
      ambient: 0.66,
      mottleScale: 90,
      mottleAmount: 0.22,
    });
    add(o);

    if (step % 4 === 2) {
      const arrow = new HyperObject(placeAlongPath(a, 0));
      arrow.rotation.y = yaw;
      arrow.addGeometry(world.shared, arrowGeo, {
        map: arrowTex,
        color: 0xffffff,
        ambient: 0.9,
        alphaTest: 0.3,
      });
      add(arrow);
    }
    step++;
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

  // -------------------------------------------------------------- the plinth
  // The figure itself loads asynchronously; the plinth is here so the spot
  // reads as occupied from the first frame.
  const modelAt = -units(MODEL_AT);
  const plinthObj = new HyperObject(placeAlongPath(modelAt, 0));
  plinthObj.rotation.y = pathYaw(modelAt, 0);
  const plinth = new BoxGeometry(3.6, 0.45, 3.6, 4, 1, 4);
  plinth.translate(0, 0.225, 0);
  plinthObj.addGeometry(world.shared, plinth, { color: 0x8d8778, ambient: 0.6 });
  add(plinthObj);

  pois.push({
    id: 'me',
    title: 'Murat Özcan',
    body: 'Stand-in figure. The real scan goes here.',
    gv: placeAlongPath(modelAt, 0),
    radius: units(6),
  });

  return { pois, objects };
}

/**
 * The figure on the plinth.
 *
 * Separate and async because it fetches a model. Deliberately oversized —
 * roughly four times a person — so that when you are halfway round the world
 * and it sits exactly antipodal, it reads as a presence filling the sky rather
 * than a speck.
 */
export async function buildFigure(world: HyperWorld): Promise<HyperObject> {
  const model = await loadModel('/models/figure.glb');
  const modelAt = -units(MODEL_AT);
  return spawnModel(world, placeAlongPath(modelAt, 0), model, {
    height: 5.0,
    // Face back down the path, toward the arch and the walk ahead.
    yaw: pathYaw(modelAt, 0) + Math.PI,
    ambient: 0.58,
  });
}
