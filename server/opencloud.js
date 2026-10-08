// Uploads a 3D file (GLB) to the user's Roblox account with an Open Cloud API key (free; created by the user
// at create.roblox.com/dashboard/credentials with the "Assets: write" permission). Returns the new asset id.
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://apis.roblox.com/assets/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function uploadModel({ apiKey, userId, groupId, file, name, description = 'Made with Sweetprops' }) {
  if (!apiKey) throw new Error('ยังไม่ได้ใส่ Roblox Open Cloud API key');
  if (!userId && !groupId) throw new Error('ไม่รู้ว่าจะอัปโหลดเข้าบัญชีไหน (ไม่มี userId)');
  const request = {
    assetType: 'Model',
    displayName: String(name || 'SweetProp').slice(0, 50),
    description,
    creationContext: { creator: groupId ? { groupId: String(groupId) } : { userId: String(userId) } },
  };
  const form = new FormData();
  form.append('request', JSON.stringify(request));
  form.append('fileContent', new Blob([fs.readFileSync(file)], { type: 'model/gltf-binary' }), path.basename(file));
  const r = await fetch(`${API}/assets`, { method: 'POST', headers: { 'x-api-key': apiKey }, body: form });
  const text = await r.text();
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw new Error('Open Cloud API key ใช้ไม่ได้ หรือไม่มีสิทธิ์ Assets: write');
    throw new Error(`อัปโหลดเข้า Roblox ไม่สำเร็จ (HTTP ${r.status}): ${text.slice(0, 200)}`);
  }
  let op = JSON.parse(text);
  for (let i = 0; i < 60 && !op.done; i++) {
    await sleep(2000);
    const p = await fetch(`${API}/${op.path}`, { headers: { 'x-api-key': apiKey } });
    op = await p.json();
  }
  if (!op.done) throw new Error('Roblox ยังประมวลผลไฟล์ไม่เสร็จ ลองดูใน Creator Dashboard อีกสักครู่');
  if (op.error) throw new Error(`Roblox ไม่รับไฟล์: ${op.error.message || JSON.stringify(op.error).slice(0, 200)}`);
  const assetId = op.response?.assetId;
  if (!assetId) throw new Error('Roblox ไม่ได้ส่ง assetId กลับมา');
  return String(assetId);
}
