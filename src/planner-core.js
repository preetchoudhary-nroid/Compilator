'use strict';

// ---------------------------------------------------------------------------
// Shared install-intent parsing primitives.
//
// This is the SINGLE source of truth for understanding natural-language
// install requests. It is used by BOTH the Electron main-process planner
// (main.cjs -> planFromRequest) and the browser-fallback planner
// (App.tsx -> browserPlanner) so the two parsers can never drift apart again.
//
// Approach (deliberately NOT regex-on-the-whole-string):
//   1. normalize  -> lowercase, strip punctuation, collapse whitespace
//   2. tokenize   -> split into words
//   3. locate the install verb ("install" / "set up" / "setup") from the END
//   4. take the tokens on the other side of that verb as the candidate target
//   5. remove conversational filler tokens from that side
// This handles ANY word order and ANY number of filler words:
//   "chrome install pls"       -> chrome
//   "chrome install krde bhai" -> chrome      (two trailing fillers)
//   "bhai chrome install karo" -> chrome      (leading filler + trailing filler)
//   "chrome setup kar do"      -> chrome      (compound verb after "setup")
//   "please chrome install"    -> chrome
//   "install google chrome"    -> google chrome
// ---------------------------------------------------------------------------

// Conversational filler tokens that can surround the package name in natural
// language. Package-name words (vscode, node, python, git, chrome, docker, …)
// are intentionally NOT listed here.
const FILLER_TOKENS = new Set([
  // politeness / urgency
  'pls',
  'please',
  'plz',
  'plizz',
  'kindly',
  'now',
  'today',
  'urgently',
  'urgent',
  'quick',
  'quickly',
  'fast',
  'immediately',
  'asap',
  // address terms
  'bhai',
  'bhaiya',
  'bro',
  'dude',
  'buddy',
  'friend',
  'yaar',
  'yr',
  'sir',
  'madam',
  'ji',
  // Hinglish "do it" tails / heads
  'kardo',
  'kar',
  'karo',
  'kare',
  'karde',
  'krde',
  'krdo',
  'do',
  'de',
  'dijiye',
  'na',
  'naa',
  'nah',
  'ya',
  'hain',
  'hai',
  // pronouns / articles / small words never part of a package name
  'me',
  'us',
  'i',
  'you',
  'we',
  'they',
  'my',
  'your',
  'the',
  'a',
  'an',
  'it',
  'this',
  'that',
  'there',
  'these',
  'those',
  'to',
  'on',
  'for',
  'of',
  'in',
  'at',
  'into',
  'onto',
  // machine-ish nouns
  'pc',
  'machine',
  'computer',
  'system',
  'laptop',
  'device',
  // desire/auxiliary words
  'want',
  'wants',
  'wanna',
  'need',
  'needs',
  'can',
  'could',
  'would',
  'should',
  'help',
]);

// Verb words removed from the target side if they leak across it (e.g. a
// second verb before the located one).
const VERB_TOKENS = new Set(['install', 'installed', 'installing', 'setup', 'set', 'up']);

// Negation / cancellation signals. If ANY matches, no install task may be
// planned — the user is refusing, cancelling or backing out.
const NEGATION_PATTERNS = [
  /\b(?:i\s+)?(?:do|d)on'?t\s+want\b/i, // i dont want (to) install X
  /\b(?:do|d)on'?t\s+install\b/i, // dont install chrome / don't install chrome
  /\bdo\s+not\s+install\b/i, // do not install chrome
  /\bnot\s+(?:to\s+)?install\b/i, // not install chrome / not to install chrome
  /\bnever\s+mind\b/i, // never mind, install chrome
  /\bcancel\b/i, // cancel chrome install / cancel the installation
  /\bno\s+thanks?\b/i, // no thanks
  /\b(?:nahi|nhi|mat)\s+(?:install|karna|karo)\b/i, // Hindi: "nahi install", "mat karo"
];

/** True when the request expresses refusal/cancellation of an install. */
function isNegated(raw) {
  const text = String(raw == null ? '' : raw);
  if (!text) return false;
  return NEGATION_PATTERNS.some((re) => re.test(text));
}

/** Lowercase, strip punctuation, collapse whitespace. */
function normalizeInstallText(raw) {
  return String(raw == null ? '' : raw)
    .toLowerCase()
    .replace(/[^a-z0-9.\-_'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Locate the install verb ("install", "setup", or "set up"), scanning from the
 * END so the LAST verb wins. Returns { start, end } token indexes or null.
 */
function findInstallVerb(tokens) {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t === 'install') return { start: i, end: i + 1 };
    if (t === 'setup') return { start: i, end: i + 1 };
    if (t === 'set' && tokens[i + 1] === 'up') return { start: i, end: i + 2 };
  }
  return null;
}

/**
 * Pull the package target out of a natural-language install request.
 * Returns the cleaned target (e.g. "chrome", "google chrome") or '' when the
 * request has an install verb but no identifiable package.
 */
function extractInstallTarget(raw) {
  const text = normalizeInstallText(raw);
  if (!text) return '';
  const tokens = text.split(' ');

  const verb = findInstallVerb(tokens);
  if (!verb) return '';

  const before = tokens.slice(0, verb.start);
  const after = tokens.slice(verb.end);
  const clean = (list) => list.filter((w) => !FILLER_TOKENS.has(w) && !VERB_TOKENS.has(w));

  const right = clean(after);
  const left = clean(before);
  const side = right.length > 0 ? right : left;
  return side.join(' ').trim();
}

/**
 * Normalize a phrase into comparable word tokens: lowercase and collapse every
 * run of non-alphanumerics into a single space ("notepad++" -> "notepad",
 * "7-zip" -> "7 zip", "3.13" -> "3 13"). Alias keys and natural-language
 * targets therefore compare on equal footing.
 */
function tokenizePhrase(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Match a cleaned target against a verified catalog. Never guesses: returns
 * { key, id } only for a real catalog entry, otherwise null.
 * Catalog shape is key -> string id (main.cjs) OR key -> { id, name } (App.tsx).
 *
 * Matching is token-based so the (now large) catalog stays unambiguous:
 *   - a multi-token key ("gog galaxy") must appear as a contiguous run of
 *     tokens inside the target, so "go" alone can never resolve to it;
 *   - a single-token key ("rust", "git", "go") matches only the exact word,
 *     so "rustdesk" is not hijacked by "rust", "github desktop" is not
 *     hijacked by "git", and "gog galaxy" is not hijacked by "go".
 * Punctuation is normalized on both sides first, so "notepad++" style keys
 * still match even though the target "notepad" lost its "++".
 */
function resolveCatalogTarget(target, catalog) {
  if (!catalog || typeof catalog !== 'object') return null;
  const t = tokenizePhrase(target);
  if (t.length === 0) return null;

  for (const [key, value] of Object.entries(catalog)) {
    const k = tokenizePhrase(key);
    if (k.length === 0) continue;

    const matches =
      k.length === 1
        ? t.includes(k[0])
        : t.some((_, i) => k.every((kt, j) => t[i + j] === kt));
    if (!matches) continue;

    const id = typeof value === 'string' ? value : String((value && value.id) || (value && value.name) || '');
    if (id) return { key, id };
  }
  return null;
}

export {
  FILLER_TOKENS,
  VERB_TOKENS,
  NEGATION_PATTERNS,
  isNegated,
  normalizeInstallText,
  extractInstallTarget,
  resolveCatalogTarget,
};

