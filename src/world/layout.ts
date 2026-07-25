import { BoxGeometry, Color, Vector3 } from 'three';
import {
  GyroVector,
  HyperObject,
  type HyperWorld,
  geodesicTranslate,
} from '../engine';
import { ANTIPODE, DOMAINS, type Domain } from '../content/domains';

/**
 * Laying the stack out in the world.
 *
 * The descent runs along a single geodesic from spawn toward the antipode.
 * Depth 0 (frontend) sits just ahead of you; depth 1 (bare metal) sits near the
 * far end. Walking one direction takes you down through every layer.
 *
 * The antipode itself is reserved. It is the one point visible from everywhere
 * in a spherical world, at every moment, from any direction — so it holds the
 * thing every layer terminates at rather than another layer.
 *
 * Domains alternate to either side of the path so you walk between them instead
 * of into them.
 */

/** Geodesic distance from spawn to the shallowest domain. */
export const PATH_START = 0.5;
/** ...and to the deepest. Kept short of PI so the antipode stays clear. */
export const PATH_END = 2.7;
/** Lateral offset from the path, alternating side to side. */
const LATERAL = 0.16;

const SURFACE_COLOR = new Color(0xd8d0bd);
const DEEP_COLOR = new Color(0x39424e);

export function domainDistance(depth: number): number {
  return PATH_START + (PATH_END - PATH_START) * depth;
}

export function domainPlacement(depth: number, index: number): GyroVector {
  const side = index % 2 === 0 ? -1 : 1;
  return GyroVector.fromGeodesic(
    new Vector3(0, 0, -1),
    domainDistance(depth),
  ).translate(geodesicTranslate(new Vector3(side * LATERAL, 0, 0)));
}

function monolith(domain: Domain): BoxGeometry {
  // Deeper layers are heavier and taller. At eye height 0.1 the deepest of
  // these stands about 4.5x a person, which is tall enough that the
  // horospherical bow on its verticals is plainly visible.
  const h = 0.16 + domain.depth * 0.30;
  const w = 0.05 + domain.depth * 0.035;
  const g = new BoxGeometry(w, h, w, 4, Math.round(10 + domain.depth * 22), 4);
  g.translate(0, h / 2, 0);
  return g;
}

export interface PlacedDomain {
  domain: Domain;
  object: HyperObject;
  distance: number;
}

export function buildStack(world: HyperWorld): PlacedDomain[] {
  const placed: PlacedDomain[] = [];

  DOMAINS.forEach((domain, i) => {
    const object = new HyperObject(domainPlacement(domain.depth, i));
    object.addGeometry(world.shared, monolith(domain), {
      color: SURFACE_COLOR.clone().lerp(DEEP_COLOR, domain.depth),
      ambient: 0.5 - domain.depth * 0.12,
    });
    world.add(object);
    placed.push({ domain, object, distance: domainDistance(domain.depth) });
  });

  return placed;
}

/**
 * The antipode marker.
 *
 * Sits a hair short of PI because the Poincare radius is infinite exactly at
 * the antipode. The far-hemisphere pass maps it back to a sane magnitude.
 */
export function buildAntipode(world: HyperWorld): HyperObject {
  const h = 0.55;
  const g = new BoxGeometry(0.07, h, 0.07, 5, 40, 5);
  g.translate(0, h / 2, 0);
  const object = new HyperObject(
    GyroVector.fromGeodesic(new Vector3(0, 0, -1), Math.PI - 0.04),
  );
  object.addGeometry(world.shared, g, { color: 0x2f4f8f, ambient: 0.42 });
  world.add(object);
  return object;
}

export { ANTIPODE };
