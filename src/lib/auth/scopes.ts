// J8-2: pure PAT scope taxonomy + matcher. NO db, NO React.
//
// CANONICAL scopes — the ONLY two in v0.2.0 (reconciliation §7i / §1i):
//   docs:read   — read-only access to every doc-surface route (GET/list).
//   docs:write  — read + ALL mutations (POST/PUT/PATCH/DELETE). Implies docs:read.
// Bare 'read' / 'write' strings are BANNED everywhere — they are never a Scope.
//
// Cookie (session) auth is full-access and bypasses scope checks entirely; scopes
// constrain ONLY Bearer-PAT auth.

export const ALL_SCOPES = ['docs:read', 'docs:write'] as const
export type Scope = (typeof ALL_SCOPES)[number]

const SCOPE_SET: ReadonlySet<string> = new Set(ALL_SCOPES)

// Implication graph: a granted scope satisfies itself + everything it implies.
const IMPLIES: Record<Scope, ReadonlySet<Scope>> = {
  'docs:read': new Set<Scope>(['docs:read']),
  'docs:write': new Set<Scope>(['docs:write', 'docs:read']),
}

/** True iff `s` is exactly one of the canonical scope strings. */
export function isScope(s: unknown): s is Scope {
  return typeof s === 'string' && SCOPE_SET.has(s)
}

/**
 * True iff the `granted` scope array satisfies `required` (directly or via
 * implication — docs:write satisfies docs:read). Non-canonical entries in `granted`
 * are ignored. An empty grant satisfies nothing.
 */
export function hasScope(granted: readonly string[], required: Scope): boolean {
  for (const g of granted) {
    if (isScope(g) && IMPLIES[g].has(required)) return true
  }
  return false
}

/**
 * Coerce arbitrary input into a clean, de-duplicated canonical scope array. Drops
 * bare read/write and any unknown string; NEVER upgrades (a bare 'write' does not
 * become 'docs:write'). Non-array input → []. This is the validation boundary for
 * persisted/issued scopes.
 */
export function normalizeScopes(input: unknown): Scope[] {
  if (!Array.isArray(input)) return []
  const out: Scope[] = []
  for (const v of input) {
    if (isScope(v) && !out.includes(v)) out.push(v)
  }
  return out
}
