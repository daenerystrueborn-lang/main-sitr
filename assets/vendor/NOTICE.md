# Vendored motion libraries

These files are checked in on purpose so the site has **no runtime CDN
dependency**: a blocked request to a CDN used to take the whole motion layer
down with it, and the site still has to work on a slow phone link.

| Path | Package | Version | Licence | Upstream |
| --- | --- | --- | --- | --- |
| `gsap/gsap.min.js` | [gsap](https://www.npmjs.com/package/gsap) | 3.15.0 | GSAP Standard "No Charge" licence | https://github.com/greensock/gsap |
| `gsap/ScrollTrigger.min.js` | gsap | 3.15.0 | same | same |
| `gsap/SplitText.min.js` | gsap | 3.15.0 | same | same |
| `lenis/lenis.mjs` | [lenis](https://www.npmjs.com/package/lenis) | 1.3.27 | MIT | https://github.com/darkroomengineering/lenis |

GSAP 3.13+ ships its former "Club" plugins under the free standard licence,
which is why SplitText can be vendored here alongside the free core. Only the
files the site actually loads are checked in — add a row when one is added.

## How they are loaded

`gsap.min.js` and the plugins are **classic** scripts, declared with `defer` in
`index.html`, in dependency order. They register themselves as globals
(`window.gsap`, `window.ScrollTrigger`, …), because the GSAP dist builds are
UMD and have no ES `export`. Module scripts are deferred too, so the
`assets/js/fx.js` module that consumes them always runs afterwards.

Lenis is a real ES module and is imported directly:

```js
import Lenis from '../vendor/lenis/lenis.mjs'
```

## Updating

```sh
npm pack gsap@<version> lenis@<version>
tar xzf gsap-<version>.tgz
cp package/dist/{gsap,ScrollTrigger,SplitText}.min.js assets/vendor/gsap/
cp package/dist/lenis.mjs assets/vendor/lenis/lenis.mjs
```

Then bump the table above.
