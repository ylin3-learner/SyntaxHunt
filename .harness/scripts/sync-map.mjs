#!/usr/bin/env node
// Thin CLI wrapper — sync map generation & pipeline orchestrator
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { extractRuntimeContext } from "./extract-runtime.mjs";
import { generateMapMd } from "./generate-map-md.mjs";

const TARGET_EXTS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".json", ".prisma", ".sql"]);
const IGNORE_DIRS = new Set(["node_modules", ".git", ".cartographer", "dist", "build", ".next", "coverage", "__pycache__", "out"]);

async function main() {
  const ROOT = process.cwd();
  const CART_DIR = path.join(ROOT, ".cartographer");
  const manifest = { generatedAt: new Date().toISOString(), files: {} };
  const entries = fs.readdirSync(ROOT, { recursive: true });

  for (const entry of entries) {
    const relNormalized = entry.replace(/\\/g, "/");
    if (relNormalized.split("/").some(part => IGNORE_DIRS.has(part))) continue;

    const fullPath = path.join(ROOT, entry);
    if (!fs.statSync(fullPath).isFile()) continue;

    const ext = path.extname(fullPath);
    if (!TARGET_EXTS.has(ext)) continue;

    const content = fs.readFileSync(fullPath, "utf8");
    const relKey = path.relative(ROOT, fullPath);
    manifest.files[relKey] = {
      hash: crypto.createHash("sha256").update(content).digest("hex").slice(0, 16),
      size: content.length,
    };
  }

  const rawDir = path.join(CART_DIR, "raw");
  fs.mkdirSync(rawDir, { recursive: true });
  fs.writeFileSync(
    path.join(CART_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n"
  );

  console.log(`[sync-map] Synced ${Object.keys(manifest.files).length} files.`);
  extractRuntimeContext(ROOT);
  generateMapMd(ROOT);
}

main();
