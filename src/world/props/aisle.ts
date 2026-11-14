import { BoxGeometry, PlaneGeometry } from 'three';
import { HyperObject, type HyperWorld } from '../../engine';
import { pathYaw, placeAlongPath } from '../placement';
import { rebase } from '../rebase';
import { makeArrowTexture } from '../text';

/**
 * The aisle: slabs the whole way round, with chevrons painted on.
 */

/**
 * Slabs in the ring. COUNTED, not stepped, and the count MUST BE ODD.
 *
 * Stepping by a fixed distance divided 2*PI into 57.12 slabs, which cost the
 * path both of its ends: the leftover 0.12 dropped the last slab a tenth of a
 * unit from the one at spawn, and nothing made the sampling avoid the
 * antipode, so a slab landed 0.048 short of it and had to be dropped — leaving
 * a hole on one side only, which is the missing stone.
 *
 * The antipode has no chart coordinate at all: the Poincare radius is
 * tan(d/2), infinite at d = PI. An even count puts a slab centre exactly
 * there. An odd count straddles it, so the two nearest sit half a step short
 * on either side — placeable, symmetric, and the ring closes with neither a
 * gap nor a seam.
 *
 * 57 keeps the 1.1 units between centres the path was authored at.
 */
const SLABS = 57;

// Slabs per object. A run has to stay well inside a quarter turn of its
// anchor, which is what rebase needs.
const RUN = 5;

function slabGeometry() {
  const g = new BoxGeometry(1.6, 0.04, 0.9, 2, 1, 2);
  return g;
}

export function buildAisle(world: HyperWorld): HyperObject[] {
  const objects: HyperObject[] = [];
  const total = 2 * Math.PI;

  // Direction markers. Painted on the path rather than signposted, so they
  // guide without cluttering the skyline — and because a chevron stays
  // readable when foreshortened to almost nothing down a curving path.
  const arrowTex = makeArrowTexture('#63705a');
  const arrowGeometry = () => {
    const g = new PlaneGeometry(0.8, 0.8, 3, 3);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.045, 0);
    return g;
  };

  const step = total / SLABS;
  for (let first = 0; first < SLABS; first += RUN) {
    const last = Math.min(first + RUN, SLABS) - 1;
    // On a slab's own placement, never between two: with SLABS odd no slab is
    // at the antipode, and so no anchor is either.
    const anchor = placeAlongPath(Math.floor((first + last) / 2) * step, 0);
    // tanK height off: rebase hands back geometry that assumes it.
    const run = new HyperObject(anchor, false);

    for (let i = first; i <= last; i++) {
      const a = i * step;
      // Never fires while SLABS is odd. Kept because the failure it guards is
      // not a gap but an infinity, and the parity that avoids it is one edit
      // away from being lost.
      if (Math.abs(a - Math.PI) < 0.05) continue;
      const at = placeAlongPath(a, 0);
      const yaw = pathYaw(a, 0);

      run.addGeometry(world.shared, rebase(slabGeometry().rotateY(yaw), at, anchor), {
        color: 0xb9ae94,
        ambient: 0.66,
        mottleScale: 90,
        mottleAmount: 0.22,
      });

      if (i % 4 === 2) {
        run.addGeometry(world.shared, rebase(arrowGeometry().rotateY(yaw), at, anchor), {
          map: arrowTex,
          color: 0xffffff,
          ambient: 0.9,
          alphaBlend: true,
          castShadow: false,
        });
      }
    }

    world.add(run);
    objects.push(run);
  }

  return objects;
}
