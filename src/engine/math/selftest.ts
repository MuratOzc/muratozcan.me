import { Quaternion, Vector3 } from 'three';
import { HM, atanK, setGeometry, tanK, type Curvature } from './curvature';
import {
  geodesicTranslate,
  kleinToPoincare,
  poincareToKlein,
  unitToPoincare,
  poincareToUnit,
} from './coords';
import { mobiusAdd, mobiusDistSq } from './mobius';
import { GyroVector } from './gyrovector';

/**
 * Invariant checks for the curved-space math.
 *
 * Several are ported from HyperEngine's own unit tests (UnitTests/HMTest.cs);
 * the spherical wrap test is ours, and it is the one that actually proves the
 * world closes up.
 */

export interface TestResult {
  name: string;
  pass: boolean;
  detail: string;
}

const CURVATURES: Curvature[] = [-1, 0, 1];
const NAME: Record<number, string> = { [-1]: 'hyperbolic', 0: 'euclidean', 1: 'spherical' };

function randVec(scale: number): Vector3 {
  return new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
    .normalize()
    .multiplyScalar(Math.random() * scale);
}

function randQuat(): Quaternion {
  return new Quaternion(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
    .normalize();
}

export function runSelfTests(): TestResult[] {
  const saved = { K: HM.K, unitScale: HM.unitScale };
  const results: TestResult[] = [];

  // --- Klein <-> Poincare round trip ------------------------------------
  {
    let worst = 0;
    for (const K of CURVATURES) {
      setGeometry(K, 1);
      for (let i = 0; i < 400; i++) {
        const p = randVec(0.4);
        const back = kleinToPoincare(poincareToKlein(p));
        worst = Math.max(worst, back.distanceTo(p));
      }
    }
    results.push({
      name: 'Klein <-> Poincare round trip',
      pass: worst < 1e-9,
      detail: `max error ${worst.toExponential(2)}`,
    });
  }

  // --- Unit <-> Poincare round trip (with tanK height) ------------------
  {
    let worst = 0;
    for (const K of CURVATURES) {
      setGeometry(K, 1);
      for (let i = 0; i < 400; i++) {
        const u = randVec(0.5);
        const back = poincareToUnit(unitToPoincare(u, true), true);
        worst = Math.max(worst, back.distanceTo(u));
      }
    }
    results.push({
      name: 'Unit <-> Poincare round trip',
      pass: worst < 1e-9,
      detail: `max error ${worst.toExponential(2)}`,
    });
  }

  // --- tanK / atanK -----------------------------------------------------
  {
    let worst = 0;
    for (const K of CURVATURES) {
      setGeometry(K, 1);
      for (let i = 0; i < 200; i++) {
        const x = (Math.random() - 0.5) * 1.2;
        worst = Math.max(worst, Math.abs(atanK(tanK(x)) - x));
      }
    }
    results.push({
      name: 'atanK(tanK(x)) == x',
      pass: worst < 1e-12,
      detail: `max error ${worst.toExponential(2)}`,
    });
  }

  // --- Möbius addition reduces to vector addition at K = 0 --------------
  {
    setGeometry(0, 1);
    let worst = 0;
    for (let i = 0; i < 400; i++) {
      const a = randVec(3);
      const b = randVec(3);
      worst = Math.max(worst, mobiusAdd(a, b).distanceTo(a.clone().add(b)));
    }
    results.push({
      name: 'K=0: Mobius add == vector add',
      pass: worst === 0,
      detail: worst === 0 ? 'exact' : `max error ${worst.toExponential(2)}`,
    });
  }

  // --- mobiusDistSq agrees with the explicit form -----------------------
  {
    let worst = 0;
    for (const K of CURVATURES) {
      setGeometry(K, 1);
      for (let i = 0; i < 400; i++) {
        const a = randVec(0.4);
        const b = randVec(0.4);
        const explicit = mobiusAdd(a, b.clone().negate()).lengthSq();
        worst = Math.max(worst, Math.abs(mobiusDistSq(a, b) - explicit));
      }
    }
    results.push({
      name: 'mobiusDistSq == |a (+) -b|^2',
      pass: worst < 1e-12,
      detail: `max error ${worst.toExponential(2)}`,
    });
  }

  // --- GyroVector inverse (HMTest.TestGyroVectorInverse) ----------------
  {
    let worst = 0;
    for (const K of CURVATURES) {
      setGeometry(K, 1);
      for (let i = 0; i < 200; i++) {
        const a = new GyroVector(randVec(0.35), randQuat());
        const id = a.add(a.inverse());
        worst = Math.max(worst, id.vec.length(), Math.abs(Math.abs(id.gyr.w) - 1));
      }
    }
    results.push({
      name: 'a + (-a) == identity',
      pass: worst < 1e-9,
      detail: `max error ${worst.toExponential(2)}`,
    });
  }

  // --- -(a+b) == (-b) + (-a) --------------------------------------------
  {
    let worst = 0;
    for (const K of CURVATURES) {
      setGeometry(K, 1);
      for (let i = 0; i < 200; i++) {
        const a = new GyroVector(randVec(0.3), randQuat());
        const b = new GyroVector(randVec(0.3), randQuat());
        const lhs = a.add(b).inverse();
        const rhs = b.inverse().add(a.inverse());
        const dq = Math.min(
          Math.abs(lhs.gyr.x - rhs.gyr.x) + Math.abs(lhs.gyr.y - rhs.gyr.y) +
            Math.abs(lhs.gyr.z - rhs.gyr.z) + Math.abs(lhs.gyr.w - rhs.gyr.w),
          Math.abs(lhs.gyr.x + rhs.gyr.x) + Math.abs(lhs.gyr.y + rhs.gyr.y) +
            Math.abs(lhs.gyr.z + rhs.gyr.z) + Math.abs(lhs.gyr.w + rhs.gyr.w),
        );
        worst = Math.max(worst, lhs.vec.distanceTo(rhs.vec), dq);
      }
    }
    results.push({
      name: '-(a+b) == (-b) + (-a)',
      pass: worst < 1e-9,
      detail: `max error ${worst.toExponential(2)}`,
    });
  }

  // --- Translation composes additively in geodesic distance -------------
  {
    setGeometry(1, 1);
    const dir = new Vector3(0, 0, 1);
    let gv = new GyroVector();
    const step = 0.05;
    const n = 20;
    for (let i = 0; i < n; i++) gv = gv.translate(geodesicTranslate(dir.clone().multiplyScalar(step)));
    const travelled = 2 * Math.atan(gv.vec.length());
    results.push({
      name: 'spherical: 20 steps of 0.05 == 1.0 rad',
      pass: Math.abs(travelled - step * n) < 1e-9,
      detail: `travelled ${travelled.toFixed(12)} rad`,
    });
  }

  // --- THE WRAP: walk 2*PI and arrive back where you started ------------
  // This is the one that proves the universe is finite and closed. Note the
  // odd step count: an even one would land a step exactly on the antipode,
  // where the Poincare radius is infinite.
  {
    setGeometry(1, 1);
    const steps = 997;
    const d = new Vector3(0, 0, (2 * Math.PI) / steps);
    let gv = new GyroVector();
    let maxRadius = 0;
    for (let i = 0; i < steps; i++) {
      gv = gv.translate(geodesicTranslate(d));
      maxRadius = Math.max(maxRadius, gv.vec.length());
    }
    const err = gv.vec.length();
    results.push({
      name: 'spherical: walking 2*PI returns to start',
      pass: err < 1e-6,
      detail: `residual ${err.toExponential(2)} (peak radius ${maxRadius.toExponential(1)} at the antipode)`,
    });
  }

  // --- Angular size follows 1/sin(theta) -------------------------------
  // The projection renders Poincare coordinates through an ordinary
  // perspective camera. That is only legitimate if it reproduces true
  // spherical optics: an object of size s at geodesic distance theta must
  // subtend s/sin(theta), shrinking to a minimum at a quarter turn and then
  // GROWING again as it approaches the antipode. This measures it.
  {
    setGeometry(1, 1);
    const fwd = new Vector3(0, 0, -1);
    const right = new Vector3(1, 0, 0);
    const s = 1e-5;
    let worstRel = 0;
    let minAt = 0;
    let minSize = Infinity;
    for (let i = 1; i <= 60; i++) {
      const theta = (i / 61) * Math.PI;
      const a = new GyroVector().translate(geodesicTranslate(fwd.clone().multiplyScalar(theta)));
      // transformPoint, not translate().point(). `translate` composes two
      // isometries and carries the holonomy rotation with it; `transformPoint`
      // is where a vertex offset within the object actually lands, which is
      // what the vertex shader computes. Using the former here measures
      // s*cos(theta) instead of s, because the gyration rotates the lateral
      // step back out.
      const offset = geodesicTranslate(right.clone().multiplyScalar(s));
      // Angular separation seen from the origin, which is where the viewer is.
      const measured = a.point().angleTo(a.transformPoint(offset));
      const predicted = s / Math.sin(theta);
      worstRel = Math.max(worstRel, Math.abs(measured - predicted) / predicted);
      if (measured < minSize) {
        minSize = measured;
        minAt = theta;
      }
    }
    results.push({
      name: 'angular size == s / sin(theta)',
      pass: worstRel < 1e-4 && Math.abs(minAt - Math.PI / 2) < 0.06,
      detail: `max rel error ${worstRel.toExponential(2)}, minimum at ${minAt.toFixed(3)} rad (quarter turn = ${(Math.PI / 2).toFixed(3)})`,
    });
  }

  // --- Geodesics project to straight screen lines -----------------------
  // Counter-intuitive but important: because the viewer sits at the Poincare
  // origin, a point's screen direction is just normalize(p), which reduces to
  // the gnomonic direction — and gnomonic maps great circles to straight
  // lines. So a geodesic edge renders perfectly straight no matter how long
  // it is or how strong the curvature.
  //
  // The practical consequence is that tessellation does NOT affect silhouette.
  // A straight chord through Poincare space and the true geodesic share their
  // endpoints and both project to lines, so they draw the same screen edge.
  // Subdivision still matters for shading, fog, depth ordering and the
  // hemisphere discard boundary — just not for whether edges look straight.
  {
    setGeometry(1, 1);
    let worst = 0;
    for (const [dist, half] of [[0.4, 0.3], [0.8, 0.4], [1.5, 0.8], [2.4, 1.0]]) {
      const at = (lateral: number) =>
        GyroVector.fromGeodesic(new Vector3(0, 0, -1), dist)
          .transformPoint(new Vector3(lateral, 0, 0))
          .normalize();
      const a = at(-half);
      const b = at(half);
      const m = at(0);
      // If A, B and the midpoint are coplanar with the eye, they are collinear
      // on screen.
      const n = new Vector3().crossVectors(a, b).normalize();
      worst = Math.max(worst, Math.abs(n.dot(m)));
    }
    results.push({
      name: 'geodesics render as straight screen lines',
      pass: worst < 1e-12,
      detail: `max out-of-plane ${worst.toExponential(2)} — so tessellation does not change silhouette`,
    });
  }

  setGeometry(saved.K, saved.unitScale);
  return results;
}

export function formatSelfTests(results: TestResult[]): string {
  return results
    .map((r) => `${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n      ${r.detail}`)
    .join('\n');
}

export { NAME as CURVATURE_NAMES };
