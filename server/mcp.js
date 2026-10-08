// Client for Roblox StudioMCP (the MCP server that ships with Roblox Studio).
// Spawns StudioMCP.exe over stdio and exposes typed helpers for the tools we use.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
const ROBLOX_DIR = path.join(LOCALAPPDATA, 'Roblox');

/** Finds StudioMCP.exe: explicit path → mcp.bat → registry ContentFolder → newest Versions/* folder. */
export function findStudioMcp(override) {
  const candidates = [];
  if (override) candidates.push(override);

  const bat = path.join(ROBLOX_DIR, 'mcp.bat');
  if (fs.existsSync(bat)) {
    for (const m of fs.readFileSync(bat, 'utf8').matchAll(/"([^"]+StudioMCP\.exe)"/gi)) candidates.push(m[1]);
  }

  try {
    const key = String.raw`HKCU\Software\Roblox\RobloxStudio`;
    const out = execFileSync('reg', ['query', key, '/v', 'ContentFolder'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = out.match(/ContentFolder\s+REG_\w+\s+(.+)/);
    if (m) candidates.push(path.join(m[1].trim(), '..', 'StudioMCP.exe'));
  } catch { /* key missing */ }

  const versions = path.join(ROBLOX_DIR, 'Versions');
  if (fs.existsSync(versions)) {
    const found = fs.readdirSync(versions)
      .map((d) => path.join(versions, d, 'StudioMCP.exe'))
      .filter((p) => fs.existsSync(p))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    candidates.push(...found);
  }

  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

/** Splits an MCP tool result into joined text, parsed JSON (when the text is JSON) and images. */
export function parseResult(result) {
  const texts = [];
  const images = [];
  for (const c of result?.content || []) {
    if (c.type === 'text') texts.push(c.text);
    else if (c.type === 'image') images.push({ data: c.data, mimeType: c.mimeType });
  }
  const text = texts.join('\n');
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  if (result?.structuredContent) json = result.structuredContent;
  return { text, json, images, isError: !!result?.isError };
}

export class StudioMcp {
  constructor({ exeOverride = null, log = () => {} } = {}) {
    this.exeOverride = exeOverride;
    this.exePath = null;
    this.client = null;
    this.connecting = null;
    this.studioId = null; // preferred Studio instance; null = first available
    this.log = log;
  }

  get connected() { return !!this.client; }

  async connect() {
    if (this.client) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      this.exePath = findStudioMcp(this.exeOverride);
      if (!this.exePath) throw new Error('ไม่พบ StudioMCP.exe — ติดตั้ง/อัปเดต Roblox Studio ก่อน หรือระบุ path ในหน้าตั้งค่า');
      const transport = new StdioClientTransport({ command: this.exePath, args: [], stderr: 'pipe' });
      transport.stderr?.on('data', (d) => this.log('[studiomcp]', String(d).trim()));
      const client = new Client({ name: 'sweetprops', version: '0.1.0' });
      transport.onclose = () => { if (this.client === client) this.client = null; };
      await client.connect(transport);
      this.client = client;
      this.log('connected to', this.exePath);
      return client;
    })();
    try { return await this.connecting; } finally { this.connecting = null; }
  }

  async close() {
    const c = this.client;
    this.client = null;
    this.tools = null;
    if (c) await c.close().catch(() => {});
  }

  async reconnect() { await this.close(); return this.connect(); }

  async listTools() {
    const client = await this.connect();
    this.tools = (await client.listTools()).tools;
    return this.tools;
  }

  /** True if this StudioMCP version's tool accepts the argument (schemas change between Studio releases). */
  async supports(tool, arg) {
    if (!this.tools) await this.listTools();
    return !!this.tools.find((t) => t.name === tool)?.inputSchema?.properties?.[arg];
  }

  /** Calls a tool; retries once after reconnecting if the transport died. */
  async call(name, args = {}, { timeoutMs = 120_000 } = {}) {
    for (let attempt = 0; ; attempt++) {
      const client = await this.connect();
      try {
        const res = await client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs, resetTimeoutOnProgress: true });
        const parsed = parseResult(res);
        if (parsed.isError) throw new Error(parsed.text || `${name} failed`);
        return parsed;
      } catch (err) {
        const dead = !this.client || /closed|EPIPE|not connected/i.test(String(err?.message));
        if (dead && attempt === 0) { await this.reconnect(); continue; }
        throw err;
      }
    }
  }

  async listStudios() {
    const { json, text } = await this.call('list_roblox_studios');
    return json?.studios || (text ? JSON.parse(text).studios : []) || [];
  }

  /** Returns the id of the Studio we should talk to, or throws a friendly error. */
  async resolveStudio() {
    const studios = await this.listStudios();
    if (!studios.length) throw new Error('ยังไม่เจอ Roblox Studio — เปิด Studio, เปิด place และเปิด MCP ใน Assistant settings');
    const pick = studios.find((s) => s.id === this.studioId) || studios[0];
    return pick.id;
  }

  /** Calls a Studio-scoped tool, filling in studio_id. */
  async studio(name, args = {}, opts) {
    const studio_id = await this.resolveStudio();
    return this.call(name, { ...args, studio_id }, opts);
  }

  /** Runs Luau in the Edit datamodel and returns the value printed/returned by the script. */
  async luau(code, opts) {
    const res = await this.studio('execute_luau', { code, datamodel_type: 'Edit' }, opts);
    return res;
  }
}
