import {
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Path,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Texture,
} from 'three';
import { aimed, box, lathe, merge, moved, pos, rod, type Part } from '../geometry';
import {
  GyroVector,
  HM,
  HyperObject,
  type HyperMaterialOptions,
  type HyperWorld,
} from '../../engine';
import { L, t, type Localized } from '../../content/i18n';
import { STATIONS } from '../../content/stations';
import { EXHIBIT_LATERAL, SENTRIES } from '../layout';
import { ARCH_AT, PORTRAIT_AT } from '../skeleton';
import { localizedCanvasTexture } from '../text';
import { easelPole, easelSpots } from './easels';
import { pencil } from './stationery';
import { triangleCorners } from './triangle';

/**
 * Station 3: architecture — a floor globe of THIS world, beside the drafting
 * table its plan is pinned to.
 *
 * Not an illustration: the map is drawn from the same data that places the
 * real things. The path is the real path, the dots are the real stations,
 * the triangle is the real triangle, and the pin — the pin is YOU. It tracks
 * the visitor's position live as they walk. The station's text claims the
 * honest architecture diagram is one the designer has to live in; the model
 * proves it by putting the viewer on the map.
 *
 * Map convention: the world's ground is a 2-sphere with SPAWN at the north
 * pole, so the aisle — a great circle through spawn — appears on the globe
 * as a pair of opposite meridians, and the far pole is the antipode. The
 * outbound half of the walk runs down one meridian and the return half comes
 * up the other; that is why the stations split between the two.
 *
 * LEGIBILITY. Everything on this map has to be identifiable from a metre away
 * with no key to consult, so each kind of thing is drawn as a picture of
 * itself and the stations carry the same two-digit numbers their signs do.
 * Match a number here to a number out there and the map is decoded.
 */

const GLOBE_R = 0.42;
/**
 * The cradle's lean — ring, pole caps and stand. Purely cosmetic furniture,
 * exactly as a desk globe's fork is.
 */
const CRADLE_TILT = -0.355;
/**
 * How the MAP sits inside that cradle: tuned by eye so the aisle meridian and
 * the station dots face a visitor standing on the path. The sphere turning
 * independently of its fork is what real globes do, and it means the map can
 * be aimed without knocking the furniture over.
 */
const MAP_ROTATION = { x: -0.487, y: 2.942, z: -1.571 };

/** Ground point (bearing, geodesic distance from spawn) -> unit vector. */
function groundVec(bearing: number, dist: number): Vector3 {
  return new Vector3(
    Math.sin(dist) * Math.sin(bearing),
    Math.cos(dist),
    -Math.sin(dist) * Math.cos(bearing),
  );
}

/** (along, lateral) in radians -> ground unit vector, spherical Pythagoras. */
function pathVec(along: number, lateral: number): Vector3 {
  const dist = Math.acos(
    Math.max(-1, Math.min(1, Math.cos(along) * Math.cos(lateral))),
  );
  const bearing = Math.atan2(Math.tan(lateral), Math.sin(along));
  return groundVec(bearing, dist);
}

/**
 * Ground vector -> texture UV, matching three's SphereGeometry mapping
 * (v = 0 at +y, u from atan2 around the axis).
 */
function toUV(g: Vector3): { u: number; v: number } {
  const u = (Math.atan2(g.z, -g.x) / (2 * Math.PI) + 1) % 1;
  const v = Math.acos(Math.max(-1, Math.min(1, g.y))) / Math.PI;
  return { u, v };
}

// Marks are painted turned a quarter, because MAP_ROTATION lays the map's pole axis on its side.
const MARK_TURN = Math.PI / 2;

const MAP_W = 2048;
const MAP_H = 1024;
const MONO = 'ui-monospace, Consolas, monospace';

const TURF = '#b9d39c';
const PATH = '#f1e8cb';
const CREAM = '#efece3';
const CASE = '#5c574c';
const INK = '#20262c';
const HALO = '#eae6d8';

/** Radius of the plate painted at spawn, in radians of ground. */
const SPAWN_CAP = 0.09;
/** The aisle's real gap at the antipode, in radians. */
const ANTIPODE_GAP = 0.05;

type Paint = (ctx: CanvasRenderingContext2D) => void;

/**
 * Horizontal stretch that makes a shape painted flat come out ROUND on the
 * sphere.
 *
 * Meridians crowd together toward the poles, so a circle drawn on an
 * equirectangular canvas is squeezed into a lens up there; this is the
 * inverse. Clamped, because the correction diverges at the pole itself and
 * nothing legible fits within a few units of spawn anyway.
 */
function stretch(v: number): number {
  return 1 / Math.max(0.3, Math.sin(v * Math.PI));
}

/**
 * Run a paint in a frame centred on a ground point, aspect-corrected, three
 * times across the seam so a mark at u = 0 is not cut in half. Everything
 * below draws in local pixels around an origin and lets this place it.
 */
function atPoint(ctx: CanvasRenderingContext2D, g: Vector3, paint: Paint): void {
  const { u, v } = toUV(g);
  const s = stretch(v);
  for (const dx of [-MAP_W, 0, MAP_W]) {
    ctx.save();
    ctx.translate(u * MAP_W + dx, v * MAP_H);
    ctx.scale(s, 1);
    ctx.rotate(MARK_TURN);
    paint(ctx);
    ctx.restore();
  }
}

/**
 * Stroke a chain of ground points.
 *
 * u is unwrapped as the chain is walked, so a line crossing the seam carries
 * on off the edge instead of streaking back across the entire map — and the
 * whole chain is then drawn on both sides of that edge.
 */
function polyline(ctx: CanvasRenderingContext2D, pts: Vector3[]): void {
  const xs: number[] = [];
  const ys: number[] = [];
  let prev = 0;
  for (const p of pts) {
    const { u, v } = toUV(p);
    const x = xs.length ? u - Math.round(u - prev) : u;
    prev = x;
    xs.push(x * MAP_W);
    ys.push(v * MAP_H);
  }
  for (const dx of [-MAP_W, 0, MAP_W]) {
    ctx.beginPath();
    for (let i = 0; i < xs.length; i++) {
      if (i) ctx.lineTo(xs[i] + dx, ys[i]);
      else ctx.moveTo(xs[i] + dx, ys[i]);
    }
    ctx.stroke();
  }
}

/** A place name, haloed so it survives whatever it lands on. */
function label(ctx: CanvasRenderingContext2D, g: Vector3, text: string, dy: number): void {
  atPoint(ctx, g, (c) => {
    c.font = `600 27px ${MONO}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.letterSpacing = '2px';
    c.lineWidth = 8;
    c.lineJoin = 'round';
    c.strokeStyle = HALO;
    c.strokeText(text, 0, dy);
    c.fillStyle = '#2f3a2a';
    c.fillText(text, 0, dy);
  });
}

/**
 * The exhibits, numbered exactly as their signs are. This is the map's key:
 * there is no legend anywhere on the globe, because the legend is the world.
 */
function stationMark(ctx: CanvasRenderingContext2D, g: Vector3, n: number): void {
  atPoint(ctx, g, (c) => {
    c.beginPath();
    c.arc(0, 0, 27, 0, Math.PI * 2);
    c.fillStyle = CREAM;
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = CASE;
    c.stroke();

    c.font = `700 26px ${MONO}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.letterSpacing = '0px';
    c.fillStyle = INK;
    c.fillText(String(n).padStart(2, '0'), 0, 1);
  });
}

/** The arch: drawn as an arch, so it needs no naming. */
function archMark(ctx: CanvasRenderingContext2D, g: Vector3): void {
  atPoint(ctx, g, (c) => {
    c.lineWidth = 10;
    c.lineCap = 'round';
    c.strokeStyle = '#e6e1d4';
    c.beginPath();
    c.moveTo(-21, 20);
    c.lineTo(-21, -2);
    c.arc(0, -2, 21, Math.PI, 0);
    c.lineTo(21, 20);
    c.stroke();
  });
}

/** The figure on its plinth, far down the path. */
function figureMark(ctx: CanvasRenderingContext2D, g: Vector3): void {
  atPoint(ctx, g, (c) => {
    c.fillStyle = '#4f4842';
    c.beginPath();
    c.arc(0, -13, 8, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(-12, 19);
    c.lineTo(-6, -3);
    c.lineTo(6, -3);
    c.lineTo(12, 19);
    c.closePath();
    c.fill();
  });
}

/** The chess table, dead centre of the triangle. */
function chessMark(ctx: CanvasRenderingContext2D, g: Vector3): void {
  atPoint(ctx, g, (c) => {
    const s = 11;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        c.fillStyle = (i + j) % 2 ? '#3f3a33' : '#e6dfcf';
        c.fillRect(-1.5 * s + i * s, -1.5 * s + j * s, s, s);
      }
    }
    c.lineWidth = 3;
    c.strokeStyle = '#6b5b48';
    c.strokeRect(-1.5 * s, -1.5 * s, 3 * s, 3 * s);
  });
}

/** One easel: canvas, frame, two splayed legs. */
function easelMark(ctx: CanvasRenderingContext2D, g: Vector3): void {
  atPoint(ctx, g, (c) => {
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.strokeStyle = '#8d6f4a';
    c.beginPath();
    c.moveTo(-9, 5);
    c.lineTo(-14, 18);
    c.moveTo(9, 5);
    c.lineTo(14, 18);
    c.stroke();
    c.fillStyle = '#d8cdb6';
    c.fillRect(-12, -15, 24, 21);
    c.strokeRect(-12, -15, 24, 21);
  });
}

/** A sentry camera on its pole, still turning to face you. */
function cameraMark(ctx: CanvasRenderingContext2D, g: Vector3): void {
  atPoint(ctx, g, (c) => {
    c.strokeStyle = '#7e858c';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(0, 16);
    c.lineTo(0, 0);
    c.stroke();
    c.fillStyle = '#4b5359';
    c.fillRect(-11, -12, 18, 11);
    c.beginPath();
    c.arc(-11, -6, 5, 0, Math.PI * 2);
    c.fill();
  });
}

function paintMap(ctx: CanvasRenderingContext2D, unitScale: number): void {
  const W = MAP_W;
  const H = MAP_H;

  // ---------------- turf, with a seeded mottle so the globe reads as terrain
  // rather than plastic. Seeded, so a language switch repaints it identically.
  ctx.fillStyle = TURF;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 1360; i++) {
    const rx = (Math.sin(i * 127.1) * 0.5 + 0.5) * W;
    const ry = (Math.sin(i * 311.7) * 0.5 + 0.5) * H;
    const rr = 16 + (Math.sin(i * 74.3) * 0.5 + 0.5) * 52;
    ctx.fillStyle = i % 2 ? '#afcc90' : '#c4dba8';
    ctx.beginPath();
    ctx.ellipse(rx, ry, rr, rr * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------------- graticule: rings of distance from spawn and spokes of
  // bearing, every 30 degrees. Faint, but it is the thing that turns a green
  // ball into a globe, and it gives the eye somewhere to measure from.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 2;
  for (let k = 1; k < 6; k++) {
    const y = (k / 6) * H;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  for (let k = 0; k < 12; k++) {
    const x = (k / 12) * W;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  // ---------------- spawn.
  //
  // It is the map's north pole, where the canvas's entire top edge collapses
  // to a point — so a band across the top paints a CAP on the ground there.
  // That is the only way to mark the pole at all, and it costs nothing: the
  // aisle's two meridians visibly run out of it, which is the truth.
  ctx.fillStyle = PATH;
  ctx.fillRect(0, 0, W, (SPAWN_CAP / Math.PI) * H);

  // ---------------- the aisle: a great circle through spawn = two opposite
  // meridians, dashed like the real slabs. The gap at the very bottom is the
  // real gap in the slabs at the antipode.
  ctx.strokeStyle = PATH;
  ctx.lineWidth = 13;
  ctx.setLineDash([20, 11]);
  for (const g of [pathVec(0.3, 0), pathVec(Math.PI + 0.3, 0)]) {
    const { u } = toUV(g);
    ctx.beginPath();
    ctx.moveTo(u * W, 0);
    ctx.lineTo(u * W, H - (ANTIPODE_GAP / Math.PI) * H);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ---------------- the triangle, on its lawn around the "right pole", with
  // the same 90° at every corner that is painted on the real ground.
  const C = triangleCorners();
  const centroid = new Vector3(1, 0, 0);
  ctx.strokeStyle = '#5f7052';
  ctx.lineWidth = 7;
  for (let s = 0; s < 3; s++) {
    const a = C[s];
    const b = C[(s + 1) % 3];
    const side: Vector3[] = [];
    for (let i = 0; i <= 32; i++) {
      const f = i / 32;
      side.push(a.clone().multiplyScalar(1 - f).addScaledVector(b, f).normalize());
    }
    polyline(ctx, side);
  }
  for (const c of C) {
    label(ctx, c.clone().multiplyScalar(0.86).addScaledVector(centroid, 0.14).normalize(), '90°', 0);
  }

  // ---------------- the station bays. Same tables the world builds from: a
  // spur off the path out to where the exhibit really stands, set back at
  // EXHIBIT_LATERAL, not at the nominal lateral in the content table.
  for (const s of STATIONS) {
    const along = s.at * unitScale;
    const lateral = Math.sign(s.lateral) * EXHIBIT_LATERAL * unitScale;
    const spur: Vector3[] = [];
    for (let i = 0; i <= 6; i++) spur.push(pathVec(along, (lateral * i) / 6));
    ctx.strokeStyle = PATH;
    ctx.lineWidth = 7;
    polyline(ctx, spur);
  }

  // ---------------- the landmarks off the path.
  chessMark(ctx, centroid);
  for (const spot of easelSpots()) easelMark(ctx, spot);
  for (const [at, lateral] of SENTRIES) {
    cameraMark(ctx, pathVec(at * unitScale, lateral * unitScale));
  }

  // ---------------- the arch ahead of spawn, and the figure far beyond it.
  archMark(ctx, pathVec(ARCH_AT * unitScale, 0));
  figureMark(ctx, pathVec(PORTRAIT_AT * unitScale, 0));

  // ---------------- the numbered exhibits, last, so nothing crosses them.
  for (const s of STATIONS) {
    stationMark(
      ctx,
      pathVec(s.at * unitScale, Math.sign(s.lateral) * EXHIBIT_LATERAL * unitScale),
      s.n,
    );
  }

  // ---------------- names, for the handful of things a picture cannot carry
  // on its own. Kept to single short words: the map has room for text only
  // out near its equator, where the meridians are still far apart.
  const NAMES: Array<[Vector3, Localized, number]> = [
    [pathVec(PORTRAIT_AT * unitScale, 0), L('me', 'ben'), -34],
    [centroid, L('chess', 'satranç'), 38],
    [easelPole(), L('easels', 'sehpalar'), 74],
  ];
  for (const [g, text, dy] of NAMES) label(ctx, g, t(text), dy);
}

function worldMapTexture(unitScale: number): Texture {
  return localizedCanvasTexture(MAP_W, MAP_H, (ctx) => paintMap(ctx, unitScale));
}

const PLAN_W = 1536;
const PLAN_H = 1024;
const PLAN_R = 318;
const PLAN_Y = 452;
const PLAN_NEAR = 404;
const PLAN_FAR = 1132;
const SHEET = '#6a9bd2';
const LINE = '#f4f8ff';
const FAINT = 'rgba(244, 248, 255, 0.32)';

interface Plotted {
  x: number;
  y: number;
  far: boolean;
}

/** Two hemispheres side by side, each drawn flat around its own pole: spawn on the left, the antipode on the right. */
function plot(g: Vector3): Plotted {
  const dist = Math.acos(Math.max(-1, Math.min(1, g.y)));
  const bearing = Math.atan2(g.x, -g.z);
  const far = dist > Math.PI / 2;
  const r = ((far ? Math.PI - dist : dist) / (Math.PI / 2)) * PLAN_R;
  return {
    x: (far ? PLAN_FAR : PLAN_NEAR) + (far ? -1 : 1) * Math.sin(bearing) * r,
    y: PLAN_Y - Math.cos(bearing) * r,
    far,
  };
}

function planLine(ctx: CanvasRenderingContext2D, pts: Vector3[]): void {
  ctx.beginPath();
  let side: boolean | null = null;
  for (const g of pts) {
    const p = plot(g);
    if (p.far === side) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
    side = p.far;
  }
  ctx.stroke();
}

function paintPlan(ctx: CanvasRenderingContext2D, unitScale: number): void {
  const W = PLAN_W;
  const H = PLAN_H;
  ctx.fillStyle = SHEET;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(244, 248, 255, 0.09)';
  ctx.lineWidth = 2;
  for (let x = 64; x < W; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 64; y < H; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 5;
  ctx.strokeRect(26, 26, W - 52, H - 52);
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  for (const cx of [PLAN_NEAR, PLAN_FAR]) {
    ctx.strokeStyle = FAINT;
    ctx.lineWidth = 2;
    for (const f of [1 / 3, 2 / 3]) {
      ctx.beginPath();
      ctx.arc(cx, PLAN_Y, PLAN_R * f, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(a) * PLAN_R, PLAN_Y - Math.sin(a) * PLAN_R);
      ctx.lineTo(cx + Math.cos(a) * PLAN_R, PLAN_Y + Math.sin(a) * PLAN_R);
      ctx.stroke();
    }
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, PLAN_Y, PLAN_R, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 9;
  ctx.setLineDash([18, 10]);
  const aisle: Vector3[] = [];
  for (let i = 0; i <= 240; i++) aisle.push(pathVec((i / 240) * Math.PI * 2, 0));
  planLine(ctx, aisle);
  ctx.setLineDash([]);

  ctx.lineWidth = 4;
  for (const s of STATIONS) {
    const along = s.at * unitScale;
    const lateral = Math.sign(s.lateral) * EXHIBIT_LATERAL * unitScale;
    const spur: Vector3[] = [];
    for (let i = 0; i <= 6; i++) spur.push(pathVec(along, (lateral * i) / 6));
    planLine(ctx, spur);
  }

  const C = triangleCorners();
  ctx.lineWidth = 5;
  for (let s = 0; s < 3; s++) {
    const side: Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const f = i / 48;
      side.push(C[s].clone().multiplyScalar(1 - f).addScaledVector(C[(s + 1) % 3], f).normalize());
    }
    planLine(ctx, side);
  }

  const mark = (g: Vector3, paint: (x: number, y: number) => void): void => {
    const p = plot(g);
    paint(p.x, p.y);
  };
  const caption = (text: string, x: number, y: number, size = 22, align: CanvasTextAlign = 'center'): void => {
    ctx.font = `600 ${size}px ${MONO}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = SHEET;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = LINE;
    ctx.fillText(text, x, y);
  };

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 3;
  const centroid = new Vector3(1, 0, 0);
  mark(centroid, (x, y) => {
    ctx.fillStyle = SHEET;
    ctx.fillRect(x - 13, y - 13, 26, 26);
    ctx.strokeRect(x - 13, y - 13, 26, 26);
    ctx.fillStyle = LINE;
    ctx.fillRect(x - 13, y - 13, 13, 13);
    ctx.fillRect(x, y, 13, 13);
    caption(t(L('chess', 'satranç')), x, y + 32, 20);
  });
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 3;
  for (const spot of easelSpots()) {
    mark(spot, (x, y) => {
      ctx.fillStyle = SHEET;
      ctx.fillRect(x - 8, y - 8, 16, 16);
      ctx.strokeRect(x - 8, y - 8, 16, 16);
    });
  }
  for (const [at, lateral] of SENTRIES) {
    mark(pathVec(at * unitScale, lateral * unitScale), (x, y) => {
      ctx.fillStyle = SHEET;
      ctx.beginPath();
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x + 9, y + 7);
      ctx.lineTo(x - 9, y + 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
  }
  mark(pathVec(ARCH_AT * unitScale, 0), (x, y) => {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, 15, Math.PI, 0);
    ctx.stroke();
    ctx.lineWidth = 3;
  });
  mark(pathVec(PORTRAIT_AT * unitScale, 0), (x, y) => {
    ctx.fillStyle = LINE;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    caption(t(L('me', 'ben')), x + 34, y, 20);
  });

  for (const s of STATIONS) {
    mark(pathVec(s.at * unitScale, Math.sign(s.lateral) * EXHIBIT_LATERAL * unitScale), (x, y) => {
      ctx.fillStyle = SHEET;
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.font = `700 22px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = LINE;
      ctx.fillText(String(s.n).padStart(2, '0'), x, y + 1);
    });
  }

  ctx.letterSpacing = '3px';
  caption(t(L('NEAR SIDE · SPAWN AT CENTRE', 'YAKIN YARI · MERKEZ BAŞLANGIÇ')), PLAN_NEAR, PLAN_Y + PLAN_R + 34, 21);
  caption(t(L('FAR SIDE · ANTIPODE AT CENTRE', 'UZAK YARI · MERKEZ ANTİPOT')), PLAN_FAR, PLAN_Y + PLAN_R + 34, 21);

  const dimY = PLAN_Y - PLAN_R - 30;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PLAN_NEAR - PLAN_R, dimY);
  ctx.lineTo(PLAN_NEAR + PLAN_R, dimY);
  for (const sx of [-1, 1]) {
    const x = PLAN_NEAR + sx * PLAN_R;
    ctx.moveTo(x, dimY - 10);
    ctx.lineTo(x, dimY + 22);
    ctx.moveTo(x, dimY);
    ctx.lineTo(x - sx * 14, dimY - 6);
    ctx.moveTo(x, dimY);
    ctx.lineTo(x - sx * 14, dimY + 6);
  }
  ctx.stroke();
  caption('π', PLAN_NEAR, dimY, 26);

  const bx = W - 492;
  const by = H - 196;
  ctx.fillStyle = SHEET;
  ctx.fillRect(bx, by, 452, 156);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 3;
  ctx.strokeRect(bx, by, 452, 156);
  ctx.beginPath();
  ctx.moveTo(bx, by + 62);
  ctx.lineTo(bx + 452, by + 62);
  ctx.moveTo(bx, by + 110);
  ctx.lineTo(bx + 452, by + 110);
  ctx.moveTo(bx + 250, by + 62);
  ctx.lineTo(bx + 250, by + 156);
  ctx.stroke();
  ctx.fillStyle = LINE;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '4px';
  ctx.font = `700 34px ${MONO}`;
  ctx.fillText(t(L('SITE PLAN', 'VAZİYET PLANI')), bx + 20, by + 32);
  ctx.letterSpacing = '1px';
  ctx.font = `600 21px ${MONO}`;
  ctx.fillText('muratozcan.me', bx + 20, by + 86);
  ctx.fillText('K = +1', bx + 270, by + 86);
  ctx.fillText(t(L('SCALE 1 : 1', 'ÖLÇEK 1 : 1')), bx + 20, by + 134);
  ctx.fillText('2π ≡ 0', bx + 270, by + 134);
  ctx.letterSpacing = '0px';

  ctx.font = `500 20px ${MONO}`;
  ctx.fillStyle = LINE;
  ctx.textAlign = 'left';
  [
    t(L('Every corner of the triangle is 90°.', 'Üçgenin her köşesi 90°.')),
    t(L('Walk straight and you come back.', 'Dümdüz yürürsen geri dönersin.')),
  ].forEach((line, i) => ctx.fillText(line, 70, H - 108 + i * 30));
}

const PAINT: HyperMaterialOptions = { color: 0x8793a0, ambient: 0.7, gloss: 0.5 };
const LAMINATE: HyperMaterialOptions = { color: 0xfbfaf5, ambient: 0.82, gloss: 0.4 };
const ALUMINIUM: HyperMaterialOptions = { color: 0xe2e5e8, ambient: 0.7, gloss: 0.45, metal: 0.7 };
const CHROME: HyperMaterialOptions = { color: 0xf0f2f4, ambient: 0.68, gloss: 0.75, metal: 1 };
const BRASS: HyperMaterialOptions = { color: 0xe9cb7a, ambient: 0.6, gloss: 0.6, metal: 0.9 };
const RUBBER: HyperMaterialOptions = { color: 0x5b5e63, ambient: 0.62, gloss: 0.12 };
const VINYL: HyperMaterialOptions = { color: 0x62666d, ambient: 0.64, gloss: 0.42 };
const BLACK: HyperMaterialOptions = { color: 0x666c74, ambient: 0.66, gloss: 0.55 };
const ACRYLIC: HyperMaterialOptions = { color: 0xe6eff0, ambient: 0.8, gloss: 0.7 };
const PAPER: HyperMaterialOptions = { color: 0xf8f5ea, ambient: 0.72, gloss: 0.06 };
const TAPE: HyperMaterialOptions = { color: 0xfbeebf, ambient: 0.84, gloss: 0.1 };
const ENAMEL: HyperMaterialOptions = { color: 0x78b596, ambient: 0.62, gloss: 0.6 };
const BLUEPRINT: HyperMaterialOptions = { color: 0x6a9bd2, ambient: 0.7, gloss: 0.08 };

const BOARD_W = 1.5;
const BOARD_H = 1.0;
const BOARD_T = 0.03;
const BOARD_TILT = 0.61;
const BOARD_PIVOT = 1.05;
const SHEET_AT: [number, number] = [0.02, 0.035];
const SHEET_SIZE: [number, number] = [1.2, 0.8];

function onBoard(g: BufferGeometry): BufferGeometry {
  return g.rotateX(-BOARD_TILT).translate(0, BOARD_PIVOT, 0);
}

function draftingTable(): Part[] {
  const face = BOARD_T / 2;
  const mounted: Part[] = [
    [box(BOARD_W, BOARD_H, BOARD_T, 0.003), LAMINATE],
    [pos(box(BOARD_W + 0.024, 0.012, BOARD_T + 0.006, 0.002), 0, BOARD_H / 2 + 0.004, 0), ALUMINIUM],
    [pos(box(BOARD_W + 0.024, 0.02, 0.075, 0.003), 0, -BOARD_H / 2 - 0.008, face + 0.016), ALUMINIUM],
    [pos(box(SHEET_SIZE[0], SHEET_SIZE[1], 0.003, 0.001), SHEET_AT[0], SHEET_AT[1], face + 0.0015), PAPER],
    [pos(box(1.38, 0.05, 0.004, 0.001), -0.06, -BOARD_H / 2 + 0.03, face + 0.004), ACRYLIC],
    [pos(box(0.036, 0.24, 0.024, 0.004), -BOARD_W / 2 - 0.022, -BOARD_H / 2 + 0.03, face - 0.004), BLACK],
    [pos(box(0.055, 0.022, 0.026, 0.005), 0.28, -BOARD_H / 2 + 0.014, face + 0.022), { color: 0xf2a39b, ambient: 0.62, gloss: 0.1 }],
  ];
  for (const sx of [-1, 1]) {
    mounted.push([
      pos(box(0.012, BOARD_H + 0.008, BOARD_T + 0.006, 0.002), sx * (BOARD_W / 2 + 0.004), 0, 0),
      ALUMINIUM,
    ]);
    for (const sy of [-1, 1]) {
      const tape = box(0.085, 0.024, 0.0012, 0.0004).rotateZ(-sx * sy * (Math.PI / 4));
      mounted.push([
        pos(
          tape,
          SHEET_AT[0] + sx * (SHEET_SIZE[0] / 2 - 0.008),
          SHEET_AT[1] + sy * (SHEET_SIZE[1] / 2 - 0.008),
          face + 0.0086,
        ),
        TAPE,
      ]);
    }
  }
  for (const [colour, x] of [[0xf2c84b, 0.5], [0xe8604e, 0.02]] as Array<[number, number]>) {
    mounted.push(...moved(pencil(colour), x, -BOARD_H / 2 + 0.002, face + 0.018));
  }
  for (const [g] of mounted) onBoard(g);

  const parts: Part[] = [...mounted];
  const X = 0.62;
  const TUBE = 0.022;
  for (const sx of [-1, 1]) {
    const x = sx * X;
    parts.push([rod(new Vector3(x, 0.03, -0.42), new Vector3(x, 0.03, 0.36), TUBE, TUBE, 10), PAINT]);
    for (const z of [-0.43, 0.37]) {
      parts.push([pos(new CylinderGeometry(0.026, 0.026, 0.04, 10).rotateX(Math.PI / 2), x, 0.03, z), RUBBER]);
    }
    parts.push([rod(new Vector3(x, 0.03, -0.05), new Vector3(x, 1.04, -0.05), TUBE, TUBE, 10), PAINT]);
    parts.push([rod(new Vector3(x, 0.03, -0.33), new Vector3(x, 1.285, -0.188), 0.016, 0.016, 8), PAINT]);
    parts.push([pos(box(0.05, 0.07, 0.06, 0.006), x, 1.035, -0.035), PAINT]);
    const knob = lathe([[0.001, 0], [0.012, 0], [0.012, 0.012], [0.034, 0.016], [0.036, 0.03], [0.026, 0.036], [0.001, 0.036]], 12);
    parts.push([pos(knob.rotateZ(-sx * Math.PI / 2), x + sx * 0.024, 1.035, -0.035), BLACK]);
  }
  for (const [y, z, r] of [[0.12, -0.322, 0.016], [0.46, -0.05, 0.016], [0.03, 0.28, 0.018]]) {
    parts.push([rod(new Vector3(-X, y, z), new Vector3(X, y, z), r, r, 8), PAINT]);
  }

  const trayX = X + 0.228;
  const trayY = 0.82;
  parts.push([pos(box(0.42, 0.006, 0.3, 0.002), trayX, trayY, 0), PAINT]);
  for (const sz of [-1, 1]) {
    parts.push([pos(box(0.42, 0.03, 0.006, 0.002), trayX, trayY + 0.012, sz * 0.147), PAINT]);
  }
  parts.push([pos(box(0.006, 0.03, 0.3, 0.002), trayX + 0.207, trayY + 0.012, 0), PAINT]);
  parts.push([
    rod(new Vector3(X + 0.015, trayY - 0.3, -0.05), new Vector3(trayX + 0.1, trayY - 0.003, -0.05), 0.009, 0.009, 8),
    PAINT,
  ]);

  const top = trayY + 0.003;
  const legs = 0.2;
  const short = 0.12;
  const square = new Shape();
  square.moveTo(0, 0);
  square.lineTo(legs, 0);
  square.lineTo(0, short);
  square.closePath();
  const hole = new Path();
  hole.moveTo(0.03, 0.03);
  hole.lineTo(0.03, short * 0.55);
  hole.lineTo(legs * 0.55, 0.03);
  hole.closePath();
  square.holes.push(hole);
  const setSquare = new ExtrudeGeometry(square, { depth: 0.003, bevelEnabled: false });
  setSquare.rotateX(-Math.PI / 2).rotateY(0.3);
  parts.push([pos(setSquare, trayX - 0.17, top, 0.1), { color: 0xf6b65a, ambient: 0.66, gloss: 0.6 }]);

  const hinge = new Vector3(trayX + 0.04, top + 0.007, -0.1);
  for (const swing of [-0.22, 0.26]) {
    const tip = new Vector3(hinge.x + Math.sin(swing) * 0.15, top + 0.004, hinge.z + Math.cos(swing) * 0.15);
    parts.push([rod(hinge, tip, 0.005, 0.0012, 6), CHROME]);
  }
  parts.push([pos(new CylinderGeometry(0.009, 0.009, 0.012, 10), hinge.x, hinge.y, hinge.z), CHROME]);
  parts.push([rod(hinge, new Vector3(hinge.x, hinge.y, hinge.z - 0.03), 0.004, 0.004, 6), BLACK]);
  parts.push([
    pos(
      lathe([[0.001, 0], [0.03, 0], [0.032, 0.008], [0.032, 0.04], [0.016, 0.052], [0.016, 0.066], [0.001, 0.066]], 14),
      trayX + 0.13,
      top,
      0.06,
    ),
    { color: 0x5b6f96, ambient: 0.6, gloss: 0.8 },
  ]);

  return parts;
}

function lamp(): Part[] {
  const parts: Part[] = [];
  const x = -0.62;
  const clamp = new Vector3(x, BOARD_PIVOT + (BOARD_H / 2) * Math.cos(BOARD_TILT), -(BOARD_H / 2) * Math.sin(BOARD_TILT));
  const foot = clamp.clone().add(new Vector3(0, 0.03, -0.03));
  const elbow = new Vector3(x, foot.y + 0.3, foot.z - 0.12);
  const head = new Vector3(x + 0.14, elbow.y + 0.02, elbow.z + 0.4);
  const target = new Vector3(x + 0.42, BOARD_PIVOT + 0.1, 0);

  parts.push([pos(box(0.05, 0.08, 0.07, 0.008), clamp.x, clamp.y - 0.01, clamp.z - 0.01), BLACK]);
  for (const off of [-0.011, 0.011]) {
    const shift = new Vector3(off, 0, 0);
    parts.push([rod(foot.clone().add(shift), elbow.clone().add(shift), 0.005, 0.005, 6), CHROME]);
    parts.push([rod(elbow.clone().add(shift), head.clone().add(shift), 0.005, 0.005, 6), CHROME]);
  }
  for (const joint of [foot, elbow, head]) {
    parts.push([
      pos(new CylinderGeometry(0.016, 0.016, 0.034, 10).rotateZ(Math.PI / 2), joint.x, joint.y, joint.z),
      BLACK,
    ]);
  }

  const outer = lathe([[0.001, 0], [0.03, 0], [0.034, 0.022], [0.106, 0.14], [0.11, 0.142]], 18);
  const inner = lathe([[0.108, 0.142], [0.102, 0.14], [0.03, 0.024], [0.001, 0.024]], 18);
  const bulb = new SphereGeometry(0.03, 10, 8).translate(0, 0.075, 0);
  const aim = (g: BufferGeometry): BufferGeometry => aimed(g, head, target);
  parts.push([aim(outer), ENAMEL]);
  parts.push([aim(inner), { color: 0xffffff, ambient: 0.8, gloss: 0.3 }]);
  parts.push([aim(bulb), { color: 0xfff1c4, ambient: 1, gloss: 0.01 }]);
  return parts;
}

function stool(): Part[] {
  const parts: Part[] = [];
  const SEAT = 0.58;
  parts.push([
    pos(lathe([[0.001, 0], [0.15, 0], [0.172, 0.014], [0.174, 0.036], [0.156, 0.058], [0.09, 0.068], [0.001, 0.07]], 22), 0, SEAT, 0),
    VINYL,
  ]);
  parts.push([pos(new CylinderGeometry(0.13, 0.13, 0.012, 20), 0, SEAT - 0.006, 0), BLACK]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const floor = new Vector3(sx * 0.2, 0.012, sz * 0.2);
      parts.push([rod(floor, new Vector3(sx * 0.1, SEAT - 0.006, sz * 0.1), 0.012, 0.012, 8), CHROME]);
      parts.push([pos(new CylinderGeometry(0.015, 0.017, 0.022, 8), floor.x, 0.011, floor.z), RUBBER]);
    }
  }
  const ringAt = 0.2;
  const reach = Math.SQRT2 * (0.2 - (0.1 * ringAt) / SEAT);
  parts.push([pos(new TorusGeometry(reach, 0.008, 6, 28).rotateX(Math.PI / 2), 0, ringAt, 0), CHROME]);
  return parts;
}

function plansBin(): Part[] {
  const parts: Part[] = [];
  const H = 0.44;
  const wall = (y: number): number => 0.122 + 0.026 * (y / H);
  const WIRES = 26;

  parts.push([lathe([[0.001, 0], [wall(0), 0], [wall(0.016), 0.016], [0.001, 0.016]], 22), BLACK]);
  const mesh: BufferGeometry[] = [];
  for (let k = 0; k < WIRES; k++) {
    const a = (k / WIRES) * Math.PI * 2;
    mesh.push(
      rod(
        new Vector3(Math.cos(a) * wall(0.01), 0.01, Math.sin(a) * wall(0.01)),
        new Vector3(Math.cos(a) * wall(H), H, Math.sin(a) * wall(H)),
        0.0035,
        0.0035,
        4,
      ),
    );
  }
  for (const y of [0.12, 0.23, 0.34]) {
    mesh.push(pos(new TorusGeometry(wall(y), 0.0035, 4, 26).rotateX(Math.PI / 2), 0, y, 0));
  }
  mesh.push(pos(new TorusGeometry(wall(H), 0.007, 6, 26).rotateX(Math.PI / 2), 0, H, 0));
  parts.push([merge(mesh), BLACK]);

  const rimReach = wall(H) - 0.01;
  const FLOOR = 0.016;
  const rolls: Array<[number, number, number, boolean]> = [
    [0.04, 0.74, 0.7, false],
    [0.033, 0.62, 2.4, true],
    [0.037, 0.82, 3.9, false],
    [0.03, 0.66, 5.5, false],
  ];
  for (const [r, long, around, blueOut] of rolls) {
    const base = 0.052;
    const lean = Math.atan((rimReach - r - base) / (H - FLOOR));
    const place = (geometry: BufferGeometry): BufferGeometry =>
      geometry
        .rotateY(around * 3)
        .rotateZ(-lean * Math.cos(around))
        .rotateX(lean * Math.sin(around))
        .translate(Math.cos(around) * base, FLOOR, Math.sin(around) * base);
    const bore = r * 0.82;
    const out = blueOut ? BLUEPRINT : PAPER;
    const inside = blueOut ? PAPER : BLUEPRINT;
    parts.push([place(lathe([[r, 0], [r, long]], 16)), out]);
    parts.push([place(lathe([[r + 0.0018, 0.01], [r + 0.0018, long - 0.006]], 6, 2.3)), out]);
    parts.push([place(lathe([[r, long], [bore, long]], 16)), PAPER]);
    parts.push([place(lathe([[bore, long], [bore, long - 0.28], [0.001, long - 0.28]], 16)), inside]);
    parts.push([
      place(new TorusGeometry(r + 0.002, 0.0028, 6, 18).rotateX(Math.PI / 2).translate(0, long * 0.74, 0)),
      { color: 0xe39a6c, ambient: 0.68, gloss: 0.2 },
    ]);
  }
  return parts;
}

const GLOBE_AT = new Vector3(1.05, 0.98, 0.2);

function globeStand(): Part[] {
  const top = GLOBE_AT.y - GLOBE_R - 0.045;
  const parts: Part[] = [
    [
      lathe([[0.001, 0], [0.31, 0], [0.315, 0.012], [0.3, 0.026], [0.14, 0.05], [0.07, 0.058], [0.001, 0.058]], 28),
      BLACK,
    ],
    [lathe([[0.3, 0.026], [0.304, 0.03], [0.29, 0.034]], 28), BRASS],
    [
      lathe(
        [
          [0.001, 0.05],
          [0.05, 0.056],
          [0.034, 0.09],
          [0.026, 0.14],
          [0.024, top - 0.07],
          [0.036, top - 0.05],
          [0.036, top - 0.03],
          [0.026, top],
          [0.001, top],
        ],
        16,
      ),
      CHROME,
    ],
    [pos(new CylinderGeometry(0.03, 0.036, 0.04, 12), 0, top + 0.016, 0), BRASS],
  ];
  return moved(parts, GLOBE_AT.x, 0, GLOBE_AT.z);
}

export interface WorldModelHandle {
  object: HyperObject;
  /** Moves the you-are-here pin. Called every frame by the station tickers. */
  tick: (worldGV: GyroVector, dt: number) => void;
}

export function buildWorldModel(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): WorldModelHandle {
  const object = new HyperObject(at);
  object.rotation.y = yaw;
  const put = (parts: Part[], node?: Group): void => {
    for (const [g, opts] of parts) object.addGeometry(world.shared, g, opts, node);
  };

  const TABLE_X = -0.6;
  const TABLE_Z = -0.1;
  put(moved([...draftingTable(), ...lamp()], TABLE_X, 0, TABLE_Z));
  put(moved(stool(), TABLE_X + 0.3, 0, TABLE_Z + 0.95, 0.5));
  put(moved(plansBin(), TABLE_X - 1.12, 0, TABLE_Z + 0.15));
  put(globeStand());

  const plan = new PlaneGeometry(SHEET_SIZE[0] - 0.004, SHEET_SIZE[1] - 0.004, 8, 6);
  plan.translate(SHEET_AT[0], SHEET_AT[1], BOARD_T / 2 + 0.007);
  onBoard(plan).translate(TABLE_X, 0, TABLE_Z);
  object.addGeometry(world.shared, plan, {
    map: localizedCanvasTexture(PLAN_W, PLAN_H, (ctx) => paintPlan(ctx, HM.unitScale)),
    color: 0xffffff,
    ambient: 0.9,
    castShadow: false,
    receiveShadow: false,
  });

  const cradleNode = new Group();
  cradleNode.position.copy(GLOBE_AT);
  cradleNode.rotation.z = CRADLE_TILT;
  object.add(cradleNode);

  const cradle: Part[] = [[new TorusGeometry(GLOBE_R + 0.03, 0.013, 8, 56), BRASS]];
  for (const s of [-1, 1]) {
    cradle.push([pos(new CylinderGeometry(0.018, 0.018, 0.06, 10), 0, s * (GLOBE_R + 0.03), 0), BRASS]);
  }
  cradle.push([
    pos(lathe([[0.001, 0], [0.055, 0], [0.058, 0.006], [0.02, 0.012], [0.001, 0.012]], 16), 0, GLOBE_R + 0.004, 0),
    BRASS,
  ]);
  put(cradle, cradleNode);

  // The pin hangs off this node: it reads map coordinates and inherits the aim.
  const mapNode = new Group();
  mapNode.position.copy(GLOBE_AT);
  mapNode.rotation.set(MAP_ROTATION.x, MAP_ROTATION.y, MAP_ROTATION.z);
  object.add(mapNode);

  object.addGeometry(
    world.shared,
    new SphereGeometry(GLOBE_R, 40, 28),
    {
      map: worldMapTexture(HM.unitScale),
      color: 0xffffff,
      ambient: 0.78,
      receiveShadow: false,
    },
    mapNode,
  );

  const pinNode = new Group();
  mapNode.add(pinNode);
  put(
    [
      [new ConeGeometry(0.02, 0.06, 10).rotateX(Math.PI).translate(0, 0.04, 0), { color: 0xff8a6c, ambient: 0.72, gloss: 0.5 }],
      [new SphereGeometry(0.019, 10, 8).translate(0, 0.082, 0), { color: 0xff8a6c, ambient: 0.72, gloss: 0.7 }],
    ],
    pinNode,
  );

  const up = new Vector3(0, 1, 0);
  const viewer = new Vector3();
  let clock = 0;

  const tick = (worldGV: GyroVector, dt: number) => {
    clock += dt;
    // Where the viewer is, in the world's own chart: invert the world
    // transform and read the point. Chart radius -> geodesic distance,
    // chart direction -> bearing; both drop straight onto the map sphere.
    worldGV.inverse().point(viewer);
    const dist = 2 * Math.atan(viewer.length());
    const bearing = Math.atan2(viewer.x, -viewer.z);
    const g = groundVec(bearing, dist);

    const bob = 1 + Math.sin(clock * 2.4) * 0.012;
    pinNode.position.copy(g).multiplyScalar(GLOBE_R * bob);
    pinNode.quaternion.setFromUnitVectors(up, g);
  };

  tick(new GyroVector(), 0);

  world.add(object);
  return { object, tick };
}
