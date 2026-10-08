// High-level Studio actions built on StudioMCP tools + our Luau ops.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { op, extractResult } from './luau.js';
import { THUMB_DIR, library, settings } from './store.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Studio {
  constructor(mcp, log = () => {}) {
    this.mcp = mcp;
    this.log = log;
  }

  async run(name, args = {}, opts) {
    const res = await this.mcp.luau(op(name, args), opts);
    return extractResult(res.text);
  }

  // -------------------------------------------------------------- generation

  /** Waits for an async job (if any), then finds what the generator inserted: by its tag first, then by diff. */
  async collectNew(result, prompt, { onStep, key } = {}) {
    const jobId = result.json?.jobId;
    if (jobId) {
      onStep?.('รอ Roblox สร้างให้เสร็จ…');
      const w = await this.mcp.studio('wait_job_finished', { jobId, timeout: 600 }, { timeoutMs: 660_000 });
      const st = String(w.json?.status || w.text);
      if (/failed|cancel/i.test(st) && !/completed/i.test(st)) throw new Error(`การสร้างไม่สำเร็จ: ${w.text.slice(0, 200)}`);
      if (w.json?.tag && !result.json?.tag) result.json.tag = w.json.tag;
    }
    onStep?.('หาโมเดลที่เพิ่งสร้าง…');
    const tag = result.json?.tag;
    for (let i = 0; i < 20; i++) {
      if (tag) {
        const tagged = await this.run('byTag', { tag, prompt, key });
        if (tagged.length) return tagged;
      }
      const items = await this.run('diff', { prompt, key });
      if (items.length) return items;
      await sleep(1500);
    }
    // Some versions return an asset id instead of inserting it.
    const assetId = result.json?.assetId || result.text.match(/rbxassetid:\/\/(\d+)/)?.[1];
    if (assetId) {
      await this.mcp.studio('insert_asset', { assetId: String(assetId), assetName: 'SweetProp' });
      const items = await this.run('diff', { prompt, key });
      if (items.length) return items;
    }
    throw new Error(`สร้างเสร็จแต่หาโมเดลใน Workspace ไม่เจอ (ผลจาก Studio: ${result.text.slice(0, 200)})`);
  }

  /** Adds partNames/segmentation in whichever form this StudioMCP version understands. */
  async partArgs(tool, partNames, segmentation) {
    const out = {};
    const names = partNames ? partNames.split(',').map((x) => x.trim()).filter(Boolean) : [];
    const hasSeg = await this.mcp.supports(tool, 'segmentation');
    if (names.length) {
      out.partNames = (hasSeg ? names.slice(0, 8) : names).join(', ');
      if (hasSeg) out.segmentation = 'explicit';
    } else if (hasSeg && segmentation === 'none') {
      out.segmentation = 'none';
    }
    return out;
  }

  async generateMesh({ textPrompt, size, maxTriangles, partNames, segmentation, rawPrompt }, hooks = {}) {
    await this.run('snapshot', { key: hooks.key });
    hooks?.onStep?.('ส่งให้ AI ของ Roblox สร้างเมช (1–3 นาที)…');
    const args = { textPrompt, size, maxTriangles, ...(await this.partArgs('generate_mesh', partNames, segmentation)) };
    const res = await this.mcp.studio('generate_mesh', args, { timeoutMs: 600_000 });
    this.log('generate_mesh →', res.text.slice(0, 500));
    return this.collectNew(res, rawPrompt, hooks);
  }

  async generateParts({ prompt, imagePath, partNames, segmentation, rawPrompt }, hooks = {}) {
    await this.run('snapshot', { key: hooks.key });
    const args = { prompt, ...(await this.partArgs('generate_procedural_model', partNames, segmentation)) };
    if (imagePath) {
      hooks?.onStep?.('ส่งรูปต้นแบบเข้า Studio…');
      const img = await this.mcp.studio('store_image', { filePath: imagePath });
      const uri = img.json?.uri || img.json?.imageUri || img.text.match(/IMAGEID_[\w-]+/)?.[0];
      if (!uri) throw new Error(`อัปรูปไม่สำเร็จ: ${img.text.slice(0, 200)}`);
      args.attachedImageUri = uri;
    }
    hooks?.onStep?.(imagePath ? 'ให้ AI ของ Roblox ประกอบโมเดลตามรูป (1–3 นาที)…' : 'ให้ AI ของ Roblox ประกอบโมเดลจากชิ้นส่วน (1–3 นาที)…');
    const res = await this.mcp.studio('generate_procedural_model', args, { timeoutMs: 600_000 });
    this.log('generate_procedural_model →', res.text.slice(0, 500));
    return this.collectNew(res, rawPrompt, hooks);
  }

  /**
   * Uploads images we serve from /uploads to the user's Roblox account (free, via StudioMCP).
   * Returns { fileId: 'rbxassetid://…' }. New uploads can take a moment to pass moderation before they render.
   */
  async uploadImages(fileIds) {
    const urls = fileIds.map((f) => `${this.baseUrl}/uploads/${encodeURIComponent(path.basename(f))}`);
    const res = await this.mcp.studio('upload_image', { imagePaths: urls }, { timeoutMs: 300_000 });
    this.log('upload_image →', res.text.slice(0, 400));
    const map = res.json?.results || res.json || {};
    const out = {};
    fileIds.forEach((f, i) => {
      const v = map[urls[i]] ?? Object.entries(map).find(([k]) => k.includes(path.basename(f)))?.[1];
      const id = typeof v === 'string' ? v : (v?.assetId || v?.id);
      if (!id) throw new Error(`อัปโหลดรูปเข้า Roblox ไม่สำเร็จ: ${res.text.slice(0, 200)}`);
      out[f] = /^\d+$/.test(String(id)) ? `rbxassetid://${id}` : String(id);
    });
    return out;
  }

  /** Uploads a local reference image into Studio and returns its IMAGEID_ uri. */
  async storeImage(imagePath) {
    const img = await this.mcp.studio('store_image', { filePath: imagePath });
    const uri = img.json?.uri || img.json?.imageUri || img.text.match(/IMAGEID_[\w-]+/)?.[0];
    if (!uri) throw new Error(`อัปรูปไม่สำเร็จ: ${img.text.slice(0, 200)}`);
    return uri;
  }

  /**
   * Runs several generations (variants and/or mesh + image-parts) and returns everything they inserted.
   * Uses StudioMCP's async jobs to run them in parallel when available, otherwise one after another.
   * Each task: { tool: 'generate_mesh' | 'generate_procedural_model', args }.
   */
  async generateMany(tasks, rawPrompt, hooks = {}) {
    const { key, onStep } = hooks;
    await this.run('snapshot', { key });
    const parallel = tasks.length > 1 && await this.mcp.supports(tasks[0].tool, 'async');
    const tags = [];
    const failures = [];
    if (parallel) {
      onStep?.(`ให้ AI ของ Roblox สร้างพร้อมกัน ${tasks.length} แบบ (1–4 นาที)…`);
      const started = await Promise.all(tasks.map((t) => this.mcp.studio(t.tool, { ...t.args, async: true }, { timeoutMs: 120_000 })));
      const waits = started.map(async (res, i) => {
        this.log(`${tasks[i].tool} (async) →`, res.text.slice(0, 300));
        if (res.json?.tag) tags.push(res.json.tag);
        const jobId = res.json?.jobId;
        if (!jobId) return;
        let w = await this.mcp.studio('wait_job_finished', { jobId, timeout: 900 }, { timeoutMs: 960_000 });
        this.log('wait_job_finished →', w.text.slice(0, 300));
        if (/moderation/i.test(w.text)) failures.push('moderation');
        else if (/"status"\s*:\s*"Failed"/.test(w.text)) failures.push(w.text.match(/"(?:text|details|errorMessage)"\s*:\s*"([^"]{0,160})/)?.[1] || 'failed');
        // Roblox sometimes can't split a prompt into parts; retry that variant as a single piece.
        if (/segmentation failed/i.test(w.text) && tasks[i].args.segmentation !== 'none') {
          onStep?.('Roblox แยกชิ้นไม่สำเร็จ — ลองใหม่แบบชิ้นเดียว…');
          w = await this.mcp.studio(tasks[i].tool, { ...tasks[i].args, segmentation: 'none', partNames: undefined }, { timeoutMs: 600_000 });
          this.log(`${tasks[i].tool} (retry) →`, w.text.slice(0, 300));
        }
        const tag = w.json?.tag || w.json?.result?.tag || w.text.match(/"tag"\s*:\s*"([^"]+)"/)?.[1];
        if (tag) tags.push(tag);
      });
      const settled = await Promise.allSettled(waits);
      const failed = settled.filter((s) => s.status === 'rejected');
      if (failed.length === settled.length) throw failed[0].reason;
    } else {
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        onStep?.(tasks.length > 1 ? `กำลังสร้างแบบที่ ${i + 1}/${tasks.length} (1–3 นาที)…` : (t.tool === 'generate_mesh' ? 'ส่งให้ AI ของ Roblox สร้างเมช (1–3 นาที)…' : 'ให้ AI ของ Roblox ประกอบโมเดล (1–3 นาที)…'));
        let res;
        try {
          res = await this.mcp.studio(t.tool, t.args, { timeoutMs: 600_000 });
        } catch (err) {
          if (!/segmentation failed/i.test(err.message) || !(await this.mcp.supports(t.tool, 'segmentation'))) throw err;
          onStep?.('Roblox แยกชิ้นไม่สำเร็จ — ลองใหม่แบบชิ้นเดียว…');
          res = await this.mcp.studio(t.tool, { ...t.args, segmentation: 'none', partNames: undefined }, { timeoutMs: 600_000 });
        }
        this.log(`${t.tool} →`, res.text.slice(0, 300));
        if (res.json?.tag) tags.push(res.json.tag);
      }
    }

    onStep?.('หาโมเดลที่เพิ่งสร้าง…');
    const found = new Map();
    for (let i = 0; i < 20; i++) {
      for (const tag of tags) for (const it of await this.run('byTag', { tag, prompt: rawPrompt, key })) found.set(it.id, it);
      for (const it of await this.run('diff', { prompt: rawPrompt, key })) found.set(it.id, it);
      if (found.size >= tasks.length) break;
      if (found.size && i >= 3) break;
      await sleep(1500);
    }
    if (!found.size) {
      if (failures.length && failures.every((f) => f === 'moderation')) {
        throw new Error('Roblox ไม่ผ่านการตรวจเนื้อหา (moderation) — ลองเปลี่ยนคำ ตัดชื่อแบรนด์/ตัวละคร หรือลองใหม่อีกครั้ง บางครั้งเป็นแค่ชั่วคราว');
      }
      if (failures.length) throw new Error(`Roblox สร้างไม่สำเร็จ: ${failures[0]}`);
      throw new Error('สร้างเสร็จแต่หาโมเดลใน Workspace ไม่เจอ ลองกดรีเฟรชในหน้าปรับแต่ง');
    }
    return [...found.values()];
  }

  // -------------------------------------------------------------- post-processing

  async finalize(target, options) { return this.run('finalize', { target, options }); }

  async applyEffects(target, effects = [], color) {
    let last = null;
    const fx = settings.get().fxAssets || {};
    for (const kind of effects) {
      const texture = kind === 'petals' ? fx.petal : kind === 'hearts' ? fx.heart : undefined;
      last = await this.run('effect', { target, kind, color, enabled: true, texture });
    }
    return last;
  }

  /** Takes a picture of the prop from a 3/4 angle; returns file name in THUMB_DIR or null. */
  async thumbnail(target, fileId) {
    try {
      const b = await this.run('bounds', { target });
      const [cx, cy, cz] = b.center;
      const r = Math.max(...b.size, 2);
      const d = r * 1.05 + 2;
      const cam = [cx + d * 0.75, cy + d * 0.55, cz + d * 0.75];
      const shot = await this.mcp.studio('screen_capture', {
        capture_id: `Sweetprops_${fileId}`,
        camera_position: cam,
        look_at_position: [cx, cy, cz],
      });
      const img = shot.images[0];
      if (!img) return null;
      const ext = /jpe?g/.test(img.mimeType || '') ? 'jpg' : 'png';
      const file = `${fileId}.${ext}`;
      fs.writeFileSync(path.join(THUMB_DIR, file), Buffer.from(img.data, 'base64'));
      return file;
    } catch (err) {
      this.log('thumbnail failed:', err.message);
      return null;
    }
  }

  /** Serializes a prop + thumbnail into the library. */
  async saveToLibrary(target, extra = {}) {
    const data = await this.run('serialize', { target });
    const info = await this.run('describe', { target });
    const id = extra.id || crypto.randomUUID().slice(0, 12);
    const thumb = await this.thumbnail(target, id);
    return library.upsert({
      id,
      name: info.name,
      prompt: info.prompt || extra.prompt || '',
      createdAt: new Date().toISOString(),
      size: data.size,
      parts: info.parts,
      meshes: info.meshes,
      thumb,
      data,
      ...extra,
    });
  }

  async insertFromLibrary(item) {
    const d = await this.run('build', { data: item.data });
    const target = { id: d.id };
    let effects = [];
    try { effects = JSON.parse(d.effectsToApply || '[]'); } catch { /* none */ }
    if (effects.length) await this.applyEffects(target, effects);
    return d;
  }

  // -------------------------------------------------------------- Creator Store

  async searchStore(query, { max = 20 } = {}) {
    const res = await this.mcp.studio('search_asset', {
      query, scope: 'creator_store', priceFilter: 'free', assetType: 'Model', maxResults: Math.min(20, max),
    });
    const raw = res.json?.results || res.json?.assets || res.json?.data || (Array.isArray(res.json) ? res.json : []);
    const items = raw.map((a) => ({
      assetId: String(a.assetId ?? a.id ?? a.asset?.id ?? ''),
      name: a.name ?? a.asset?.name ?? 'ไม่มีชื่อ',
      creator: a.creatorName ?? a.creator?.name ?? '',
      verified: !!(a.verified ?? a.creator?.verified ?? a.hasVerifiedBadge),
      description: a.description ?? '',
    })).filter((a) => a.assetId);
    await attachRobloxThumbs(items);
    return { items, raw: items.length ? undefined : res.text.slice(0, 1500) };
  }

  async insertFromStore({ assetId, name, keepScripts = false, finalize = {} }) {
    const key = `store_${assetId}_${Date.now()}`;
    const assetName = (name || 'StoreProp').replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 50) || 'StoreProp';
    await this.run('snapshot', { key });
    await this.mcp.studio('insert_asset', { assetId: String(assetId), assetName, assetType: 'Model' });
    let items = [];
    for (let i = 0; i < 10 && !items.length; i++) {
      items = await this.run('diff', { prompt: `store:${assetId}`, key, name: assetName });
      if (!items.length && i >= 5) items = await this.run('diff', { prompt: `store:${assetId}`, key });
      if (!items.length) await sleep(800);
    }
    if (!items.length) throw new Error('ใส่ของเข้าไปแล้วแต่หาไม่เจอใน Workspace');
    const out = [];
    for (const it of items) {
      const target = { id: it.id };
      let removed = 0;
      if (!keepScripts) removed = await this.run('stripScripts', { target });
      const d = await this.finalize(target, { anchor: true, place: true, ...finalize });
      out.push({ ...d, removedScripts: removed });
    }
    return out;
  }

  // -------------------------------------------------------------- AI material

  async aiMaterial({ target, description, baseMaterial = 'Plastic', pattern = 'Regular' }) {
    const materialId = `Sweet_${crypto.randomUUID().slice(0, 6)}`;
    const res = await this.mcp.studio('generate_material', {
      baseMaterial, materialDescription: description, materialId, materialPattern: pattern,
    }, { timeoutMs: 300_000 });
    const base = res.json?.BaseMaterial || res.json?.baseMaterial || res.text.match(/BaseMaterial["':\s]+(?:Enum\.Material\.)?(\w+)/)?.[1] || baseMaterial;
    const name = res.json?.Name || res.json?.name || res.text.match(/Name["':\s]+"?([\w-]+)/)?.[1] || materialId;
    return this.run('material', { target, material: base, variant: name });
  }
}

/** Fills item.thumb with Roblox's public thumbnail CDN url (free, no auth). */
async function attachRobloxThumbs(items) {
  if (!items.length) return;
  try {
    const ids = items.map((i) => i.assetId).join(',');
    const r = await fetch(`https://thumbnails.roblox.com/v1/assets?assetIds=${ids}&size=150x150&format=Png&isCircular=false`);
    const j = await r.json();
    const map = new Map((j.data || []).map((t) => [String(t.targetId), t.imageUrl]));
    for (const it of items) it.thumb = map.get(it.assetId) || null;
  } catch { /* thumbnails are optional */ }
}
