import {
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  PlaneGeometry,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';
import { L } from '../../content/i18n';
import { units, type Poi } from '../placement';
import { PORTRAIT_ART } from './portraitArt';

/**
 * The figure at your back: a portrait hanging in the air, inside an open frame.
 *
 * The print is ASCII art with nothing behind it — the sky shows through the gaps
 * between the glyphs — and it floats clear of the ground, so the frame has three
 * sides and the fourth is the space the picture hangs in.
 *
 * WHAT IT DOES OVER THE WALK. This stands on the great circle through spawn, so
 * distance shrinks it only until the quarter turn and then it grows back. Up
 * close it is a wall of characters; out at the quarter turn the glyphs stop
 * resolving and it reads as a face. One legible band per lap, abstract at both
 * ends of it.
 *
 * THE COST OF TRANSPARENCY. Cutout alpha and mipmaps disagree: a sparse `.` cell
 * averages down to a few percent alpha in the upper mips, so the light tones
 * drop out with distance and what survives is nearer a silhouette than a grey.
 * `alphaTest` is set low to hold the tonal range as long as it can. An opaque
 * plate would keep all of it — and would stop being a cutout.
 */

/** Glyph cell, in texture pixels. Height is twice width; see PORTRAIT_ART. */
const CELL_W = 10;
const CELL_H = 20;

const INK = '#23282e';
const FRAME = 0x14171a;

/** Height of the print, in authored units. The viewer is 1 unit tall. */
const PRINT_H = 0.9;
/** Square section of the frame stock. */
const BAR = 0.045;
/** Clear air between the print and the frame on the three closed sides. */
const GAP = 0.11;
/** How high the print's bottom edge hangs above the ground. */
const HOVER = 0.52;

/**
 * The art, painted at one glyph per cell on a transparent ground.
 *
 * Per-character fillText rather than a line at a time: the columns have to land
 * on an exact grid for the tone to stay even, and letter-spacing a whole string
 * accumulates rounding across 200 columns.
 */
function makePortraitTexture(): { texture: Texture; aspect: number } {
  const cols = Math.max(...PORTRAIT_ART.map((r) => r.length));

  const canvas = document.createElement('canvas');
  canvas.width = cols * CELL_W;
  canvas.height = PORTRAIT_ART.length * CELL_H;
  const ctx = canvas.getContext('2d')!;

  // Scale the glyph so its advance IS the cell width. The ramp only reads as
  // tone if `@` nearly fills its cell and `.` nearly does not, and that ratio is
  // a property of the font, so it has to be measured rather than assumed.
  const MONO = 'ui-monospace, Consolas, monospace';
  ctx.font = `100px ${MONO}`;
  ctx.font = `${(CELL_W / ctx.measureText('@').width) * 100}px ${MONO}`;

  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  PORTRAIT_ART.forEach((line, r) => {
    const y = r * CELL_H + CELL_H / 2;
    for (let c = 0; c < line.length; c++) {
      if (line[c] !== ' ') ctx.fillText(line[c], c * CELL_W + CELL_W / 2, y);
    }
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // The mip chain is not a nicety here, it is the picture: every level above the
  // first is what turns glyph coverage back into a tone.
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;

  return { texture, aspect: canvas.width / canvas.height };
}

/**
 * The portrait and the frame around it.
 *
 * Nothing here is sized twice: the print's width comes from the texture's real
 * aspect, the opening is the print plus GAP, and the frame is the opening plus
 * BAR. Change PRINT_H and the whole thing follows.
 */
export function buildPortrait(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): { object: HyperObject; poi: Poi } {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  const { texture, aspect } = makePortraitTexture();
  const printW = PRINT_H * aspect;

  const openW = printW + GAP * 2;
  const openTop = HOVER + PRINT_H + GAP;
  const postH = openTop + BAR;

  // The posts start below ground. The ground is a tessellated sphere and bulges
  // up mid-quad, which eats anything this thin that stops exactly at zero.
  const SUNK = 0.04;
  const bars = [-1, 1].map((sx) => {
    const post = new RoundedBoxGeometry(BAR, postH + SUNK, BAR, 3, 0.008);
    post.translate((sx * (openW + BAR)) / 2, (postH - SUNK) / 2, 0);
    return post;
  });
  const lintel = new RoundedBoxGeometry(openW + BAR * 2, BAR, BAR, 3, 0.008);
  lintel.translate(0, openTop + BAR / 2, 0);
  bars.push(lintel);
  object.addGeometry(world.shared, mergeGeometries(bars), {
    color: FRAME,
    ambient: 0.45,
  });

  // The print. Double-sided rather than two back-to-back planes: a second plane
  // would show its own mirrored glyphs through the gaps in the first. The back
  // is therefore a mirror image, which on a field of characters reads as the
  // same picture.
  const face = new PlaneGeometry(printW, PRINT_H, 1, 1);
  face.translate(0, HOVER + PRINT_H / 2, 0);
  object.addGeometry(world.shared, face, {
    map: texture,
    color: 0xffffff,
    // Flat out. At 1.0 the shader's diffuse term cancels entirely, which is what
    // makes the unflipped normal on the back face harmless.
    ambient: 1.0,
    // Low, not the 0.5 default: this is a tonal picture, not a stencil, and the
    // sparse end of the ramp has to survive as far out as it can.
    alphaTest: 0.04,
    side: DoubleSide,
    // A vertical sheet under a near-overhead light casts a sliver of nothing,
    // and with ambient flat it cannot show a received shadow either.
    castShadow: false,
    receiveShadow: false,
  });

  world.add(object);

  return {
    object,
    poi: {
      id: 'me',
      title: L('Murat Özcan', 'Murat Özcan'),
      body: L(
        'Sixteen characters and a space, one glyph to a cell, with the sky behind them. Stand here and it is noise. It only becomes a face from further off than you can get without walking.',
        'On altı karakter ve bir boşluk, hücre başına bir glif, arkasında gökyüzü. Burada dururken gürültü. Yüze dönüşmesi için yürümeden varamayacağın kadar uzaklaşmak gerekiyor.',
      ),
      gv: at,
      radius: units(6),
    },
  };
}
