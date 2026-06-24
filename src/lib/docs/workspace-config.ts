// F7: Pure workspace-name constants and the normalize helper — no @/db
// dependency. Imported by both settings-repo.ts (server) and the
// WorkspaceNameSetting client island, so the validation rule lives in one place
// and never drags the DB client into the browser bundle.

export const WORKSPACE_NAME_KEY = 'workspaceName'
export const DEFAULT_WORKSPACE_NAME = ''
export const MAX_WORKSPACE_NAME_LEN = 80

/**
 * Normalize a workspace-name input: coerce non-strings to '', trim surrounding
 * whitespace, collapse internal runs of whitespace to single spaces, and cap at
 * MAX_WORKSPACE_NAME_LEN characters. Pure — safe to unit-test without a DB and
 * safe to import from a client component.
 */
export function normalizeWorkspaceName(input: unknown): string {
  if (typeof input !== 'string') return ''
  return input.trim().replace(/\s+/g, ' ').slice(0, MAX_WORKSPACE_NAME_LEN)
}
