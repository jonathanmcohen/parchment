/**
 * Language auto-detection for code blocks (C2).
 *
 * Uses highlight.js (core + curated language subset) to classify a code
 * block's text content. Maps the winning hljs language id through normalizeLang()
 * to a canonical Shiki id. Low-confidence or trivially-short input → 'plaintext'.
 */

import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { normalizeLang } from '@/lib/editor/shiki/languages'

// ── Types ──────────────────────────────────────────────────────────────────

export interface Detection {
  /** Canonical Shiki language id, or 'plaintext' when undetectable. */
  language: string
  /** Raw hljs relevance score (0 when unknown/short). */
  confidence: number
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Minimum hljs relevance score to accept a detection (below → plaintext). */
const CONFIDENCE_THRESHOLD = 5

/** Minimum non-space characters required to attempt detection. */
const MIN_CODE_CHARS = 12

/**
 * hljs language ids to include in highlightAuto's subset.
 * Maps hljs canonical ids to the languages we support.
 * Note: hljs uses slightly different names for some (e.g. 'xml' covers HTML).
 */
const HLJS_SUBSET = [
  'typescript',
  'javascript',
  'python',
  'go',
  'rust',
  'java',
  'c',
  'cpp',
  'csharp',
  'ruby',
  'php',
  'bash',
  'sql',
  'xml', // hljs uses xml for HTML/XML
  'css',
  'json',
  'yaml',
  'markdown',
  'dockerfile',
]

// ── Lazy hljs singleton ────────────────────────────────────────────────────

type HljsCore = typeof import('highlight.js/lib/core')['default']

let _hljs: HljsCore | null = null

function getHljs(): HljsCore {
  if (_hljs !== null) return _hljs

  // Inline require so this module stays importable in SSR/test environments
  // without bundling all of highlight.js upfront.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const hljs = (require('highlight.js/lib/core') as { default: HljsCore }).default

  // Register each language once.
  const langs: Record<string, () => unknown> = {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    typescript: () => require('highlight.js/lib/languages/typescript'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    javascript: () => require('highlight.js/lib/languages/javascript'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    python: () => require('highlight.js/lib/languages/python'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    go: () => require('highlight.js/lib/languages/go'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    rust: () => require('highlight.js/lib/languages/rust'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    java: () => require('highlight.js/lib/languages/java'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    c: () => require('highlight.js/lib/languages/c'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cpp: () => require('highlight.js/lib/languages/cpp'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    csharp: () => require('highlight.js/lib/languages/csharp'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ruby: () => require('highlight.js/lib/languages/ruby'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    php: () => require('highlight.js/lib/languages/php'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    bash: () => require('highlight.js/lib/languages/bash'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sql: () => require('highlight.js/lib/languages/sql'),
    // xml covers html in hljs
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    xml: () => require('highlight.js/lib/languages/xml'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    css: () => require('highlight.js/lib/languages/css'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    json: () => require('highlight.js/lib/languages/json'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    yaml: () => require('highlight.js/lib/languages/yaml'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    markdown: () => require('highlight.js/lib/languages/markdown'),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    dockerfile: () => require('highlight.js/lib/languages/dockerfile'),
  }

  for (const [name, loader] of Object.entries(langs)) {
    try {
      const mod = loader() as { default?: unknown } | unknown
      const def = (mod as { default?: unknown }).default ?? mod
      hljs.registerLanguage(name, def as Parameters<typeof hljs.registerLanguage>[1])
    } catch {
      // Language not available — silently skip (won't appear in highlightAuto results).
    }
  }

  _hljs = hljs
  return hljs
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Detect the programming language of the given code string.
 *
 * - Runs hljs.highlightAuto over a curated language subset.
 * - Maps the winning hljs id through normalizeLang() to a canonical Shiki id.
 * - Returns { language: 'plaintext' } when:
 *   - The code has fewer than MIN_CODE_CHARS non-space characters, OR
 *   - The hljs relevance score is below CONFIDENCE_THRESHOLD.
 * - Never throws.
 */
export function detectLanguage(code: string): Detection {
  try {
    // Trivially short / empty check.
    const nonSpace = code.replace(/\s/g, '')
    if (nonSpace.length < MIN_CODE_CHARS) {
      return { language: 'plaintext', confidence: 0 }
    }

    const hljs = getHljs()
    const result = hljs.highlightAuto(code, HLJS_SUBSET)

    const confidence = result.relevance ?? 0
    if (confidence < CONFIDENCE_THRESHOLD || !result.language) {
      return { language: 'plaintext', confidence }
    }

    // Map hljs id → canonical Shiki id (xml → html, etc.).
    const canonical = normalizeLang(result.language)
    return { language: canonical, confidence }
  } catch {
    return { language: 'plaintext', confidence: 0 }
  }
}

/**
 * Read the text content of the active code block node in the editor.
 * Returns null when the cursor is not inside a codeBlock node.
 */
export function getActiveCodeBlockText(editor: Editor): string | null {
  const { state } = editor
  const { $from } = state.selection

  // Walk up the ancestry to find a codeBlock node.
  for (let depth = $from.depth; depth >= 0; depth--) {
    const node: PMNode = $from.node(depth)
    if (node.type.name === 'codeBlock') {
      return node.textContent
    }
  }
  return null
}
