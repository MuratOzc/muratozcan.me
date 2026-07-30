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
 * Break text to a width, at spaces where possible and mid-word where not.
 *
 * The mid-word fallback is the part that matters: without it a single token
 * wider than the box (a URL, a long German-ish compound, a Turkish word that
 * grew four suffixes) silently runs off the edge no matter how the caller
 * measures the result.
 */
function wrapToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';

  const flush = () => {
    if (line) lines.push(line);
    line = '';
  };

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const joined = line ? `${line} ${word}` : word;
    if (ctx.measureText(joined).width <= maxWidth) {
      line = joined;
      continue;
    }
    flush();
    if (ctx.measureText(word).width <= maxWidth) {
      line = word;
      continue;
    }
    // Too long to fit on a line of its own: break it by characters.
    for (const ch of word) {
      if (ctx.measureText(line + ch).width > maxWidth && line) flush();
      line += ch;
    }
  }
  flush();
  return lines;
}

interface FittedText {
  lines: string[];
  size: number;
  lineHeight: number;
}

/**
 * Largest font size at which `text` wraps into a box, and the wrap that goes
 * with it. Steps down until it fits and stops at `min` — so the box is the
 * constraint and the type gives way, never the other way round.
 */
function fitToBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: { width: number; height: number },
  font: string,
  max: number,
  min: number,
  lineRatio: number,
): FittedText {
  let fitted: FittedText | null = null;
  for (let size = max; size >= min; size -= 2) {
    ctx.font = font.replace('SIZE', String(size));
    const lines = wrapToWidth(ctx, text, box.width);
    const lineHeight = size * lineRatio;
    fitted = { lines, size, lineHeight };
    if (lines.length * lineHeight <= box.height) break;
  }
  // At `min` the wrap is still correct horizontally; only the height can have
  // run out, and clipping a line is better than clipping a letter.
  const f = fitted!;
  ctx.font = font.replace('SIZE', String(f.size));
  return f;
}

/**
 * An exhibition label: a number, a title, and a subtitle beneath.
 *
 * Drawn as one texture rather than three planes because a low sign read at an
 * angle wants the whole layout to foreshorten together.
 *
 * Nothing here is laid out at a fixed size. The title shrinks and wraps to the
 * column beside the number, the subtitle block starts wherever the title
 * actually ended, and both are measured against real boxes — so copy can be
 * rewritten in either language without a sentence sliding off the board. Note
 * that Turkish runs roughly 15% longer than English for the same sentence,
 * which is exactly how the old fixed-size version came apart.
 */
export function makeSignTexture(n: number, title: Localized, subtitle: Localized): Texture {
  return localizedCanvasTexture(1024, 384, (ctx, w, h) => {
    ctx.fillStyle = '#efece3';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c8c2b2';
    ctx.fillRect(0, h - 10, w, 10);

    const pad = 44;
    const MONO = 'ui-monospace, Consolas, monospace';

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    // Station number, set large and light in its own column.
    ctx.fillStyle = '#b3aa96';
    ctx.font = `700 132px ${MONO}`;
    ctx.letterSpacing = '0px';
    const num = String(n).padStart(2, '0');
    ctx.fillText(num, pad, 34);
    const textLeft = pad + ctx.measureText(num).width + 40;

    // Title: beside the number, so its box is the remaining width.
    const TITLE_TOP = 40;
    ctx.letterSpacing = '4px';
    const titleFit = fitToBox(
      ctx,
      // upper(), not toUpperCase(): Turkish dots its capitals differently.
      upper(t(title)),
      { width: w - textLeft - pad, height: 190 },
      `600 SIZEpx ${MONO}`,
      84,
      44,
      1.16,
    );
    ctx.fillStyle = '#20262c';
    titleFit.lines.forEach((l, i) => {
      ctx.fillText(l, textLeft, TITLE_TOP + i * titleFit.lineHeight);
    });

    // Subtitle: full width, starting below wherever the title ended.
    const subTop = Math.max(
      178,
      TITLE_TOP + titleFit.lines.length * titleFit.lineHeight + 26,
    );
    ctx.letterSpacing = '0px';
    const subFit = fitToBox(
      ctx,
      t(subtitle),
      { width: w - pad * 2, height: h - 26 - subTop },
      `400 SIZEpx ${MONO}`,
      46,
      24,
      1.34,
    );
    ctx.fillStyle = '#66707a';
    subFit.lines.forEach((l, i) => {
      ctx.fillText(l, pad, subTop + i * subFit.lineHeight);
    });
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
