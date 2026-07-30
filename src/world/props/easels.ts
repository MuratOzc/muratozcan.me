import {
  CylinderGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type BufferGeometry,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HyperObject, type HyperWorld } from '../../engine';
import { L } from '../../content/i18n';
import { placeOnGround, units, type Poi } from '../placement';

/**
 * Three easels, ringed around the left pole — the exact mirror of the chess
 * table, which stands on the right one.
 *
 * The stations are the job. This is the other half: digital images and video
 * made for no client, some of it what the inside of my head looks like and some
 * of it a joke I wanted to see rendered properly.
 *
 * ARRANGEMENT. The three stand on a small circle facing OUTWARD, 120 degrees
 * apart, like a pinwheel. Approach from any bearing and one canvas is square on
 * to you — a row facing one way is invisible from three quarters of the world,
 * which for a landmark at the pole is most of it.
 *
 * ASPECT IS TAKEN FROM THE IMAGE, NOT AUTHORED. Each easel declares a box the
 * canvas has to fit inside, and the canvas is sized from the loaded texture's
 * real pixel dimensions to fill that box without distortion. These files are
 * meant to be swapped, so no dimension here is written down twice.
 *
 * THE FRAME LEANS WITH THE CANVAS. The front legs, the back rest and the canvas
 * all share one slope, `LEAN`, so the frame sits a constant 0.06 behind the
 * picture at every height instead of converging toward it. That is the fix for
 * the legs cutting across the painting near the top: an A-frame whose apex is
 * near z = 0 will always cross a canvas that leans away from it, no matter how
 * the canvas is positioned.
 */

interface EaselSpec {
  /** Azimuth around the pole, degrees. Sets both the spot and the facing. */
  azimuth: number;
  /** The box the canvas must fit inside, in authored units. */
  maxW: number;
  maxH: number;
  url: string;
}

/** Angular radius of the ring, radians. 0.14 is 1.4 authored units. */
const RING = 0.14;

const EASELS: EaselSpec[] = [
  { azimuth: 90, maxW: 0.62, maxH: 0.8, url: '/images/easel1.png' },
  { azimuth: 210, maxW: 0.44, maxH: 0.58, url: '/images/easel2.webp' },
  { azimuth: 330, maxW: 0.55, maxH: 0.42, url: '/images/easel3.jpeg' },
];

const WOOD = 0xb08a5e;
const WOOD_DARK = 0x8d6f4a;
const LINEN = 0xd8cdb6;

/** Lean of the canvas, and so of the whole frame. */
const TILT = -0.14;
const LEAN = Math.tan(TILT);
const COS_T = Math.cos(TILT);
const SIN_T = Math.sin(TILT);
const CANVAS_T = 0.028;
/** Top of the flagstone: where every foot lands. */
const GROUND = 0.07;
/** How far in front of the picture the feet plant. */
const Z_FOOT = 0.04;

/**
 * The left pole, and the plane tangent to the ground sphere there.
 *
 * The path runs through x = 0, so x = -1 is a quarter turn to its left and the
 * mirror of the chess table's (1, 0, 0). Note that placeAlongPath cannot express
 * this point: a lateral offset of exactly a quarter turn is the degenerate case
 * where the perpendicular from the path stops being unique.
 */
const POLE = new Vector3(-1, 0, 0);
const TANGENT_A = new Vector3(0, 1, 0);
const TANGENT_B = new Vector3(0, 0, 1);

/** Ground-sphere unit vector -> a placement. */
function groundGV(v: Vector3) {
  return placeOnGround(Math.atan2(v.x, -v.z), Math.acos(Math.max(-1, Math.min(1, v.y))));
}

/**
 * Yaw at `from` that points local -z at `to`.
 *
 * Measured rather than derived: a GyroVector built by translation carries a
 * parallel-transported frame, so an object out at the pole is not already
 * pointing anywhere in particular.
 */
function yawToward(from: Vector3, to: Vector3): number {
  const here = groundGV(from);
  const local = here.inverse().transformPoint(groundGV(to).point());
  return Math.atan2(-local.x, -local.z);
}

/**
 * A beam between two points. Built along its own Y and then rotated onto the
 * axis, which is what lets the legs splay in two directions at once instead of
 * being confined to one plane.
 */
function strut(a: Vector3, b: Vector3, t: number): BufferGeometry {
  const dir = b.clone().sub(a);
  const g = new RoundedBoxGeometry(t, dir.length(), t, 2, t * 0.3);
  g.applyQuaternion(
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize()),
  );
  const mid = a.clone().add(b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

const loader = new TextureLoader();

function buildEasel(world: HyperWorld, spec: EaselSpec): HyperObject {
  const a = (spec.azimuth * Math.PI) / 180;
  const spot = POLE.clone()
    .multiplyScalar(Math.cos(RING))
    .addScaledVector(TANGENT_A, Math.sin(RING) * Math.cos(a))
    .addScaledVector(TANGENT_B, Math.sin(RING) * Math.sin(a))
    .normalize();

  const object = new HyperObject(groundGV(spot));
  // -z at the pole means +z, the painted face, points out of the ring.
  object.rotation.y = yawToward(spot, POLE);

  const { maxW, maxH } = spec;

  // Frame proportions, all derived from the canvas box so the three easels are
  // the same easel at three sizes rather than three separate designs.
  const ledgeY = 0.42 * maxH + 0.16;
  const ledgeTop = ledgeY + 0.05;
  const apexY = ledgeY + maxH * 1.12 + 0.1;
  const span = 0.95 * maxW + 0.22;
  const reach = 0.3 + 0.55 * maxH;
  const t = 0.035 + 0.02 * maxH;

  /** Z of the frame plane at a given height. The canvas rides parallel to it. */
  const frameZ = (y: number) => Z_FOOT + LEAN * (y - GROUND);

  // ---------------- a flagstone, centred on the tripod's real footprint. Thin
  // feet standing straight on the turf get eaten from below: the ground is
  // curved and every quad of it bulges up mid-quad.
  const stoneR = Math.max(span / 2, (reach + Z_FOOT) / 2) + 0.2;
  const stone = new CylinderGeometry(stoneR, stoneR + 0.02, GROUND, 22);
  stone.translate(0, GROUND / 2, (Z_FOOT - reach) / 2);
  object.addGeometry(world.shared, stone, { color: 0xa9a69c, ambient: 0.6 });

  // ---------------- the tripod. Both front legs lie in the frame plane, which
  // is what keeps them behind the picture all the way up.
  const legs: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    legs.push(
      strut(
        new Vector3(sx * (span / 2), GROUND, Z_FOOT),
        new Vector3(sx * 0.045, apexY, frameZ(apexY)),
        t,
      ),
    );
  }
  const rearTopY = GROUND + (apexY - GROUND) * 0.9;
  legs.push(
    strut(
      new Vector3(0, GROUND, -reach),
      new Vector3(0, rearTopY, frameZ(rearTopY) - 0.015),
      t,
    ),
  );
  // Tripod bracing: rear leg tied to both front legs, so the back leg is held
  // rather than merely leaning.
  const braceY = GROUND + (apexY - GROUND) * 0.3;
  for (const sx of [-1, 1]) {
    legs.push(
      strut(
        new Vector3(0, braceY, -reach * 0.6),
        new Vector3(sx * span * 0.34, braceY, frameZ(braceY)),
        t * 0.7,
      ),
    );
  }
  object.addGeometry(world.shared, mergeGeometries(legs), {
    color: WOOD,
    ambient: 0.54,
  });

  // ---------------- the shelf, and the back rest above it.
  //
  // The shelf is the one part that reaches FORWARD out of the frame plane: it
  // has to, because the canvas stands on it in front of the legs. Its top IS the
  // canvas's bottom edge, so nothing on it rises past that line — a front lip
  // standing proud here sits directly in front of the picture and hides the
  // bottom of it. Retention is two pegs BESIDE the canvas instead, added with
  // the canvas once its width is known.
  const ledgeZ0 = frameZ(ledgeY) - 0.02;
  const ledgeW = span * 0.9;
  const rails: BufferGeometry[] = [];
  const ledge = new RoundedBoxGeometry(ledgeW, 0.05, 0.13, 3, 0.012);
  ledge.translate(0, ledgeY + 0.025, ledgeZ0 + 0.065);
  rails.push(ledge);
  const backY = ledgeY + maxH * 0.82;
  const back = new RoundedBoxGeometry(span * 0.72, 0.045, 0.05, 3, 0.012);
  back.translate(0, backY, frameZ(backY));
  rails.push(back);
  object.addGeometry(world.shared, mergeGeometries(rails), {
    color: WOOD_DARK,
    ambient: 0.5,
  });

  world.add(object);

  // ---------------- the canvas, once the image is here to size it.
  //
  // Authored flat and centred, then tilted about its own centre and carried so
  // its bottom FRONT CORNER lands near the front of the shelf. Deriving the
  // offset from that one corner is what keeps the canvas on its shelf and clear
  // of the wood when the lean, the box or the image changes.
  const cornerZ = ledgeZ0 + 0.112;
  loader.load(spec.url, (tex: Texture) => {
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.magFilter = LinearFilter;
    tex.anisotropy = 8;

    const img = tex.image as { width?: number; height?: number } | undefined;
    const aspect = (img?.width ?? 1) / (img?.height ?? 1);
    const w = Math.min(maxW, maxH * aspect);
    const h = w / aspect;

    const sh = (h + 0.024) / 2;
    const st = CANVAS_T / 2;
    const centreY = ledgeTop + sh * COS_T + st * SIN_T;
    const centreZ = cornerZ + sh * SIN_T - st * COS_T;
    const mount = (g: { rotateX: (a: number) => unknown; translate: (x: number, y: number, z: number) => unknown }) => {
      g.rotateX(TILT);
      g.translate(0, centreY, centreZ);
    };

    const slab = new RoundedBoxGeometry(w + 0.024, h + 0.024, CANVAS_T, 4, 0.006);
    mount(slab);
    object.addGeometry(world.shared, slab, { color: LINEN, ambient: 0.55 });

    // The pegs that hold the canvas on the shelf. Flanking it rather than in
    // front of it, which is the only placement that cannot occlude the picture.
    const pegs = mergeGeometries(
      [-1, 1].map((sx) => {
        const peg = new RoundedBoxGeometry(0.022, 0.05, 0.075, 2, 0.007);
        peg.translate(sx * (w / 2 + 0.026), ledgeTop + 0.025, ledgeZ0 + 0.095);
        return peg;
      }),
    );
    object.addGeometry(world.shared, pegs, { color: WOOD_DARK, ambient: 0.5 });

    // The painted face. A decal proud of its backing, so it opts out of shadows
    // both ways: the map cannot resolve that sliver of depth and the slab would
    // otherwise cast a false shadow across the picture.
    const face = new PlaneGeometry(w, h, 1, 1);
    face.translate(0, 0, CANVAS_T / 2 + 0.005);
    mount(face);
    object.addGeometry(world.shared, face, {
      map: tex,
      color: 0xffffff,
      ambient: 0.95,
      // Low rather than the 0.5 default: these are pictures, not cutouts, and
      // anything but genuinely transparent pixels has to survive.
      alphaTest: 0.05,
      castShadow: false,
      receiveShadow: false,
    });
  });

  return object;
}

export function buildEasels(world: HyperWorld): { objects: HyperObject[]; poi: Poi } {
  return {
    objects: EASELS.map((spec) => buildEasel(world, spec)),
    poi: {
      id: 'easels',
      title: L('Things I made for no one', 'Kimse için yapmadığım şeyler'),
      body: L(
        'Digital images and video, made for no client. Some of it is what the inside of my head looks like; some of it is just a joke I wanted to see rendered properly. Nobody asked for any of it, which is the whole appeal — the same tools as the day job, pointed somewhere useless.',
        'Dijital görseller ve videolar; müşterisi yok. Bir kısmı kafamın içi nasıl görünüyorsa öyle; bir kısmı sadece düzgünce render edilmiş hâlini görmek istediğim bir şaka. Hiçbirini kimse istemedi, bütün cazibesi de bu — gündüz işindeki araçlar, işe yaramaz bir yöne çevrilmiş.',
      ),
      gv: groundGV(POLE),
      radius: units(9),
    },
  };
}
