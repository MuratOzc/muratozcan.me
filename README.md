# muratozcan.me

A personal portfolio built inside a spherical (S³) world — a finite universe you
can walk all the way around.

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build
```

## Status

The curved-space engine works and is verified. The portfolio itself — content,
static routes, the conventional landing page — is not built yet.

## Engine

`src/engine/` is a TypeScript/WebGL2 port of the parts of
[HackerPoet/HyperEngine](https://github.com/HackerPoet/HyperEngine) (MIT) that a
site like this needs. HyperEngine is CodeParade's Unity backend for
*Hyperbolica*; it is not a library, so this is a port rather than a dependency.

Two ideas carry the whole thing:

**Möbius addition.** Positions live in the Poincaré ball as ordinary 3-vectors.
One formula composes them for every curvature, selected by `K ∈ {-1, 0, +1}`:

```
c = K(a × b)   d = 1 − K(a · b)   t = a + b
a ⊕ b = (t·d + c × t) / (d² + |c|²)
```

At `K = 0` it collapses exactly to `a + b`, so euclidean space is a true special
case rather than an approximation.

**Two-hemisphere rendering.** In spherical space the Poincaré radius runs to
infinity at the antipode, so no single projection covers the world. Every object
is drawn twice — the far pass inverts through the unit sphere — and the two
passes split the depth buffer between them by writing `gl_FragDepth` directly.
This is the piece that makes strong curvature work at all.

### Layout

```
src/engine/
  math/
    curvature.ts    K, unitScale, tanK/atanK
    mobius.ts       Möbius addition, gyration, distances
    coords.ts       Unit <-> Klein <-> Poincaré, up vector, translations
    gyrovector.ts   position + holonomy; the curved-space transform type
    selftest.ts     9 invariants, several ported from HyperEngine's own tests
  shaders/
    hyperCore.ts    vertex/fragment core, hemisphere passes, depth split
  HyperMaterial.ts  one material for K<=0, two for spherical
  HyperObject.ts    placement by GyroVector
  HyperWorld.ts     holds worldGV; the camera never leaves the origin
  Controls.ts       movement as Möbius translation
src/main.ts         demo world
```

### Things that will bite you

- **There is no camera.** `worldGV` is the inverse of the viewer's transform and
  the whole world moves around a stationary observer at the origin.
- **Scale is not free.** With `unitScale = 1`, one unit *is* one radian, and the
  entire universe is 2π across. Size everything against `EYE_HEIGHT`.
- **Holonomy is real.** Composing translations generates rotation. That is
  geometry, not float error — correct it with `alignUpVector()`, not by
  orthonormalising anything.
- **Culling must be off.** Three's frustum culling is euclidean and will discard
  geometry that is plainly visible. In spherical space distant objects are
  *large*, so distance-based LOD is backwards too.

## Licence

Engine derived from HyperEngine, MIT © CodeParade.
