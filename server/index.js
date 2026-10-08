// Sweetprops local server: serves the web UI and a JSON API that drives Roblox Studio via StudioMCP.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { StudioMcp } from './mcp.js';
import { imageTo3d } from './cloud3d.js';
import { runLocal3d, local3dStatus } from './local3d.js';
import { uploadModel } from './opencloud.js';
import { Studio } from './studio.js';
import { ROOT, THUMB_DIR, UPLOAD_DIR, MODEL_DIR, settings, library } from './store.js';
import { STYLES, SIZES, DETAIL, ASPECTS, buildPrompt, buildSize, buildTriangles, cleanPartNames, propName, sanitize } from './prompts.js';

const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const PUBLIC_DIR = path.join(ROOT, 'public');
const logs = [];
function log(...args) {
  const line = `[${new Date().toLocaleTimeString()}] ${args.join(' ')}`;
  logs.push(line);
  if (logs.length > 300) logs.shift();
  console.log(line);
}

const cfg = settings.get();
const mcp = new StudioMcp({ exeOverride: cfg.studioMcpPath || null, log });
mcp.studioId = cfg.studioId || null;
const studio = new Studio(mcp, log);
studio.baseUrl = `http://127.0.0.1:${Number(process.env.PORT) || cfg.port}`;

// ------------------------------------------------------------------ jobs
// Generations take minutes, so they run in a queue (one at a time) and the UI polls.

const jobs = new Map();
let queue = Promise.resolve();

function publicJob(j) {
  const { input, ...rest } = j;
  return { ...rest, prompt: input.prompt, mode: input.mode, image: input.imageId ? `/uploads/${input.imageId}` : null };
}

function enqueue(input) {
  const job = { id: crypto.randomUUID().slice(0, 8), status: 'queued', step: 'รอคิว…', createdAt: Date.now(), items: [], input };
  jobs.set(job.id, job);
  queue = queue.then(() => runJob(job)).catch(() => {});
  return job;
}

/** Builds the list of generator calls for a job: variants × (mesh | parts | image [+ mesh when dual]). */
async function buildTasks(input, rawPrompt, hooks) {
  const partNames = cleanPartNames(input.partNames);
  const variants = Math.max(1, Math.min(4, Number(input.variants) || 1));
  const colorWords = String(input.colorWords || '').trim();
  const meshTask = async () => ({
    tool: 'generate_mesh',
    args: {
      textPrompt: buildPrompt({ ...input, extra: [input.extra, colorWords && `color palette: ${colorWords}`].filter(Boolean).join(', ') }),
      size: buildSize(input),
      maxTriangles: buildTriangles(input),
      ...(await studio.partArgs('generate_mesh', partNames, input.segmentation)),
    },
  });
  const partsTask = async (uri) => ({
    tool: 'generate_procedural_model',
    args: {
      // Procedural model wants the user's own words; style/colors are light hints.
      prompt: sanitize([rawPrompt, STYLES[input.style]?.en, colorWords && `colors: ${colorWords}`].filter(Boolean).join(', ')),
      ...(uri ? { attachedImageUri: uri } : {}),
      ...(await studio.partArgs('generate_procedural_model', partNames, input.segmentation)),
    },
  });

  const tasks = [];
  if (input.imageId) {
    hooks.onStep('ส่งรูปต้นแบบเข้า Studio…');
    const uri = await studio.storeImage(path.join(UPLOAD_DIR, path.basename(input.imageId)));
    for (let i = 0; i < variants; i++) tasks.push(await partsTask(uri));
    if (input.dual && rawPrompt) for (let i = 0; i < variants; i++) tasks.push(await meshTask());
  } else if (input.mode === 'parts') {
    for (let i = 0; i < variants; i++) tasks.push(await partsTask(null));
  } else {
    for (let i = 0; i < variants; i++) tasks.push(await meshTask());
  }
  return tasks.slice(0, 4);
}

async function runJob(job) {
  const input = job.input;
  job.status = 'running';
  job.startedAt = Date.now();
  const hooks = { key: `job_${job.id}`, onStep: (s) => { job.step = s; } };
  try {
    const rawPrompt = String(input.prompt || '').trim();
    let items;
    if (input.mode === 'card') {
      const c = input.card || {};
      const files = [c.left, c.right, c.full].filter(Boolean);
      hooks.onStep('อัปโหลดรูปเข้าบัญชี Roblox ของคุณ…');
      const ids = await studio.uploadImages(files);
      hooks.onStep('สร้างการ์ด 2.5D…');
      const d = await studio.run('card', {
        name: input.name || propName(rawPrompt || 'Card Prop'),
        left: ids[c.left], right: ids[c.right], full: ids[c.full],
        split: !!(c.split && c.left && c.right), aspect: Number(c.aspect) || 1,
        width: Number(input.scaleStuds) || Number(c.width) || 8, angle: Number(c.angle) || 18,
        prompt: rawPrompt || 'card',
      });
      items = [d];
      input.pro = { ...(input.pro || {}), fit: false, restyle: 'off', pendants: 0, decor: [] };
    } else if (input.mode === 'cloud3d') {
      // Real image → 3D via a free Hugging Face Space, then into Roblox (auto with Open Cloud, else manual import).
      const cfgNow = settings.get();
      const up = (f) => path.join(UPLOAD_DIR, path.basename(f));
      // Prefer the free offline engine on this PC; fall back to Hugging Face only if a token was set.
      let file;
      if (local3dStatus().installed || !cfgNow.hfToken) {
        file = path.join(MODEL_DIR, `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 6)}.glb`);
        await runLocal3d({ image: up(input.imageId), out: file, detail: input.detail, onStep: hooks.onStep });
      } else {
        ({ file } = await imageTo3d({
          image: up(input.imageId),
          views: (input.views || []).map(up),
          token: cfgNow.hfToken,
          outDir: MODEL_DIR,
          detail: input.detail,
          onStep: hooks.onStep,
        }));
      }
      job.glb = `/models/${path.basename(file)}`;
      if (!cfgNow.openCloudKey) {
        job.manual = { file, url: job.glb };
        items = [];
      } else {
        hooks.onStep('อัปโหลดโมเดลเข้าบัญชี Roblox (Open Cloud)…');
        const who = await studio.run('whoami').catch(() => ({}));
        const assetId = await uploadModel({
          apiKey: cfgNow.openCloudKey,
          userId: cfgNow.robloxUserId || who.userId,
          groupId: cfgNow.robloxGroupId || undefined,
          file,
          name: input.name || propName(rawPrompt || 'Sweet 3D'),
        });
        hooks.onStep('ใส่โมเดลเข้า Studio…');
        const key = `job_${job.id}`;
        await studio.run('snapshot', { key });
        await mcp.studio('insert_asset', { assetId, assetName: input.name || propName(rawPrompt || 'Sweet3D'), assetType: 'Model' });
        items = [];
        for (let i = 0; i < 10 && !items.length; i++) {
          items = await studio.run('diff', { prompt: rawPrompt || '3d from image', key });
          if (!items.length) await new Promise((r) => setTimeout(r, 1000));
        }
        if (!items.length) throw new Error(`อัปโหลดแล้ว (asset ${assetId}) แต่ใส่เข้า Studio ไม่สำเร็จ ลองลากจาก Toolbox › Inventory`);
      }
    } else {
      const tasks = await buildTasks(input, rawPrompt, hooks);
      items = await studio.generateMany(tasks, rawPrompt, hooks);
    }

    job.status = 'finishing';
    const fin = { ...settings.get().defaultFinalize, ...(input.finalize || {}) };
    const pro = input.pro || {};
    const pal = input.palette || {};
    const targetStuds = Number(input.scaleStuds) || Math.max(...Object.values(buildSize(input)));
    const baseName = input.name || propName(rawPrompt || 'Image Prop');
    const results = [];
    for (let i = 0; i < items.length; i++) {
      const target = { id: items[i].id };
      const label = items.length > 1 ? ` (แบบ ${i + 1}/${items.length})` : '';
      job.step = `ตั้งค่าให้พร้อมใช้${label}…`;
      let d = await studio.finalize(target, { ...fin, place: false, select: false, name: items.length > 1 ? `${baseName}_${i + 1}` : baseName });
      if (pro.fit !== false && targetStuds > 0) d = await studio.run('scale', { target, studs: targetStuds });
      try {
        if (pro.tint) {
          job.step = `ย้อมสีตามรูป${label}…`;
          d = await studio.run('tint', { target, color: pro.tint });
        }
        if (pro.restyle && pro.restyle !== 'off') {
          job.step = `จัดวัสดุมือโปร${label}…`;
          d = await studio.run('restyle', { target, mode: pro.restyle, palette: pal });
        }
        if (Number(pro.pendants) > 0) {
          job.step = `แขวนจี้คริสตัล${label}…`;
          d = await studio.run('hangPendants', { target, count: Number(pro.pendants), color: pal.accent, metal: pal.metal });
        }
        for (const dec of pro.decor || []) {
          job.step = `แต่ง${label}…`;
          d = await studio.run('decorate', { target, kind: dec.kind, count: dec.count, color: pal.secondary || pal.primary, color2: pal.metal });
        }
      } catch (err) { log('pro step failed:', err.message); }
      if (input.effects?.length) {
        job.step = `ใส่เอฟเฟกต์${label}…`;
        d = (await studio.applyEffects(target, input.effects, input.effectColor)) || d;
      }
      results.push(d);
    }
    if (fin.place !== false && results.length) {
      job.step = 'วางเรียงหน้ากล้อง…';
      const placed = await studio.run('arrange', { targets: results.map((r) => ({ id: r.id })) });
      placed.forEach((p, i) => { results[i] = { ...results[i], ...p }; });
      // ProceduralModels rebuild their parts a moment after being scaled/moved; settle them on the ground again.
      if (results.some((r) => r.className === 'ProceduralModel')) {
        await new Promise((r) => setTimeout(r, 1500));
        for (const r of results) {
          if (r.className === 'ProceduralModel') await studio.run('dropToGround', { target: { id: r.id } }).catch(() => {});
        }
      }
    }
    if (settings.get().autoThumbnail) {
      for (const d of results) {
        job.step = 'ถ่ายรูปเก็บเข้าคลัง…';
        try {
          const saved = await studio.saveToLibrary({ id: d.id }, { prompt: rawPrompt, mode: input.imageId ? 'image' : input.mode, style: input.style });
          d.libraryId = saved.id;
          d.thumb = saved.thumb ? `/thumbs/${saved.thumb}` : null;
        } catch (err) { log('save to library failed:', err.message); }
      }
    }
    job.items = results;
    job.status = 'done';
    job.step = job.manual ? 'ได้ไฟล์ 3D แล้ว — กด “นำเข้า Studio” เพื่อดูวิธี' : results.length > 1 ? `เสร็จแล้ว ${results.length} แบบ — เลือกอันที่ชอบ` : 'เสร็จแล้ว';
  } catch (err) {
    job.status = 'error';
    job.error = err.message;
    job.step = 'ไม่สำเร็จ';
    log('job failed:', err.stack || err.message);
  } finally {
    job.finishedAt = Date.now();
  }
}

// ------------------------------------------------------------------ http helpers

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.glb': 'model/gltf-binary',
};

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const payload = isBuf || typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': isBuf ? 'application/octet-stream' : (typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8'), 'Cache-Control': 'no-store', ...headers });
  res.end(payload);
}

function serveFile(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

function readBody(req, limit = 12 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('ไฟล์ใหญ่เกินไป')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function json(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  return JSON.parse(buf.toString('utf8'));
}

/** Resolves a path under base, refusing anything that escapes it. */
function safeJoin(base, rel) {
  const p = path.resolve(base, '.' + path.sep + decodeURIComponent(rel));
  return p.startsWith(base + path.sep) || p === base ? p : null;
}

// Ops the UI may call directly on a prop.
const PROP_OPS = new Set(['describe', 'select', 'placeFront', 'dropToGround', 'scale', 'rotate', 'rename', 'remove', 'color',
  'material', 'physics', 'effect', 'duplicate', 'scatter', 'stripScripts', 'optimize', 'finalize', 'restyle', 'hangPendants', 'decorate', 'tint', 'replaceColor', 'colors']);

// ------------------------------------------------------------------ routes

const routes = {
  'GET /api/status': async () => {
    let studios = [];
    let error = null;
    try { studios = await mcp.listStudios(); } catch (err) { error = err.message; }
    return {
      version: VERSION,
      connected: mcp.connected,
      exe: mcp.exePath,
      studios,
      studioId: mcp.studioId || studios[0]?.id || null,
      error,
      busy: [...jobs.values()].filter((j) => ['queued', 'running', 'finishing'].includes(j.status)).length,
    };
  },

  'POST /api/connect': async () => {
    await mcp.reconnect();
    return { ok: true, exe: mcp.exePath };
  },

  'GET /api/options': async () => ({ styles: STYLES, sizes: SIZES, detail: DETAIL, aspects: Object.keys(ASPECTS) }),

  'GET /api/settings': async () => {
    const { hfToken, openCloudKey, ...rest } = settings.get();
    return { ...rest, hasHfToken: !!hfToken, hasOpenCloudKey: !!openCloudKey, local3d: local3dStatus() };
  },
  'POST /api/settings': async (req) => {
    const body = await json(req);
    const allowed = ['studioMcpPath', 'studioId', 'openBrowser', 'autoThumbnail', 'defaultFinalize', 'hfToken', 'openCloudKey', 'robloxGroupId'];
    const patch = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));
    for (const k of ['hfToken', 'openCloudKey']) if (k in patch) patch[k] = String(patch[k] || '').trim();
    const next = settings.set(patch);
    if ('studioMcpPath' in patch) { mcp.exeOverride = next.studioMcpPath || null; await mcp.close(); }
    if ('studioId' in patch) mcp.studioId = next.studioId || null;
    const { hfToken, openCloudKey, ...rest } = next;
    return { ...rest, hasHfToken: !!hfToken, hasOpenCloudKey: !!openCloudKey };
  },

  // Opens Explorer with the generated 3D file selected (for Studio's Import 3D).
  'POST /api/reveal': async (req) => {
    const { url } = await json(req);
    const f = safeJoin(MODEL_DIR, String(url || '').replace(/^\/models\//, ''));
    if (!f || !fs.existsSync(f)) throw Object.assign(new Error('ไม่พบไฟล์'), { status: 404 });
    exec(`explorer /select,"${f}"`);
    return { ok: true, file: f };
  },

  'GET /api/logs': async () => ({ logs }),

  'POST /api/upload': async (req) => {
    const type = String(req.headers['content-type'] || '');
    const ext = type.includes('png') ? 'png' : (type.includes('jpeg') || type.includes('jpg')) ? 'jpg' : null;
    if (!ext) throw Object.assign(new Error('รองรับเฉพาะ PNG หรือ JPG'), { status: 400 });
    const buf = await readBody(req, 5 * 1024 * 1024);
    const id = `${crypto.randomUUID().slice(0, 12)}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, id), buf);
    return { imageId: id, url: `/uploads/${id}` };
  },

  'POST /api/generate': async (req) => {
    const body = await json(req);
    const hasCard = body.mode === 'card' && (body.card?.full || (body.card?.left && body.card?.right));
    if (body.mode === 'cloud3d' && !body.imageId) throw Object.assign(new Error('อัปรูปต้นแบบก่อน'), { status: 400 });
    if (!String(body.prompt || '').trim() && !body.imageId && !hasCard) throw Object.assign(new Error('พิมพ์สิ่งที่อยากได้ หรืออัปรูปต้นแบบก่อน'), { status: 400 });
    await mcp.resolveStudio(); // fail fast if Studio isn't open
    return publicJob(enqueue(body));
  },

  'GET /api/jobs': async () => [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 30).map(publicJob),

  'POST /api/jobs/clear': async () => {
    for (const [id, j] of jobs) if (['done', 'error'].includes(j.status)) jobs.delete(id);
    return { ok: true };
  },

  'GET /api/props': async (req, url) => studio.run('list', { onlyTagged: url.searchParams.get('tagged') === '1' }),
  'GET /api/selection': async () => studio.run('selection'),
  'GET /api/studio-info': async () => studio.run('studioInfo'),

  'POST /api/props/op': async (req) => {
    const { op: name, ...args } = await json(req);
    if (!PROP_OPS.has(name)) throw Object.assign(new Error(`ไม่รู้จักคำสั่ง ${name}`), { status: 400 });
    return studio.run(name, args);
  },

  'POST /api/props/group': async (req) => studio.run('group', await json(req)),

  'GET /api/rigs': async () => studio.run('rigs'),

  'POST /api/props/tool': async (req) => {
    const { target, length } = await json(req);
    return studio.run('toTool', { target, length: Number(length) || undefined });
  },

  'POST /api/props/arrange': async (req) => {
    const { targets } = await json(req);
    if (!Array.isArray(targets) || !targets.length) throw Object.assign(new Error('ไม่มีโมเดลให้จัดเรียง'), { status: 400 });
    return studio.run('arrange', { targets });
  },

  'POST /api/props/accessory': async (req) => {
    const { target, rig, width, slot } = await json(req);
    return studio.run('toAccessory', { target, rig: rig || undefined, width: Number(width) || undefined, slot });
  },

  // Particle textures (petal/heart) drawn by the browser, uploaded once to the user's Roblox account and remembered.
  'GET /api/fx-textures': async () => settings.get().fxAssets || {},
  'POST /api/fx-textures': async (req) => {
    const { petal, heart } = await json(req);
    const files = [petal, heart].filter(Boolean);
    if (!files.length) throw Object.assign(new Error('ไม่มีรูป'), { status: 400 });
    const ids = await studio.uploadImages(files);
    const fx = { ...(settings.get().fxAssets || {}) };
    if (petal) fx.petal = ids[petal];
    if (heart) fx.heart = ids[heart];
    settings.set({ fxAssets: fx });
    return fx;
  },

  'POST /api/props/save': async (req) => {
    const { target } = await json(req);
    const item = await studio.saveToLibrary(target);
    return { ...item, data: undefined };
  },

  'POST /api/props/ai-material': async (req) => studio.aiMaterial(await json(req)),

  'GET /api/library': async () => library.all().map(({ data, ...rest }) => ({ ...rest, thumb: rest.thumb ? `/thumbs/${rest.thumb}` : null })),

  'POST /api/library/insert': async (req) => {
    const { id } = await json(req);
    const item = library.get(id);
    if (!item) throw Object.assign(new Error('ไม่พบในคลัง'), { status: 404 });
    return studio.insertFromLibrary(item);
  },

  'POST /api/library/update': async (req) => {
    const { id, name, favorite } = await json(req);
    const item = library.get(id);
    if (!item) throw Object.assign(new Error('ไม่พบในคลัง'), { status: 404 });
    const patch = { id };
    if (typeof name === 'string') patch.name = name.slice(0, 60);
    if (typeof favorite === 'boolean') patch.favorite = favorite;
    library.upsert(patch);
    return { ok: true };
  },

  'POST /api/library/delete': async (req) => {
    const { id } = await json(req);
    library.remove(id);
    return { ok: true };
  },

  'GET /api/library/export': async () => ({ __file: true, name: 'sweetprops-library.json', body: JSON.stringify(library.all(), null, 2) }),

  'POST /api/library/import': async (req) => {
    const list = await json(req);
    if (!Array.isArray(list)) throw Object.assign(new Error('ไฟล์ไม่ถูกต้อง'), { status: 400 });
    let n = 0;
    for (const it of list) {
      if (it?.id && it?.data?.root) { library.upsert({ ...it, thumb: null }); n++; }
    }
    return { imported: n };
  },

  'GET /api/store/search': async (req, url) => studio.searchStore(url.searchParams.get('q') || ''),
  'POST /api/store/insert': async (req) => studio.insertFromStore(await json(req)),
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  // Only accept requests addressed to this machine (blocks DNS-rebinding from web pages).
  const host = String(req.headers.host || '').split(':')[0];
  if (!['127.0.0.1', 'localhost'].includes(host)) return send(res, 403, { error: 'forbidden' });
  if (req.method !== 'GET' && req.headers.origin && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.origin)) {
    return send(res, 403, { error: 'forbidden origin' });
  }

  const route = routes[`${req.method} ${url.pathname}`];
  if (route) {
    try {
      const out = await route(req, url);
      if (out?.__file) return send(res, 200, out.body, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${out.name}"` });
      return send(res, 200, out ?? { ok: true });
    } catch (err) {
      log(`${req.method} ${url.pathname} →`, err.message);
      return send(res, err.status || 500, { error: err.message });
    }
  }

  if (req.method === 'GET') {
    if (url.pathname.startsWith('/thumbs/')) {
      const f = safeJoin(THUMB_DIR, url.pathname.slice(8));
      return f ? serveFile(res, f) : send(res, 404, { error: 'not found' });
    }
    if (url.pathname.startsWith('/models/')) {
      const f = safeJoin(MODEL_DIR, url.pathname.slice(8));
      return f ? serveFile(res, f) : send(res, 404, { error: 'not found' });
    }
    if (url.pathname.startsWith('/uploads/')) {
      const f = safeJoin(UPLOAD_DIR, url.pathname.slice(9));
      return f ? serveFile(res, f) : send(res, 404, { error: 'not found' });
    }
    const f = safeJoin(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    return f ? serveFile(res, f) : send(res, 404, { error: 'not found' });
  }
  send(res, 404, { error: 'not found' });
});

const port = Number(process.env.PORT) || cfg.port;
server.listen(port, '127.0.0.1', () => {
  const link = `http://127.0.0.1:${port}/#create`;
  log(`Sweetprops ${VERSION} พร้อมใช้งานที่ ${link}`);
  mcp.connect().catch((err) => log('StudioMCP:', err.message));
  if (cfg.openBrowser && !process.env.NO_BROWSER) exec(`start "" "${link}"`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log(`พอร์ต ${port} ถูกใช้อยู่ — Sweetprops อาจเปิดอยู่แล้ว ลองเปิด http://127.0.0.1:${port}`);
    process.exit(1);
  }
  throw err;
});

const shutdown = async () => { await mcp.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
