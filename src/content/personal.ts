/**
 * Off-path content — everything that is not the job.
 *
 * The path holds the stack. Either side of it, further out, sits this: links,
 * hobbies, and things with no purpose at all.
 *
 * Positions are (along, lateral): distance travelled down the path from spawn,
 * and perpendicular offset, negative left and positive right.
 *
 * NOTE: the hobbies are invented placeholders. They are the one part of this
 * site that cannot be derived from anything already known.
 */

export interface Marker {
  id: string;
  title: string;
  body: string;
  /** Arc travelled down the path from spawn, radians. */
  along: number;
  /** Perpendicular offset from the path, radians. Negative is left. */
  lateral: number;
  href?: string;
  kind: 'link' | 'hobby' | 'egg';
}

export const MARKERS: Marker[] = [
  // ---- links: just off the path near the start, easy to stumble into
  {
    id: 'github',
    title: 'GitHub',
    body: 'TODO: confirm the handle.',
    along: 0.55,
    lateral: -0.42,
    href: 'https://github.com/MuratOzc',
    kind: 'link',
  },
  {
    id: 'linkedin',
    title: 'LinkedIn',
    body: 'TODO: real URL.',
    along: 0.9,
    lateral: 0.46,
    kind: 'link',
  },
  {
    id: 'email',
    title: 'Email',
    body: 'mr.muratozcan@gmail.com',
    along: 0.3,
    lateral: 0.38,
    kind: 'link',
  },

  // ---- hobbies: PLACEHOLDER, needs replacing
  {
    id: 'hobby-1',
    title: 'Hobby one',
    body: 'TODO: what do you do that is not this job?',
    along: 1.6,
    lateral: -0.55,
    kind: 'hobby',
  },
  {
    id: 'hobby-2',
    title: 'Hobby two',
    body: 'TODO.',
    along: 2.2,
    lateral: 0.5,
    kind: 'hobby',
  },

  // ---- easter eggs: well off any route anyone would walk by accident
  {
    id: 'egg-far',
    title: '',
    body: 'You came all the way out here. There is nothing. Well done.',
    along: 1.2,
    lateral: -1.15,
    kind: 'egg',
  },
];
