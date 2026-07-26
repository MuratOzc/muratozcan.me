import type { GyroVector, HyperObject, HyperWorld } from '../../engine';
import type { Poi } from '../placement';
import { buildCameraMast, type Watcher } from './cameras';

/**
 * Everything a station build can contribute to the world.
 */
export interface Built {
  objects: HyperObject[];
  pois: Poi[];
  watchers: Watcher[];
}

/**
 * Real exhibits, keyed by station id. Anything not listed falls back to the
 * placeholder pad and block, so stations can be built one at a time without
 * the world losing its shape in between.
 *
 * To build a station: add a props/<name>.ts with its builder, register it
 * here, and delete nothing — the placeholder stops appearing on its own.
 */
export const EXHIBITS: Record<
  string,
  (world: HyperWorld, at: GyroVector, yaw: number, out: Built) => void
> = {
  security(world, at, yaw, out) {
    const mast = buildCameraMast(world, at, yaw);
    out.objects.push(mast.object);
    out.watchers.push(...mast.watchers);
  },
};
