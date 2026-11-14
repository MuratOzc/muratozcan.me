import { HyperObject, type HyperWorld } from '../engine';
import { pathYaw, placeAlongPath, units, type Poi } from './placement';
import { buildAisle } from './props/aisle';
import { buildArch } from './props/arch';
import { buildPortrait } from './props/portrait';
import { buildScatter } from './props/scatter';

/**
 * The skeleton of the world.
 *
 *        spawn  [ arch: WELCOME ]  ==== the aisle ====  [ you ]  ==>
 *            ^                                                 |
 *            +---------------- comes back round ---------------+
 *
 * The aisle is a great circle through spawn, so walking it returns you to
 * where you began.
 *
 * The portrait stands on it well past the quarter turn, facing back at spawn.
 * Distance shrinks a thing's apparent size only until a quarter turn; past
 * that it GROWS. So from spawn the portrait is already large, hanging in the
 * sky inside the arch with nothing behind it, and walking toward it makes it
 * smaller until a quarter turn away, then larger again as you arrive.
 *
 * This file is the MAP, not the furniture: it decides where things stand, and
 * the props under props/ decide what they look like. Add or move a landmark
 * here; change its appearance in its own file.
 */

/** Distance ahead of spawn where the arch stands, in units. */
export const ARCH_AT = 5.0;
/**
 * Distance ahead of spawn where the portrait stands, in units. Chosen by eye:
 * nearer and it is small and low in the arch, further and it climbs behind the
 * WELCOME lintel and then off the top of the screen.
 */
export const PORTRAIT_AT = 25.0;
/** Total aisle length: once around. */
export const AISLE_LENGTH = 2 * Math.PI;

/** Where along the aisle a bay sits, in units from spawn. */
export function aisleUnits(u: number) {
  return placeAlongPath(units(u), 0);
}

export interface Skeleton {
  pois: Poi[];
  objects: HyperObject[];
}

export function buildSkeleton(world: HyperWorld): Skeleton {
  const pois: Poi[] = [];
  const objects: HyperObject[] = [];

  // ------------------------------------------------------------- the aisle
  objects.push(...buildAisle(world));

  // ------------------------------------------------------- the lawn's detail
  objects.push(...buildScatter(world));

  // -------------------------------------------------------------- the arch
  const archAt = units(ARCH_AT);
  const arch = buildArch(world, placeAlongPath(archAt, 0), pathYaw(archAt, 0));
  objects.push(arch.object);
  pois.push(arch.poi);

  // ----------------------------------------------------------- the portrait
  const portraitAt = units(PORTRAIT_AT);
  const portrait = buildPortrait(
    world,
    placeAlongPath(portraitAt, 0),
    // pathYaw points local -z along the walk, and the print faces +z: back
    // toward spawn, which is where it is first seen from.
    pathYaw(portraitAt, 0),
  );
  objects.push(portrait.object);
  pois.push(portrait.poi);

  return { pois, objects };
}
