import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Path,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  type BufferGeometry,
  type Texture,
} from 'three';
import {
  mergeGeometries,
  mergeVertices,
} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';
import { L, t, upper, type Localized } from '../../content/i18n';
import { localizedCanvasTexture } from '../text';

/**
 * The chess table: Özcan – Carlsen, 1–0.
 *
 * The board shows the final position of a scholar's mate (1.e4 e5 2.Bc4 Nc6
 * 3.Qh5 Nf6 4.Qxf7#), white queen sitting on f7, black king with nowhere to
 * go. The scoreboard records the result with tournament-book solemnity and
 * the scoresheets carry the moves in a player's hand. Whether the game took
 * place is between the placard and its conscience.
 *
 * Everything is laid out as a real tournament board would be: players face
 * each other along ±x, the clock sits at the far edge where both can read it,
 * scoresheets and pens lie on the near edge, chairs pushed back from a game
 * that ended early. The visitor arrives from -z and reads the whole thing
 * broadside.
 *
 * Pieces are turned Staunton profiles at true proportions — king 1.8 squares
 * tall, base a shade under one square wide — revolved from smooth paths, not
 * five-point polylines. All white merges into one geometry and all black into
 * another: thirty-one pieces, two draw calls.
 */

/** One board square. Everything about the set is expressed as a multiple. */
const SQ = 0.058;
const FIELD = 8 * SQ;
/** Border of the inlaid board panel, outside the playing field. */
const BORDER = 0.046;
const FACE = FIELD + 2 * BORDER;

const TOP_Y = 0.452;
/** Top surface of the board — where the pieces stand. */
const BOARD_Y = 0.4675;

const WOOD = 0xb08d62;
const DARKWOOD = 0x8a6f52;
const EBONY = 0x6d5745;

const MONO = 'ui-monospace, Consolas, monospace';

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

const MOVES: Array<[string, string]> = [
  ['e4', 'e5'],
  ['Bc4', 'Nc6'],
  ['Qh5', 'Nf6'],
  ['Qxf7#', ''],
];

// ---------------------------------------------------------------- the pieces

/**
 * Revolve a profile. The path is authored in squares — radius against height —
 * and scaled on the way out, so the whole set rescales with SQ alone.
 */
function turned(build: (p: Path) => void, segments: number): BufferGeometry {
  const path = new Path();
  build(path);
  return new LatheGeometry(
    path.getPoints(5).map((v) => v.multiplyScalar(SQ)),
    segments,
  );
}

/** The pad foot every piece shares, ending at (r · 0.54, 0.32). */
function foot(p: Path, r: number): void {
  p.moveTo(0.004, 0);
  p.lineTo(r, 0);
  p.lineTo(r, 0.10);
  p.quadraticCurveTo(r, 0.17, r * 0.80, 0.20);
  p.quadraticCurveTo(r * 0.62, 0.24, r * 0.54, 0.32);
}

/** A ball finial, tangent to the neck it grows out of rather than floating above it. */
function finial(p: Path, neckR: number, neckY: number, r: number): void {
  const a0 = -Math.acos(Math.min(1, neckR / r));
  p.absarc(0, neckY - r * Math.sin(a0), r, a0, Math.PI / 2, false);
}

/** A ring of coronet points around the queen's cup. */
function coronet(count: number, radius: number, y: number, r: number): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const point = new SphereGeometry(r * SQ, 8, 6);
    point.translate(Math.cos(a) * radius * SQ, y * SQ, Math.sin(a) * radius * SQ);
    out.push(point);
  }
  return out;
}

/**
 * The knight's head, as a side profile extruded across the piece's width.
 *
 * A revolved knight is a traffic cone and a boxed knight is a robot; the only
 * honest way to get the silhouette is to draw it. Authored facing +x and turned
 * so the finished head looks down -z, which is what sideGeometry expects.
 */
function knightHead(): BufferGeometry {
  const s = new Shape();
  s.moveTo(0.12, -0.05);
  s.lineTo(0.105, 0.10);
  s.quadraticCurveTo(0.135, 0.245, 0.215, 0.30);
  s.quadraticCurveTo(0.295, 0.335, 0.325, 0.385);
  s.lineTo(0.328, 0.45);
  s.quadraticCurveTo(0.295, 0.50, 0.235, 0.535);
  s.quadraticCurveTo(0.165, 0.575, 0.115, 0.625);
  s.lineTo(0.03, 0.635);
  s.lineTo(0.06, 0.76);
  s.lineTo(-0.03, 0.685);
  s.quadraticCurveTo(-0.10, 0.63, -0.135, 0.48);
  s.quadraticCurveTo(-0.175, 0.28, -0.145, 0.10);
  s.lineTo(-0.13, -0.05);
  s.closePath();

  const head = new ExtrudeGeometry(s, {
    depth: 0.26,
    bevelEnabled: true,
    bevelThickness: 0.026,
    bevelSize: 0.022,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 6,
  });
  head.translate(0, 0.45, -0.13);
  head.rotateY(Math.PI / 2);
  head.scale(SQ, SQ, SQ);
  // Extrusions come back non-indexed; mergeGeometries refuses a mixed batch.
  return mergeVertices(head, 1e-6);
}

function pieceGeometry(kind: PieceKind): BufferGeometry[] {
  switch (kind) {
    case 'P':
      return [
        turned((p) => {
          foot(p, 0.32);
          p.quadraticCurveTo(0.135, 0.38, 0.118, 0.47);
          p.lineTo(0.152, 0.505);
          p.lineTo(0.152, 0.525);
          p.lineTo(0.112, 0.56);
          finial(p, 0.112, 0.56, 0.188);
        }, 14),
      ];

    case 'R': {
      const parts: BufferGeometry[] = [
        turned((p) => {
          foot(p, 0.37);
          p.quadraticCurveTo(0.185, 0.44, 0.180, 0.64);
          p.lineTo(0.208, 0.69);
          p.lineTo(0.268, 0.77);
          p.lineTo(0.268, 0.88);
          p.lineTo(0.230, 0.91);
          p.lineTo(0, 0.91);
        }, 16),
      ];
      for (let i = 0; i < 4; i++) {
        const merlon = new BoxGeometry(0.22 * SQ, 0.12 * SQ, 0.11 * SQ);
        merlon.translate(0, 0.97 * SQ, 0.20 * SQ);
        merlon.rotateY((i / 4) * Math.PI * 2 + Math.PI / 4);
        parts.push(merlon);
      }
      return parts;
    }

    case 'N':
      return [
        turned((p) => {
          foot(p, 0.37);
          p.lineTo(0.188, 0.40);
          p.lineTo(0.175, 0.45);
          p.lineTo(0, 0.45);
        }, 14),
        knightHead(),
      ];

    case 'B':
      return [
        turned((p) => {
          foot(p, 0.36);
          p.quadraticCurveTo(0.163, 0.42, 0.134, 0.58);
          p.lineTo(0.174, 0.64);
          p.lineTo(0.174, 0.66);
          p.lineTo(0.144, 0.70);
          p.quadraticCurveTo(0.216, 0.79, 0.186, 0.95);
          p.quadraticCurveTo(0.158, 1.06, 0.074, 1.15);
          p.lineTo(0.052, 1.19);
          finial(p, 0.052, 1.19, 0.084);
        }, 16),
      ];

    case 'Q':
      return [
        turned((p) => {
          foot(p, 0.40);
          p.quadraticCurveTo(0.182, 0.52, 0.150, 0.82);
          p.lineTo(0.196, 0.89);
          p.lineTo(0.196, 0.91);
          p.lineTo(0.156, 0.95);
          p.quadraticCurveTo(0.272, 1.08, 0.268, 1.26);
          p.lineTo(0.228, 1.26);
          p.quadraticCurveTo(0.205, 1.12, 0.108, 1.07);
          p.lineTo(0.050, 1.07);
          p.lineTo(0.050, 1.30);
          finial(p, 0.050, 1.30, 0.096);
        }, 18),
        ...coronet(8, 0.248, 1.27, 0.038),
      ];

    case 'K': {
      const cross = new BoxGeometry(0.058 * SQ, 0.30 * SQ, 0.058 * SQ);
      cross.translate(0, 1.655 * SQ, 0);
      const bar = new BoxGeometry(0.19 * SQ, 0.058 * SQ, 0.058 * SQ);
      bar.translate(0, 1.630 * SQ, 0);
      return [
        turned((p) => {
          foot(p, 0.40);
          p.quadraticCurveTo(0.186, 0.56, 0.156, 0.90);
          p.lineTo(0.202, 0.97);
          p.lineTo(0.202, 0.99);
          p.lineTo(0.162, 1.03);
          p.quadraticCurveTo(0.276, 1.16, 0.272, 1.34);
          p.lineTo(0.232, 1.34);
          p.quadraticCurveTo(0.210, 1.20, 0.110, 1.15);
          p.lineTo(0.052, 1.15);
          p.lineTo(0.052, 1.38);
          finial(p, 0.052, 1.38, 0.082);
        }, 18),
        cross,
        bar,
      ];
    }
  }
}

/**
 * Files run along z, ranks along x: white sits at +x looking down the board,
 * so a1 — white's near-left, and a dark square — lands at (+3.5, +3.5) squares.
 */
function square(file: number, rank: number): [number, number] {
  return [(3.5 - rank) * SQ, (3.5 - file) * SQ];
}

function sideGeometry(
  pieces: Array<[PieceKind, number, number]>,
  facing: 1 | -1,
): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const [kind, file, rank] of pieces) {
    const [x, z] = square(file, rank);
    // Enough of a nudge that the set reads as played rather than laid out by
    // machine, small enough that nothing leaves its square.
    const n = file * 8 + rank;
    const jx = (((n * 7919) % 97) / 97 - 0.5) * 0.06 * SQ;
    const jz = (((n * 6271) % 89) / 89 - 0.5) * 0.06 * SQ;
    const jr = (((n * 5417) % 83) / 83 - 0.5) * 0.14;
    for (const g of pieceGeometry(kind)) {
      g.rotateY(facing * (Math.PI / 2) + jr);
      g.translate(x + jx, BOARD_Y, z + jz);
      parts.push(g);
    }
  }
  return mergeGeometries(parts);
}

// -------------------------------------------------------------------- canvas

/**
 * Board colours run brighter than they read.
 *
 * The renderer never re-encodes: an sRGB texture is linearised on sample and
 * written out raw, which leaves highlights nearly intact and crushes mid tones
 * hard. A walnut that measures right on the canvas comes out near black on the
 * table, so the dark squares are painted a full stop and a half light.
 */
function boardTexture(): Texture {
  const FILES = 'abcdefgh';
  return localizedCanvasTexture(1024, 1024, (ctx, size) => {
    const m = size * (BORDER / FACE);
    const cell = (size - 2 * m) / 8;

    ctx.fillStyle = '#b98d63';
    ctx.fillRect(0, 0, size, size);
    // Grain along the border, drawn under everything and then covered.
    ctx.strokeStyle = '#a87f57';
    ctx.lineWidth = 2;
    for (let y = 0; y < size; y += 7) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(y * 0.11) * 3);
      ctx.lineTo(size, y + Math.sin(y * 0.09 + 2) * 3);
      ctx.stroke();
    }

    for (let f = 0; f < 8; f++) {
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = (f + i) % 2 === 1 ? '#c8a677' : '#f7f0de';
        ctx.fillRect(m + f * cell, m + i * cell, cell, cell);
      }
    }

    ctx.strokeStyle = '#8d6a49';
    ctx.lineWidth = 3;
    ctx.strokeRect(m - 4, m - 4, size - 2 * m + 8, size - 2 * m + 8);

    ctx.fillStyle = '#7a5535';
    ctx.font = `600 ${Math.round(m * 0.52)}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 8; i++) {
      const along = m + (i + 0.5) * cell;
      // Each coordinate twice, the far pair upside down, so both players read
      // their own edge the right way up.
      for (const flip of [0, Math.PI]) {
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.rotate(flip);
        ctx.translate(-size / 2, -size / 2);
        ctx.save();
        ctx.translate(along, size - m / 2);
        ctx.rotate(flip);
        ctx.fillText(FILES[i], 0, 0);
        ctx.restore();
        ctx.save();
        ctx.translate(m / 2, size - m - (i + 0.5) * cell);
        ctx.rotate(flip);
        ctx.fillText(String(i + 1), 0, 0);
        ctx.restore();
        ctx.restore();
      }
    }
  });
}

/** Rules, a header block and the moves in a hand that got quicker near the end. */
function scoresheetTexture(forWhite: boolean): Texture {
  const HAND = '"Segoe Script", "Comic Sans MS", cursive';
  const WHITE_L: Localized = L('White', 'Beyaz');
  const BLACK_L: Localized = L('Black', 'Siyah');
  const ROUND_L: Localized = L('Round 4 · Board 1', '4. tur · 1. masa');
  const RESULT_L: Localized = L('Result', 'Sonuç');

  return localizedCanvasTexture(512, 730, (ctx, w, h) => {
    ctx.fillStyle = '#fbf7ec';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e6dfcd';
    ctx.fillRect(0, 0, w, 6);

    const pad = 34;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    ctx.fillStyle = '#8b8272';
    ctx.font = `400 20px ${MONO}`;
    ctx.fillText(upper(t(ROUND_L)), pad, 44);

    ctx.strokeStyle = '#cfc6b2';
    ctx.lineWidth = 2;
    const rule = (y: number) => {
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w - pad, y);
      ctx.stroke();
    };
    rule(64);

    const names: Array<[Localized, string]> = [
      [WHITE_L, 'ÖZCAN, M.'],
      [BLACK_L, 'CARLSEN, M.'],
    ];
    names.forEach(([label, name], i) => {
      const y = 100 + i * 40;
      ctx.fillStyle = '#8b8272';
      ctx.font = `400 20px ${MONO}`;
      ctx.fillText(upper(t(label)), pad, y);
      ctx.fillStyle = '#2a2f35';
      ctx.font = `26px ${HAND}`;
      ctx.fillText(name, pad + 110, y);
    });
    rule(160);

    // Move column: ruled rows, number set in print, moves written in.
    const top = 196;
    const row = 62;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ded5c1';
    for (let i = 0; i <= MOVES.length; i++) {
      ctx.beginPath();
      ctx.moveTo(pad, top + i * row);
      ctx.lineTo(w - pad, top + i * row);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(pad + 62, top);
    ctx.lineTo(pad + 62, top + MOVES.length * row);
    ctx.moveTo(pad + 240, top);
    ctx.lineTo(pad + 240, top + MOVES.length * row);
    ctx.stroke();

    MOVES.forEach(([wm, bm], i) => {
      const y = top + i * row + row / 2;
      ctx.fillStyle = '#9c927f';
      ctx.font = `400 22px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), pad + 31, y);
      ctx.fillStyle = '#2a2f35';
      ctx.font = `30px ${HAND}`;
      ctx.textAlign = 'left';
      ctx.fillText(wm, pad + 84, y);
      if (bm) ctx.fillText(bm, pad + 262, y);
    });

    const resultY = top + MOVES.length * row + 54;
    ctx.fillStyle = '#8b8272';
    ctx.font = `400 20px ${MONO}`;
    ctx.fillText(upper(t(RESULT_L)), pad, resultY);
    ctx.fillStyle = '#2a2f35';
    ctx.font = `34px ${HAND}`;
    ctx.fillText('1 – 0', pad + 110, resultY);

    // The signature: white's neat, black's abandoned halfway.
    ctx.strokeStyle = '#2f3a48';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const sy = resultY + 76;
    ctx.moveTo(pad + 10, sy);
    const span = forWhite ? 210 : 120;
    for (let x = 0; x <= span; x += 6) {
      ctx.lineTo(pad + 10 + x, sy - Math.sin(x * 0.11) * 16 - (forWhite ? 0 : x * 0.05));
    }
    ctx.stroke();
    ctx.strokeStyle = '#cfc6b2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, sy + 22);
    ctx.lineTo(w - pad, sy + 22);
    ctx.stroke();
  });
}

/** Two analog dials in one face, both stopped, black's flag about to go. */
function clockFaceTexture(): Texture {
  return localizedCanvasTexture(768, 360, (ctx, w, h) => {
    ctx.fillStyle = '#e9dcc0';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d6c6a4';
    ctx.fillRect(0, h - 26, w, 26);

    // Minutes elapsed on each side; white pressed last, so black's is behind.
    const dials: Array<[number, number]> = [
      [w * 0.735, 27],
      [w * 0.265, 24],
    ];
    for (const [cx, minutes] of dials) {
      const cy = h * 0.46;
      const r = h * 0.36;

      ctx.beginPath();
      ctx.arc(cx, cy, r + 14, 0, Math.PI * 2);
      ctx.fillStyle = '#c9a463';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#fdf8ec';
      ctx.fill();

      ctx.strokeStyle = '#3a3f47';
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        const long = i % 5 === 0;
        ctx.lineWidth = long ? 3.5 : 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * (long ? 0.80 : 0.87), cy + Math.sin(a) * r * (long ? 0.80 : 0.87));
        ctx.lineTo(cx + Math.cos(a) * r * 0.94, cy + Math.sin(a) * r * 0.94);
        ctx.stroke();
      }

      ctx.fillStyle = '#2b3038';
      ctx.font = `600 ${Math.round(r * 0.26)}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [n, a] of [[12, -Math.PI / 2], [3, 0], [6, Math.PI / 2], [9, Math.PI]] as Array<[number, number]>) {
        ctx.fillText(String(n), cx + Math.cos(a) * r * 0.65, cy + Math.sin(a) * r * 0.65);
      }

      // The flag: a red tab hanging at twelve, lifted by the minute hand.
      ctx.fillStyle = '#c2452f';
      ctx.fillRect(cx - r * 0.05, cy - r * 0.99, r * 0.10, r * 0.20);

      const hand = (angle: number, len: number, width: number) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle - Math.PI / 2);
        ctx.fillStyle = '#23282f';
        ctx.beginPath();
        ctx.moveTo(-width, width * 1.2);
        ctx.lineTo(0, -r * len);
        ctx.lineTo(width, width * 1.2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };
      hand((minutes / 720) * Math.PI * 2, 0.48, r * 0.055);
      hand((minutes / 60) * Math.PI * 2, 0.80, r * 0.038);

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.05, 0, Math.PI * 2);
      ctx.fillStyle = '#23282f';
      ctx.fill();
    }
  });
}

/** The result placard, in the register of a wall-mounted pairing sheet. */
function scoreboardTexture(): Texture {
  const HEAD: Localized = L('Round 4 · Board 1', '4. tur · 1. masa');
  const NOTE: Localized = L("Scholar's mate · 4 moves", 'Çoban matı · 4 hamle');
  const FOOT: Localized = L(
    'Reconstruction. Not submitted for rating.',
    'Temsilîdir. Puanlamaya gönderilmemiştir.',
  );

  return localizedCanvasTexture(1024, 616, (ctx, w, h) => {
    ctx.fillStyle = '#f2ece0';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3c4a3f';
    ctx.fillRect(0, 0, w, 12);
    ctx.fillRect(0, h - 12, w, 12);

    const pad = 62;
    ctx.textBaseline = 'middle';

    ctx.textAlign = 'center';
    ctx.fillStyle = '#7b8478';
    ctx.letterSpacing = '8px';
    ctx.font = `600 34px ${MONO}`;
    ctx.fillText(upper(t(HEAD)), w / 2, 76);
    ctx.letterSpacing = '0px';

    ctx.strokeStyle = '#c6bfae';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pad, 120);
    ctx.lineTo(w - pad, 120);
    ctx.stroke();

    const rows: Array<[string, string, string]> = [
      ['#f6f1e2', 'ÖZCAN, Murat', '1'],
      ['#4a4038', 'CARLSEN, Magnus', '0'],
    ];
    ctx.textAlign = 'left';
    rows.forEach(([chip, name, score], i) => {
      const y = 196 + i * 96;
      ctx.fillStyle = chip;
      ctx.fillRect(pad, y - 26, 52, 52);
      ctx.strokeStyle = '#8c8474';
      ctx.lineWidth = 3;
      ctx.strokeRect(pad, y - 26, 52, 52);

      ctx.fillStyle = '#23282e';
      ctx.font = `500 52px ${MONO}`;
      ctx.fillText(name, pad + 84, y);

      ctx.textAlign = 'right';
      ctx.font = `700 60px ${MONO}`;
      ctx.fillText(score, w - pad, y);
      ctx.textAlign = 'left';
    });

    ctx.beginPath();
    ctx.strokeStyle = '#c6bfae';
    ctx.moveTo(pad, 348);
    ctx.lineTo(w - pad, 348);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#4c5a4d';
    ctx.font = `500 44px ${MONO}`;
    ctx.fillText(t(NOTE), w / 2, 416);

    ctx.fillStyle = '#8d8778';
    ctx.font = `400 28px ${MONO}`;
    ctx.fillText(t(FOOT), w / 2, 500);

    ctx.fillStyle = '#9c9484';
    ctx.font = `400 24px ${MONO}`;
    ctx.fillText(MOVES.map(([a, b], i) => `${i + 1}.${a}${b ? ` ${b}` : ''}`).join('  '), w / 2, 552);
  });
}

// ---------------------------------------------------------------- assemblies

function tableLeg(): BufferGeometry {
  const p = new Path();
  p.moveTo(0.004, 0);
  p.lineTo(0.032, 0);
  p.lineTo(0.032, 0.022);
  p.quadraticCurveTo(0.032, 0.048, 0.021, 0.058);
  p.lineTo(0.020, 0.29);
  p.quadraticCurveTo(0.036, 0.325, 0.032, 0.365);
  p.lineTo(0.028, 0.392);
  p.lineTo(0.033, 0.406);
  p.lineTo(0.004, 0.406);
  return new LatheGeometry(p.getPoints(4), 12);
}

/**
 * A ladder-back side chair, facing -z. The back posts are raked, so anything
 * riding on them (rails, slats) has to be raked and offset by the same amount
 * or it floats off the frame.
 */
function addChair(world: HyperWorld, object: HyperObject, node: Group): void {
  const SEAT_Y = 0.28;
  const RAKE = 0.13;
  const POST_X = 0.145;
  const POST_Z = 0.135;

  const seat = new RoundedBoxGeometry(0.34, 0.032, 0.32, 2, 0.010);
  seat.translate(0, SEAT_Y - 0.016, 0);
  object.addGeometry(world.shared, seat, { color: WOOD, ambient: 0.55 }, node);

  for (const [w, d, dx, dz] of [
    [0.30, 0.020, 0, POST_Z],
    [0.30, 0.020, 0, -POST_Z],
    [0.020, 0.27, POST_X, 0],
    [0.020, 0.27, -POST_X, 0],
  ] as Array<[number, number, number, number]>) {
    const rail = new RoundedBoxGeometry(w, 0.034, d, 2, 0.007);
    rail.translate(dx, SEAT_Y - 0.050, dz);
    object.addGeometry(world.shared, rail, { color: DARKWOOD, ambient: 0.5 }, node);
  }

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const h = SEAT_Y - 0.032;
      const leg = new CylinderGeometry(0.021, 0.015, h, 8);
      leg.translate(sx * POST_X, h / 2, sz * POST_Z);
      object.addGeometry(world.shared, leg, { color: DARKWOOD, ambient: 0.48 }, node);
    }

    const h = 0.30;
    const post = new CylinderGeometry(0.017, 0.021, h, 8);
    post.translate(0, h / 2, 0);
    post.rotateX(RAKE);
    post.translate(sx * POST_X, SEAT_Y - 0.02, POST_Z);
    object.addGeometry(world.shared, post, { color: DARKWOOD, ambient: 0.5 }, node);
  }

  const railZ = (y: number) => POST_Z + (y - (SEAT_Y - 0.02)) * Math.tan(RAKE);
  for (const [y, height] of [[0.375, 0.046], [0.458, 0.046], [0.545, 0.058]] as Array<[number, number]>) {
    const slat = new RoundedBoxGeometry(0.325, height, 0.020, 2, 0.007);
    slat.rotateX(RAKE);
    slat.translate(0, y, railZ(y));
    object.addGeometry(world.shared, slat, { color: WOOD, ambient: 0.53 }, node);
  }
}

/** The analog clock: wooden case, one face, two plungers — white's is down. */
function addClock(world: HyperWorld, object: HyperObject, node: Group): void {
  const CASE_H = 0.15;
  const CASE_D = 0.10;

  const shell = new RoundedBoxGeometry(0.30, CASE_H, CASE_D, 3, 0.012);
  shell.translate(0, CASE_H / 2, 0);
  object.addGeometry(world.shared, shell, { color: 0x8f6b4c, ambient: 0.5 }, node);

  const face = new PlaneGeometry(0.272, 0.128, 1, 1);
  face.rotateY(Math.PI);
  face.translate(0, CASE_H / 2, -CASE_D / 2 - 0.002);
  object.addGeometry(
    world.shared,
    face,
    {
      map: clockFaceTexture(),
      color: 0xffffff,
      ambient: 0.9,
      castShadow: false,
      receiveShadow: false,
    },
    node,
  );

  const plate = new RoundedBoxGeometry(0.28, 0.016, 0.07, 2, 0.006);
  plate.translate(0, CASE_H + 0.006, 0);
  object.addGeometry(world.shared, plate, { color: 0xa08a6e, ambient: 0.5 }, node);

  // White is at +x and moved last, so white's plunger is the one held down.
  for (const [sx, up] of [[1, 0.012], [-1, 0.042]] as Array<[number, number]>) {
    const stem = new CylinderGeometry(0.012, 0.012, up, 10);
    stem.translate(sx * 0.098, CASE_H + 0.014 + up / 2, 0);
    object.addGeometry(world.shared, stem, { color: 0xc9b48c, ambient: 0.55 }, node);

    const cap = new CylinderGeometry(0.021, 0.021, 0.012, 12);
    cap.translate(sx * 0.098, CASE_H + 0.014 + up + 0.006, 0);
    object.addGeometry(world.shared, cap, { color: 0xd8c69f, ambient: 0.58 }, node);
  }
}

/** Paper and pen at a player's elbow, laid out for the player to read. */
function addScoresheet(
  world: HyperWorld,
  object: HyperObject,
  x: number,
  z: number,
  facing: 1 | -1,
): void {
  const sheet = new PlaneGeometry(0.145, 0.205, 1, 1);
  sheet.rotateX(-Math.PI / 2);
  sheet.rotateY(facing * (Math.PI / 2));
  sheet.translate(x, TOP_Y + 0.003, z);
  object.addGeometry(world.shared, sheet, {
    map: scoresheetTexture(facing === 1),
    color: 0xffffff,
    ambient: 0.92,
    castShadow: false,
    receiveShadow: false,
  });

  const pen = new CylinderGeometry(0.0055, 0.0055, 0.125, 8);
  pen.rotateZ(Math.PI / 2);
  pen.rotateY(facing * 0.35);
  pen.translate(x - facing * 0.052, TOP_Y + 0.0055, z + facing * 0.14);
  object.addGeometry(world.shared, pen, { color: 0x3f4a58, ambient: 0.5 });
}

export function buildChessTable(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): HyperObject {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  // ---- table: 1.08 × 0.86, top at knuckle height, four turned legs.
  const HALF_X = 0.54;
  const HALF_Z = 0.43;
  const LEG_X = 0.485;
  const LEG_Z = 0.375;

  const top = new RoundedBoxGeometry(HALF_X * 2, 0.046, HALF_Z * 2, 3, 0.014);
  top.translate(0, TOP_Y - 0.023, 0);
  object.addGeometry(world.shared, top, { color: WOOD, ambient: 0.55 });

  const apron = new RoundedBoxGeometry(0.96, 0.056, 0.74, 2, 0.012);
  apron.translate(0, TOP_Y - 0.076, 0);
  object.addGeometry(world.shared, apron, { color: DARKWOOD, ambient: 0.5 });

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = tableLeg();
      leg.translate(sx * LEG_X, 0, sz * LEG_Z);
      object.addGeometry(world.shared, leg, { color: DARKWOOD, ambient: 0.48 });
    }
  }

  for (const [w, d, dx, dz] of [
    [0.94, 0.026, 0, LEG_Z],
    [0.94, 0.026, 0, -LEG_Z],
    [0.026, 0.72, LEG_X, 0],
    [0.026, 0.72, -LEG_X, 0],
  ] as Array<[number, number, number, number]>) {
    const bar = new RoundedBoxGeometry(w, 0.030, d, 2, 0.008);
    bar.translate(dx, 0.118, dz);
    object.addGeometry(world.shared, bar, { color: DARKWOOD, ambient: 0.46 });
  }

  // ---- the board: an inlaid panel with the playing face a whisker proud.
  const panel = new RoundedBoxGeometry(FACE + 0.008, 0.014, FACE + 0.008, 2, 0.005);
  panel.translate(0, TOP_Y + 0.007, 0);
  object.addGeometry(world.shared, panel, { color: EBONY, ambient: 0.48 });

  const face = new PlaneGeometry(FACE, FACE, 1, 1);
  face.rotateX(-Math.PI / 2);
  // The canvas is painted as white sees the board; this second turn is what
  // makes that true, putting a1 at the +x/+z corner where square() puts it.
  face.rotateY(Math.PI / 2);
  face.translate(0, BOARD_Y, 0);
  object.addGeometry(world.shared, face, {
    map: boardTexture(),
    color: 0xffffff,
    ambient: 0.88,
    castShadow: false,
    receiveShadow: false,
  });

  object.addGeometry(world.shared, sideGeometry(WHITE, 1), {
    color: 0xf4edda,
    ambient: 0.5,
  });
  // "Black" is a warm rosewood — true black swallows every contour this
  // lighting model has, and the turnings are the whole point of the set.
  object.addGeometry(world.shared, sideGeometry(BLACK, -1), {
    color: 0x8a6b56,
    ambient: 0.46,
  });

  // ---- clock at the far edge, where both players and the visitor can read it.
  const clockNode = new Group();
  clockNode.position.set(0, TOP_Y, 0.355);
  clockNode.rotation.y = 0.06;
  object.add(clockNode);
  addClock(world, object, clockNode);

  // ---- scoresheets on the near edge, one at each player's elbow.
  addScoresheet(world, object, 0.402, -0.115, 1);
  addScoresheet(world, object, -0.402, 0.115, -1);

  // ---- chairs, pushed back from a game that finished early.
  for (const [sx, skew] of [[1, 0.05], [-1, -0.34]] as Array<[number, number]>) {
    const chair = new Group();
    chair.position.set(sx * 0.80, 0, sx * 0.03);
    chair.rotation.y = sx * (Math.PI / 2) + skew;
    object.add(chair);
    addChair(world, object, chair);
  }

  // ---- the scoreboard, standing behind the far edge.
  const boardNode = new Group();
  boardNode.position.set(0, 0, 0.98);
  object.add(boardNode);

  const PANEL_W = 0.96;
  const PANEL_H = 0.58;
  const PANEL_CY = 0.92;
  const F = 0.055;

  for (const sx of [-1, 1]) {
    const h = PANEL_CY + PANEL_H / 2 + 0.04;
    const post = new CylinderGeometry(0.024, 0.032, h, 10);
    post.translate(sx * (PANEL_W / 2 - 0.05), h / 2, 0.03);
    object.addGeometry(world.shared, post, { color: DARKWOOD, ambient: 0.48 }, boardNode);

    const shoe = new RoundedBoxGeometry(0.09, 0.036, 0.30, 2, 0.010);
    shoe.translate(sx * (PANEL_W / 2 - 0.05), 0.018, 0.03);
    object.addGeometry(world.shared, shoe, { color: DARKWOOD, ambient: 0.46 }, boardNode);
  }

  for (const [w, hh, dx, dy] of [
    [PANEL_W, F, 0, PANEL_H / 2],
    [PANEL_W, F, 0, -PANEL_H / 2],
    [F, PANEL_H + F, PANEL_W / 2 - F / 2, 0],
    [F, PANEL_H + F, -(PANEL_W / 2 - F / 2), 0],
  ] as Array<[number, number, number, number]>) {
    const bar = new RoundedBoxGeometry(w, hh, 0.042, 2, 0.010);
    bar.translate(dx, PANEL_CY + dy, 0);
    object.addGeometry(world.shared, bar, { color: DARKWOOD, ambient: 0.5 }, boardNode);
  }

  // Two single-sided planes back to back, never a slab: under the Möbius warp
  // a coarse backing rasterises as a chord that bows through the face in front
  // of it. Opposite-facing planes cannot fight.
  const placard = new PlaneGeometry(PANEL_W - F, PANEL_H - F, 6, 4);
  placard.rotateY(Math.PI);
  placard.translate(0, PANEL_CY, -0.013);
  object.addGeometry(
    world.shared,
    placard,
    {
      map: scoreboardTexture(),
      color: 0xffffff,
      ambient: 0.9,
      receiveShadow: false,
    },
    boardNode,
  );

  const backing = new PlaneGeometry(PANEL_W - F, PANEL_H - F, 6, 4);
  backing.translate(0, PANEL_CY, 0.013);
  object.addGeometry(
    world.shared,
    backing,
    { color: 0x6b6357, ambient: 0.5, receiveShadow: false },
    boardNode,
  );

  world.add(object);
  return object;
}
