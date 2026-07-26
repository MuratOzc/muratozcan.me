/**
 * The stations along the path.
 *
 * Positions are DERIVED, not written down. Give the list an order and it
 * spreads evenly between FIRST_AT and LAST_AT, alternating sides. Add or
 * remove a station and everything respaces itself — which matters, because
 * the running order has already changed twice.
 *
 * The arch stands at 5 and the figure at 54.8, so the run from 9 to 50.8
 * leaves a beat at each end.
 *
 * `body` is placeholder throughout. Each names what its paragraph has to do
 * rather than pretending to be it, so the walk can be paced and read for
 * rhythm before the real writing exists.
 */

/** Distance along the path, in units, of the first and last stations. */
const FIRST_AT = 9.0;
const LAST_AT = 50.8;
/** How far off the path centre line the stations sit. */
const LATERAL = 3;

export interface Station {
  n: number;
  id: string;
  title: string;
  /** Distance along the path from spawn, in units. Derived. */
  at: number;
  /** Perpendicular offset. Negative is left of the path. Derived. */
  lateral: number;
  /** What the finished object will be. */
  object: string;
  body: string;
}

type StationDef = Pick<Station, 'id' | 'title' | 'object' | 'body'>;

const DEFS: StationDef[] = [
  {
    id: 'title',
    title: 'The title problem',
    object: 'signpost, nameplates crossed out, one blank',
    body: 'PLACEHOLDER — you run an entire technology organisation and have no word for it. Opens with the real question instead of a claim.',
  },
  {
    id: 'origin',
    title: 'Maths and computers',
    object: 'school desk, chalkboard behind, CRT on the desk',
    body: 'PLACEHOLDER — always good at both, for as long as you can remember, so mathematical engineering at Yıldız was a no-brainer.',
  },
  {
    id: 'architecture',
    title: 'Architecture',
    object: 'scale model of this world, on a table under a canopy',
    body: 'PLACEHOLDER — deciding the shape before it sets, and living with it afterwards.',
  },
  {
    id: 'backend',
    title: 'Backend',
    object: 'engine block on a concrete pad',
    body: 'PLACEHOLDER — .NET and C#. The application itself.',
  },
  {
    id: 'frontend',
    title: 'Frontend',
    object: 'a single monitor on a post, showing this site',
    body: 'PLACEHOLDER — the only layer anyone else ever sees.',
  },
  {
    id: 'data',
    title: 'Data',
    object: 'filing cabinets in ordered rows, drawers ajar',
    body: 'PLACEHOLDER — SQL and database administration. Schemas, queries, and the maintenance underneath them.',
  },
  {
    id: 'infrastructure',
    title: 'Infrastructure',
    object: 'open rack in the grass, cables into the earth',
    body: 'PLACEHOLDER — dedicated servers, Linux and Windows, administered by hand.',
  },
  {
    id: 'security',
    title: 'Security',
    object: 'camera mast, one camera tracking you',
    body: 'PLACEHOLDER — the layer whose success looks like nothing happening. The cameras have been there since station one.',
  },
  {
    id: 'operations',
    title: 'Production operations',
    object: 'watchtower with dashboards',
    body: 'PLACEHOLDER — keeping it up. The pager is also you.',
  },
  {
    id: 'contact',
    title: 'Contact',
    object: 'mailbox and a signpost with the links',
    body: 'PLACEHOLDER — where to find you.',
  },
];

export const STATIONS: Station[] = DEFS.map((d, i) => ({
  ...d,
  n: i + 1,
  at:
    DEFS.length === 1
      ? FIRST_AT
      : FIRST_AT + (LAST_AT - FIRST_AT) * (i / (DEFS.length - 1)),
  lateral: i % 2 === 0 ? -LATERAL : LATERAL,
}));

/** Gap between consecutive stations, in units. Useful for sanity checks. */
export const STATION_SPACING =
  DEFS.length > 1 ? (LAST_AT - FIRST_AT) / (DEFS.length - 1) : 0;
