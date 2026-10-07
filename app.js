let sourceGrammar = null;
let currentSvg = '';
let currentSeed = null;

//app.js v13 07-OCT-2026 17:44

const $ = id => document.getElementById(id);

function setStatus(message) { $('status').textContent = message; }

// Small deterministic RNG. Tracery supports injecting its own RNG.
function splitmix32(seed) {
  return function () {
    seed |= 0;
    seed = seed + 0x9e3779b9 | 0;
    let t = seed ^ seed >>> 16;
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ t >>> 15) >>> 0) / 4294967296;
  };
}

function randomSeed() {
  return Math.floor(Math.random() * 0xffffffff).toString(10);
}

function numericSeed(value) {
  if (!value.trim()) return Math.floor(Math.random() * 0xffffffff) >>> 0;
  let n = Number(value);
  if (Number.isFinite(n)) return (n >>> 0);
  // Stable string-to-seed fallback.
  let h = 2166136261;
  for (const ch of value) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

async function loadGrammar() {
  const response = await fetch('grammar.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Grammar load failed: ${response.status}`);
  sourceGrammar = await response.json();
}

// The original project used Tracery. GitHub Pages should not depend on a
// third-party CDN being reachable, so this small embedded expander implements
// the subset of Tracery syntax used by the Strangest Stars grammar:
//   #symbol#          expand a rule
//   [name:value]      assign a local rule variable
//   \#                 literal # (used by SVG url(#id) values)
// This keeps the original grammar JSON intact while making the site fully
// self-contained.
function makeGrammar(seed, occlude) {
  const grammarData = structuredClone(sourceGrammar);
  let mountainMask = null;
  if (occlude) {
    // Original: bg -> mountains -> clouds -> suns.
    // New:      bg -> suns -> mountains -> clouds.
    grammarData.origin2 = ['#preface# #defs# #bg# #sun# #sun# #mountains# #clouds# #ending#'];
  }

  const rng = splitmix32(seed);

  function choose(symbol, state, depth) {
    if (depth > 200) throw new Error('Grammar expansion exceeded the safety limit.');
    if (Object.prototype.hasOwnProperty.call(state, symbol)) {
      return expandText(String(state[symbol]), state, depth + 1);
    }
    let rules = grammarData[symbol];
    if (typeof rules === 'string') rules = [rules];
    if (!Array.isArray(rules) || rules.length === 0) {
      throw new Error(`Unknown grammar symbol: ${symbol}`);
    }
    const rule = rules[Math.floor(rng() * rules.length)];
    if (occlude && symbol === 'mountains') {
      const masks = [...String(rule).matchAll(/mask="url\(#(overlay\d+)\)"/g)];
      if (masks.length) mountainMask = masks[masks.length - 1][1];
    }
    return expandText(String(rule), { ...state }, depth + 1);
  }

  function readBracket(text, start) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\\' && text[i + 1] === ']') { i++; continue; }
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) return [text.slice(start + 1, i), i + 1];
      }
    }
    return null;
  }

  function expandText(text, state, depth) {
    let out = '';
    for (let i = 0; i < text.length;) {
      if (text[i] === '\\' && text[i + 1] === '#') {
        out += '#';
        i += 2;
        continue;
      }

      if (text[i] === '[') {
        const bracket = readBracket(text, i);
        if (bracket) {
          const [contents, next] = bracket;
          const colon = contents.indexOf(':');
          if (colon > 0) {
            const key = contents.slice(0, colon).trim();
            const value = contents.slice(colon + 1);
            state[key] = expandText(value, state, depth + 1);
            i = next;
            continue;
          }
        }
      }

      if (text[i] === '#') {
        const end = text.indexOf('#', i + 1);
        if (end !== -1) {
          const symbol = text.slice(i + 1, end);
          out += choose(symbol, state, depth + 1);
          i = end + 1;
          continue;
        }
      }

      out += text[i++];
    }
    return out;
  }

  return {
    flatten: expression => choose(expression.replace(/^#|#$/g, ''), {}, 0),
    getMountainMask: () => mountainMask
  };
}

function addStars(svg, rng) {
  // Experimental star field: zero or one field, independent of the grammar RNG.
  if (rng() >= 0.35) return svg;

  const count = Math.floor(rng() * 36) + 5;
  const colors = ['white', 'grey', 'cyan', 'yellow', 'purple', 'orange', 'red', 'blue'];
  const stars = [];

  for (let i = 0; i < count; i++) {
    const cx = Math.floor(rng() * 1024);
    const cy = Math.floor(rng() * 300);
    const radius = (rng() * 1.6 + 0.4).toFixed(1);
    const fill = colors[Math.floor(rng() * colors.length)];
    const opacity = (rng() * 0.45 + 0.35).toFixed(2);
    stars.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" opacity="${opacity}"/>`);
  }

  const starField = `<g data-celestial-body="stars" mask="url(#sunOcclusion)">${stars.join('')}</g>`;
  const firstSun = svg.indexOf('<circle ');
  if (firstSun >= 0) {
    return svg.slice(0, firstSun) + starField + svg.slice(firstSun);
  }
  return svg.replace('</svg>', `${starField}</svg>`);
}

function addMoon(svg, rng) {
  // Small first-pass celestial-body experiment: zero or one moon.
  // Keep it deliberately independent of the original grammar.
  if (rng() >= 0.35) return svg;

  const cx = Math.floor(rng() * 1000 + 12);
  const cy = Math.floor(rng() * 220 + 20);
  const radius = Math.floor(rng() * 45 + 15);
  const colors = ['white', 'grey', 'black', 'cyan', 'yellow', 'purple', 'orange', 'red', 'blue'];
  const fill = colors[Math.floor(rng() * colors.length)];
  const opacity = (rng() * 0.12 + 0.08).toFixed(2);

  const moon = `<g data-celestial-body="moon" mask="url(#sunOcclusion)"><circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" opacity="${opacity}"/></g>`;

  return svg.replace('</svg>', `${moon}</svg>`);
}

function addRingedPlanet(svg, rng) {
  // First-pass ringed planet: zero or one, independent of the grammar RNG.
  if (rng() >= 0.18) return svg;

  const cx = Math.floor(rng() * 900 + 60);
  const cy = Math.floor(rng() * 190 + 35);
  const radius = Math.floor(rng() * 28 + 18);
  const colors = ['white', 'grey', 'black', 'cyan', 'yellow', 'purple', 'orange', 'red', 'blue'];
  const planetColor = colors[Math.floor(rng() * colors.length)];
  const ringColor = colors[Math.floor(rng() * colors.length)];
  const opacity = (rng() * 0.14 + 0.08).toFixed(2);
  const ringOpacity = (rng() * 0.12 + 0.08).toFixed(2);
  const rx = Math.floor(radius * (1.7 + rng() * 0.9));
  const ry = Math.floor(radius * (0.28 + rng() * 0.18));
  const rotation = Math.floor(rng() * 160 - 80);

  // Split the ring into back and front halves so the planet sits between them.
  // The two arcs use the same ellipse geometry and rotation; only their sweep
  // direction differs, giving the ring a clear depth relationship with the planet.
  const strokeWidth = Math.max(2, Math.floor(radius * 0.10));
  const left = cx - rx;
  const right = cx + rx;
  const ringBack = `<path d="M ${left} ${cy} A ${rx} ${ry} 0 0 0 ${right} ${cy}"
      fill="none" stroke="${ringColor}" stroke-width="${strokeWidth}"
      opacity="${ringOpacity}" transform="rotate(${rotation} ${cx} ${cy})"/>`;
  const ringFront = `<path d="M ${left} ${cy} A ${rx} ${ry} 0 0 1 ${right} ${cy}"
      fill="none" stroke="${ringColor}" stroke-width="${strokeWidth}"
      opacity="${ringOpacity}" transform="rotate(${rotation} ${cx} ${cy})"/>`;

  const planet = `
    <g data-celestial-body="ringed-planet" mask="url(#sunOcclusion)" opacity="${opacity}">
      ${ringBack}
      <circle data-celestial-silhouette="true" cx="${cx}" cy="${cy}" r="${radius}" fill="${planetColor}"/>
      ${ringFront}
    </g>`;

  return svg.replace('</svg>', `${planet}</svg>`);
}

// Give every celestial body a depth order without changing its appearance.
// Later bodies are in front. Earlier bodies are masked wherever a later body
// overlaps them, preventing translucent bodies from compositing like a Venn
// diagram. The ringed planet's solid planet disk is its occluding silhouette;
// its decorative ring is not treated as solid.
function applyCelestialOverlapOcclusion(svg) {
  const circleRe = /<circle\s+mask="url\(#sunOcclusion\)"\s+([^>]*?)(?:\s*\/)>/g;
  const bodies = [];
  let match;
  while ((match = circleRe.exec(svg)) !== null) {
    const attrs = match[1];
    const cx = attrs.match(/\bcx="([^"]+)"/);
    const cy = attrs.match(/\bcy="([^"]+)"/);
    const r = attrs.match(/\br="([^"]+)"/);
    if (cx && cy && r) {
      bodies.push({ type: 'circle', cx: cx[1], cy: cy[1], r: r[1], start: match.index, end: circleRe.lastIndex });
    }
  }

  // Moon and ringed-planet circles are nested in their own tagged groups, so
  // the plain sun-circle regex above intentionally only catches the original
  // grammar suns. Find tagged bodies separately in document order.
  const taggedRe = /<g\s+data-celestial-body="([^"]+)"[^>]*>([\s\S]*?)<\/g>/g;
  const tagged = [];
  while ((match = taggedRe.exec(svg)) !== null) {
    const type = match[1];
    const bodyText = match[2];
    if (type === 'stars') continue;
    if (type === 'moon') {
      const c = bodyText.match(/<circle\s+cx="([^"]+)"\s+cy="([^"]+)"\s+r="([^"]+)"/);
      if (c) tagged.push({ type, cx: c[1], cy: c[2], r: c[3], start: match.index, end: taggedRe.lastIndex });
    } else if (type === 'ringed-planet') {
      const c = bodyText.match(/<circle\s+data-celestial-silhouette="true"\s+cx="([^"]+)"\s+cy="([^"]+)"\s+r="([^"]+)"/);
      if (c) tagged.push({ type, cx: c[1], cy: c[2], r: c[3], start: match.index, end: taggedRe.lastIndex });
    }
  }

  // Reconstruct the body list in SVG document order. The original suns are
  // emitted before the optional moon/planet, so source order is the depth order.
  const all = [
    ...bodies.map(b => ({ ...b, kind: 'sun' })),
    ...tagged
  ].sort((a, b) => a.start - b.start);

  if (all.length < 2) return svg;

  const masks = [];
  const replacements = [];

  for (let i = 0; i < all.length - 1; i++) {
    const maskId = `celestialOverlap${i}`;
    const occluders = all.slice(i + 1).map(body =>
      `<circle cx="${body.cx}" cy="${body.cy}" r="${body.r}" fill="black"/>`
    ).join('');
    masks.push(`<mask id="${maskId}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse"><rect x="0" y="0" width="1024" height="512" fill="white"/>${occluders}</mask>`);
  }

  // Wrap original sun circles so their existing mountain mask is preserved,
  // while the new overlap mask is applied at the body level.
  for (let i = 0; i < all.length - 1; i++) {
    const body = all[i];
    if (body.kind === 'sun') {
      const original = svg.slice(body.start, body.end);
      const clean = original.replace(' mask="url(#sunOcclusion)"', '');
      replacements.push({ start: body.start, end: body.end, text: `<g mask="url(#sunOcclusion)" data-celestial-body="sun" data-overlap-mask="celestialOverlap${i}"><g mask="url(#celestialOverlap${i})">${clean}</g></g>` });
    }
  }

  // Add overlap masks to optional tagged bodies without changing their content.
  for (let i = 0; i < all.length - 1; i++) {
    const body = all[i];
    if (body.kind !== 'sun') {
      const original = svg.slice(body.start, body.end);
      const taggedOpen = original.match(/^<g\s+data-celestial-body="[^"]+"[^>]*>/);
      if (taggedOpen) {
        const replacementOpen = `<g mask="url(#celestialOverlap${i})" data-celestial-overlap="true">`;
        const wrapped = `${replacementOpen}${original}</g>`;
        replacements.push({ start: body.start, end: body.end, text: wrapped });
      }
    }
  }

  replacements.sort((a, b) => b.start - a.start);
  for (const replacement of replacements) {
    svg = svg.slice(0, replacement.start) + replacement.text + svg.slice(replacement.end);
  }

  return svg.replace('</defs>', `${masks.join('')}</defs>`);
}

function generate() {
  if (!sourceGrammar) return;
  const seedText = $('seed').value;
  currentSeed = numericSeed(seedText);
  $('seed').value = String(currentSeed);
  $('seedLabel').textContent = currentSeed;
  try {
    const grammar = makeGrammar(currentSeed, $('occlude').checked);
    currentSvg = grammar.flatten('#origin#');
    if (!currentSvg.includes('<svg')) throw new Error('Generated output does not contain an SVG.');

    // Use a separate deterministic RNG stream for the new moon experiment so
    // adding moons does not alter any existing grammar choices.
    const celestialRng = splitmix32((currentSeed ^ 0x6d6f6f6e) >>> 0);
    const planetRng = splitmix32((currentSeed ^ 0x706c616e) >>> 0);
    const starRng = splitmix32((currentSeed ^ 0x73746172) >>> 0);

    // The original mountain layers are translucent. Simply drawing the suns
    // first therefore still lets them shine through the mountains. Use the
    // exact cumulative mask belonging to the selected mountain stack to mask
    // the suns themselves, preserving the original mountain appearance.
    if ($('occlude').checked) {
      // Do not depend on the expander remembering which mountain rule was chosen.
      // The generated SVG itself is the authoritative source: find the highest
      // overlay mask actually used by the mountain rectangles.
      const mountainMaskIds = [...currentSvg.matchAll(/<rect[^>]*mask="url\(#(overlay\d+)\)"/g)]
        .map(match => match[1]);
      const mountainMask = mountainMaskIds.length
        ? mountainMaskIds[mountainMaskIds.length - 1]
        : null;

      if (mountainMask) {
        // Copy the actual cumulative mountain geometry and invert it for the
        // sun mask: white = sun visible, black = sun hidden.
        const maskPattern = new RegExp(`<mask\\s+id="${mountainMask}">([\\s\\S]*?)</mask>`);
        const maskMatch = currentSvg.match(maskPattern);
        if (maskMatch) {
          const mountainShape = maskMatch[1].replace(/fill="white"/g, 'fill="black"');
          const sunMask = `<mask id="sunOcclusion" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse"><rect x="0" y="0" width="1024" height="512" fill="white"/>${mountainShape}</mask>`;
          currentSvg = currentSvg.replace('</defs>', `${sunMask}</defs>`);
          currentSvg = currentSvg.replace(/<circle /g, '<circle mask="url(#sunOcclusion)" ');
        }
      }
    }

    // Add the first experimental celestial body after the existing sun/mountain
    // processing. The moon uses the same occlusion mask as the suns.
    if ($('occlude').checked && currentSvg.includes('id="sunOcclusion"')) {
      currentSvg = addStars(currentSvg, starRng);
      currentSvg = addMoon(currentSvg, celestialRng);
      currentSvg = addRingedPlanet(currentSvg, planetRng);
      currentSvg = applyCelestialOverlapOcclusion(currentSvg);
    }

    // Strip the wrapper text used by the original Tracery grammar.
    currentSvg = currentSvg.replace(/^\{svg\s*/, '').replace(/\}\s*$/, '');
    $('art').innerHTML = currentSvg;
    setStatus(`Generated from seed ${currentSeed}.`);
  } catch (error) {
    console.error(error);
    setStatus(`Generation error: ${error.message}`);
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadSvg() {
  if (!currentSvg) return;
  downloadBlob(new Blob([currentSvg], { type: 'image/svg+xml;charset=utf-8' }), `strangest-stars-${currentSeed}.svg`);
}

function downloadPng() {
  if (!currentSvg) return;
  const scale = Number($('pngScale').value);
  const parser = new DOMParser();
  const doc = parser.parseFromString(currentSvg, 'image/svg+xml');
  const svg = doc.documentElement;
  const width = Number(svg.getAttribute('width')) || 1024;
  const height = Number(svg.getAttribute('height')) || 512;
  const serialized = new XMLSerializer().serializeToString(svg);
  const blobUrl = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }));
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width * scale; canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(blobUrl);
    canvas.toBlob(blob => downloadBlob(blob, `strangest-stars-${currentSeed}-${scale}x.png`), 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(blobUrl); setStatus('PNG export failed in this browser. SVG export is still available.'); };
  img.src = blobUrl;
}

$('generate').addEventListener('click', generate);
$('randomSeed').addEventListener('click', () => { $('seed').value = randomSeed(); generate(); });
$('occlude').addEventListener('change', generate);
$('downloadSvg').addEventListener('click', downloadSvg);
$('downloadPng').addEventListener('click', downloadPng);
$('seed').addEventListener('keydown', event => { if (event.key === 'Enter') generate(); });

(async function init() {
  try {
    await loadGrammar();
    setStatus('Ready.');
    generate();
  } catch (error) {
    console.error(error);
    setStatus(`Could not load grammar: ${error.message}`);
  }
})();
