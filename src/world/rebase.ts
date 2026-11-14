import { Quaternion, Vector3, type BufferGeometry } from 'three';
import { mobiusAddGyr, poincareToUnit, unitToPoincare, type GyroVector } from '../engine';

export function rebase(geometry: BufferGeometry, from: GyroVector, to: GyroVector): BufferGeometry {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const back = to.inverse();
  const unturn = to.gyr.clone().invert();
  const p = new Vector3();
  const n = new Vector3();
  const q = new Vector3();
  const turn = new Quaternion();

  for (let i = 0; i < position.count; i++) {
    unitToPoincare(p.fromBufferAttribute(position, i), true, p);
    const placed = from.transformNormal(p, n.fromBufferAttribute(normal, i));
    back.transformPoint(placed.point, q);

    // Must stay the exact inverse of GyroVector.transformNormal, taken at q.
    turn.copy(mobiusAddGyr(to.vec, q).gyr);
    placed.normal.applyQuaternion(unturn).applyQuaternion(turn);

    // tanK height off here, so the target object must be built with it off;
    // and through Klein, so `to` must be within a quarter turn of every vertex.
    poincareToUnit(q, false, q);
    position.setXYZ(i, q.x, q.y, q.z);
    normal.setXYZ(i, placed.normal.x, placed.normal.y, placed.normal.z);
  }

  position.needsUpdate = true;
  normal.needsUpdate = true;
  return geometry;
}
