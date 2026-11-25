/**
 * Sync Engine — Incremental SHA-256 hash diffing and manifest persistence.
 *
 * Design notes:
 * - Pure functions with no external dependencies.
 * - Accept `now: Date` / clock as a parameter for deterministic behavior.
 * - Uses JSON for manifest persistence; caller is responsible for file I/O.
 *
 * @module core/services/sync-engine
 */
import crypto from 'node:crypto';

/**
 * Compute the SHA-256 hash of a string value.
 *
 * @param {string} input  The input string to hash.
 * @returns {string}      The SHA-256 hex digest.
 */
export function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

/**
 * Generate a new manifest entry with SHA-256 hash for a file.
 *
 * @param {object} opts
 * @param {string} opts.filePath  Absolute or relative path to the file.
 * @param {string} opts.content   File content string.
 * @param {Date}   [opts.now]     Optional deterministic clock.
 * @returns {object}              Manifest entry with path, hash, and timestamp.
 */
export function generateManifestEntry({ filePath, content, now = new Date() }) {
  const hash = sha256(content);
  return {
    path: filePath,
    hash,
    lastModified: now.toISOString(),
  };
}

/**
 * Compare two manifest entries and return whether they differ.
 *
 * @param {object} a  First manifest entry.
 * @param {object} b  Second manifest entry.
 * @returns {boolean}  `true` if the entries differ (require update).
 */
export function hasManifestChanged(a, b) {
  if (!a || !b) return true;
  return a.hash !== b.hash || a.lastModified !== b.lastModified;
}

/**
 * Compute the blast radius of changed files based on a manifest.
 *
 * @param {object} prevManifest  Previous manifest with file hashes.
 * @param {object} currManifest  Current manifest with file hashes.
 * @returns {{ added: string[], removed: string[], changed: string[] }}  Categorized changes.
 */
export function computeBlastRadius(prevManifest, currManifest) {
  const prevSet = new Set(Object.keys(prevManifest || {}));
  const currSet = new Set(Object.keys(currManifest || {}));

  const added = [...currSet].filter((x) => !prevSet.has(x));
  const removed = [...prevSet].filter((x) => !currSet.has(x));
  const changed = [...currSet].filter(
    (x) => prevSet.has(x) && hasManifestChanged(prevManifest[x], currManifest[x])
  );

  return { added, removed, changed };
}
