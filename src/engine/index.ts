export { HM, setGeometry, setTileType, tanK, atanK } from './math/curvature';
export type { Curvature } from './math/curvature';

export {
  mobiusAdd,
  mobiusGyr,
  mobiusAddGyr,
  mobiusDistSq,
  poincareDist,
} from './math/mobius';

export {
  kleinToPoincare,
  poincareToKlein,
  kleinToPoincareNormal,
  poincareToKleinNormal,
  unitToKlein,
  kleinToUnit,
  unitToPoincare,
  poincareToUnit,
  poincareScaleFactor,
  upVector,
  projectToPlane,
  geodesicTranslate,
  hyperTranslate,
  geodesicRadius,
  heightAboveGround,
  fromToRotation,
  swingTwist,
} from './math/coords';

export { GyroVector } from './math/gyrovector';
export { runSelfTests, formatSelfTests } from './math/selftest';
export type { TestResult } from './math/selftest';

export { HyperWorld } from './HyperWorld';
export type { HyperWorldOptions } from './HyperWorld';
export { HyperObject } from './HyperObject';
export { Controls } from './Controls';
export {
  createHyperMaterials,
  createSharedUniforms,
} from './HyperMaterial';
export type {
  HyperMaterial,
  HyperMaterialOptions,
  SharedUniforms,
  Hemisphere,
} from './HyperMaterial';
