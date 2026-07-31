# muratozcan.me

This is a personal site. The world is a 3-sphere (S³). The space is finite. You
can walk around the world completely and return to the start point.

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build
```

The site puts you on a path. Ten stations stand along the path. The stations
alternate between the left side and the right side. Each station shows one part
of the work. Because the space is closed, a long walk in a straight line returns
you to the start point.

The site supports English and Turkish. You can use a keyboard and a mouse. On a
touch screen, you can use twin-stick controls.

## Engine

`src/engine/` is a TypeScript and WebGL2 port of
[HackerPoet/HyperEngine](https://github.com/HackerPoet/HyperEngine) (MIT). The
port contains only the parts that this site needs. HyperEngine is the Unity
curved-space backend of CodeParade for *Hyperbolica*. HyperEngine is not a
library. Therefore this code is a port and not a dependency.

Two ideas control the design.

**Möbius addition.** Positions are ordinary 3-vectors in the Poincaré ball. One
formula composes two positions for each curvature. The value `K ∈ {-1, 0, +1}`
selects the curvature.

```
c = K(a × b)   d = 1 − K(a · b)   t = a + b
a ⊕ b = (t·d + c × t) / (d² + |c|²)
```

At `K = 0` the formula becomes exactly `a + b`. Therefore euclidean space is a
true special case and not an approximation.

**Two-hemisphere rendering.** In spherical space, the Poincaré radius increases
to infinity at the antipode. Therefore one projection cannot cover the world.
The engine draws each object two times. The far pass inverts the object through
the unit sphere. The two passes divide the depth buffer between them and write
`gl_FragDepth` directly. This method makes strong curvature possible.

### Layout

```
src/engine/
  math/
    curvature.ts    K, unitScale, tanK/atanK
    mobius.ts       Möbius addition, gyration, distances
    coords.ts       Unit <-> Klein <-> Poincaré, up vector, translations
    gyrovector.ts   position and holonomy, the curved-space transform type
    selftest.ts     9 invariants, several ported from the HyperEngine tests
  shaders/
    hyperCore.ts    vertex/fragment core, hemisphere passes, depth split
  HyperMaterial.ts  one material for K<=0, two for spherical
  HyperObject.ts    placement by GyroVector
  HyperWorld.ts     holds worldGV, the camera stays at the origin
  Controls.ts       movement as Möbius translation
src/main.ts         demo world
```

### Important constraints

- **There is no camera.** `worldGV` is the inverse of the transform of the
  viewer. The world moves around a fixed observer at the origin.
- **Scale is not free.** At `unitScale = 1`, one unit is one radian. The full
  universe is 2π across. Set every size against `EYE_HEIGHT`.
- **Holonomy is real.** A composition of translations makes a rotation. This is
  geometry and not a float error. Correct it with `alignUpVector()`. Do not
  orthonormalize the matrix.
- **Culling must stay off.** The frustum culling in three.js is euclidean. It
  discards geometry that the user can see. In spherical space, distant objects
  are large. Therefore distance-based LOD is also incorrect.

## License

The code uses the MIT license. The site content does not use the MIT license.
This content includes the text in `src/content/` and the images in
`public/images/`. Refer to [LICENSE](LICENSE) for the conditions. The engine
derives from HyperEngine, MIT © HackerPoet. Refer to
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for the notices.
