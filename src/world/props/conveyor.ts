import {
  CylinderGeometry,
  Group,
  PlaneGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  HyperObject,
  type GyroVector,
  type HyperMaterial,
  type HyperWorld,
} from '../../engine';
import { makeTextTexture } from '../text';

/**
 * Station 9: shipping — a conveyor that builds, tests and ships, on a loop.
 *
 * Three stages in the order the sign names them. The press at BUILD comes down
 * every two seconds and a crate exists where it lifts from. The crate rides to
 * TEST, the gate lamp goes green, and it goes through the hatch marked PROD.
 * Every ninth crate fails instead: red lamp, the ram shoves it off the belt,
 * and it tumbles down the chute into the bin. Then the next one comes, exactly
 * on time, because that is the entire point of a pipeline.
 *
 * The belt is a real loop, not a sliding texture. Cleats ride a closed path of
 * two straight runs and two half-wraps around the drums — `beltPoint` returns
 * the position and the outward angle for any arc length, so a cleat leaving the
 * top run wraps under and comes back without ever being recycled. There is no
 * seam to hide because the path has no ends.
 *
 * Everything animated is read off one clock as a function of time rather than
 * integrated per frame, so the press, the crates and the drums cannot drift out
 * of step with each other over a long session.
 */

/** Belt speed, authored units per second. About half a metre a second. */
const SPEED = 0.3;
/** Seconds between press strokes. One crate per stroke. */
const INTERVAL = 2.0;
/** Crates in the pool. Interval * POOL must exceed the longest crate life. */
const POOL = 6;
/** One crate in this many fails its test. */
const FAIL_EVERY = 9;

/** Drum centres, and the belt's outer surface radius around them. */
const DRUM_X = 1.51;
const DRUM_Y = 0.71;
const BELT_R = 0.104;
const BELT_W = 0.44;
/** Where a crate's underside sits. */
const BELT_TOP = DRUM_Y + BELT_R;

const X_BUILD = -1.05;
const X_TEST = 0.05;
const X_DIVERT = 0.55;
const X_WALL = 1.35;
/** Past this the crate is behind the PROD wall and can be recycled. */
const X_GONE = 1.62;

const CRATE_W = 0.3;
const CRATE_H = 0.24;
const CRATE_D = 0.34;
const CRATE_Y = BELT_TOP + CRATE_H / 2;

const PRESS_UP = 1.44;
const PRESS_DOWN = 1.12;

/** Straight run between drum centres, and the full loop length. */
const RUN = DRUM_X * 2;
const LOOP = RUN * 2 + 2 * Math.PI * BELT_R;
const CLEATS = 18;

const LAMP_IDLE = 0x4a5056;
const LAMP_PASS = 0x5fe08a;
const LAMP_FAIL = 0xff5a4d;

const STEEL = 0xb4bcc4;
const DARK_STEEL = 0x7d858d;
const RUBBER = 0x3f4348;

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/**
 * A point on the belt loop, by arc length.
 *
 * `phi` is the angle of the outward surface normal, which on the straight runs
 * degenerates to +-PI/2 and on the wraps sweeps continuously between them. The
 * tangent is always (sin phi, -cos phi), so one expression carries a cleat all
 * the way round.
 */
function beltPoint(s: number, out: Vector3): number {
  const t = ((s % LOOP) + LOOP) % LOOP;
  const wrap = Math.PI * BELT_R;

  if (t < RUN) {
    out.set(-DRUM_X + t, DRUM_Y + BELT_R, 0);
    return Math.PI / 2;
  }
  if (t < RUN + wrap) {
    const phi = Math.PI / 2 - (t - RUN) / BELT_R;
    out.set(DRUM_X + Math.cos(phi) * BELT_R, DRUM_Y + Math.sin(phi) * BELT_R, 0);
    return phi;
  }
  if (t < RUN * 2 + wrap) {
    out.set(DRUM_X - (t - RUN - wrap), DRUM_Y - BELT_R, 0);
    return -Math.PI / 2;
  }
  const phi = -Math.PI / 2 - (t - RUN * 2 - wrap) / BELT_R;
  out.set(-DRUM_X + Math.cos(phi) * BELT_R, DRUM_Y + Math.sin(phi) * BELT_R, 0);
  return phi;
}

/** The press stroke, as a fraction of the way down, over one interval. */
function pressDrop(u: number): number {
  if (u < 0.25) return ease(u / 0.25);
  if (u < 0.4) return 1;
  if (u < 0.7) return 1 - ease((u - 0.4) / 0.3);
  return 0;
}
/** Mid-dwell: the moment the crate exists. */
const SPAWN_U = 0.32;

interface Crate {
  node: Group;
  /** Which slot of the pool, which fixes its spawn time within a period. */
  slot: number;
}

export interface ConveyorResult {
  object: HyperObject;
  tick: (worldGV: GyroVector, dt: number) => void;
}

function labelPlate(
  world: HyperWorld,
  object: HyperObject,
  text: string,
  w: number,
  h: number,
  place: (g: PlaneGeometry) => void,
): void {
  const plate = new PlaneGeometry(w, h, 3, 1);
  place(plate);
  object.addGeometry(world.shared, plate, {
    map: makeTextTexture(text, { width: 512, height: 160, color: '#22282e', letterSpacing: 8 }),
    color: 0xffffff,
    ambient: 0.92,
    alphaTest: 0.3,
    castShadow: false,
    receiveShadow: false,
  });
}

export function buildConveyor(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): ConveyorResult {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  // ---------------- paving. Wide enough to carry the reject bin, which sits
  // off the front of the machine where you can see into it.
  const pad = new RoundedBoxGeometry(4.0, 0.1, 2.0, 10, 0.02);
  pad.translate(0, 0.05, 0.2);
  object.addGeometry(world.shared, pad, { color: 0xb0aea6, ambient: 0.62 });

  // ---------------- the conveyor frame: two side rails, four legs, feet.
  const frame: BufferGeometry[] = [];
  for (const sz of [-1, 1]) {
    const rail = new RoundedBoxGeometry(3.34, 0.1, 0.05, 4, 0.012);
    rail.translate(0, DRUM_Y, sz * 0.25);
    frame.push(rail);
    for (const lx of [-1.25, 1.25]) {
      const leg = new RoundedBoxGeometry(0.07, 0.62, 0.07, 2, 0.014);
      leg.translate(lx, 0.41, sz * 0.25);
      frame.push(leg);
      const foot = new RoundedBoxGeometry(0.16, 0.03, 0.16, 1, 0.008);
      foot.translate(lx, 0.115, sz * 0.25);
      frame.push(foot);
    }
    // A brace between each pair of legs, so the frame reads as built rather
    // than as four sticks holding a plank up.
    const brace = new RoundedBoxGeometry(2.5, 0.05, 0.04, 3, 0.01);
    brace.translate(0, 0.24, sz * 0.25);
    frame.push(brace);
  }
  object.addGeometry(world.shared, mergeGeometries(frame), {
    color: STEEL,
    ambient: 0.52,
  });

  // ---------------- the belt: two flat runs and a wrap round each drum.
  const belt: BufferGeometry[] = [];
  for (const sy of [1, -1]) {
    const run = new RoundedBoxGeometry(RUN, 0.014, BELT_W, 6, 0.004);
    run.translate(0, DRUM_Y + sy * (BELT_R - 0.007), 0);
    belt.push(run);
  }
  for (const sx of [-1, 1]) {
    const round = new CylinderGeometry(BELT_R, BELT_R, BELT_W, 22);
    round.rotateX(Math.PI / 2);
    round.translate(sx * DRUM_X, DRUM_Y, 0);
    belt.push(round.toNonIndexed());
  }
  object.addGeometry(world.shared, mergeGeometries(belt), {
    color: RUBBER,
    ambient: 0.44,
  });

  // ---------------- the drums. Their end caps stand proud of the rails, with a
  // radial rib on each, because a smooth drum buried in a belt shows no motion
  // at all and the whole exhibit depends on being obviously in motion.
  const drums: Group[] = [];
  for (const sx of [-1, 1]) {
    const node = new Group();
    node.position.set(sx * DRUM_X, DRUM_Y, 0);
    object.add(node);
    drums.push(node);

    const parts: BufferGeometry[] = [];
    const barrel = new CylinderGeometry(0.088, 0.088, 0.64, 18);
    barrel.rotateX(Math.PI / 2);
    parts.push(barrel.toNonIndexed());
    for (const sz of [-1, 1]) {
      const cap = new CylinderGeometry(0.105, 0.105, 0.03, 18);
      cap.rotateX(Math.PI / 2);
      cap.translate(0, 0, sz * 0.325);
      parts.push(cap.toNonIndexed());
      const rib = new RoundedBoxGeometry(0.026, 0.19, 0.034, 1, 0.008);
      rib.translate(0, 0.05, sz * 0.342);
      parts.push(rib);
    }
    object.addGeometry(world.shared, mergeGeometries(parts), {
      color: DARK_STEEL,
      ambient: 0.5,
    }, node);
  }

  // ---------------- the cleats, riding the loop. No shadow twin: they are
  // 5mm bars and the depth pass has better things to do.
  const cleatGeo = new RoundedBoxGeometry(0.055, 0.018, BELT_W - 0.03, 1, 0.005);
  cleatGeo.translate(0, 0.009, 0);
  const cleats: Group[] = [];
  for (let i = 0; i < CLEATS; i++) {
    const node = new Group();
    object.add(node);
    cleats.push(node);
    object.addGeometry(
      world.shared,
      cleatGeo,
      { color: 0x565c62, ambient: 0.46, castShadow: false },
      node,
    );
  }

  // ---------------- BUILD: a gantry and a press that strokes once per crate.
  const gantry: BufferGeometry[] = [];
  for (const sz of [-1, 1]) {
    const upright = new RoundedBoxGeometry(0.09, 1.87, 0.09, 4, 0.016);
    upright.translate(X_BUILD, 0.935, sz * 0.34);
    gantry.push(upright);
  }
  const beam = new RoundedBoxGeometry(0.26, 0.14, 0.86, 3, 0.018);
  beam.translate(X_BUILD, 1.8, 0);
  gantry.push(beam);
  const housing = new RoundedBoxGeometry(0.2, 0.18, 0.2, 2, 0.016);
  housing.translate(X_BUILD, 1.66, 0);
  gantry.push(housing);
  object.addGeometry(world.shared, mergeGeometries(gantry), {
    color: 0x8f979f,
    ambient: 0.5,
  });
  labelPlate(world, object, 'BUILD', 0.44, 0.11, (g) =>
    g.translate(X_BUILD, 1.8, 0.436),
  );

  const press = new Group();
  press.position.set(X_BUILD, PRESS_UP, 0);
  object.add(press);
  {
    const parts: BufferGeometry[] = [];
    const head = new RoundedBoxGeometry(0.34, 0.14, 0.42, 3, 0.02);
    parts.push(head);
    const ram = new CylinderGeometry(0.045, 0.045, 0.62, 12);
    ram.translate(0, 0.38, 0);
    parts.push(ram.toNonIndexed());
    object.addGeometry(
      world.shared,
      mergeGeometries(parts),
      { color: 0x6f777f, ambient: 0.48 },
      press,
    );
  }

  // ---------------- TEST: an arch, a scan bar under it, a lamp on top.
  const arch: BufferGeometry[] = [];
  for (const sz of [-1, 1]) {
    const upright = new RoundedBoxGeometry(0.08, 1.45, 0.08, 4, 0.014);
    upright.translate(X_TEST, 0.725, sz * 0.34);
    arch.push(upright);
  }
  const archBeam = new RoundedBoxGeometry(0.2, 0.14, 0.86, 3, 0.018);
  archBeam.translate(X_TEST, 1.52, 0);
  arch.push(archBeam);
  const lampBody = new RoundedBoxGeometry(0.16, 0.06, 0.16, 2, 0.014);
  lampBody.translate(X_TEST, 1.62, 0);
  arch.push(lampBody);
  object.addGeometry(world.shared, mergeGeometries(arch), {
    color: 0x8f979f,
    ambient: 0.5,
  });
  labelPlate(world, object, 'TEST', 0.36, 0.11, (g) =>
    g.translate(X_TEST, 1.52, 0.436),
  );

  // The lamp and the scan bar are the only things here that change colour, so
  // they hold their own materials and get written by the ticker. Ambient 1 —
  // they emit, they are not painted.
  const lampGeo = new CylinderGeometry(0.07, 0.07, 0.09, 14);
  lampGeo.translate(X_TEST, 1.7, 0);
  const lampMats: HyperMaterial[] = object.addGeometry(world.shared, lampGeo, {
    color: LAMP_IDLE,
    ambient: 1.0,
    castShadow: false,
    receiveShadow: false,
  });

  const scanGeo = new RoundedBoxGeometry(0.04, 0.045, 0.62, 3, 0.008);
  scanGeo.translate(X_TEST, 1.4, 0);
  const scanMats: HyperMaterial[] = object.addGeometry(world.shared, scanGeo, {
    color: LAMP_IDLE,
    ambient: 1.0,
    castShadow: false,
    receiveShadow: false,
  });

  // ---------------- the reject path: a ram behind the belt, a chute in front,
  // a bin at the bottom of it.
  const pusher = new Group();
  pusher.position.set(X_DIVERT, 0.92, -0.59);
  object.add(pusher);
  object.addGeometry(
    world.shared,
    (() => {
      const arm = new RoundedBoxGeometry(0.12, 0.12, 0.34, 2, 0.018);
      const face = new RoundedBoxGeometry(0.16, 0.18, 0.03, 2, 0.008);
      face.translate(0, 0, 0.175);
      return mergeGeometries([arm, face]);
    })(),
    { color: 0x9aa2aa, ambient: 0.5 },
    pusher,
  );
  {
    const pot = new RoundedBoxGeometry(0.2, 0.24, 0.26, 2, 0.02);
    pot.translate(X_DIVERT, 0.92, -0.76);
    object.addGeometry(world.shared, pot, { color: DARK_STEEL, ambient: 0.48 });
  }

  const chute = new RoundedBoxGeometry(0.46, 0.02, 0.54, 5, 0.006);
  chute.rotateX(Math.PI / 4);
  chute.translate(X_DIVERT, 0.61, 0.43);
  object.addGeometry(world.shared, chute, { color: 0x9c9a92, ambient: 0.5 });

  const bin: BufferGeometry[] = [];
  const binFloor = new RoundedBoxGeometry(0.52, 0.04, 0.42, 3, 0.008);
  binFloor.translate(X_DIVERT, 0.12, 0.8);
  bin.push(binFloor);
  for (const sz of [-1, 1]) {
    const side = new RoundedBoxGeometry(0.52, 0.3, 0.025, 3, 0.006);
    side.translate(X_DIVERT, 0.29, 0.8 + sz * 0.2);
    bin.push(side);
  }
  for (const sx of [-1, 1]) {
    const end = new RoundedBoxGeometry(0.025, 0.3, 0.42, 3, 0.006);
    end.translate(X_DIVERT + sx * 0.25, 0.29, 0.8);
    bin.push(end);
  }
  object.addGeometry(world.shared, mergeGeometries(bin), {
    color: 0xa8724f,
    ambient: 0.5,
  });
  labelPlate(world, object, 'REJECTED', 0.4, 0.09, (g) =>
    g.translate(X_DIVERT, 0.31, 1.014),
  );

  // ---------------- PROD: a wall with a hatch the belt runs through. Built as
  // four pieces around the opening rather than as a wall with a hole, because
  // the opening has to be a genuine gap for the crate to disappear into.
  const wall: BufferGeometry[] = [];
  const below = new RoundedBoxGeometry(0.1, 0.78, 1.24, 6, 0.012);
  below.translate(X_WALL, 0.39, 0);
  wall.push(below);
  const above = new RoundedBoxGeometry(0.1, 0.42, 1.24, 5, 0.012);
  above.translate(X_WALL, 1.39, 0);
  wall.push(above);
  for (const sz of [-1, 1]) {
    const jamb = new RoundedBoxGeometry(0.1, 0.4, 0.34, 3, 0.012);
    jamb.translate(X_WALL, 0.98, sz * 0.45);
    wall.push(jamb);
  }
  object.addGeometry(world.shared, mergeGeometries(wall), {
    color: 0xa8a49a,
    ambient: 0.54,
    mottleScale: 55,
    mottleAmount: 0.1,
  });
  // On the wall's near face, so it is read from up the line as the crate
  // approaches it. A quarter turn: a PlaneGeometry faces +z by default.
  labelPlate(world, object, 'PROD', 0.5, 0.13, (g) => {
    g.rotateY(-Math.PI / 2);
    g.translate(X_WALL - 0.056, 1.34, 0);
  });

  // ---------------- the crates.
  const crateBody = new RoundedBoxGeometry(CRATE_W, CRATE_H, CRATE_D, 3, 0.014);
  const strapGeo = mergeGeometries(
    [-0.09, 0.09].map((dx) => {
      const strap = new RoundedBoxGeometry(0.022, CRATE_H + 0.012, CRATE_D + 0.012, 2, 0.005);
      strap.translate(dx, 0, 0);
      return strap;
    }),
  );

  const crates: Crate[] = [];
  for (let i = 0; i < POOL; i++) {
    const node = new Group();
    node.visible = false;
    object.add(node);
    object.addGeometry(
      world.shared,
      crateBody,
      { color: 0xc9a678, ambient: 0.56, mottleScale: 90, mottleAmount: 0.14 },
      node,
    );
    object.addGeometry(
      world.shared,
      strapGeo,
      { color: 0x8a7050, ambient: 0.5, castShadow: false },
      node,
    );
    crates.push({ node, slot: i });
  }

  world.add(object);

  // ---------------- motion.
  const PERIOD = INTERVAL * POOL;
  /** Belt time from the press to the divert point, and to behind the wall. */
  const T_DIVERT = (X_DIVERT - X_BUILD) / SPEED;
  const T_GONE = (X_GONE - X_BUILD) / SPEED;
  /** How long the tumble into the bin takes, and how long it then lingers. */
  const FALL = 1.3;
  const LINGER = 0.7;

  const p = new Vector3();
  let clock = 0;

  const tick = (_worldGV: GyroVector, dt: number) => {
    clock += dt;

    // Cleats. One arc offset shared by all of them, so they can never bunch.
    const s0 = SPEED * clock;
    for (let i = 0; i < CLEATS; i++) {
      const phi = beltPoint(s0 + (LOOP * i) / CLEATS, p);
      cleats[i].position.copy(p);
      cleats[i].rotation.z = phi - Math.PI / 2;
    }

    // Drums. Negative, because the top of the drum has to move with the top of
    // the belt, and the belt runs toward +x.
    const spin = (-SPEED / BELT_R) * clock;
    for (const d of drums) d.rotation.z = spin;

    press.position.y = PRESS_UP - pressDrop((clock % INTERVAL) / INTERVAL) * (PRESS_UP - PRESS_DOWN);

    let lamp = LAMP_IDLE;
    let scan = LAMP_IDLE;
    let reach = 0;

    for (const crate of crates) {
      const raw = clock - (crate.slot + SPAWN_U) * INTERVAL;
      const run = Math.floor(raw / PERIOD);
      const age = raw - run * PERIOD;
      // Deterministic and stable per crate: the same crate always fails on the
      // same lap. `+ FAIL_EVERY * 64` keeps it positive before the first lap.
      const index = run * POOL + crate.slot;
      const fails = ((index % FAIL_EVERY) + FAIL_EVERY * 64) % FAIL_EVERY === FAIL_EVERY - 1;

      const x = X_BUILD + SPEED * age;
      const alive = fails ? age < T_DIVERT + FALL + LINGER : age < T_GONE;
      crate.node.visible = alive;
      if (!alive) continue;

      if (Math.abs(x - X_TEST) < 0.17) {
        lamp = fails ? LAMP_FAIL : LAMP_PASS;
        scan = lamp;
      }

      if (!fails || age < T_DIVERT) {
        crate.node.position.set(x, CRATE_Y, 0);
        crate.node.rotation.set(0, 0, 0);
        continue;
      }

      // Off the belt: shoved across, down the chute, into the bin.
      const d = age - T_DIVERT;
      reach = Math.max(reach, d < 0.25 ? ease(d / 0.25) : d < 0.55 ? 1 : d < 0.95 ? 1 - ease((d - 0.55) / 0.4) : 0);
      const e = ease(clamp01(d / FALL));
      crate.node.position.set(X_DIVERT, CRATE_Y + (0.28 - CRATE_Y) * e, 0.8 * e);
      crate.node.rotation.set(1.1 * e, 0, 0);
    }

    for (const m of lampMats) m.uniforms.uColor.value.setHex(lamp);
    for (const m of scanMats) m.uniforms.uColor.value.setHex(scan);
    pusher.position.z = -0.59 + 0.32 * reach;
  };

  return { object, tick };
}
