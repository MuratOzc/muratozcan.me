/**
 * Placement numbers shared between the world and the map of it.
 *
 * The architecture station's globe draws the world from the same tables the
 * world is built from, so anything it needs has to live somewhere both can
 * import. Putting these in world/stations.ts instead would close a cycle
 * through props/exhibits.ts.
 */

/** How far off the path centre line an exhibit stands, in authored units. */
export const EXHIBIT_LATERAL = 5.0;

/**
 * The lone cameras along the route, as [along, lateral] in authored units.
 *
 * Two only. Any more and they stop reading as a detail you missed and start
 * reading as set dressing. One near the start and one near the end means both
 * get passed twice.
 */
export const SENTRIES: Array<[number, number]> = [
  [13.0, -7.2],
  [51.0, 7.6],
];
