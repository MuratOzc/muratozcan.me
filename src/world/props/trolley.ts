import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Texture,
} from 'three';
import {
  HyperObject,
  type GyroVector,
  type HyperMaterialOptions,
  type HyperWorld,
} from '../../engine';
import { sfx } from '../../audio';
import { L, t, upper } from '../../content/i18n';
import { box, grained, lathe, moved, pos, smooth, trace, type Part, type Point } from '../geometry';
import { Aim } from '../interact';
import { setNight } from '../sky';
import { localizedCanvasTexture, shrinkToFit } from '../text';
import { ATLAS, GREEN, Lamps, decal, fillet, paver, sweep, v3, type Region } from './trolleyKit';
import { buildServer, type Server, type ServerSpec } from './trolleyServers';

const FLOOR = 0.09;
const TOP = 0.72;
const HALF_W = 0.86;
const HALF_D = 0.37;
const DROP = 0.2;
const LEG_X = 0.8;
const LEG_Z = 0.33;
const TRAY = 0.33;
const TRAY_X = 0.845;
const TRAY_Z = 0.375;
const MAST_X = 1.06;
const BAR = 0.46;
const GRIP = 0.92;
const SPRING = 1.42;
const RISE = 0.28;
const TUBE = 0.016;
const WELL = TOP + 0.008;

const BRASS: HyperMaterialOptions = { color: 0xe9cb7a, ambient: 0.6, gloss: 0.62, metal: 0.9 };
const SILVER: HyperMaterialOptions = { color: 0xf3f5f7, ambient: 0.68, gloss: 0.85, metal: 0.85 };
const STEEL: HyperMaterialOptions = { color: 0xdde1e4, ambient: 0.62, gloss: 0.5, metal: 0.6 };
const CHROME: HyperMaterialOptions = { color: 0xeceff1, ambient: 0.66, gloss: 0.75, metal: 0.75 };
const WALNUT: HyperMaterialOptions = { color: 0xb08258, ambient: 0.56, gloss: 0.3, grain: 0.26 };
const CLOTH: HyperMaterialOptions = { color: 0xfdfbf5, ambient: 0.62, gloss: 0.04 };
const NAPKIN: HyperMaterialOptions = { color: 0xcb5670, ambient: 0.66, gloss: 0.04 };
const PORCELAIN: HyperMaterialOptions = { color: 0xf8f6ef, ambient: 0.68, gloss: 0.6 };
const RUBBER: HyperMaterialOptions = { color: 0x6c7076, ambient: 0.6, gloss: 0.12 };
const BLACK: HyperMaterialOptions = { color: 0x565a61, ambient: 0.6, gloss: 0.35 };
const BAKELITE: HyperMaterialOptions = { color: 0x55585e, ambient: 0.6, gloss: 0.55 };
const BRAKE: HyperMaterialOptions = { color: 0xe8574a, ambient: 0.64, gloss: 0.4 };
const CARD: HyperMaterialOptions = { color: 0xf7f1df, ambient: 0.7, gloss: 0.05 };
const IVORY: HyperMaterialOptions = { color: 0xf3eede, ambient: 0.68, gloss: 0.4 };
const CAST: HyperMaterialOptions = { color: 0xb7bfc3, ambient: 0.62, gloss: 0.3, metal: 0.3 };
const GROUT: HyperMaterialOptions = { color: 0xb5b0a4, ambient: 0.6, gloss: 0.03 };
const STONE: HyperMaterialOptions = { color: 0x7f9389, ambient: 0.62, gloss: 0.4 };
const INSET: HyperMaterialOptions = { color: 0x5e7269, ambient: 0.62, gloss: 0.45 };
const CHEESE: HyperMaterialOptions = { color: 0xf6d264, ambient: 0.68, gloss: 0.2 };
const OLIVE: HyperMaterialOptions = { color: 0xa3b54f, ambient: 0.66, gloss: 0.5 };
const STICK: HyperMaterialOptions = { color: 0xe8c592, ambient: 0.64, gloss: 0.1 };
const MAINS: HyperMaterialOptions = { color: 0x585c62, ambient: 0.6, gloss: 0.25 };

const CARD_ART: Region = [0, 0, 640, 352];
const FLAG_PANES: Region = [664, 8, 256, 166];
const FLAG_SWIRL: Region = [664, 190, 256, 166];
const LABELS: Region[] = [
  [8, 368, 320, 56],
  [344, 368, 320, 56],
  [680, 368, 320, 56],
];
const TAG_MAINS: Region = [8, 440, 192, 60];
const TAG_LAN: Region = [216, 440, 192, 60];

function fitted(ctx: CanvasRenderingContext2D, text: string, font: string, max: number, width: number): void {
  shrinkToFit(max, 10, width, (size) => {
    ctx.font = font.replace('SIZE', String(size));
    return ctx.measureText(text).width;
  });
}

function printTexture(): Texture {
  return localizedCanvasTexture(ATLAS[0], ATLAS[1], (ctx, w, h) => {
    const SERIF = 'Georgia, "Times New Roman", serif';
    const MONO = 'ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#f7f1df';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const [cx, cy, cw, ch] = CARD_ART;
    ctx.strokeStyle = '#3d5a4c';
    ctx.lineWidth = 5;
    ctx.strokeRect(cx + 20, cy + 20, cw - 40, ch - 40);
    ctx.lineWidth = 2;
    ctx.strokeRect(cx + 31, cy + 31, cw - 62, ch - 62);

    ctx.fillStyle = '#2c3f35';
    ctx.letterSpacing = '8px';
    const title = upper(t(L('Table 7', 'Masa 7')));
    fitted(ctx, title, `700 SIZEpx ${SERIF}`, 112, cw - 130);
    ctx.fillText(title, cx + cw / 2 + 4, cy + 104);
    ctx.letterSpacing = '0px';

    ctx.fillRect(cx + 150, cy + 178, cw - 300, 3);
    ctx.save();
    ctx.translate(cx + cw / 2, cy + 179.5);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-9, -9, 18, 18);
    ctx.restore();

    ctx.fillStyle = '#4a4034';
    const ask = t(L('Support at 3 a.m.?', 'Gece 3’te destek mi?'));
    fitted(ctx, ask, `italic 400 SIZEpx ${SERIF}`, 50, cw - 120);
    ctx.fillText(ask, cx + cw / 2, cy + 232);
    const answer = t(L('Ring the bell.', 'Zili çalın.'));
    fitted(ctx, answer, `italic 700 SIZEpx ${SERIF}`, 50, cw - 120);
    ctx.fillText(answer, cx + cw / 2, cy + 288);

    for (const [fx, fy, fw, fh] of [FLAG_PANES, FLAG_SWIRL]) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(fx - 8, fy - 8, fw + 16, fh + 16);
    }
    {
      const [fx, fy, fw, fh] = FLAG_PANES;
      const pane = 54;
      const gap = 8;
      ctx.fillStyle = '#2f86e0';
      for (const dx of [0, 1]) {
        for (const dy of [0, 1]) {
          ctx.fillRect(
            fx + fw / 2 - pane - gap / 2 + dx * (pane + gap),
            fy + fh / 2 - pane - gap / 2 + dy * (pane + gap),
            pane,
            pane,
          );
        }
      }
    }
    {
      const [fx, fy, fw, fh] = FLAG_SWIRL;
      ctx.fillStyle = '#d5285a';
      for (let i = 0; i <= 150; i++) {
        const u = i / 150;
        const turn = -0.5 + u * 10.2;
        const reach = 60 * (1 - 0.82 * u);
        ctx.beginPath();
        ctx.arc(
          fx + fw / 2 + 4 + Math.cos(turn) * reach,
          fy + fh / 2 + 4 + Math.sin(turn) * reach * 0.95,
          9.5 * (1 - 0.78 * u) + 1.5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }

    const names = ['VDS · WINDOWS', 'DEDICATED · WINDOWS', 'VPS · DEBIAN'];
    LABELS.forEach(([lx, ly, lw, lh], i) => {
      ctx.fillStyle = '#fbfbf8';
      ctx.fillRect(lx - 8, ly - 6, lw + 16, lh + 12);
      ctx.fillStyle = '#20252b';
      fitted(ctx, names[i], `700 SIZEpx ${MONO}`, 34, lw - 20);
      ctx.fillText(names[i], lx + lw / 2, ly + lh / 2 + 2);
    });

    const tags: Array<[Region, string, string, string]> = [
      [TAG_MAINS, '230 V ~', '#f4c531', '#20252b'],
      [TAG_LAN, 'LAN', '#2f6fc4', '#ffffff'],
    ];
    for (const [[tx, ty, tw, th], text, ground, ink] of tags) {
      ctx.fillStyle = ground;
      ctx.fillRect(tx - 8, ty - 6, tw + 16, th + 12);
      ctx.fillStyle = ink;
      fitted(ctx, text, `700 SIZEpx ${MONO}`, 40, tw - 16);
      ctx.fillText(text, tx + tw / 2, ty + th / 2 + 2);
    }
  });
}

function footing(): Part[] {
  const parts: Part[] = [];
  const HX = 1.3;
  const HZ = 0.65;
  const KERB = 0.11;
  const PITCH = 0.26;
  const GAP = 0.004;
  const CUT = 0.05;

  parts.push([
    pos(new BoxGeometry(2 * (HX + KERB) + 0.03, FLOOR - 0.002, 2 * (HZ + KERB) + 0.03), 0, (FLOOR - 0.002) / 2, 0),
    GROUT,
  ]);

  const columns = Math.round((2 * HX) / PITCH);
  const rows = Math.round((2 * HZ) / PITCH);
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
      const x0 = -HX + i * PITCH + GAP / 2;
      const x1 = x0 + PITCH - GAP;
      const z0 = -HZ + j * PITCH + GAP / 2;
      const z1 = z0 + PITCH - GAP;
      const corner = (x: number, z: number, sx: number, sz: number, inside: boolean, flip: boolean): Point[] => {
        if (!inside) return [[x, z]];
        const a: Point = [x - sx * CUT, z];
        const b: Point = [x, z - sz * CUT];
        return flip ? [b, a] : [a, b];
      };
      const outline: Point[] = [
        ...corner(x0, z0, -1, -1, i > 0 && j > 0, true),
        ...corner(x1, z0, 1, -1, i < columns - 1 && j > 0, false),
        ...corner(x1, z1, 1, 1, i < columns - 1 && j < rows - 1, true),
        ...corner(x0, z1, -1, 1, i > 0 && j < rows - 1, false),
      ];
      const shade = 0.955 + 0.045 * Math.abs(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453 % 1);
      const tone = (c: number): number => Math.round(c * shade);
      parts.push([
        paver(outline, FLOOR),
        { color: (tone(0xf2) << 16) | (tone(0xe9) << 8) | tone(0xd6), ambient: 0.66, gloss: 0.35 },
      ]);
    }
  }

  const half = CUT - GAP * 0.7;
  for (let i = 1; i < columns; i++) {
    for (let j = 1; j < rows; j++) {
      const x = -HX + i * PITCH;
      const z = -HZ + j * PITCH;
      parts.push([paver([[x - half, z], [x, z - half], [x + half, z], [x, z + half]], FLOOR), INSET]);
    }
  }

  const kerb = (x0: number, x1: number, z0: number, z1: number): void => {
    parts.push([paver([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], FLOOR, 0.005, 0.03), STONE]);
  };
  const outer = HX + KERB;
  const long = (2 * outer) / 4;
  for (let i = 0; i < 4; i++) {
    for (const sz of [-1, 1]) {
      const near = sz * (HZ + GAP / 2);
      const far = sz * (HZ + KERB);
      kerb(-outer + i * long + GAP / 2, -outer + (i + 1) * long - GAP / 2, Math.min(near, far), Math.max(near, far));
    }
  }
  for (let j = 0; j < 2; j++) {
    for (const sx of [-1, 1]) {
      const near = sx * (HX + GAP / 2);
      const far = sx * outer;
      kerb(Math.min(near, far), Math.max(near, far), -HZ + j * HZ + GAP / 2, -HZ + (j + 1) * HZ - GAP / 2);
    }
  }
  return parts;
}

function castor(): Part[] {
  const parts: Part[] = [];
  const R = 0.048;
  const TRAIL = 0.03;

  const tyre = lathe([[0.03, -0.014], [0.044, -0.015], [0.048, -0.009], [0.048, 0.009], [0.044, 0.015], [0.03, 0.014]], 16);
  parts.push([pos(tyre.rotateX(Math.PI / 2), TRAIL, R, 0), RUBBER]);
  parts.push([pos(new CylinderGeometry(0.03, 0.03, 0.034, 14).rotateX(Math.PI / 2), TRAIL, R, 0), CHROME]);
  parts.push([pos(new CylinderGeometry(0.007, 0.007, 0.05, 6).rotateX(Math.PI / 2), TRAIL, R, 0), STEEL]);

  const cheek = trace(new Shape(), [
    [-0.026, 0.103],
    [0.03, 0.103],
    [0.072, 0.096],
    [0.08, 0.082],
    [0.05, 0.036],
    [0.03, 0.03],
    [0.012, 0.04],
    [-0.026, 0.086],
  ]);
  for (const sz of [-1, 1]) {
    const plate = new ExtrudeGeometry(cheek, { depth: 0.004, bevelEnabled: false });
    parts.push([pos(plate, 0, 0, sz * 0.019 - 0.002), STEEL]);
  }
  parts.push([pos(new BoxGeometry(0.058, 0.006, 0.046), 0.002, 0.103, 0), STEEL]);
  parts.push([lathe([[0.001, 0.106], [0.03, 0.106], [0.03, 0.112], [0.024, 0.118], [0.024, 0.122], [0.001, 0.122]], 12), STEEL]);
  parts.push([lathe([[0.022, 0.122], [0.0235, 0.126], [0.0235, 0.14], [0.02, 0.143]], 12), BRASS]);

  parts.push([pos(new CylinderGeometry(0.004, 0.004, 0.042, 6).rotateX(Math.PI / 2), 0.074, 0.088, 0), STEEL]);
  parts.push([pos(new BoxGeometry(0.044, 0.006, 0.034).rotateZ(0.3), 0.095, 0.0945, 0), BRAKE]);
  return parts;
}

function frame(): Part[] {
  const parts: Part[] = [];

  parts.push([grained(pos(new BoxGeometry(2 * HALF_W - 0.04, 0.03, 2 * HALF_D - 0.04), 0, TOP - 0.019, 0), 'x'), WALNUT]);

  const leg: Point[] = [
    [0.019, FLOOR + 0.135],
    [0.019, 0.25],
    [0.023, 0.256],
    [0.023, 0.262],
    [0.016, 0.268],
    [0.016, 0.296],
    [0.022, 0.3],
    [0.022, 0.338],
    [0.016, 0.346],
    [0.016, 0.385],
    [0.021, 0.42],
    [0.021, 0.45],
    [0.015, 0.52],
    [0.015, TOP - 0.03],
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push([pos(lathe(leg, 10), sx * LEG_X, 0, sz * LEG_Z), BRASS]);
  }

  parts.push([grained(pos(new BoxGeometry(2 * TRAY_X - 0.02, 0.02, 2 * TRAY_Z - 0.02), 0, TRAY - 0.01, 0), 'x'), WALNUT]);
  for (const sz of [-1, 1]) {
    parts.push([grained(pos(box(2 * TRAY_X, 0.07, 0.014, 0.004), 0, TRAY + 0.01, sz * (TRAY_Z - 0.007)), 'x'), WALNUT]);
  }
  for (const sx of [-1, 1]) {
    parts.push([grained(pos(box(0.014, 0.07, 2 * TRAY_Z - 0.028, 0.004), sx * (TRAY_X - 0.007), TRAY + 0.01, 0), 'z'), WALNUT]);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push([pos(new BoxGeometry(0.06, 0.056, 0.002), sx * (TRAY_X - 0.029), TRAY + 0.01, sz * (TRAY_Z + 0.001)), BRASS]);
      parts.push([pos(new BoxGeometry(0.002, 0.056, 0.06), sx * (TRAY_X + 0.001), TRAY + 0.01, sz * (TRAY_Z - 0.029)), BRASS]);
      const stud = new CylinderGeometry(0.004, 0.004, 0.003, 6).rotateX(Math.PI / 2);
      for (const dy of [-0.017, 0.017]) {
        parts.push([pos(stud.clone(), sx * (TRAY_X - 0.04), TRAY + 0.01 + dy, sz * (TRAY_Z + 0.003)), STEEL]);
      }
    }
  }

  for (const sx of [-1, 1]) {
    const x = sx * MAST_X;
    const rail = fillet(
      [
        v3(sx * TRAY_X, TRAY + 0.01, 0.3),
        v3(x, TRAY + 0.01, 0.3),
        v3(x, GRIP, 0.3),
        v3(x, GRIP, -0.3),
        v3(x, TRAY + 0.01, -0.3),
        v3(sx * TRAY_X, TRAY + 0.01, -0.3),
      ],
      0.05,
      3,
    );
    parts.push([sweep(rail, 0.014, 8), BRASS]);
    for (const sz of [-1, 1]) {
      parts.push([
        pos(new CylinderGeometry(0.024, 0.024, 0.006, 12).rotateZ(Math.PI / 2), sx * (TRAY_X + 0.003), TRAY + 0.01, sz * 0.3),
        BRASS,
      ]);
      parts.push([pos(new CylinderGeometry(0.019, 0.019, 0.034, 10), x, BAR, sz * 0.3), BRASS]);
      const sleeve = lathe([[0.017, -0.1], [0.02, -0.092], [0.0215, -0.03], [0.0215, 0.03], [0.02, 0.092], [0.017, 0.1]], 10);
      parts.push([grained(pos(sleeve.rotateX(Math.PI / 2), x, GRIP, sz * 0.15), 'z'), WALNUT]);
    }
    parts.push([pos(new CylinderGeometry(0.011, 0.011, 0.6, 8).rotateX(Math.PI / 2), x, BAR, 0), BRASS]);
    parts.push([pos(new CylinderGeometry(0.018, 0.018, 0.05, 10).rotateX(Math.PI / 2), x, BAR, 0), BRASS]);
    parts.push([pos(new CylinderGeometry(0.02, 0.02, 0.03, 10), x, BAR + 0.022, 0), BRASS]);
    parts.push([pos(new SphereGeometry(0.027, 10, 6), x, GRIP, 0), BRASS]);
    parts.push([
      pos(lathe([[TUBE, -0.02], [0.022, -0.014], [0.024, 0], [0.022, 0.014], [TUBE, 0.02]], 12), x, SPRING, 0),
      BRASS,
    ]);
  }

  const arch: Vector3[] = [v3(MAST_X, BAR + 0.03, 0), v3(MAST_X, SPRING - 0.3, 0), v3(MAST_X, SPRING, 0)];
  const STEPS = 22;
  for (let k = 1; k < STEPS; k++) {
    const a = (k / STEPS) * Math.PI;
    arch.push(v3(MAST_X * Math.cos(a), SPRING + RISE * Math.sin(a), 0));
  }
  arch.push(v3(-MAST_X, SPRING, 0), v3(-MAST_X, SPRING - 0.3, 0), v3(-MAST_X, BAR + 0.03, 0));
  parts.push([sweep(arch, TUBE, 8), BRASS]);

  return parts;
}

const archY = (x: number): number => SPRING + RISE * Math.sqrt(1 - (x / MAST_X) ** 2);
const eyeY = (x: number): number => archY(x) - TUBE - 0.0095;

function hanger(x: number): Part[] {
  const slope = Math.atan((-RISE * x) / (MAST_X * MAST_X * Math.sqrt(1 - (x / MAST_X) ** 2)));
  return [
    [pos(new CylinderGeometry(0.0215, 0.0215, 0.036, 10).rotateZ(slope - Math.PI / 2), x, archY(x), 0), BRASS],
    [pos(new TorusGeometry(0.011, 0.003, 5, 12), x, eyeY(x), 0), BRASS],
  ];
}

const CORNER = 0.035;
const SIDE_X = 2 * (HALF_W - CORNER);
const SIDE_Z = 2 * (HALF_D - CORNER);
const ARC = (Math.PI / 2) * CORNER;
const PERIMETER = 2 * (SIDE_X + SIDE_Z) + 4 * ARC;
const REAR_START = SIDE_X + ARC + SIDE_Z + ARC;
const CORNER_MIDS = [
  SIDE_X + ARC / 2,
  SIDE_X + SIDE_Z + ARC * 1.5,
  2 * SIDE_X + SIDE_Z + ARC * 2.5,
  PERIMETER - ARC / 2,
];

interface Rim {
  x: number;
  z: number;
  nx: number;
  nz: number;
  corner: number;
  diagonalX: number;
  diagonalZ: number;
}

function rimAt(s: number): Rim {
  let u = ((s % PERIMETER) + PERIMETER) % PERIMETER;
  let near = Infinity;
  let which = 0;
  CORNER_MIDS.forEach((mid, i) => {
    const d = Math.min(Math.abs(u - mid), PERIMETER - Math.abs(u - mid));
    if (d < near) {
      near = d;
      which = i;
    }
  });
  const k = Math.max(0, 1 - near / 0.2);
  const corner = k * k * (3 - 2 * k);
  const diagonalX = (which === 0 || which === 1 ? 1 : -1) * Math.SQRT1_2;
  const diagonalZ = (which === 0 || which === 3 ? 1 : -1) * Math.SQRT1_2;
  const cx = HALF_W - CORNER;
  const cz = HALF_D - CORNER;
  const straight = (x: number, z: number, nx: number, nz: number): Rim => ({ x, z, nx, nz, corner, diagonalX, diagonalZ });
  const round = (ox: number, oz: number, a: number): Rim =>
    straight(ox + Math.cos(a) * CORNER, oz + Math.sin(a) * CORNER, Math.cos(a), Math.sin(a));

  if (u < SIDE_X) return straight(-cx + u, HALF_D, 0, 1);
  u -= SIDE_X;
  if (u < ARC) return round(cx, cz, Math.PI / 2 - u / CORNER);
  u -= ARC;
  if (u < SIDE_Z) return straight(HALF_W, cz - u, 1, 0);
  u -= SIDE_Z;
  if (u < ARC) return round(cx, -cz, -u / CORNER);
  u -= ARC;
  if (u < SIDE_X) return straight(cx - u, -HALF_D, 0, -1);
  u -= SIDE_X;
  if (u < ARC) return round(-cx, -cz, -Math.PI / 2 - u / CORNER);
  u -= ARC;
  if (u < SIDE_Z) return straight(-HALF_W, -cz + u, -1, 0);
  u -= SIDE_Z;
  return round(-cx, cz, Math.PI - u / CORNER);
}

// Whole numbers of pleats round the hem, or the cloth tears where the perimeter closes.
const pleat = (s: number): number =>
  0.018 * (2 * Math.pow(Math.abs(Math.sin((Math.PI * 15 * s) / PERIMETER + 0.4)), 1.3) - 1) +
  0.008 * Math.sin((2 * Math.PI * 8 * s) / PERIMETER + 2.1);

function drape(s: number, down: number, proud = 0): Vector3 {
  const rim = rimAt(s);
  const ripple = pleat(s) * (1 - 0.7 * rim.corner);
  const out = 0.0045 + Math.pow(down, 1.1) * (0.03 + ripple) + proud;
  const swing = 0.085 * Math.pow(rim.corner, 1.5) * Math.pow(down, 1.3);
  const fall = DROP * (1 + 0.36 * rim.corner * rim.corner) - 0.3 * ripple;
  return v3(
    rim.x + rim.nx * out + rim.diagonalX * swing,
    TOP - 0.008 - (fall - 0.008) * down,
    rim.z + rim.nz * out + rim.diagonalZ * swing,
  );
}

function tablecloth(): BufferGeometry {
  const stations: number[] = [];
  let s = 0;
  for (const length of [SIDE_X, ARC, SIDE_Z, ARC, SIDE_X, ARC, SIDE_Z, ARC]) {
    const n = length === ARC ? 4 : Math.ceil(length / 0.03);
    for (let i = 0; i < n; i++) stations.push(s + (i / n) * length);
    s += length;
  }

  const flat = (inset: number, sink: number) => (at: number): Vector3 => {
    const rim = rimAt(at);
    return v3(rim.x - rim.nx * inset, TOP - sink, rim.z - rim.nz * inset);
  };
  const rows: Array<(at: number) => Vector3> = [
    flat(0.006, 0),
    flat(-0.0025, 0.003),
    (at) => drape(at, 0),
    (at) => drape(at, 0.5),
    (at) => drape(at, 0.9),
    (at) => drape(at, 0.905, 0.003),
    (at) => drape(at, 1, 0.003),
    (at) => drape(at, 1, -0.004),
  ];

  const n = stations.length;
  const position: number[] = [];
  for (const row of rows) {
    for (const at of stations) position.push(...row(at).toArray());
  }
  const index: number[] = [];
  for (let j = 0; j < rows.length - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i;
      const b = j * n + ((i + 1) % n);
      index.push(a, a + n, b, b, a + n, b + n);
    }
  }

  const SPINE = 6;
  const reach = HALF_W - 0.3;
  const first = position.length / 3;
  for (let k = 0; k < SPINE; k++) position.push(-reach + (k / (SPINE - 1)) * 2 * reach, TOP, 0);
  const nearest = (i: number): number =>
    Math.max(0, Math.min(SPINE - 1, Math.round(((position[i * 3] + reach) / (2 * reach)) * (SPINE - 1))));
  const lid = (a: number, b: number, c: number): void => {
    const ux = position[b * 3] - position[a * 3];
    const uz = position[b * 3 + 2] - position[a * 3 + 2];
    const wx = position[c * 3] - position[a * 3];
    const wz = position[c * 3 + 2] - position[a * 3 + 2];
    if (uz * wx - ux * wz >= 0) index.push(a, b, c);
    else index.push(a, c, b);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    lid(i, j, first + nearest(i));
    if (nearest(i) !== nearest(j)) lid(j, first + nearest(j), first + nearest(i));
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(position), 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function salver(radius: number): BufferGeometry {
  return lathe(
    [
      [radius - 0.03, 0.0005],
      [radius - 0.004, 0.006],
      [radius + 0.004, 0.011],
      [radius + 0.005, 0.014],
      [radius + 0.002, 0.016],
      [radius - 0.006, 0.0145],
      [radius - 0.022, 0.009],
      [radius - 0.03, 0.008],
      [0.001, 0.008],
    ],
    32,
  );
}

const LINK_A = 0.008;
const LINK_H = 0.015;
const WIRE = 0.0028;
const LINK_PITCH = 2 * (LINK_H + LINK_A) - 2 * WIRE;

function link(): BufferGeometry {
  const path: Vector3[] = [];
  for (const end of [1, -1]) {
    for (let k = 0; k <= 2; k++) {
      const a = (end > 0 ? 0 : Math.PI) + (k / 2) * Math.PI;
      path.push(v3(Math.cos(a) * LINK_A, end * LINK_H + Math.sin(a) * LINK_A, 0));
    }
  }
  return sweep(path, WIRE, 4, true);
}

/** Built round the eye on the arch, so the whole length swings from it. */
function cloche(radius: number, height: number, links: number, stretch: number): Part[] {
  const parts: Part[] = [];
  const first = -0.011 + 0.003 + WIRE - (LINK_H + LINK_A);
  for (let k = 0; k < links; k++) {
    const g = link();
    if (k % 2 === 0) g.rotateY(Math.PI / 2);
    parts.push([pos(g, 0, first - k * LINK_PITCH, 0), BRASS]);
  }
  const ring = first - (links - 1) * LINK_PITCH - (LINK_H + LINK_A) + 0.003 + WIRE - 0.011;
  const loop = new TorusGeometry(0.011, 0.003, 5, 10);
  if (links % 2 === 0) loop.rotateY(Math.PI / 2);
  parts.push([pos(loop, 0, ring, 0), SILVER]);

  const crown = ring - 0.009 - 0.056;
  parts.push([
    pos(
      lathe(
        [
          [0.04, -0.002],
          [0.038, 0.004],
          [0.03, 0.006],
          [0.01, 0.012],
          [0.008, 0.022],
          [0.015, 0.03],
          [0.019, 0.04],
          [0.016, 0.049],
          [0.008, 0.055],
          [0.001, 0.056],
        ],
        10,
      ),
      0,
      crown,
      0,
    ),
    SILVER,
  ]);

  const wall = (k: number): Point => {
    const a = (k / 8) * (Math.PI / 2);
    return [radius * Math.pow(Math.cos(a), 0.75), 0.016 + (height - 0.016) * Math.pow(Math.sin(a), 0.92)];
  };
  const profile: Point[] = [[0.001, height - 0.004]];
  for (const k of [5, 2]) {
    const [r, y] = wall(k);
    profile.push([r - 0.004, y - 0.003]);
  }
  profile.push(
    [radius - 0.004, 0.016],
    [radius - 0.002, 0.001],
    [radius + 0.007, 0.002],
    [radius + 0.009, 0.008],
    [radius + 0.004, 0.013],
    [radius, 0.016],
  );
  for (let k = 1; k <= 7; k++) profile.push(wall(k));
  profile.push([0.041, height - 0.0015], [0.03, height]);
  const dome = lathe(profile, stretch > 1 ? 28 : 24);
  dome.scale(stretch, 1, 1);
  parts.push([pos(smooth(dome), 0, crown - height, 0), SILVER]);
  return parts;
}

function bell(): { body: Part[]; plunger: Part[] } {
  const body: Part[] = [
    [lathe([[0.001, 0], [0.056, 0], [0.058, 0.004], [0.055, 0.011], [0.05, 0.013], [0.001, 0.013]], 18), BAKELITE],
    [
      lathe(
        [
          [0.047, 0.013],
          [0.052, 0.014],
          [0.053, 0.018],
          [0.05, 0.027],
          [0.043, 0.041],
          [0.03, 0.053],
          [0.014, 0.06],
          [0.007, 0.061],
        ],
        18,
      ),
      BRASS,
    ],
  ];
  const plunger: Part[] = [
    [lathe([[0.008, 0.06], [0.008, 0.064], [0.0045, 0.066], [0.0045, 0.076]], 8), CHROME],
    [lathe([[0.0045, 0.075], [0.012, 0.077], [0.013, 0.081], [0.009, 0.085], [0.001, 0.086]], 10), CHROME],
  ];
  return { body, plunger };
}

const BELL_AT = v3(0.326, TOP, 0.3);
const PLUNGE = 0.008;
const PLUNGE_DOWN = 0.045;
const PLUNGE_OVER = 0.6;
const DUSK = 1.5;
const NIGHT_HOLD = 8;
const DAWN = 2.5;
const RING = L('Ring the bell', 'Zili çal');

function plungerDrop(since: number): number {
  if (since < PLUNGE_DOWN) return PLUNGE * (since / PLUNGE_DOWN);
  const back = since - PLUNGE_DOWN;
  return PLUNGE * Math.exp(-back * 16) * Math.cos(back * 26);
}

function cutlery(): Part[] {
  const flat = (outline: Point[]): BufferGeometry =>
    new ExtrudeGeometry(trace(new Shape(), outline), { depth: 0.0026, bevelEnabled: false }).rotateX(-Math.PI / 2);

  const fork: Point[] = [
    [-0.1, -0.007],
    [-0.085, -0.008],
    [-0.02, -0.004],
    [0.012, -0.011],
    [0.04, -0.0125],
  ];
  for (let k = 0; k < 4; k++) {
    const z = -0.0125 + k * 0.0071;
    fork.push([0.1, z], [0.1, z + 0.0037]);
    if (k < 3) fork.push([0.046, z + 0.0037], [0.046, z + 0.0071]);
  }
  fork.push([0.04, 0.0125], [0.012, 0.011], [-0.02, 0.004], [-0.085, 0.008], [-0.1, 0.007]);

  const knife: Point[] = [
    [-0.11, -0.007],
    [-0.02, -0.006],
    [-0.012, -0.008],
    [0.09, -0.008],
    [0.108, -0.003],
    [0.112, 0.004],
    [0.1, 0.008],
    [-0.012, 0.008],
    [-0.02, 0.006],
    [-0.11, 0.007],
  ];
  return [
    [pos(flat(fork), 0, 0, 0.017), SILVER],
    [pos(flat(knife).scale(0.93, 1, 1), 0, 0, -0.017), SILVER],
  ];
}

function napkin(): Part[] {
  return [
    [pos(box(0.215, 0.012, 0.108, 0.005), 0, 0.006, 0), NAPKIN],
    [pos(box(0.215, 0.008, 0.074, 0.0035), 0, 0.015, -0.014), NAPKIN],
    ...moved(cutlery(), 0.004, 0.019, -0.013),
  ];
}

function tentCard(): { parts: Part[]; faces: BufferGeometry[] } {
  const W = 0.172;
  const H = 0.0946;
  const LEAN = 0.32;
  const parts: Part[] = [];
  const faces: BufferGeometry[] = [];
  for (const turn of [0, Math.PI]) {
    const leaf = new BoxGeometry(W, H, 0.0016).translate(0, -H / 2, 0);
    const print = decal(W - 0.004, H - 0.004, CARD_ART).translate(0, -H / 2, 0.002);
    for (const g of [leaf, print]) {
      g.rotateX(-LEAN);
      g.translate(0, H * Math.cos(LEAN), 0.0008);
      g.rotateY(turn);
    }
    parts.push([leaf, CARD]);
    faces.push(print);
  }
  return { parts, faces };
}

function plateStack(): Part[] {
  const COUNT = 5;
  const PITCH = 0.012;
  const profile: Point[] = [[0.07, 0]];
  for (let i = 0; i < COUNT; i++) {
    const y = i * PITCH;
    profile.push([0.118, y + 0.006], [0.127, y + 0.0095], [0.126, y + 0.0115]);
    if (i < COUNT - 1) profile.push([0.104, y + 0.0125]);
  }
  const lip = (COUNT - 1) * PITCH + 0.0115;
  profile.push([0.118, lip], [0.086, lip - 0.0065], [0.001, lip - 0.007]);
  return [[lathe(profile, 16), PORCELAIN]];
}

function napkinPile(): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < 3; i++) {
    const fold = box(0.17, 0.014, 0.17, 0.006).rotateY(Math.sin(i * 2.4) * 0.07);
    parts.push([pos(fold, Math.sin(i * 1.7) * 0.004, 0.007 + i * 0.0142, 0), NAPKIN]);
  }
  return parts;
}

function pick(flag: Region, turn: number): { parts: Part[]; faces: BufferGeometry[] } {
  const FW = 0.085;
  const FH = 0.055;
  const TOPS = 0.125;
  const parts: Part[] = [
    [pos(new BoxGeometry(0.028, 0.026, 0.028).rotateY(0.4), 0, 0.013, 0), CHEESE],
    [pos(new SphereGeometry(0.0125, 8, 6).scale(1, 1.2, 1), 0, 0.04, 0), OLIVE],
    [pos(new CylinderGeometry(0.0017, 0.0017, TOPS - 0.01, 5), 0, 0.01 + (TOPS - 0.01) / 2, 0), STICK],
    [pos(new BoxGeometry(FW, FH, 0.0012), FW / 2 + 0.001, TOPS - 0.006 - FH / 2, 0), CARD],
  ];
  const faces = [0, Math.PI].map((side) =>
    decal(FW - 0.002, FH - 0.002, flag)
      .translate(0, 0, 0.0016)
      .rotateY(side)
      .translate(FW / 2 + 0.001, TOPS - 0.006 - FH / 2, 0),
  );
  for (const g of [...parts.map(([p]) => p), ...faces]) g.rotateY(turn);
  return { parts, faces };
}

const POWER_R = 0.005;
const DATA_R = 0.0038;
const LANE_TOP = TRAY + 0.0375;
const LANE_PITCH = 0.011;
const BOX_X = -0.6;
const BOX_Z = -0.4475;
const BOX_TOP = FLOOR + 0.105;
const POWER_ROW = -0.395;
const DATA_ROW = -0.47;

interface Dish {
  x: number;
  radius: number;
  stretch: number;
}

interface Lead {
  from: Vector3;
  dish: Dish;
  mains: boolean;
  colour: number;
}

function leads(runs: Lead[], lamps: Lamps): Part[] {
  const parts: Part[] = [];
  // Leftmost joiner takes the top lane and the bottom lane leaves first: any other order makes two leads cross on the rail.
  const order = [...runs].sort((a, b) => a.from.x - b.from.x);

  order.forEach((run, lane) => {
    const r = run.mains ? POWER_R : DATA_R;
    const x = run.from.x;
    const sheath: HyperMaterialOptions = run.mains ? MAINS : { color: run.colour, ambient: 0.66, gloss: 0.3 };

    if (run.mains) {
      parts.push([pos(new BoxGeometry(0.028, 0.02, 0.03), x, run.from.y, run.from.z - 0.014), BLACK]);
      parts.push([pos(new CylinderGeometry(0.009, 0.0062, 0.02, 6).rotateX(Math.PI / 2), x, run.from.y, run.from.z - 0.038), BLACK]);
    } else {
      parts.push([pos(new BoxGeometry(0.0125, 0.0095, 0.014), x, run.from.y, run.from.z - 0.006), IVORY]);
      parts.push([pos(new CylinderGeometry(0.0062, 0.0046, 0.022, 6).rotateX(Math.PI / 2), x, run.from.y, run.from.z - 0.023), sheath]);
    }
    const tail = run.from.z - (run.mains ? 0.046 : 0.032);

    const across = (x - run.dish.x) / ((run.dish.radius + 0.003) * run.dish.stretch);
    const lip = -(run.dish.radius + 0.003) * Math.sqrt(1 - across * across);
    const y = LANE_TOP - lane * LANE_PITCH;
    const z = -(TRAY_Z + r + 0.0008);
    const leave = BOX_X + 0.08 - (order.length - 1 - lane) * 0.04;
    const plug = v3(leave, BOX_TOP + (run.mains ? 0.056 : 0.04), run.mains ? POWER_ROW : DATA_ROW);
    const station = REAR_START + (HALF_W - CORNER - x);
    const onCloth = (down: number): Vector3 => drape(station, down, down > 0.85 ? 0.003 : 0).add(v3(0, 0, -(r + 0.0012)));

    const path = fillet(
      [
        v3(x, run.from.y, tail),
        v3(x, run.from.y - 0.002, tail - 0.012),
        v3(x, TOP + 0.022 + r, lip),
        v3(x, TOP + r, lip - 0.035),
        v3(x, TOP + r, -HALF_D + 0.025),
        v3(x, TOP + r * 0.55, -HALF_D - 0.0045 - r * 0.75),
        onCloth(0.3),
        onCloth(0.65),
        onCloth(1),
        v3(x, y + 0.05, z),
        v3(x, y, z),
        v3(leave, y, z),
        ...(run.mains
          ? [v3(leave, plug.y + 0.012, plug.z)]
          : [v3(leave, y - 0.02, z), v3(leave, plug.y + 0.03, plug.z)]),
        plug,
      ],
      0.022,
      2,
    );
    parts.push([sweep(path, r, run.mains ? 5 : 4), sheath]);

    if (run.mains) {
      parts.push([pos(new CylinderGeometry(0.025, 0.025, 0.004, 14), leave, BOX_TOP + 0.002, POWER_ROW), IVORY]);
      parts.push([
        pos(lathe([[0.017, 0], [0.0195, 0.004], [0.0195, 0.024], [0.012, 0.034], [0.008, 0.05], [0.0062, 0.057]], 10), leave, BOX_TOP + 0.004, POWER_ROW),
        BLACK,
      ]);
    } else {
      parts.push([pos(new BoxGeometry(0.026, 0.004, 0.026), leave, BOX_TOP + 0.002, DATA_ROW), IVORY]);
      parts.push([pos(new BoxGeometry(0.0125, 0.016, 0.0095), leave, BOX_TOP + 0.012, DATA_ROW), IVORY]);
      parts.push([pos(new CylinderGeometry(0.0046, 0.0062, 0.022, 6), leave, BOX_TOP + 0.031, DATA_ROW), sheath]);
      lamps.add(
        new PlaneGeometry(0.009, 0.006).rotateX(-Math.PI / 2).translate(leave, BOX_TOP + 0.0015, DATA_ROW - 0.024),
        { kind: 'flicker', ...GREEN, rate: 9, seed: lane * 2.3, busy: 0.45 },
      );
    }
  });

  for (const x of [0.36, -0.22, -0.43]) {
    parts.push([pos(new BoxGeometry(0.012, 0.071, 0.0025), x, TRAY + 0.01, -(TRAY_Z + 2 * POWER_R + 0.0025)), STEEL]);
    for (const dy of [-0.0345, 0.0345]) {
      parts.push([pos(new BoxGeometry(0.012, 0.0025, 0.014), x, TRAY + 0.01 + dy, -(TRAY_Z + 0.0065)), STEEL]);
    }
  }
  return parts;
}

function floorBox(lamps: Lamps): { parts: Part[]; faces: BufferGeometry[] } {
  const parts: Part[] = [
    [pos(box(0.4, 0.008, 0.205, 0.003), BOX_X, FLOOR + 0.004, BOX_Z), CAST],
    [pos(box(0.36, 0.1, 0.165, 0.012), BOX_X, FLOOR + 0.055, BOX_Z), CAST],
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push([pos(new CylinderGeometry(0.008, 0.008, 0.005, 6), BOX_X + sx * 0.188, FLOOR + 0.0105, BOX_Z + sz * 0.09), STEEL]);
    }
  }
  const tagX = BOX_X + 0.14;
  const faces = [
    decal(0.058, 0.018, TAG_MAINS).rotateX(-Math.PI / 2).rotateY(Math.PI).translate(tagX, BOX_TOP + 0.002, POWER_ROW - 0.012),
    decal(0.058, 0.018, TAG_LAN).rotateX(-Math.PI / 2).rotateY(Math.PI).translate(tagX, BOX_TOP + 0.002, DATA_ROW),
  ];
  parts.push([pos(new CylinderGeometry(0.0085, 0.0085, 0.003, 10), tagX, BOX_TOP + 0.0015, POWER_ROW + 0.016), BLACK]);
  lamps.add(
    new PlaneGeometry(0.01, 0.01).rotateX(-Math.PI / 2).translate(tagX, BOX_TOP + 0.0045, POWER_ROW + 0.016),
    { kind: 'steady', colour: '#ff9a3d' },
  );
  return { parts, faces };
}

const SERVERS: Array<{ spec: ServerSpec; dish: Dish; dome: number; links: number; flag: Region; wire: number; pickAt: Point }> = [
  {
    spec: { form: 'unit1u', bezel: 0x5d6570, latch: 0x4fa3ee, label: LABELS[0], seed: 1.3 },
    dish: { x: -0.58, radius: 0.21, stretch: 1 },
    dome: 0.19,
    links: 9,
    flag: FLAG_PANES,
    wire: 0x4f8fe0,
    pickAt: [0.07, -0.03],
  },
  {
    spec: { form: 'rack2u', bezel: 0x4f545c, latch: 0x4fa3ee, label: LABELS[1], seed: 4.1 },
    dish: { x: 0, radius: 0.24, stretch: 1.36 },
    dome: 0.25,
    links: 8,
    flag: FLAG_PANES,
    wire: 0xf0c93c,
    pickAt: [0.1, -0.04],
  },
  {
    spec: { form: 'unit1u', bezel: 0xe4e6e2, latch: 0xe2496f, label: LABELS[2], seed: 7.7 },
    dish: { x: 0.58, radius: 0.21, stretch: 1 },
    dome: 0.19,
    links: 9,
    flag: FLAG_SWIRL,
    wire: 0xe2496f,
    pickAt: [0.065, -0.035],
  },
];

export interface TrolleyResult {
  object: HyperObject;
  tick: (worldGV: GyroVector, dt: number) => void;
}

export function buildTrolley(world: HyperWorld, at: GyroVector, yaw: number): TrolleyResult {
  const object = new HyperObject(at);
  object.rotation.y = yaw;
  const put = (parts: Part[], node?: Group): void => {
    for (const [g, opts] of parts) object.addGeometry(world.shared, g, opts, node);
  };

  const lamps = new Lamps();
  const printed: BufferGeometry[] = [];

  put(footing());
  put(frame());
  for (const [sx, sz, turn] of [[-1, -1, 3.35], [1, -1, 3.0], [-1, 1, 2.9], [1, 1, 3.3]]) {
    put(moved(castor(), sx * LEG_X, FLOOR, sz * LEG_Z, turn));
  }
  put([[tablecloth(), CLOTH]]);

  const runs: Lead[] = [];
  const hung: Group[] = [];
  SERVERS.forEach(({ spec, dish, dome, links, flag, wire, pickAt }, i) => {
    const plate = salver(dish.radius);
    plate.scale(dish.stretch, 1, 1);
    put([[pos(smooth(plate), dish.x, TOP, 0), SILVER]]);

    const server: Server = buildServer(spec);
    put(moved(server.parts, dish.x, WELL, 0));
    for (const [quad, lamp] of server.lamps) lamps.add(quad.translate(dish.x, WELL, 0), lamp);
    for (const label of server.labels) printed.push(label.translate(dish.x, WELL, 0));
    for (const mains of [true, false]) {
      const port = mains ? server.power : server.network;
      runs.push({ from: v3(dish.x + port.x, WELL + port.y, port.z), dish, mains, colour: wire });
    }

    const garnish = pick(flag, 0.5 - i * 0.4);
    put(moved(garnish.parts, dish.x + pickAt[0], WELL + server.top, pickAt[1]));
    for (const face of garnish.faces) printed.push(face.translate(dish.x + pickAt[0], WELL + server.top, pickAt[1]));

    put(hanger(dish.x));
    const node = new Group();
    node.position.set(dish.x, eyeY(dish.x), 0);
    object.add(node);
    put(cloche(dish.radius - 0.02, dome, links, dish.stretch), node);
    hung.push(node);
  });

  put(leads(runs, lamps));
  const outlet = floorBox(lamps);
  put(outlet.parts);
  printed.push(...outlet.faces);

  const chime = bell();
  put(moved(chime.body, BELL_AT.x, BELL_AT.y, BELL_AT.z));
  const plungerNode = new Group();
  plungerNode.position.copy(BELL_AT);
  object.add(plungerNode);
  put(chime.plunger, plungerNode);
  put(moved(napkin(), -0.57, TOP, 0.294, 0.05));
  const card = tentCard();
  put(moved(card.parts, -0.328, TOP, 0.31));
  for (const face of card.faces) printed.push(face.translate(-0.328, TOP, 0.31));
  put(moved(plateStack(), 0.36, TRAY, 0.02));
  put(moved(napkinPile(), -0.32, TRAY, 0.04, 0.2));

  const print = printTexture();
  for (const face of printed) {
    object.addGeometry(world.shared, face, {
      map: print,
      color: 0xffffff,
      ambient: 0.92,
      castShadow: false,
      receiveShadow: false,
    });
  }
  for (const quad of lamps.quads) {
    object.addGeometry(world.shared, quad, {
      map: lamps.texture,
      color: 0xffffff,
      ambient: 1,
      castShadow: false,
      receiveShadow: false,
    });
  }

  world.add(object);

  let clock = 0;
  let since = Infinity;
  let rungAt = -Infinity;
  let nightUntil = -Infinity;
  let night = 0;
  let dark = 0;
  let shown = 0;
  let hurried = 0;

  const aim = new Aim(world, object);
  aim.add({
    name: RING,
    at: v3(BELL_AT.x, BELL_AT.y + 0.05, BELL_AT.z),
    size: 0.12,
    use: () => {
      rungAt = clock;
      // From wherever the sky already is, so a second ring only lengthens the night.
      nightUntil = clock + DUSK * (1 - night) + NIGHT_HOLD;
      sfx.bell();
    },
  });

  const tick = (worldGV: GyroVector, dt: number) => {
    clock += dt;
    hung.forEach((node, i) => {
      node.rotation.x = 0.013 * Math.sin(clock * (1.7 + i * 0.21) + i * 2.1) + 0.006 * Math.sin(clock * 0.63 + i);
      node.rotation.z = 0.008 * Math.sin(clock * (1.45 + i * 0.17) + i * 1.3);
    });

    aim.update(worldGV);
    const rung = clock - rungAt;
    plungerNode.position.y = BELL_AT.y - (rung < PLUNGE_OVER ? plungerDrop(rung) : 0);

    night = clock < nightUntil ? Math.min(1, night + dt / DUSK) : Math.max(0, night - dt / DAWN);
    dark = night * night * (3 - 2 * night);
    if (dark !== shown) {
      shown = dark;
      setNight(world, dark);
    }
    hurried += dt * (1 + 2.2 * dark);

    since += dt;
    if (since < 0.09 - 0.045 * dark) return;
    since = 0;
    lamps.repaint(clock, hurried, dark);
  };
  lamps.repaint(0);

  return { object, tick };
}
