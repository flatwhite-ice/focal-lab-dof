# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Focal Lab is a **camera format converter** for photographers: given any film/sensor format + focal length + aperture, it computes the **135 full-frame (36×24mm) equivalent** angle of view and equivalent aperture (depth-of-field equivalence), plus real depth of field — all in real time. (e.g. 6×12 @ 58mm f/5.6 → equiv 20mm f/1.9 FF.)

This is a **no-build, pure static web app** (HTML/CSS/JS, no package.json, no dependencies). It is deployed to GitHub Pages at the **repo root** (`.nojekyll` keeps `shared/` and `src/` served verbatim). Note: the GitHub repo is named `focal-lab-dof` even though the local dir is `focal-lab`.

## Running & verifying

A local server is required (the app uses `fetch`/module loads). From the **repo root**:
```bash
python3 -m http.server 8000   # → http://127.0.0.1:8000/
```

There is **no test runner**. The conversion engine is verified two ways:
- **Engine spot-checks** — `convert.js` exports via `module.exports`, so it runs under Node with no DOM:
  ```bash
  node -e "const C=require('./src/convert.js'); console.log(C.cropFactor({w:56,h:112}), C.equivFocal(58,{w:56,h:112}))"
  # crop 0.346, equiv ≈ 20.0mm  (the canonical 6×12 / 58mm anchor)
  ```
  Other anchors (see SPEC.md §3): FF 50mm → crop 1.00, APS-C → 1.53, 645 → 0.62, 8×10 → 0.14; FF 50mm f/8 @3m → hyperfocal 10.9m, near 2.36m, far 4.12m.
- **DOM wiring** — load `index.html` + `src/*` under jsdom and assert result element text.

When changing the conversion math or format data, re-run the relevant anchors above — they are the regression suite.

## Architecture

Three globals are loaded in order by `index.html` and wired together; there is no module bundler, so each `src/*.js` attaches to `window`:

- **`src/convert.js`** → `window.Convert` (also `module.exports`). The math engine: **pure functions, zero DOM/global dependencies**, which is what makes Node spot-checks possible. Keep it that way — no DOM or `window` access here.
- **`src/formats.js`** → `window.FORMATS` + `window.FORMAT_NOTES`. The format datasheet (~87 entries: large/medium-format film, medium-format digital backs, APS, 1-inch, every iPhone). Each entry is `{ id, name, w, h, note?, est?, focal?, fnumber?, equiv?, ref? }` where **`w,h` (exposed image area in mm) is the single source of truth** for all calculations. Entries with native `focal/fnumber/equiv` (phones) auto-prefill the inputs on selection. `est:true` marks estimated (not measured) dimensions.
- **`src/app.js`** → UI wiring. Listens to input/slider events, calls `Convert.*`, updates DOM + the combined format/AOV SVG (`drawViz`). The two hero values (equiv focal, equiv aperture) animate with a count-up tween + pulse (`setStat`/`pulse`); everything else updates instantly. Respects `prefers-reduced-motion`.

**`shared/`** (`style.css`, `theme.js`, `nav.js`) is **vendored** from the photologs site for self-containment — there is no external dependency. If the upstream originals change, sync manually. `nav.js` is configured via `data-` attributes on its `<script>` tag in `index.html`.

## Key conventions

- **Crop factor is diagonal-based**: `crop = 43.267 / formatDiag`; equivalent focal and aperture both multiply by it. This means equivalence is exact on the diagonal, not for differing aspect ratios — the UI compensates by also showing long/short-edge AOV separately.
- **Circle of confusion is fixed** at `formatDiag / 1500` (not user-configurable yet).
- Depth-of-field uses the textbook exact formulas (see `dof()` in `convert.js` and SPEC.md §3). Distances are in **meters**, everything else in **mm**.
- iPhone entries have no published sensor dimensions: `w,h` are **back-derived from the published 35mm-equivalent + real focal length** (crop = equiv/focal, then 4:3 assumed). Treat them as approximate.

## Source of truth for design intent

**SPEC.md** is the authoritative spec — conversion math (§3), datasheet methodology (§4), UI behavior (§5), known limitations (§6), and the roadmap/backlog (§7). Consult it before changing formulas, format data, or the responsive/mobile-sheet UI behavior. SPEC.md and README.md are written in **Korean**; the UI is Korean.
