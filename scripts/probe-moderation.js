// Checks which prompts / images pass Roblox's generation moderation (fails come back within seconds).
// Usage: node scripts/probe-moderation.js "prompt one" "prompt two" [--image C:\path\to.png]
// Prompts that pass will actually generate and insert a model into the open place.
import { StudioMcp } from '../server/mcp.js';

const args = process.argv.slice(2);
const imgAt = args.indexOf('--image');
const image = imgAt >= 0 ? args.splice(imgAt, 2)[1] : null;
const mcp = new StudioMcp();
await mcp.connect();

const runs = args.map(async (prompt) => {
  const r = await mcp.studio('generate_mesh', { textPrompt: prompt, size: { x: 6, y: 8, z: 6 }, maxTriangles: 8000, segmentation: 'none', async: true });
  const w = await mcp.studio('wait_job_finished', { jobId: r.json.jobId, timeout: 600 }, { timeoutMs: 660_000 });
  return `[mesh] ${w.json?.status}: ${prompt}${w.json?.status === 'Failed' ? ` → ${w.text.slice(0, 160)}` : ''}`;
});
if (image) {
  runs.push((async () => {
    const img = await mcp.studio('store_image', { filePath: image });
    const uri = img.text.match(/IMAGEID_[\w-]+/)?.[0];
    const r = await mcp.studio('generate_procedural_model', { prompt: '', attachedImageUri: uri, async: true });
    const w = await mcp.studio('wait_job_finished', { jobId: r.json.jobId, timeout: 600 }, { timeoutMs: 660_000 });
    return `[image] ${w.json?.status}${w.json?.status === 'Failed' ? ` → ${w.text.slice(0, 220)}` : ''}`;
  })());
}
for (const line of await Promise.all(runs.map((p) => p.catch((e) => `error: ${e.message}`)))) console.log(line);
await mcp.close();
