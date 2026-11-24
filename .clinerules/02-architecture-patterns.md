# Architecture & Resilience Patterns (Web & Serverless)

## 1. Cost, Quota & Data Safety
- **Client-First Compute**: Execute deterministic scoring, sorting, and file exports (PDF/PNG/CSV) in the browser using lazy-loaded modules; reserve cloud functions for secrets or privileged mutations.
- **O(1) Pre-Aggregated Analytics**: Back dashboards with pre-aggregated summary snapshots and multi-tier caching (Memory -> IndexedDB -> Server) instead of scanning raw event logs.
- **Defensive Writes**: Strip `undefined` before DB writes; block empty arrays or single default dummy records from overwriting cloud tables (Overwrite Guard); default to Soft Delete (`is_deleted`).
- **Multi-Tenant & Role Isolation**: Strictly separate Client and Admin write paths; use `runTransaction` read-before-write for ownership claims and deterministic hash IDs to avoid anonymous refresh duplicates.

## 2. Interactive UI & Concurrency SSOT
- **Media & Layering**: Unlock Web Speech / AudioContext only inside synchronous user gestures; apply `pointer-events: none` to decorative SVG/Canvas overlays; call `stopPropagation()` on nested row controls; declare `color-scheme: light` on root unless dark mode is supported.
- **State SSOT & Locks**: Share a single pure coordinate transform function across linked visual layers; guard async submissions with synchronous `useRef` locks; tag cached reads with `{ source, syncedAt }`; surface unparseable inputs as `unresolved` for user confirmation.
