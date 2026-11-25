# System Constraints & Architectural Boundaries

## 1. Automated Verification Gate (Deterministic Enforcement)
- All code changes MUST pass `npm run verify` (`scripts/verify.mjs`) before completion.
- Do NOT duplicate regex-enforced rules here; resolve any `[Fix Hint]` diagnostics emitted by `verify.mjs` directly (covering test isolation, `src/` boundary/E2E leakage, hardcoded timezone offsets, unbounded queries, `cross-env`, deprecated TS `baseUrl`, and passive touch/objectURL pitfalls).

## 2. Core Design Invariants
- **Pure Domain Core**: Keep business rules, state machines, and coordinate/scoring math inside `src/domain/` as pure functions with zero UI or SDK imports.
- **Deterministic Dependencies**: Inject `now: Date` / clock and randomness as parameters rather than calling `Date.now()` or `Math.random()` inside domain logic.
- **E2E SDK Isolation**: Swap external SDKs to in-memory fixtures strictly via bundler `resolve.alias` in `e2e/fixtures/` with full named-export parity; never branch on test flags in `src/`.
- **Mermaid Syntax Safety**: Always wrap Mermaid edge labels containing parentheses, CJK characters, or special operators in double quotes (`-->|"Label (Note)"|`).

## 3. Agent Execution Protocol (Anti-Loop & Shell Safety)
- **Direct Tool Execution**: Emit tool calls immediately without verbose pre-planning text; never declare completion until `npm run verify` passes.
- **Edit Fallback**: If `replace_in_file` fails **once** on a file, switch immediately to full-file `write_to_file` instead of repeating identical edits. **Never retry `replace_in_file` a second time.**
- **Cross-Platform Shell**: Always use forward slashes (`/`) in paths, avoid backticks inside `node -e` bash strings, and redirect to `/dev/null` (never `nul`).


## Automated Context & Verification Protocol (Mandatory in ALL Tasks)
1. **Plan & Blast Radius First**: Before editing any source file, you MUST run `node .harness/scripts/inject-context.mjs <target_files>` (or read `PROJECT_MAP.md`) to lock the blast radius. Never blind-scan the repository.
2. **Anti-Diff-Loop Rule**: If `replace_in_file` fails ONCE on a file, do NOT retry `replace_in_file`. Immediately use `write_to_file` (or extract a standalone module) instead.
3. **Fast Targeted Feedback**: Immediately after modifying files, run `node .harness/scripts/verify.mjs --targeted <modified_files>` before proceeding.
4. **Commit Gate**: Before committing, run full `npm run verify`.
5. **Templates Sync Gate**: If editing any file under `templates/`, you MUST run `npm run harness:sync` before verification to propagate template changes into the target project (this syncs init.mjs aliases, package.json scripts, and @/* path mappings). Remove any stale `src/` or `e2e/` placeholder directories created by prior syncs that are now empty.

## Precision File Editing & Anti-Loop Protocol (Mandatory)
1. **Exact Line-Window Verification**: Before calling `replace_in_file`, always inspect the exact target lines first so indentation and whitespace match 100%. Never guess surrounding context.
2. **One-Strike Fallback (`replace_in_file` -> `write_to_file`)**: If `replace_in_file` fails ONCE, **do NOT retry `replace_in_file`**. Immediately fall back to `write_to_file` for a clean full-file write.
3. **Standalone Module First**: When adding >20 lines of new logic (especially regex parsers or templates), create a standalone module via `write_to_file` and wire it in with a 2-line `import` rather than editing large existing files.
4. **Shell File-Write Hygiene**: When writing files via shell commands, always use single-quoted Here-Docs (`cat << 'EOF' > path`) to prevent bash escape expansion (`\n`, `$`). Never use nested `node -e` string replacements for multi-line code.

## Harness Engineering Discipline (Anti-Excuses & Hygiene)
- **Zero "Pre-existing" Excuses**: Never dismiss a failing test or syntax error in a file you touch or wrap as "pre-existing" or "Node version incompatibility". Fix it so `npm test` passes 100% (8/8).
- **Safe File Writes (No Heredoc Corruption)**: Never write `.mjs` files using unquoted heredocs or single-line minified dumps (which cause missing parentheses or trailing `ENDTEMPLATE` artifacts). Always run `node --check <file>` immediately after editing any `.mjs` file.
- **Clean `#core/*` Subpath Imports**: Scripts in `.harness/scripts/` must import core modules exclusively via `#core/*`. Never leave legacy `../core/` or `../../core/` relative fallback paths behind.

## Harness Engineering Discipline (Codified Lessons)
- **Zero "Pre-existing" Excuses (Boy Scout Rule)**: Never dismiss a failing test or syntax error in a file you touch or wrap as "pre-existing" or a "Node.js version issue". Fixing it is mandatory for task completion (`npm test` must pass 100%).
- **Top-Level `await import('#core/...')` Only**: In `.harness/scripts/*.mjs`, import core modules exclusively via `#core/*` using clean top-level `await` or standard ESM `import`. Never use `loadCore().then(main)` wrappers or legacy `../core/` relative fallback chains.
- **No Single-Line Dumps or Escaping Hacks**: Never minify scripts onto single lines (>500 chars), never use `String.fromCharCode(10)` workarounds for newlines, and always use single-quoted `'EOF'` in heredocs. Every edited `.mjs` file must pass `node --check` and `npm run verify`.

## Deterministic Status Reporting (No Manual Summaries)
- **Ground-Truth Reporting Only**: Whenever reporting task completion, test counts, or `/handoff` status, NEVER write summary metrics from memory. Always run `node .harness/scripts/handoff-pack.mjs` and include its exact, unmodified output.

## Mandatory Post-Edit Pipeline (Single-Command Closure)
- **Always Run `npm run harness:sync` After Edits**: Whenever you modify `core/`, `templates/`, or `package.json`, you MUST run `npm run harness:sync`. It automatically syncs templates, regenerates `PROJECT_MAP.md`, runs all 8 regression tests + 4 hygiene gates, updates `README` status badges, and writes the ground-truth `HANDOFF.md`.
- **Pre-Commit Enforcement**: Git `pre-commit` will automatically block any commit if `npm test` or `npm run verify` fails.

## Deep Codified Lessons (ESM Strictness & Fail-Loud Discipline)
- **Pure ESM Everywhere (No `require()` in `.mjs`)**: All files in `core/` and `.harness/` are strict ES Modules. Never use `require(...)`, never rely on undeclared globals (`ReferenceError` in strict ESM), and ensure `verify.mjs` scans `core/` alongside `.harness/scripts/`.
- **Fail Loud on Core Imports (No Silent Swallowing)**: Never wrap `import('#core/...')` in an empty `try { ... } catch (_) {}` that hides syntax or runtime bugs in `core/`. Let core import errors surface immediately.
- **Cross-Platform CLI Output Parsing**: When parsing Node.js test/coverage subprocess output in scripts, always capture both `stdout` and `stderr` and strip ANSI escape codes (`\x1b\[[0-9;]*m`) before running regex matches.

## Static Gate & Script Authoring Hygiene
- **Avoid Self-Matching Regex Rules**: When adding banned-pattern checks to `verify.mjs` (e.g., banning `require(`, `../core/`, or heredoc tags), NEVER write the literal banned token inside the regex literal or error message string—construct the pattern dynamically (e.g., `new RegExp('\\b' + 'require\\s*\\(')`) and keep error descriptions abstract so `verify.mjs` does not flag itself.
- **Assert String Replacements**: When modifying files programmatically via Node scripts, always assert that the updated content differs from the original (`if (next === prev) throw new Error('No-op replace')`) so escaping mismatches never fail silently.

## Multi-Protocol Tool Routing (MCP First, CLI JSON Fallback)
- **Capability Discovery**: This harness exposes a unified Application Facade (`#core/application/harness-facade.mjs`) with 4 core capabilities: `inspect_impact`, `verify_integrity`, `sync_codebase`, and `get_ground_truth_status`.
- **If MCP Tools Are Available (e.g., Cline / Claude Code / Cursor)**: Prefer calling the native `agent-harness-kit` MCP tools (`inspect_impact` before editing, `verify_integrity` before committing, `get_ground_truth_status` when summarizing) to avoid shell escaping errors and terminal log noise.
- **If Running in CLI-Only Mode**: Run `node .harness/scripts/harness.mjs --describe` to inspect schemas and invoke capabilities via `node .harness/scripts/harness.mjs <tool_name> --json`.

## Tool Invocation Hygiene (Multi-Client Compatibility)
- **Use Exact Native Tool Names Only**: Never hardcode or assume a specific IDE's tool name (e.g., `execute_command` vs `run_commands`). Always inspect the active tool schema provided in your system prompt and verify exact spelling before emitting a tool call.
- **Minimize Shell Calls via Facade/MCP**: Prefer calling `node .harness/scripts/harness.mjs <capability> --json` (or native MCP tools if registered) in a single step rather than chaining multiple shell commands.
