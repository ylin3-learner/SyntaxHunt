#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

const IGNORE_DIRS = new Set(["node_modules", ".git", ".cartographer", "dist", "build", ".next", "coverage", "__pycache__", "out", "templates"]);

function walk(root) {
  if (!existsSync(root)) return [];
  const results = [];
  for (const entry of readdirSync(root, { recursive: true })) {
    const rel = entry.replace(/\\/g, "/");
    if (rel.split("/").some(p => IGNORE_DIRS.has(p))) continue;
    const abs = join(root, rel);
    if (statSync(abs).isFile()) results.push({ rel, abs });
  }
  return results;
}

function extractDbSchemas(files) {
  const sections = [];
  const summary = [];
  for (const { rel, abs } of files) {
    const ext = extname(rel);
    if (rel.endsWith("schema.prisma")) {
      const src = readFileSync(abs, "utf8").replace(/\/\/.*$/gm, "");
      const models = [...src.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)];
      for (const [, name, body] of models) {
        const cols = body.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("@@"));
        sections.push(`### Prisma Model: \`${name}\` (${rel})\n${cols.map(c => `- ${c}`).join("\n")}`);
        summary.push(`Prisma:${name} (${cols.length} cols)`);
      }
    } else if (/schema.*\.(ts|js)$/i.test(rel)) {
      const src = readFileSync(abs, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      const tables = [...src.matchAll(/(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"]([^'"]+)['"]\s*,\s*\{([^}]*)\}/g)];
      for (const [, tName, body] of tables) {
        const cols = body.split(",").map(l => l.trim().replace(/\s+/g, " ")).filter(Boolean);
        sections.push(`### Drizzle Table: \`${tName}\` (${rel})\n${cols.map(c => `- ${c}`).join("\n")}`);
        summary.push(`Drizzle:${tName} (${cols.length} cols)`);
      }
    } else if (ext === ".sql") {
      const src = readFileSync(abs, "utf8").replace(/--.*$/gm, "");
      const tables = [...src.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"\']?(\w+)[`"\']?\s*\(([^;]+)\)/gi)];
      for (const [, tName, body] of tables) {
        const cols = body.split(",").map(l => l.trim().replace(/\s+/g, " ")).filter(l => l && !/^(?:PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT)/i.test(l));
        sections.push(`### SQL Table: \`${tName}\` (${rel})\n${cols.map(c => `- ${c}`).join("\n")}`);
        summary.push(`SQL:${tName} (${cols.length} cols)`);
      }
    }
  }
  return {
    markdown: sections.length ? sections.join("\n\n") : "No database schemas detected.",
    summary
  };
}

function extractApiContracts(files) {
  const lines = [];
  const summary = [];
  for (const { rel, abs } of files) {
    if (rel.endsWith("openapi.json") || rel.endsWith("swagger.json")) {
      try {
        const spec = JSON.parse(readFileSync(abs, "utf8"));
        for (const [p, methods] of Object.entries(spec.paths || {})) {
          const mList = Object.keys(methods).map(m => m.toUpperCase()).join(", ");
          lines.push(`- **${mList}** \`${p}\` (${rel})`);
          summary.push(`${mList} ${p}`);
        }
      } catch {}
    } else if (/(?:app|src\/app)\/api\/.+\/route\.(ts|js)$/.test(rel)) {
      const src = readFileSync(abs, "utf8");
      const methods = [...src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)\b/g)].map(m => m[1]);
      const types = [...src.matchAll(/(?:interface|type)\s+(\w*(?:Req|Res|Request|Response|Payload|Body)\w*)/g)].map(m => m[1]);
      const routePath = "/" + rel.replace(/^.*?app\//, "").replace(/\/route\.(ts|js)$/, "");
      if (methods.length) {
        lines.push(`- **${methods.join(", ")}** \`${routePath}\`${types.length ? ` (Types: ${types.join(", ")})` : ""}`);
        summary.push(`${methods.join("/")} ${routePath}`);
      }
    } else if (/(?:pages|src\/pages)\/api\/.+\.(ts|js)$/.test(rel)) {
      const routePath = "/" + rel.replace(/^.*?pages\//, "").replace(/\.(ts|js)$/, "").replace(/\/index$/, "");
      lines.push(`- **HANDLER** \`${routePath}\` (${rel})`);
      summary.push(`HANDLER ${routePath}`);
    } else if (/\.(ts|js|mjs)$/.test(rel)) {
      const src = readFileSync(abs, "utf8");
      const routes = [...src.matchAll(/\b(?:app|router|fastify|hono)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi)];
      for (const [, method, routePath] of routes) {
        lines.push(`- **${method.toUpperCase()}** \`${routePath}\` (${rel})`);
        summary.push(`${method.toUpperCase()} ${routePath}`);
      }
    }
  }
  return {
    markdown: lines.length ? lines.join("\n") : "No API contracts detected.",
    summary
  };
}

export function extractRuntimeContext(root = process.cwd()) {
  const files = walk(root);
  const rawDir = join(root, ".cartographer", "raw");
  mkdirSync(rawDir, { recursive: true });
  const db = extractDbSchemas(files);
  const api = extractApiContracts(files);
  writeFileSync(join(rawDir, "runtime-db.md"), `# Runtime DB Schemas\n\n${db.markdown}\n`);
  writeFileSync(join(rawDir, "runtime-api.md"), `# Runtime API Contracts\n\n${api.markdown}\n`);
  console.log(`[extract-runtime] DB: ${db.summary.length} models | API: ${api.summary.length} endpoints.`);
  return { db: db.summary, api: api.summary };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("extract-runtime.mjs")) {
  extractRuntimeContext();
}
