import { Color } from 'three';
import type { Atmosphere, HyperWorld } from '../engine';

export const CLEAR_DAY = 0xaebfd0;
const CLEAR_NIGHT = 0x141c38;

export const DAY: Atmosphere = {
  sunDirection: [-0.72, 0.93, 0.3],
  sun: [2.05, 1.86, 1.5],
  skyLight: [0.7, 0.84, 1.04],
  groundLight: [0.74, 0.72, 0.58],
  horizon: [0.74, 0.85, 0.95],
  zenith: [0.3, 0.54, 0.86],
  sunGlow: [1.0, 0.86, 0.62],
  fogDensity: 0.9,
  haze: 0.3,
  vignette: 0.28,
};

export const NIGHT: Atmosphere = {
  // The shadow map is aimed along this every frame: a moon anywhere but where the sun is slides every shadow across the ground during the blend.
  sunDirection: DAY.sunDirection,
  sun: [0.34, 0.42, 0.66],
  skyLight: [0.2, 0.27, 0.46],
  groundLight: [0.12, 0.15, 0.24],
  horizon: [0.11, 0.16, 0.3],
  zenith: [0.025, 0.045, 0.12],
  sunGlow: [0.3, 0.36, 0.5],
  fogDensity: 0.9,
  haze: 0.3,
  vignette: 0.42,
};

const COLOURS = ['sun', 'skyLight', 'groundLight', 'horizon', 'zenith', 'sunGlow'] as const;
const SCALARS = ['fogDensity', 'haze', 'vignette'] as const;

const mixed: Atmosphere = {
  ...DAY,
  sun: [...DAY.sun],
  skyLight: [...DAY.skyLight],
  groundLight: [...DAY.groundLight],
  horizon: [...DAY.horizon],
  zenith: [...DAY.zenith],
  sunGlow: [...DAY.sunGlow],
};
const clearDay = new Color(CLEAR_DAY);
const clearNight = new Color(CLEAR_NIGHT);
const clear = new Color();

/** 0 is day, 1 is night. */
export function setNight(world: HyperWorld, k: number): void {
  for (const key of COLOURS) {
    for (let i = 0; i < 3; i++) mixed[key][i] = DAY[key][i] + (NIGHT[key][i] - DAY[key][i]) * k;
  }
  for (const key of SCALARS) mixed[key] = DAY[key] + (NIGHT[key] - DAY[key]) * k;
  world.setAtmosphere(mixed);
  world.renderer.setClearColor(clear.copy(clearDay).lerp(clearNight, k), 1);
}
