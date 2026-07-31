import {
  Camera,
  DepthTexture,
  GLSL3,
  LessEqualCompare,
  LinearFilter,
  Mesh,
  NearestFilter,
  NoColorSpace,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { HM, setGeometry, type Curvature } from './math/curvature';
import { GyroVector } from './math/gyrovector';
import { HyperObject, SHADOW_LAYER } from './HyperObject';
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
  /** Chart-space shadow mapping. On unless explicitly disabled. */
  shadows?: boolean;
  /**
   * Resolution of the (square) shadow map. The default 4096 costs ~64 MB of
   * GPU memory; drop to 2048 together with a smaller shadowExtent for weaker
   * hardware.
   */
  shadowMapSize?: number;
  /**
   * Half-extent of the light's orthographic box, in Poincare chart units,
   * centred on the viewer. The default 1.0 reaches the quarter turn
   * (2*atan(1) = PI/2, ~16 authored units at unitScale 0.1) — beyond that,
   * ground shadows are subpixel at typical view distances anyway. Sharpness
   * scales with shadowMapSize/shadowExtent, so widen the box and the map
   * together.
   */
  shadowExtent?: number;
  /** 1 = full shadow (surface drops to its ambient floor). */
  shadowStrength?: number;
  /** Depth-compare bias, in normalized light-space depth. Raise if acne. */
  shadowBias?: number;
}

/**
 * A comparison depth texture in a render target: sampling it with
 * sampler2DShadow gets the depth test plus bilinear percentage-closer
 * filtering in hardware.
 *
 * Built fresh rather than resized. `WebGLRenderTarget.setSize` reconciles its
 * colour attachments and drops the framebuffer, but the attached DepthTexture
 * does not survive the round trip intact — after a resize the shadow term
 * comes back wrong, and stays wrong, with every uniform still reading
 * correctly. Allocating a new pair is a few megabytes on a settings change
 * that happens by hand, which is a cheap price for a state that is always
 * fully specified.
 */
function makeShadowTarget(size: number): WebGLRenderTarget {
  const depthTex = new DepthTexture(size, size);
  depthTex.type = UnsignedIntType;
  depthTex.compareFunction = LessEqualCompare;
  depthTex.minFilter = LinearFilter;
  depthTex.magFilter = LinearFilter;
  return new WebGLRenderTarget(size, size, { depthTexture: depthTex });
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
  private shadowTarget: WebGLRenderTarget | null = null;
  private lightCamera: OrthographicCamera | null = null;
  private shadowExtent = 0.5;
  private shadowStrength = 0.9;
  private shadowsActive = true;
  private pixelRatioCap = 2;
  /**
   * Set whenever the shadow target is allocated, cleared once it has been
   * drawn into. A depth texture that has never been attached to a framebuffer
   * is an INCOMPLETE texture, and a draw call that samples one is undefined —
   * in practice the geometry that samples it silently disappears. Skipping the
   * shadow pass is therefore only safe once the map exists at all.
   */
  private shadowMapDirty = true;

  /**
   * The view is rendered here and blitted to the canvas, never drawn to the
   * canvas directly.
   *
   * Not a stylistic choice. Drawing the same meshes into a render target AND
   * into the default framebuffer within one frame stalls for ~21ms — the
   * monitor's feed pass (props/monitor.ts) does exactly that, and it cost the
   * whole site 47fps against 145fps without it. Routing every world draw
   * through a target and compositing with one trivial program avoids the
   * transition entirely. The shadow pass never tripped it because its light
   * camera renders a disjoint layer.
   *
   * samples MUST match the canvas: the context is created with antialias, and
   * a non-multisampled target changes 2% of output bytes.
   */
  private viewTarget: WebGLRenderTarget;
  private blitScene = new Scene();
  private blitCamera = new Camera();
  private blitMaterial: ShaderMaterial;
  private drawingBuffer = new Vector2();

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

    // Nothing in this scene moves except through updateHyper and the tickers,
    // both of which run before any pass. Three would otherwise walk all ~2000
    // nodes once per render() call — three times a frame on feed frames.
    this.scene.matrixWorldAutoUpdate = false;

    this.viewTarget = new WebGLRenderTarget(1, 1, {
      samples: 4,
      depthBuffer: true,
      stencilBuffer: false,
    });
    // Sampled and written back untouched. A raw GLSL3 shader gets no colour
    // management injected, so leaving the texture unmanaged makes the blit an
    // exact copy rather than a decode/encode round trip.
    this.viewTarget.texture.colorSpace = NoColorSpace;
    this.viewTarget.texture.minFilter = NearestFilter;
    this.viewTarget.texture.magFilter = NearestFilter;

    this.blitMaterial = new ShaderMaterial({
      glslVersion: GLSL3,
      uniforms: { uView: { value: this.viewTarget.texture } },
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uView;
        in vec2 vUv;
        layout(location = 0) out vec4 fragColor;
        void main() { fragColor = texture(uView, vUv); }
      `,
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), this.blitMaterial);
    quad.frustumCulled = false;
    this.blitScene.add(quad);

    this.shared = createSharedUniforms();
    const fc = opts.fogColor ?? [0.72, 0.79, 0.86];
    this.shared.uFog.value = new Vector4(fc[0], fc[1], fc[2], opts.fogDensity ?? 1.0);
    this.shared.uFogInvDist.value = opts.fogInvDist ?? 1.0;

    if (opts.shadows !== false) {
      this.shared.shadowsEnabled = true;
      const size = opts.shadowMapSize ?? 4096;
      this.shadowExtent = opts.shadowExtent ?? 1.0;

      this.shadowTarget = makeShadowTarget(size);

      this.lightCamera = new OrthographicCamera();
      this.lightCamera.layers.set(SHADOW_LAYER);

      this.shared.uShadowTexel.value = 1 / size;
      // Bias is in normalized light-space depth, so its world-space slack
      // scales with the depth range (3.5 * extent) — this default matches the
      // contact tightness the old 0.5-extent map had at bias 0.0025.
      this.shared.uShadowBias.value = opts.shadowBias ?? 0.0013;
      this.shadowStrength = opts.shadowStrength ?? 0.9;
      this.shared.uShadowStrength.value = this.shadowStrength;
      // Depth-pass fragments beyond twice the extent are discarded — that is
      // comfortably outside the map while killing far-hemisphere geometry
      // whose chart coordinates have blown up.
      this.shared.uShadowMaxWDot.value = (2 * this.shadowExtent) ** 2;
    }

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

  setFov(deg: number): void {
    this.camera.fov = deg;
    this.camera.updateProjectionMatrix();
  }

  setPixelRatioCap(cap: number): void {
    if (cap === this.pixelRatioCap) return;
    this.pixelRatioCap = cap;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap));
    this.resize();
  }

  /**
   * Turn the shadow pass on or off at runtime.
   *
   * The materials keep their USE_SHADOWMAP define either way — dropping it
   * would mean recompiling every shader in the world on a settings change.
   * Zeroing the strength makes the shader's shadow term return exactly 1.0, so
   * the depth pass can then be skipped outright and its stale map never shows.
   */
  setShadowsEnabled(on: boolean): void {
    this.shadowsActive = on;
    this.shared.uShadowStrength.value = on ? this.shadowStrength : 0;
  }

  setShadowMapSize(size: number): void {
    if (!this.shadowTarget || this.shadowTarget.width === size) return;
    const old = this.shadowTarget;
    this.shadowTarget = makeShadowTarget(size);
    // The uniform holds the texture, not the target, so it has to be re-pointed
    // before anything samples it.
    this.shared.uShadowMap.value = this.shadowTarget.depthTexture;
    this.shared.uShadowTexel.value = 1 / size;
    this.shadowMapDirty = true;
    old.depthTexture?.dispose();
    old.dispose();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // The target backs the canvas pixel for pixel, so it follows the drawing
    // buffer rather than the CSS size.
    this.renderer.getDrawingBufferSize(this.drawingBuffer);
    this.viewTarget.setSize(this.drawingBuffer.x, this.drawingBuffer.y);
  }

  /**
   * Bring world matrices up to date. Idempotent within a frame in practice —
   * call it before any pass that is not already preceded by render().
   */
  syncMatrices(): void {
    this.scene.updateMatrixWorld();
  }

  render(): void {
    this.shared.uK.value = HM.K;
    this.shared.uUnitScale.value = HM.unitScale;
    for (const obj of this.objects) obj.updateHyper(this.worldGV);
    this.syncMatrices();
    // Drawn when shadows are on, and once more after any reallocation even if
    // they are off — see shadowMapDirty. The one extra pass is the price of
    // never binding an incomplete texture.
    if (this.shadowTarget && this.lightCamera && (this.shadowsActive || this.shadowMapDirty)) {
      this.renderShadowMap();
      this.shadowMapDirty = false;
    }

    this.renderer.setRenderTarget(this.viewTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.blitScene, this.blitCamera);
  }

  /**
   * Render the shadow depth map.
   *
   * The map lives in the viewer's Poincare chart — the same space the fixed
   * uLightDir cheat lights in, so shadows land exactly where the diffuse term
   * says the light comes from. The chart moves whenever the viewer does, so
   * this re-renders every frame, and the light box stays centred on the origin
   * where the viewer permanently sits and shadow detail matters most.
   */
  private renderShadowMap(): void {
    const R = this.shadowExtent;
    const cam = this.lightCamera!;

    cam.left = -R;
    cam.right = R;
    cam.top = R;
    cam.bottom = -R;
    cam.near = 0.01;
    // The camera sits 2R from the origin; geometry within R of the origin
    // spans depths [R, 3R] along the view axis.
    cam.far = 3.5 * R;
    cam.position.copy(this.shared.uLightDir.value).multiplyScalar(2 * R);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    // Clip space [-1,1] -> texture space [0,1], folded into one matrix.
    this.shared.uShadowMatrix.value
      .set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0,
      )
      .multiply(cam.projectionMatrix)
      .multiply(cam.matrixWorldInverse);

    this.renderer.setRenderTarget(this.shadowTarget);
    this.renderer.render(this.scene, cam);
    this.renderer.setRenderTarget(null);
    this.shared.uShadowMap.value = this.shadowTarget!.depthTexture;
  }

  /** Geodesic distance the viewer has travelled from the world origin. */
  distanceFromOrigin(): number {
    const r = this.worldGV.vec.length();
    if (HM.K > 0) return 2 * Math.atan(r);
    if (HM.K < 0) return 2 * Math.atanh(Math.min(r, 0.999999));
    return 2 * r;
  }
}
