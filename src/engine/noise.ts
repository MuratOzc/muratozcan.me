import {
  Data3DTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RedFormat,
  RepeatWrapping,
  UnsignedByteType,
} from 'three';

export const NOISE_SIZE = 64;

let texture: Data3DTexture | null = null;

export function noiseTexture(): Data3DTexture {
  if (texture) return texture;

  const data = new Uint8Array(NOISE_SIZE ** 3);
  let s = 0x9e3779b9;
  for (let i = 0; i < data.length; i++) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    data[i] = (t ^ (t >>> 14)) >>> 24;
  }

  texture = new Data3DTexture(data, NOISE_SIZE, NOISE_SIZE, NOISE_SIZE);
  texture.format = RedFormat;
  texture.type = UnsignedByteType;
  texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}
