const RAYS: Array<[number, number, number]> = [];
for (let x = -1; x <= 1; x++) {
  for (let y = -1; y <= 1; y++) {
    for (let z = -1; z <= 1; z++) {
      const length = Math.hypot(x, y, z);
      if (length > 0) RAYS.push([x / length, y / length, z / length]);
    }
  }
}

export function* crevices(
  position: Float32Array,
  normal: Float32Array,
  index: ArrayLike<number>,
  unshaded?: Uint8Array,
): Generator<void, Float32Array | null> {
  const count = position.length / 3;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < position.length; i++) {
    const c = i % 3;
    if (position[i] < min[c]) min[c] = position[i];
    if (position[i] > max[c]) max[c] = position[i];
  }
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  if (!(extent > 0)) return null;

  const cell = Math.max(extent / 110, 0.012);
  const pad = 2;
  const size = [0, 1, 2].map((c) => Math.ceil((max[c] - min[c]) / cell) + 2 * pad + 1);
  const grid = new Uint8Array(size[0] * size[1] * size[2]);
  const slot = (x: number, y: number, z: number): number => {
    const i = Math.floor((x - min[0]) / cell) + pad;
    const j = Math.floor((y - min[1]) / cell) + pad;
    const k = Math.floor((z - min[2]) / cell) + pad;
    if (i < 0 || j < 0 || k < 0 || i >= size[0] || j >= size[1] || k >= size[2]) return -1;
    return (k * size[1] + j) * size[0] + i;
  };
  yield;

  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3;
    const b = index[t + 1] * 3;
    const c = index[t + 2] * 3;
    const longest = Math.max(
      Math.hypot(position[a] - position[b], position[a + 1] - position[b + 1], position[a + 2] - position[b + 2]),
      Math.hypot(position[b] - position[c], position[b + 1] - position[c + 1], position[b + 2] - position[c + 2]),
      Math.hypot(position[c] - position[a], position[c + 1] - position[a + 1], position[c + 2] - position[a + 2]),
    );
    const n = Math.min(48, Math.max(1, Math.ceil(longest / (cell * 0.6))));
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n - i; j++) {
        const u = i / n;
        const w = j / n;
        const s = slot(
          position[a] + (position[b] - position[a]) * u + (position[c] - position[a]) * w,
          position[a + 1] + (position[b + 1] - position[a + 1]) * u + (position[c + 1] - position[a + 1]) * w,
          position[a + 2] + (position[b + 2] - position[a + 2]) * u + (position[c + 2] - position[a + 2]) * w,
        );
        if (s >= 0) grid[s] = 1;
      }
    }
    if (n > 8 || t % 96 === 0) yield;
  }

  // A cell holding a surface reaches up to √3 cells off it: rays that start nearer make the surface shade itself.
  const LIFT = 1.75;
  const REACH = [1.2, 2.6, 4.2, 6];
  const WEIGHT = [1, 0.75, 0.5, 0.3];
  const open = new Float32Array(count).fill(1);
  for (let v = 0; v < count; v++) {
    if (unshaded?.[v]) continue;
    const nx = normal[v * 3];
    const ny = normal[v * 3 + 1];
    const nz = normal[v * 3 + 2];
    const x = position[v * 3] + nx * cell * LIFT;
    const y = position[v * 3 + 1] + ny * cell * LIFT;
    const z = position[v * 3 + 2] + nz * cell * LIFT;
    let rays = 0;
    let blocked = 0;
    for (const [dx, dy, dz] of RAYS) {
      if (dx * nx + dy * ny + dz * nz < 0.25) continue;
      rays++;
      for (let r = 0; r < REACH.length; r++) {
        const s = slot(x + dx * REACH[r] * cell, y + dy * REACH[r] * cell, z + dz * REACH[r] * cell);
        if (s >= 0 && grid[s]) {
          blocked += WEIGHT[r];
          break;
        }
      }
    }
    if (rays > 0) open[v] = 1 - 0.55 * (blocked / rays);
    if (v % 32 === 31) yield;
  }

  return open;
}
