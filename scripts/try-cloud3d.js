// Usage: node scripts/try-cloud3d.js <image> [more views...]
import path from 'node:path';
import { imageTo3d } from '../server/cloud3d.js';
import { DATA_DIR } from '../server/store.js';

const [image, ...views] = process.argv.slice(2);
const t0 = Date.now();
const r = await imageTo3d({ image, views, outDir: path.join(DATA_DIR, 'models'), onStep: (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`), token: process.env.HF_TOKEN });
console.log('saved', r.file, (r.bytes / 1e6).toFixed(2), 'MB');
