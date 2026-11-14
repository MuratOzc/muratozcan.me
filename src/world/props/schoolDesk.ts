import { CylinderGeometry, Group, PlaneGeometry } from 'three';
import { RoundedBoxGeometry } from '../geometry';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';
import { localizedCanvasTexture } from '../text';

/**
 * Station 2: maths and computers.
 *
 * A school desk with a CRT on it and a chalkboard behind. Every line on the
 * board is load-bearing rather than set dressing — spherical Pythagoras and
 * the bearing beside it are the literal arithmetic in placement.ts that puts
 * every object in this world where it is, this board included, and the rest
 * are the invariants the engine self-tests hold the renderer to. If a formula
 * here were wrong the world would be too.
 *
 * No prose, nothing level, nothing at one size: a board somebody worked on,
 * not a poster. Which also means it needs no translation.
 *
 * Layout: the board and the desk are two separately-angled nodes, staggered
 * so that from the path you read the whole board with the desk beside it —
 * nothing stands in front of anything.
 */

interface Chalk {
  text: string;
  /** Left edge and centre line, in texture pixels. */
  x: number;
  y: number;
  size: number;
  /** Radians of tilt. Nothing on a real board is level. */
  rot: number;
  /** Chalk that went on lighter, or has been leaned on since. */
  tone?: string;
  underline?: boolean;
  ring?: boolean;
}

/**
 * Angle letters and side letters are kept apart on purpose: α β γ are always
 * interior angles, a b r are always arc lengths, φ is a bearing and θ is the
 * distance from the eye. Reuse one across two lines and the board stops being
 * checkable.
 */
const CHALK: Chalk[] = [
  { text: 'cos r = cos a · cos b', x: 48, y: 96, size: 76, rot: -0.03, underline: true },
  { text: 'K = +1', x: 1000, y: 88, size: 58, rot: 0.06 },

  { text: 'tan φ = tan b / sin a', x: 96, y: 216, size: 54, rot: 0.025 },
  { text: 'δ = s / sin θ', x: 790, y: 206, size: 60, rot: -0.05 },

  { text: 'sin α / sin a = sin β / sin b', x: 56, y: 332, size: 44, rot: -0.018, tone: '#c3d0bd' },
  { text: 'C = 2π sin r', x: 800, y: 326, size: 52, rot: 0.055 },

  { text: 'α + β + γ = π + E', x: 88, y: 448, size: 62, rot: 0.02 },
  { text: '2π ≡ 0', x: 880, y: 440, size: 68, rot: -0.07, ring: true },

  { text: 'Σ = 3π/2  ⇒  E = π/2', x: 60, y: 558, size: 44, rot: 0.04, tone: '#b9c6b4' },
  { text: 'A = 4π', x: 860, y: 546, size: 48, rot: -0.035 },

  { text: 'd(p,q) = 2 arctan |p ⊕ (−q)|', x: 76, y: 652, size: 40, rot: -0.022, tone: '#c3d0bd' },
  { text: 'r ∈ [0, π]', x: 900, y: 644, size: 38, rot: 0.05, tone: '#b9c6b4' },
];

/** Set the largest font that fits, instead of letting text run off the board. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  family: string,
): void {
  let size = startPx;
  do {
    ctx.font = `400 ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 3;
  } while (size > 12);
}

function chalkboardTexture() {
  return localizedCanvasTexture(1280, 720, (ctx, w, h) => {
    ctx.fillStyle = '#2e4038';
    ctx.fillRect(0, 0, w, h);

    // Wipe marks, drawn under everything: a board that has been used.
    ctx.strokeStyle = '#374a41';
    ctx.lineWidth = 30;
    for (let i = 0; i < 7; i++) {
      const y = 80 + i * 96;
      ctx.beginPath();
      ctx.moveTo(30, y + Math.sin(i * 2.1) * 16);
      ctx.lineTo(w - 30, y + Math.sin(i * 1.3 + 1) * 20);
      ctx.stroke();
    }

    // Greek and the maths signs are not in the script faces, so the stack ends
    // with a text font that has them — without it they fall through to tofu.
    const script = '"Segoe Script", "Comic Sans MS", "Segoe UI", cursive';

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (const line of CHALK) {
      ctx.save();
      ctx.translate(line.x, line.y);
      ctx.rotate(line.rot);

      // Measured after fitting, never assumed: the marks below have to match
      // whatever size the text actually landed on.
      fitText(ctx, line.text, w - line.x - 32, line.size, script);
      const tw = ctx.measureText(line.text).width;

      ctx.fillStyle = line.tone ?? '#e6ecdf';
      ctx.fillText(line.text, 0, 0);

      ctx.strokeStyle = ctx.fillStyle;
      if (line.underline) {
        ctx.lineWidth = 3;
        for (const [dy, from, to] of [[0.62, 0, 1], [0.72, 0.06, 0.93]]) {
          ctx.beginPath();
          ctx.moveTo(tw * from, line.size * dy);
          ctx.lineTo(tw * to, line.size * dy + 3);
          ctx.stroke();
        }
      }
      if (line.ring) {
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(tw / 2, 0, tw * 0.72, line.size * 0.82, 0.06, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Chalk dust on the tray edge.
    ctx.fillStyle = '#3a4d44';
    ctx.fillRect(0, h - 20, w, 20);
  });
}

function crtScreenTexture() {
  return localizedCanvasTexture(512, 400, (ctx, w, h) => {
    ctx.fillStyle = '#101b12';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#69d47a';
    ctx.font = '400 42px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('> _', 26, 22);
    ctx.fillStyle = '#0c140dbb';
    for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2);
  });
}

export function buildSchoolDesk(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): HyperObject {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  const WOOD = 0xb08d62;
  const DARKWOOD = 0x8a6f52;

  // ---------------- the chalkboard, set back-left and turned a touch.
  const boardNode = new Group();
  boardNode.position.set(-0.5, 0, -0.6);
  boardNode.rotation.y = -0.16;
  object.add(boardNode);

  const BOARD_W = 2.4;
  const BOARD_H = 1.3;
  const BOARD_CY = 1.15;

  for (const side of [-1, 1]) {
    const post = new CylinderGeometry(0.045, 0.055, BOARD_CY + BOARD_H / 2 + 0.12, 12);
    post.translate(side * (BOARD_W / 2 - 0.1), (BOARD_CY + BOARD_H / 2 + 0.12) / 2, -0.05);
    object.addGeometry(world.shared, post, { color: DARKWOOD, ambient: 0.48 }, boardNode);
  }

  // Frame: four rounded bars, corners overlapping in the same colour so the
  // joins read as mitres rather than gaps.
  const F = 0.07;
  for (const [dx, dy, w, hh] of [
    [0, BOARD_H / 2, BOARD_W, F],
    [0, -BOARD_H / 2, BOARD_W, F],
    [BOARD_W / 2 - F / 2 + 0.001, 0, F, BOARD_H + F],
    [-(BOARD_W / 2 - F / 2 + 0.001), 0, F, BOARD_H + F],
  ] as Array<[number, number, number, number]>) {
    const bar = new RoundedBoxGeometry(w, hh, 0.05, 2, 0.012);
    bar.translate(dx, BOARD_CY + dy, 0);
    object.addGeometry(world.shared, bar, { color: DARKWOOD, ambient: 0.5 }, boardNode);
  }

  // The board, and the chalk as a face a few millimetres proud of it.
  const SLATE_T = 0.024;
  const slate = new RoundedBoxGeometry(BOARD_W - F, BOARD_H - F, SLATE_T, 2, 0.004);
  slate.translate(0, BOARD_CY, 0);
  object.addGeometry(world.shared, slate, { color: 0x6b6357, ambient: 0.5 }, boardNode);

  const chalkFace = new PlaneGeometry(BOARD_W - F, BOARD_H - F, 8, 5);
  chalkFace.translate(0, BOARD_CY, SLATE_T / 2 + 0.004);
  object.addGeometry(
    world.shared,
    chalkFace,
    {
      map: chalkboardTexture(),
      color: 0xffffff,
      ambient: 0.92,
      castShadow: false,
      receiveShadow: false,
    },
    boardNode,
  );

  const tray = new RoundedBoxGeometry(BOARD_W * 0.55, 0.03, 0.08, 2, 0.01);
  tray.translate(0, BOARD_CY - BOARD_H / 2 - 0.055, 0.05);
  object.addGeometry(world.shared, tray, { color: DARKWOOD, ambient: 0.5 }, boardNode);

  // ---------------- the desk, forward-right and angled the other way, so it
  // presents its CRT without covering a single word of chalk.
  const deskNode = new Group();
  // Far enough right that the CRT clears the board's right edge dead-on:
  // board spans x -1.7..0.7, the CRT sits at x ≈ 0.93.
  deskNode.position.set(1.17, 0, 0.35);
  deskNode.rotation.y = 0.5;
  object.add(deskNode);

  const TOP_Y = 0.74;
  const top = new RoundedBoxGeometry(1.2, 0.05, 0.72, 3, 0.015);
  top.translate(0, TOP_Y, 0);
  object.addGeometry(world.shared, top, { color: WOOD, ambient: 0.55 }, deskNode);

  const apron = new RoundedBoxGeometry(1.06, 0.09, 0.58, 2, 0.012);
  apron.translate(0, TOP_Y - 0.07, 0);
  object.addGeometry(world.shared, apron, { color: DARKWOOD, ambient: 0.5 }, deskNode);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // Legs tucked under the top, tapered, never poking through it.
      const leg = new CylinderGeometry(0.026, 0.020, TOP_Y - 0.025, 10);
      leg.translate(sx * 0.5, (TOP_Y - 0.025) / 2, sz * 0.25);
      object.addGeometry(world.shared, leg, { color: DARKWOOD, ambient: 0.48 }, deskNode);
    }
  }

  // CRT on the desk's left half, angled its own few degrees.
  const crtNode = new Group();
  crtNode.position.set(-0.24, 0, -0.02);
  crtNode.rotation.y = -0.2;
  deskNode.add(crtNode);

  const crtBase = TOP_Y + 0.025;
  const foot = new RoundedBoxGeometry(0.34, 0.05, 0.3, 2, 0.015);
  foot.translate(0, crtBase + 0.025, 0);
  object.addGeometry(world.shared, foot, { color: 0xcac3b2, ambient: 0.52 }, crtNode);

  const shell = new RoundedBoxGeometry(0.46, 0.4, 0.42, 3, 0.03);
  shell.translate(0, crtBase + 0.05 + 0.2, 0.02);
  object.addGeometry(world.shared, shell, { color: 0xd6cfbd, ambient: 0.55 }, crtNode);

  const bezel = new RoundedBoxGeometry(0.4, 0.34, 0.03, 2, 0.012);
  bezel.translate(0, crtBase + 0.05 + 0.2, 0.225);
  object.addGeometry(world.shared, bezel, { color: 0xbfb8a6, ambient: 0.5 }, crtNode);

  const screen = new PlaneGeometry(0.33, 0.26, 1, 1);
  screen.translate(0, crtBase + 0.05 + 0.2, 0.242);
  object.addGeometry(
    world.shared,
    screen,
    {
      map: crtScreenTexture(),
      color: 0xffffff,
      ambient: 0.98,
      castShadow: false,
      receiveShadow: false,
    },
    crtNode,
  );

  // Keyboard on the desk's right half, in front of nobody.
  const keyboard = new RoundedBoxGeometry(0.42, 0.025, 0.15, 2, 0.01);
  keyboard.rotateX(-0.06);
  keyboard.rotateY(0.12);
  keyboard.translate(0.3, TOP_Y + 0.037, 0.12);
  object.addGeometry(world.shared, keyboard, { color: 0xc2bba9, ambient: 0.55 }, deskNode);

  world.add(object);
  return object;
}
