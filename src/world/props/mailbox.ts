import {
  CylinderGeometry,
  ExtrudeGeometry,
  Path,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import {
  HyperObject,
  type GyroVector,
  type HyperMaterialOptions,
  type HyperWorld,
} from '../../engine';
import { across, aimed, box, grained, lathe, merge, moved, pos, type Part, type Point } from '../geometry';
import { localizedCanvasTexture } from '../text';

const EMAIL = 'mr.muratozcan@gmail.com';
const HOUSE_NUMBER = '10';

/** The concrete the post stands in. The paving in contact.ts leaves this cell open. */
export const FOOTING = { x: -1.5, z: -0.14, w: 0.3, d: 0.36, top: 0.055 };

const YAW = -0.3;

const OAK: HyperMaterialOptions = { color: 0xc9a071, ambient: 0.56, gloss: 0.12, grain: 0.3 };
const YELLOW: HyperMaterialOptions = { color: 0xf3c84a, ambient: 0.6, gloss: 0.45 };
const RED: HyperMaterialOptions = { color: 0xe0563f, ambient: 0.6, gloss: 0.45 };
const ZINC: HyperMaterialOptions = { color: 0xd4d9dd, ambient: 0.62, gloss: 0.45, metal: 0.55 };
const CONCRETE: HyperMaterialOptions = { color: 0xc9c7c0, ambient: 0.62, gloss: 0.03 };
const ENAMEL_BLUE: HyperMaterialOptions = { color: 0x4f8fd6, ambient: 0.62, gloss: 0.85 };
const MANILA: HyperMaterialOptions = { color: 0xe6c78e, ambient: 0.66, gloss: 0.06 };
const PAPER: HyperMaterialOptions = { color: 0xf7f3e6, ambient: 0.68, gloss: 0.06 };
const AIRMAIL: HyperMaterialOptions = { color: 0xbcd5ec, ambient: 0.68, gloss: 0.06 };

const W = 0.2;
const WALL = 0.13;
const LEN = 0.5;
const SKIN = 0.004;
const FLOOR = 0.89;
const REAR = -0.1;
const FRONT = REAR + LEN;
const DOOR_OPEN = 1.66;

function arch<T extends Path>(path: T, grow: number, base: number): T {
  const x = W / 2 + grow;
  path.moveTo(-x, base);
  path.lineTo(x, base);
  path.lineTo(x, WALL);
  path.absarc(0, WALL, x, 0, Math.PI, false);
  path.lineTo(-x, base);
  return path;
}

function archBand(outer: number, inner: number, base: number): Shape {
  const xo = W / 2 + outer;
  const xi = W / 2 + inner;
  const s = new Shape();
  s.moveTo(xo, base);
  s.lineTo(xo, WALL);
  s.absarc(0, WALL, xo, 0, Math.PI, false);
  s.lineTo(-xo, base);
  s.lineTo(-xi, base);
  s.lineTo(-xi, WALL);
  s.absarc(0, WALL, xi, Math.PI, 0, true);
  s.lineTo(xi, base);
  s.lineTo(xo, base);
  return s;
}

function extrude(shape: Shape, depth: number, bevel = 0): BufferGeometry {
  return new ExtrudeGeometry(shape, {
    depth,
    curveSegments: 9,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
  });
}

function dome(r: number, towards: Vector3, at: Vector3): BufferGeometry {
  const g = new SphereGeometry(r, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  return aimed(g, at, at.clone().add(towards));
}

function hex(r: number, h: number, towards: Vector3, at: Vector3): BufferGeometry {
  const g = new CylinderGeometry(r, r, h, 6).translate(0, h / 2, 0);
  return aimed(g, at, at.clone().add(towards));
}

const X = new Vector3(1, 0, 0);
const NX = new Vector3(-1, 0, 0);
const Y = new Vector3(0, 1, 0);

function body(): Part[] {
  const shell = new Shape();
  arch(shell, 0, 0);
  shell.holes.push(arch(new Path(), -SKIN, SKIN));
  const parts: Part[] = [[pos(extrude(shell, LEN), 0, FLOOR, REAR), YELLOW]];

  const beads: BufferGeometry[] = [];
  for (const z of [REAR - 0.001, FRONT - 0.0075]) {
    beads.push(pos(extrude(archBand(0.002, -0.002, 0), 0.005, 0.0015), 0, FLOOR, z));
  }
  for (const z of [REAR + 0.165, REAR + 0.325]) {
    beads.push(pos(extrude(archBand(0.0025, -0.001, WALL), 0.012, 0.002), 0, FLOOR, z));
  }
  parts.push([merge(beads), YELLOW]);

  parts.push([pos(extrude(arch(new Shape(), -SKIN, SKIN), 0.004), 0, FLOOR, REAR + 0.008), YELLOW]);

  const rivets: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    parts.push([pos(box(0.014, 0.004, LEN - 0.05, 0.0015), sx * (W / 2 + 0.005), FLOOR + 0.002, REAR + LEN / 2 - 0.01), YELLOW]);
    for (let i = 0; i < 6; i++) {
      rivets.push(dome(0.0042, Y, new Vector3(sx * (W / 2 + 0.007), FLOOR + 0.004, REAR + 0.03 + i * 0.078)));
    }
  }
  parts.push([merge(rivets), ZINC]);

  parts.push([pos(box(0.022, 0.007, 0.012, 0.002), 0, FLOOR + WALL + W / 2 + 0.003, FRONT - 0.022), ZINC]);
  return parts;
}

function door(): Part[] {
  const parts: Part[] = [];
  parts.push([pos(extrude(arch(new Shape(), 0.009, 0), 0.003, 0.002), 0, 0, 0.004), YELLOW]);
  parts.push([pos(extrude(archBand(0.009, 0.005, -0.008), 0.014, 0.001), 0, 0, -0.011), YELLOW]);
  parts.push([pos(extrude(arch(new Shape(), -0.022, 0.024), 0.002, 0.002), 0, 0, 0.009), YELLOW]);

  const tab: Point[] = [
    [0.009, 0.2],
    [0.0125, 0.2],
    [0.0125, 0.2465],
    [-0.03, 0.2465],
    [-0.035, 0.2525],
    [-0.0375, 0.2505],
    [-0.0315, 0.2435],
    [0.009, 0.2435],
  ];
  parts.push([across(tab, 0.032, 0.001), ZINC]);
  parts.push([
    merge([
      dome(0.006, X, new Vector3(W / 2 + 0.01, 0, 0)),
      dome(0.006, NX, new Vector3(-W / 2 - 0.01, 0, 0)),
      dome(0.004, new Vector3(0, 0, 1), new Vector3(0, 0.215, 0.0125)),
    ]),
    ZINC,
  ]);

  for (const [g] of parts) g.rotateX(DOOR_OPEN).translate(0, FLOOR, FRONT);
  return parts;
}

function flag(): Part[] {
  const pivot = new Vector3(W / 2, FLOOR + 0.095, FRONT - 0.13);
  const profile: Point[] = [
    [-0.011, -0.016],
    [-0.005, -0.022],
    [0.005, -0.022],
    [0.011, -0.016],
    [0.011, 0.135],
    [0.12, 0.135],
    [0.12, 0.215],
    [-0.011, 0.215],
  ];
  const spacer = new CylinderGeometry(0.012, 0.012, 0.008, 12).rotateZ(Math.PI / 2);
  return [
    [pos(across(profile, 0.004, 0.001), pivot.x + 0.01, pivot.y, pivot.z), RED],
    [pos(spacer, pivot.x + 0.004, pivot.y, pivot.z), ZINC],
    [dome(0.008, X, new Vector3(pivot.x + 0.012, pivot.y, pivot.z)), ZINC],
  ];
}

function letter(w: number, len: number, lift: number, x: number, twist: number, out: number): BufferGeometry {
  return box(w, 0.003, len, 0.001)
    .rotateY(twist)
    .translate(x, FLOOR + SKIN + 0.0017 + lift, FRONT + out - len / 2);
}

function letters(): Part[] {
  const stamp = box(0.022, 0.0012, 0.026, 0.0004)
    .translate(0.04, 0.0021, 0.088)
    .rotateY(0.09)
    .translate(0.018, FLOOR + SKIN + 0.0051, FRONT + 0.005);
  return [
    [letter(0.15, 0.3, 0, -0.008, -0.04, 0.09), MANILA],
    [letter(0.12, 0.22, 0.0034, 0.018, 0.09, 0.115), PAPER],
    [letter(0.11, 0.16, 0.0068, -0.022, -0.2, 0.04), AIRMAIL],
    [stamp, RED],
  ];
}

function carpentry(): Part[] {
  const parts: Part[] = [];
  parts.push([grained(pos(box(0.1, 0.77, 0.1, 0.01), 0, 0.415, 0), 'y'), OAK]);

  const arm: Point[] = [
    [-0.13, 0.8],
    [0.39, 0.8],
    [0.42, 0.83],
    [0.42, 0.87],
    [-0.13, 0.87],
  ];
  parts.push([grained(across(arm, 0.1, 0.006), 'z'), OAK]);

  const brace: Point[] = [
    [0.05, 0.47],
    [0.38, 0.8],
    [0.302, 0.8],
    [0.05, 0.548],
  ];
  parts.push([grained(across(brace, 0.07, 0.005), 'z'), OAK]);
  parts.push([grained(pos(box(0.16, 0.02, 0.49, 0.004), 0, 0.88, REAR + 0.245), 'z'), OAK]);

  const iron: BufferGeometry[] = [];
  const out = new Vector3(0, -1, 1).normalize();
  for (const [z, y] of [[0.115, 0.535], [0.31, 0.73]]) {
    iron.push(hex(0.009, 0.006, out, new Vector3(0, y, z)));
  }
  for (const sx of [-1, 1]) {
    const face = sx > 0 ? X : NX;
    iron.push(pos(box(0.004, 0.2, 0.032, 0.0015), sx * 0.052, 0.762, 0));
    iron.push(pos(box(0.004, 0.032, 0.17, 0.0015), sx * 0.052, 0.836, 0));
    for (const [z, y] of [[0, 0.69], [0, 0.745], [-0.065, 0.836], [0, 0.836], [0.065, 0.836]]) {
      iron.push(hex(0.006, 0.004, face, new Vector3(sx * 0.054, y, z)));
    }
  }
  parts.push([merge(iron), ZINC]);

  parts.push([pos(box(0.084, 0.11, 0.006, 0.003), 0, 0.37, 0.053), ENAMEL_BLUE]);
  parts.push([
    merge([
      dome(0.004, new Vector3(0, 0, 1), new Vector3(0, 0.417, 0.056)),
      dome(0.004, new Vector3(0, 0, 1), new Vector3(0, 0.323, 0.056)),
    ]),
    ZINC,
  ]);
  return parts;
}

const ATLAS_W = 1024;
const ATLAS_H = 512;
const EMAIL_AT = [0, 0, 1024, 136] as const;
const NUMBER_AT = [0, 160, 240, 316] as const;

function lettering() {
  return localizedCanvasTexture(ATLAS_W, ATLAS_H, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const [ex, ey, ew, eh] = EMAIL_AT;
    let size = 96;
    do {
      ctx.font = `700 ${size}px ui-monospace, Consolas, monospace`;
      if (ctx.measureText(EMAIL).width <= ew - 40) break;
      size -= 2;
    } while (size > 12);
    ctx.fillStyle = '#33302a';
    ctx.fillText(EMAIL, ex + ew / 2, ey + eh / 2 + 2);

    const [nx, ny, nw, nh] = NUMBER_AT;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.roundRect(nx + 20, ny + 38, nw - 40, nh - 76, 14);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 136px Georgia, "Times New Roman", serif';
    ctx.fillText(HOUSE_NUMBER, nx + nw / 2, ny + nh / 2 + 8);
  });
}

function decal(w: number, h: number, at: readonly [number, number, number, number]): PlaneGeometry {
  const g = new PlaneGeometry(w, h, 4, 1);
  const uv = g.attributes.uv;
  const [x, y, rw, rh] = at;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      (x + uv.getX(i) * rw) / ATLAS_W,
      1 - (y + (1 - uv.getY(i)) * rh) / ATLAS_H,
    );
  }
  return g;
}

export function buildMailbox(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): HyperObject {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  const parts: Part[] = [...carpentry(), ...body(), ...door(), ...flag(), ...letters()];
  moved(parts, FOOTING.x, 0, FOOTING.z, YAW);

  parts.push([pos(box(FOOTING.w, FOOTING.top + 0.05, FOOTING.d, 0.012), FOOTING.x, (FOOTING.top - 0.05) / 2, FOOTING.z), CONCRETE]);
  parts.push([
    pos(lathe([[0.125, FOOTING.top - 0.002], [0.118, FOOTING.top + 0.008], [0.09, FOOTING.top + 0.022], [0, FOOTING.top + 0.024]], 14), FOOTING.x, 0, FOOTING.z),
    CONCRETE,
  ]);
  for (const [g, opts] of parts) object.addGeometry(world.shared, g, opts);

  const textY = FLOOR + 0.045;
  const textZ = REAR + LEN / 2 - 0.005;
  const decals = [
    decal(0.42, 0.056, EMAIL_AT).rotateY(Math.PI / 2).translate(W / 2 + 0.004, textY, textZ),
    decal(0.42, 0.056, EMAIL_AT).rotateY(-Math.PI / 2).translate(-W / 2 - 0.004, textY, textZ),
    decal(0.078, 0.104, NUMBER_AT).translate(0, 0.37, 0.0595),
  ];
  const map = lettering();
  for (const g of decals) {
    g.rotateY(YAW).translate(FOOTING.x, 0, FOOTING.z);
    object.addGeometry(world.shared, g, {
      map,
      color: 0xffffff,
      ambient: 0.9,
      alphaTest: 0.3,
      alphaBlend: true,
      castShadow: false,
      receiveShadow: false,
    });
  }

  world.add(object);
  return object;
}
