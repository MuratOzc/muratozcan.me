import { CylinderGeometry, type BufferGeometry } from 'three';
import type { HyperMaterialOptions } from '../../engine';
import { pos, type Part } from '../geometry';

const GRAPHITE: HyperMaterialOptions = { color: 0x55585c, ambient: 0.55, gloss: 0.3 };
const FERRULE: HyperMaterialOptions = { color: 0xdde1e4, ambient: 0.62, gloss: 0.5, metal: 0.6 };

export function pencil(colour: number): Part[] {
  const L = 0.15;
  const R = 0.0038;
  const lie = (g: BufferGeometry, x: number): BufferGeometry => pos(g.rotateZ(-Math.PI / 2), x, R, 0);
  return [
    [lie(new CylinderGeometry(R, R, L, 6), 0), { color: colour, ambient: 0.58, gloss: 0.5 }],
    [lie(new CylinderGeometry(0.0012, R, 0.014, 6), L / 2 + 0.007), { color: 0xf0d2a4, ambient: 0.58, gloss: 0.1 }],
    [lie(new CylinderGeometry(0.0002, 0.0012, 0.005, 6), L / 2 + 0.0165), GRAPHITE],
    [lie(new CylinderGeometry(R + 0.0003, R + 0.0003, 0.011, 8), -L / 2 - 0.0055), FERRULE],
    [lie(new CylinderGeometry(R, R, 0.009, 8), -L / 2 - 0.0155), { color: 0xf2a39b, ambient: 0.6, gloss: 0.1 }],
  ];
}
