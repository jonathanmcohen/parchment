/**
 * Language auto-detection for code blocks (C2).
 *
 * Uses highlight.js (core + curated language subset) to classify a code
 * block's text content. Maps the winning hljs language id through normalizeLang()
 * to a canonical Shiki id. Low-confidence or trivially-short input → 'plaintext'.
 */

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

/**
 * Minimum non-space characters required to attempt detection.
 * Exported so the auto-detect plugin driver can apply the same gate before
 * paying the cost of an hljs pass.
 */
export const MIN_CODE_CHARS = 12

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

// ── Heuristic pre-pass ─────────────────────────────────────────────────────

/**
 * High-precision heuristic language detector.
 *
 * Runs BEFORE the hljs path. Returns a canonical Shiki language id when a
 * strong, low-false-positive signal matches the code, or null to fall through
 * to the hljs path.
 *
 * Precision over recall: each check requires unmistakable markers so we never
 * misclassify JS/TS/Ruby/etc. as Python (or vice-versa).
 */
function heuristicLanguage(code: string): string | null {
  // ── Python ──────────────────────────────────────────────────────────────
  // Require at least TWO independent Python markers, OR a single very-strong
  // one (a `def …():` function header alone is sufficient because it needs
  // the indent+colon combo which JS/Ruby don't share in that exact form).
  {
    const hasDef = /^\s*def\s+\w+\s*\(/m.test(code)
    const hasImport = /^\s*(import\s+\w|from\s+\w[\w.]*\s+import)/m.test(code)
    const hasClass = /^\s*class\s+\w+.*:\s*$/m.test(code)
    const hasColonBlock =
      /^\s*(if|elif|else|for|while|try|except|finally|with|def|class)\b.*:\s*$/m.test(code)
    // print() as a function call is strongly Python (JS uses console.log).
    // Guard against PHP (`<?php`) which also has print().
    const hasPhpTag = /<\?php\b/i.test(code)
    const hasPrint = !hasPhpTag && /\bprint\s*\(/.test(code)
    const hasFString = /\bf["']/.test(code)
    const hasSelf = /\bself\b/.test(code)
    const hasDunder = /__\w+__/.test(code)
    // range(), len(), isinstance() are Python built-ins with no JS counterpart.
    const hasPythonBuiltin =
      /\b(range|len|isinstance|enumerate|zip|map|filter|list|dict|tuple|set)\s*\(/.test(code)
    // Python indented block with colon (e.g. `for x in ...:` followed by indented line)
    const hasIndentedBlock = /^\s{4,}\S/m.test(code) && hasColonBlock

    // Strong combos that unambiguously mean Python:
    // 1. A def-line (always needs `:` suffix, JS/TS functions never do)
    // 2. print() alone — unambiguous function-call form
    // 3. import/from + any other Python marker
    // 4. Python built-in call + any structural marker
    // 5. Three or more weaker signals together
    const signalCount = [
      hasDef,
      hasImport,
      hasClass,
      hasColonBlock,
      hasPrint,
      hasFString,
      hasSelf,
      hasDunder,
      hasPythonBuiltin,
      hasIndentedBlock,
    ].filter(Boolean).length

    const isPython =
      hasDef || // `def foo():` is already unambiguous
      hasPrint || // print() as a function call is unambiguous Python
      (hasImport && (hasColonBlock || hasFString || hasSelf || hasDunder || hasPythonBuiltin)) ||
      (hasPythonBuiltin && (hasColonBlock || hasIndentedBlock || hasImport)) ||
      signalCount >= 3

    if (isPython) {
      const canonical = normalizeLang('python')
      if (canonical !== 'plaintext') return canonical
    }
  }

  // ── Bash / shell ────────────────────────────────────────────────────────
  {
    const hasShebang = /^#!.*\b(bash|sh|zsh)\b/.test(code)
    const shellCommands =
      /^\s*(echo|cd|export|sudo|apt(?:-get)?|grep|awk|sed|chmod|mkdir|curl|wget)\b/m.test(code)
    // Count multiple shell-command line-starts for the multi-signal path.
    const shellCommandCount = (
      code.match(/^\s*(echo|cd|export|sudo|apt(?:-get)?|grep|awk|sed|chmod|mkdir|curl|wget)\b/gm) ??
      []
    ).length

    if (hasShebang || shellCommandCount >= 2) {
      const canonical = normalizeLang('bash')
      if (canonical !== 'plaintext') return canonical
    }
    // Single shell command + shebang-like comment is also fine.
    if (shellCommands && hasShebang) {
      const canonical = normalizeLang('bash')
      if (canonical !== 'plaintext') return canonical
    }
  }

  // ── Dockerfile ──────────────────────────────────────────────────────────
  {
    const hasFrom = /^\s*FROM\s+\S+/im.test(code)
    const hasInstruction =
      /^\s*(RUN|CMD|COPY|ENV|WORKDIR|ENTRYPOINT|EXPOSE|LABEL|ARG|ADD)\b/im.test(code)
    if (hasFrom && hasInstruction) {
      const canonical = normalizeLang('dockerfile')
      if (canonical !== 'plaintext') return canonical
    }
  }

  // ── SQL ─────────────────────────────────────────────────────────────────
  {
    // Must have a DML/DDL keyword AND a clause keyword to avoid short false positives.
    const hasDml =
      /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\b/i.test(
        code,
      )
    const hasClause = /\b(FROM|WHERE|SET|VALUES|JOIN|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT)\b/i.test(
      code,
    )
    if (hasDml && hasClause) {
      const canonical = normalizeLang('sql')
      if (canonical !== 'plaintext') return canonical
    }
  }

  // ── HTML ────────────────────────────────────────────────────────────────
  if (/<!DOCTYPE\s+html/i.test(code) || /<html[\s>]/i.test(code)) {
    const canonical = normalizeLang('html')
    if (canonical !== 'plaintext') return canonical
  }

  return null
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Detect the programming language of the given code string.
 *
 * - First tries a high-precision heuristic pre-pass for Python, Bash, SQL, HTML, Dockerfile.
 * - Falls through to hljs.highlightAuto over a curated language subset.
 * - Maps the winning hljs id through normalizeLang() to a canonical Shiki id.
 * - Returns { language: 'plaintext' } when:
 *   - The code has fewer than MIN_CODE_CHARS non-space characters, OR
 *   - The heuristic and hljs paths both yield no confident result.
 * - Never throws.
 */
export function detectLanguage(code: string): Detection {
  try {
    // Trivially short / empty check.
    const nonSpace = code.replace(/\s/g, '')
    if (nonSpace.length < MIN_CODE_CHARS) {
      return { language: 'plaintext', confidence: 0 }
    }

    // High-precision heuristic pre-pass — runs before the (heavier) hljs path.
    const h = heuristicLanguage(code)
    if (h) return { language: h, confidence: CONFIDENCE_THRESHOLD }

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
