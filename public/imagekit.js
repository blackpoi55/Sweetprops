// Image helpers that run in the browser: background removal, trim, crop, split, palette and particle textures.

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('เปิดรูปไม่ได้'));
    img.src = src;
  });
}

export function toCanvas(img, maxSide = 1024) {
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const c = document.createElement('canvas');
  c.width = Math.round((img.naturalWidth || img.width) * k);
  c.height = Math.round((img.naturalHeight || img.height) * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

const dist = (d, i, r, g, b) => Math.hypot(d[i] - r, d[i + 1] - g, d[i + 2] - b);

/** Median colour of the outer border — the background we will remove. */
function borderColor(d, w, h) {
  const rs = [], gs = [], bs = [];
  const take = (x, y) => { const i = (y * w + x) * 4; if (d[i + 3] > 200) { rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); } };
  for (let x = 0; x < w; x += 2) { take(x, 0); take(x, h - 1); }
  for (let y = 0; y < h; y += 2) { take(0, y); take(w - 1, y); }
  const med = (a) => (a.length ? a.sort((p, q) => p - q)[a.length >> 1] : 255);
  return [med(rs), med(gs), med(bs)];
}

/**
 * Makes the background transparent by flood-filling from the borders through pixels close to the
 * border colour, with a soft edge so the outline stays smooth. Returns a new canvas.
 */
export function removeBackground(src, { tolerance = 38, feather = 28 } = {}) {
  const w = src.width, h = src.height;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;
  const [r, g, b] = borderColor(d, w, h);
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { const p = y * w + x; if (!seen[p]) { seen[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  const limit = tolerance + feather;
  while (stack.length) {
    const p = stack.pop();
    const i = p * 4;
    const dd = d[i + 3] < 20 ? 0 : dist(d, i, r, g, b);
    if (dd > limit) continue;
    // Fully clear inside tolerance, fade out across the feather band.
    const a = dd <= tolerance ? 0 : Math.round(255 * (dd - tolerance) / feather);
    d[i + 3] = Math.min(d[i + 3], a);
    const x = p % w, y = (p / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  ctx.putImageData(im, 0, 0);
  return out;
}

/** Crops to the visible pixels with a small margin. */
export function trim(src, pad = 0.02) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return src;
  const p = Math.round(Math.max(x1 - x0, y1 - y0) * pad);
  return crop(src, { x: Math.max(0, x0 - p), y: Math.max(0, y0 - p), w: Math.min(w, x1 + p + 1) - Math.max(0, x0 - p), h: Math.min(h, y1 + p + 1) - Math.max(0, y0 - p) });
}

export function crop(src, { x, y, w, h }) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}

/** Left and right halves (split at the centre line). */
export function split(src) {
  const half = Math.floor(src.width / 2);
  return { left: crop(src, { x: 0, y: 0, w: half, h: src.height }), right: crop(src, { x: half, y: 0, w: src.width - half, h: src.height }) };
}

export function toBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// ------------------------------------------------------------------ palette

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

const hex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

export function colorName([r, g, b]) {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (l > 0.92) return 'white';
  if (l < 0.12) return 'black';
  if (s < 0.14) return l > 0.6 ? 'light gray' : 'gray';
  if (h >= 35 && h < 58 && s > 0.35 && l < 0.75) return 'gold';
  if (h < 10 || h >= 355) return l > 0.75 ? 'pastel red' : 'red';
  if (h < 35) return l > 0.7 ? 'peach' : 'orange';
  if (h < 70) return l > 0.75 ? 'pastel yellow' : 'yellow';
  if (h < 160) return l > 0.75 ? 'mint green' : 'green';
  if (h < 200) return 'teal';
  if (h < 250) return l > 0.75 ? 'baby blue' : 'blue';
  if (h < 290) return l > 0.72 ? 'lavender' : 'purple';
  if (l > 0.8) return 'pastel pink';
  if (s > 0.65 && l < 0.6) return 'hot pink';
  return 'pink';
}

/**
 * Dominant colours of the visible pixels (k-means), plus roles for the pro tools:
 * primary (largest), secondary, accent (most saturated), metal (gold-ish if present).
 */
export function palette(src, k = 6) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const px = [];
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 6000)));
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const i = (y * w + x) * 4;
    if (d[i + 3] > 180) px.push([d[i], d[i + 1], d[i + 2]]);
  }
  if (!px.length) return null;
  let cs = Array.from({ length: k }, (_, i) => px[Math.floor((i + 0.5) * px.length / k)].slice());
  let groups = [];
  for (let it = 0; it < 10; it++) {
    groups = cs.map(() => []);
    for (const p of px) {
      let best = 0, bd = Infinity;
      cs.forEach((c, j) => { const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (dd < bd) { bd = dd; best = j; } });
      groups[best].push(p);
    }
    cs = groups.map((g, j) => (g.length ? [0, 1, 2].map((ch) => g.reduce((a, p) => a + p[ch], 0) / g.length) : cs[j]));
  }
  const clusters = cs.map((c, j) => ({ rgb: c, n: groups[j].length, hsl: rgbToHsl(...c) })).filter((c) => c.n > 0).sort((a, b) => b.n - a.n);
  const metal = clusters.find((c) => colorName(c.rgb) === 'gold');
  const nonMetal = clusters.filter((c) => c !== metal);
  const accent = [...nonMetal].filter((c) => c.hsl[2] > 0.25 && c.hsl[2] < 0.8).sort((a, b) => b.hsl[1] - a.hsl[1])[0] || nonMetal[0];
  const words = [...new Set(clusters.slice(0, 5).map((c) => colorName(c.rgb)))].slice(0, 4);
  return {
    colors: clusters.map((c) => hex(c.rgb)),
    words,
    roles: {
      primary: hex((nonMetal[0] || clusters[0]).rgb),
      secondary: hex((nonMetal[1] || nonMetal[0] || clusters[0]).rgb),
      accent: hex(accent.rgb),
      metal: metal ? hex(metal.rgb) : '#e9b949',
    },
    aspect: w / h,
  };
}

// ------------------------------------------------------------------ particle textures (white, tinted in Roblox)

export function drawPetal(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const s = size / 128;
  x.translate(size / 2, size / 2);
  const grad = x.createRadialGradient(0, 10 * s, 4 * s, 0, 0, 60 * s);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, 'rgba(255,255,255,0.85)');
  x.fillStyle = grad;
  x.beginPath();
  // Sakura petal: rounded teardrop with a notch at the tip.
  x.moveTo(0, 54 * s);
  x.bezierCurveTo(-46 * s, 30 * s, -44 * s, -36 * s, -10 * s, -52 * s);
  x.lineTo(0, -40 * s);
  x.lineTo(10 * s, -52 * s);
  x.bezierCurveTo(44 * s, -36 * s, 46 * s, 30 * s, 0, 54 * s);
  x.fill();
  return c;
}

export function drawHeart(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const s = size / 128;
  x.translate(size / 2, size / 2 + 6 * s);
  x.shadowColor = 'rgba(255,255,255,0.9)';
  x.shadowBlur = 10 * s;
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.moveTo(0, 40 * s);
  x.bezierCurveTo(-60 * s, 0, -40 * s, -55 * s, 0, -25 * s);
  x.bezierCurveTo(40 * s, -55 * s, 60 * s, 0, 0, 40 * s);
  x.fill();
  return c;
}
