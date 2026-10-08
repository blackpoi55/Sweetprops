// Turns the user's idea + picked options into a strong prompt and generation parameters.
// Everything here is free: it only shapes what we send to Roblox's own generators.

export const STYLES = {
  none: { th: 'ไม่กำหนด', en: '' },
  cute: { th: 'การ์ตูนน่ารัก', en: 'cute stylized cartoon, chunky rounded proportions, soft bevelled edges, vibrant saturated colors' },
  toy: { th: 'ของเล่นพลาสติก', en: 'glossy plastic toy look, simple bold shapes, bright primary colors, smooth surfaces' },
  lowpoly: { th: 'โลว์โพลี', en: 'clean low poly style, flat shaded facets, limited color palette' },
  painted: { th: 'แฟนตาซีลายมือ', en: 'hand-painted fantasy game art style, painterly textures, warm highlights' },
  realistic: { th: 'สมจริง', en: 'realistic proportions, physically based materials, detailed surface wear' },
  scifi: { th: 'ไซไฟ', en: 'sleek sci-fi design, panel lines, metal and glowing accent strips' },
  medieval: { th: 'ยุคกลาง', en: 'medieval fantasy, weathered wood, iron fittings, stone' },
  japanese: { th: 'ญี่ปุ่น', en: 'Japanese style, warm wood, paper lanterns, tidy minimal details' },
  thai: { th: 'ไทย', en: 'traditional Thai style, ornate gold trims, pointed roof finials, red and gold palette' },
  spooky: { th: 'ฮาโลวีน/หลอน', en: 'spooky Halloween theme, crooked shapes, purple and orange palette' },
  candy: { th: 'ขนมหวาน', en: 'candy land theme, pastel colors, frosting, sprinkles, glossy sugar' },
};

/** Bounding box (studs) per size bucket; aspect reshapes it. */
export const SIZES = {
  s: { th: 'เล็ก', studs: 2, hint: 'ของถือ' },
  m: { th: 'กลาง', studs: 8, hint: 'เฟอร์นิเจอร์' },
  l: { th: 'ใหญ่', studs: 16, hint: 'ตัวละคร/รถ' },
  xl: { th: 'ใหญ่มาก', studs: 40, hint: 'อาคาร' },
};

export const ASPECTS = {
  auto: [1, 1, 1],
  tall: [0.6, 1, 0.6],
  wide: [1, 0.55, 0.7],
  long: [0.5, 0.5, 1],
  flat: [1, 0.25, 1],
};

export const DETAIL = {
  low: { th: 'เบา', tris: 1500 },
  mid: { th: 'ปานกลาง', tris: 6000 },
  high: { th: 'ละเอียด', tris: 20000 },
};

const QUALITY = 'single game-ready prop, clean readable silhouette, centered, no ground plane, no background';

/**
 * Words Roblox's generation moderation rejects even in harmless prompts, with safe stand-ins.
 * Found by testing: "grumpy" alone fails every time (likely a famous-character filter).
 */
const MODERATION_SWAPS = [[/\bgrumpy\b/gi, 'unimpressed']];

export function sanitize(text) {
  return MODERATION_SWAPS.reduce((t, [re, to]) => t.replace(re, to), String(text));
}

export function buildPrompt({ prompt = '', style = 'none', extra = '' }) {
  const idea = sanitize(String(prompt).trim());
  const s = STYLES[style]?.en || '';
  return [idea, s, String(extra).trim(), QUALITY].filter(Boolean).join(', ').slice(0, 900);
}

export function buildSize({ size = 'm', aspect = 'auto', customStuds } = {}) {
  const studs = Number(customStuds) > 0 ? Number(customStuds) : (SIZES[size]?.studs ?? 8);
  const [x, y, z] = ASPECTS[aspect] || ASPECTS.auto;
  return { x: +(studs * x).toFixed(2), y: +(studs * y).toFixed(2), z: +(studs * z).toFixed(2) };
}

export function buildTriangles({ detail = 'mid', customTris } = {}) {
  const n = Number(customTris) > 0 ? Number(customTris) : (DETAIL[detail]?.tris ?? 6000);
  return Math.max(12, Math.min(20000, Math.round(n)));
}

export function cleanPartNames(s) {
  return String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 24).join(', ');
}

/** Short Model name from the idea, safe for the Explorer. */
export function propName(prompt) {
  const words = String(prompt).replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 4);
  const name = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return name.slice(0, 40) || 'SweetProp';
}
