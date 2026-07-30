import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
  type Texture,
} from 'three';

/**
 * Brand marks, engraved.
 *
 * Every mark is drawn on a 24x24 grid — the SVG viewBox convention — and
 * rasterised here rather than loaded from a file. Two of them are Simple Icons
 * path data (CC0), inlined as strings; two are drawn with primitives because
 * they are simple enough that a path would be the harder thing to verify.
 * LinkedIn is drawn rather than inlined because Simple Icons no longer ships
 * it. The trademarks belong to their owners; these are single-colour
 * renderings used to link to my own profiles, which is what the brand
 * guidelines contemplate.
 *
 * The output is a GREYSCALE cutout, not a coloured icon. The hyper shader
 * multiplies the sampled texel by uColor, so one texture serves both states:
 * tinted brass at rest, tinted to the brand colour when the crosshair is on
 * it. Painting the colour into the texture would need two textures per mark
 * and would not blend.
 *
 * The engraved look is three passes of the same mask — a dark fringe above,
 * a light fringe below, the face on top. Faking it in the canvas is not a
 * shortcut taken for speed: real relief here would be a cutout plane a few
 * millimetres proud of its backing, which is exactly the sliver the shadow map
 * cannot resolve (see the note on receiveShadow in HyperMaterial.ts). The
 * fake survives the curved projection; the real one grows a dark blot.
 */

/** Simple Icons, CC0. 24x24 viewBox, nonzero fill. */
const GITHUB_PATH =
  'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12';

const INSTAGRAM_PATH =
  'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077';

export type IconName = 'email' | 'linkedin' | 'github' | 'instagram';

/** Draw the mark solid, in the 24x24 grid. Alpha is all that is read. */
type Draw = (ctx: CanvasRenderingContext2D) => void;

const fillPath: (d: string) => Draw = (d) => (ctx) => ctx.fill(new Path2D(d));

/**
 * A plain envelope. Deliberately generic: the address is a Gmail one, but
 * Gmail's envelope is Google's mark and putting it here would say "Google"
 * rather than "write to me".
 */
const drawEmail: Draw = (ctx) => {
  ctx.beginPath();
  ctx.roundRect(1.2, 4.6, 21.6, 14.8, 2.4);
  ctx.fill();
  // The flap, cut out rather than drawn over, so the groove reads at any tint.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineWidth = 1.7;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(3.5, 6.7);
  ctx.lineTo(12, 13.4);
  ctx.lineTo(20.5, 6.7);
  ctx.stroke();
};

/**
 * The LinkedIn tile: a rounded square with "in" knocked out.
 *
 * The n's shoulder is a half-annulus rather than a rounded rectangle — a
 * roundRect gives a squared-off shoulder that reads as a lowercase "h".
 * Knockouts are composited rather than filled with the even-odd rule, because
 * the stems overlap the shoulder and even-odd would cancel the overlaps back
 * into solid.
 */
const drawLinkedin: Draw = (ctx) => {
  ctx.beginPath();
  ctx.roundRect(0.8, 0.8, 22.4, 22.4, 2.8);
  ctx.fill();

  ctx.globalCompositeOperation = 'destination-out';

  ctx.fillRect(4.7, 9.3, 3.1, 10.2);
  ctx.beginPath();
  ctx.arc(6.25, 5.9, 1.95, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillRect(9.7, 9.3, 3.1, 10.2);
  ctx.fillRect(16.4, 13.6, 3.1, 5.9);
  ctx.beginPath();
  ctx.arc(14.6, 13.6, 4.95, Math.PI, 0);
  ctx.lineTo(16.4, 13.6);
  ctx.arc(14.6, 13.6, 1.75, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();
};

const MARKS: Record<IconName, Draw> = {
  email: drawEmail,
  linkedin: drawLinkedin,
  github: fillPath(GITHUB_PATH),
  instagram: fillPath(INSTAGRAM_PATH),
};

function scratch(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')!];
}

/** The mark as solid white on transparent, inset to leave a margin. */
function markMask(name: IconName, size: number, inset: number): HTMLCanvasElement {
  const [canvas, ctx] = scratch(size);
  const s = (size * (1 - inset * 2)) / 24;
  ctx.setTransform(s, 0, 0, s, size * inset, size * inset);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  MARKS[name](ctx);
  return canvas;
}

/** The mask, recoloured. `source-in` keeps the mask's alpha and nothing else. */
function tint(mask: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const [canvas, ctx] = scratch(mask.width);
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, mask.width, mask.height);
  return canvas;
}

export interface IconTextureOptions {
  size?: number;
  /** Margin around the mark, as a fraction of the texture. */
  inset?: number;
  /** Bevel offset in pixels. Scales with `size`, so it is set at 256. */
  relief?: number;
}

/**
 * An engraved mark, greyscale, on transparent. Use with alphaTest and let
 * uColor carry the state.
 */
export function makeIconTexture(name: IconName, opts: IconTextureOptions = {}): Texture {
  const size = opts.size ?? 256;
  const inset = opts.inset ?? 0.12;
  const relief = (opts.relief ?? 3) * (size / 256);

  const mask = markMask(name, size, inset);
  const [canvas, ctx] = scratch(size);

  // Light from below, shadow above: that is what a groove looks like under
  // this world's light, which comes from overhead. Swap them and the mark
  // reads as raised instead.
  ctx.drawImage(tint(mask, '#ffffff'), 0, relief);
  ctx.drawImage(tint(mask, '#3d3d3d'), 0, -relief);
  ctx.drawImage(tint(mask, '#c4c4c4'), 0, 0);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 8;
  return tex;
}
