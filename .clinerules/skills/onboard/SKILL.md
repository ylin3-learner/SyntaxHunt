---
name: onboard
description: Low-token codebase onboarding workflow that generates PROJECT_MAP.md, tags [Aggregate Root] modules, and curates the Ubiquitous Language Glossary without full-repo source crawling.
---

# Onboarding Workflow (Zero-Crawl, Token-Optimized)

Follow these steps strictly in order to onboard a codebase with minimal token consumption:

## Step 1: Run Deterministic Codebase Sync (0 LLM Tokens)
- **If MCP is available**: Call the `sync_codebase` tool directly.
- **If CLI-only**: Run `node .harness/scripts/harness.mjs sync_codebase --json` (or `node .harness/scripts/sync-map.mjs && node .harness/scripts/generate-map-md.mjs`).
- Do NOT manually list directories or read files before this step completes.

## Step 2: Inspect Compressed Artifacts Only
Read **only** these 3 lightweight summary files:
1. `PROJECT_MAP.md` (auto-generated structure, `[Aggregate Root]` tags, and seeded Section 7 glossary)
2. `.cartographer/risks.json` (circular dependencies, orphan files, god modules)
3. `package.json` (tech stack & available scripts)

**Strict Token Guardrail**: Do NOT crawl `src/` or read every entry point/route/store file. Only inspect up to **3** `[Aggregate Root]` source files (first 40 lines only) if a domain term in Section 7 cannot be inferred from its file path and exported symbols.

## Step 3: Curate Section 7 (`## 7. Ubiquitous Language Glossary`)
Review and refine the table in `PROJECT_MAP.md`:

| Business Domain Term | Technical Module | Aggregate Root |
| :--- | :--- | :--- |
| *(e.g. Shopping Cart / Order)* | `src/stores/cartStore.ts` | `[Aggregate Root]` |

- Map natural-language business concepts to their concrete technical modules so future `/sprint` tasks locate target files immediately.
- Preserve all existing auto-detected `[Aggregate Root]` tags and any human-curated rows.

## Step 4: Verify & Checkpoint
1. Run `verify_integrity` (MCP) or `npm run verify` (CLI) to ensure `PROJECT_MAP.md` and harness gates pass.
2. Output a concise onboarding summary (tech stack, total indexed files, top `[Aggregate Root]` modules, and glossary highlights) and ask the user what feature or fix to tackle first with `/sprint`.
