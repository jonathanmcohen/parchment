import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import {
  AUTOSAVE_INTERVAL_KEY,
  clampAutosaveMs,
  DEFAULT_AUTOSAVE_MS,
} from '@/lib/docs/autosave-config'
import {
  DEFAULT_WORKSPACE_NAME,
  normalizeWorkspaceName,
  WORKSPACE_NAME_KEY,
} from '@/lib/docs/workspace-config'
import { DEFAULT_STYLES, type NamedStyle, parseStyles } from '@/lib/editor/styles'
import { DEFAULT_THEME, parseTheme, type WorkspaceTheme } from '@/lib/editor/theme'

// E11: generic owner key-value settings store.

export const TRASH_RETENTION_KEY = 'trashRetentionDays'
export const DEFAULT_TRASH_RETENTION_DAYS = 30

// G3: workspace theme + named styles, both reusing this settings store.
export const WORKSPACE_THEME_KEY = 'workspaceTheme'
export const DOC_STYLES_KEY = 'docStyles'

// K6: browser-native spellcheck on/off (default ON — matches contenteditable
// default). Reuses this settings store; no migration.
export const SPELLCHECK_KEY = 'spellcheckEnabled'
export const DEFAULT_SPELLCHECK_ENABLED = true

// v0.1.5: workspace page-layout mode — Continuous (default) vs Paged. Drives a
// stronger "sheet-edge" boundary visual in the editor. Reuses this generic
// settings store under a new KEY; no DB migration. We NEVER trust an arbitrary
// stored string — only the exact literal 'paged' is honoured, everything else
// (including malformed/legacy values) falls back to 'continuous'.
export const PAGE_LAYOUT_MODE_KEY = 'pageLayoutMode'
export type PageLayoutMode = 'continuous' | 'paged'

// F7: workspace display name. Reuses this generic settings store under a new
// KEY — no DB migration. Constants + the pure normalize helper live in the
// client-safe split so the route and the client island share one source.
export {
  DEFAULT_WORKSPACE_NAME,
  MAX_WORKSPACE_NAME_LEN,
  normalizeWorkspaceName,
  WORKSPACE_NAME_KEY,
} from '@/lib/docs/workspace-config'

/** Return the stored value for (ownerId, key), or `fallback` if unset. */
export async function getSetting<T>(ownerId: string, key: string, fallback: T): Promise<T> {
  const [row] = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(and(eq(schema.settings.ownerId, ownerId), eq(schema.settings.key, key)))
    .limit(1)
  if (row === undefined) return fallback
  return row.value as T
}

/** Upsert (ownerId, key) = value. */
export async function setSetting(ownerId: string, key: string, value: unknown): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ ownerId, key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.settings.ownerId, schema.settings.key],
      set: { value, updatedAt: new Date() },
    })
}

/** Read the owner's trash-retention window in days (default 30). */
export async function getTrashRetentionDays(ownerId: string): Promise<number> {
  return getSetting<number>(ownerId, TRASH_RETENTION_KEY, DEFAULT_TRASH_RETENTION_DAYS)
}

/** Persist trash-retention days (clamped to integer >= 0). */
export async function setTrashRetentionDays(ownerId: string, days: number): Promise<void> {
  const clamped = Math.max(0, Math.round(days))
  await setSetting(ownerId, TRASH_RETENTION_KEY, clamped)
}

/** Read the owner's workspace theme (validated; defaults when unset/malformed). */
export async function getWorkspaceTheme(ownerId: string): Promise<WorkspaceTheme> {
  const raw = await getSetting<unknown>(ownerId, WORKSPACE_THEME_KEY, DEFAULT_THEME)
  return parseTheme(raw)
}

/** Persist the owner's workspace theme (normalized via parseTheme). */
export async function setWorkspaceTheme(ownerId: string, theme: unknown): Promise<WorkspaceTheme> {
  const normalized = parseTheme(theme)
  await setSetting(ownerId, WORKSPACE_THEME_KEY, normalized)
  return normalized
}

// I3: autosave cadence setting (5s–5min).
// Re-export from the client-safe split so server code and client code share one source.
export {
  AUTOSAVE_INTERVAL_KEY,
  clampAutosaveMs,
  DEFAULT_AUTOSAVE_MS,
  MAX_AUTOSAVE_MS,
  MIN_AUTOSAVE_MS,
} from '@/lib/docs/autosave-config'

/** Read the owner's autosave interval in ms (default 30000). */
export async function getAutosaveInterval(ownerId: string): Promise<number> {
  const raw = await getSetting<unknown>(ownerId, AUTOSAVE_INTERVAL_KEY, DEFAULT_AUTOSAVE_MS)
  const n = typeof raw === 'number' ? raw : DEFAULT_AUTOSAVE_MS
  return clampAutosaveMs(n)
}

/** Persist the owner's autosave interval (clamped to [MIN, MAX]). */
export async function setAutosaveInterval(ownerId: string, ms: number): Promise<void> {
  const clamped = clampAutosaveMs(ms)
  await setSetting(ownerId, AUTOSAVE_INTERVAL_KEY, clamped)
}

/** Read the owner's page-layout mode (validated; 'continuous' unless stored value is exactly 'paged'). */
export async function getPageLayoutMode(ownerId: string): Promise<PageLayoutMode> {
  const raw = await getSetting<unknown>(ownerId, PAGE_LAYOUT_MODE_KEY, 'continuous')
  return raw === 'paged' ? 'paged' : 'continuous'
}

/** Persist the owner's page-layout mode (coerced to 'paged' or 'continuous'). Returns the normalized value. */
export async function setPageLayoutMode(ownerId: string, mode: unknown): Promise<PageLayoutMode> {
  const normalized: PageLayoutMode = mode === 'paged' ? 'paged' : 'continuous'
  await setSetting(ownerId, PAGE_LAYOUT_MODE_KEY, normalized)
  return normalized
}

/** Read the owner's native-spellcheck preference (default ON). */
export async function getSpellcheckEnabled(ownerId: string): Promise<boolean> {
  const raw = await getSetting<unknown>(ownerId, SPELLCHECK_KEY, DEFAULT_SPELLCHECK_ENABLED)
  return typeof raw === 'boolean' ? raw : DEFAULT_SPELLCHECK_ENABLED
}

/** Persist the owner's native-spellcheck preference (coerced to a boolean). */
export async function setSpellcheckEnabled(ownerId: string, enabled: boolean): Promise<void> {
  await setSetting(ownerId, SPELLCHECK_KEY, !!enabled)
}

/** F7: Read the owner's workspace name (normalized; '' when unset/malformed). */
export async function getWorkspaceName(ownerId: string): Promise<string> {
  const raw = await getSetting<unknown>(ownerId, WORKSPACE_NAME_KEY, DEFAULT_WORKSPACE_NAME)
  return normalizeWorkspaceName(raw)
}

/** F7: Persist the owner's workspace name (normalized). Returns the stored value. */
export async function setWorkspaceName(ownerId: string, name: unknown): Promise<string> {
  const normalized = normalizeWorkspaceName(name)
  await setSetting(ownerId, WORKSPACE_NAME_KEY, normalized)
  return normalized
}

/** Read the owner's named styles, or the built-in defaults if unset. */
export async function getDocStyles(ownerId: string): Promise<NamedStyle[]> {
  const raw = await getSetting<unknown>(ownerId, DOC_STYLES_KEY, undefined)
  if (raw === undefined || raw === null) return [...DEFAULT_STYLES]
  return parseStyles(raw)
}

/** Persist the owner's named styles (validated; malformed entries dropped). */
export async function setDocStyles(ownerId: string, styles: unknown): Promise<NamedStyle[]> {
  const normalized = parseStyles(styles)
  await setSetting(ownerId, DOC_STYLES_KEY, normalized)
  return normalized
}
