/**
 * Per-novel character-name substitution — a persistent, ordered list of
 * find/replace rules applied to a chapter's text before it reaches the reader
 * WebView (so both the on-screen text and the TTS paragraphs, which the
 * WebView extracts from that same HTML, are substituted).
 *
 * Ported from the Capacitor WeLiNo app (`src/substitution/`), trimmed to the
 * manual-rule engine: no book scanning / auto-detection, and every rule is
 * scoped to one novel (`novelId`).
 */

export interface NameSubstitutionRule {
  id: number;
  novelId: number;
  /** Literal string for `plain` rules, a RegExp source for `regex` rules. */
  pattern: string;
  /** Replacement text. `regex` rules may use `$1`..`$9`, `$&`, `$$`. */
  replacement: string;
  kind: 'plain' | 'regex';
  /** Plain rules only: wrap the pattern in `\b…\b` (off for CJK etc.). */
  wholeWord: boolean;
  caseSensitive: boolean;
  /**
   * Plain, case-insensitive rules only: make the replacement echo the case of
   * the text it replaced (ALL CAPS → ALL CAPS, Title → Title).
   */
  preserveCase: boolean;
  enabled: boolean;
  /** Apply order, ascending. */
  position: number;
  note: string | null;
}

export interface SubstitutionResult {
  text: string;
  /** Replacement count per rule id (only rules that fired). */
  counts: Record<number, number>;
  /** Ids of rules whose pattern failed to compile. */
  invalid: number[];
}

const REGEXP_SPECIALS = /[.*+?^${}()|[\]\\]/g;

const escapeRegExp = (literal: string): string =>
  literal.replace(REGEXP_SPECIALS, '\\$&');

/** Compile one rule to a global RegExp, or null if its pattern is invalid. */
export const compileRule = (rule: NameSubstitutionRule): RegExp | null => {
  const flags = rule.caseSensitive ? 'g' : 'gi';
  try {
    if (rule.kind === 'regex') {
      return new RegExp(rule.pattern, flags);
    }
    const body = escapeRegExp(rule.pattern);
    return new RegExp(rule.wholeWord ? `\\b${body}\\b` : body, flags);
  } catch {
    return null;
  }
};

const echoCase = (source: string, target: string): string => {
  // CJK / digits / punctuation are "equal to" both their cases — leave the
  // replacement exactly as typed.
  if (source.toLowerCase() === source.toUpperCase()) return target;
  if (source === source.toUpperCase()) return target.toUpperCase();
  if (source === source.toLowerCase()) return target.toLowerCase();
  if (source[0] === source[0].toUpperCase()) {
    return target.charAt(0).toUpperCase() + target.slice(1);
  }
  return target;
};

/** Expand `$1`..`$9`, `$&`, `$$` in a regex rule's replacement. */
const expand = (replacement: string, match: string, groups: string[]): string =>
  replacement.replace(/\$(\$|&|\d)/g, (_, token: string) => {
    if (token === '$') return '$';
    if (token === '&') return match;
    return groups[Number(token) - 1] ?? '';
  });

/**
 * Apply enabled rules to `text`, in `position` order. Rules chain: each sees
 * the output of the previous one.
 */
export const applySubstitutions = (
  text: string,
  rules: NameSubstitutionRule[],
): SubstitutionResult => {
  const counts: Record<number, number> = {};
  const invalid: number[] = [];
  let out = text;

  const ordered = [...rules].sort((a, b) => a.position - b.position);
  for (const rule of ordered) {
    if (!rule.enabled || !rule.pattern) continue;
    const re = compileRule(rule);
    if (!re) {
      invalid.push(rule.id);
      continue;
    }
    let fired = 0;
    out = out.replace(re, (match: string, ...args: unknown[]) => {
      fired += 1;
      const groups = args
        .slice(0, -2)
        .map(g => (typeof g === 'string' ? g : ''));
      if (rule.kind === 'regex') {
        return expand(rule.replacement, match, groups);
      }
      if (rule.preserveCase && !rule.caseSensitive) {
        return echoCase(match, rule.replacement);
      }
      return rule.replacement;
    });
    if (fired) counts[rule.id] = fired;
  }

  return { text: out, counts, invalid };
};
