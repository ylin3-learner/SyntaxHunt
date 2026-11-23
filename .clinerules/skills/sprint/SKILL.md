---
name: sprint
description: Execute a strict, single-batch TDD development sprint with automated state handoff via PROGRESS.md, human-in-the-loop plan approval, verification gates, documentation sync, and structured git commits. Use whenever the user invokes `/sprint` or asks to implement a feature, fix a bug, refactor code, or add tests incrementally.
---

# sprint

Execute a deterministic, end-to-end development iteration using `PROGRESS.md` as the stateless handoff memory across sessions.

## Usage

- **Resume next planned batch**: Invoke `/sprint` without arguments to automatically read `PROGRESS.md` and execute the next single-batch target.
- **Execute a custom task**: Invoke `/sprint <task description>` to run a specific feature, bugfix, or test batch while preserving the existing backlog.

## Steps

```yaml
pipeline:
  1_bootstrap_and_audit:
    - inspect: [PROGRESS.md, README.md, README.zh-TW.md, "git log -n 5", project_structure]
    - cold_start_init: |
        If `PROGRESS.md` does NOT exist in project root:
        1. Infer project stack, test runner, and verification scripts from manifest files (e.g., `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`).
        2. Generate an initial `PROGRESS.md` following the 4-section schema (Current Baseline, Active Target, Architectural Invariants & Learned Gotchas, Upcoming Backlog) based on `git log` and codebase state.
    - resolve_scope: |
        - If user provided explicit instructions with `/sprint <task>`: set as Active Target (preserve existing Backlog).
        - If bare `/sprint`: automatically adopt `PROGRESS.md -> 2. Active Target` (or pop item #1 from `4. Upcoming Backlog`).
    - sync_docs: update project documentation (`README*`) via `editor` ONLY if drifted from current codebase reality.

  2_plan_gate:
    - output: |
        ### Context & Baseline
        - Last state + inherited invariants/gotchas from `PROGRESS.md`
        ### Scoped Single-Batch Plan
        - **Type**: `<feat | fix | refactor | test | chore>`
        - **Target Files**: `<exact list of files to create/modify>`
        - **Verification Plan**: `<unit/integration/e2e cases or assertions>`
        - **Recommended Execution Tier**: `<Fast Coder (NVIDIA NIM / Gemini Flash) for standard TDD | Reasoning Model for complex architecture>`
        > 💡 *Tip: If you are currently in **Plan Mode** (Reasoning Model), review this plan, switch Cline to **Act Mode** (Fast Free Coder), and reply `approved`.*
    - action: |
        HALT_AND_WAIT_USER_APPROVAL
        CRITICAL RULE: Your turn MUST end immediately after outputting the Scoped Single-Batch Plan.
        Do NOT call any file-editing or bash execution tools in the same turn. Wait for explicit user reply ("approved", "go", "ok") before writing code.

  3_tdd_implementation:
    - guardrails:
        - **Zero Mock Leakage**: Production code (`src/`) must be 100% agnostic to test mocks. Never introduce flags like `__isMock` or `isTest`. Mocks in `e2e/fixtures/` must implement the exact same TypeScript interface/SDK signature as production modules.
        - **Preserve Existing UI Contracts**: When an E2E assertion fails due to minor formatting (e.g., an icon prefix like `❌`), NEVER alter production UI copy just to make a test pass unless the UI itself is proven buggy. Adjust the test assertion (e.g., `toContainText`) instead.
        - **Path Aliasing**: When configuring Vite `resolve.alias` for E2E fixtures, always map resolved absolute paths (`path.resolve(__dirname, 'src/...')`) rather than brittle relative strings (`'../../firebase'`).
    - red: write failing tests (unit/integration/e2e matching project's test conventions) -> run targeted test (confirm expected failure)
    - green: write minimal, clean production code to satisfy tests -> run test suite (confirm pass)
    - refactor_and_hygiene:
        - Enforce project architecture rules (e.g., consolidate any misplaced tests into designated test directories, clean up dead code).
    - verify: run project verification gates (e.g., `npm run verify`, lint, typecheck, full test suite) -> must pass 100% with zero regressions.
    - circuit_breaker: |
        If the same verification gate (`verify.mjs`) fails **3 consecutive times** on the same error, STOP retrying immediately. Output the failure summary and instruct the user to run `/handoff` and switch to a stronger Reasoning Model (e.g., Gemini Pro).

  4_docs_and_handoff:
    - sync_docs: update `README.md` / `README.zh-TW.md` (if present) to reflect newly delivered capabilities and test metrics.
    - update_progress: overwrite `PROGRESS.md` to advance the state machine:
        1. **Current Baseline**: record the work just verified.
        2. **Active Target**: promote the next logical single-batch task from `Upcoming Backlog` (or define the next natural step).
        3. **Architectural Invariants & Learned Gotchas**: distill any newly discovered edge cases, mock limits, or pitfalls (keep concise, < 10 bullets).
        4. **Upcoming Backlog**: remove the completed item and reorder remaining priorities.

  5_commit:
    - check: run `git status` to ensure no untracked scratch files, build artifacts, or temporary logs exist.
    - stage: `git add <relevant_files>` (including updated `PROGRESS.md` and docs)
    - format: |
        <type>(<scope>): <concise summary>

        ### Motivation (Why)
        <Problem, bottleneck, or user need>

        ### Architecture & Implementation Changes (How)
        - <Structural, interface, and logic changes>

        ### Key Features & Modules (What)
        - <Delivered capabilities and behaviors>

        ### Verification
        - <Passed gates, test counts, typecheck/lint status>
```