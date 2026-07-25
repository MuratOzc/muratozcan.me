import { PerspectiveCamera, Scene, Vector3, Vector4, WebGLRenderer } from 'three';
import { HM, setGeometry, type Curvature } from './math/curvature';
import { GyroVector } from './math/gyrovector';
import { HyperObject } from './HyperObject';
import { createSharedUniforms, type SharedUniforms } from './HyperMaterial';

export interface HyperWorldOptions {
  canvas: HTMLCanvasElement;
  curvature?: Curvature;
  unitScale?: number;
  fogColor?: [number, number, number];
  fogDensity?: number;
  fogInvDist?: number;
  background?: number;
  fov?: number;
}

/**
 * The world root.
 *
 * The important structural idea, inherited from HyperEngine: **there is no
 * camera.** `worldGV` is the inverse of the player's transform, and every
 * object is drawn at `localGV + worldGV`. The viewer sits permanently at the
 * origin of the Poincare ball and the universe moves around them.
 *
 * The Three camera exists only to supply a projection matrix and a look
 * rotation. Its position stays at the origin and is never used.
 */
export class HyperWorld {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly shared: SharedUniforms;

  /** Inverse of the viewer's transform. Moving the player moves this. */
  worldGV = new GyroVector();

  private objects: HyperObject[] = [];

  constructor(opts: HyperWorldOptions) {
    setGeometry(opts.curvature ?? 1, opts.unitScale ?? 1);

    this.renderer = new WebGLRenderer({
      canvas: opts.canvas,
      antialias: true,
      // The far hemisphere pass writes gl_FragDepth, so we need a real depth
      // buffer and cannot rely on early-z.
      depth: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setClearColor(opts.background ?? 0xb8c6d4, 1);

    // Near plane must be tiny: the viewer sits at the Poincare origin, so
    // nearby geometry is genuinely a few thousandths of a unit away.
    this.camera = new PerspectiveCamera(opts.fov ?? 70, 1, 0.0005, 20);
    this.camera.position.set(0, 0, 0);

    this.shared = createSharedUniforms();
    const fc = opts.fogColor ?? [0.72, 0.79, 0.86];
    this.shared.uFog.value = new Vector4(fc[0], fc[1], fc[2], opts.fogDensity ?? 1.0);
    this.shared.uFogInvDist.value = opts.fogInvDist ?? 1.0;

    this.resize();
  }

  add(obj: HyperObject): HyperObject {
    this.objects.push(obj);
    this.scene.add(obj);
    return obj;
  }

  remove(obj: HyperObject): void {
    const i = this.objects.indexOf(obj);
    if (i >= 0) this.objects.splice(i, 1);
    this.scene.remove(obj);
    obj.dispose();
  }

  setLightDirection(dir: Vector3): void {
    this.shared.uLightDir.value.copy(dir).normalize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.shared.uK.value = HM.K;
    this.shared.uUnitScale.value = HM.unitScale;
    for (const obj of this.objects) obj.updateHyper(this.worldGV);
    this.renderer.render(this.scene, this.camera);
  }

  /** Geodesic distance the viewer has travelled from the world origin. */
  distanceFromOrigin(): number {
    const r = this.worldGV.vec.length();
    if (HM.K > 0) return 2 * Math.atan(r);
    if (HM.K < 0) return 2 * Math.atanh(Math.min(r, 0.999999));
    return 2 * r;
  }
}
