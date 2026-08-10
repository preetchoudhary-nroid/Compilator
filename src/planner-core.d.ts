/**
 * Type declarations for the shared planner core (src/planner-core.js).
 * The runtime file is ESM ("type": "module"); Vite serves it to the browser
 * and Electron main.cjs requires it via require(esm) on Node 24.
 */

export type CatalogEntry = string | { id: string; name: string };

export interface CatalogHit {
  key: string;
  id: string;
}

export const FILLER_TOKENS: ReadonlySet<string>;
export const VERB_TOKENS: ReadonlySet<string>;
export const NEGATION_PATTERNS: readonly RegExp[];

/** True when the request expresses refusal/cancellation of an install. */
export function isNegated(raw: unknown): boolean;

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeInstallText(raw: unknown): string;

/**
 * Pull the package target out of a natural-language install request.
 * Returns '' when there is no install verb or no identifiable package.
 */
export function extractInstallTarget(raw: unknown): string;

/**
 * Match a cleaned target against a verified catalog. Never guesses: returns
 * { key, id } only for a real catalog entry, otherwise null.
 */
export function resolveCatalogTarget(target: unknown, catalog: Record<string, CatalogEntry>): CatalogHit | null;
