import { BoxGeometry, Color, type BufferGeometry } from 'three';
import { HyperObject, type HyperWorld } from '../engine';
import { ANTIPODE, DOMAINS } from '../content/domains';
import { MARKERS } from '../content/personal';
import { pathYaw, placeAlongPath, type Poi } from './layout';

/**
 * Populates the world.
 *
 *   spawn ---[ arch ]--- path ------------------------------- you (antipode)
 *              rack        rack        rack        rack          |
 *         rack        rack       rack        rack        rack    |
 *
 * A single path runs from spawn all the way to the antipode, entered through
 * an arch. The ten layers of the stack alternate to either side of it. The
 * personal markers sit further out, off any route you would walk by accident.
 *
 * Flanking positions come from placeAlongPath, which holds a genuinely
 * constant perpendicular distance the whole way — see the note there about
 * why the obvious construction does not.
 *
 * Geometry is placeholder: boxes standing in for datacenter hardware.
 */

/** How far down the path the antipode sits. Short of PI, where Poincare diverges. */
const PATH_END = Math.PI - 0.04;
/** Perpendicular offset of the flanking racks. */
const RACK_LATERAL = 0.145;
/** Where the first and last racks sit along the path. */
const FIRST_RACK = 0.42;
const LAST_RACK = 2.72;

const RACK_LIGHT = new Color(0xc3ccd4);
const RACK_DARK = new Color(0x39434e);

function rackGeometry(depth: number): BufferGeometry {
  const h = 0.17 + depth * 0.10;
  const w = 0.085;
  const d = 0.05;
  const g = new BoxGeometry(w, h, d, 3, 14, 3);
  g.translate(0, h / 2, 0);
  return g;
}

function place(object: HyperObject, along: number, lateral: number): void {
  object.rotation.y = pathYaw(along, lateral);
}

export interface BuiltWorld {
  pois: Poi[];
  objects: HyperObject[];
}

export function buildWorld(world: HyperWorld): BuiltWorld {
  const pois: Poi[] = [];
  const objects: HyperObject[] = [];

  const add = (object: HyperObject) => {
    world.add(object);
    objects.push(object);
  };

  // ------------------------------------------------------------- the path
  // Flat slabs down the centre line. Without them there is no route to
  // follow and the racks read as scattered rather than lining something.
  const slabGeo = new BoxGeometry(0.11, 0.004, 0.05, 2, 1, 2);
  const SLAB_STEP = 0.055;
  for (let a = 0.06; a < PATH_END - 0.08; a += SLAB_STEP) {
    const slab = new HyperObject(placeAlongPath(a, 0));
    place(slab, a, 0);
    slab.addGeometry(world.shared, slabGeo, { color: 0x9099a1, ambient: 0.66 });
    add(slab);
  }

  // -------------------------------------------------------------- the arch
  // Sits just ahead of spawn so the path runs through the span.
  const ARCH_AT = 0.15;
  const arch = new HyperObject(placeAlongPath(ARCH_AT, 0));
  place(arch, ARCH_AT, 0);
  const postH = 0.27;
  const span = 0.115;
  for (const side of [-1, 1]) {
    const post = new BoxGeometry(0.022, postH, 0.022, 2, 10, 2);
    post.translate(side * span, postH / 2, 0);
    arch.addGeometry(world.shared, post, { color: 0xaeb7bf, ambient: 0.5 });
  }
  const lintel = new BoxGeometry(span * 2 + 0.05, 0.028, 0.032, 12, 2, 2);
  lintel.translate(0, postH + 0.014, 0);
  arch.addGeometry(world.shared, lintel, { color: 0xc6ced5, ambient: 0.52 });
  add(arch);
  pois.push({
    id: 'entrance',
    title: 'muratozcan.me',
    body: 'Walk straight. Everything is on this path, and it ends where it starts.',
    gv: placeAlongPath(ARCH_AT, 0),
    radius: 0.22,
  });

  // -------------------------------------------------- the stack, flanking
  DOMAINS.forEach((domain, i) => {
    const along = FIRST_RACK + (LAST_RACK - FIRST_RACK) * (i / (DOMAINS.length - 1));
    const lateral = (i % 2 === 0 ? -1 : 1) * RACK_LATERAL;
    const gv = placeAlongPath(along, lateral);
    const object = new HyperObject(gv);
    place(object, along, lateral);
    object.addGeometry(world.shared, rackGeometry(domain.depth), {
      color: RACK_LIGHT.clone().lerp(RACK_DARK, domain.depth * 0.7),
      ambient: 0.52,
    });
    add(object);
    pois.push({
      id: domain.id,
      title: domain.title,
      body: domain.blurb,
      gv,
      radius: 0.26,
    });
  });

  // --------------------------------------------------- off-path markers
  const markerGeo = new BoxGeometry(0.04, 0.10, 0.04, 2, 6, 2);
  markerGeo.translate(0, 0.05, 0);
  const eggGeo = new BoxGeometry(0.022, 0.022, 0.022, 1, 1, 1);
  eggGeo.translate(0, 0.011, 0);

  for (const m of MARKERS) {
    const gv = placeAlongPath(m.along, m.lateral);
    const object = new HyperObject(gv);
    place(object, m.along, m.lateral);
    object.addGeometry(world.shared, m.kind === 'egg' ? eggGeo : markerGeo, {
      color: m.kind === 'link' ? 0x5b9dd9 : m.kind === 'hobby' ? 0xd9a65b : 0x8b8b8b,
      ambient: 0.55,
    });
    add(object);
    pois.push({
      id: m.id,
      title: m.title,
      body: m.body,
      gv,
      radius: m.kind === 'egg' ? 0.13 : 0.24,
    });
  }

  // -------------------------------------------------------- the antipode
  const antipodeGV = placeAlongPath(PATH_END, 0);
  const antipode = new HyperObject(antipodeGV);
  place(antipode, PATH_END, 0);
  const h = 0.42;
  const g = new BoxGeometry(0.06, h, 0.06, 4, 30, 4);
  g.translate(0, h / 2, 0);
  antipode.addGeometry(world.shared, g, { color: 0x2f4f8f, ambient: 0.45 });
  add(antipode);
  pois.push({
    id: ANTIPODE.id,
    title: ANTIPODE.title,
    body: ANTIPODE.blurb,
    gv: antipodeGV,
    radius: 0.45,
  });

  return { pois, objects };
}
