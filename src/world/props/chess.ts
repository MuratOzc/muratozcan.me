import {
  BoxGeometry,
  CanvasTexture,
  LatheGeometry,
  LinearFilter,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';

/**
 * The chess table: Özcan – Carlsen, 1–0.
 *
 * The board shows the final position of a scholar's mate (1.e4 e5 2.Bc4 Nc6
 * 3.Qh5 Nf6 4.Qxf7#), white queen sitting on f7, black king with nowhere to
 * go. The plaque records the result with tournament-book solemnity. Whether
 * the game took place is between the plaque and its conscience.
 *
 * Pieces are lathe-turned profiles — the proper silhouettes, not cones. All
 * white pieces merge into one geometry and all black into another: thirty-one
 * pieces, two draw calls.
 */

const SQ = 0.1;
/** Top surface of the board. */
const BOARD_Y = 0.732;

type PieceKind = 'P' | 'R' | 'N' | 'B' | 'Q' | 'K';

/** [kind, file 0-7 = a-h, rank 0-7 = 1-8] */
const WHITE: Array<[PieceKind, number, number]> = [
  ['P', 0, 1], ['P', 1, 1], ['P', 2, 1], ['P', 3, 1], ['P', 5, 1], ['P', 6, 1], ['P', 7, 1],
  ['P', 4, 3],                       // e4
  ['R', 0, 0], ['N', 1, 0], ['B', 2, 0], ['K', 4, 0], ['N', 6, 0], ['R', 7, 0],
  ['B', 2, 3],                       // Bc4
  ['Q', 5, 6],                       // Qxf7#
];
const BLACK: Array<[PieceKind, number, number]> = [
  ['P', 0, 6], ['P', 1, 6], ['P', 2, 6], ['P', 3, 6], ['P', 6, 6], ['P', 7, 6],
  ['P', 4, 4],                       // e5
  ['R', 0, 7], ['B', 2, 7], ['Q', 3, 7], ['K', 4, 7], ['B', 5, 7], ['R', 7, 7],
  ['N', 2, 5], ['N', 5, 5],          // Nc6, Nf6
];

function lathe(profile: Array<[number, number]>, segments = 16): BufferGeometry {
  return new LatheGeometry(profile.map(([x, y]) => new Vector2(x, y)), segments);
}

/**
 * Turned profiles, sized to a 0.1 square. Every piece shares the same base
 * moulding so the set reads as one family.
 */
function pieceGeometry(kind: PieceKind): BufferGeometry[] {
  const BASE: Array<[number, number]> = [
    [0.0005, 0], [0.030, 0], [0.030, 0.006], [0.026, 0.010], [0.019, 0.014],
  ];
  switch (kind) {
    case 'P': {
      const body = lathe([
        ...BASE,
        [0.013, 0.020], [0.0095, 0.034], [0.0085, 0.042],
        [0.014, 0.046], [0.009, 0.050], [0.0005, 0.050],
      ]);
      const head = new SphereGeometry(0.0135, 12, 10);
      head.translate(0, 0.060, 0);
      return [body, head];
    }
    case 'R': {
      const body = lathe([
        ...BASE,
        [0.015, 0.020], [0.0135, 0.052], [0.019, 0.056],
        [0.019, 0.072], [0.0155, 0.072], [0.0155, 0.066], [0.0005, 0.066],
      ]);
      // Crenellations: four merlons on the rim.
      const parts: BufferGeometry[] = [body];
      for (let i = 0; i < 4; i++) {
        const m = new BoxGeometry(0.009, 0.010, 0.009, 1, 1, 1);
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        m.translate(Math.cos(a) * 0.0145, 0.074, Math.sin(a) * 0.0145);
        parts.push(m);
      }
      return parts;
    }
    case 'N': {
      const base = lathe([...BASE, [0.014, 0.020], [0.012, 0.028], [0.0005, 0.028]]);
      // The horse: a leaning neck, a head with a muzzle, two ears. Blocky,
      // but blocky like a Staunton knight, not like a traffic cone.
      const neck = new BoxGeometry(0.017, 0.052, 0.024, 1, 2, 1);
      neck.translate(0, 0.026, 0.004);
      neck.rotateX(-0.38);
      neck.translate(0, 0.028, 0);
      const head = new BoxGeometry(0.015, 0.020, 0.036, 1, 1, 2);
      head.rotateX(0.18);
      head.translate(0, 0.081, -0.016);
      const earL = new BoxGeometry(0.005, 0.012, 0.006);
      earL.translate(-0.0045, 0.093, -0.004);
      const earR = earL.clone();
      earR.translate(0.009, 0, 0);
      return [base, neck, head, earL, earR];
    }
    case 'B': {
      const body = lathe([
        ...BASE,
        [0.012, 0.020], [0.0085, 0.048], [0.0135, 0.056],
        [0.011, 0.066], [0.005, 0.074], [0.0005, 0.074],
      ]);
      const tip = new SphereGeometry(0.006, 10, 8);
      tip.translate(0, 0.078, 0);
      return [body, tip];
    }
    case 'Q': {
      const body = lathe([
        ...BASE,
        [0.014, 0.022], [0.010, 0.058], [0.017, 0.068],
        [0.013, 0.078], [0.008, 0.084], [0.0005, 0.084],
      ]);
      const orb = new SphereGeometry(0.0095, 12, 10);
      orb.translate(0, 0.091, 0);
      return [body, orb];
    }
    case 'K': {
      const body = lathe([
        ...BASE,
        [0.0145, 0.022], [0.0105, 0.062], [0.018, 0.072],
        [0.014, 0.084], [0.009, 0.092], [0.0005, 0.092],
      ]);
      const v = new BoxGeometry(0.006, 0.026, 0.006);
      v.translate(0, 0.106, 0);
      const bar = new BoxGeometry(0.018, 0.006, 0.006);
      bar.translate(0, 0.108, 0);
      return [body, v, bar];
    }
  }
}

function sideGeometry(
  pieces: Array<[PieceKind, number, number]>,
  facing: 1 | -1,
): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const [kind, file, rank] of pieces) {
    for (const g of pieceGeometry(kind)) {
      // Each side faces its opponent — matters for the knights, whose heads
      // would otherwise stare out of the back rank.
      if (facing === -1) g.rotateY(Math.PI);
      // White plays toward -z; a1 is near-left from white.
      g.translate((file - 3.5) * SQ, BOARD_Y, (3.5 - rank) * SQ);
      parts.push(g);
    }
  }
  return mergeGeometries(parts);
}

function boardTexture(): CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#a08a64';
  ctx.fillRect(0, 0, size, size);

  const margin = size * 0.09;
  const cell = (size - margin * 2) / 8;
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      ctx.fillStyle = (f + r) % 2 === 0 ? '#7a6b52' : '#efe6cf';
      ctx.fillRect(margin + f * cell, margin + r * cell, cell, cell);
    }
  }

  ctx.fillStyle = '#3a3226';
  ctx.textAlign = 'center';
  ctx.font = '600 46px ui-monospace, Consolas, monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('ÖZCAN', size / 2, size - margin / 2);
  ctx.save();
  ctx.translate(size / 2, margin / 2);
  ctx.rotate(Math.PI);
  ctx.fillText('CARLSEN', 0, 0);
  ctx.restore();
  ctx.font = '600 36px ui-monospace, Consolas, monospace';
  ctx.fillText('1–0', size - margin / 2, size - margin / 2);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 8;
  return tex;
}

export function buildChessTable(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): HyperObject {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  // ---- pedestal: a turned foot and column, no seams.
  const pedestal = lathe([
    [0.001, 0], [0.24, 0], [0.24, 0.02], [0.20, 0.045], [0.075, 0.075],
    [0.058, 0.30], [0.075, 0.52], [0.16, 0.60], [0.40, 0.65], [0.42, 0.69], [0.001, 0.69],
  ], 20);
  object.addGeometry(world.shared, pedestal, { color: 0x8a7460, ambient: 0.5 });

  // ---- top: rounded slab; the board sits in a shallow rim.
  const top = new RoundedBoxGeometry(1.1, 0.055, 1.1, 3, 0.018);
  top.translate(0, 0.7, 0);
  object.addGeometry(world.shared, top, { color: 0xb59a75, ambient: 0.55 });

  const RIM = 0.98;
  for (const [dx, dz, w, d] of [
    [0, RIM / 2, RIM + 0.06, 0.06],
    [0, -RIM / 2, RIM + 0.06, 0.06],
    [RIM / 2, 0, 0.06, RIM + 0.06],
    [-RIM / 2, 0, 0.06, RIM + 0.06],
  ] as Array<[number, number, number, number]>) {
    const bar = new RoundedBoxGeometry(w, 0.028, d, 2, 0.01);
    bar.translate(dx, 0.738, dz);
    object.addGeometry(world.shared, bar, { color: 0x8a7460, ambient: 0.5 });
  }

  const board = new PlaneGeometry(RIM - 0.04, RIM - 0.04, 1, 1);
  board.rotateX(-Math.PI / 2);
  board.translate(0, BOARD_Y, 0);
  object.addGeometry(world.shared, board, {
    map: boardTexture(),
    color: 0xffffff,
    ambient: 0.88,
    castShadow: false,
    receiveShadow: false,
  });

  // White faces -z, black faces +z, toward each other across the board.
  object.addGeometry(world.shared, sideGeometry(WHITE, 1), {
    color: 0xf2ead6,
    ambient: 0.52,
  });
  // "Black" is a readable slate gray — true black swallows every contour
  // this lighting model has.
  object.addGeometry(world.shared, sideGeometry(BLACK, -1), {
    color: 0x707782,
    ambient: 0.48,
  });

  // ---- two turned stools: the game is over, but the seats stay out.
  for (const side of [-1, 1]) {
    const stool = lathe([
      [0.001, 0], [0.15, 0], [0.15, 0.015], [0.10, 0.04],
      [0.085, 0.36], [0.15, 0.41], [0.155, 0.45], [0.13, 0.46], [0.001, 0.46],
    ], 16);
    stool.translate(0, 0, side * 0.85);
    object.addGeometry(world.shared, stool, { color: 0x8a7460, ambient: 0.5 });
  }

  world.add(object);
  return object;
}
