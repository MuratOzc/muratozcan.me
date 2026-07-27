import {
  CylinderGeometry,
  DataTexture,
  LinearFilter,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  WebGLRenderTarget,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  HyperObject,
  type GyroVector,
  type HyperMaterial,
  type HyperWorld,
} from '../../engine';

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
 * Cost is one extra scene pass per frame. The shadow map is NOT re-rendered:
 * the feed camera shares the viewer's chart, so the existing map is already
 * correct for it — which is the whole reason the feed uses the viewer's
 * viewpoint rather than an independent one.
 */

const FEED_W = 640;
const FEED_H = 400;
/** Screen size in authored units — matches the feed's 1.6 aspect. */
const SCREEN_W = 1.04;
const SCREEN_H = 0.65;

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

  // ---------------- the stand: base, tapered post, mount arm.
  const base = new CylinderGeometry(0.34, 0.4, 0.07, 16);
  base.translate(0, 0.035, 0);
  object.addGeometry(world.shared, base, { color: DARK, ambient: 0.5 });

  const POST_H = 1.32;
  const post = new CylinderGeometry(0.055, 0.075, POST_H, 14);
  post.translate(0, 0.07 + POST_H / 2, 0);
  object.addGeometry(world.shared, post, { color: METAL, ambient: 0.55 });

  const SCREEN_Y = 0.07 + POST_H + SCREEN_H / 2 - 0.06;
  const arm = new RoundedBoxGeometry(0.1, 0.14, 0.18, 2, 0.02);
  arm.translate(0, SCREEN_Y - 0.16, -0.06);
  object.addGeometry(world.shared, arm, { color: METAL, ambient: 0.55 });

  // ---------------- the panel: a slim body, a bezel FRAME, and the screen.
  //
  // The bezel is four bars around the screen rather than a slab behind it,
  // and the body sits 0.02 back. That is deliberate: a coarse slab directly
  // behind a fine plane bulges through it mid-quad (each quad renders as a
  // chord of the true curved surface), which showed up as a black disc in the
  // middle of the screen. Nothing coarse is allowed behind a decal here — the
  // same rule the chalkboard needed.
  //
  // All panel parts are authored in panel-local coordinates, then tilted as
  // one rigid body and lifted to the mount, so the tilt cannot shear the
  // pieces apart.
  const TILT = -0.1;
  const panelPart = (g: { rotateX: (a: number) => unknown; translate: (x: number, y: number, z: number) => unknown }) => {
    g.rotateX(TILT);
    g.translate(0, SCREEN_Y, 0);
    return g;
  };

  const body = new RoundedBoxGeometry(SCREEN_W + 0.08, SCREEN_H + 0.08, 0.055, 6, 0.016);
  body.translate(0, 0, -0.048);
  panelPart(body);
  object.addGeometry(world.shared, body, { color: 0x8f979f, ambient: 0.5 });

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

  const screen = new PlaneGeometry(SCREEN_W, SCREEN_H, 4, 3);
  panelPart(screen);
  const screenMats: HyperMaterial[] = object.addGeometry(world.shared, screen, {
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
  let call = 0;
  const tick = () => {
    // Tickers run BEFORE the world renders, so on the very first frame the
    // shadow map has not been drawn yet and its uniform is still null.
    // Rendering the scene then would sample a null sampler2DShadow, which is
    // an invalid operation. Wait for the world to have rendered once.
    if (!world.shared.uShadowMap.value) return;

    // Half rate. The feed is a second full scene pass, which is the most
    // expensive thing on the site; a hand-sized screen reads identically at
    // 30Hz, and skipping whole frames (rather than swapping without drawing)
    // keeps the image stable instead of alternating recursion depths.
    if (call++ % 2 !== 0) return;

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
    feedCam.updateMatrixWorld();

    world.renderer.setRenderTarget(write);
    world.renderer.render(world.scene, feedCam);
    world.renderer.setRenderTarget(null);

    frame++;
  };

  return { object, tick };
}
