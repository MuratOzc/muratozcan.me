import { type HyperObject, type HyperWorld } from '../engine';
import { L } from '../content/i18n';
import { units, type Poi } from './placement';
import { buildChessTable } from './props/chess';
import { buildEasels } from './props/easels';
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
  if (triangle.poi) {
    pois.push(triangle.poi);
  }

  // ---- the chess table, dead centre of the triangle: wander in past the
  // painted lines and there is a game waiting for you, already lost.
  const centre = triangleCenter();
  objects.push(buildChessTable(world, centre.gv, centre.yaw));
  pois.push({
    id: 'chess',
    title: L('Özcan 1 – 0 Carlsen', 'Özcan 1 - 0 Carlsen'),
    body: L(
      'July 2024, private match. Four moves, and Magnus was brought down a notch even before he worked out what had happened. It was right here on this 270° triangle. Sadly, there were no witnesses. (Long story short, I like chess.)',
      'Temmuz 2024, Özel maç. 4 hamlede Magnus’un tüm karizması ne olduğunu anlayamadan çizildi. Ben de zevkten üç köşe oldum (zemindeki 270° üçgen gibi). Tabi maalesef tanık olan kimse yoktu. (Uzun lafın kısası, satrancı severim)',
    ),
    gv: centre.gv,
    radius: units(5),
  });

  // ---- the easels, ringed around the left pole: the exact mirror of the chess
  // table on the right one. The path argues that the job is the whole person;
  // these are there to disagree.
  const easels = buildEasels(world);
  objects.push(...easels.objects);
  pois.push(easels.poi);

  return { objects, pois };
}
