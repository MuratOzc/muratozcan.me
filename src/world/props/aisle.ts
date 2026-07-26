import { BoxGeometry, PlaneGeometry } from 'three';
import { HyperObject, type HyperWorld } from '../../engine';
import { pathYaw, placeAlongPath, units } from '../placement';
import { makeArrowTexture } from '../text';

/**
 * The aisle: slabs the whole way round, with chevrons painted on.
 *
 * Skipped near the antipode, where the Poincare radius diverges — a gap of a
 * couple of units that later content covers.
 */

/** Gap between slab centres, in authored units. */
const STEP = 1.1;

function slabGeometry() {
  const g = new BoxGeometry(1.6, 0.04, 0.9, 2, 1, 2);
  return g;
}

export function buildAisle(world: HyperWorld): HyperObject[] {
  const objects: HyperObject[] = [];
  const slab = slabGeometry();
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
    world.add(o);
    objects.push(o);

    if (step % 4 === 2) {
      const arrow = new HyperObject(placeAlongPath(a, 0));
      arrow.rotation.y = yaw;
      arrow.addGeometry(world.shared, arrowGeo, {
        map: arrowTex,
        color: 0xffffff,
        ambient: 0.9,
        alphaTest: 0.3,
      });
      world.add(arrow);
      objects.push(arrow);
    }
    step++;
  }

  return objects;
}
