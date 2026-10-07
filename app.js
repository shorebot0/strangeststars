let sourceGrammar = null;
let currentSvg = '';
let currentSeed = null;

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
      const masks = [...String(rule).matchAll(/mask=\"url\\\(#(overlay\d+)\\\)\"/g)];
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

    // The original mountain layers are translucent. Simply drawing the suns
    // first therefore still lets them shine through the mountains. Use the
    // exact cumulative mask belonging to the selected mountain stack to mask
    // the suns themselves, preserving the original mountain appearance.
    if ($('occlude').checked) {
      const mountainMask = grammar.getMountainMask();
      if (mountainMask) {
        const sunMask = `<mask id="sunOcclusion" maskUnits="userSpaceOnUse"><rect x="0" y="0" width="1024" height="512" fill="white"/><rect x="0" y="0" width="1024" height="512" fill="black" mask="url(#${mountainMask})"/></mask>`;
        currentSvg = currentSvg.replace('</defs>', `${sunMask}</defs>`);
        currentSvg = currentSvg.replace(/<circle /g, '<circle mask="url(#sunOcclusion)" ');
      }
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
