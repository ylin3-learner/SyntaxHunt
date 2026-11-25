/**
 * Anti-Corruption Layer (ACL) — Web/TypeScript Adapter
 *
 * Purpose: Bridge between the core domain model and external TypeScript
 * tooling. Provides progressive enhancement: first attempts to dynamically
 * load `typescript` from the target workspace; if unavailable (e.g., inside
 * this zero-dep kit repo), falls back to a zero-dependency Regex parser.
 *
 * Design notes:
 * - Zero external npm dependencies in the core domain.
 * - The ACL adapter is the only layer that may import `typescript`.
 * - Falls back to Regex-based parsing when TS is not available, ensuring
 *   the core domain stays pure and dependency-free.
 *
 * @module core/adapters/web-ts.adapter
 */
/**
 * Anti-Corruption Layer
 */
