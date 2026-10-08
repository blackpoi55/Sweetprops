// Runs the offline image → 3D engine (TripoSR on CPU, see scripts/local3d) as a child process.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT } from './store.js';

const L3D = path.join(ROOT, 'local3d');
const PY = path.join(L3D, 'venv', 'Scripts', 'python.exe');
const SCRIPT = path.join(ROOT, 'scripts', 'local3d', 'sweet3d.py');

export function local3dStatus() {
  const venv = fs.existsSync(PY);
  const source = fs.existsSync(path.join(L3D, 'TripoSR', 'tsr'));
  const weights = fs.existsSync(path.join(L3D, 'hf')) && JSON.stringify(fs.readdirSync(path.join(L3D, 'hf'), { recursive: true })).includes('model.ckpt');
  return { installed: venv && source, weights, dir: L3D };
}

/** Resolves with the GLB path; onStep receives progress text. Rejects with a readable error. */
export function runLocal3d({ image, out, detail = 'mid', onStep }) {
  const st = local3dStatus();
  if (!st.installed) {
    return Promise.reject(new Error('ยังไม่ได้ติดตั้งตัวสร้าง 3D ในเครื่อง — รัน Setup-3D.bat ในโฟลเดอร์ Sweetprops ก่อน (ฟรี ดาวน์โหลด ~2.5GB ครั้งเดียว)'));
  }
  const mc = detail === 'low' ? 160 : detail === 'high' ? 320 : 256;
  const tex = detail === 'high' ? 2048 : 1024;
  return new Promise((resolve, reject) => {
    const p = spawn(PY, ['-u', SCRIPT, image, out, '--mc', String(mc), '--tex', String(tex)], { windowsHide: true, cwd: ROOT, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let result = null;
    let error = null;
    let errText = '';
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('{')) continue;
        try {
          const m = JSON.parse(line);
          if (m.step) onStep?.(m.step);
          if (m.done) result = m;
          if (m.error) error = m.error;
        } catch { /* not ours */ }
      }
    });
    p.stderr.on('data', (d) => { errText = (errText + d).slice(-4000); });
    p.on('error', (e) => reject(new Error(`เปิดตัวสร้าง 3D ไม่ได้: ${e.message}`)));
    p.on('close', (code) => {
      if (result && fs.existsSync(out)) return resolve(result);
      const tail = errText.trim().split('\n').slice(-3).join(' ');
      reject(new Error(`สร้าง 3D ในเครื่องไม่สำเร็จ: ${error || tail || `exit ${code}`}`));
    });
  });
}
