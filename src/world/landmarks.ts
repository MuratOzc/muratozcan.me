import { type HyperObject, type HyperWorld } from '../engine';
import { L } from '../content/i18n';
import { facePath, placeAlongPath, units, type Poi } from './placement';
import { buildChessTable } from './props/chess';
import { buildTriangle } from './props/triangle';

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

/** The chess table's spot: left lawn, between the backend and frontend bays. */
const CHESS_AT = 24.5;
const CHESS_LATERAL = -9;

export function buildLandmarks(world: HyperWorld): Landmarks {
  const objects: HyperObject[] = [];
  const pois: Poi[] = [];

  // ---- the chess table
  const chessGV = placeAlongPath(units(CHESS_AT), units(CHESS_LATERAL));
  objects.push(buildChessTable(world, chessGV, facePath(CHESS_AT, CHESS_LATERAL)));
  pois.push({
    id: 'chess',
    title: L('Özcan – Carlsen, 1–0', 'Özcan – Carlsen, 1–0'),
    body: L(
      "Scholar's mate. Four moves. He never saw it coming. (Reconstruction; slightly aspirational.)",
      'Çoban matı. Dört hamle. Ne olduğunu anlayamadı bile. (Temsilîdir; biraz iyimserdir.)',
    ),
    gv: chessGV,
    radius: units(5),
  });

  // ---- the triangle with three right angles
  const triangle = buildTriangle(world);
  objects.push(...triangle.objects);
  pois.push(triangle.poi);

  return { objects, pois };
}
