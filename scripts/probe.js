// Connects to StudioMCP and prints its tools and connected Studio instances.
// Usage: node scripts/probe.js
import { StudioMcp } from '../server/mcp.js';

const mcp = new StudioMcp();
await mcp.connect();
console.log('exe:', mcp.exePath);
const tools = await mcp.listTools();
for (const t of tools) console.log('-', t.name);
console.log('studios:', JSON.stringify(await mcp.listStudios(), null, 2));
await mcp.close();
