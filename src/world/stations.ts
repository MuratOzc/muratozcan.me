import { type HyperWorld } from '../engine';
import { STATIONS } from '../content/stations';
import { EXHIBIT_LATERAL, SENTRIES } from './layout';
import { facePath, placeAlongPath, units } from './placement';
import { buildSign } from './props/sign';
import { buildPlaceholderExhibit } from './props/placeholder';
import { EXHIBITS, type Built } from './props/exhibits';
import { buildLoneCamera } from './props/cameras';

/**
 * Stations, laid out as an exhibition.
 *
 *      path
 *   ====|====      sign, low and angled, at the path edge
 *       |  /_
 *       |          gap
 *       |  [####]  exhibit, set back
 *
 * Two pieces per station. A label at the path edge (props/sign.ts) and the
 * object itself set back behind it with space around, so the sign never
 * occludes the exhibit and the exhibit never blocks the path.
 *
 * This file is layout and running order only. What each exhibit looks like
 * lives in props/ — one file per exhibit, registered in props/exhibits.ts,
 * with a placeholder pad standing in for everything not built yet.
 */

export type BuiltStations = Built;

export function buildStations(world: HyperWorld): Built {
  const out: Built = { objects: [], pois: [], watchers: [], tickers: [] };

  for (const s of STATIONS) {
    const { object, poi } = buildSign(world, s);
    out.objects.push(object);
    out.pois.push(poi);

    const lateral = Math.sign(s.lateral) * EXHIBIT_LATERAL;
    const at = placeAlongPath(units(s.at), units(lateral));
    const yaw = facePath(s.at, lateral);

    const custom = EXHIBITS[s.id];
    if (custom) custom(world, at, yaw, out);
    else out.objects.push(buildPlaceholderExhibit(world, at, yaw));
    world.compile();
  }

  // Cameras along the whole route, not only at the security station. Small and
  // easy to miss walking out; the intent is that you notice them coming back
  // and realise they have been following you the entire way.
  for (const [at, lateral] of SENTRIES) {
    const gv = placeAlongPath(units(at), units(lateral));
    const cam = buildLoneCamera(world, gv, facePath(at, lateral));
    out.objects.push(cam.object);
    out.watchers.push(cam.watcher);
  }

  return out;
}
