// Image → textured 3D model (GLB) using free Hugging Face Spaces (TRELLIS by default), via the Gradio HTTP API.
// Free ZeroGPU quota applies; a free Hugging Face token raises it. Nothing here needs extra npm packages.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PROVIDERS = {
  trellis: {
    label: 'TRELLIS (Microsoft) — ลายเหมือนรูป รองรับหลายมุม',
    base: 'https://trellis-community-trellis.hf.space',
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function headers(token, extra = {}) {
  return token ? { Authorization: `Bearer ${token}`, ...extra } : extra;
}

/** Uploads a local file to the Space; returns a Gradio FileData object. */
async function upload(base, file, token) {
  const form = new FormData();
  const buf = fs.readFileSync(file);
  form.append('files', new Blob([buf], { type: file.endsWith('.png') ? 'image/png' : 'image/jpeg' }), path.basename(file));
  const r = await fetch(`${base}/gradio_api/upload`, { method: 'POST', body: form, headers: headers(token) });
  if (!r.ok) throw new Error(`อัปโหลดรูปไป Hugging Face ไม่สำเร็จ (HTTP ${r.status})`);
  const [remote] = await r.json();
  return { path: remote, orig_name: path.basename(file), size: buf.length, mime_type: 'image/png', meta: { _type: 'gradio.FileData' } };
}

/** fn_index for each api_name, read from the Space's /config (cached per Space). */
const fnCache = new Map();
async function fnIndex(base, api, token) {
  if (!fnCache.has(base)) {
    const r = await fetch(`${base}/config`, { headers: headers(token) });
    if (!r.ok) throw new Error(`เปิด Space ไม่ได้ (HTTP ${r.status}) — Space อาจกำลังรีสตาร์ท ลองใหม่อีกครั้ง`);
    const cfg = await r.json();
    const map = new Map();
    (cfg.dependencies || []).forEach((d, i) => { if (d.api_name) map.set(`/${d.api_name}`, d.id ?? i); });
    fnCache.set(base, map);
  }
  const idx = fnCache.get(base).get(api);
  if (idx === undefined) throw new Error(`Space ไม่มีคำสั่ง ${api} (อาจอัปเดตแล้ว)`);
  return idx;
}

/**
 * Runs a named endpoint through the Gradio queue (sse_v3) so calls share one session
 * (TRELLIS keeps per-session files between steps). Returns the output data array.
 */
async function call(base, api, data, { token, session, onLog, timeoutMs = 900_000 } = {}) {
  const fn = await fnIndex(base, api, token);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Join the queue, then listen on the session's event stream (sse_v3).
    const j = await fetch(`${base}/gradio_api/queue/join`, {
      method: 'POST',
      headers: headers(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ data, event_data: null, fn_index: fn, trigger_id: null, session_hash: session }),
    });
    if (!j.ok) throw new Error(`เรียก ${api} ไม่สำเร็จ (HTTP ${j.status}): ${(await j.text()).slice(0, 200)}`);
    const { event_id: eventId } = await j.json();
    const res = await fetch(`${base}/gradio_api/queue/data?session_hash=${session}`, { headers: headers(token, { Accept: 'text/event-stream' }), signal: ctrl.signal });
    if (!res.ok) throw new Error(`ฟังผลจาก Space ไม่ได้ (HTTP ${res.status})`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const line = chunk.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (msg.event_id && msg.event_id !== eventId) continue;
        if (msg.msg === 'estimation' && msg.rank != null) onLog?.(`รอคิว GPU ฟรี (คิวที่ ${msg.rank + 1})…`);
        if (msg.msg === 'process_starts') onLog?.('GPU กำลังประมวลผล…');
        if (msg.msg === 'process_completed') {
          reader.cancel().catch(() => {});
          if (!msg.success) {
            const err = String([msg.title, msg.output?.error, msg.message].filter((x) => x && x !== 'Error').join(' — ') || msg.output?.error || 'Space ตอบกลับว่าเกิดข้อผิดพลาด');
            if (/quota|exceeded|ZeroGPU/i.test(err)) {
              const wait = err.match(/Try again in ([\d:]+)/)?.[1];
              throw new Error(token
                ? `โควต้า GPU ฟรีของบัญชี Hugging Face หมดแล้ว${wait ? ` — ใช้ได้อีกครั้งในอีก ${wait} ชม.` : ''}`
                : 'ต้องใส่ Hugging Face token (สมัครฟรี) ในหน้าตั้งค่าก่อน — แบบไม่ล็อกอินแทบไม่มีโควต้า GPU');
            }
            if (!msg.output?.error && !token) {
              throw new Error('Space ปฏิเสธคำขอ — ส่วนใหญ่เป็นเพราะยังไม่ได้ใส่ Hugging Face token (ฟรี) ในหน้าตั้งค่า');
            }
            throw new Error(`Hugging Face: ${err.slice(0, 300)}`);
          }
          return msg.output?.data || [];
        }
      }
    }
    throw new Error(`การเชื่อมต่อกับ Space หลุดระหว่าง ${api}`);
  } finally {
    clearTimeout(timer);
  }
}

function fileUrl(base, f) {
  if (!f) return null;
  if (typeof f === 'string') return f.startsWith('http') ? f : `${base}/gradio_api/file=${f}`;
  return f.url || (f.path ? `${base}/gradio_api/file=${f.path}` : null);
}

/**
 * Generates a GLB from one main image (+ optional extra views of the same object).
 * Writes it to outDir and returns { file, bytes }.
 */
export async function imageTo3d({ image, views = [], provider = 'trellis', token, outDir, seed, onStep, detail = 'high' }) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error(`ไม่รู้จักผู้ให้บริการ ${provider}`);
  const base = p.base;
  const session = crypto.randomBytes(6).toString('hex');
  const opts = { token, session };

  onStep?.('ส่งรูปไป AI รูป→3D (Hugging Face)…');
  const main = await upload(base, image, token);
  const extra = [];
  for (const v of views.slice(0, 4)) extra.push(await upload(base, v, token));

  await call(base, '/start_session', [], opts).catch(() => {});
  onStep?.('ลบพื้นหลังรูป…');
  // Outputs come back without the FileData marker; add it so the Space treats them as files when sent back.
  const asFile = (f) => ({ ...f, meta: { _type: 'gradio.FileData' } });
  const [prepped0] = await call(base, '/preprocess_image', [main], opts);
  const prepped = asFile(prepped0);
  const multi = [];
  for (const v of extra) {
    const [pv] = await call(base, '/preprocess_image', [v], opts);
    multi.push({ image: asFile(pv), caption: null });
  }

  onStep?.(multi.length ? `สร้างโมเดล 3D จาก ${multi.length + 1} มุม (1–3 นาที รอคิว GPU ฟรี)…` : 'สร้างโมเดล 3D พร้อมลาย (1–3 นาที รอคิว GPU ฟรี)…');
  const out = await call(base, '/generate_and_extract_glb', [
    prepped,
    multi.length ? [{ image: prepped, caption: null }, ...multi] : [],
    Number.isFinite(seed) ? seed : Math.floor(Math.random() * 1e6),
    7.5, 12, 3.0, 12,
    'stochastic',
    detail === 'low' ? 0.97 : detail === 'mid' ? 0.95 : 0.9, // mesh_simplify: lower keeps more triangles
    detail === 'high' ? 2048 : 1024, // texture size
  ], { ...opts, onLog: () => onStep?.('GPU กำลังสร้างโมเดล…') });

  const glb = fileUrl(base, out[2]) || fileUrl(base, out[1]);
  if (!glb) throw new Error('Space ไม่ได้ส่งไฟล์ GLB กลับมา');
  onStep?.('ดาวน์โหลดไฟล์ 3D…');
  const r = await fetch(glb, { headers: headers(token) });
  if (!r.ok) throw new Error(`ดาวน์โหลด GLB ไม่สำเร็จ (HTTP ${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}.glb`);
  fs.writeFileSync(file, buf);
  return { file, bytes: buf.length };
}
