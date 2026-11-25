#!/usr/bin/env node
// Driving Adapter 2: Unified CLI & Capability Discovery Adapter
import { describeCapabilities, executeCapability } from '#core/application/harness-facade.mjs';

const args = process.argv.slice(2);
const cmd = args.find(a => !a.startsWith('--'));
const isJson = args.includes('--json');

if (!cmd || args.includes('--describe') || args.includes('--help')) {
  const caps = describeCapabilities();
  if (isJson || args.includes('--describe')) {
    console.log(JSON.stringify(caps, null, 2));
  } else {
    console.log('Usage: node .harness/scripts/harness.mjs <tool_name> [--files a.mjs,b.mjs] [--json] [--describe]');
    console.log('\nAvailable Capabilities:');
    for (const t of caps.tools) {
      console.log(`  - ${t.name}: ${t.description}`);
    }
  }
  process.exit(0);
}

const filesArg = args.find(a => a.startsWith('--files='));
const files = filesArg ? filesArg.slice('--files='.length).split(',').map(s => s.trim()).filter(Boolean) : [];

try {
  const result = executeCapability(cmd, { files }, process.cwd());
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok === false ? 1 : 0);
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
}
