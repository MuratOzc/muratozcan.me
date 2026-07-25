/**
 * The content model.
 *
 * This site is not a list of projects. Most of the work is a running company's
 * technology — infrastructure, operations, decisions — not shippable public
 * artifacts. What there IS to show is the stack itself, and the fact that one
 * person is all of it.
 *
 * So the unit of content is a DOMAIN: one layer of responsibility. Each domain
 * is simultaneously a page and a place. `depth` orders them from the surface
 * (what a user touches) down to bare metal, and that ordering becomes a walk
 * through the world — see placement in world/layout.ts.
 */

export interface Domain {
  /** URL slug and stable id. */
  id: string;
  /** Short label, used in-world. */
  title: string;
  /** One line. Shown on the landing page and as you approach in-world. */
  blurb: string;
  /**
   * Position in the stack, 0 = surface, 1 = bare metal. Drives both the
   * ordering on the page and the geodesic distance from spawn in the world.
   */
  depth: number;
  /** Concrete things, for the detail page. Keep these honest and specific. */
  points: string[];
  /** Primary tools. */
  stack: string[];
}

export const DOMAINS: Domain[] = [
  {
    id: 'frontend',
    title: 'Frontend',
    blurb: 'The only layer anyone else ever sees.',
    depth: 0.0,
    points: [],
    stack: [],
  },
  {
    id: 'backend',
    title: 'Backend',
    blurb: 'The application itself. .NET and C#.',
    depth: 0.11,
    points: [],
    stack: ['.NET', 'C#'],
  },
  {
    id: 'architecture',
    title: 'Software architecture',
    blurb: 'Deciding the shape before it sets.',
    depth: 0.22,
    points: [],
    stack: [],
  },
  {
    id: 'data',
    title: 'Data',
    blurb: 'Schemas, queries, and the administration underneath them.',
    depth: 0.33,
    points: [],
    stack: ['SQL'],
  },
  {
    id: 'cicd',
    title: 'CI/CD',
    blurb: 'The path from a commit to something running.',
    depth: 0.44,
    points: [],
    stack: [],
  },
  {
    id: 'operations',
    title: 'Production operations',
    blurb: 'Keeping it up. The pager is also me.',
    depth: 0.55,
    points: [],
    stack: [],
  },
  {
    id: 'security',
    title: 'Security',
    blurb: 'The layer whose success looks like nothing happening.',
    depth: 0.66,
    points: [],
    stack: [],
  },
  {
    id: 'networking',
    title: 'Networking',
    blurb: 'How the parts reach each other, and who else can.',
    depth: 0.77,
    points: [],
    stack: [],
  },
  {
    id: 'systems',
    title: 'Systems administration',
    blurb: 'Linux and Windows, configured and maintained by hand.',
    depth: 0.88,
    points: [],
    stack: ['Linux', 'Windows Server'],
  },
  {
    id: 'metal',
    title: 'Dedicated servers',
    blurb: 'Actual machines. The bottom of the stack.',
    depth: 1.0,
    points: [],
    stack: [],
  },
];

/**
 * The through-line, not a layer.
 *
 * Technology strategy and technical product decisions do not sit at a depth —
 * they run the whole height of the stack. In the world this occupies the
 * antipode: the point visible from everywhere, which every descent arrives at.
 */
export const ANTIPODE = {
  id: 'me',
  title: 'Murat Özcan',
  blurb: 'Mathematical engineer. Every layer above terminates here.',
  detail:
    'Technology strategy and technical product decisions are not a layer of ' +
    'the stack — they run its whole height. So does the person making them.',
} as const;
