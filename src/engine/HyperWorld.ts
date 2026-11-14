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
  Quaternion,
  Scene,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  Vector3,
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
  fogInvDist?: number;
  background?: number;
  fov?: number;
  /** Chart-space shadow mapping. On unless explicitly disabled. */
  shadows?: boolean;
  /** 1 = full shadow (surface drops to its ambient floor). */
  shadowStrength?: number;
  /** Depth-compare bias, in normalized light-space depth. Raise if acne. */
  shadowBias?: number;
}

type RGB = [number, number, number];

/** Colours are multipliers in the space the shader writes to the screen, not sRGB hex. */
export interface Atmosphere {
  sunDirection: RGB;
  sun: RGB;
  skyLight: RGB;
  groundLight: RGB;
  horizon: RGB;
  zenith: RGB;
  sunGlow: RGB;
  fogDensity: number;
  haze: number;
  vignette: number;
}

export interface RenderQuality {
  /** In device pixels, whatever the screen's size or density. */
  pixelBudget: number;
  maxPixelRatio: number;
  samples: number;
  /** 0 turns the shadow pass off. */
  shadowMapSize: number;
  /**
   * Half-extent of the light's orthographic box, in Poincare chart units,
   * centred on the viewer. 1.0 reaches the quarter turn (2*atan(1) = PI/2,
   * ~16 authored units at unitScale 0.1) — beyond that, ground shadows are
   * subpixel at typical view distances anyway. Sharpness scales with
   * shadowMapSize/shadowExtent, so widen the box and the map together.
   */
  shadowExtent: number;
  softShadows: boolean;
  /** Seconds that callers of `renderView` should leave between passes. */
  auxInterval: number;
}

const DEFAULT_QUALITY: RenderQuality = {
  pixelBudget: 8.3e6,
  maxPixelRatio: 2,
  samples: 4,
  shadowMapSize: 2048,
  shadowExtent: 0.7,
  softShadows: true,
  auxInterval: 0.1,
};

const MIN_PIXEL_RATIO = 0.3;

const scratchDir = new Vector3();
const scratchQuat = new Quaternion();
const lightRight = new Vector3();
const lightUp = new Vector3();
const lightBack = new Vector3();

/**
 * A comparison depth texture in a render target: sampling it with
 * sampler2DShadow gets the depth test plus bilinear percentage-closer
 * filtering in hardware.
 *
 * Built fresh rather than resized. `WebGLRenderTarget.setSize` reconciles its
 * colour attachments and drops the framebuffer, but the attached DepthTexture
 * does not survive the round trip intact — after a resize the shadow term
 * comes back wrong, and stays wrong, with every uniform still reading
 * correctly. Allocating a new pair is a few megabytes on a quality change,
 * which is a cheap price for a state that is always fully specified.
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

  quality: RenderQuality = DEFAULT_QUALITY;

  private objects: HyperObject[] = [];
  private shadowTarget: WebGLRenderTarget | null = null;
  private lightCamera: OrthographicCamera | null = null;
  private shadowStrength = 0.9;
  private shadowBias = 0.0013;
  private shadowThrow = new Vector3();
  private frustum = { t: 1, at: 1, cap: 1, side: 1 };
  private shadowsActive = true;
  private pixel = new Uint8Array(4);
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
   * The target's samples are the only multisampling the world gets — the
   * canvas only ever draws one full-screen quad, which has no interior edges
   * to resolve.
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
      // viewTarget owns multisampling and depth; asking for them here only
      // allocates a second set of full-size buffers that nothing reads.
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(opts.background ?? 0xb8c6d4, 1);
    this.renderer.info.autoReset = false;

    // Near plane must be tiny: the viewer sits at the Poincare origin, so
    // nearby geometry is genuinely a few thousandths of a unit away.
    this.camera = new PerspectiveCamera(opts.fov ?? 70, 1, 0.0005, 20);
    this.camera.position.set(0, 0, 0);

    // syncMatrices does this instead, for the objects that survive culling.
    this.scene.matrixWorldAutoUpdate = false;

    this.viewTarget = this.makeViewTarget();

    this.blitMaterial = new ShaderMaterial({
      glslVersion: GLSL3,
      uniforms: { uView: { value: this.viewTarget.texture }, uVignette: { value: 0 } },
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
        uniform float uVignette;
        in vec2 vUv;
        layout(location = 0) out vec4 fragColor;
        void main() {
          vec2 q = vUv - 0.5;
          float edge = smoothstep(0.12, 0.62, dot(q, q));
          fragColor = vec4(texture(uView, vUv).rgb * (1.0 - uVignette * edge), 1.0);
        }
      `,
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), this.blitMaterial);
    quad.frustumCulled = false;
    this.blitScene.add(quad);

    this.shared = createSharedUniforms();
    this.shared.uFogInvDist.value = opts.fogInvDist ?? 1.0;

    if (opts.shadows !== false) {
      this.shared.shadowsEnabled = true;
      this.shadowTarget = makeShadowTarget(this.quality.shadowMapSize);
      this.lightCamera = new OrthographicCamera();
      this.lightCamera.layers.set(SHADOW_LAYER);
      this.shadowBias = opts.shadowBias ?? this.shadowBias;
      this.shadowStrength = opts.shadowStrength ?? this.shadowStrength;
    } else {
      this.shadowsActive = false;
    }

    this.setQuality(this.quality);
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

  setAtmosphere(a: Atmosphere): void {
    const s = this.shared;
    s.uSunColor.value.fromArray(a.sun);
    s.uSkyLight.value.fromArray(a.skyLight);
    s.uGroundLight.value.fromArray(a.groundLight);
    s.uFogHorizon.value.fromArray(a.horizon);
    s.uFogZenith.value.fromArray(a.zenith);
    s.uSunGlow.value.fromArray(a.sunGlow);
    s.uFogDensity.value = a.fogDensity;
    s.uHaze.value = a.haze;
    this.blitMaterial.uniforms.uVignette.value = a.vignette;
    this.setLightDirection(scratchDir.fromArray(a.sunDirection));
  }

  setLightDirection(dir: Vector3): void {
    const light = this.shared.uLightDir.value.copy(dir).normalize();
    // Per unit of caster radius, with 1.3 of slack. Too short and the shadows
    // of things just off screen vanish at its edge.
    const reach = light.y > 0.05 ? 2.6 / light.y : 1e3;
    this.shadowThrow.set(-light.x * reach, 0, -light.z * reach);
  }

  setFov(deg: number): void {
    this.camera.fov = deg;
    this.camera.updateProjectionMatrix();
  }

  private makeViewTarget(): WebGLRenderTarget {
    const target = new WebGLRenderTarget(1, 1, {
      samples: this.quality.samples,
      depthBuffer: true,
      stencilBuffer: false,
    });
    // Sampled and written back untouched. A raw GLSL3 shader gets no colour
    // management injected, so leaving the texture unmanaged makes the blit an
    // exact copy rather than a decode/encode round trip.
    target.texture.colorSpace = NoColorSpace;
    target.texture.minFilter = NearestFilter;
    target.texture.magFilter = NearestFilter;
    return target;
  }

  setQuality(next: RenderQuality): void {
    const prev = this.quality;
    this.quality = next;

    // Rebuilt rather than mutated: `samples` is read when the target's
    // framebuffer is set up, so assigning it to a live target changes the
    // property and nothing else.
    if (next.samples !== prev.samples) {
      const old = this.viewTarget;
      this.viewTarget = this.makeViewTarget();
      // The uniform holds the texture, not the target.
      this.blitMaterial.uniforms.uView.value = this.viewTarget.texture;
      old.dispose();
    }

    if (this.shadowTarget) {
      // The materials keep their USE_SHADOWMAP define either way — dropping it
      // would mean recompiling every shader in the world. Zero strength makes
      // the shader return before it samples, and the depth pass is skipped.
      this.shadowsActive = next.shadowMapSize > 0;
      this.shared.uShadowStrength.value = this.shadowsActive ? this.shadowStrength : 0;
      this.shared.uShadowSoft.value = next.softShadows ? 1 : 0;
      // Depth-pass fragments beyond twice the extent are discarded — that is
      // comfortably outside the map while killing far-hemisphere geometry
      // whose chart coordinates have blown up.
      this.shared.uShadowMaxWDot.value = (2 * next.shadowExtent) ** 2;
      // Off still needs a complete texture behind the sampler, just a small one.
      const size = next.shadowMapSize || 16;
      // Bias is a fraction of the depth range, so the slack it buys, counted
      // in texels, depends on the map's size and not on the extent.
      this.shared.uShadowBias.value = this.shadowBias * Math.max(1, 2048 / size);
      this.shared.uShadowTexel.value = 1 / size;
      if (size !== this.shadowTarget.width) {
        const old = this.shadowTarget;
        this.shadowTarget = makeShadowTarget(size);
        // The uniform holds the texture, not the target, so it has to be
        // re-pointed before anything samples it.
        this.shared.uShadowMap.value = this.shadowTarget.depthTexture;
        this.shadowMapDirty = true;
        old.depthTexture?.dispose();
        old.dispose();
      }
    }

    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const q = this.quality;
    const ratio = Math.max(
      MIN_PIXEL_RATIO,
      Math.min(devicePixelRatio || 1, q.maxPixelRatio, Math.sqrt(q.pixelBudget / (w * h))),
    );
    if (ratio !== this.renderer.getPixelRatio()) this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // The target backs the canvas pixel for pixel, so it follows the drawing
    // buffer rather than the CSS size.
    this.renderer.getDrawingBufferSize(this.drawingBuffer);
    this.viewTarget.setSize(this.drawingBuffer.x, this.drawingBuffer.y);
  }

  private cull(camera: PerspectiveCamera, main: boolean): void {
    const f = this.frustum;
    f.t = Math.tan((camera.fov * Math.PI) / 360) / camera.zoom;
    f.at = f.t * camera.aspect;
    f.side = Math.hypot(1, f.at);
    f.cap = Math.hypot(1, f.t);
    scratchQuat.copy(camera.quaternion).invert();

    for (const obj of this.objects) {
      const inFrustum =
        obj.viewSine > 1 || this.inside(scratchDir.copy(obj.viewDir)) > -(obj.viewSine + 0.02);
      if (main) obj.inView = inFrustum;
      // Casters are culled against this camera only: a renderView camera
      // wider than the main one can show things beside the screen unshadowed.
      const casts =
        this.shadowsActive && this.castsIntoMap(obj) && (inFrustum || this.shadowInView(obj));
      obj.show(inFrustum, casts);
    }
  }

  /** How far inside the frustum a chart direction is, as a sine. Overwrites `dir`. */
  private inside(dir: Vector3): number {
    const f = this.frustum;
    dir.applyQuaternion(scratchQuat);
    return Math.min((-f.at * dir.z - Math.abs(dir.x)) / f.side, (-f.t * dir.z - Math.abs(dir.y)) / f.cap);
  }

  private shadowInView(obj: HyperObject): boolean {
    const inner = Math.tan(obj.viewNear / 2);
    const outer = Math.tan(obj.viewFar / 2);
    const radius = (outer - inner) / 2;
    // Three balls along the shadow, wide enough to leave no gap between them.
    const reach = 1.1 * Math.hypot(radius, (this.shadowThrow.length() * radius) / 4);
    for (let i = 0; i <= 2; i++) {
      const c = scratchDir
        .copy(obj.viewDir)
        .multiplyScalar((inner + outer) / 2)
        .addScaledVector(this.shadowThrow, (radius * i) / 2);
      const distance = c.length();
      if (distance <= reach) return true;
      if (this.inside(c.divideScalar(distance)) > -(reach / distance + 0.02)) return true;
    }
    return false;
  }

  private castsIntoMap(obj: HyperObject): boolean {
    const R = this.quality.shadowExtent;
    const inner = Math.tan(Math.max(0, obj.viewNear) / 2);
    // uShadowMaxWDot: the depth pass keeps nothing further out than this.
    if (inner > 2 * R) return false;
    if (obj.viewSine > 1) return true;
    const outer = Math.tan(obj.viewFar / 2);
    const centre = (inner + outer) / 2;
    const radius = (outer - inner) / 2;
    const d = obj.viewDir;
    return (
      Math.abs(d.dot(lightRight)) * centre - radius < R &&
      Math.abs(d.dot(lightUp)) * centre - radius < R &&
      Math.abs(d.dot(lightBack)) * centre - radius < 2 * R
    );
  }

  /**
   * Bring world matrices up to date for everything about to be drawn. Call it
   * before any pass that is not already preceded by render().
   */
  syncMatrices(): void {
    for (const obj of this.objects) if (obj.visible) obj.syncMatrices();
  }

  /** Draws with the placements of the last render(), not the current worldGV. */
  renderView(camera: PerspectiveCamera, target: WebGLRenderTarget): void {
    this.cull(camera, false);
    this.syncMatrices();
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, camera);
    this.renderer.setRenderTarget(null);
  }

  warmUp(): void {
    this.render(true);
  }

  render(everything = false): void {
    this.renderer.info.reset();
    this.shared.uK.value = HM.K;
    this.shared.uUnitScale.value = HM.unitScale;
    this.shared.uTime.value = performance.now() / 1000;
    for (const obj of this.objects) obj.place(this.worldGV);

    // Drawn when shadows are on, and once more after any reallocation even if
    // they are off — see shadowMapDirty. The one extra pass is the price of
    // never binding an incomplete texture.
    const shadowPass =
      this.shadowTarget && this.lightCamera && (this.shadowsActive || this.shadowMapDirty);
    if (shadowPass) this.aimLight();
    if (everything) for (const obj of this.objects) obj.showAll();
    else this.cull(this.camera, true);
    this.syncMatrices();
    this.shared.pack();
    if (shadowPass) {
      this.renderer.setRenderTarget(this.shadowTarget);
      this.renderer.render(this.scene, this.lightCamera!);
      this.shared.uShadowMap.value = this.shadowTarget!.depthTexture;
      this.shadowMapDirty = false;
    }

    this.renderer.setRenderTarget(this.viewTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.blitScene, this.blitCamera);
  }

  /** Blocks until the GPU has drawn everything submitted. */
  finish(): void {
    const gl = this.renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixel);
  }

  /**
   * Aim the light camera for the shadow depth map.
   *
   * The map lives in the viewer's Poincare chart — the same space the fixed
   * uLightDir cheat lights in, so shadows land exactly where the diffuse term
   * says the light comes from. The chart moves whenever the viewer does, so
   * the map is redrawn every frame, and the light box stays centred on the
   * origin where the viewer permanently sits and shadow detail matters most.
   */
  private aimLight(): void {
    const R = this.quality.shadowExtent;
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

    cam.matrixWorld.extractBasis(lightRight, lightUp, lightBack);
  }

  /** Geodesic distance the viewer has travelled from the world origin. */
  distanceFromOrigin(): number {
    const r = this.worldGV.vec.length();
    if (HM.K > 0) return 2 * Math.atan(r);
    if (HM.K < 0) return 2 * Math.atanh(Math.min(r, 0.999999));
    return 2 * r;
  }
}
