/**
 * Shiki highlighter singleton (C3/C4).
 *
 * - Lazy-initialised on first call to getHighlighter() (client-side only).
 * - All 6 themes are loaded upfront; language grammars are lazy-loaded on demand.
 * - ensureLanguage() is the safe entry-point: loads a grammar if not yet loaded,
 *   returns false for unsupported/unknown langs so callers can fall back to plaintext.
 */

import type { Highlighter } from 'shiki'
import { createHighlighter as shikiCreateHighlighter } from 'shiki'
import { isSupportedLanguage } from '@/lib/editor/shiki/languages'

// ── Theme constants ─────────────────────────────────────────────────────────

export const SHIKI_THEMES = [
  'github-light',
  'github-dark',
  'dracula',
  'solarized-light',
  'solarized-dark',
  'nord',
] as const

export type ShikiTheme = (typeof SHIKI_THEMES)[number]

export const DEFAULT_THEME: ShikiTheme = 'github-light'

// ── Singleton state ─────────────────────────────────────────────────────────

/** Cached promise — ensures only one createHighlighter() call ever fires. */
let _highlighterPromise: Promise<Highlighter> | null = null

/** Set of language ids whose grammar has been successfully loaded. */
const _loadedLangs = new Set<string>()

/** Set of language ids currently being loaded (guard against double-load). */
const _loadingLangs = new Set<string>()

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Return the shared Shiki highlighter, creating it on first call.
 * All 6 bundled themes are loaded; no languages are pre-loaded.
 */
export async function getHighlighter(): Promise<Highlighter> {
  if (_highlighterPromise === null) {
    _highlighterPromise = shikiCreateHighlighter({
      themes: [...SHIKI_THEMES],
      langs: [],
    })
  }
  return _highlighterPromise
}

/**
 * Ensure a language grammar is loaded in the singleton highlighter.
 *
 * - Returns `true`  when the grammar is ready (was loaded or already present).
 * - Returns `false` when the lang is unsupported, unknown, or failed to load.
 *   The caller should render the block as plaintext in that case.
 *
 * Guards against concurrent/repeated loads for the same lang.
 */
export async function ensureLanguage(lang: string): Promise<boolean> {
  if (!isSupportedLanguage(lang)) return false
  if (_loadedLangs.has(lang)) return true
  if (_loadingLangs.has(lang)) {
    // Another call is already in-flight; wait for the highlighter to settle
    // then check again (the other call will have populated _loadedLangs).
    await getHighlighter()
    return _loadedLangs.has(lang)
  }

  _loadingLangs.add(lang)
  try {
    const hl = await getHighlighter()
    await hl.loadLanguage(lang as Parameters<typeof hl.loadLanguage>[0])
    _loadedLangs.add(lang)
    return true
  } catch {
    // Unknown lang id or network/wasm failure — treat as plaintext.
    return false
  } finally {
    _loadingLangs.delete(lang)
  }
}

/**
 * Synchronous check: is this language grammar already available in the highlighter?
 * Used by the decoration plugin to decide between highlighting and plaintext
 * without any async work on the hot path.
 */
export function isLanguageLoaded(lang: string): boolean {
  return _loadedLangs.has(lang)
}
