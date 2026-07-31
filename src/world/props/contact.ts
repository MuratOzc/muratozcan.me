import {
  Color,
  CylinderGeometry,
  Group,
  PlaneGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  HyperObject,
  unitToPoincare,
  geodesicRadius,
  type GyroVector,
  type HyperMaterial,
  type HyperWorld,
} from '../../engine';
import { L, t, onLangChange } from '../../content/i18n';
import { isTouch } from '../../device';
import { makeIconTexture, type IconName } from '../icons';
import { units } from '../placement';

/**
 * Station 10: contact — four brass tokens turning in the air, two by two.
 *
 * The old version put four arrow plates on a fingerpost and left the actual
 * links as bare URLs in the proximity panel. That failed twice over: the
 * plates looked like buttons and were not, and the panel's links are
 * unclickable while pointer lock is held, which it is for the entire visit
 * unless you happen to guess Escape. So the links were, in practice, dead.
 *
 * Now they are objects. Look at one, it slows, warms to its brand colour and
 * rides toward you; the prompt names it; E opens it. Pointer lock never
 * breaks, and the verb is the one the rest of the world already teaches:
 * point at a thing, act on it.
 *
 * ---------------------------------------------------------------------------
 * AIMING WITHOUT A RAYCASTER
 * ---------------------------------------------------------------------------
 * THREE.Raycaster is wrong here and would be subtly, expensively wrong. It
 * intersects local geometry against the model matrix — but a vertex's final
 * position is decided in the vertex shader, by the Mobius composition in
 * hyperCore.ts. The ray would agree near the origin and drift further out.
 *
 * Instead each token's rest position goes through the SAME transform the
 * shader uses (unit -> Poincare, then composed.transformPoint), which lands it
 * exactly where it is drawn, and the aim test is the angle between that
 * direction and the camera's forward. That is a dot product per token, exact
 * at any distance, with no scene traversal.
 *
 * Direction survives the hemisphere split untouched: the top pass divides by
 * w_dot, which rescales the vector without turning it.
 */

interface LinkDef {
  id: string;
  href: string;
  icon: IconName;
  /** Shown in the aim prompt. */
  name: string;
  /**
   * Tint under the crosshair. Not the literal brand hex in every case:
   * GitHub's mark is black, which would read as a hole punched in the brass
   * rather than as a highlight, so it gets a bright steel instead.
   */
  brand: number;
}

/** Reading order, laid into the grid top-left first. */
const LINKS: LinkDef[] = [
  {
    id: 'email',
    href: 'mailto:mr.muratozcan@gmail.com',
    icon: 'email',
    name: 'Email',
    brand: 0xe8865f,
  },
  {
    id: 'linkedin',
    href: 'https://www.linkedin.com/in/muratozc/',
    icon: 'linkedin',
    name: 'LinkedIn',
    brand: 0x4d9fdc,
  },
  {
    id: 'github',
    href: 'https://github.com/MuratOzc/',
    icon: 'github',
    name: 'GitHub',
    brand: 0xdfe6ee,
  },
  {
    id: 'instagram',
    href: 'https://www.instagram.com/murtileyto/',
    icon: 'instagram',
    name: 'Instagram',
    brand: 0xe07aae,
  },
];

const BRASS = 0xc9a35e;

const DISC_R = 0.27;
const DISC_T = 0.05;
/** Grid: half the gap between centres, horizontally and vertically. */
const HALF_X = 0.42;
const HALF_Y = 0.4;
/**
 * Eye height is 1 unit, so the grid straddles it: rows at 0.55 and 1.35 put
 * both within a glance of level. Anything higher is a thing you crane at.
 */
const CENTRE_Y = 0.95;

/**
 * You have to walk up to it. Exhibits sit 5 units off the path, so this is
 * short enough that nothing responds while you are still on the path.
 *
 * IN AUTHORED UNITS, converted inside the builder. Calling units() out here
 * would read HM.unitScale at module-evaluation time, and HM.unitScale is not
 * set until `new HyperWorld` runs — which is after every import has been
 * evaluated. It defaults to 1, so a module-level units(4) silently means four
 * RADIANS: larger than the whole world, and the range gate never rejects
 * anything. Nothing in this file may call units() at module scope.
 */
const AIM_RANGE_UNITS = 4;
/**
 * The token's own radius, with a little grace. The aim cone is derived from
 * this rather than being a fixed angle: a constant cone is the token's
 * silhouette at exactly one distance and is far too generous at every distance
 * beyond it.
 */
const AIM_RHO_UNITS = DISC_R * 1.3;
/** Floor on the cone, so a token is still catchable at close range. */
const AIM_MIN = 0.02;
/** How far a token rides toward you when aimed at. */
const LIFT = 0.12;

interface Token {
  def: LinkDef;
  node: Group;
  mats: HyperMaterial[];
  /** Rest position in the object's Unit frame — what the aim test measures. */
  unitPos: Vector3;
  baseY: number;
  spin: number;
  bob: number;
  /** 0 at rest, 1 fully highlighted. Eased. */
  aim: number;
  opened: boolean;
}

/**
 * Open a link from a keypress.
 *
 * A detached anchor rather than window.open: popup heuristics treat a synthetic
 * anchor click as navigation rather than as a popup, and mailto: through
 * window.open leaves an orphaned blank tab behind on some browsers.
 */
function openLink(href: string): void {
  const a = document.createElement('a');
  a.href = href;
  if (!href.startsWith('mailto:')) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  document.body.append(a);
  a.click();
  a.remove();
}

// There is no E to press on a phone. The touch layer delivers interact as a
// synthetic KeyE so this file needs only one code path, but the visitor must
// be told the gesture they actually have.
const PROMPT = isTouch ? L('tap', 'dokun') : L('press E', 'E’ye bas');

export interface ContactResult {
  object: HyperObject;
  tick: (worldGV: GyroVector, dt: number) => void;
}

export function buildContact(
  world: HyperWorld,
  at: GyroVector,
  yaw: number,
): ContactResult {
  const object = new HyperObject(at);
  object.rotation.y = yaw;

  // Converted here, not at module scope — see the note on AIM_RANGE_UNITS.
  const aimRange = units(AIM_RANGE_UNITS);
  const sinRho = Math.sin(units(AIM_RHO_UNITS));

  const tokens: Token[] = [];

  LINKS.forEach((def, i) => {
    const x = (i % 2 === 0 ? -1 : 1) * HALF_X;
    const y = CENTRE_Y + (i < 2 ? HALF_Y : -HALF_Y);

    const node = new Group();
    node.position.set(x, y, 0);
    object.add(node);

    // The blank: a struck disc with a raised rim, so the edge catches light
    // as it turns rather than going flat.
    const blank: BufferGeometry[] = [];
    const body = new CylinderGeometry(DISC_R, DISC_R, DISC_T, 32);
    body.rotateX(Math.PI / 2);
    blank.push(body.toNonIndexed());
    for (const s of [-1, 1]) {
      const rim = new CylinderGeometry(DISC_R, DISC_R - 0.03, 0.02, 32, 1, true);
      rim.rotateX(Math.PI / 2);
      rim.scale(1, 1, s);
      rim.translate(0, 0, s * DISC_T * 0.5);
      blank.push(rim.toNonIndexed());
    }
    object.addGeometry(
      world.shared,
      mergeGeometries(blank),
      { color: BRASS, ambient: 0.5 },
      node,
    );

    // The mark on both faces, so a turning token is never a blank sliver.
    // The back copy is rotated about Y rather than flipped, or it would read
    // mirrored for the half of the turn it faces you.
    const map = makeIconTexture(def.icon);
    const mats: HyperMaterial[] = [];
    for (const s of [1, -1]) {
      const glyph = new PlaneGeometry(0.4, 0.4, 2, 2);
      if (s < 0) glyph.rotateY(Math.PI);
      glyph.translate(0, 0, s * (DISC_T * 0.5 + 0.004));
      mats.push(
        ...object.addGeometry(
          world.shared,
          glyph,
          {
            map,
            color: BRASS,
            ambient: 0.62,
            alphaTest: 0.35,
            castShadow: false,
            receiveShadow: false,
          },
          node,
        ),
      );
    }

    tokens.push({
      def,
      node,
      mats,
      unitPos: new Vector3(),
      baseY: y,
      // Each on its own rhythm, so the four never look like one rigid object.
      spin: 0.5 + i * 0.11,
      bob: i * 1.7,
      aim: 0,
      opened: false,
    });
  });

  world.add(object);

  // Rest positions, resolved once. matrixWorld carries the object's yaw, which
  // is exactly the modelMatrix the shader will see — and neither the bob nor
  // the hover lift moves a token far enough to shift which one you are on.
  object.updateMatrixWorld(true);
  for (const token of tokens) {
    token.unitPos.setFromMatrixPosition(token.node.matrixWorld);
  }

  // ---------------- the prompt.
  const promptEl = document.createElement('div');
  promptEl.className = 'aim-prompt';
  document.body.append(promptEl);

  let hovered: Token | null = null;
  const repaintPrompt = () => {
    promptEl.textContent = hovered ? `${hovered.def.name} — ${t(PROMPT)}` : '';
    promptEl.style.opacity = hovered ? '1' : '0';
  };
  onLangChange(repaintPrompt);

  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyE' || e.repeat || !hovered) return;
    hovered.opened = true;
    openLink(hovered.def.href);
  });

  // ---------------- the aim test and the turn.
  const poincare = new Vector3();
  const point = new Vector3();
  const forward = new Vector3();
  const brand = new Color();
  let clock = 0;

  const tick = (worldGV: GyroVector, dt: number) => {
    clock += dt;

    const composed = object.localGV.add(worldGV);
    forward.set(0, 0, -1).applyQuaternion(world.camera.quaternion);

    let best: Token | null = null;
    let bestRatio = 1;

    for (const token of tokens) {
      unitToPoincare(poincare.copy(token.unitPos), object.useTanKHeight, poincare);
      composed.transformPoint(poincare, point);
      const d = geodesicRadius(point);
      if (d > aimRange) continue;

      // Half-angle subtended by a sphere of geodesic radius rho at geodesic
      // distance d. Spherical, so sin(d) — which correctly makes a thing past
      // the quarter turn look BIGGER, not smaller. The range gate means that
      // never comes up here, but the formula is the honest one either way.
      const half = Math.max(
        AIM_MIN,
        Math.asin(Math.min(1, sinRho / Math.max(1e-4, Math.sin(d)))),
      );

      const angle = Math.acos(
        Math.max(-1, Math.min(1, point.normalize().dot(forward))),
      );
      // Compared as a fraction of each token's own cone, so the one you are
      // most centred on wins rather than merely the nearest. Same rule the
      // proximity panel uses to pick between overlapping points of interest.
      const ratio = angle / half;
      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = token;
      }
    }

    if (best !== hovered) {
      hovered = best;
      repaintPrompt();
    }

    for (const token of tokens) {
      const want = token === hovered ? 1 : 0;
      token.aim += (want - token.aim) * Math.min(1, dt * 11);

      // Aiming nearly stops the turn, so the mark you are reading holds still.
      token.node.rotation.y += token.spin * (1 - 0.88 * token.aim) * dt;
      token.node.position.y = token.baseY + Math.sin(clock * 0.9 + token.bob) * 0.045;
      token.node.position.z = token.aim * LIFT;

      // An opened token keeps some of its colour. Opening a link throws you
      // into another tab, which is nearly invisible feedback from in here —
      // the retained tint is how you see, on coming back, what you took.
      const held = token.opened ? 0.45 : 0;
      const mix = Math.max(held, token.aim);
      for (const mat of token.mats) {
        mat.uniforms.uColor.value.set(BRASS).lerp(brand.set(token.def.brand), mix);
        mat.uniforms.uAmbient.value = 0.62 + 0.22 * token.aim;
      }
    }
  };

  return { object, tick };
}
