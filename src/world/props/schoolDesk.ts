import { CylinderGeometry, PlaneGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';
import { L, t, type Localized } from '../../content/i18n';
import { localizedCanvasTexture } from '../text';

/**
 * Station 2: maths and computers.
 *
 * A school desk with a CRT on it and a chalkboard behind. The board shows the
 * spherical Pythagoras — cos r = cos a · cos b — which is not set dressing:
 * it is the literal equation in placement.ts that positions every object in
 * this world, this board included. The one formula from school that turned
 * out to be load-bearing.
 */

const CAPTION: Localized = L(
  'spherical pythagoras — this world runs on it',
  'küresel pisagor — bu dünya bununla çalışıyor',
);
const SCHOOL: Localized = L(
  'Yıldız Technical University · Mathematical Engineering · 2018–2024',
  'Yıldız Teknik Üniversitesi · Matematik Mühendisliği · 2018–2024',
);

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

    const script = '"Segoe Script", "Comic Sans MS", cursive';
    const mono = 'ui-monospace, Consolas, monospace';
    const maxW = w * 0.88;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#e6ecdf';
    fitText(ctx, 'cos r = cos a · cos b', maxW, 120, script);
    ctx.fillText('cos r = cos a · cos b', w / 2, h * 0.32);

    ctx.fillStyle = '#b9c6b4';
    fitText(ctx, t(CAPTION), maxW, 52, script);
    ctx.fillText(t(CAPTION), w / 2, h * 0.56);

    ctx.fillStyle = '#93a591';
    fitText(ctx, t(SCHOOL), maxW, 40, mono);
    ctx.fillText(t(SCHOOL), w / 2, h * 0.82);

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

  // ---------------- desk: rounded top, apron, four turned legs.
  const TOP_Y = 0.74;
  const top = new RoundedBoxGeometry(1.2, 0.05, 0.72, 3, 0.015);
  top.translate(0, TOP_Y, 0.28);
  object.addGeometry(world.shared, top, { color: WOOD, ambient: 0.55 });

  const apron = new RoundedBoxGeometry(1.06, 0.09, 0.58, 2, 0.012);
  apron.translate(0, TOP_Y - 0.07, 0.28);
  object.addGeometry(world.shared, apron, { color: DARKWOOD, ambient: 0.5 });

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // Legs tucked under the top, tapered, never poking through it.
      const leg = new CylinderGeometry(0.026, 0.020, TOP_Y - 0.025, 10);
      leg.translate(sx * 0.5, (TOP_Y - 0.025) / 2, 0.28 + sz * 0.25);
      object.addGeometry(world.shared, leg, { color: DARKWOOD, ambient: 0.48 });
    }
  }

  // ---------------- CRT: shell, bezel, inset screen, foot. Sits ON the desk.
  const crtBase = TOP_Y + 0.025;
  const foot = new RoundedBoxGeometry(0.34, 0.05, 0.3, 2, 0.015);
  foot.translate(0, crtBase + 0.025, 0.26);
  object.addGeometry(world.shared, foot, { color: 0xcac3b2, ambient: 0.52 });

  const shell = new RoundedBoxGeometry(0.46, 0.4, 0.42, 3, 0.03);
  shell.translate(0, crtBase + 0.05 + 0.2, 0.28);
  object.addGeometry(world.shared, shell, { color: 0xd6cfbd, ambient: 0.55 });

  const bezel = new RoundedBoxGeometry(0.4, 0.34, 0.03, 2, 0.012);
  bezel.translate(0, crtBase + 0.05 + 0.2, 0.485);
  object.addGeometry(world.shared, bezel, { color: 0xbfb8a6, ambient: 0.5 });

  const screen = new PlaneGeometry(0.33, 0.26, 3, 3);
  screen.translate(0, crtBase + 0.05 + 0.2, 0.502);
  object.addGeometry(world.shared, screen, {
    map: crtScreenTexture(),
    color: 0xffffff,
    ambient: 0.98,
    castShadow: false,
  });

  const keyboard = new RoundedBoxGeometry(0.42, 0.025, 0.15, 2, 0.01);
  keyboard.rotateX(-0.06);
  keyboard.translate(0, crtBase + 0.012, 0.55);
  object.addGeometry(world.shared, keyboard, { color: 0xc2bba9, ambient: 0.55 });

  // ---------------- chalkboard: two posts, mitred frame, inset board, tray.
  const BOARD_W = 2.4;
  const BOARD_H = 1.3;
  const BOARD_CY = 1.15;
  const BOARD_Z = -0.55;

  for (const side of [-1, 1]) {
    const post = new CylinderGeometry(0.045, 0.055, BOARD_CY + BOARD_H / 2 + 0.12, 12);
    post.translate(side * (BOARD_W / 2 - 0.1), (BOARD_CY + BOARD_H / 2 + 0.12) / 2, BOARD_Z - 0.05);
    object.addGeometry(world.shared, post, { color: DARKWOOD, ambient: 0.48 });
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
    bar.translate(dx, BOARD_CY + dy, BOARD_Z);
    object.addGeometry(world.shared, bar, { color: DARKWOOD, ambient: 0.5 });
  }

  const board = new PlaneGeometry(BOARD_W - F, BOARD_H - F, 8, 5);
  board.translate(0, BOARD_CY, BOARD_Z + 0.026);
  object.addGeometry(world.shared, board, {
    map: chalkboardTexture(),
    color: 0xffffff,
    ambient: 0.92,
    castShadow: false,
  });

  const tray = new RoundedBoxGeometry(BOARD_W * 0.55, 0.03, 0.08, 2, 0.01);
  tray.translate(0, BOARD_CY - BOARD_H / 2 - 0.055, BOARD_Z + 0.05);
  object.addGeometry(world.shared, tray, { color: DARKWOOD, ambient: 0.5 });

  world.add(object);
  return object;
}
