import type { GyroVector, HyperObject, HyperWorld } from '../../engine';
import type { Poi } from '../placement';
import { buildCabinets } from './cabinets';
import { buildCameraMast, type Watcher } from './cameras';
import { buildContact } from './contact';
import { buildConveyor } from './conveyor';
import { buildGears } from './gears';
import { buildMailbox } from './mailbox';
import { buildMonitor } from './monitor';
import { buildRack } from './rack';
import { buildSchoolDesk } from './schoolDesk';
import { buildSignpost } from './signpost';
import { buildVault } from './vault';
import { buildWorldModel } from './worldModel';

/**
 * Everything a station build can contribute to the world.
 */
export interface Built {
  objects: HyperObject[];
  pois: Poi[];
  watchers: Watcher[];
  /** Called every frame; how exhibits animate. */
  tickers: Array<(worldGV: GyroVector, dt: number) => void>;
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
  title(world, at, yaw, out) {
    out.objects.push(buildSignpost(world, at, yaw));
  },
  origin(world, at, yaw, out) {
    out.objects.push(buildSchoolDesk(world, at, yaw));
  },
  architecture(world, at, yaw, out) {
    const model = buildWorldModel(world, at, yaw);
    out.objects.push(model.object);
    out.tickers.push(model.tick);
  },
  backend(world, at, yaw, out) {
    const gears = buildGears(world, at, yaw);
    out.objects.push(gears.object);
    out.tickers.push(gears.tick);
  },
  frontend(world, at, yaw, out) {
    const monitor = buildMonitor(world, at, yaw);
    out.objects.push(monitor.object);
    out.tickers.push(monitor.tick);
  },
  data(world, at, yaw, out) {
    const cabinets = buildCabinets(world, at, yaw);
    out.objects.push(cabinets.object);
    out.tickers.push(cabinets.tick);
  },
  infrastructure(world, at, yaw, out) {
    const rack = buildRack(world, at, yaw);
    out.objects.push(rack.object);
    out.tickers.push(rack.tick);
  },
  shipping(world, at, yaw, out) {
    const conveyor = buildConveyor(world, at, yaw);
    out.objects.push(conveyor.object);
    out.tickers.push(conveyor.tick);
  },
  security(world, at, yaw, out) {
    const mast = buildCameraMast(world, at, yaw);
    out.objects.push(mast.object);
    out.watchers.push(...mast.watchers);
    out.objects.push(buildVault(world, at, yaw));
  },
  contact(world, at, yaw, out) {
    const board = buildContact(world, at, yaw);
    out.objects.push(board.object);
    out.tickers.push(board.tick);
    out.objects.push(buildMailbox(world, at, yaw));
  },
};
