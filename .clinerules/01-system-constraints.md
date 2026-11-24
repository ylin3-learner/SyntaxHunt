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
- **Edit Fallback**: If `replace_in_file` fails twice on a file, switch immediately to full-file `write_to_file` instead of repeating identical edits.
- **Cross-Platform Shell**: Always use forward slashes (`/`) in paths, avoid backticks inside `node -e` bash strings, and redirect to `/dev/null` (never `nul`).
