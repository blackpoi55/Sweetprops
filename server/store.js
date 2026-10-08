// Tiny JSON-file persistence for settings and the prop library.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.SWEETPROPS_DATA || path.join(ROOT, 'data');
export const THUMB_DIR = path.join(DATA_DIR, 'thumbs');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const MODEL_DIR = path.join(DATA_DIR, 'models');
for (const d of [DATA_DIR, THUMB_DIR, UPLOAD_DIR, MODEL_DIR]) fs.mkdirSync(d, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, value) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');

export const DEFAULT_SETTINGS = {
  port: 34990,
  studioMcpPath: '',
  studioId: '',
  openBrowser: true,
  autoThumbnail: true,
  hfToken: '', // Hugging Face token (free) for image → 3D; stored only in data/settings.json on this PC
  openCloudKey: '', // Roblox Open Cloud key (Assets: write) for auto-uploading 3D models
  robloxGroupId: '',
  defaultFinalize: { anchor: true, collision: 'hull', place: true },
};

export const settings = {
  get() { return { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_FILE, {}) }; },
  set(patch) {
    const next = { ...this.get(), ...patch };
    writeJson(SETTINGS_FILE, next);
    return next;
  },
};

export const library = {
  all() { return readJson(LIBRARY_FILE, []); },
  get(id) { return this.all().find((x) => x.id === id) || null; },
  upsert(item) {
    const list = this.all();
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) list[i] = { ...list[i], ...item };
    else list.unshift(item);
    writeJson(LIBRARY_FILE, list);
    return item;
  },
  remove(id) {
    const item = this.get(id);
    writeJson(LIBRARY_FILE, this.all().filter((x) => x.id !== id));
    if (item?.thumb) fs.rmSync(path.join(THUMB_DIR, path.basename(item.thumb)), { force: true });
  },
};
