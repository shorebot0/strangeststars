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
    t = Math.imul(t, 0x21f0a2ad);
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

function makeGrammar(seed, occlude) {
  const grammarData = structuredClone(sourceGrammar);
  if (occlude) {
    // Original: bg -> mountains -> clouds -> suns.
    // New:      bg -> suns -> mountains -> clouds.
    grammarData.origin2 = ['#preface# #defs# #bg# #sun# #sun# #mountains# #clouds# #ending#'];
  }
  tracery.setRng(splitmix32(seed));
  const grammar = tracery.createGrammar(grammarData);
  return grammar;
}

function generate() {
  if (!sourceGrammar || !window.tracery) return;
  const seedText = $('seed').value;
  currentSeed = numericSeed(seedText);
  $('seed').value = String(currentSeed);
  $('seedLabel').textContent = currentSeed;
  try {
    const grammar = makeGrammar(currentSeed, $('occlude').checked);
    currentSvg = grammar.flatten('#origin#');
    if (!currentSvg.includes('<svg')) throw new Error('Generated output does not contain an SVG.');
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

window.addEventListener('tracery-ready', async () => {
  try {
    await loadGrammar();
    setStatus('Ready.');
    generate();
  } catch (error) {
    console.error(error);
    setStatus(`Could not load grammar: ${error.message}`);
  }
});
