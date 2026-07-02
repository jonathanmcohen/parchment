// v0.2.10 — Smart typography input rules (always-on).
//
// Curls quotes, turns hyphens into en/em dashes, expands `...`, common fractions,
// arrows, and (c)/(r)/(tm) as the user types. English quote style.
//
// EXCLUSIONS come for free: Tiptap's input-rule plugin (@tiptap/core) short-
// circuits and applies NO rule when the caret's parent node is a `code` node
// (our codeBlock has `code: true`) or is adjacent to an inline `code` mark, and
// math nodes are atoms the caret can't sit inside. So none of these rules fire in
// code blocks, inline code, or math — verified in tests/unit/typography.test.ts.
//
// DASH / DIVIDER ORDERING (the careful bit): the block-level HorizontalRule input
// rule (from StarterKit, registered BEFORE this extension) already turns a
// line-start `---` into a divider. To keep that intact, the en-dash rule here
// refuses to fire at the very start of a textblock, so a line-start `-- -`
// sequence stays plain text until the third hyphen lands and the HR rule wins.
// Mid-line, `--` → en dash `–` and a following `-` (now `–-`) → em dash `—`.
//
// A NATURAL SETTINGS HOOK FOR LATER: this extension takes an `enabled` option
// (default true). A workspace/account "smart typography" toggle could pass
// `SmartTypography.configure({ enabled: settings.smartTypography })` from
// Editor.tsx — out of scope for v0.2.10, but the seam is here.

import { Extension, InputRule, textInputRule } from '@tiptap/core'

// Unicode targets (kept as escapes so the source stays ASCII-clean).
const EN_DASH = '–' // –
const EM_DASH = '—' // —
const LDQUO = '“' // “
const RDQUO = '”' // ”
const LSQUO = '‘' // ‘
const RSQUO = '’' // ’
const HELLIP = '…' // …
const RARR = '→' // →
const LARR = '←' // ←
const COPY = '©' // ©
const REG = '®' // ®
const TM = '™' // ™
const HALF = '½' // ½
const QUARTER = '¼' // ¼
const THREEQ = '¾' // ¾

export interface SmartTypographyOptions {
  /** Master switch. When false the extension registers no input rules. */
  enabled: boolean
}

/**
 * En dash on `--`, but never at the very start of a textblock (so a line-start
 * `---` is left for the HorizontalRule rule to claim). The replacement covers
 * only the two hyphens; any preceding text is untouched.
 */
const enDashRule = new InputRule({
  find: /--$/,
  handler: ({ state, range }) => {
    const $from = state.doc.resolve(range.from)
    // Line start → defer to the block-level divider rule.
    if ($from.parentOffset === 0) return null
    // Preceded by another hyphen → this is heading toward `---`; leave it so the
    // em-dash / divider path can run instead of eating the middle hyphen.
    const before = state.doc.textBetween(range.from - 1, range.from)
    if (before === '-') return null
    state.tr.insertText(EN_DASH, range.from, range.to)
  },
})

/**
 * Em dash: an en dash immediately followed by a hyphen (`–-`) collapses to `—`.
 * Because en dashes only ever appear mid-line, this can never fire at a line
 * start, so a line-start `---` divider is never disturbed.
 */
const emDashRule = new InputRule({
  find: new RegExp(`${EN_DASH}-$`),
  handler: ({ state, range }) => {
    state.tr.insertText(EM_DASH, range.from, range.to)
  },
})

function buildRules(): InputRule[] {
  return [
    // Dashes first (custom handlers), then the simple 1:1 substitutions.
    enDashRule,
    emDashRule,
    // Smart quotes (English). Open quotes require a boundary before them so a
    // closing quote after a letter curls the other way.
    textInputRule({ find: /(?:^|[\s{[(<'"‘“])(")$/, replace: LDQUO }),
    textInputRule({ find: /"$/, replace: RDQUO }),
    textInputRule({ find: /(?:^|[\s{[(<'"‘“])(')$/, replace: LSQUO }),
    textInputRule({ find: /'$/, replace: RSQUO }),
    // Ellipsis.
    textInputRule({ find: /\.\.\.$/, replace: HELLIP }),
    // Arrows.
    textInputRule({ find: /->$/, replace: RARR }),
    textInputRule({ find: /<-$/, replace: LARR }),
    // Symbols.
    textInputRule({ find: /\(c\)$/, replace: COPY }),
    textInputRule({ find: /\(r\)$/, replace: REG }),
    textInputRule({ find: /\(tm\)$/, replace: TM }),
    // Common fractions — trailing space is the trigger; the space is preserved.
    textInputRule({ find: /(?:^|\s)(1\/2)\s$/, replace: `${HALF} ` }),
    textInputRule({ find: /(?:^|\s)(1\/4)\s$/, replace: `${QUARTER} ` }),
    textInputRule({ find: /(?:^|\s)(3\/4)\s$/, replace: `${THREEQ} ` }),
  ]
}

export const SmartTypography = Extension.create<SmartTypographyOptions>({
  name: 'smartTypography',

  addOptions() {
    return { enabled: true }
  },

  addInputRules() {
    if (!this.options.enabled) return []
    return buildRules()
  },
})

export default SmartTypography
