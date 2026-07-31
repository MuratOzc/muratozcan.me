import { BoxGeometry, PlaneGeometry } from 'three';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';
import { L, type Localized } from '../../content/i18n';
import { makeLocalizedTextTexture } from '../text';

/**
 * Station 1: the title problem, as furniture.
 *
 * A post carrying every title that technically applies, each one struck
 * through, and a blank plate on top. The strike-through is a physical bar in
 * front of the plate rather than part of the texture, so it reads at a glance
 * even when the text is too far to resolve.
 */

const PLATES: Localized[] = [
  L('SOFTWARE ENGINEER', 'YAZILIM MÜHENDİSİ'),
  L('DEVOPS', 'DEVOPS'),
  L('CTO', 'CTO'),
  L('IT GUY', 'IT’Cİ'),
  L('MATHS GUY', 'MATEMATİKÇİ'),
  L('COMPUTER GUY', 'BİLGİSAYARCI'),
];

const PLATE_W = 1.05;
const PLATE_H = 0.2;
const FIRST_AT_Y = 0.62;
const SPACING = 0.33;

export function buildSignpost(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): HyperObject {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  const poleH = FIRST_AT_Y + PLATES.length * SPACING + 0.55;
  const pole = new BoxGeometry(0.12, poleH, 0.12, 1, 10, 1);
  pole.translate(0, poleH / 2, 0);
  object.addGeometry(world.shared, pole, { color: 0x8e8878, ambient: 0.55 });

  PLATES.forEach((title, i) => {
    // Alternate a slight skew so the stack reads as accumulated over time,
    // not machined in one go.
    const tilt = (i % 2 === 0 ? 1 : -1) * 0.06;
    const y = FIRST_AT_Y + i * SPACING;

    const plate = new BoxGeometry(PLATE_W, PLATE_H, 0.03, 6, 2, 1);
    plate.translate(0, y, 0.08);
    plate.rotateY(tilt);
    object.addGeometry(world.shared, plate, { color: 0xd8d2c4, ambient: 0.6 });

    const face = new PlaneGeometry(PLATE_W * 0.94, PLATE_H * 0.8, 6, 2);
    face.translate(0, y, 0.097);
    face.rotateY(tilt);
    object.addGeometry(world.shared, face, {
      map: makeLocalizedTextTexture(title, {
        width: 1024,
        height: 192,
        color: '#2b3138',
        letterSpacing: 6,
      }),
      color: 0xffffff,
      ambient: 0.9,
      alphaTest: 0.3,
      alphaBlend: true,
      castShadow: false,
      receiveShadow: false,
    });

    // The strike: a bar floating just in front of the text.
    const strike = new BoxGeometry(PLATE_W * 0.8, 0.026, 0.012, 4, 1, 1);
    strike.translate(0, y, 0.105);
    strike.rotateY(tilt);
    strike.rotateZ(0.045);
    object.addGeometry(world.shared, strike, { color: 0x743b32, ambient: 0.5 });
  });

  // The blank plate, on top and straight — the only one taken seriously.
  const blankY = FIRST_AT_Y + PLATES.length * SPACING + 0.16;
  const blank = new BoxGeometry(PLATE_W, PLATE_H * 1.15, 0.03, 6, 2, 1);
  blank.translate(0, blankY, 0.08);
  object.addGeometry(world.shared, blank, { color: 0xefece3, ambient: 0.68 });

  world.add(object);
  return object;
}
