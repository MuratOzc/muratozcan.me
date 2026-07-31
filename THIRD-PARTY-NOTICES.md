# Third-party notices

## HyperEngine

`src/engine/` is a TypeScript/WebGL2 port of parts of
[HackerPoet/HyperEngine](https://github.com/HackerPoet/HyperEngine) — CodeParade's
Unity curved-space backend for *Hyperbolica*. The Möbius addition, coordinate
conversions, gyrovector transform, two-hemisphere rendering scheme, and several
of the self-test invariants in `src/engine/math/selftest.ts` follow it directly.

```
MIT License

Copyright (c) 2022 HackerPoet

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## three.js

Not vendored here — it is an npm dependency — but it is bundled into the
production build. three.js is MIT © 2010–2026 three.js authors; the full text
ships in `node_modules/three/LICENSE`.

## Vendor marks

`public/images/w11.webp` and `public/images/debian.webp` reproduce the Windows
and Debian logos to label the machines on the infrastructure rack. Those marks
belong to Microsoft and to the Debian Project respectively, and are used here
descriptively. Neither endorses this site.
