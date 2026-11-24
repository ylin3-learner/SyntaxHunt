---
name: handoff
description: Immediately checkpoint current mid-sprint progress, modified files, and exact next actions into HANDOFF.md so a fresh session or a different free/fast LLM provider can resume seamlessly. Use whenever hitting rate limits (429), switching Cline Plan/Act models, or noticing context degradation.
---

# handoff

Execute an emergency or planned state checkpoint to `HANDOFF.md` using `scripts/handoff-pack.mjs` without losing momentum.

## Steps

```yaml
pipeline:
  1_generate_handoff:
    - action: Run `node scripts/handoff-pack.mjs` in the project root to auto-generate `HANDOFF.md` objective state (git status -s, git diff --stat, .verify-state.json).
    - note: This is deterministic and token-cheap; the script captures objective facts so the LLM does not need to re-read the worktree.

  2_annotate_blockers:
    - action: Append up to 3 sentences under the generated template bottom (`## Current Blockers & Next Actions`) describing the current blockers and the exact next action.
    - constraint: Do NOT exceed 3 sentences; this keeps Token consumption low when switching free LLM providers.

  3_output_switch_guide:
    - output: |
        ### 🔄 Handoff Checkpoint Saved to `HANDOFF.md`
        - **Current State**: `<summary>`
        - **Recommended Next Provider**: `<Reasoning / Fast Coder / Lightweight>`
        - **How to Resume**:
          1. Switch API Profile / Mode in Cline if needed.
          2. Open a **New Task** (`+`) and run `/sprint`.
    - action: HALT_IMMEDIATELY
```
## Mandatory Documentation Sync Check
- Before concluding any session or calling `attempt_completion`, inspect `git status -s` and `git diff --stat`.
- If `src/`, `scripts/`, or `.clinerules/` were modified, ensure both `PROGRESS.md` and `README.md` are updated to reflect the latest features, architectural decisions, or verification gates.
