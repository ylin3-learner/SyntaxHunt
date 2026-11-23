# SYSTEM_CONSTRAINTS (STRICT)
tools:
  edit: [editor] # NEVER output literal "\n"; use real line breaks
  read: [read_files, search_codebase]
  forbidden_shell: [python, python3, node, head, tail, cat, sed, awk, grep, find, ls, dir, Get-Content, Set-Content, Out-File]
  shell:
    cwd: project_root # NEVER prepend `cd <path>`
    paths: relative_forward_slash_only # e.g., `src/App.tsx`; NEVER `d:\...`
    allowed_only: [npm, npx, test, typecheck, build, git, verify, playwright]

diagrams:
  mermaid:
    - quote_labels_with_special_or_cjk: true # e.g., A["Text & 中文"]
    - forbid_flowchart_syntax_in: [gantt, sequenceDiagram, erDiagram]

git:
  auto_push: false # ONLY push when user explicitly asks
  push_cmd: "git push origin main" # or `--force-with-lease origin main`; NEVER `origin/main`
  commit_rules:
    - FORBIDDEN: single-line commits (e.g., `git commit -m "fix: ..."` without body)
    - REQUIRED: ALWAYS follow `.gitmessage` structure with 4 sections: `Motivation (Why)`, `Architecture & Implementation Changes (How)`, `Key Features & Modules (What)`, and `Verification`

architecture:
  separation: production_vs_validation
  test_root: "src/tests/" # Unit/Integration tests (Vitest)
  e2e_root: "e2e/" # Playwright E2E tests ONLY (`e2e/*.spec.ts`); NEVER inside `src/`
  import_alias: "@/*"
  forbid_colocated_tests: ["*.test.*", "*.spec.*", "*_test.*", "__tests__/"]
  scope_control:
    - max_batch_size: 1 # STRICTLY plan and execute ONLY ONE Sprint/Batch at a time; NEVER multi-sprint roadmaps
    - keep_e2e_thin: true # Focus strictly on golden-path smoke flows; leave edge cases to unit tests
  playwright_rules:
    - locators: prefer [getByRole, getByLabel, getByTestId, getByPlaceholder]
    - forbidden_selectors: fragile CSS chains (e.g., `div > div:nth-child(3)`)
    - wait_strategy: web-first assertions (`expect(locator).toBeVisible()`); NEVER `page.waitForTimeout()`
    - backend_isolation: STRICTLY FORBIDDEN to connect E2E tests to live cloud databases or mock binary protocols (e.g., Firestore WebChannel); ALWAYS use app-level `VITE_E2E_MOCK=true` in-memory/localStorage stubs or local emulators

## E2E SDK Isolation Strategy (Backend-Agnostic)
- **Zero Production Leakage**: Never embed `VITE_E2E` or `__isMock__` flags inside `src/`. Isolate external backends (Firebase, Supabase, Cloudflare D1/KV, API clients) at build time via `vite.config.ts` `resolve.alias` pointing to `e2e/fixtures/`.
- **Strict Export Parity**: Any fixture replacing an external SDK module MUST export every named symbol imported by `src/` (provide no-op stubs for auxiliary helpers/sentinels) so Vite dependency scanning never fails.
