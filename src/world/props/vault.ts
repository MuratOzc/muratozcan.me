import {
  CylinderGeometry,
  PlaneGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';
import { merge } from '../geometry';
import { makeTextTexture } from '../text';

/**
 * Security, minor exhibits: what stands beside the camera mast.
 *
 * A safe with `.env` stencilled on the door — the file that stays in the
 * safe — and a barbed-wire perimeter around the whole station. The wire is
 * waist-high and sparse: it would stop nobody, which is accurate, because the
 * cameras already saw you coming.
 */

/** Half-extent of the fenced square, centred on the mast. */
const FENCE = 2.1;
const WIRE_HEIGHTS = [0.42, 0.72, 1.02];

function buildFence(): { posts: BufferGeometry; wire: BufferGeometry } {
  const posts: BufferGeometry[] = [];
  const wire: BufferGeometry[] = [];

  // Posts: corners and mid-spans.
  const postSpots: Array<[number, number]> = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) postSpots.push([sx * FENCE, sz * FENCE]);
  }
  for (const s of [-1, 1]) {
    postSpots.push([s * FENCE, 0]);
    postSpots.push([0, s * FENCE]);
  }
  for (const [x, z] of postSpots) {
    const post = new CylinderGeometry(0.028, 0.036, 1.18, 10);
    post.translate(x, 0.59, z);
    posts.push(post);
  }

  // Wires: three strands per side, plus barbs twisted onto the top strand.
  for (const [axis, fixed] of [['x', -1], ['x', 1], ['z', -1], ['z', 1]] as const) {
    for (const y of WIRE_HEIGHTS) {
      const strand = new CylinderGeometry(0.011, 0.011, FENCE * 2, 6);
      if (axis === 'x') {
        strand.rotateZ(Math.PI / 2);
        strand.translate(0, y, fixed * FENCE);
      } else {
        strand.rotateX(Math.PI / 2);
        strand.translate(fixed * FENCE, y, 0);
      }
      wire.push(strand);
    }
    // Barbs: little crossed spikes along the top wire.
    const yTop = WIRE_HEIGHTS[WIRE_HEIGHTS.length - 1];
    for (let i = -3; i <= 3; i++) {
      const along = (i / 3.5) * FENCE;
      for (const tilt of [Math.PI / 4, -Math.PI / 4]) {
        const barb = new CylinderGeometry(0.005, 0.001, 0.085, 5);
        if (axis === 'x') {
          barb.rotateX(tilt);
          barb.translate(along, yTop, fixed * FENCE);
        } else {
          barb.rotateZ(tilt);
          barb.translate(fixed * FENCE, yTop, along);
        }
        wire.push(barb);
      }
    }
  }

  return { posts: merge(posts), wire: merge(wire) };
}

export function buildVault(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): HyperObject {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  // ---- concrete pad, so the safe sits on something poured, not on grass.
  const pad = new RoundedBoxGeometry(1.1, 0.1, 1.1, 2, 0.02);
  pad.translate(1.15, 0.05, 0.1);
  object.addGeometry(world.shared, pad, { color: 0xaaa9a2, ambient: 0.6 });

  // ---- the safe: rounded body, proud door, spoked wheel, stencilled label.
  // Turned a few degrees toward the path so the door catches the eye.
  const SAFE_X = 1.15;
  const SAFE_Z = 0.1;
  const TURN = -0.22;

  const body = new RoundedBoxGeometry(0.68, 0.8, 0.64, 3, 0.035);
  body.translate(0, 0.5, 0);
  const door = new RoundedBoxGeometry(0.54, 0.64, 0.05, 2, 0.02);
  door.translate(0, 0.52, 0.315);
  const hinge = new CylinderGeometry(0.022, 0.022, 0.56, 8);
  hinge.translate(-0.3, 0.52, 0.31);

  const wheelRing = new TorusGeometry(0.075, 0.014, 8, 18);
  wheelRing.translate(0.08, 0.46, 0.36);
  const hub = new CylinderGeometry(0.02, 0.02, 0.06, 10);
  hub.rotateX(Math.PI / 2);
  hub.translate(0.08, 0.46, 0.355);
  const spokes: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const spoke = new CylinderGeometry(0.009, 0.009, 0.15, 6);
    spoke.rotateZ((i / 3) * Math.PI);
    spoke.translate(0.08, 0.46, 0.36);
    spokes.push(spoke);
  }

  const steel = merge([body, door, hinge]);
  steel.rotateY(TURN);
  steel.translate(SAFE_X, 0.1, SAFE_Z);
  object.addGeometry(world.shared, steel, { color: 0x555c66, ambient: 0.48 });

  const brass = merge([wheelRing, hub, ...spokes]);
  brass.rotateY(TURN);
  brass.translate(SAFE_X, 0.1, SAFE_Z);
  object.addGeometry(world.shared, brass, { color: 0xc9cdd4, ambient: 0.55 });

  const label = new PlaneGeometry(0.3, 0.11, 1, 1);
  label.translate(-0.06, 0.68, 0.345);
  label.rotateY(TURN);
  label.translate(SAFE_X, 0.1, SAFE_Z);
  object.addGeometry(world.shared, label, {
    map: makeTextTexture('.env', { color: '#e8edf2', width: 512, height: 192 }),
    color: 0xffffff,
    ambient: 0.9,
    alphaTest: 0.3,
    alphaBlend: true,
    castShadow: false,
    receiveShadow: false,
  });

  // ---- the perimeter.
  const fence = buildFence();
  object.addGeometry(world.shared, fence.posts, { color: 0x8b9199, ambient: 0.5 });
  object.addGeometry(world.shared, fence.wire, { color: 0xb9bfc7, ambient: 0.52 });

  world.add(object);
  return object;
}
