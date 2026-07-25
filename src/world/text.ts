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
