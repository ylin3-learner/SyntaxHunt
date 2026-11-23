---
name: handoff
description: Immediately checkpoint current mid-sprint progress, modified files, and exact next actions into PROGRESS.md so a fresh session or a different free/fast LLM provider can resume seamlessly. Use whenever hitting rate limits (429), switching Cline Plan/Act models, or noticing context degradation.
---

# handoff

Execute an emergency or planned state checkpoint to `PROGRESS.md` without losing momentum.

## Steps

```yaml
pipeline:
  1_snapshot_worktree:
    - inspect: ["git status --short", "git diff --stat"]
    - assess: identify which files are already modified, which verification gates have passed, and what exact micro-step remains.

  2_checkpoint_progress:
    - update_progress: overwrite `PROGRESS.md` preserving all 4 sections, adding an explicit **Handoff Checkpoint** under `2. Active Target`:
        - **Current Status**: `<in-progress | blocked-by-rate-limit | plan-approved-ready-for-act>`
        - **Completed Sub-steps**: `<list of edits/tests already done>`
        - **Exact Next Command / Edit**: `<the very next single action for the incoming model>`
        - **Recommended Model Tier**: `<Reasoning (Gemini Pro / ClinePass) | Fast Coder (NVIDIA NIM / Gemini Flash) | Lightweight (OpenRouter Free)>`

  3_output_switch_guide:
    - output: |
        ### 🔄 Handoff Checkpoint Saved to `PROGRESS.md`
        - **Current State**: `<summary>`
        - **Recommended Next Provider**: `<Reasoning / Fast Coder / Lightweight>`
        - **How to Resume**:
          1. Switch API Profile / Mode in Cline if needed.
          2. Open a **New Task** (`+`) and run `/sprint`.
    - action: HALT_IMMEDIATELY
```