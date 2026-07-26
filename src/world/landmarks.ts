import { type HyperObject, type HyperWorld } from '../engine';
import { L } from '../content/i18n';
import { units, type Poi } from './placement';
import { buildChessTable } from './props/chess';
import { buildTriangle, triangleCenter } from './props/triangle';

/**
 * Things that live OFF the path.
 *
 * The stations make the argument; the landmarks are the personality. They sit
 * out on the lawn so that leaving the path is rewarded — the visitor who
 * wanders finds the chess table, and the visitor who crosses a painted line
 * eventually finds out what the line was.
 */

export interface Landmarks {
  objects: HyperObject[];
  pois: Poi[];
}

export function buildLandmarks(world: HyperWorld): Landmarks {
  const objects: HyperObject[] = [];
  const pois: Poi[] = [];

  // ---- the triangle with three right angles
  const triangle = buildTriangle(world);
  objects.push(...triangle.objects);
  pois.push(triangle.poi);

  // ---- the chess table, dead centre of the triangle: wander in past the
  // painted lines and there is a game waiting for you, already lost.
  const centre = triangleCenter();
  objects.push(buildChessTable(world, centre.gv, centre.yaw));
  pois.push({
    id: 'chess',
    title: L('Özcan – Carlsen, 1–0', 'Özcan – Carlsen, 1–0'),
    body: L(
      "Scholar's mate. Four moves. He never saw it coming. (Reconstruction; slightly aspirational.)",
      'Çoban matı. Dört hamle. Ne olduğunu anlayamadı bile. (Temsilîdir; biraz iyimserdir.)',
    ),
    gv: centre.gv,
    radius: units(5),
  });

  return { objects, pois };
}
