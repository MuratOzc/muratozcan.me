/**
 * Off-ring content — everything that is not the job.
 *
 * The ring holds the stack. The two hemispheres either side of it hold this:
 * links, hobbies, and things with no purpose at all.
 *
 * NOTE: almost everything below is a placeholder. The hobbies especially are
 * invented and should be replaced — they are the one part of this site that
 * cannot be derived from anything already known.
 */

export interface Marker {
  id: string;
  title: string;
  body: string;
  /** Compass bearing from spawn, radians. */
  bearing: number;
  /**
   * Geodesic distance from spawn. Under PI/2 puts it in the near hemisphere,
   * over PI/2 puts it beyond the ring on the way to the antipode.
   */
  distance: number;
  href?: string;
  kind: 'link' | 'hobby' | 'egg';
}

export const MARKERS: Marker[] = [
  // ---- links: near hemisphere, close to spawn so they are easy to find
  {
    id: 'github',
    title: 'GitHub',
    body: 'TODO: real handle.',
    bearing: 0.4,
    distance: 0.55,
    href: 'https://github.com/MuratOzc',
    kind: 'link',
  },
  {
    id: 'linkedin',
    title: 'LinkedIn',
    body: 'TODO: real URL.',
    bearing: 1.9,
    distance: 0.5,
    kind: 'link',
  },
  {
    id: 'email',
    title: 'Email',
    body: 'mr.muratozcan@gmail.com',
    bearing: 3.5,
    distance: 0.52,
    kind: 'link',
  },

  // ---- hobbies: PLACEHOLDER. These are guesses and should be replaced.
  {
    id: 'hobby-1',
    title: 'Hobby one',
    body: 'TODO: what do you actually do that is not this job?',
    bearing: 5.1,
    distance: 0.85,
    kind: 'hobby',
  },
  {
    id: 'hobby-2',
    title: 'Hobby two',
    body: 'TODO.',
    bearing: 2.6,
    distance: 0.95,
    kind: 'hobby',
  },

  // ---- easter eggs: deliberately far off the walked routes
  {
    id: 'egg-pole',
    title: '',
    body: 'You walked all the way out here. There is nothing. Well done.',
    bearing: 4.4,
    distance: 1.35,
    kind: 'egg',
  },
];
