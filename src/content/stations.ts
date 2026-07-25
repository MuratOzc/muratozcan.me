/**
 * The twelve stations along the path.
 *
 * `at` is distance from spawn in authored units; `lateral` is offset from the
 * path centre, negative left. The arch stands at 5 and the figure at 54.8, so
 * the stations run from 9 to 50.8 and leave a beat before you arrive back.
 *
 * `body` is placeholder throughout. Each one names what the paragraph has to
 * do rather than pretending to be it, so the walk can be paced and read for
 * rhythm before the real writing exists.
 */

export interface Station {
  n: number;
  id: string;
  title: string;
  /** Distance along the path from spawn, in units. */
  at: number;
  /** Perpendicular offset. Negative is left of the path. */
  lateral: number;
  /** What the finished object will be. */
  object: string;
  body: string;
}

const L = -3;
const R = 3;

export const STATIONS: Station[] = [
  {
    n: 1,
    id: 'title',
    title: 'The title problem',
    at: 9.0,
    lateral: L,
    object: 'signpost, nameplates crossed out, one blank',
    body: 'PLACEHOLDER — you run an entire technology organisation and have no word for it. Opens with the real question instead of a claim.',
  },
  {
    n: 2,
    id: 'origin',
    title: 'Maths and computers',
    at: 12.8,
    lateral: R,
    object: 'school desk, chalkboard behind, CRT on the desk',
    body: 'PLACEHOLDER — always good at both, for as long as you can remember, so mathematical engineering at Yıldız was a no-brainer.',
  },
  {
    n: 3,
    id: 'architecture',
    title: 'Architecture',
    at: 16.6,
    lateral: L,
    object: 'scale model of this world, on a table under a canopy',
    body: 'PLACEHOLDER — deciding the shape before it sets, and living with it afterwards.',
  },
  {
    n: 4,
    id: 'backend',
    title: 'Backend',
    at: 20.4,
    lateral: R,
    object: 'engine block on a concrete pad',
    body: 'PLACEHOLDER — .NET and C#. The application itself.',
  },
  {
    n: 5,
    id: 'frontend',
    title: 'Frontend',
    at: 24.2,
    lateral: L,
    object: 'a single monitor on a post, showing this site',
    body: 'PLACEHOLDER — the only layer anyone else ever sees.',
  },
  {
    n: 6,
    id: 'data',
    title: 'Data',
    at: 28.0,
    lateral: R,
    object: 'filing cabinets in ordered rows, drawers ajar',
    body: 'PLACEHOLDER — SQL and database administration. Schemas, queries, and the maintenance underneath them.',
  },
  {
    n: 7,
    id: 'infrastructure',
    title: 'Infrastructure',
    at: 31.8,
    lateral: L,
    object: 'open rack in the grass, cables into the earth',
    body: 'PLACEHOLDER — dedicated servers, Linux and Windows, administered by hand.',
  },
  {
    n: 8,
    id: 'networking',
    title: 'Networking',
    at: 35.6,
    lateral: R,
    object: 'telegraph poles, cables strung over the horizon',
    body: 'PLACEHOLDER — how the parts reach each other, and who else can.',
  },
  {
    n: 9,
    id: 'security',
    title: 'Security',
    at: 39.4,
    lateral: L,
    object: 'camera mast, one camera tracking you',
    body: 'PLACEHOLDER — the layer whose success looks like nothing happening. The cameras have been there since station one.',
  },
  {
    n: 10,
    id: 'delivery',
    title: 'Delivery',
    at: 43.2,
    lateral: R,
    object: 'aqueduct carrying crates',
    body: 'PLACEHOLDER — DevOps, CI/CD, deployments. The path from a commit to something running.',
  },
  {
    n: 11,
    id: 'operations',
    title: 'Production operations',
    at: 47.0,
    lateral: L,
    object: 'watchtower with dashboards',
    body: 'PLACEHOLDER — keeping it up. The pager is also you.',
  },
  {
    n: 12,
    id: 'contact',
    title: 'Contact',
    at: 50.8,
    lateral: R,
    object: 'mailbox and a signpost with the links',
    body: 'PLACEHOLDER — where to find you.',
  },
];
