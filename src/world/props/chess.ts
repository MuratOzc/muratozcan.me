import {
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  LinearFilter,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';

/**
 * The chess table: Özcan – Carlsen, 1–0.
 *
 * The board shows the final position of a scholar's mate (1.e4 e5 2.Bc4 Nc6
 * 3.Qh5 Nf6 4.Qxf7#), white queen sitting on f7, black king with nowhere to
 * go. The plaque records the result with tournament-book solemnity. Whether
 * the game took place is between the plaque and its conscience.
 *
 * All white pieces merge into one geometry and all black into another —
 * thirty-one pieces for two draw calls.
 */

const SQ = 0.1;
const BOARD_Y = 0.74;

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

function pieceGeometry(kind: PieceKind): BufferGeometry[] {
  switch (kind) {
    case 'P': {
      const cone = new ConeGeometry(0.028, 0.07, 10);
      cone.translate(0, 0.035, 0);
      const head = new SphereGeometry(0.018, 8, 6);
      head.translate(0, 0.075, 0);
      return [cone, head];
    }
    case 'R': {
      const body = new BoxGeometry(0.05, 0.1, 0.05, 1, 1, 1);
      body.translate(0, 0.05, 0);
      return [body];
    }
    case 'N': {
      const body = new ConeGeometry(0.032, 0.11, 8);
      body.translate(0, 0.055, 0);
      body.rotateX(0.5); // the lean is the whole horse
      return [body];
    }
    case 'B': {
      const body = new ConeGeometry(0.03, 0.12, 10);
      body.translate(0, 0.06, 0);
      const tip = new SphereGeometry(0.014, 8, 6);
      tip.translate(0, 0.128, 0);
      return [body, tip];
    }
    case 'Q': {
      const body = new ConeGeometry(0.036, 0.15, 10);
      body.translate(0, 0.075, 0);
      const crown = new SphereGeometry(0.02, 8, 6);
      crown.translate(0, 0.158, 0);
      return [body, crown];
    }
    case 'K': {
      const body = new ConeGeometry(0.036, 0.16, 10);
      body.translate(0, 0.08, 0);
      const v = new BoxGeometry(0.014, 0.05, 0.014);
      v.translate(0, 0.19, 0);
      const hbar = new BoxGeometry(0.042, 0.014, 0.014);
      hbar.translate(0, 0.185, 0);
      return [body, v, hbar];
    }
  }
}

function sideGeometry(pieces: Array<[PieceKind, number, number]>): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const [kind, file, rank] of pieces) {
    for (const g of pieceGeometry(kind)) {
      // White plays toward -z (the path side); a1 is near-left from white.
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

  ctx.fillStyle = '#8a7a5e';
  ctx.fillRect(0, 0, size, size);

  const margin = size * 0.09;
  const cell = (size - margin * 2) / 8;
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      ctx.fillStyle = (f + r) % 2 === 0 ? '#4c453a' : '#d9d2c0';
      ctx.fillRect(margin + f * cell, margin + r * cell, cell, cell);
    }
  }

  ctx.fillStyle = '#2f2a22';
  ctx.textAlign = 'center';
  ctx.font = '600 52px ui-monospace, Consolas, monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('ÖZCAN', size / 2, size - margin / 2);
  ctx.save();
  ctx.translate(size / 2, margin / 2);
  ctx.rotate(Math.PI);
  ctx.fillText('CARLSEN', 0, 0);
  ctx.restore();
  ctx.font = '600 40px ui-monospace, Consolas, monospace';
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

  // Pedestal table.
  const foot = new BoxGeometry(0.5, 0.06, 0.5, 2, 1, 2);
  foot.translate(0, 0.03, 0);
  object.addGeometry(world.shared, foot, { color: 0x6f6252, ambient: 0.5 });
  const stem = new CylinderGeometry(0.07, 0.09, 0.62, 10);
  stem.translate(0, 0.37, 0);
  object.addGeometry(world.shared, stem, { color: 0x6f6252, ambient: 0.5 });
  const top = new BoxGeometry(1.06, 0.06, 1.06, 4, 1, 4);
  top.translate(0, 0.71, 0);
  object.addGeometry(world.shared, top, { color: 0x8a7a5e, ambient: 0.55 });

  const board = new PlaneGeometry(0.98, 0.98, 4, 4);
  board.rotateX(-Math.PI / 2);
  board.translate(0, BOARD_Y + 0.001, 0);
  object.addGeometry(world.shared, board, {
    map: boardTexture(),
    color: 0xffffff,
    ambient: 0.85,
    castShadow: false,
  });

  object.addGeometry(world.shared, sideGeometry(WHITE), {
    color: 0xe8e2d2,
    ambient: 0.5,
  });
  object.addGeometry(world.shared, sideGeometry(BLACK), {
    color: 0x2f3438,
    ambient: 0.35,
  });

  // Two stools: the game is over, but the seats stay out.
  for (const side of [-1, 1]) {
    const seat = new CylinderGeometry(0.16, 0.13, 0.46, 10);
    seat.translate(0, 0.23, side * 0.85);
    object.addGeometry(world.shared, seat, { color: 0x6f6252, ambient: 0.5 });
  }

  world.add(object);
  return object;
}
