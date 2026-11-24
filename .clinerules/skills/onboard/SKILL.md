---
name: onboard
description: Perform a deep, read-only 4-layer architectural audit of an existing codebase and generate a comprehensive PROGRESS.md without modifying source code.
---

# onboard

Execute a systematic, zero-mutation codebase cartography pass across 4 layers (Topology, External Call Surfaces, Domain/Routing Flow, Baseline Gate Audit) to generate `PROGRESS.md` and halt immediately without editing `src/`.

## Steps

```yaml
pipeline:
  1_cartography:
    - action: |
        Run `node scripts/cartography.mjs` in the project root to obtain a global architectural view
        (directory topology, route definitions, external API call points, core type definitions).
        This is the FIRST step before any manual exploration; do NOT use list_files layer-by-layer.
    - output: |
        Capture the cartography Markdown output as the foundation of the Topology layer.

  2_topology:
    - inspect: [directory structure from cartography, package manager lockfile, tsconfig paths]
    - record: source root, package manager, key directory layout in PROGRESS.md

  3_external_call_surfaces:
    - inspect: external API call points from cartography output (fetch/axios/SDK clients)
    - record: all outbound integration points and their locations

  4_domain_routing_flow:
    - inspect: route definition files detected by cartography
    - record: main routes, route-to-handler mappings, domain boundaries

  5_baseline_gate_audit:
    - inspect: run `npm run verify` (or equivalent) to confirm baseline gate status
    - record: pass/fail of each verification gate

  6_generate_progress:
    - action: overwrite `PROGRESS.md` with the 4-section schema:
        1. Current Baseline (cartography + gate audit results)
        2. Active Target (none yet - onboard is read-only)
        3. Architectural Invariants & Learned Gotchas (from cartography)
        4. Upcoming Backlog (suggested next batches based on gaps found)
    - halt: stop immediately after generating PROGRESS.md; do NOT edit `src/`.
```
