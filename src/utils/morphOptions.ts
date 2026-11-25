/**
 * Morph options input parsing / display helpers.
 *
 * The teacher-facing morph-options field is a free-text input. Options are
 * separated by commas, but multi-word forms (e.g. "will not") must survive
 * as a single option. Square brackets let the teacher group a custom morph
 * range inline:
 *
 *   go, [will not], won't   →   ["go", "will not", "won't"]
 *
 * Brackets are stripped from the stored options; they are only a grouping
 * hint for the editor input so spaces (and commas) inside an option are
 * preserved end to end.
 */

/** Parse a free-text morph-options string into an array of options. */
export function parseMorphOptions(value: string): string[] {
  const options: string[] = [];
  let current = '';
  let depth = 0;

  for (const ch of value) {
    if (ch === '[') {
      depth++;
      current += ch;
    } else if (ch === ']') {
      depth = Math.max(0, depth - 1);
      current += ch;
    } else if (ch === ',' && depth === 0) {
      const option = stripBrackets(current.trim());
      if (option) options.push(option);
      current = '';
    } else {
      current += ch;
    }
  }

  const last = stripBrackets(current.trim());
  if (last) options.push(last);

  return options;
}

/** Remove grouping brackets and surrounding whitespace from a single option. */
function stripBrackets(option: string): string {
  return option.replace(/[\[\]]/g, '').trim();
}

/**
 * Format a single option for display inside the morph-options input.
 * Options containing spaces or commas are wrapped in [] so they round-trip
 * through parseMorphOptions unchanged.
 */
export function formatMorphOption(option: string): string {
  return /[,\s]/.test(option) ? `[${option}]` : option;
}

/** Format an array of options for display inside the morph-options input. */
export function formatMorphOptions(options: string[]): string {
  return options.map(formatMorphOption).join(', ');
}
