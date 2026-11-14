import {
  CylinderGeometry,
  DataTexture,
  LinearFilter,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  WebGLRenderTarget,
  type BufferGeometry,
} from 'three';
import { RoundedBoxGeometry } from '../geometry';
import {
  HyperObject,
  type GyroVector,
  type HyperMaterial,
  type HyperWorld,
} from '../../engine';
import { merge } from '../geometry';

/**
 * Station 5: frontend — a monitor on a post, showing this site.
 *
 * Not a screenshot. The panel is a live second render of the world from the
 * visitor's own viewpoint, so whatever you are looking at is on the screen,
 * including the screen. Two render targets ping-pong: the panel samples last
 * frame's image while this frame is drawn into the other one, which means the
 * monitor inside the picture is showing the frame before that, and so on down.
 * Walk up to it and the tunnel goes as deep as the frame history.
 *
 * That recursion is the honest joke about frontend work: it is the only layer
 * anyone ever sees, and here it is looking at itself.
 *
 * Cost is one extra scene pass, a few times a second and only while the
 * monitor is on screen. The shadow map is NOT re-rendered:
 * the feed camera shares the viewer's chart, so the existing map is already
 * correct for it — which is the whole reason the feed uses the viewer's
 * viewpoint rather than an independent one.
 */

const FEED_W = 640;
const FEED_H = 400;
/** Sine of the apparent half-angle at which the feed runs at its full rate. */
const FULL_RATE_SIZE = 0.3;
const MAX_INTERVAL = 2;
/** Screen size in authored units — matches the feed's 1.6 aspect. */
const SCREEN_W = 1.04;
const SCREEN_H = 0.65;

/**
 * Panel body, and where the screen sits.
 *
 * SCREEN_Y is eye level: the viewer is one authored unit tall, so 1.02 puts the
 * centre of the picture straight ahead rather than overhead. The whole stand
 * tops out at about 1.38 for that reason.
 */
const SCREEN_Y = 1.02;
const TILT = -0.12;
const BODY_W = SCREEN_W + 0.08;
const BODY_H = SCREEN_H + 0.08;
const BODY_T = 0.055;
/** Panel-local z of the body's centre, and so of its back face. */
const BODY_Z = -0.048;
const BODY_BACK = BODY_Z - BODY_T / 2;

const PAD_TOP = 0.09;
const BASE_TOP = PAD_TOP + 0.07;
/**
 * The stand stands BEHIND the picture, and stops below it.
 *
 * Both halves of that are load-bearing. The post is offset to POST_Z so it can
 * never share space with the screen plane, and POST_TOP is under the panel's
 * lowest point — the tilt swings the panel's bottom edge forward and down, and
 * a post that reaches into that band comes out through the front of the
 * picture. Which is exactly what the previous version did: a vertical post on
 * the screen's own axis, ending 0.06 ABOVE the panel's bottom edge.
 */
const POST_Z = -0.08;
const POST_TOP = 0.56;

export interface MonitorResult {
  object: HyperObject;
  tick: (worldGV: GyroVector, dt: number) => void;
}

function makeTarget(): WebGLRenderTarget {
  const t = new WebGLRenderTarget(FEED_W, FEED_H);
  // Sampled raw by the hyper shader, so it must already be encoded the way
  // the main framebuffer is or the feed comes back washed out.
  t.texture.colorSpace = SRGBColorSpace;
  t.texture.minFilter = LinearFilter;
  t.texture.magFilter = LinearFilter;
  return t;
}

export function buildMonitor(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): MonitorResult {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  const METAL = 0xb9c0c8;
  const DARK = 0x6a727a;

  const targets = [makeTarget(), makeTarget()];

  // The screen starts on a real (if tiny) texture rather than on a render
  // target: until a target has actually been drawn into, its texture is
  // unbacked, and sampling it is an invalid operation. The ticker swaps in
  // the live feed once there is one.
  const warmUp = new DataTexture(
    new Uint8Array([20, 26, 32, 255]),
    1,
    1,
    RGBAFormat,
  );
  warmUp.colorSpace = SRGBColorSpace;
  warmUp.needsUpdate = true;

  // ---------------- paving. The base used to sit straight on the turf, which
  // is not a flat surface here: every ground quad renders as a chord of the
  // true curved surface and bulges up mid-quad, so a 0.07-tall base standing on
  // it gets eaten from below. Everything with a footprint in this world stands
  // on a slab for that reason.
  const pad = new RoundedBoxGeometry(1.7, PAD_TOP, 1.3, 2, 0.02);
  pad.translate(0, PAD_TOP / 2, POST_Z);
  object.addGeometry(world.shared, pad, { color: 0xb0aea6, ambient: 0.62 });

  // ---------------- the stand: base and tapered post, both behind the picture.
  const base = new CylinderGeometry(0.3, 0.36, 0.07, 16);
  base.translate(0, PAD_TOP + 0.035, POST_Z);
  object.addGeometry(world.shared, base, { color: DARK, ambient: 0.5 });

  const POST_H = POST_TOP - BASE_TOP;
  const post = new CylinderGeometry(0.055, 0.075, POST_H, 14);
  post.translate(0, BASE_TOP + POST_H / 2, POST_Z);
  object.addGeometry(world.shared, post, { color: METAL, ambient: 0.55 });

  // ---------------- the panel: a slim body, a bezel FRAME, and the screen.
  //
  // The bezel is four bars around the screen rather than a slab behind it,
  // and the body sits 0.02 back.
  //
  // All panel parts are authored in panel-local coordinates, then tilted as
  // one rigid body and lifted to the mount, so the tilt cannot shear the
  // pieces apart.
  const panelPart = (g: { rotateX: (a: number) => unknown; translate: (x: number, y: number, z: number) => unknown }) => {
    g.rotateX(TILT);
    g.translate(0, SCREEN_Y, 0);
    return g;
  };

  const body = new RoundedBoxGeometry(BODY_W, BODY_H, BODY_T, 6, 0.016);
  body.translate(0, 0, BODY_Z);
  panelPart(body);
  object.addGeometry(world.shared, body, { color: 0x8f979f, ambient: 0.5 });

  // The mount: a plate flush to the body's back and a stem down to the post.
  //
  // Both go through panelPart, so they are authored against BODY_BACK in the
  // panel's own frame. That is the point — a bracket positioned in world
  // coordinates has to be re-derived through the tilt every time TILT or
  // SCREEN_H changes, and getting that wrong is what puts a grey box through
  // the front of the picture. Here the tilt applies to the joint as well, so
  // the parts cannot come apart or come through.
  const mount: BufferGeometry[] = [];
  const plate = new RoundedBoxGeometry(0.28, 0.26, 0.032, 3, 0.01);
  plate.translate(0, -0.2, BODY_BACK - 0.016);
  mount.push(plate);
  const stem = new RoundedBoxGeometry(0.11, 0.3, 0.13, 3, 0.018);
  stem.translate(0, -0.36, BODY_BACK - 0.065);
  mount.push(stem);
  const merged = merge(mount);
  panelPart(merged);
  object.addGeometry(world.shared, merged, { color: METAL, ambient: 0.52 });

  const BW = 0.026;
  for (const [dx, dy, w, h] of [
    [0, (SCREEN_H + BW) / 2, SCREEN_W + BW * 2, BW],
    [0, -(SCREEN_H + BW) / 2, SCREEN_W + BW * 2, BW],
    [(SCREEN_W + BW) / 2, 0, BW, SCREEN_H + BW * 2],
    [-(SCREEN_W + BW) / 2, 0, BW, SCREEN_H + BW * 2],
  ] as Array<[number, number, number, number]>) {
    const bar = new RoundedBoxGeometry(w, h, 0.024, 2, 0.007);
    bar.translate(dx, dy, -0.004);
    panelPart(bar);
    object.addGeometry(world.shared, bar, { color: 0x4c545c, ambient: 0.45 });
  }

  const screen = new PlaneGeometry(SCREEN_W, SCREEN_H, 1, 1);
  panelPart(screen);
  const screenMats: HyperMaterial[] = object.addLiveGeometry(world.shared, screen, {
    map: warmUp,
    color: 0xffffff,
    // The screen emits; it should not be shaded like paint.
    ambient: 1.0,
    castShadow: false,
    receiveShadow: false,
  });

  world.add(object);

  // ---------------- the feed.
  //
  // Its own camera so the feed keeps a 1.6 aspect regardless of the browser
  // window; it borrows the viewer's orientation, and the hyper shader strips
  // view translation anyway, so orientation is all it needs.
  const feedCam = new PerspectiveCamera(world.camera.fov, FEED_W / FEED_H, 0.0005, 20);
  feedCam.rotation.order = 'YXZ';

  let frame = 0;
  let since = Infinity;
  const tick = (_worldGV: GyroVector, dt: number) => {
    // Tickers run BEFORE the world renders, so on the very first frame the
    // shadow map has not been drawn yet and its uniform is still null.
    // Rendering the scene then would sample a null sampler2DShadow, which is
    // an invalid operation. Wait for the world to have rendered once.
    if (!world.shared.uShadowMap.value) return;

    // The feed is a second full scene pass. The monitor can be in view from
    // anywhere on the sphere, so distance cannot gate it; whether it is on
    // screen at all can, and so can rate. A hand-sized panel reads the same at
    // 10Hz, and skipping whole frames (rather than swapping without drawing)
    // keeps the image stable instead of alternating recursion depths.
    //
    // Wall-clock rather than every-Nth-frame: the cost must not scale with how
    // fast the machine happens to run. And slower the smaller the monitor
    // looks, down to once every MAX_INTERVAL.
    since += dt;
    const size = Math.min(1, object.viewSine / FULL_RATE_SIZE);
    const interval = Math.min(MAX_INTERVAL, world.quality.auxInterval / (size * size));
    if (since < interval || !object.inView) return;
    since = 0;

    const read = frame === 0 ? null : targets[frame % 2];
    const write = targets[(frame + 1) % 2];

    // Show the previous frame while drawing the next one into the other
    // target. Reading and writing the same texture is what a feedback loop
    // is not allowed to do, and the ping-pong is what buys the recursion.
    if (read) {
      for (const m of screenMats) {
        if (m.uniforms.uMap) m.uniforms.uMap.value = read.texture;
      }
    }

    feedCam.rotation.copy(world.camera.rotation);
    world.renderView(feedCam, write);

    frame++;
  };

  return { object, tick };
}
