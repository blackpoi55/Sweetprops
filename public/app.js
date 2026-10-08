// Sweetprops web UI — plain ES modules, no build step.
import * as IK from './imagekit.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ------------------------------------------------------------------ data

const IDEAS = [
  'ร้านไอศกรีมรูปโคนยักษ์ หลังคาลายทางชมพูขาว',
  'หีบสมบัติไม้ ขอบทอง มีอัญมณีเรืองแสงล้นออกมา',
  'แมวอ้วนสีส้มนอนขดบนเบาะ',
  'ดาบเพลิงแฟนตาซี ใบดาบมีลาวาไหล',
  'ตู้กดน้ำญี่ปุ่นมีไฟสว่าง',
  'ต้นไม้วิเศษเรืองแสงสีฟ้า มีเห็ดรอบโคน',
  'หุ่นยนต์จิ๋วตาโต ถือประแจ',
  'แผงลอยขายชานมไข่มุกสไตล์ไทย',
  'โคมไฟถนนวินเทจเหล็กดัด',
  'เค้กวันเกิดสามชั้นมีเทียน',
  'รถเข็นขายผลไม้ ร่มลายทาง',
  'ป้อมปืนใหญ่โจรสลัด',
  'บ้านเห็ดน่ารักมีประตูกลม',
  'ม้านั่งไม้ในสวนสาธารณะ',
  'ยานอวกาศจิ๋วสีขาวแถบนีออน',
  'กระถางกระบองเพชรหน้ายิ้ม',
  'treasure chest, gold trims, glowing gems, slightly open lid',
  'cozy wooden cafe table with two cups of coffee',
];

const EFFECTS = [
  ['glow', 'เรืองแสง'], ['sparkle', 'ประกาย'], ['outline', 'เส้นขอบ'], ['neon', 'นีออน'],
  ['petals', 'กลีบดอกลอย'], ['hearts', 'หัวใจลอย'], ['aura', 'ออร่า'],
  ['spin', 'หมุน'], ['float', 'ลอย'], ['pulse', 'เต้นตุบ'], ['fire', 'ไฟ'], ['smoke', 'ควัน'],
];

const MATERIALS = ['Plastic', 'SmoothPlastic', 'Neon', 'Glass', 'ForceField', 'Wood', 'WoodPlanks', 'Marble', 'Granite', 'Slate', 'Concrete',
  'Brick', 'Cobblestone', 'Rock', 'Sandstone', 'Basalt', 'Limestone', 'Pebble', 'Metal', 'DiamondPlate', 'CorrodedMetal', 'Foil',
  'Fabric', 'Leather', 'Rubber', 'Plaster', 'Cardboard', 'Carpet', 'CeramicTiles', 'ClayRoofTiles', 'RoofShingles',
  'Grass', 'LeafyGrass', 'Sand', 'Snow', 'Ice', 'Glacier', 'Mud', 'Ground', 'Asphalt', 'Pavement', 'Salt', 'CrackedLava'];
const AI_BASES = ['Plastic', 'SmoothPlastic', 'Wood', 'WoodPlanks', 'Marble', 'Basalt', 'Slate', 'CrackedLava', 'Concrete', 'Limestone', 'Granite',
  'Pavement', 'Brick', 'Pebble', 'Cobblestone', 'Rock', 'Sandstone', 'CorrodedMetal', 'DiamondPlate', 'Foil', 'Metal', 'Grass', 'LeafyGrass',
  'Sand', 'Fabric', 'Snow', 'Mud', 'Ground', 'Asphalt', 'Salt', 'Ice', 'Glacier', 'Cardboard', 'Carpet', 'CeramicTiles', 'ClayRoofTiles',
  'RoofShingles', 'Leather', 'Plaster', 'Rubber'];
const STYLE_EMOJI = { none: '🎲', cute: '🧸', toy: '🪀', lowpoly: '🔷', painted: '🎨', realistic: '📷', scifi: '🚀', medieval: '🏰', japanese: '🏮', thai: '🛕', spooky: '🎃', candy: '🍭' };
const BOOSTS = [
  ['ไม้', 'wooden'], ['โลหะ', 'metal'], ['หิน', 'stone'], ['ทองคำ', 'gold trims'], ['คริสตัล', 'crystal'],
  ['เรืองแสง', 'glowing accents'], ['เก่า ๆ', 'weathered and worn'], ['ใหม่เอี่ยม', 'brand new, polished'],
  ['สีพาสเทล', 'pastel colors'], ['สีสด', 'vivid colors'], ['มีลวดลาย', 'decorative patterns'], ['ขอบมน', 'rounded soft edges'],
];
const TIPS = [
  'บอก “วัตถุ + วัสดุ + สี + จุดเด่น” เช่น wooden chest, gold trims, glowing gems จะได้งานคมกว่า',
  'ของชิ้นเดียวได้ผลดีกว่าฉากทั้งฉาก — อยากได้ฉาก ให้สร้างทีละชิ้นแล้วใช้ “โปรยรอบ ๆ”',
  'อยากได้ทรงตามใจ ใช้โหมด “จากรูปต้นแบบ” แล้ววางรูป (Ctrl+V) ได้เลย',
  'โหมด “ประกอบชิ้นส่วน” ได้ Part แยกชิ้น เปลี่ยนสีทีละส่วนง่ายมาก',
  'กด Ctrl+K เพื่อสั่งงานด่วน เช่น หมุน ทาสี ใส่เรืองแสง โดยไม่ต้องหาปุ่ม',
  'ทุกคำสั่งกด Ctrl+Z ใน Studio ย้อนได้ ลองได้เต็มที่',
  'ของในเกมมือถือ เลือกรายละเอียด “เบา” แล้วกด “ลดภาระเกม” ในหน้าปรับแต่ง',
];

const SWATCHES = ['#ff7aa8', '#f0457f', '#ffb3c7', '#ffcf4d', '#ff9a3c', '#e8453c', '#7bd389', '#19b394', '#5fd3f3', '#3d7bf2',
  '#8f6cf0', '#c9a6ff', '#ffffff', '#d9d4cf', '#7a6f69', '#2b2b2b', '#8b5a2b', '#d4a373', '#f5e6c8', '#ffd700'];

// ------------------------------------------------------------------ helpers

async function api(path, { method = 'GET', body, raw, headers } = {}) {
  const opts = { method, headers: { ...(headers || {}) } };
  if (raw) opts.body = raw;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(path, opts);
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}

function toast(msg, kind = 'ok', ms = 3800) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), ms);
}

/** Runs an async action with a busy button and error toast. */
async function busy(btn, fn, okMsg) {
  if (btn) { btn.disabled = true; btn.classList.add('busy'); }
  try {
    const out = await fn();
    if (okMsg) toast(typeof okMsg === 'function' ? okMsg(out) : okMsg);
    return out;
  } catch (err) {
    toast(err.message, 'err', 6000);
    throw err;
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('busy'); }
  }
}

function chipGroup(el, { multi = false, onChange } = {}) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !el.contains(b)) return;
    if (multi) b.classList.toggle('on');
    else { $$('button', el).forEach((x) => x.classList.toggle('on', x === b)); }
    onChange?.(b);
  });
  return {
    get value() { return multi ? $$('button.on', el).map((b) => b.dataset.v) : $('button.on', el)?.dataset.v; },
    set(v) { $$('button', el).forEach((b) => b.classList.toggle('on', multi ? v.includes(b.dataset.v) : b.dataset.v === v)); },
  };
}

const fmtSize = (s) => (s ? s.map((n) => (+n).toFixed(1)).join(' × ') : '–');
const timeAgo = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s} วิ`;
  if (s < 3600) return `${Math.floor(s / 60)} นาที`;
  return `${Math.floor(s / 3600)} ชม.`;
};

// ------------------------------------------------------------------ router

const pages = ['create', 'customize', 'library', 'store', 'guide', 'settings'];
function route() {
  const page = pages.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'create';
  pages.forEach((p) => { $(`#page-${p}`).hidden = p !== page; });
  $$('.sidenav a').forEach((a) => a.classList.toggle('on', a.dataset.page === page));
  if (page === 'customize') loadProps();
  if (page === 'library') loadLibrary();
  if (page === 'settings') loadSettings();
}
window.addEventListener('hashchange', route);

// ------------------------------------------------------------------ connection status

let status = { studios: [] };
async function refreshStatus() {
  const btn = $('#conn');
  try {
    status = await api('/api/status');
    const ok = status.studios.length > 0;
    btn.className = `conn ${ok ? 'ok' : 'bad'}`;
    $('#connText').textContent = ok
      ? `เชื่อมแล้ว · ${status.studios.find((s) => s.id === status.studioId)?.name || status.studios[0].name}`
      : (status.error && !/ยังไม่เจอ/.test(status.error) ? 'StudioMCP มีปัญหา' : 'ยังไม่เจอ Studio — เปิด Studio + MCP');
    btn.title = status.error || status.exe || '';
    $('#onboard').hidden = ok;
    const pick = $('#studioPick');
    pick.hidden = status.studios.length < 2;
    if (!pick.hidden) {
      pick.innerHTML = status.studios.map((s) => `<option value="${esc(s.id)}" ${s.id === status.studioId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    }
  } catch {
    btn.className = 'conn bad';
    $('#connText').textContent = 'Sweetprops server ปิดอยู่';
  }
}
$('#conn').addEventListener('click', async () => {
  $('#connText').textContent = 'กำลังเชื่อมใหม่…';
  try { await api('/api/connect', { method: 'POST' }); } catch (err) { toast(err.message, 'err'); }
  refreshStatus();
});
$('#onboardRetry').addEventListener('click', (e) => busy(e.currentTarget, async () => {
  await api('/api/connect', { method: 'POST' });
  await refreshStatus();
  if (!status.studios.length) throw new Error('ยังไม่เจอ Studio — เช็คว่าเปิด place และเปิด MCP server แล้ว');
}, 'เชื่อม Studio แล้ว พร้อมสร้าง!'));

// theme: saved choice, else follow the system
const THEME_KEY = 'sweetprops.theme';
function applyTheme(t) { document.documentElement.dataset.theme = t; }
let theme;
try { theme = localStorage.getItem(THEME_KEY); } catch { /* storage blocked */ }
applyTheme(theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('#themeBtn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch { /* storage blocked */ }
});

$('#studioPick').addEventListener('change', async (e) => {
  await api('/api/settings', { method: 'POST', body: { studioId: e.target.value } });
  refreshStatus();
});

// ------------------------------------------------------------------ create

let mode = 'mesh';
let imageId = null;
let options = null;

const style = chipGroup($('#styleChips'), { onChange: () => updatePreview() });
const aspect = chipGroup($('#aspectChips'));
const detail = chipGroup($('#detailChips'));
const fx = chipGroup($('#fxChips'), { multi: true });
let size = 'm';

function renderIdeas() {
  const picks = [...IDEAS].sort(() => Math.random() - 0.5).slice(0, 5);
  $('#ideaChips').innerHTML = picks.map((i) => `<button type="button">${esc(i)}</button>`).join('') + '<button type="button" data-shuffle>↻ ไอเดียอื่น</button>';
}
$('#ideaChips').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.shuffle !== undefined) return renderIdeas();
  $('#prompt').value = b.textContent;
  $('#prompt').dispatchEvent(new Event('input'));
  $('#prompt').focus();
});

$('#prompt').addEventListener('input', () => { $('#promptCount').textContent = $('#prompt').value.length; updatePreview(); syncBoosts(); });

// Boost chips toggle an English descriptor in the prompt; a chip is "on" while its text is in the prompt.
const promptTerms = () => $('#prompt').value.split(',').map((t) => t.trim()).filter(Boolean);
function syncBoosts() {
  const terms = promptTerms().map((t) => t.toLowerCase());
  $$('#boostChips button').forEach((b) => {
    const on = terms.includes(b.dataset.en.toLowerCase());
    b.classList.toggle('on', on);
    b.textContent = `${on ? '✓' : '+'} ${b.dataset.th}`;
  });
}
$('#boostChips').innerHTML = BOOSTS.map(([th, en]) => `<button type="button" data-en="${esc(en)}" data-th="${esc(th)}" title="เติมคำว่า “${esc(en)}” ลงในไอเดีย">+ ${esc(th)}</button>`).join('');
$('#boostChips').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const ta = $('#prompt');
  const en = b.dataset.en.toLowerCase();
  const terms = promptTerms();
  const has = terms.some((t) => t.toLowerCase() === en);
  const next = has ? terms.filter((t) => t.toLowerCase() !== en) : [...terms, b.dataset.en];
  ta.value = next.join(', ').slice(0, 500);
  ta.dispatchEvent(new Event('input'));
  ta.classList.remove('flash');
  void ta.offsetWidth; // restart the animation
  ta.classList.add('flash');
});

/** Mirrors server/prompts.js buildPrompt so users see exactly what is sent. */
function updatePreview() {
  const idea = $('#prompt').value.trim();
  if (!idea || mode !== 'mesh' || !options) { $('#promptPreview').textContent = ''; return; }
  const st = options.styles[style.value]?.en;
  $('#promptPreview').textContent = [idea, st, 'single game-ready prop, clean readable silhouette, centered, no ground plane, no background'].filter(Boolean).join(', ');
}

let tipI = Math.floor(Math.random() * TIPS.length);
function nextTip() { $('#tipText').textContent = TIPS[tipI++ % TIPS.length]; }
nextTip();
setInterval(nextTip, 12000);

async function loadOptions() {
  options = await api('/api/options');
  $('#styleChips').innerHTML = Object.entries(options.styles).map(([k, v]) =>
    `<button type="button" data-v="${k}" class="${k === 'cute' ? 'on' : ''}"><span class="e">${STYLE_EMOJI[k] || '✦'}</span>${esc(v.th)}</button>`).join('');
  updatePreview();
  const icons = { s: '🧁', m: '🪑', l: '🚗', xl: '🏠' };
  $('#sizeCards').innerHTML = Object.entries(options.sizes).map(([k, v]) =>
    `<button type="button" data-v="${k}" class="${k === size ? 'on' : ''}"><span class="sz">${icons[k] || ''}</span>${esc(v.th)}<small>${esc(v.hint)} ~${v.studs} studs</small></button>`).join('');
}
$('#sizeCards').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  size = b.dataset.v;
  $$('#sizeCards button').forEach((x) => x.classList.toggle('on', x === b));
});

$('#fxChips').innerHTML = EFFECTS.map(([k, th]) => `<button type="button" data-v="${k}">${th}</button>`).join('');

// Image-to-prop: "card" keeps the picture exactly (2.5D), "ai" asks Roblox to build a 3D model from it.
let method = 'card';
let srcOriginal = null; // canvas of the uploaded picture
let srcCanvas = null; // after optional crop
let cardCanvas = null; // after background removal + trim
let pal = null;

const variants = chipGroup($('#variantChips'));
const decor = chipGroup($('#decorChips'), { multi: true });

function syncModeUi() {
  const isImage = mode === 'image';
  $('#dropzone').hidden = !isImage;
  $('#imgPanel').hidden = !isImage || !srcCanvas;
  $('#cardOpts').hidden = method !== 'card';
  $('#cloudOpts').hidden = method !== 'cloud3d';
  if (method === 'cloud3d') refreshCloudNote();
  const aiVisible = !isImage || method === 'ai';
  $$('.ai-only').forEach((el) => { el.hidden = !aiVisible; });
  $('#dualWrap').hidden = !(isImage && method === 'ai');
  $('#promptHint').textContent = isImage
    ? (method === 'card' ? 'ไม่ใส่ก็ได้ — ใช้เป็นชื่อโมเดล' : 'ใส่คำอธิบายด้วยจะได้ทำคู่กับ AI เมช (ภาษาอังกฤษดีที่สุด)')
    : 'ภาษาอังกฤษได้ผลดีที่สุด ภาษาไทยก็ใช้ได้';
  $('#genBtn').textContent = isImage && method === 'card' ? '🎴 สร้างการ์ด' : isImage && method === 'cloud3d' ? '🧬 สร้าง 3D' : '✦ สร้าง';
  updatePreview();
}

$('#modeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  mode = b.dataset.mode;
  $$('#modeSeg button').forEach((x) => x.classList.toggle('on', x === b));
  syncModeUi();
});
$('#methodSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  method = b.dataset.m;
  $$('#methodSeg button').forEach((x) => x.classList.toggle('on', x === b));
  syncModeUi();
});

// image upload: click, drag-drop, paste
const dz = $('#dropzone');
dz.addEventListener('click', (e) => { if (!e.target.closest('#dzClear')) $('#imageInput').click(); });
$('#dzClear').addEventListener('click', () => { $('#imageInput').click(); });
$('#imageInput').addEventListener('change', (e) => { if (e.target.files[0]) loadPicture(e.target.files[0]); e.target.value = ''; });
dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); e.dataTransfer.files[0] && loadPicture(e.dataTransfer.files[0]); });
document.addEventListener('paste', (e) => {
  if ($('#page-create').hidden) return;
  const file = [...(e.clipboardData?.files || [])].find((f) => /image\/(png|jpe?g|webp)/.test(f.type));
  if (!file) return;
  $('#modeSeg button[data-mode=image]').click();
  loadPicture(file);
});

async function loadPicture(file) {
  if (!/image\/(png|jpe?g|webp)/.test(file.type)) return toast('รองรับเฉพาะ PNG, JPG หรือ WEBP', 'err');
  if (file.size > 15 * 1024 * 1024) return toast('รูปใหญ่เกิน 15MB', 'err');
  const url = URL.createObjectURL(file);
  try {
    const img = await IK.loadImage(url);
    srcOriginal = IK.toCanvas(img, 2048);
    srcCanvas = IK.toCanvas(img, 1400);
    imageId = null; // re-uploaded at submit time (after crop/cleanup)
    $('#dzImg').src = url;
    $('#dzPreview').hidden = false;
    $('#dzEmpty').hidden = true;
    processPicture();
    syncModeUi();
  } catch (err) { toast(err.message, 'err'); }
}

/** Background removal + trim + palette, shown live in the preview. */
function processPicture() {
  if (!srcCanvas) return;
  const base = $('#cardBg').checked ? IK.removeBackground(srcCanvas, { tolerance: +$('#cardTol').value }) : srcCanvas;
  cardCanvas = $('#cardBg').checked ? IK.trim(base) : base;
  const pv = $('#cardPreview');
  pv.width = cardCanvas.width; pv.height = cardCanvas.height;
  const ctx = pv.getContext('2d');
  ctx.clearRect(0, 0, pv.width, pv.height);
  ctx.drawImage(cardCanvas, 0, 0);
  if ($('#cardSplit').checked) {
    ctx.save();
    ctx.setLineDash([8, 8]); ctx.strokeStyle = 'rgba(240,69,127,.7)'; ctx.lineWidth = Math.max(2, pv.width / 300);
    ctx.beginPath(); ctx.moveTo(pv.width / 2, 0); ctx.lineTo(pv.width / 2, pv.height); ctx.stroke();
    ctx.restore();
  }
  pal = IK.palette(cardCanvas);
  if (pal) {
    $('#palPrimary').value = pal.roles.primary;
    $('#palSecondary').value = pal.roles.secondary;
    $('#palAccent').value = pal.roles.accent;
    $('#palMetal').value = pal.roles.metal;
    $('#palWords').textContent = pal.words.join(' · ');
    $('#paletteRow').hidden = false;
    $('#tintColor').value = lighten(pal.roles.primary, 0.35);
    $('#fxColor').value = pal.roles.accent;
    // Shape hint for AI modes from the picture's proportions.
    aspect.set(pal.aspect > 1.35 ? 'wide' : pal.aspect < 0.75 ? 'tall' : 'auto');
  }
}
['cardBg', 'cardSplit'].forEach((id) => $(`#${id}`).addEventListener('change', processPicture));
let tolTimer;
$('#cardTol').addEventListener('input', (e) => {
  $('#tolVal').textContent = e.target.value;
  clearTimeout(tolTimer);
  tolTimer = setTimeout(processPicture, 120);
});
$('#cardAngle').addEventListener('input', (e) => { $('#angVal').textContent = `${e.target.value}°`; });

function lighten(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function currentPalette() {
  return { primary: $('#palPrimary').value, secondary: $('#palSecondary').value, accent: $('#palAccent').value, metal: $('#palMetal').value, tint: $('#tintColor').value };
}

// ---- extra views for image → 3D (side/back of the same object)
let views = []; // canvases
function renderViews() {
  $('#viewList').innerHTML = views.map((c, i) => `<figure><img src="${c.toDataURL('image/png')}" alt="มุมที่ ${i + 2}"><button type="button" data-rm="${i}" title="เอาออก">✕</button></figure>`).join('');
}
$('#viewList').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-rm]');
  if (b) { views.splice(+b.dataset.rm, 1); renderViews(); }
});
$('#viewInput').addEventListener('change', async (e) => {
  for (const f of [...e.target.files].slice(0, 3 - views.length)) {
    const url = URL.createObjectURL(f);
    try { views.push(IK.toCanvas(await IK.loadImage(url), 1024)); } catch { /* skip unreadable */ }
  }
  e.target.value = '';
  renderViews();
});
let cropTarget = 'main';
$('#mainCrop').addEventListener('click', () => { cropTarget = 'main'; $('#cropBtn').click(); });
$('#viewFromCrop').addEventListener('click', () => {
  if (views.length >= 3) return toast('ใส่ได้สูงสุด 3 มุม', 'err');
  cropTarget = 'view';
  $('#cropBtn').click();
});
async function refreshCloudNote() {
  try {
    const st = await api('/api/settings');
    $('#cloudTokenWarn').hidden = st.local3d?.installed || st.hasHfToken;
    $('#cloudImportNote').textContent = st.hasOpenCloudKey
      ? 'เสร็จแล้วจะอัปโหลดเข้าบัญชี Roblox และวางใน Studio ให้อัตโนมัติ (Open Cloud)'
      : 'เสร็จแล้วจะได้ไฟล์ .glb — กด “เปิดโฟลเดอร์” แล้วใช้ Import 3D ใน Studio (หรือใส่ Open Cloud key ในตั้งค่าเพื่อให้ทำให้อัตโนมัติ)';
  } catch { /* offline */ }
}

// ---- crop tool
let cropRect = null;
let cropScale = 1;
function drawCrop() {
  const c = $('#cropCanvas');
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(srcOriginal, 0, 0, c.width, c.height);
  if (cropRect) {
    const { x, y, w, h } = cropRect;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(0, 0, c.width, y); ctx.fillRect(0, y + h, c.width, c.height - y - h);
    ctx.fillRect(0, y, x, h); ctx.fillRect(x + w, y, c.width - x - w, h);
    ctx.strokeStyle = '#ff7aa8'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
  }
}
$('#cropBtn').addEventListener('click', (e) => {
  if (e.isTrusted) cropTarget = 'main';
  if (!srcOriginal) return;
  const c = $('#cropCanvas');
  cropScale = Math.min(1, 860 / srcOriginal.width, (window.innerHeight * 0.6) / srcOriginal.height);
  c.width = Math.round(srcOriginal.width * cropScale);
  c.height = Math.round(srcOriginal.height * cropScale);
  cropRect = null;
  drawCrop();
  $('#cropModal').hidden = false;
});
(() => {
  const c = $('#cropCanvas');
  let start = null;
  const pt = (e) => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }; };
  c.addEventListener('pointerdown', (e) => { start = pt(e); c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', (e) => {
    if (!start) return;
    const p = pt(e);
    cropRect = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    drawCrop();
  });
  c.addEventListener('pointerup', () => { start = null; });
})();
$('#cropCancel').addEventListener('click', () => { $('#cropModal').hidden = true; });
$('#cropReset').addEventListener('click', () => {
  srcCanvas = IK.toCanvas(srcOriginal, 1400);
  $('#cropModal').hidden = true;
  processPicture();
});
$('#cropApply').addEventListener('click', () => {
  if (!cropRect || cropRect.w < 10 || cropRect.h < 10) return toast('ลากกรอบบนรูปก่อน', 'err');
  const r = { x: cropRect.x / cropScale, y: cropRect.y / cropScale, w: cropRect.w / cropScale, h: cropRect.h / cropScale };
  $('#cropModal').hidden = true;
  if (cropTarget === 'view') {
    views.push(IK.toCanvas(IK.crop(srcOriginal, r), 1024));
    renderViews();
    toast('เพิ่มมุมอื่นแล้ว');
    return;
  }
  srcCanvas = IK.toCanvas(IK.crop(srcOriginal, r), 1400);
  processPicture();
  toast('ครอปแล้ว');
});

async function uploadCanvas(canvas) {
  const blob = await IK.toBlob(canvas);
  if (blob.size > 5 * 1024 * 1024) throw new Error('รูปใหญ่เกิน 5MB หลังประมวลผล ลองครอปให้เล็กลง');
  const r = await api('/api/upload', { method: 'POST', raw: blob, headers: { 'Content-Type': 'image/png' } });
  return r.imageId;
}

/** Petal/heart particle textures are drawn here once and uploaded to the user's Roblox account. */
async function ensureFxTextures(effects) {
  const need = effects.filter((k) => k === 'petals' || k === 'hearts');
  if (!need.length) return;
  const have = await api('/api/fx-textures');
  const body = {};
  if (need.includes('petals') && !have.petal) body.petal = await uploadCanvas(IK.drawPetal(128));
  if (need.includes('hearts') && !have.heart) body.heart = await uploadCanvas(IK.drawHeart(128));
  if (Object.keys(body).length) await api('/api/fx-textures', { method: 'POST', body });
}

/** Flattens a transparent canvas onto white (the AI generator prefers a clean background). */
function onWhite(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(canvas, 0, 0);
  return c;
}

$('#createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = $('#prompt').value.trim();
  if (mode === 'image' && !srcCanvas) return toast('อัปรูปต้นแบบก่อน', 'err');
  if (mode !== 'image' && !prompt) { $('#prompt').focus(); return toast('พิมพ์สิ่งที่อยากได้ก่อน', 'err'); }
  const collision = $('#optCollision').value;
  const common = {
    prompt,
    name: $('#propNameIn').value.trim() || undefined,
    scaleStuds: $('#scaleStuds').value || undefined,
    finalize: { anchor: $('#optAnchor').checked, place: $('#optPlace').checked, collision: collision === 'default' ? undefined : collision },
    effects: fx.value,
    effectColor: $('#fxColor').value,
  };
  await busy($('#genBtn'), async () => {
    await ensureFxTextures(common.effects);
    let body;
    if (mode === 'image' && method === 'cloud3d') {
      const st = await api('/api/settings');
      if (!st.local3d?.installed && !st.hasHfToken) throw new Error('ยังไม่ได้ติดตั้งตัวสร้าง 3D — ดับเบิลคลิก Setup-3D.bat ในโฟลเดอร์ Sweetprops ก่อน');
      const main = await uploadCanvas(srcCanvas);
      const viewIds = [];
      for (const v of views) viewIds.push(await uploadCanvas(v));
      body = {
        ...common, mode: 'cloud3d', imageId: main, views: viewIds, detail: detail.value,
        palette: pal ? currentPalette() : undefined,
        pro: { fit: $('#optFit').checked, restyle: 'off' },
        size, aspect: aspect.value,
      };
    } else if (mode === 'image' && method === 'card') {
      const card = { split: $('#cardSplit').checked, aspect: cardCanvas.width / cardCanvas.height, angle: +$('#cardAngle').value, width: +$('#cardWidth').value || 8 };
      if (card.split) {
        const halves = IK.split(cardCanvas);
        [card.left, card.right] = await Promise.all([uploadCanvas(halves.left), uploadCanvas(halves.right)]);
      } else {
        card.full = await uploadCanvas(cardCanvas);
      }
      body = { ...common, mode: 'card', card, name: common.name || (prompt ? undefined : 'CardProp') };
    } else {
      if (mode === 'image') imageId = await uploadCanvas(onWhite(cardCanvas || srcCanvas));
      const decorKinds = decor.value;
      body = {
        ...common,
        mode: mode === 'image' ? 'parts' : mode,
        imageId: mode === 'image' ? imageId : null,
        dual: mode === 'image' && $('#optDual').checked,
        style: style.value,
        size, aspect: aspect.value, detail: detail.value,
        customTris: $('#customTris').value || undefined,
        partNames: $('#partNames').value,
        variants: +variants.value || 1,
        palette: pal || mode === 'image' ? currentPalette() : { accent: '#ff5fa2', metal: '#e9b949' },
        colorWords: pal && mode === 'image' ? pal.words.join(', ') : undefined,
        pro: {
          fit: $('#optFit').checked,
          restyle: $('#optRestyle').value,
          tint: $('#optTint').checked ? $('#tintColor').value : undefined,
          pendants: +$('#optPendants').value || 0,
          decor: decorKinds.map((kind) => ({ kind, count: +$('#decorCount').value || 14 })),
        },
      };
    }
    return api('/api/generate', { method: 'POST', body });
  }, mode === 'image' && method === 'card' ? 'ส่งงานแล้ว — กำลังอัปโหลดรูปเข้า Roblox' : mode === 'image' && method === 'cloud3d' ? 'ส่งงานแล้ว — สร้าง 3D ในเครื่องใช้ราว 2–5 นาที (CPU) ครั้งแรกจะดาวน์โหลดโมเดลก่อน' : 'ส่งงานแล้ว — ปกติใช้ 1–4 นาที ระหว่างนี้ใช้หน้าอื่นได้')
    .then(() => pollJobs(true), () => { /* already shown as a toast */ });
});

// ---- one-click templates: fill the idea + pro options for common prop types
const TEMPLATES = [
  { t: '🪽 ปีกแฟนซี', prompt: 'large feathered angel wings, white feathers fading to pastel pink tips, gold trim, pink heart jewel in the middle', style: 'none', aspect: 'wide', size: 'm', pendants: 9, decor: ['flower'], tint: '#ffc4dc', fx: ['sparkle', 'petals'] },
  { t: '👑 มงกุฎ', prompt: 'ornate princess crown, gold filigree, pink heart gems, pearls', style: 'none', aspect: 'wide', size: 's', pendants: 0, decor: ['pearl'], fx: ['sparkle'] },
  { t: '🗡️ ดาบแฟนตาซี', prompt: 'fantasy sword, crystal blade, gold cross guard with a gem, wrapped leather grip', style: 'painted', aspect: 'tall', size: 's', pendants: 0, decor: [], fx: ['glow'] },
  { t: '🏪 ร้านขายของ', prompt: 'cute market stall with striped awning, wooden counter, baskets of goods, hanging sign', style: 'cute', aspect: 'auto', size: 'l', pendants: 0, decor: [], fx: [] },
  { t: '🌳 ต้นไม้วิเศษ', prompt: 'magical cherry blossom tree, twisted trunk, glowing pink blossoms', style: 'painted', aspect: 'tall', size: 'l', pendants: 0, decor: ['flower'], fx: ['petals'] },
  { t: '🐱 สัตว์เลี้ยง', prompt: 'chubby cute cat pet sitting, big eyes, small bow on the head', style: 'cute', aspect: 'auto', size: 's', pendants: 0, decor: [], fx: [] },
];
$('#templateChips').innerHTML = '<span class="tl">ชุดสำเร็จรูป:</span>' + TEMPLATES.map((t, i) => `<button type="button" data-i="${i}">${esc(t.t)}</button>`).join('');
$('#templateChips').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-i]');
  if (!b) return;
  const t = TEMPLATES[+b.dataset.i];
  if (mode === 'image' && method === 'card') $('#methodSeg button[data-m=ai]').click();
  $('#prompt').value = t.prompt;
  $('#prompt').dispatchEvent(new Event('input'));
  style.set(t.style); aspect.set(t.aspect);
  size = t.size; $$('#sizeCards button').forEach((x) => x.classList.toggle('on', x.dataset.v === size));
  $('#optPendants').value = t.pendants;
  decor.set(t.decor);
  $('#optTint').checked = !!t.tint;
  if (t.tint) $('#tintColor').value = t.tint;
  fx.set(t.fx);
  if (t.fx.length || t.pendants) $('details.more').open = true;
  updatePreview();
  toast(`ใช้ชุด ${t.t} แล้ว — ปรับต่อได้ตามใจ`, 'info');
});
syncModeUi();

$('#prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('#createForm').requestSubmit();
});

// ------------------------------------------------------------------ jobs

let jobTimer = null;
let lastJobsKey = '';
async function pollJobs(soon = false) {
  clearTimeout(jobTimer);
  let list = [];
  try { list = await api('/api/jobs'); } catch { /* server down */ }
  renderJobs(list);
  const active = list.some((j) => ['queued', 'running', 'finishing'].includes(j.status));
  jobTimer = setTimeout(pollJobs, active || soon ? 2000 : 10000);
}

const STATUS_TH = { queued: ['รอคิว', 'pill'], running: ['กำลังสร้าง', 'pill run'], finishing: ['เก็บงาน', 'pill run'], done: ['เสร็จ', 'pill ok'], error: ['ไม่สำเร็จ', 'pill err'] };
const seenDone = new Set();
function renderJobs(list) {
  const key = JSON.stringify(list.map((j) => [j.id, j.status, j.step, j.items?.length]));
  for (const j of list) {
    if (j.status === 'done' && !seenDone.has(j.id) && lastJobsKey) toast(`สร้างเสร็จ: ${j.prompt || 'จากรูป'} — อยู่หน้ากล้องใน Studio แล้ว`);
    if (j.status === 'error' && !seenDone.has(j.id) && lastJobsKey) toast(`ไม่สำเร็จ: ${j.error}`, 'err', 8000);
    if (['done', 'error'].includes(j.status)) seenDone.add(j.id);
  }
  if (key === lastJobsKey) { $$('.job [data-elapsed]').forEach((el) => { el.textContent = timeAgo(+el.dataset.elapsed); }); return; }
  lastJobsKey = key;
  if (!list.length) { $('#jobList').innerHTML = '<p class="empty">ยังไม่มีงาน ลองพิมพ์ไอเดียแล้วกด “สร้าง”</p>'; return; }
  $('#jobList').innerHTML = list.map((j) => {
    const [label, cls] = STATUS_TH[j.status] || [j.status, 'pill'];
    const item = j.items?.[0];
    const img = item?.thumb || j.image;
    if (j.status === 'done' && j.manual && !item) j.step = 'ได้ไฟล์ 3D แล้ว';
    const running = ['queued', 'running', 'finishing'].includes(j.status);
    return `<div class="job ${running ? 'running' : ''}">
      <div class="thumb">${img ? `<img src="${esc(img)}" alt="">` : (j.status === 'error' ? '⚠️' : '✦')}</div>
      <div>
        <div class="t">${esc(j.prompt || 'จากรูปต้นแบบ')}</div>
        <div class="s"><span class="${cls}">${label}</span>${esc(j.status === 'error' ? j.error : j.step)} · <span data-elapsed="${j.startedAt || j.createdAt}">${timeAgo(j.startedAt || j.createdAt)}</span></div>
      </div>
      ${j.status === 'done' && item ? `<div class="acts">
        <button class="btn sm" data-edit="${esc(item.id)}">ปรับแต่ง</button>
        <button class="btn sm ghost" data-focus="${esc(item.id)}">ดูในกล้อง</button>
        <button class="btn sm ghost" data-turn="${esc(item.id)}" title="ถ้าโมเดลหันหลังให้กล้อง">กลับหน้า</button>
        <button class="btn sm ghost" data-redo="${esc(j.id)}">สร้างอีกแบบ</button>
      </div>` : ''}
      ${j.status === 'done' && j.manual ? `<div class="acts">
        <a class="btn sm" href="/viewer.html?src=${encodeURIComponent(j.manual.url)}" target="_blank" rel="noopener">👁 ดูตัวอย่าง 3D</a>
        <button class="btn sm primary" data-reveal="${esc(j.manual.url)}">📂 เปิดโฟลเดอร์ไฟล์ 3D</button>
        <a class="btn sm ghost" href="${esc(j.manual.url)}" download>ดาวน์โหลด .glb</a>
      </div>
      <div class="import-steps"><b>นำเข้า Studio:</b><ol><li>Studio › แท็บ <b>Home</b> (หรือ Model) › <b>Import 3D</b></li><li>เลือกไฟล์ .glb ที่เปิดไว้ › กด <b>Import</b></li><li>กลับมาที่ Sweetprops หน้าปรับแต่ง กด ↻ แล้วแต่งต่อได้เลย</li></ol></div>` : ''}
      ${j.status === 'error' ? `<div class="acts"><button class="btn sm ghost" data-redo="${esc(j.id)}">ลองอีกครั้ง</button></div>` : ''}
    </div>`;
  }).join('');
  window.__jobs = list;
}
$('#jobList').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.edit) { selectedId = b.dataset.edit; location.hash = '#customize'; }
  if (b.dataset.focus) busy(b, () => api('/api/props/op', { method: 'POST', body: { op: 'select', target: { id: b.dataset.focus } } }));
  if (b.dataset.reveal) busy(b, () => api('/api/reveal', { method: 'POST', body: { url: b.dataset.reveal } }), 'เปิดโฟลเดอร์แล้ว — ใช้ Import 3D ใน Studio เลือกไฟล์นี้');
  if (b.dataset.turn) busy(b, () => api('/api/props/op', { method: 'POST', body: { op: 'rotate', target: { id: b.dataset.turn }, angles: [0, 180, 0] } }), 'กลับหน้าแล้ว');
  if (b.dataset.redo) {
    const j = (window.__jobs || []).find((x) => x.id === b.dataset.redo);
    if (j) { $('#prompt').value = j.prompt || ''; $('#prompt').dispatchEvent(new Event('input')); $('#createForm').requestSubmit(); }
  }
});
$('#clearJobs').addEventListener('click', async () => { await api('/api/jobs/clear', { method: 'POST' }); pollJobs(); });

// ------------------------------------------------------------------ customize

let props = [];
let selectedId = null;
let current = null;

async function loadProps() {
  const btn = $('#refreshProps');
  try {
    props = await busy(btn, () => api(`/api/props?tagged=${$('#onlyTagged').checked ? 1 : 0}`));
  } catch { props = null; }
  renderProps();
  if (selectedId) {
    const p = props?.find((x) => x.id === selectedId);
    if (p) showEditor(p);
  }
}

function renderProps() {
  if (props === null) { $('#propItems').innerHTML = '<p class="empty">ยังไม่ได้เชื่อม Studio<br><a href="#guide">ดูวิธีเชื่อม</a></p>'; return; }
  const q = $('#propSearch').value.trim().toLowerCase();
  const list = props.filter((p) => !q || p.name.toLowerCase().includes(q));
  $('#propItems').innerHTML = list.length ? list.map((p) => `
    <button class="prop-item ${p.id && p.id === selectedId ? 'on' : ''}" data-path="${esc(p.path)}" data-id="${esc(p.id || '')}">
      <span class="n">${p.tagged ? '<span class="sp">✦</span> ' : ''}${esc(p.name)}</span>
      <span class="m">${p.parts} ชิ้น</span>
    </button>`).join('') : '<p class="empty">ไม่มีโมเดลใน Workspace</p>';
}
$('#propSearch').addEventListener('input', renderProps);
$('#onlyTagged').addEventListener('change', loadProps);
$('#refreshProps').addEventListener('click', loadProps);
$('#propItems').addEventListener('click', async (e) => {
  const b = e.target.closest('.prop-item');
  if (!b) return;
  const target = b.dataset.id ? { id: b.dataset.id } : { path: b.dataset.path };
  try {
    // select also adopts untagged instances? No — finalize/adopt happens on first edit; select just focuses.
    const d = await api('/api/props/op', { method: 'POST', body: { op: 'select', target } });
    showEditor({ ...d, path: d.path || b.dataset.path });
  } catch (err) { toast(err.message, 'err'); }
});
$('#useSelection').addEventListener('click', async (e) => {
  const list = await busy(e.currentTarget, () => api('/api/selection'));
  if (!list.length) return toast('ยังไม่ได้เลือกอะไรใน Studio', 'err');
  showEditor(list[0]);
  loadProps();
});
$('#groupSel').addEventListener('click', async (e) => {
  const name = prompt('ชื่อ Model ใหม่', 'Prop');
  if (name === null) return;
  const d = await busy(e.currentTarget, () => api('/api/props/group', { method: 'POST', body: { name } }), 'รวมเป็น Model แล้ว');
  showEditor(d);
  loadProps();
});

function targetOf(p) { return p.id ? { id: p.id } : { path: p.path }; }

async function loadRigs() {
  try {
    const rigs = await api('/api/rigs');
    const sel = $('#edRig');
    const keep = sel.value;
    sel.innerHTML = '<option value="">ไม่ใส่ เก็บไว้ใน ReplicatedStorage</option>' + rigs.map((r) => `<option value="${esc(r.path)}">ใส่ให้ ${esc(r.name)}${r.r15 ? '' : ' (R6)'}</option>`).join('');
    if (keep) sel.value = keep;
    else if (rigs[0]) sel.value = rigs[0].path;
  } catch { /* Studio offline */ }
}

function showEditor(p) {
  if (!current) loadRigs();
  current = p;
  selectedId = p.id || null;
  $('#editorEmpty').hidden = true;
  $('#editorBody').hidden = false;
  $('#edName').textContent = p.name;
  $('#edMeta').innerHTML = `${esc(p.className)} · ${fmtSize(p.size)} studs · ${p.parts} ชิ้น · ${p.meshes} เมช${p.scripts ? ` · <b>${p.scripts} สคริปต์</b>` : ''}${p.anchored ? ' · ยึดอยู่' : ' · ไม่ยึด'}`;
  $('#edStuds').value = p.size ? Math.max(...p.size).toFixed(1) : '';
  let effects = [];
  try { effects = JSON.parse(p.effects || '[]'); } catch { /* none */ }
  edFx.set(effects);
  $$('.prop-item').forEach((b) => b.classList.toggle('on', !!p.id && b.dataset.id === p.id));
}

async function propOp(btn, op, args = {}, okMsg) {
  if (!current) return;
  const d = await busy(btn, () => api('/api/props/op', { method: 'POST', body: { op, target: targetOf(current), ...args } }), okMsg);
  if (d && typeof d === 'object' && d.name) {
    showEditor(d);
    if (!props?.some((x) => x.id === d.id)) loadProps();
  }
  return d;
}

$('#swatches').innerHTML = SWATCHES.map((c) => `<button type="button" style="background:${c}" data-c="${c}" title="${c}"></button>`).join('');
$('#swatches').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $('#edColor').value = b.dataset.c;
  propOp(null, 'color', { color: b.dataset.c, overrideTexture: $('#edOverrideTex').checked });
});
$('#edMaterial').innerHTML = MATERIALS.map((m) => `<option>${m}</option>`).join('');
$('#aiMatBase').innerHTML = AI_BASES.map((m) => `<option>${m}</option>`).join('');
$('#edFx').innerHTML = EFFECTS.map(([k, th]) => `<button type="button" data-v="${k}">${th}</button>`).join('');
const edFx = chipGroup($('#edFx'), {
  multi: true,
  onChange: async (b) => {
    const on = b.classList.contains('on');
    if (on) { try { await ensureFxTextures([b.dataset.v]); } catch (err) { toast(err.message, 'err'); } }
    const fxAssets = on && ['petals', 'hearts'].includes(b.dataset.v) ? await api('/api/fx-textures') : {};
    propOp(null, 'effect', { kind: b.dataset.v, enabled: on, color: $('#edFxColor').value, texture: b.dataset.v === 'petals' ? fxAssets.petal : b.dataset.v === 'hearts' ? fxAssets.heart : undefined });
  },
});

const ACTIONS = {
  select: (b) => propOp(b, 'select'),
  placeFront: (b) => propOp(b, 'placeFront', {}, 'วางหน้ากล้องแล้ว'),
  dropToGround: (b) => propOp(b, 'dropToGround', {}, 'วางลงพื้นแล้ว'),
  rotY: (b) => propOp(b, 'rotate', { angles: [0, 90, 0] }),
  rot45: (b) => propOp(b, 'rotate', { angles: [0, 45, 0] }),
  turn: (b) => propOp(b, 'rotate', { angles: [0, 180, 0] }, 'กลับหน้าแล้ว'),
  flip: (b) => propOp(b, 'rotate', { angles: [180, 0, 0] }),
  scaleTo: (b) => propOp(b, 'scale', { studs: +$('#edStuds').value }),
  half: (b) => propOp(b, 'scale', { factor: 0.5 }),
  x075: (b) => propOp(b, 'scale', { factor: 0.75 }),
  x125: (b) => propOp(b, 'scale', { factor: 1.25 }),
  double: (b) => propOp(b, 'scale', { factor: 2 }),
  color: (b) => propOp(b, 'color', { color: $('#edColor').value, overrideTexture: $('#edOverrideTex').checked }),
  material: (b) => propOp(b, 'material', { material: $('#edMaterial').value }),
  aiMaterial: async (b) => {
    const description = $('#aiMatDesc').value.trim();
    if (!description) return toast('อธิบายวัสดุที่อยากได้ก่อน', 'err');
    const d = await busy(b, () => api('/api/props/ai-material', { method: 'POST', body: { target: targetOf(current), description, baseMaterial: $('#aiMatBase').value } }), 'ใส่วัสดุ AI แล้ว');
    if (d?.name) showEditor(d);
  },
  tint: (b) => propOp(b, 'tint', { color: $('#edTint').value }, (d) => (d.tinted ? `ย้อมสีแล้ว ${d.tinted} ชิ้น` : 'ไม่มีชิ้นที่มีลายให้ย้อม (ใช้ “ทาสี” แทน)')),
  untint: (b) => propOp(b, 'tint', { color: null }, 'เอาสีย้อมออกแล้ว'),
  restyle: (b) => propOp(b, 'restyle', { mode: 'smart', palette: { accent: $('#edGem').value, metal: $('#edMetal').value } },
    (d) => `จัดวัสดุแล้ว: ทอง ${d.restyled?.metal || 0} · อัญมณี ${d.restyled?.gem || 0} · ผ้า ${d.restyled?.cloth || 0}`),
  pendants: (b) => propOp(b, 'hangPendants', { count: +$('#edPendants').value || 9, color: $('#edGem').value, metal: $('#edMetal').value }, (d) => `แขวนจี้แล้ว ${d.pendants} อัน`),
  pendantsOff: (b) => propOp(b, 'hangPendants', { clear: true }, 'เอาจี้ออกแล้ว'),
  decorate: (b) => propOp(b, 'decorate', { kind: $('#edDecor').value, count: +$('#edDecorCount').value || 14, color: $('#edDecorColor').value, color2: $('#edMetal').value }, (d) => `แต่งแล้ว ${d.decorated} ชิ้น`),
  decorOff: (b) => propOp(b, 'decorate', { kind: $('#edDecor').value, clear: true }, 'เอาของแต่งออกแล้ว'),
  accessory: async (b) => {
    const r = await busy(b, () => api('/api/props/accessory', { method: 'POST', body: { target: targetOf(current), rig: $('#edRig').value, width: +$('#edAccWidth').value, slot: $('#edSlot').value } }));
    toast(r.worn ? `ใส่ให้ ${$('#edRig').selectedOptions[0].textContent} แล้ว — กด Play เพื่อดูตอนเคลื่อนไหว` : `สร้าง Accessory แล้ว อยู่ที่ ${r.path}`);
  },
  tool: async (b) => {
    const r = await busy(b, () => api('/api/props/tool', { method: 'POST', body: { target: targetOf(current), length: +$('#edToolLen').value } }));
    toast(`สร้าง Tool แล้ว อยู่ที่ ${r.path} — กด Play แล้วกด 1 เพื่อถือ`);
  },
  anchorOn: (b) => propOp(b, 'physics', { anchored: true }, 'ยึดกับที่แล้ว'),
  anchorOff: (b) => propOp(b, 'physics', { anchored: false }, 'ปล่อยแล้ว (เชื่อมชิ้นส่วนไว้ให้ไม่หลุด)'),
  collideOff: (b) => propOp(b, 'physics', { canCollide: false }, 'เดินทะลุได้แล้ว'),
  collideOn: (b) => propOp(b, 'physics', { canCollide: true }, 'ชนได้แล้ว'),
  shadowOff: (b) => propOp(b, 'physics', { castShadow: false }, 'ปิดเงาแล้ว'),
  duplicate: (b) => propOp(b, 'duplicate', { count: +$('#dupCount').value, pattern: $('#dupPattern').value, spacing: +$('#dupGap').value || undefined }, (n) => `ก๊อปแล้ว ${n} ชิ้น`),
  scatter: (b) => propOp(b, 'scatter', { count: +$('#scCount').value, radius: +$('#scRadius').value, randomScale: $('#scScale').checked }, (n) => `โปรยแล้ว ${n} ชิ้น`),
  finalize: (b) => propOp(b, 'finalize', { options: { anchor: true, collision: 'hull', place: false } }, 'จัดให้พร้อมใช้แล้ว'),
  optimize: (b) => propOp(b, 'optimize', {}, (r) => `ปรับแล้ว ${r.parts} ชิ้น`),
  stripScripts: (b) => propOp(b, 'stripScripts', {}, (n) => `ลบสคริปต์ ${n} ตัว`),
  rename: (b) => {
    const name = prompt('ชื่อใหม่', current?.name);
    if (name) propOp(b, 'rename', { name });
  },
  remove: async (b) => {
    if (!confirm(`ลบ “${current.name}” ออกจาก Studio? (กด Ctrl+Z ใน Studio เพื่อย้อนได้)`)) return;
    await propOp(b, 'remove', {}, 'ลบแล้ว');
    current = null; selectedId = null;
    $('#editorBody').hidden = true; $('#editorEmpty').hidden = false;
    loadProps();
  },
  save: async (b) => {
    const r = await busy(b, () => api('/api/props/save', { method: 'POST', body: { target: targetOf(current) } }), 'เก็บเข้าคลังแล้ว');
    if (r?.thumb) { $('#edThumb').src = `/thumbs/${r.thumb}?t=${Date.now()}`; $('#edThumb').hidden = false; }
  },
  thumb: async (b) => {
    const r = await busy(b, () => api('/api/props/save', { method: 'POST', body: { target: targetOf(current) } }), 'ถ่ายรูปและเก็บเข้าคลังแล้ว');
    if (r?.thumb) { $('#edThumb').src = `/thumbs/${r.thumb}?t=${Date.now()}`; $('#edThumb').hidden = false; }
  },
};
$('#editorBody').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b && ACTIONS[b.dataset.act]) ACTIONS[b.dataset.act](b);
});

// ------------------------------------------------------------------ library

let lib = [];
async function loadLibrary() {
  try { lib = await api('/api/library'); } catch (err) { toast(err.message, 'err'); }
  renderLibrary();
}
function renderLibrary() {
  const q = $('#libSearch').value.trim().toLowerCase();
  const onlyFav = $('#libFav').checked;
  const list = lib.filter((x) => (!onlyFav || x.favorite) && (!q || `${x.name} ${x.prompt}`.toLowerCase().includes(q)));
  $('#libGrid').innerHTML = list.length ? list.map((x) => `
    <div class="tile">
      <div class="img">${x.thumb ? `<img src="${esc(x.thumb)}" alt="" loading="lazy">` : '✦'}
        <button class="fav ${x.favorite ? 'on' : ''}" data-fav="${esc(x.id)}" title="ชอบ">★</button></div>
      <div class="body">
        <div class="t" title="${esc(x.name)}">${esc(x.name)}</div>
        <div class="d">${esc(x.prompt || '')}</div>
        <div class="muted">${fmtSize(x.size)} · ${x.parts ?? '?'} ชิ้น</div>
      </div>
      <div class="acts">
        <button class="btn sm primary" data-insert="${esc(x.id)}">ใส่ใน Studio</button>
        <button class="btn sm ghost" data-ren="${esc(x.id)}" title="เปลี่ยนชื่อ">✎</button>
        <button class="btn sm ghost danger" data-del="${esc(x.id)}" title="ลบ">🗑</button>
      </div>
    </div>`).join('') : '<p class="empty">ยังไม่มีโมเดลในคลัง ทุกโมเดลที่สร้างจะถูกเก็บไว้ที่นี่ หรือกด “เก็บเข้าคลัง” ในหน้าปรับแต่ง</p>';
}
$('#libSearch').addEventListener('input', renderLibrary);
$('#libFav').addEventListener('change', renderLibrary);
$('#libGrid').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.insert) {
    const d = await busy(b, () => api('/api/library/insert', { method: 'POST', body: { id: b.dataset.insert } }));
    toast(d.failedMeshes ? `ใส่แล้ว แต่โหลดเมชไม่ได้ ${d.failedMeshes} ชิ้น (เมชอาจเป็นของบัญชีอื่น)` : 'ใส่ใน Studio หน้ากล้องแล้ว', d.failedMeshes ? 'info' : 'ok');
  }
  if (b.dataset.fav) {
    const x = lib.find((i) => i.id === b.dataset.fav);
    x.favorite = !x.favorite;
    await api('/api/library/update', { method: 'POST', body: { id: x.id, favorite: x.favorite } });
    renderLibrary();
  }
  if (b.dataset.ren) {
    const x = lib.find((i) => i.id === b.dataset.ren);
    const name = prompt('ชื่อใหม่', x.name);
    if (!name) return;
    await api('/api/library/update', { method: 'POST', body: { id: x.id, name } });
    loadLibrary();
  }
  if (b.dataset.del) {
    if (!confirm('ลบออกจากคลัง? (ไม่กระทบของที่อยู่ใน Studio)')) return;
    await api('/api/library/delete', { method: 'POST', body: { id: b.dataset.del } });
    loadLibrary();
  }
});
$('#libImport').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const r = await api('/api/library/import', { method: 'POST', raw: await f.text(), headers: { 'Content-Type': 'application/json' } });
    toast(`นำเข้าแล้ว ${r.imported} ชิ้น`);
    loadLibrary();
  } catch (err) { toast(err.message, 'err'); }
  e.target.value = '';
});

// ------------------------------------------------------------------ store

let storeItems = [];
$('#storeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#storeQ').value.trim();
  if (!q) return;
  const btn = $('#storeForm button[type=submit]');
  $('#storeGrid').innerHTML = '<p class="empty">กำลังค้นหา…</p>';
  try {
    const r = await busy(btn, () => api(`/api/store/search?q=${encodeURIComponent(q)}`));
    storeItems = r.items;
    $('#storeGrid').innerHTML = storeItems.length ? storeItems.map((a) => `
      <div class="tile">
        <div class="img">${a.thumb ? `<img src="${esc(a.thumb)}" alt="" loading="lazy">` : '⬇'}</div>
        <div class="body">
          <div class="t" title="${esc(a.name)}">${esc(a.name)}</div>
          <div class="d">${esc(a.creator)}${a.verified ? ' ✔' : ''}</div>
        </div>
        <div class="acts">
          <button class="btn sm primary" data-ins="${esc(a.assetId)}">วางหน้ากล้อง</button>
          <a class="btn sm ghost" href="https://create.roblox.com/store/asset/${esc(a.assetId)}" target="_blank" rel="noopener" title="ดูในเว็บ Roblox">↗</a>
        </div>
      </div>`).join('') : `<p class="empty">ไม่เจอของฟรีที่ตรงกับ “${esc(q)}” ลองคำภาษาอังกฤษดู</p>`;
  } catch { $('#storeGrid').innerHTML = ''; }
});
$('#storeGrid').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-ins]');
  if (!b) return;
  const a = storeItems.find((x) => x.assetId === b.dataset.ins);
  await busy(b, () => api('/api/store/insert', { method: 'POST', body: { assetId: a.assetId, name: a.name, keepScripts: $('#keepScripts').checked } }),
    (r) => `วางแล้ว${r[0]?.removedScripts ? ` · ลบสคริปต์ ${r[0].removedScripts} ตัว` : ''}`);
});

// ------------------------------------------------------------------ settings

async function loadSettings() {
  try {
    const s = await api('/api/settings');
    $('#setExe').value = s.studioMcpPath || '';
    $('#setThumb').checked = s.autoThumbnail;
    $('#setOpen').checked = s.openBrowser;
    $('#setHf').value = '';
    $('#setHfState').textContent = s.hasHfToken ? '✔ ใส่ไว้แล้ว (เว้นว่างไว้ถ้าไม่เปลี่ยน)' : 'ยังไม่ได้ใส่';
    $('#setOc').value = '';
    $('#setOcState').textContent = s.hasOpenCloudKey ? '✔ ใส่ไว้แล้ว (เว้นว่างไว้ถ้าไม่เปลี่ยน)' : 'ยังไม่ได้ใส่ — จะได้ไฟล์ .glb ไว้นำเข้าเอง';
    $('#setGroup').value = s.robloxGroupId || '';
    $('#setExeFound').textContent = status.exe ? `ใช้อยู่: ${status.exe}` : '';
    $('#verText').textContent = `Sweetprops ${status.version || ''}`;
    const { logs } = await api('/api/logs');
    $('#logs').textContent = logs.join('\n') || '—';
  } catch (err) { toast(err.message, 'err'); }
}
$('#saveSettings').addEventListener('click', (e) => busy(e.currentTarget, () => api('/api/settings', {
  method: 'POST', body: (() => {
    const b = { studioMcpPath: $('#setExe').value.trim(), autoThumbnail: $('#setThumb').checked, openBrowser: $('#setOpen').checked, robloxGroupId: $('#setGroup').value.trim() };
    if ($('#setHf').value.trim()) b.hfToken = $('#setHf').value.trim();
    if ($('#setOc').value.trim()) b.openCloudKey = $('#setOc').value.trim();
    return b;
  })(),
}), 'บันทึกแล้ว').then(() => { refreshStatus(); loadSettings(); }));
$('#testConn').addEventListener('click', (e) => busy(e.currentTarget, async () => {
  await api('/api/connect', { method: 'POST' });
  await refreshStatus();
  if (!status.studios.length) throw new Error(status.error || 'ต่อ StudioMCP ได้ แต่ยังไม่เจอ Studio');
  return status;
}, (s) => `เชื่อมต่อได้ · ${s.studios.length} Studio`).then(loadSettings, loadSettings));

// ------------------------------------------------------------------ command palette

const COMMANDS = [
  { t: 'สร้างโมเดลใหม่', k: 'create new สร้าง', run: () => { location.hash = '#create'; $('#prompt').focus(); }, global: true },
  { t: 'ใช้ตัวที่เลือกใน Studio', k: 'selection เลือก', run: () => { location.hash = '#customize'; setTimeout(() => $('#useSelection').click(), 50); }, global: true },
  { t: 'รวมของที่เลือกเป็น Model', k: 'group รวม model', run: () => $('#groupSel').click(), global: true },
  { t: 'เปิดคลัง', k: 'library คลัง', run: () => { location.hash = '#library'; }, global: true },
  { t: 'ค้นของฟรี', k: 'store free ฟรี', run: () => { location.hash = '#store'; $('#storeQ').focus(); }, global: true },
  { t: 'ดูในกล้อง', k: 'focus camera กล้อง', act: 'select' },
  { t: 'วางหน้ากล้อง', k: 'place front วาง', act: 'placeFront' },
  { t: 'วางลงพื้น', k: 'ground drop พื้น', act: 'dropToGround' },
  { t: 'หมุน 90°', k: 'rotate หมุน', act: 'rotY' },
  { t: 'กลับหน้า 180°', k: 'turn around flip face กลับหน้า หันหลัง', act: 'turn' },
  { t: 'ขยาย ×2', k: 'scale bigger ขยาย ใหญ่', act: 'double' },
  { t: 'ย่อ ×0.5', k: 'scale smaller ย่อ เล็ก', act: 'half' },
  { t: 'จัดให้พร้อมใช้', k: 'finalize ready pivot anchor พร้อม', act: 'finalize' },
  { t: 'ลดภาระเกม', k: 'optimize performance ลื่น ภาระ', act: 'optimize' },
  { t: 'ลบสคริปต์ข้างใน', k: 'strip scripts สคริปต์', act: 'stripScripts' },
  { t: 'ยึดกับที่', k: 'anchor ยึด', act: 'anchorOn' },
  { t: 'ทะลุได้', k: 'collide ทะลุ ชน', act: 'collideOff' },
  { t: 'ก๊อปเป็นแถว', k: 'duplicate copy ก๊อป แถว', act: 'duplicate' },
  { t: 'โปรยรอบ ๆ', k: 'scatter random โปรย ป่า', act: 'scatter' },
  { t: 'เก็บเข้าคลัง', k: 'save library เก็บ', act: 'save' },
  { t: 'ย้อมสี (เก็บลาย)', k: 'tint dye ย้อม สี', act: 'tint' },
  { t: 'ทองเงา + อัญมณีแก้ว', k: 'restyle gold gem ทอง อัญมณี วัสดุ', act: 'restyle' },
  { t: 'แขวนจี้คริสตัล', k: 'pendant crystal จี้ แขวน', act: 'pendants' },
  { t: 'โปรยดอกซากุระ', k: 'flower sakura ดอกไม้ ซากุระ', act: 'decorate' },
  { t: 'แปลงเป็น Accessory ใส่ตัวละคร', k: 'accessory wear ใส่ ตัวละคร', act: 'accessory' },
  { t: 'แปลงเป็น Tool ถือในมือ', k: 'tool hold ถือ มือ อาวุธ', act: 'tool' },
  ...EFFECTS.map(([k, th]) => ({ t: `เอฟเฟกต์: ${th}`, k: `effect fx ${k} ${th}`, fx: k })),
  ...['#ff7aa8', '#ffcf4d', '#19b394', '#3d7bf2', '#ffffff', '#2b2b2b'].map((c) => ({ t: `ทาสี ${c}`, k: `color สี ${c}`, color: c })),
];
let palIdx = 0;
let palList = [];
function openPalette() {
  $('#palette').hidden = false;
  $('#paletteIn').value = '';
  $('#paletteTarget').textContent = current ? `กำลังทำกับ: ${current.name}` : 'ยังไม่ได้เลือกโมเดล (คำสั่งเกี่ยวกับโมเดลจะใช้ตัวที่เลือกใน Studio)';
  renderPalette();
  $('#paletteIn').focus();
}
function closePalette() { $('#palette').hidden = true; }
function renderPalette() {
  const q = $('#paletteIn').value.trim().toLowerCase();
  palList = COMMANDS.filter((c) => !q || `${c.t} ${c.k}`.toLowerCase().includes(q)).slice(0, 14);
  palIdx = Math.min(palIdx, Math.max(0, palList.length - 1));
  $('#paletteList').innerHTML = palList.map((c, i) => `<li class="${i === palIdx ? 'on' : ''}" data-i="${i}"><span>${esc(c.t)}</span><small>${c.global ? 'ทั่วไป' : 'โมเดล'}</small></li>`).join('') || '<li>ไม่เจอคำสั่ง</li>';
}
async function runCommand(c) {
  closePalette();
  if (c.global) return c.run();
  if (!current) {
    try {
      const list = await api('/api/selection');
      if (!list.length) return toast('เลือกโมเดลใน Studio หรือในหน้าปรับแต่งก่อน', 'err');
      showEditor(list[0]);
    } catch (err) { return toast(err.message, 'err'); }
  }
  if (c.act) return ACTIONS[c.act](null);
  if (c.fx) return propOp(null, 'effect', { kind: c.fx, enabled: true, color: $('#edFxColor').value }, 'ใส่เอฟเฟกต์แล้ว');
  if (c.color) return propOp(null, 'color', { color: c.color }, 'ทาสีแล้ว');
}
$('#paletteIn').addEventListener('input', () => { palIdx = 0; renderPalette(); });
$('#paletteIn').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { palIdx = Math.min(palIdx + 1, palList.length - 1); renderPalette(); e.preventDefault(); }
  if (e.key === 'ArrowUp') { palIdx = Math.max(palIdx - 1, 0); renderPalette(); e.preventDefault(); }
  if (e.key === 'Enter' && palList[palIdx]) runCommand(palList[palIdx]);
  if (e.key === 'Escape') closePalette();
});
$('#paletteList').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-i]');
  if (li) runCommand(palList[+li.dataset.i]);
});
$('#palette').addEventListener('click', (e) => { if (e.target.id === 'palette') closePalette(); });
$('#paletteBtn').addEventListener('click', openPalette);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#palette').hidden ? openPalette() : closePalette(); }
});

// ------------------------------------------------------------------ boot

renderIdeas();
loadOptions().catch((err) => toast(err.message, 'err'));
route();
refreshStatus();
setInterval(refreshStatus, 6000);
pollJobs();
