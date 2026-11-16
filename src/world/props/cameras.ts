import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  PlaneGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  Vector3,
  type Mesh,
  type Texture,
} from 'three';
import {
  GyroVector,
  HyperObject,
  mobiusAdd,
  unitToPoincare,
  type HyperMaterialOptions,
  type HyperWorld,
} from '../../engine';
import { L, t, upper } from '../../content/i18n';
import { RoundedBoxGeometry, grained, lathe, merge, moved, roundedRect, trace, type Part, type Point } from '../geometry';
import { localizedCanvasTexture, shrinkToFit } from '../text';

/**
 * Security cameras that watch you.
 *
 * The tracking is the whole point, and it works because of how the engine is
 * shaped rather than in spite of it: the viewer never moves, so "where is the
 * player" is answered by composing the camera's own placement with the world
 * transform and inverting it. The result is the viewer's position expressed in
 * the camera's local frame, which is exactly what an aim needs.
 *
 * No raycast, no world-space lookAt, no distance check. One GyroVector
 * composition per camera per frame.
 */

/**
 * A camera that turns to face the viewer.
 *
 * The head is a nested node so it can rotate independently of the pole it is
 * bolted to — the shader reads the full world matrix, so nesting just works.
 */
export class Watcher {
  readonly head = new Group();
  /** Radians per second the head can turn. Deliberately unhurried. */
  slew = 1.6;

  private yaw = 0;
  private pitch = 0;
  private readonly viewer = new Vector3();
  private readonly mount = new Vector3();
  private readonly headP = new Vector3();
  private readonly dir = new Vector3();

  constructor(
    private readonly object: HyperObject,
    /** Yaw of the pole and arm the head hangs from, which its rotation is relative to. */
    private readonly baseYaw: number,
  ) {
    this.head.rotation.order = 'YXZ';
  }

  update(worldGV: GyroVector, dt: number): void {
    // Compose the camera's placement with the world transform, then invert:
    // that maps the viewer (who sits permanently at the origin) into this
    // object's own frame, in Poincare coordinates.
    const composed = this.object.localGV.add(worldGV);
    composed.inverse().point(this.viewer);

    // Aim from the HEAD, not from the base of the pole. With the viewer at eye
    // height 1 and a head three units up, using the object origin points the
    // camera at the sky.
    //
    // Converting to Unit coordinates to do that subtraction is a trap. Unit
    // goes via Klein, which is the gnomonic chart: it diverges at exactly a
    // quarter turn and INVERTS beyond it. The quarter turn is 15.7 units in a
    // 62.8-unit world, so anything further than that aimed backwards, and
    // crossing the boundary whipped the head through 180 degrees.
    //
    // Staying in Poincare avoids all of it. The head is only metres from the
    // object origin — far inside the quarter turn — so lifting THAT through
    // Unit is safe, and the direction to the viewer is then the Mobius
    // difference, which is well defined at every distance short of the
    // antipode.
    this.head.updateWorldMatrix(true, false);
    this.head.getWorldPosition(this.mount);
    unitToPoincare(this.mount, false, this.headP);

    mobiusAdd(this.headP.negate(), this.viewer, this.dir);

    const dx = this.dir.x;
    const dy = this.dir.y;
    const dz = this.dir.z;

    const horizontal = Math.hypot(dx, dz);
    // The head hangs under nodes that already carry the pole and arm yaw, so
    // subtract them to get a rotation relative to its parent.
    const targetYaw = Math.atan2(-dx, -dz) - this.baseYaw;
    const targetPitch = Math.atan2(dy, horizontal);

    const step = this.slew * dt;
    this.yaw += clampAngle(targetYaw - this.yaw) * Math.min(1, step);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, step);

    this.head.rotation.y = this.yaw;
    this.head.rotation.x = this.pitch;
  }
}

/** Shortest signed way round to an angle difference. */
function clampAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

const GALV: HyperMaterialOptions = { color: 0xdfe4e8, ambient: 0.62, gloss: 0.3, metal: 0.16, grain: 0.2 };
const CONCRETE: HyperMaterialOptions = { color: 0xc9c7c0, ambient: 0.62, gloss: 0.03, grain: 0.1 };
const STAINLESS: HyperMaterialOptions = { color: 0xe8ebed, ambient: 0.62, gloss: 0.62, metal: 0.75 };
const ZINC: HyperMaterialOptions = { color: 0xdccb86, ambient: 0.6, gloss: 0.45, metal: 0.55 };
const WHITE: HyperMaterialOptions = { color: 0xf3f6fa, ambient: 0.64, gloss: 0.45 };
const BRACKET: HyperMaterialOptions = { color: 0xe2e7ec, ambient: 0.62, gloss: 0.34 };
const PLATED: HyperMaterialOptions = { color: 0xcfd5da, ambient: 0.6, gloss: 0.5, metal: 0.5 };
const RUBBER: HyperMaterialOptions = { color: 0x4b4f55, ambient: 0.6, gloss: 0.18 };
const CONDUIT: HyperMaterialOptions = { color: 0x5d6268, ambient: 0.6, gloss: 0.3 };
const BEZEL: HyperMaterialOptions = { color: 0x50545a, ambient: 0.58, gloss: 0.4 };
const GLASS: HyperMaterialOptions = { color: 0x23282e, ambient: 0.5, gloss: 0.95 };
const LENS: HyperMaterialOptions = { color: 0x18263a, ambient: 0.5, gloss: 1 };
const INFRARED: HyperMaterialOptions = { color: 0x94606c, ambient: 0.6, gloss: 0.8 };
const SENSOR: HyperMaterialOptions = { color: 0xb9c7b0, ambient: 0.6, gloss: 0.7 };
const ENCLOSURE: HyperMaterialOptions = { color: 0xd0d6db, ambient: 0.62, gloss: 0.24 };
const PLATE: HyperMaterialOptions = { color: 0xdadde0, ambient: 0.62, gloss: 0.4, metal: 0.4 };

// The recording lamp is found in the merged head by this ambient: nothing else in a head may use it.
const LAMP_AMBIENT = 0.999;
const LAMP_ON = new Color(0xff4634);
const LAMP_OFF = new Color(0x74201c);
const LAMP: HyperMaterialOptions = { color: LAMP_ON, ambient: LAMP_AMBIENT, gloss: 0.3 };
const BLINK = 2.4;

const SPECKLE = new Map<HyperMaterialOptions, number>([
  [GALV, 34],
  [CONCRETE, 60],
]);

const UP = new Vector3(0, 1, 0);
const smoothstep = (a: number, b: number, x: number): number => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
const deg = (d: number): number => (d * Math.PI) / 180;
const polar = (bearing: number, r: number, y: number): Vector3 =>
  new Vector3(Math.sin(bearing) * r, y, Math.cos(bearing) * r);

class Bins {
  private readonly bins = new Map<HyperMaterialOptions, BufferGeometry[]>();

  put(material: HyperMaterialOptions, ...geometry: BufferGeometry[]): void {
    const bin = this.bins.get(material);
    if (bin) bin.push(...geometry);
    else this.bins.set(material, geometry);
  }

  parts(): Part[] {
    return [...this.bins].map(([material, geometry]) => {
      const merged = merge(geometry);
      const scale = SPECKLE.get(material);
      return [scale ? grained(merged, 'y', scale, scale) : merged, material];
    });
  }
}

function finish(position: number[], index: number[], normal?: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array((position.length / 3) * 2), 2));
  g.setIndex(index);
  if (normal) g.setAttribute('normal', new BufferAttribute(new Float32Array(normal), 3));
  else g.computeVertexNormals();
  return g;
}

function faceted(geometry: BufferGeometry): BufferGeometry {
  const g = geometry.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

function tube(path: Vector3[], radius: number, radial = 8): BufferGeometry {
  const n = path.length;
  const position: number[] = [];
  const normal: number[] = [];
  const index: number[] = [];
  const tangent = new Vector3();
  const previous = new Vector3();
  const side = new Vector3();
  const out = new Vector3();
  const turn = new Quaternion();
  for (let i = 0; i < n; i++) {
    tangent.subVectors(path[Math.min(i + 1, n - 1)], path[Math.max(i - 1, 0)]).normalize();
    if (i === 0) {
      side.set(1, 0, 0);
      if (Math.abs(tangent.x) > 0.9) side.set(0, 1, 0);
      side.cross(tangent).normalize();
    } else {
      side.applyQuaternion(turn.setFromUnitVectors(previous, tangent));
    }
    previous.copy(tangent);
    for (let k = 0; k < radial; k++) {
      out.copy(side).applyAxisAngle(tangent, (k / radial) * Math.PI * 2);
      position.push(path[i].x + out.x * radius, path[i].y + out.y * radius, path[i].z + out.z * radius);
      normal.push(out.x, out.y, out.z);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k;
      const b = i * radial + ((k + 1) % radial);
      index.push(a, b, a + radial, b, b + radial, a + radial);
    }
  }
  return finish(position, index, normal);
}

function patch(rows: Vector3[][], facing: Vector3): BufferGeometry {
  const m = rows[0].length;
  const position: number[] = [];
  for (const row of rows) for (const p of row) position.push(p.x, p.y, p.z);
  const first = new Vector3()
    .subVectors(rows[1][0], rows[0][0])
    .cross(new Vector3().subVectors(rows[0][1], rows[0][0]));
  const flip = first.dot(facing) < 0;
  const index: number[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j;
      const b = a + 1;
      const c = a + m;
      const d = c + 1;
      if (flip) index.push(a, b, c, b, d, c);
      else index.push(a, c, b, b, c, d);
    }
  }
  return finish(position, index);
}

/**
 * A curved plate about the z axis, centred on +y, spanning `half` either way.
 * `ends` gives the z extent at each angle (as a fraction -1..1 of the span).
 */
function arcShell(
  rIn: number,
  rOut: number,
  half: number,
  n: number,
  ends: (u: number) => [number, number],
  rows = 1,
): BufferGeometry {
  const outer: Vector3[][] = [];
  const inner: Vector3[][] = [];
  for (let i = 0; i <= n; i++) {
    const u = (2 * i) / n - 1;
    const a = u * half;
    const [z0, z1] = ends(u);
    const o: Vector3[] = [];
    const s: Vector3[] = [];
    for (let j = 0; j <= rows; j++) {
      const z = z0 + ((z1 - z0) * j) / rows;
      o.push(new Vector3(Math.sin(a) * rOut, Math.cos(a) * rOut, z));
      s.push(new Vector3(Math.sin(a) * rIn, Math.cos(a) * rIn, z));
    }
    outer.push(o);
    inner.push(s);
  }
  const radial = new Vector3(-Math.sin(half), Math.cos(half), 0);
  const along = new Vector3(Math.cos(half), Math.sin(half), 0);
  return merge([
    patch(outer, radial),
    patch(inner, radial.clone().negate()),
    patch([outer.map((r) => r[0]), inner.map((r) => r[0])], new Vector3(0, 0, -1)),
    patch([outer.map((r) => r[rows]), inner.map((r) => r[rows])], new Vector3(0, 0, 1)),
    patch([outer[0], inner[0]], along.clone().negate()),
    patch([outer[n], inner[n]], new Vector3(Math.cos(half), -Math.sin(half), 0)),
  ]);
}

/** A curved plate standing against a pole: about the y axis, centred on +z. */
function saddle(r: number, thick: number, half: number, n: number, y0: number, y1: number): BufferGeometry {
  return arcShell(r, r + thick, half, n, () => [-y1, -y0]).rotateX(Math.PI / 2);
}

interface Bump {
  at: number;
  half: number;
  lift: number;
}

const BAND_T = 0.0025;
const RAMP = deg(14);

/** A steel band strapped round a pole, riding over whatever it holds there. */
function band(r: number, y: number, bumps: Bump[] = [], width = 0.02): BufferGeometry {
  const angles: number[] = [];
  for (let i = 0; i < 12; i++) angles.push((i / 12) * Math.PI * 2);
  for (const b of bumps) {
    const steps = Math.max(2, Math.round((2 * b.half) / deg(24)));
    for (let i = 0; i <= steps; i++) angles.push(b.at - b.half + (2 * b.half * i) / steps);
    angles.push(b.at - b.half - RAMP, b.at + b.half + RAMP);
  }
  const wrapped = angles.map((a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
  const samples = wrapped.filter((a, i) => i === 0 || a - wrapped[i - 1] > 1e-4);
  samples.push(samples[0] + Math.PI * 2);

  const lift = (a: number): number => {
    let most = 0;
    for (const b of bumps) {
      const off = Math.abs(clampAngle(a - b.at));
      most = Math.max(most, b.lift * (1 - Math.min(1, Math.max(0, (off - b.half) / RAMP))));
    }
    return most;
  };
  const ring = (extra: number, at: number): Vector3[] =>
    samples.map((a) => polar(a, r + lift(a) + extra, at));
  const lo = y - width / 2;
  const hi = y + width / 2;
  const outward = polar(samples[0], 1, 0);
  const rows = (a: Vector3[], b: Vector3[]): Vector3[][] => a.map((p, i) => [p, b[i]]);
  return merge([
    patch(rows(ring(BAND_T + 0.0003, lo), ring(BAND_T + 0.0003, hi)), outward),
    patch(rows(ring(0.0003, hi), ring(BAND_T + 0.0003, hi)), UP),
    patch(rows(ring(0.0003, lo), ring(BAND_T + 0.0003, lo)), UP.clone().negate()),
  ]);
}

function buckle(r: number, y: number, at: number): BufferGeometry {
  return new BoxGeometry(0.02, 0.026, 0.01).translate(0, y, r + BAND_T + 0.005).rotateY(at);
}

/** A cable gland standing on y = 0, pointing up. */
function gland(): BufferGeometry {
  return lathe(
    [
      [0.016, 0],
      [0.016, 0.006],
      [0.0115, 0.0085],
      [0.0145, 0.0112],
      [0.0145, 0.019],
      [0.0105, 0.026],
      [0.0085, 0.026],
    ],
    6,
  );
}
const GLAND_H = 0.026;

/* ------------------------------------------------------------------------- */

/** Housing axis below the tilt axis. */
const DROP = 0.116;
const BODY_R = 0.052;
const BALL_R = 0.036;
/** Tilt axis to the centre line of the arm above it; everything the head can reach stays under this. */
const ARM_RISE = 0.275;
const ARM_REACH = 0.42;
const ARM_R = 0.022;
const BEND = 0.07;

/**
 * One camera and the fork it tilts in, about the tilt axis, looking along -z.
 *
 * The node this goes on turns in both pan and tilt, so nothing in it may reach
 * inside the drum it pans on: within 0.05 of the y axis above y = 0.03 belongs
 * to the bracket, and so does everything further than ARM_RISE - ARM_R up.
 */
function head(): Part[] {
  const bins = new Bins();
  const forward = (g: BufferGeometry): BufferGeometry => g.rotateX(-Math.PI / 2).translate(0, -DROP, 0);

  bins.put(
    WHITE,
    forward(
      lathe(
        [
          [0.001, -0.16],
          [0.03, -0.156],
          [0.047, -0.142],
          [BODY_R, -0.122],
          [BODY_R, -0.108],
          [0.0495, -0.107],
          [0.0495, -0.103],
          [BODY_R, -0.102],
          [BODY_R, 0.128],
          [0.0495, 0.129],
          [0.0495, 0.133],
          [BODY_R, 0.134],
        ],
        16,
      ),
    ),
    arcShell(BODY_R + 0.002, BODY_R + 0.006, deg(78), 10, (u) => [-0.218 + 0.055 * u * u, 0.105], 2).translate(
      0,
      -DROP,
      0,
    ),
  );
  bins.put(
    BEZEL,
    forward(
      lathe(
        [
          [BODY_R, 0.134],
          [BODY_R, 0.158],
          [0.05, 0.165],
          [0.0462, 0.165],
          [0.0458, 0.157],
        ],
        16,
      ),
    ),
    forward(
      lathe(
        [
          [0.023, 0.157],
          [0.023, 0.1615],
          [0.019, 0.163],
          [0.017, 0.159],
        ],
        10,
      ),
    ),
  );
  bins.put(GLASS, new CircleGeometry(0.046, 16).rotateY(Math.PI).translate(0, -DROP, -0.157));
  bins.put(
    LENS,
    forward(
      lathe(
        [
          [0.017, 0.159],
          [0.012, 0.1612],
          [0.006, 0.1625],
          [0.0005, 0.163],
        ],
        10,
      ),
    ),
  );
  for (let k = 0; k < 8; k++) {
    const a = deg(22.5 + 45 * k);
    bins.put(
      INFRARED,
      new CircleGeometry(0.0052, 6)
        .rotateY(Math.PI)
        .translate(Math.cos(a) * 0.0335, -DROP + Math.sin(a) * 0.0335, -0.1582),
    );
  }
  bins.put(SENSOR, new CircleGeometry(0.004, 6).rotateY(Math.PI).translate(0, -DROP + 0.036, -0.1582));
  bins.put(
    LAMP,
    new SphereGeometry(0.0058, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2)
      .rotateX(-Math.PI / 2)
      .translate(0, -DROP - 0.0355, -0.157),
  );

  const rear = (g: BufferGeometry): BufferGeometry => g.rotateX(Math.PI / 2).translate(0, -DROP, 0.157);
  bins.put(RUBBER, rear(gland()));
  const lead = new CatmullRomCurve3(
    [
      new Vector3(0, -DROP, 0.178),
      new Vector3(0, -DROP, 0.212),
      new Vector3(-0.022, -0.097, 0.228),
      new Vector3(-0.058, -0.06, 0.208),
      new Vector3(-0.088, -0.026, 0.148),
      new Vector3(-0.102, -0.005, 0.068),
      new Vector3(-0.1, 0, 0.028),
      new Vector3(-0.09, 0, 0.008),
      new Vector3(-0.076, 0, 0),
      new Vector3(-0.064, 0, 0),
    ],
    false,
    'centripetal',
  ).getPoints(20);
  bins.put(RUBBER, tube(lead, 0.0065, 5));

  const railTop = -DROP + BODY_R + 0.016;
  bins.put(BRACKET, new RoundedBoxGeometry(0.03, 0.02, 0.15, 1, 0.003).translate(0, railTop - 0.01, 0.005));
  for (const z of [-0.052, 0.062]) {
    bins.put(STAINLESS, new CylinderGeometry(0.0065, 0.0065, 0.003, 6).translate(0, railTop + 0.0015, z));
  }

  const bridgeTop = railTop + 0.006;
  bins.put(PLATED, new BoxGeometry(0.098, 0.006, 0.06).translate(0, railTop + 0.003, 0));
  for (const x of [-0.029, 0.029]) {
    bins.put(STAINLESS, new CylinderGeometry(0.006, 0.006, 0.004, 6).translate(x, bridgeTop + 0.002, 0));
  }
  const lug: Point[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = deg(-25 + (230 * i) / 8);
    lug.push([Math.cos(a) * 0.024, Math.sin(a) * 0.024]);
  }
  lug.push([-0.03, railTop], [0.03, railTop]);
  for (const side of [-1, 1]) {
    const cheek = new ExtrudeGeometry(trace(new Shape(), lug), { depth: 0.008, bevelEnabled: false }).rotateY(-Math.PI / 2);
    bins.put(PLATED, cheek.translate(side > 0 ? 0.049 : -0.041, 0, 0));
    bins.put(PLATED, new CylinderGeometry(0.012, 0.012, 0.01, 8).rotateZ(Math.PI / 2).translate(side * 0.0365, 0, 0));
  }
  bins.put(
    STAINLESS,
    new CylinderGeometry(0.016, 0.016, 0.003, 12).rotateZ(Math.PI / 2).translate(0.0505, 0, 0),
    new CylinderGeometry(0.0105, 0.0105, 0.007, 6).rotateZ(Math.PI / 2).translate(0.0555, 0, 0),
  );
  bins.put(
    BRACKET,
    lathe(
      [
        [0.018, 0],
        [0.018, 0.01],
        [0.015, 0.014],
        [0.0125, 0.014],
      ],
      12,
    )
      .rotateZ(Math.PI / 2)
      .translate(-0.049, 0, 0),
  );
  bins.put(
    RUBBER,
    lathe(
      [
        [0.0125, 0.014],
        [0.0125, 0.022],
        [0.009, 0.0225],
        [0.009, 0.028],
        [0.0065, 0.028],
      ],
      6,
    )
      .rotateZ(Math.PI / 2)
      .translate(-0.049, 0, 0),
  );

  return bins.parts();
}

function findLamp(head: Group): { tint: BufferAttribute; at: number[] } | null {
  for (const child of head.children) {
    const tint = (child as Mesh).geometry?.getAttribute('aTint') as BufferAttribute | undefined;
    if (!tint) continue;
    const at: number[] = [];
    for (let i = 0; i < tint.count; i++) if (Math.abs(tint.getW(i) - LAMP_AMBIENT) < 1e-4) at.push(i);
    return at.length > 0 ? { tint, at } : null;
  }
  return null;
}

class Camera extends Watcher {
  private lamp: { tint: BufferAttribute; at: number[] } | null = null;
  private lit = true;

  constructor(object: HyperObject, baseYaw: number, private clock: number) {
    super(object, baseYaw);
  }

  override update(worldGV: GyroVector, dt: number): void {
    super.update(worldGV, dt);
    this.clock += dt;
    const lit = this.clock % BLINK < BLINK / 2;
    if (lit === this.lit) return;
    this.lamp ??= findLamp(this.head);
    if (!this.lamp) return;
    this.lit = lit;
    const { r, g, b } = lit ? LAMP_ON : LAMP_OFF;
    for (const i of this.lamp.at) this.lamp.tint.setXYZW(i, r, g, b, lit ? 1 : 0.62);
    this.lamp.tint.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------------- */

const SIGN_W = 0.19;
const SIGN_H = 0.2533;
const ATLAS_W = 1024;
const ATLAS_H = 512;
type Region = [x: number, y: number, w: number, h: number];
const SIGN_FACE: Region = [0, 0, 384, 512];
const HAZARD: Region = [400, 0, 256, 330];
const TAGS = ['CAM-01', 'CAM-02', 'CAM 03-05'];
const tagRegion = (i: number): Region => [664, i * 120, 360, 108];
// Every part of a pole that is not a label samples the middle of this block, so pole and labels are one draw call.
const BLANK: Region = [944, 432, 80, 80];
const NOTICE = L('24 hour recording', '24 saat kayıt');

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function paintPictogram(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  ctx.fillStyle = '#16181a';
  ctx.fillRect(cx + 34, cy - 92, 84, 14);
  ctx.fillRect(cx + 68, cy - 82, 16, 44);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.3);
  rounded(ctx, -100, -34, 190, 66, 12);
  ctx.fill();
  ctx.fillRect(-124, -46, 200, 13);
  ctx.fillRect(-122, -22, 26, 42);
  ctx.fillStyle = '#ffd53d';
  ctx.beginPath();
  ctx.arc(-62, 0, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintNotice(ctx: CanvasRenderingContext2D, text: string, cx: number, top: number, w: number, h: number): void {
  const words = text.split(' ');
  const layouts: string[][] = [[text]];
  for (let i = 1; i < words.length; i++) layouts.push([words.slice(0, i).join(' '), words.slice(i).join(' ')]);
  let best = { size: 0, lines: layouts[0] };
  for (const lines of layouts) {
    const size = shrinkToFit(Math.floor(h / (lines.length * 1.14)), 10, w, (px) => {
      ctx.font = `800 ${px}px "Segoe UI", Arial, sans-serif`;
      return Math.max(...lines.map((l) => ctx.measureText(l).width));
    });
    if (size > best.size * (lines.length > best.lines.length ? 1.25 : 1)) best = { size, lines };
  }
  ctx.font = `800 ${best.size}px "Segoe UI", Arial, sans-serif`;
  const pitch = best.size * 1.14;
  const first = top + (h - pitch * best.lines.length) / 2 + pitch / 2;
  best.lines.forEach((l, i) => ctx.fillText(l, cx, first + i * pitch));
}

let atlas: Texture | null = null;

function labels(): Texture {
  atlas ??= localizedCanvasTexture(ATLAS_W, ATLAS_H, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '0px';

    const [sx, sy, sw, sh] = SIGN_FACE;
    ctx.fillStyle = '#ffd53d';
    rounded(ctx, sx + 2, sy + 2, sw - 4, sh - 4, 26);
    ctx.fill();
    ctx.strokeStyle = '#16181a';
    ctx.lineWidth = 9;
    rounded(ctx, sx + 16, sy + 16, sw - 32, sh - 32, 16);
    ctx.stroke();
    paintPictogram(ctx, sx + sw / 2 - 6, sy + 158);
    ctx.fillStyle = '#16181a';
    ctx.font = '900 104px "Arial Black", "Segoe UI", Arial, sans-serif';
    ctx.fillText('CCTV', sx + sw / 2, sy + 300, sw - 70);
    ctx.fillRect(sx + 44, sy + 360, sw - 88, 6);
    paintNotice(ctx, upper(t(NOTICE)), sx + sw / 2, sy + 376, sw - 80, 100);

    const [hx, hy, hw, hh] = HAZARD;
    ctx.fillStyle = '#ffd53d';
    rounded(ctx, hx + 2, hy + 2, hw - 4, hh - 4, 20);
    ctx.fill();
    ctx.fillStyle = '#16181a';
    ctx.beginPath();
    ctx.moveTo(hx + hw / 2, hy + 24);
    ctx.lineTo(hx + hw - 30, hy + 214);
    ctx.lineTo(hx + 30, hy + 214);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd53d';
    ctx.beginPath();
    ctx.moveTo(hx + hw / 2, hy + 62);
    ctx.lineTo(hx + hw - 62, hy + 196);
    ctx.lineTo(hx + 62, hy + 196);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#16181a';
    ctx.beginPath();
    for (const [x, y] of [[8, -58], [-22, 6], [-2, 6], [-12, 56], [24, -14], [3, -14], [20, -58]]) {
      ctx.lineTo(hx + hw / 2 + x, hy + 140 + y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.font = '800 66px "Segoe UI", Arial, sans-serif';
    ctx.fillText('230 V', hx + hw / 2, hy + 270, hw - 40);

    TAGS.forEach((tag, i) => {
      const [x, y, tw, th] = tagRegion(i);
      ctx.fillStyle = '#f3f1e8';
      rounded(ctx, x + 2, y + 2, tw - 4, th - 4, 12);
      ctx.fill();
      ctx.strokeStyle = '#16181a';
      ctx.lineWidth = 5;
      rounded(ctx, x + 9, y + 9, tw - 18, th - 18, 7);
      ctx.stroke();
      ctx.fillStyle = '#16181a';
      ctx.font = '700 60px ui-monospace, Consolas, monospace';
      ctx.fillText(tag, x + tw / 2, y + th / 2 + 3, tw - 48);
    });

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(...BLANK);
  });
  return atlas;
}

function decal(width: number, [x, y, w, h]: Region): BufferGeometry {
  const g = new PlaneGeometry(width, (width * h) / w);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (x + uv.getX(i) * w) / ATLAS_W, 1 - (y + (1 - uv.getY(i)) * h) / ATLAS_H);
  }
  return g;
}

/* ------------------------------------------------------------------------- */

interface Kit {
  bins: Bins;
  decals: BufferGeometry[];
}

/** Parts built facing +z against a pole, turned to the bearing they are fixed at. */
function turned(parts: BufferGeometry[], bearing: number): BufferGeometry[] {
  for (const g of parts) g.rotateY(bearing);
  return parts;
}

function footing(kit: Kit, sides: number, corner: number, top: number): void {
  const block = lathe(
    [
      [corner, -0.08],
      [corner, top - 0.014],
      [corner - 0.018, top],
      [0.0005, top],
    ],
    sides,
  );
  kit.bins.put(CONCRETE, faceted(block).rotateY(Math.PI / sides));
}

function basePlate(kit: Kit, r: number, half: number, thick: number, stud: number, top: number): number {
  const up = top + thick;
  kit.bins.put(
    GALV,
    new ExtrudeGeometry(roundedRect(new Shape(), half * 2, half * 2, 0.022), { depth: thick, bevelEnabled: false, curveSegments: 2 })
      .rotateX(-Math.PI / 2)
      .translate(0, top, 0),
    lathe(
      [
        [r + 0.011, up],
        [r + 0.008, up + 0.006],
        [r, up + 0.011],
      ],
      16,
    ),
  );
  const reach = half - r - 0.012;
  const web: Point[] = [
    [r - 0.003, 0],
    [r + reach, 0],
    [r + reach, 0.012],
    [r + 0.012, reach * 1.25],
    [r - 0.003, reach * 1.25],
  ];
  for (let k = 0; k < 4; k++) {
    kit.bins.put(
      GALV,
      new ExtrudeGeometry(trace(new Shape(), web), { depth: 0.008, bevelEnabled: false })
        .translate(0, 0, -0.004)
        .rotateY(-Math.PI / 2 + (k * Math.PI) / 2)
        .translate(0, up, 0),
    );
  }
  const at = half - stud * 3.4;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      kit.bins.put(
        ZINC,
        new CylinderGeometry(stud * 2.3, stud * 2.3, 0.004, 8).translate(sx * at, up + 0.002, sz * at),
        new CylinderGeometry(stud * 1.75, stud * 1.75, stud * 1.5, 6)
          .rotateY(sx * sz * 0.4)
          .translate(sx * at, up + 0.004 + stud * 0.75, sz * at),
        new CylinderGeometry(stud, stud, stud * 4.2, 6).translate(sx * at, up + stud * 2.1, sz * at),
      );
    }
  }
  return up;
}

function column(kit: Kit, profile: Point[], segments: number): void {
  const fine: Point[] = [];
  profile.forEach(([r, y], i) => {
    if (i > 0) {
      const [r0, y0] = profile[i - 1];
      const steps = Math.ceil((y - y0) / 0.29);
      for (let s = 1; s < steps; s++) fine.push([r0 + ((r - r0) * s) / steps, y0 + ((y - y0) * s) / steps]);
    }
    fine.push([r, y]);
  });
  const [r, top] = profile[profile.length - 1];
  kit.bins.put(
    GALV,
    lathe(fine, segments),
    lathe(
      [
        [r + 0.004, top - 0.028],
        [r + 0.004, top],
        [r * 0.72, top + 0.015],
        [0.0005, top + 0.021],
      ],
      segments,
    ),
  );
}

function hatch(kit: Kit, r: number, y0: number, y1: number, bearing: number): void {
  kit.bins.put(GALV, ...turned([saddle(r, 0.004, deg(30), 3, y0, y1)], bearing));
  kit.bins.put(
    STAINLESS,
    ...turned(
      [y0 + 0.022, y1 - 0.022].map((y) =>
        new CylinderGeometry(0.0055, 0.0055, 0.003, 6).rotateX(Math.PI / 2).translate(0, y, r + 0.005),
      ),
      bearing,
    ),
  );
}

/**
 * A swan-neck bracket banded to the pole, with the pan bearing hanging from
 * its end. Returns where the tilt axis crosses the pan axis, which is where a
 * head goes, and where the lead leaves the arm for the junction box.
 */
function arm(kit: Kit, r: number, bearing: number, tilt: number): { pivot: Vector3; tail: Vector3 } {
  const y = tilt + ARM_RISE;
  const half = deg(48);
  const white: BufferGeometry[] = [saddle(r, 0.008, half, 4, y - 0.12, y + 0.1)];

  const path = [new Vector3(0, y, r + 0.004), new Vector3(0, y, ARM_REACH - BEND - 0.04)];
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    path.push(new Vector3(0, y - BEND + Math.cos(a) * BEND, ARM_REACH - BEND + Math.sin(a) * BEND));
  }
  path.push(new Vector3(0, tilt + 0.112, ARM_REACH));
  white.push(
    tube(path, ARM_R, 9),
    lathe(
      [
        [0.036, 0],
        [0.036, 0.008],
        [0.027, 0.013],
        [ARM_R, 0.013],
      ],
      12,
    )
      .rotateX(Math.PI / 2)
      .translate(0, y, r + 0.007),
    new ExtrudeGeometry(
      trace(new Shape(), [
        [r + 0.006, y + 0.018],
        [0.2, y + 0.018],
        [r + 0.02, y + 0.06],
        [r + 0.006, y + 0.06],
      ]),
      { depth: 0.006, bevelEnabled: false },
    )
      .translate(0, 0, -0.003)
      .rotateY(-Math.PI / 2),
    lathe(
      [
        [0.0005, -BALL_R],
        [0.018, -0.0312],
        [0.0312, -0.018],
        [BALL_R, 0],
        [BALL_R, 0.07],
        [0.031, 0.0705],
        [0.031, 0.076],
        [0.043, 0.0765],
        [0.043, 0.1],
        [0.039, 0.106],
        [0.026, 0.11],
        [0.026, 0.12],
      ],
      12,
    ).translate(0, tilt, ARM_REACH),
  );
  kit.bins.put(BRACKET, ...turned(white, bearing));

  const steel: BufferGeometry[] = [];
  for (const at of [y + 0.08, y - 0.085]) {
    steel.push(band(r, at, [{ at: 0, half, lift: 0.008 }]), buckle(r, at, Math.PI));
  }
  kit.bins.put(STAINLESS, ...turned(steel, bearing));

  const tailZ = r + 0.04;
  const tailY = y - ARM_R + 0.002;
  kit.bins.put(RUBBER, ...turned([gland().rotateX(Math.PI).translate(0, tailY, tailZ)], bearing));

  return {
    pivot: polar(bearing, ARM_REACH, tilt),
    tail: polar(bearing, tailZ, tailY - GLAND_H + 0.004),
  };
}

interface Box {
  w: number;
  h: number;
  d: number;
  y: number;
  bearing: number;
  tops: number[];
  conduit: number;
  spare: number;
  tag: number;
}

const GLAND_OFF = 0.034;

/** The junction box on its strap. Returns where each top gland ends, and the conduit gland under it. */
function junctionBox(kit: Kit, r: number, box: Box): { tops: Vector3[]; drop: Vector3 } {
  const { w, h, d, y, bearing } = box;
  const back = r + 0.012;
  const front = back + d;
  const top = y + h / 2;
  const bottom = y - h / 2;

  kit.bins.put(
    GALV,
    ...turned(
      [
        saddle(r, 0.005, deg(26), 3, bottom - 0.05, top + 0.05),
        new BoxGeometry(0.05, 0.03, 0.02).translate(0, y + h / 4, r + 0.003),
        new BoxGeometry(0.05, 0.03, 0.02).translate(0, y - h / 4, r + 0.003),
      ],
      bearing,
    ),
  );
  const straps = [top + 0.032, bottom - 0.032];
  kit.bins.put(
    STAINLESS,
    ...turned(
      straps.flatMap((at) => [band(r, at, [{ at: 0, half: deg(26), lift: 0.005 }], 0.016), buckle(r, at, deg(140))]),
      bearing,
    ),
  );

  const hingeX = -w / 2 - 0.0085;
  const latchX = w / 2 + 0.004;
  kit.bins.put(
    ENCLOSURE,
    ...turned(
      [
        new RoundedBoxGeometry(w, h, d, 1, 0.008).translate(0, y, back + d / 2),
        new RoundedBoxGeometry(w + 0.008, h + 0.008, 0.016, 1, 0.006).translate(0, y, front + 0.012),
      ],
      bearing,
    ),
  );
  const dark: BufferGeometry[] = [new BoxGeometry(w - 0.008, h - 0.008, 0.006).translate(0, y, front + 0.002)];
  const bright: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const at = y + (side * h) / 4;
    bright.push(
      new CylinderGeometry(0.006, 0.006, 0.044, 6).translate(hingeX, at, front + 0.003),
      new BoxGeometry(0.005, 0.036, 0.03).translate(-w / 2 - 0.0035, at, front - 0.006),
    );
    dark.push(new BoxGeometry(0.008, 0.034, 0.034).translate(latchX, at, front + 0.002));
    bright.push(new CylinderGeometry(0.004, 0.004, 0.012, 6).rotateZ(Math.PI / 2).translate(latchX + 0.002, at, front - 0.008));
  }

  const glandZ = r + GLAND_OFF;
  const tops = box.tops.map((x) => {
    dark.push(gland().translate(x, top, glandZ));
    return new Vector3(x, top + GLAND_H - 0.004, glandZ).applyAxisAngle(UP, bearing);
  });
  for (const x of [box.conduit, box.spare]) dark.push(gland().rotateX(Math.PI).translate(x, bottom, glandZ));
  bright.push(new CylinderGeometry(0.0095, 0.0095, 0.005, 6).translate(box.spare, bottom - GLAND_H - 0.0015, glandZ));

  kit.bins.put(RUBBER, ...turned(dark, bearing));
  kit.bins.put(STAINLESS, ...turned(bright, bearing));

  const face = front + 0.02 + 0.004;
  kit.decals.push(
    ...turned(
      [
        decal(w * 0.62, tagRegion(box.tag)).translate(0, top - 0.036, face),
        decal(w * 0.4, HAZARD).translate(0, y - h * 0.16, face),
      ],
      bearing,
    ),
  );

  return { tops, drop: new Vector3(box.conduit, bottom - GLAND_H + 0.004, glandZ) };
}

/** Rigid conduit from the box down the pole and out into the footing, on spacer saddles. */
function conduit(kit: Kit, r: number, bearing: number, from: Vector3, out: number, ground: number, clips: number[]): void {
  const x = from.x;
  const z = from.z;
  const path = [from.clone(), new Vector3(x, 0.46, z)];
  for (let i = 1; i <= 8; i++) {
    path.push(new Vector3(x, 0.46 - 0.22 * (i / 8), z + (out - z) * smoothstep(0, 1, i / 8)));
  }
  path.push(new Vector3(x, ground - 0.03, out));
  const pipe: BufferGeometry[] = [
    tube(path, 0.011, 6),
    new CylinderGeometry(0.0145, 0.0145, 0.03, 6).translate(x, 0.475, z),
    new CylinderGeometry(0.0145, 0.0145, 0.03, 6).translate(x, 0.225, out),
    new CylinderGeometry(0.018, 0.018, 0.036, 8).translate(x, ground + 0.012, out),
  ];
  kit.bins.put(CONDUIT, ...turned(pipe, bearing));

  const steel: BufferGeometry[] = [];
  const bolts: BufferGeometry[] = [];
  for (const y of clips) {
    const depth = z - r + 0.012;
    steel.push(
      new BoxGeometry(0.05, 0.02, depth).translate(x, y, z - depth / 2),
      arcShell(0.0115, 0.0142, Math.PI / 2, 3, () => [-y - 0.008, -y + 0.008])
        .rotateX(Math.PI / 2)
        .translate(x, 0, z),
    );
    for (const side of [-1, 1]) {
      steel.push(new BoxGeometry(0.011, 0.016, 0.003).translate(x + side * 0.019, y, z + 0.0015));
      bolts.push(
        new CylinderGeometry(0.0042, 0.0042, 0.004, 6).rotateX(Math.PI / 2).translate(x + side * 0.02, y, z + 0.005),
      );
    }
  }
  kit.bins.put(GALV, ...turned(steel, bearing));
  kit.bins.put(STAINLESS, ...turned(bolts, bearing));
}

interface Run {
  y0: number;
  y1: number;
  theta: (y: number) => number;
  radius: (y: number) => number;
}

const LEAD_R = 0.008;
const LEAD_OFF = 0.0118;

/**
 * Flexible conduit from a box gland up the pole to an arm, lying on the pole
 * between its ends and winding `sweep` radians round it between y = w0 and w1.
 */
function riser(kit: Kit, poleR: (y: number) => number, from: Vector3, to: Vector3, w0: number, w1: number): Run {
  const a0 = Math.atan2(from.x, from.z);
  const sweep = clampAngle(Math.atan2(to.x, to.z) - a0);
  const r0 = Math.hypot(from.x, from.z);
  const r1 = Math.hypot(to.x, to.z);
  const run: Run = {
    y0: from.y,
    y1: to.y,
    theta: (y) => a0 + sweep * smoothstep(w0, w1, y),
    radius: (y) => {
      const lying = poleR(y) + LEAD_OFF;
      const low = 1 - smoothstep(from.y + 0.02, from.y + 0.16, y);
      const high = smoothstep(to.y - 0.13, to.y - 0.02, y);
      return lying + (r0 - lying) * low + (r1 - lying) * high;
    },
  };
  const steps = Math.max(10, Math.ceil((to.y - from.y) / 0.06));
  const path: Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = from.y + ((to.y - from.y) * i) / steps;
    path.push(polar(run.theta(y), run.radius(y), y));
  }
  kit.bins.put(RUBBER, tube(path, LEAD_R, 5));
  return run;
}

function tie(kit: Kit, r: number, y: number, runs: Run[]): void {
  const bumps = runs
    .filter((run) => y > run.y0 && y < run.y1)
    .map((run) => ({ at: run.theta(y), half: Math.asin(LEAD_R / (r + LEAD_OFF)) * 1.15, lift: run.radius(y) - r + LEAD_R }));
  kit.bins.put(STAINLESS, band(r, y, bumps, 0.012));
}

function sign(kit: Kit, r: number, y: number, bearing: number): void {
  const rails: BufferGeometry[] = [];
  const bands: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const at = y + side * 0.085;
    rails.push(new BoxGeometry(0.06, 0.024, 0.03).translate(0, at, r - 0.002));
    bands.push(band(r, at, [], 0.014), buckle(r, at, Math.PI));
  }
  kit.bins.put(GALV, ...turned(rails, bearing));
  kit.bins.put(STAINLESS, ...turned(bands, bearing));
  kit.bins.put(
    PLATE,
    ...turned(
      [
        new ExtrudeGeometry(roundedRect(new Shape(), SIGN_W, SIGN_H, 0.013), { depth: 0.004, bevelEnabled: false, curveSegments: 3 }).translate(
          0,
          y,
          r + 0.013,
        ),
      ],
      bearing,
    ),
  );
  kit.decals.push(...turned([decal(SIGN_W, SIGN_FACE).translate(0, y, r + 0.021)], bearing));
}

function assemble(world: HyperWorld, object: HyperObject, kit: Kit, x: number, z: number): void {
  const map = labels();
  const u = (BLANK[0] + BLANK[2] / 2) / ATLAS_W;
  const v = 1 - (BLANK[1] + BLANK[3] / 2) / ATLAS_H;
  for (const [g, opts] of moved(kit.bins.parts(), x, 0, z)) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
    object.addGeometry(world.shared, g, { ...opts, map, alphaTest: 0.5 });
  }
  object.addGeometry(world.shared, merge(kit.decals).translate(x, 0, z), {
    map,
    alphaTest: 0.5,
    color: 0xffffff,
    ambient: 0.95,
    gloss: 0.06,
  });
}

function mount(world: HyperWorld, object: HyperObject, baseYaw: number, at: Vector3, phase: number): Camera {
  const camera = new Camera(object, baseYaw, phase);
  camera.head.position.copy(at);
  object.add(camera.head);
  for (const [g, opts] of head()) object.addGeometry(world.shared, g, opts, camera.head);
  return camera;
}

export interface CameraMastResult {
  object: HyperObject;
  watchers: Watcher[];
}

/** Where the mast stands in the security station's frame: the back-left corner, clear of the kennel. */
const MAST_X = -1.7;
const MAST_Z = -1.2;

/**
 * The security station: a stepped mast with three cameras, all of them
 * tracking.
 *
 * Heights are staggered and the arms point different ways, so from a distance
 * it reads as a cluster rather than a stack — and so at least one head is
 * always visibly moving no matter where you approach from.
 */
export function buildCameraMast(
  world: HyperWorld,
  at: GyroVector,
  baseYaw: number,
): CameraMastResult {
  const object = new HyperObject(at, false);
  object.rotation.y = baseYaw;

  const LOWER = 0.075;
  const UPPER = 0.058;
  const SWAGE: [number, number] = [2.15, 2.27];
  const poleR = (y: number): number => LOWER + (UPPER - LOWER) * Math.min(1, Math.max(0, (y - SWAGE[0]) / (SWAGE[1] - SWAGE[0])));
  // Arms are at least 90 degrees apart, so no arm crosses the reach of another arm's camera.
  const arms: Array<[tilt: number, bearing: number]> = [
    [2.6, deg(50)],
    [3.05, deg(-70)],
    [3.5, deg(170)],
  ];
  const BOX_AT = deg(-70);

  const kit: Kit = { bins: new Bins(), decals: [] };
  const GROUND = 0.13;
  footing(kit, 8, 0.42, GROUND);
  const foot = basePlate(kit, LOWER, 0.17, 0.018, 0.012, GROUND);
  column(
    kit,
    [
      [LOWER, foot],
      [LOWER, SWAGE[0]],
      [UPPER, SWAGE[1]],
      [UPPER, arms[2][0] + ARM_RISE + 0.14],
    ],
    18,
  );
  hatch(kit, LOWER, 0.46, 0.68, deg(200));

  const box = junctionBox(kit, LOWER, {
    w: 0.22,
    h: 0.3,
    d: 0.1,
    y: 1.78,
    bearing: BOX_AT,
    tops: [0.07, 0, -0.07],
    conduit: 0,
    spare: 0.07,
    tag: 2,
  });
  conduit(kit, LOWER, BOX_AT, box.drop, 0.27, GROUND, [1.42, 0.98, 0.6]);
  sign(kit, LOWER, 1.3, deg(20));

  const watchers: Watcher[] = [];
  const runs: Run[] = [];
  arms.forEach(([tilt, bearing], i) => {
    const { pivot, tail } = arm(kit, UPPER, bearing, tilt);
    runs.push(riser(kit, poleR, box.tops[i], tail, 2.0, i === 0 ? 2.6 : 2.7));
    watchers.push(mount(world, object, baseYaw, pivot.add(new Vector3(MAST_X, 0, MAST_Z)), i * 0.9));
  });
  tie(kit, LOWER, 2.12, runs);
  tie(kit, UPPER, 2.45, runs);
  tie(kit, UPPER, 3.09, runs);
  tie(kit, UPPER, 3.54, runs);

  assemble(world, object, kit, MAST_X, MAST_Z);
  world.add(object);
  return { object, watchers };
}

let poles = 0;

/**
 * A lone camera on its own pole.
 *
 * These go along the whole route, not just at the security station. They are
 * small and easy to miss on the way out; the intent is that you notice them on
 * the way back and realise they have been turning to follow you the entire
 * time.
 */
export function buildLoneCamera(
  world: HyperWorld,
  at: GyroVector,
  baseYaw: number,
  height = 2.4,
): { object: HyperObject; watcher: Watcher } {
  const object = new HyperObject(at, false);
  object.rotation.y = baseYaw;

  const R = 0.05;
  const BOX_AT = deg(-90);
  const kit: Kit = { bins: new Bins(), decals: [] };
  const GROUND = 0.1;
  footing(kit, 4, 0.26 * Math.SQRT2, GROUND);
  const foot = basePlate(kit, R, 0.12, 0.014, 0.009, GROUND);
  column(
    kit,
    [
      [R, foot],
      [R, height + ARM_RISE + 0.14],
    ],
    16,
  );
  hatch(kit, R, 0.42, 0.62, deg(90));

  const box = junctionBox(kit, R, {
    w: 0.15,
    h: 0.2,
    d: 0.08,
    y: height - 0.47,
    bearing: BOX_AT,
    tops: [0],
    conduit: 0,
    spare: 0.045,
    tag: poles % 2,
  });
  conduit(kit, R, BOX_AT, box.drop, 0.195, GROUND, [1.5, 1.02, 0.62]);
  sign(kit, R, height - 1.02, 0);

  const { pivot, tail } = arm(kit, R, 0, height);
  const run = riser(kit, () => R, box.tops[0], tail, height - 0.26, height + 0.08);
  tie(kit, R, height - 0.12, [run]);

  const watcher = mount(world, object, baseYaw, pivot, poles * 1.3);
  watcher.slew = 1.1;
  poles++;

  assemble(world, object, kit, 0, 0);
  world.add(object);
  return { object, watcher };
}
