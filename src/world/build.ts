import { BoxGeometry, Color, type BufferGeometry } from 'three';
import { HyperObject, type HyperWorld } from '../engine';
import { ANTIPODE, DOMAINS } from '../content/domains';
import { MARKERS } from '../content/personal';
import {
  placeAtAntipode,
  placeOnGround,
  ringBearing,
  RING_DISTANCE,
  type Poi,
} from './layout';

/**
 * Populates the world.
 *
 * Geometry here is placeholder — boxes standing in for datacenter hardware
 * until real models are in. What matters at this stage is that the spatial
 * structure is right: the ring at a uniform quarter turn, the personal markers
 * scattered across the near hemisphere, and the antipode reserved.
 */

const RACK_FRONT = new Color(0x2a3138);
const RACK_SURFACE = new Color(0xb9c2c9);

function rack(depth: number): BufferGeometry {
  // A cabinet. Taller and deeper as you descend the stack.
  const h = 0.16 + depth * 0.14;
  const w = 0.07;
  const d = 0.04 + depth * 0.02;
  const g = new BoxGeometry(w, h, d, 3, 14, 3);
  g.translate(0, h / 2, 0);
  return g;
}

export interface BuiltWorld {
  pois: Poi[];
  objects: HyperObject[];
}

export function buildWorld(world: HyperWorld): BuiltWorld {
  const pois: Poi[] = [];
  const objects: HyperObject[] = [];

  // ---------------------------------------------------------------- the ring
  DOMAINS.forEach((domain, i) => {
    const bearing = ringBearing(i, DOMAINS.length);
    const gv = placeOnGround(bearing, RING_DISTANCE);
    const object = new HyperObject(gv);
    // Rotate in the object's own Unit frame so the cabinet stands tangent to
    // the ring. This is a Three-level rotation, applied before the lift, which
    // is why it behaves like an ordinary local rotation.
    object.rotation.y = -bearing;
    object.addGeometry(world.shared, rack(domain.depth), {
      color: RACK_SURFACE.clone().lerp(RACK_FRONT, domain.depth * 0.55),
      ambient: 0.52,
    });
    world.add(object);
    objects.push(object);
    pois.push({
      id: domain.id,
      title: domain.title,
      body: domain.blurb,
      gv,
      radius: 0.3,
    });
  });

  // ------------------------------------------------------- off-ring markers
  const markerGeo = new BoxGeometry(0.035, 0.09, 0.035, 2, 6, 2);
  markerGeo.translate(0, 0.045, 0);
  const eggGeo = new BoxGeometry(0.02, 0.02, 0.02, 1, 1, 1);
  eggGeo.translate(0, 0.01, 0);

  for (const m of MARKERS) {
    const gv = placeOnGround(m.bearing, m.distance);
    const object = new HyperObject(gv);
    object.addGeometry(world.shared, m.kind === 'egg' ? eggGeo : markerGeo, {
      color: m.kind === 'link' ? 0x5b9dd9 : m.kind === 'hobby' ? 0xd9a65b : 0x8b8b8b,
      ambient: 0.55,
    });
    world.add(object);
    objects.push(object);
    pois.push({
      id: m.id,
      title: m.title,
      body: m.body,
      gv,
      radius: m.kind === 'egg' ? 0.12 : 0.22,
    });
  }

  // ------------------------------------------------------------- the antipode
  const antipodeGV = placeAtAntipode();
  const antipode = new HyperObject(antipodeGV);
  const h = 0.42;
  const g = new BoxGeometry(0.06, h, 0.06, 4, 30, 4);
  g.translate(0, h / 2, 0);
  antipode.addGeometry(world.shared, g, { color: 0x2f4f8f, ambient: 0.45 });
  world.add(antipode);
  objects.push(antipode);
  pois.push({
    id: ANTIPODE.id,
    title: ANTIPODE.title,
    body: ANTIPODE.blurb,
    gv: antipodeGV,
    radius: 0.45,
  });

  return { pois, objects };
}
