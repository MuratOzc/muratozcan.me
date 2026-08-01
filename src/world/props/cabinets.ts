import { CylinderGeometry, Group, PlaneGeometry, type BufferGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';
import { merge } from '../geometry';
import { makeTextTexture } from '../text';

/**
 * Station 6: data — seven filing cabinets standing as a B-tree.
 *
 * The arrangement is the index: one root at the back, two branches, four
 * leaves across the front, each labelled with the key range it holds. Walk up
 * and a query is always running — a drawer opens at the root, then at the
 * branch that owns the key, then at the leaf where the row actually lives,
 * and the three stay open just long enough for you to see the path before
 * they slide shut and another query starts.
 *
 * That cascade is the whole point of an index, and it is far easier to watch
 * than to explain: three drawers out of twenty-one, every time, no matter how
 * many rows are in there.
 */

const CAB_W = 0.4;
const CAB_H = 0.92;
const CAB_D = 0.48;
const DRAWERS = 3;
/** How far a drawer rides out, in authored units. */
const SLIDE = 0.3;

/** Key ranges, in tree order: root, two branches, four leaves. */
const RANGES = ['A–Z', 'A–M', 'N–Z', 'A–F', 'G–M', 'N–S', 'T–Z'];

/** Where each cabinet stands. Back to front: 1, 2, 4. */
const SPOTS: Array<[number, number]> = [
  [0, -0.95],
  [-0.7, 0],
  [0.7, 0],
  [-1.05, 0.95],
  [-0.35, 0.95],
  [0.35, 0.95],
  [1.05, 0.95],
];

/** Manila and paper, authored bright for the engine's colour crush. */
const MANILA = 0xe8d6a8;
const PAPER = 0xf4f1e6;

/**
 * The folders that fill a drawer: a row of uprights leaning on each other,
 * with the odd one riding proud. Built around the drawer's own origin so
 * they ride out with it — the reveal only works if the contents move too.
 */
function folderStack(): { manila: BufferGeometry; tabs: BufferGeometry } {
  const manila: BufferGeometry[] = [];
  const tabs: BufferGeometry[] = [];
  const COUNT = 9;
  for (let i = 0; i < COUNT; i++) {
    const z = -0.11 + i * 0.036;
    // A stack is never tidy: each folder leans and rides at its own height.
    const lean = Math.sin(i * 2.3) * 0.09;
    const rise = Math.sin(i * 1.7) * 0.012;
    const f = new RoundedBoxGeometry(0.29, 0.165, 0.012, 1, 0.004);
    f.rotateX(lean);
    f.translate(0, 0.012 + rise, z);
    manila.push(f);
    // Every third folder gets a paper tab standing proud of the manila.
    if (i % 3 === 1) {
      const tab = new RoundedBoxGeometry(0.1, 0.03, 0.008, 1, 0.003);
      tab.rotateX(lean);
      tab.translate(-0.05 + (i % 2) * 0.09, 0.108 + rise, z);
      tabs.push(tab);
    }
  }
  return {
    manila: merge(manila),
    tabs: merge(tabs),
  };
}

interface Drawer {
  node: Group;
  /** 0 shut, 1 fully out. Eased toward `target` every frame. */
  open: number;
  target: number;
  /** The shut Z, so the slide is measured from it and never drifts. */
  baseZ: number;
}

export interface CabinetsResult {
  object: HyperObject;
  tick: (worldGV: GyroVector, dt: number) => void;
}

export function buildCabinets(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): CabinetsResult {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  const STEEL = 0xb4bcc4;
  const DRAWER = 0xa6aeb6;
  const BRASS = 0xd9c187;

  // ---------------- the floor: paved, because seven cabinets on grass is a
  // fly-tip, not an archive.
  //
  // TESSELLATION IS LOAD-BEARING HERE. Every quad renders as a flat chord of
  // the true curved surface, so a coarse slab bulges upward mid-quad by
  // R(1 - cos(θ/2)). At 2 segments across 3 units that sag is 0.028 authored
  // units — MORE than the paperwork's clearance above the floor, so the floor
  // swallowed the sheets wherever they sat away from a vertex. At 10 segments
  // it is 0.0011, comfortably under. Anything laid on a surface in this world
  // has to clear that surface's chord error, not just its face.
  const floor = new RoundedBoxGeometry(3.0, 0.1, 2.9, 10, 0.02);
  floor.translate(0, 0.05, 0);
  object.addGeometry(world.shared, floor, { color: 0xb0aea6, ambient: 0.62 });

  const drawers: Drawer[][] = [];

  SPOTS.forEach(([x, z], c) => {
    // ---- carcass: a shell with a plinth, open at the front.
    const carcass: BufferGeometry[] = [];
    const shell = new RoundedBoxGeometry(CAB_W, CAB_H, CAB_D, 2, 0.014);
    shell.translate(x, 0.1 + CAB_H / 2, z);
    carcass.push(shell);
    const plinth = new RoundedBoxGeometry(CAB_W - 0.05, 0.05, CAB_D - 0.05, 1, 0.01);
    plinth.translate(x, 0.125, z);
    carcass.push(plinth);
    object.addGeometry(
      world.shared,
      merge(carcass),
      { color: STEEL, ambient: 0.55 },
    );

    // ---- the key-range plate, screwed to the top rail. This is what makes
    // the arrangement legible as an index rather than as furniture.
    const plate = new PlaneGeometry(CAB_W * 0.72, 0.1, 1, 1);
    plate.translate(x, 0.1 + CAB_H - 0.085, z + CAB_D / 2 + 0.006);
    object.addGeometry(world.shared, plate, {
      map: makeTextTexture(RANGES[c], {
        width: 512,
        height: 160,
        color: '#2b3138',
        letterSpacing: 6,
      }),
      color: 0xffffff,
      ambient: 0.92,
      alphaTest: 0.3,
      alphaBlend: true,
      castShadow: false,
      receiveShadow: false,
    });

    // ---- the drawers. Each is its own node so it can ride out on its own;
    // the geometry is authored around that node's origin, so animating is a
    // single position write per frame.
    const set: Drawer[] = [];
    for (let d = 0; d < DRAWERS; d++) {
      const node = new Group();
      // Shut position. The front sits just proud of the carcass face.
      node.position.set(x, 0.1 + 0.17 + d * 0.26, z + 0.02);
      object.add(node);

      const parts: BufferGeometry[] = [];
      const front = new RoundedBoxGeometry(CAB_W - 0.03, 0.22, 0.03, 2, 0.008);
      front.translate(0, 0, CAB_D / 2 - 0.01);
      parts.push(front);
      // The tray behind the face. An OPEN box — floor, two sides and a back,
      // no lid — because a solid one would seal the folders inside it where
      // nobody can ever see them, which rather defeats the exhibit.
      const TW = CAB_W - 0.07;
      const TD = CAB_D - 0.1;
      const TH = 0.19;
      const TZ = CAB_D / 2 - 0.07 - TD / 2 + 0.06;
      const floorPlate = new RoundedBoxGeometry(TW, 0.012, TD, 1, 0.004);
      floorPlate.translate(0, -TH / 2 + 0.006, TZ);
      parts.push(floorPlate);
      for (const sx of [-1, 1]) {
        const wall = new RoundedBoxGeometry(0.012, TH, TD, 1, 0.004);
        wall.translate(sx * (TW / 2 - 0.006), 0, TZ);
        parts.push(wall);
      }
      const back = new RoundedBoxGeometry(TW, TH, 0.012, 1, 0.004);
      back.translate(0, 0, TZ - TD / 2 + 0.006);
      parts.push(back);
      object.addGeometry(
        world.shared,
        merge(parts),
        { color: DRAWER, ambient: 0.52 },
        node,
      );

      // Brass pull.
      const pull = new CylinderGeometry(0.012, 0.012, CAB_W * 0.4, 8);
      pull.rotateZ(Math.PI / 2);
      pull.translate(0, -0.02, CAB_D / 2 + 0.012);
      object.addGeometry(
        world.shared,
        pull,
        { color: BRASS, ambient: 0.6 },
        node,
      );

      // The contents. Every drawer is full, because any drawer can open.
      const stack = folderStack();
      object.addGeometry(
        world.shared,
        stack.manila,
        { color: MANILA, ambient: 0.6 },
        node,
      );
      object.addGeometry(
        world.shared,
        stack.tabs,
        { color: PAPER, ambient: 0.68 },
        node,
      );

      set.push({ node, open: 0, target: 0, baseZ: node.position.z });
    }
    drawers.push(set);
  });

  // ---------------- the paperwork on the floor.
  //
  // Someone has been in here. Loose sheets and a dropped folder, lying where
  // they fell. These are thin BOXES rather than ground decals: a decal a few
  // millimetres over the floor is exactly the case the shadow map cannot
  // resolve, and it comes back as a dark blot.
  // Rest the paperwork a hair above the paving rather than exactly on it:
  // coplanar faces fight for depth, and the lift also buys margin over the
  // floor's remaining chord error (see the tessellation note above).
  const FLOOR_TOP = 0.1 + 0.006;
  const sheets: BufferGeometry[] = [];
  const folders: BufferGeometry[] = [];

  const SCATTER: Array<[number, number, number, boolean]> = [
    // x, z, spin, isFolder
    [0.15, 1.35, 0.42, true],
    [-0.68, 1.3, -0.75, false],
    [-0.9, 1.42, 0.15, false],
    [1.32, 0.62, 1.15, false],
    [-1.35, 0.35, 0.28, true],
    [0.42, -0.48, -0.4, false],
    [-0.28, -0.52, 0.95, false],
    [1.2, -0.75, -0.25, false],
  ];

  for (const [x, z, spin, isFolder] of SCATTER) {
    if (isFolder) {
      // A folder open on the floor, its contents half out.
      const cover = new RoundedBoxGeometry(0.3, 0.008, 0.22, 1, 0.003);
      cover.rotateY(spin);
      cover.translate(x, FLOOR_TOP + 0.004, z);
      folders.push(cover);
      for (let s = 0; s < 3; s++) {
        const sheet = new RoundedBoxGeometry(0.2, 0.005, 0.15, 1, 0.002);
        sheet.rotateY(spin + 0.25 + s * 0.22);
        sheet.translate(
          x + 0.16 + s * 0.05,
          FLOOR_TOP + 0.009 + s * 0.005,
          z + 0.05 - s * 0.04,
        );
        sheets.push(sheet);
      }
    } else {
      const sheet = new RoundedBoxGeometry(0.19, 0.005, 0.145, 1, 0.002);
      sheet.rotateY(spin);
      sheet.translate(x, FLOOR_TOP + 0.004, z);
      sheets.push(sheet);
    }
  }

  object.addGeometry(
    world.shared,
    merge(folders),
    { color: MANILA, ambient: 0.66, receiveShadow: false },
  );
  object.addGeometry(
    world.shared,
    merge(sheets),
    { color: PAPER, ambient: 0.72, receiveShadow: false },
  );

  world.add(object);

  // ---------------- the query.
  //
  // Root, then the branch owning the key, then the leaf holding the row. The
  // leaf is always one of the two below the chosen branch, so the path down
  // the tree is a real path, not three unrelated cabinets lighting up.
  let clock = 0;
  let query = 0;

  const path = (q: number): [number, number, number] => {
    const branch = q % 2;
    const leaf = branch * 2 + ((q >> 1) % 2);
    return [0, 1 + branch, 3 + leaf];
  };

  const tick = (_worldGV: GyroVector, dt: number) => {
    clock += dt;
    // One full query cycle, then the next.
    const CYCLE = 4.6;
    if (clock > CYCLE) {
      clock -= CYCLE;
      query++;
    }

    const [root, branch, leaf] = path(query);
    // Which drawer of each cabinet — rotated per query so the same three
    // drawers are not the only ones that ever move.
    const pick = (level: number) => (query + level) % DRAWERS;

    for (let c = 0; c < drawers.length; c++) {
      for (let d = 0; d < DRAWERS; d++) {
        let want = 0;
        if (clock < 3.4) {
          if (c === root && d === pick(0) && clock > 0.15) want = 1;
          if (c === branch && d === pick(1) && clock > 0.85) want = 1;
          if (c === leaf && d === pick(2) && clock > 1.55) want = 1;
        }
        drawers[c][d].target = want;
      }
    }

    for (const set of drawers) {
      for (const dr of set) {
        // Ease rather than snap: a drawer has mass.
        dr.open += (dr.target - dr.open) * Math.min(1, dt * 5.5);
        dr.node.position.z = dr.baseZ + dr.open * SLIDE;
      }
    }
  };

  return { object, tick };
}
