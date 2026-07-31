import { HyperObject, type HyperWorld } from '../engine';
import { pathYaw, placeAlongPath, units, type Poi } from './placement';
import { buildAisle } from './props/aisle';
import { buildArch } from './props/arch';
import { buildPortrait } from './props/portrait';
import { buildScatter } from './props/scatter';

/**
 * The skeleton of the world.
 *
 *        [ you ]  spawn  [ arch: WELCOME ]  ==== the aisle ====>
 *            ^                                                 |
 *            +---------------- comes back round ---------------+
 *
 * The aisle is a great circle through spawn, so walking it returns you to
 * where you began — and to the portrait, which stands just behind the start.
 *
 * Putting the portrait at spawn rather than at the antipode is what makes the
 * walk work. Distance from it shrinks its apparent size only until a quarter
 * turn; past that it GROWS, and at the halfway point it is directly antipodal
 * and fills the entire sky. You spend the second half of the walk unable to
 * look away from the thing you started with your back to.
 *
 * This file is the MAP, not the furniture: it decides where things stand, and
 * the props under props/ decide what they look like. Add or move a landmark
 * here; change its appearance in its own file.
 */

/** Distance ahead of spawn where the arch stands, in units. */
export const ARCH_AT = 5.0;
/** How far behind spawn the portrait stands, in units. */
export const MODEL_AT = 8.0;
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
  const modelAt = -units(MODEL_AT);
  const portrait = buildPortrait(
    world,
    placeAlongPath(modelAt, 0),
    // Face back down the path, toward the arch and the walk ahead.
    pathYaw(modelAt, 0) + Math.PI,
  );
  objects.push(portrait.object);
  pois.push(portrait.poi);

  return { pois, objects };
}
