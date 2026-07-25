import { Matrix3, Matrix4, Quaternion, Vector3 } from 'three';
import { fromToRotation, geodesicTranslate, swingTwist, upVector } from './coords';
import { mobiusAdd, mobiusAddGyr } from './mobius';
import { tanK } from './curvature';

/**
 * A GyroVector is an isometry of curved space — position *and* orientation. It
 * is the curved-space equivalent of a Transform.
 *
 * Ported from HyperEngine's GyroVector struct. It carries two things:
 *
 *   vec  the Poincare position
 *   gyr  the rotation accumulated from holonomy
 *
 * The `gyr` term is the part that surprises people. Möbius addition is neither
 * commutative nor associative, so composing translations spontaneously
 * generates rotation. That is not a bug or a precision artifact — it is what
 * curved space does. Walk a closed loop and you return facing elsewhere.
 *
 * C# used operator overloading (`gv + delta`, `gv - gv2`). TypeScript has none,
 * so the operators are named. The mapping is:
 *
 *   gv + delta       ->  gv.translate(delta)
 *   delta + gv       ->  gv.preTranslate(delta)
 *   gv + rot         ->  gv.rotate(rot)
 *   rot + gv         ->  gv.preRotate(rot)
 *   gv1 + gv2        ->  gv1.add(gv2)
 *   -gv              ->  gv.inverse()
 *   gv1 - gv2        ->  gv1.sub(gv2)
 *
 * All methods return new instances except {@link alignUpVector}, which mutates.
 */
export class GyroVector {
  vec: Vector3;
  gyr: Quaternion;

  constructor(vec = new Vector3(), gyr = new Quaternion()) {
    this.vec = vec.clone();
    this.gyr = gyr.clone().normalize();
  }

  static identity(): GyroVector {
    return new GyroVector();
  }

  /**
   * Place something at a geodesic distance along a direction. This is how you
   * position content in the world: `GyroVector.fromGeodesic(dir, 1.2)` sits
   * 1.2 radians away in a spherical world.
   */
  static fromGeodesic(direction: Vector3, distance: number): GyroVector {
    const dir = direction.clone().normalize();
    return new GyroVector(dir.multiplyScalar(tanK(distance * 0.5)));
  }

  clone(): GyroVector {
    return new GyroVector(this.vec, this.gyr);
  }

  copy(other: GyroVector): this {
    this.vec.copy(other.vec);
    this.gyr.copy(other.gyr);
    return this;
  }

  /** `gv + delta` — compose with a Möbius translation on the right. */
  translate(delta: Vector3): GyroVector {
    const d = delta.clone().applyQuaternion(this.gyr.clone().invert());
    const { sum, gyr } = mobiusAddGyr(this.vec, d);
    return new GyroVector(sum, new Quaternion().multiplyQuaternions(this.gyr, gyr));
  }

  /** `delta + gv` — compose with a Möbius translation on the left. */
  preTranslate(delta: Vector3): GyroVector {
    const { sum, gyr } = mobiusAddGyr(delta, this.vec);
    return new GyroVector(sum, new Quaternion().multiplyQuaternions(this.gyr, gyr));
  }

  /** `gv + rot` */
  rotate(rot: Quaternion): GyroVector {
    return new GyroVector(this.vec, new Quaternion().multiplyQuaternions(rot, this.gyr));
  }

  /** `rot + gv` */
  preRotate(rot: Quaternion): GyroVector {
    return new GyroVector(
      this.vec.clone().applyQuaternion(rot.clone().invert()),
      new Quaternion().multiplyQuaternions(this.gyr, rot),
    );
  }

  /** `this + other` */
  add(other: GyroVector): GyroVector {
    const d = other.vec.clone().applyQuaternion(this.gyr.clone().invert());
    const { sum, gyr } = mobiusAddGyr(this.vec, d);
    const g = new Quaternion().multiplyQuaternions(other.gyr, this.gyr).multiply(gyr);
    return new GyroVector(sum, g);
  }

  /** `-this` */
  inverse(): GyroVector {
    return new GyroVector(
      this.vec.clone().applyQuaternion(this.gyr).negate(),
      this.gyr.clone().invert(),
    );
  }

  /** `this - other` */
  sub(other: GyroVector): GyroVector {
    return this.add(other.inverse());
  }

  /** `this - delta` */
  untranslate(delta: Vector3): GyroVector {
    return this.translate(delta.clone().negate());
  }

  /** Move by a metric displacement, converting through the Poincare metric. */
  walk(displacement: Vector3): GyroVector {
    return this.translate(geodesicTranslate(displacement));
  }

  /** Apply the full transform to a Poincare point. */
  transformPoint(pt: Vector3, out = new Vector3()): Vector3 {
    return mobiusAdd(this.vec, pt, out).applyQuaternion(this.gyr);
  }

  /** Apply the transform to a point and the surface normal at that point. */
  transformNormal(pt: Vector3, n: Vector3): { point: Vector3; normal: Vector3 } {
    const { sum, gyr } = mobiusAddGyr(this.vec, pt);
    return {
      point: sum.applyQuaternion(this.gyr),
      normal: n.clone().applyQuaternion(gyr.clone().invert()).applyQuaternion(this.gyr),
    };
  }

  /** Where this transform puts the origin. */
  point(out = new Vector3()): Vector3 {
    return out.copy(this.vec).applyQuaternion(this.gyr);
  }

  /**
   * Re-level the horizon. Holonomy will gradually roll you as you move around,
   * so a walking camera calls this every frame.
   *
   * This is the correct fix for accumulated rotation while walking — note that
   * it is a *geometric* correction, not a numerical one. Re-orthonormalising a
   * matrix would not do this job.
   */
  alignUpVector(): this {
    const newAxis = upVector(this.vec);
    const newBasis = fromToRotation(newAxis, new Vector3(0, 1, 0));
    const twist = swingTwist(this.gyr, newAxis);
    this.gyr = new Quaternion().multiplyQuaternions(newBasis, twist);
    return this;
  }

  /** Rotation part, as a mat3 for shader upload. */
  toMatrix3(out = new Matrix3()): Matrix3 {
    return out.setFromMatrix4(new Matrix4().makeRotationFromQuaternion(this.gyr));
  }

  toString(): string {
    const f = (n: number) => n.toFixed(6);
    return `(${f(this.vec.x)}, ${f(this.vec.y)}, ${f(this.vec.z)}) ` +
           `[${f(this.gyr.x)}, ${f(this.gyr.y)}, ${f(this.gyr.z)}, ${f(this.gyr.w)}]`;
  }
}
