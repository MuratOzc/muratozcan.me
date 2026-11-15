import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Path,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import type { HyperMaterialOptions } from '../../engine';
import { box, lathe, merge, pos, rod, roundedRect, type Part } from '../geometry';
import { GILDING, intoRegion } from './kennelArt';

const PAINT: HyperMaterialOptions = { color: 0x6c7a92, ambient: 0.58, gloss: 0.5, metal: 0.2 };
const SKIRT: HyperMaterialOptions = { color: 0x4d5562, ambient: 0.55, gloss: 0.35, metal: 0.2 };
const BRASS: HyperMaterialOptions = { color: 0xe9cb7a, ambient: 0.58, gloss: 0.62, metal: 0.9 };
const DIAL: HyperMaterialOptions = { color: 0x2d3036, ambient: 0.55, gloss: 0.55 };
const TICK: HyperMaterialOptions = { color: 0xf4f1e6, ambient: 0.85, gloss: 0.05 };
const CONCRETE: HyperMaterialOptions = { color: 0xc9c7c0, ambient: 0.62, gloss: 0.03 };

const PLINTH = 0.14;
const BODY_W = 0.56;
const BODY_H = 0.72;
const BODY_D = 0.48;
const BODY_Y = PLINTH + 0.06 + BODY_H / 2;
const DOOR_FACE = BODY_D / 2 + 0.012 + 0.03;

function faced(profile: Array<[number, number]>, segments: number, x: number, y: number, z: number): BufferGeometry {
  return pos(lathe(profile, segments).rotateX(Math.PI / 2), x, y, z);
}

export function safe(): { parts: Part[]; gilding: BufferGeometry } {
  const parts: Part[] = [];

  parts.push([pos(box(0.74, PLINTH, 0.66, 0.014), 0, PLINTH / 2, 0), CONCRETE]);
  parts.push([pos(box(BODY_W + 0.04, 0.06, BODY_D + 0.04, 0.01), 0, PLINTH + 0.03, 0), SKIRT]);
  parts.push([pos(box(BODY_W, BODY_H, BODY_D, 0.024), 0, BODY_Y, 0), PAINT]);
  parts.push([pos(box(BODY_W + 0.02, 0.03, BODY_D + 0.02, 0.01), 0, BODY_Y + BODY_H / 2 - 0.005, 0), SKIRT]);
  parts.push([pos(box(0.5, 0.66, 0.012, 0.004), 0, BODY_Y, BODY_D / 2 + 0.006), SKIRT]);
  parts.push([pos(box(0.45, 0.61, 0.03, 0.01), 0, BODY_Y, DOOR_FACE - 0.015), PAINT]);

  const HINGE_X = -0.243;
  const hinges: BufferGeometry[] = [];
  for (const sy of [-1, 1]) {
    const y = BODY_Y + sy * 0.19;
    hinges.push(pos(new CylinderGeometry(0.017, 0.017, 0.11, 12), HINGE_X, y, DOOR_FACE - 0.012));
    for (const end of [-1, 1]) {
      hinges.push(pos(new SphereGeometry(0.019, 8, 4), HINGE_X, y + end * 0.062, DOOR_FACE - 0.012));
    }
    hinges.push(pos(box(0.075, 0.085, 0.006, 0.002), HINGE_X + 0.04, y, DOOR_FACE + 0.003));
    for (const bolt of [-1, 1]) {
      hinges.push(
        pos(new CylinderGeometry(0.006, 0.006, 0.004, 6).rotateX(Math.PI / 2), HINGE_X + 0.055, y + bolt * 0.026, DOOR_FACE + 0.008),
      );
    }
  }
  parts.push([merge(hinges), BRASS]);

  const DIAL_X = 0.075;
  const HANDLE_X = -0.115;
  const FIT_Y = BODY_Y + 0.01;
  parts.push([
    faced([[0.001, 0], [0.066, 0], [0.066, 0.006], [0.058, 0.012], [0.001, 0.012]], 24, DIAL_X, FIT_Y, DOOR_FACE),
    BRASS,
  ]);
  parts.push([
    faced([[0.05, 0.012], [0.05, 0.02], [0.046, 0.024], [0.001, 0.024]], 24, DIAL_X, FIT_Y, DOOR_FACE),
    DIAL,
  ]);
  parts.push([
    faced([[0.024, 0.024], [0.026, 0.03], [0.026, 0.05], [0.022, 0.056], [0.001, 0.056]], 12, DIAL_X, FIT_Y, DOOR_FACE),
    BRASS,
  ]);
  const ticks: BufferGeometry[] = [];
  for (let i = 0; i < 20; i++) {
    const long = i % 5 === 0 ? 0.011 : 0.006;
    const tick = pos(new BoxGeometry(0.0026, long, 0.0016), 0, 0.045 - long / 2, 0);
    ticks.push(pos(tick.rotateZ((i / 20) * Math.PI * 2), DIAL_X, FIT_Y, DOOR_FACE + 0.0245));
  }
  parts.push([merge(ticks), TICK]);
  parts.push([pos(new BoxGeometry(0.007, 0.013, 0.006), DIAL_X, FIT_Y + 0.061, DOOR_FACE + 0.011), DIAL]);

  const handle: BufferGeometry[] = [
    faced([[0.001, 0], [0.034, 0], [0.034, 0.008], [0.022, 0.016], [0.02, 0.04], [0.001, 0.04]], 16, HANDLE_X, FIT_Y, DOOR_FACE),
  ];
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + 0.26 + (i / 3) * Math.PI * 2;
    const hub = new Vector3(HANDLE_X, FIT_Y, DOOR_FACE + 0.028);
    const tip = new Vector3(HANDLE_X + Math.cos(a) * 0.076, FIT_Y + Math.sin(a) * 0.076, DOOR_FACE + 0.028);
    handle.push(rod(hub, tip, 0.0075, 0.006, 8));
    handle.push(pos(new SphereGeometry(0.014, 8, 5), tip.x, tip.y, tip.z));
  }
  parts.push([merge(handle), BRASS]);

  const frames: BufferGeometry[] = [];
  const fittings: BufferGeometry[] = [];
  const panels: Array<[number, number, number, number]> = [
    [0.42, Math.PI, 0, -BODY_D / 2],
    [0.34, Math.PI / 2, BODY_W / 2, 0],
    [0.34, -Math.PI / 2, -BODY_W / 2, 0],
  ];
  for (const [wide, turn, x, z] of panels) {
    const ring = roundedRect(new Shape(), wide, 0.56, 0.03);
    ring.holes.push(roundedRect(new Path(), wide - 0.05, 0.51, 0.018));
    const frame = new ExtrudeGeometry(ring, { depth: 0.006, bevelEnabled: false, curveSegments: 4 });
    frames.push(frame.rotateY(turn).translate(x, BODY_Y, z));
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const rivet = new SphereGeometry(0.008, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
        fittings.push(rivet.translate(sx * (wide / 2 - 0.013), sy * 0.267, 0.006).rotateY(turn).translate(x, BODY_Y, z));
      }
    }
    if (x !== 0) {
      const grip = new TorusGeometry(0.055, 0.007, 6, 12, Math.PI).rotateZ(Math.PI).translate(0, 0.085, 0.012);
      fittings.push(grip.rotateY(turn).translate(x, BODY_Y, z));
      for (const sx of [-1, 1]) {
        fittings.push(box(0.024, 0.03, 0.02, 0.004).translate(sx * 0.055, 0.085, 0.01).rotateY(turn).translate(x, BODY_Y, z));
      }
    }
  }
  parts.push([merge(frames), SKIRT]);
  parts.push([merge(fittings), BRASS]);

  const gilding = intoRegion(new PlaneGeometry(0.44, 0.58, 2, 2), GILDING);
  gilding.translate(0, BODY_Y, DOOR_FACE + 0.004);

  return { parts, gilding };
}
