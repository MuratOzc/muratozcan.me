import {
  CanvasTexture,
  CylinderGeometry,
  LinearFilter,
  LinearMipmapLinearFilter,
  PlaneGeometry,
  SRGBColorSpace,
  TorusGeometry,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HyperObject, type GyroVector, type HyperWorld } from '../../engine';

/**
 * Station 7: infrastructure — an open rack standing in the grass, with the
 * cables running into the ground.
 *
 * The inventory is the real one: three machines, two Windows and one Debian,
 * each wearing its vendor's own badge. Their activity lights blink, because
 * the honest thing to show about infrastructure is that it is always awake,
 * and nobody is watching it but you.
 *
 * The blinking is one repainted canvas per box on a throttle, not per-LED
 * geometry: three textures beat sixty materials.
 */

const RACK_H = 1.5;
const RACK_W = 0.62;
const RACK_D = 0.52;
/** Front face of the chassis, just proud of the frame. */
const FACE_Z = RACK_D / 2 + 0.004;

type Badge = 'windows' | 'linux' | 'none';

interface Panel {
  texture: CanvasTexture;
  repaint: (t: number) => void;
}

/**
 * `fill` is per-mark rather than one constant: the two files differ in aspect
 * and in how much margin the artwork carries, so fitting both to the same box
 * leaves the taller one looking like the smaller badge. These are the fractions
 * at which the two read as the same weight on the plate.
 */
const BADGE_ART: Record<Exclude<Badge, 'none'>, { url: string; fill: number }> = {
  windows: { url: '/images/w11.webp', fill: 0.70 },
  linux: { url: '/images/debian.webp', fill: 0.86 },
};

/**
 * The real marks, decoded once and shared by every panel that wants one.
 *
 * No load callback: the panels already repaint on a throttle, so a mark that
 * has not decoded yet is simply absent from this repaint and present in the
 * next one. Drawing an image that failed or has not arrived would throw, hence
 * the completeness gate at the call site.
 */
const badgeArt = new Map<string, HTMLImageElement>();

function badgeImage(badge: Exclude<Badge, 'none'>): HTMLImageElement {
  let img = badgeArt.get(badge);
  if (!img) {
    img = new Image();
    img.src = BADGE_ART[badge].url;
    badgeArt.set(badge, img);
  }
  return img;
}

/**
 * An OEM badge: the vendor's mark on a light stamped plate, the way it is
 * actually stuck on a chassis. The plate is what makes it legible — both marks
 * are mid-tone on transparent, and this renderer crushes mid tones against a
 * dark ground.
 */
function drawBadge(
  ctx: CanvasRenderingContext2D,
  badge: Exclude<Badge, 'none'>,
  cx: number,
  cy: number,
  s: number,
) {
  ctx.fillStyle = '#f0eee6';
  ctx.beginPath();
  ctx.roundRect(cx - s / 2, cy - s / 2, s, s, s * 0.16);
  ctx.fill();

  const img = badgeImage(badge);
  if (!img.complete || img.naturalWidth === 0) return;

  const box = s * BADGE_ART[badge].fill;
  const k = Math.min(box / img.naturalWidth, box / img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

/**
 * A server's front panel: vents, drive bays, an OS badge and the lights.
 * `seed` decorrelates the blink patterns so the three boxes never pulse in
 * unison — which is what would make it read as an animation rather than as
 * three machines minding their own business.
 */
function serverPanel(badge: Badge, seed: number): Panel {
  const W = 512;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;

  const repaint = (t: number) => {
    // Chassis face
    ctx.fillStyle = '#5a636c';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#4a525a';
    ctx.fillRect(0, 0, W, 6);
    ctx.fillRect(0, H - 6, W, 6);

    // Drive bays, left half
    for (let i = 0; i < 4; i++) {
      const x = 16 + i * 44;
      ctx.fillStyle = '#3a4149';
      ctx.fillRect(x, 22, 36, H - 44);
      ctx.fillStyle = '#6b747d';
      ctx.fillRect(x + 4, 26, 28, H - 52);
      // Per-drive activity: mostly idle, occasional flurry.
      const phase = Math.sin(t * (5 + i * 1.7) + seed * 3.1 + i) * 0.5 + 0.5;
      const on = phase > 0.62;
      ctx.fillStyle = on ? '#8fe36a' : '#2f5730';
      ctx.fillRect(x + 8, H - 34, 8, 8);
    }

    // Vent grille, right half
    ctx.fillStyle = '#3f464e';
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 12; c++) {
        ctx.fillRect(238 + c * 13, 26 + r * 16, 8, 10);
      }
    }

    // Badge
    if (badge !== 'none') drawBadge(ctx, badge, 452, 64, 82);

    // Power light: steady. Network light: a nervous flicker.
    ctx.fillStyle = '#6fd3f7';
    ctx.beginPath();
    ctx.arc(206, 40, 7, 0, Math.PI * 2);
    ctx.fill();
    const net = (Math.sin(t * 11 + seed * 2.3) + Math.sin(t * 17.3 + seed)) * 0.5;
    ctx.fillStyle = net > 0.15 ? '#ffd166' : '#5a4a22';
    ctx.beginPath();
    ctx.arc(206, 88, 7, 0, Math.PI * 2);
    ctx.fill();

    texture.needsUpdate = true;
  };

  repaint(0);
  return { texture, repaint };
}

/** The patch panel at the top: a row of ports, blinking independently. */
function switchPanel(): Panel {
  const W = 512;
  const H = 96;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;

  const repaint = (t: number) => {
    ctx.fillStyle = '#565f68';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#464e56';
    ctx.fillRect(0, 0, W, 5);
    ctx.fillRect(0, H - 5, W, 5);

    for (let i = 0; i < 12; i++) {
      const x = 24 + i * 39;
      // Port
      ctx.fillStyle = '#2c333a';
      ctx.fillRect(x, 24, 28, 30);
      ctx.fillStyle = '#6b747d';
      ctx.fillRect(x + 4, 28, 20, 12);
      // Link light — some ports are simply dark, because some ports are.
      const live = i % 5 !== 3;
      const blink = Math.sin(t * (9 + i * 2.3) + i * 1.9) > 0.1;
      ctx.fillStyle = live ? (blink ? '#8fe36a' : '#31562f') : '#20262b';
      ctx.fillRect(x + 6, 62, 16, 8);
    }
    texture.needsUpdate = true;
  };

  repaint(0);
  return { texture, repaint };
}

export interface RackResult {
  object: HyperObject;
  tick: (worldGV: GyroVector, dt: number) => void;
}

export function buildRack(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): RackResult {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  // Authored bright: flat uColor hexes are linearised on upload and never
  // re-encoded, so mid-greys land far darker than they read here.
  const DARK = 0xb9c0c8;

  // ---------------- the pad: infrastructure sits on concrete, never on grass.
  const pad = new RoundedBoxGeometry(1.5, 0.1, 1.35, 2, 0.02);
  pad.translate(0, 0.05, 0);
  object.addGeometry(world.shared, pad, { color: 0xb2b0a8, ambient: 0.62 });

  // ---------------- the frame: four uprights, top and bottom rails, feet.
  const frame: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const upright = new RoundedBoxGeometry(0.05, RACK_H, 0.05, 1, 0.012);
      upright.translate(sx * (RACK_W / 2), 0.1 + RACK_H / 2, sz * (RACK_D / 2));
      frame.push(upright);
    }
  }
  for (const y of [0.12, 0.1 + RACK_H - 0.02]) {
    for (const sz of [-1, 1]) {
      const rail = new RoundedBoxGeometry(RACK_W + 0.05, 0.04, 0.05, 1, 0.01);
      rail.translate(0, y, sz * (RACK_D / 2));
      frame.push(rail);
    }
    for (const sx of [-1, 1]) {
      const side = new RoundedBoxGeometry(0.05, 0.04, RACK_D, 1, 0.01);
      side.translate(sx * (RACK_W / 2), y, 0);
      frame.push(side);
    }
  }
  object.addGeometry(world.shared, mergeGeometries(frame.map((g) => g.toNonIndexed())), {
    color: DARK,
    ambient: 0.5,
  });

  // ---------------- the machines. Two Windows, one Linux — the real count.
  const panels: Panel[] = [];
  const BOXES: Array<{ y: number; h: number; badge: Badge }> = [
    { y: 1.28, h: 0.17, badge: 'windows' },
    { y: 1.06, h: 0.17, badge: 'windows' },
    { y: 0.84, h: 0.17, badge: 'linux' },
  ];

  BOXES.forEach((b, i) => {
    const chassis = new RoundedBoxGeometry(RACK_W - 0.03, b.h, RACK_D - 0.02, 2, 0.012);
    chassis.translate(0, b.y, 0);
    object.addGeometry(world.shared, chassis, { color: 0xa8b0b8, ambient: 0.52 });

    const panel = serverPanel(b.badge, i * 2.7);
    panels.push(panel);
    const face = new PlaneGeometry(RACK_W - 0.06, b.h - 0.02, 3, 2);
    face.translate(0, b.y, FACE_Z);
    object.addGeometry(world.shared, face, {
      map: panel.texture,
      color: 0xffffff,
      ambient: 0.95,
      castShadow: false,
      receiveShadow: false,
    });
  });

  // The switch, at the top where the patching happens.
  const switchBody = new RoundedBoxGeometry(RACK_W - 0.03, 0.1, RACK_D - 0.02, 2, 0.01);
  switchBody.translate(0, 1.45, 0);
  object.addGeometry(world.shared, switchBody, { color: 0x9aa3ac, ambient: 0.52 });
  const sw = switchPanel();
  panels.push(sw);
  const swFace = new PlaneGeometry(RACK_W - 0.06, 0.08, 3, 1);
  swFace.translate(0, 1.45, FACE_Z);
  object.addGeometry(world.shared, swFace, {
    map: sw.texture,
    color: 0xffffff,
    ambient: 0.95,
    castShadow: false,
    receiveShadow: false,
  });

  // The UPS: heavy, dumb, and the reason the rest survives a power cut.
  const ups = new RoundedBoxGeometry(RACK_W - 0.03, 0.26, RACK_D - 0.02, 2, 0.012);
  ups.translate(0, 0.32, 0);
  object.addGeometry(world.shared, ups, { color: 0x8f979f, ambient: 0.5 });

  // ---------------- cabling, routed rather than draped.
  //
  // Each run is a real path with square corners rounded by elbows: a stub
  // that PENETRATES the chassis rear (so it is plugged in, not merely near),
  // an elbow turning it outboard, a straight to the loom line, a second elbow
  // turning it down, and a drop into the gland on the junction box. The two
  // elbows are quarter tori, oriented so their endpoint tangents match the
  // straights they join — get that wrong and you get exactly the floating
  // spaghetti this replaces.
  const CHASSIS_BACK = -(RACK_D - 0.02) / 2;
  const RUN_Z = -(RACK_D / 2) - 0.05;
  const LOOM_X = -(RACK_W / 2) - 0.04;
  const PLUG_X = -0.08;
  const BEND = 0.035;
  const WIRE = 0.011;
  const UNIT_Y = [1.45, 1.28, 1.06, 0.84];
  const BOX_Y = 0.19;
  const GLAND_Y = BOX_Y + 0.1;

  const cables: BufferGeometry[] = [];

  UNIT_Y.forEach((y, i) => {
    // Each cable claims its own lane in the loom, so four runs read as a
    // bundle instead of one fat cylinder.
    const lane = LOOM_X + (i - 1.5) * 0.022;

    // 1. Stub out of the chassis, along -z. Starts inside the box.
    const stubFrom = CHASSIS_BACK + 0.01;
    const stubTo = RUN_Z + BEND;
    const stub = new CylinderGeometry(WIRE, WIRE, stubFrom - stubTo, 6);
    stub.rotateX(Math.PI / 2);
    stub.translate(PLUG_X, y, (stubFrom + stubTo) / 2);
    cables.push(stub);

    // 2. Elbow: heading -z becomes heading -x. Horizontal quarter turn.
    const elbowA = new TorusGeometry(BEND, WIRE, 6, 10, Math.PI / 2);
    elbowA.rotateX(-Math.PI / 2);
    elbowA.translate(PLUG_X - BEND, y, RUN_Z + BEND);
    cables.push(elbowA);

    // 3. Straight across the back to this cable's lane.
    const acrossFrom = PLUG_X - BEND;
    const acrossTo = lane + BEND;
    const across = new CylinderGeometry(WIRE, WIRE, acrossFrom - acrossTo, 6);
    across.rotateZ(Math.PI / 2);
    across.translate((acrossFrom + acrossTo) / 2, y, RUN_Z);
    cables.push(across);

    // 4. Elbow: heading -x becomes heading down. Vertical quarter turn.
    const elbowB = new TorusGeometry(BEND, WIRE, 6, 10, Math.PI / 2);
    elbowB.rotateY(Math.PI);
    elbowB.translate(lane + BEND, y - BEND, RUN_Z);
    cables.push(elbowB);

    // 5. Drop into the gland.
    const drop = new CylinderGeometry(WIRE, WIRE, y - BEND - GLAND_Y, 6);
    drop.translate(lane, (y - BEND + GLAND_Y) / 2, RUN_Z);
    cables.push(drop);
  });

  object.addGeometry(
    world.shared,
    mergeGeometries(cables.map((g) => g.toNonIndexed())),
    { color: 0x8b939b, ambient: 0.5 },
  );

  // The junction box the loom dies into, bolted to the pad, and the gland
  // that swallows all four lanes.
  const box = new RoundedBoxGeometry(0.22, 0.18, 0.17, 2, 0.015);
  box.translate(LOOM_X, BOX_Y, RUN_Z);
  object.addGeometry(world.shared, box, { color: 0xc6cdd4, ambient: 0.55 });
  const gland = new CylinderGeometry(0.055, 0.075, 0.06, 12);
  gland.translate(LOOM_X, GLAND_Y - 0.02, RUN_Z);
  object.addGeometry(world.shared, gland, { color: 0xaeb6be, ambient: 0.55 });

  world.add(object);

  // ---------------- the blink. Throttled: the eye cannot read faster than
  // this and the canvas repaint is the only real cost here.
  let clock = 0;
  let since = 0;
  const tick = (_worldGV: GyroVector, dt: number) => {
    clock += dt;
    since += dt;
    if (since < 0.09) return;
    since = 0;
    for (const p of panels) p.repaint(clock);
  };

  return { object, tick };
}
