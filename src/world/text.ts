import { CanvasTexture, LinearFilter, SRGBColorSpace, type Texture } from 'three';

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
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 8;
  return tex;
}
