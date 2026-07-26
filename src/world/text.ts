import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { onLangChange, t, upper, type Localized } from '../content/i18n';

/**
 * A canvas texture that repaints itself when the language changes.
 *
 * All in-world text goes through canvases, so localisation is not "swap a
 * string" — it is "repaint the texture". Everything localized funnels through
 * here: paint runs once now and again on every language switch.
 */
export function localizedCanvasTexture(
  width: number,
  height: number,
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  // Mipmapped, so text stays legible (rather than shimmering away) at the
  // distances this world routinely shows things from.
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 8;

  const repaint = () => {
    paint(ctx, width, height);
    tex.needsUpdate = true;
  };
  repaint();
  onLangChange(repaint);
  return tex;
}

export interface TextTextureOptions {
  /** Pixels. Higher for signs you get close to. */
  width?: number;
  height?: number;
  font?: string;
  color?: string;
  background?: string | null;
  letterSpacing?: number;
  padding?: number;
}

/**
 * Render text to a texture.
 *
 * In-world text is awkward here for a reason worth knowing: a sign near the
 * antipode is magnified enormously, so any fixed resolution eventually shows.
 * A canvas texture with generous resolution and a cutout alpha handles signage
 * fine. Real 3D text geometry would stay sharp at any scale, but every glyph
 * edge then has to be tessellated to survive the curved projection.
 */
/**
 * A forward chevron, for painting direction onto the path.
 *
 * Cutout alpha, so the background is transparent and the arrow sits on the
 * slab without a visible plate around it.
 */
export function makeArrowTexture(color = '#5c6b52'): Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = color;

  // Two stacked chevrons read as direction more clearly than one arrow, and
  // stay legible when foreshortened almost to nothing down the path.
  const chevron = (yTop: number, h: number) => {
    const w = size * 0.62;
    const x0 = (size - w) / 2;
    const t = h * 0.42;
    ctx.beginPath();
    ctx.moveTo(x0, yTop + h);
    ctx.lineTo(size / 2, yTop);
    ctx.lineTo(x0 + w, yTop + h);
    ctx.lineTo(x0 + w, yTop + h + t);
    ctx.lineTo(size / 2, yTop + t);
    ctx.lineTo(x0, yTop + h + t);
    ctx.closePath();
    ctx.fill();
  };
  chevron(size * 0.16, size * 0.26);
  chevron(size * 0.52, size * 0.26);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 8;
  return tex;
}

/**
 * An exhibition label: a number, a title, and a subtitle beneath.
 *
 * Drawn as one texture rather than three planes because a low sign read at an
 * angle wants the whole layout to foreshorten together.
 */
export function makeSignTexture(n: number, title: Localized, subtitle: Localized): Texture {
  return localizedCanvasTexture(1024, 384, (ctx, w, h) => {
    ctx.fillStyle = '#efece3';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c8c2b2';
    ctx.fillRect(0, h - 10, w, 10);

    const pad = 44;

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // Station number, set large and light in the corner.
    ctx.fillStyle = '#b3aa96';
    ctx.font = '700 132px ui-monospace, Consolas, monospace';
    const num = String(n).padStart(2, '0');
    ctx.fillText(num, pad, 148);
    const numWidth = ctx.measureText(num).width;

    const textLeft = pad + numWidth + 40;

    ctx.fillStyle = '#20262c';
    ctx.font = '600 84px ui-monospace, Consolas, monospace';
    ctx.letterSpacing = '4px';
    // upper(), not toUpperCase(): Turkish dots its capitals differently.
    ctx.fillText(upper(t(title)), textLeft, 140);

    ctx.letterSpacing = '0px';
    ctx.fillStyle = '#66707a';
    ctx.font = '400 46px ui-monospace, Consolas, monospace';
    // Wrap the subtitle across up to two lines.
    const words = t(subtitle).split(' ');
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > w - pad * 2 && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, pad, 246 + i * 62));
  });
}

/** A localized single line of text, shrink-to-fit, repainted on language change. */
export function makeLocalizedTextTexture(text: Localized, opts: TextTextureOptions = {}): Texture {
  const width = opts.width ?? 1024;
  const height = opts.height ?? 256;
  const padding = opts.padding ?? 24;

  return localizedCanvasTexture(width, height, (ctx, w, h) => {
    if (opts.background) {
      ctx.fillStyle = opts.background;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.clearRect(0, 0, w, h);
    }

    ctx.fillStyle = opts.color ?? '#1d2228';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (opts.letterSpacing !== undefined) {
      ctx.letterSpacing = `${opts.letterSpacing}px`;
    }

    const line = t(text);
    // Shrink to fit rather than clipping.
    let size = h - padding * 2;
    const family = opts.font ?? '600 SIZEpx ui-monospace, Consolas, monospace';
    do {
      ctx.font = family.replace('SIZE', String(size));
      if (ctx.measureText(line).width <= w - padding * 2) break;
      size -= 4;
    } while (size > 8);

    ctx.fillText(line, w / 2, h / 2);
  });
}

export function makeTextTexture(text: string, opts: TextTextureOptions = {}): Texture {
  const width = opts.width ?? 1024;
  const height = opts.height ?? 256;
  const padding = opts.padding ?? 24;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  ctx.fillStyle = opts.color ?? '#1d2228';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (opts.letterSpacing !== undefined) {
    ctx.letterSpacing = `${opts.letterSpacing}px`;
  }

  // Shrink to fit rather than clipping.
  let size = height - padding * 2;
  const family = opts.font ?? '600 SIZEpx ui-monospace, Consolas, monospace';
  do {
    ctx.font = family.replace('SIZE', String(size));
    if (ctx.measureText(text).width <= width - padding * 2) break;
    size -= 4;
  } while (size > 8);

  ctx.fillText(text, width / 2, height / 2);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 8;
  return tex;
}
