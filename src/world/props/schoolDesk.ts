import { BoxGeometry, PlaneGeometry } from 'three';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';
import { t, type Localized } from '../../content/i18n';
import { L } from '../../content/i18n';
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

function chalkboardTexture() {
  return localizedCanvasTexture(1024, 640, (ctx, w, h) => {
    ctx.fillStyle = '#2e4038';
    ctx.fillRect(0, 0, w, h);
    // Chalk dust along the tray edge.
    ctx.fillStyle = '#3a4d44';
    ctx.fillRect(0, h - 26, w, 26);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#e6ecdf';
    ctx.font = '400 110px "Segoe Script", "Comic Sans MS", cursive';
    ctx.fillText('cos r = cos a · cos b', w / 2, h * 0.34);

    ctx.fillStyle = '#b9c6b4';
    ctx.font = '400 44px "Segoe Script", "Comic Sans MS", cursive';
    ctx.fillText(t(CAPTION), w / 2, h * 0.58);

    ctx.fillStyle = '#8fa08e';
    ctx.font = '400 34px ui-monospace, Consolas, monospace';
    ctx.fillText(t(SCHOOL), w / 2, h * 0.82);
  });
}

function crtScreenTexture() {
  return localizedCanvasTexture(512, 384, (ctx, w, h) => {
    ctx.fillStyle = '#101b12';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#69d47a';
    ctx.font = '400 44px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('> _', 28, 24);
    // Scanlines, cheap and effective.
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

  // ---- desk
  const top = new BoxGeometry(1.1, 0.05, 0.65, 4, 1, 3);
  top.translate(0, 0.72, 0.25);
  object.addGeometry(world.shared, top, { color: 0xa5906c, ambient: 0.55 });
  for (const sx of [-1, 1]) {
    for (const sz of [0, 1]) {
      const leg = new BoxGeometry(0.06, 0.7, 0.06, 1, 4, 1);
      leg.translate(sx * 0.48, 0.35, 0.02 + sz * 0.46);
      object.addGeometry(world.shared, leg, { color: 0x6f6252, ambient: 0.5 });
    }
  }

  // ---- CRT on the desk: shell, then the inset screen.
  const shell = new BoxGeometry(0.5, 0.42, 0.44, 3, 3, 3);
  shell.translate(0, 0.745 + 0.21, 0.22);
  object.addGeometry(world.shared, shell, { color: 0xcac3b2, ambient: 0.55 });
  const screen = new PlaneGeometry(0.38, 0.3, 3, 3);
  screen.translate(0, 0.745 + 0.22, 0.4425);
  object.addGeometry(world.shared, screen, {
    map: crtScreenTexture(),
    color: 0xffffff,
    ambient: 0.98,
    castShadow: false,
  });

  // ---- chalkboard behind, on two posts.
  const BOARD_W = 2.3;
  const BOARD_H = 1.35;
  const BOARD_Y = 1.05;
  for (const side of [-1, 1]) {
    const post = new BoxGeometry(0.09, BOARD_Y + BOARD_H / 2 + 0.1, 0.09, 1, 8, 1);
    post.translate(side * (BOARD_W / 2 - 0.12), (BOARD_Y + BOARD_H / 2 + 0.1) / 2, -0.55);
    object.addGeometry(world.shared, post, { color: 0x6f6252, ambient: 0.5 });
  }
  const frame = new BoxGeometry(BOARD_W, BOARD_H, 0.06, 10, 6, 1);
  frame.translate(0, BOARD_Y, -0.55);
  object.addGeometry(world.shared, frame, { color: 0x8a7a5e, ambient: 0.5 });
  const board = new PlaneGeometry(BOARD_W - 0.14, BOARD_H - 0.14, 10, 6);
  board.translate(0, BOARD_Y, -0.515);
  object.addGeometry(world.shared, board, {
    map: chalkboardTexture(),
    color: 0xffffff,
    ambient: 0.92,
    castShadow: false,
  });

  world.add(object);
  return object;
}
