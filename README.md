# Strangest Stars

A revival of the original **Strangest Stars** procedural landscape generator.

The original generator is a Tracery grammar that emits SVG directly. The new site keeps that grammar in `grammar.json` and wraps it in a small static web app suitable for GitHub Pages.

## Current features

- Original 1024×512 SVG composition.
- Deterministic seeds.
- SVG download.
- PNG download at 2×, 4×, 6×, or 8×.
- Optional sun occlusion: suns are rendered before mountains so foreground mountains naturally cover them.
- No server/backend required.

## Run

Because the page fetches `grammar.json`, serve the folder over HTTP rather than opening `index.html` directly. For example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

This is a plain static site. Put the files in a repository and configure GitHub Pages to publish the repository root, or use a Pages Actions workflow.

## Next ideas

- Stars / moons / comets.
- Rare Easter eggs.
- Curated palettes.
- Playmat/export presets.
- Shareable seed URLs.
- Better scene/layer logic.
