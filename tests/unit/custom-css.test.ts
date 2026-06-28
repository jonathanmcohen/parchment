import { describe, expect, it } from 'vitest'
import {
  CUSTOM_CSS_SCOPE,
  parseCustomCss,
  prepareCustomCss,
  sanitizeCustomCss,
  scopeCustomCss,
} from '@/lib/editor/custom-css'

const SCOPE = `.${CUSTOM_CSS_SCOPE}`

// ── sanitizeCustomCss ─────────────────────────────────────────────────────────

describe('sanitizeCustomCss', () => {
  it('removes @import url(...)', () => {
    const input = '@import url("https://evil.com/bad.css");'
    expect(sanitizeCustomCss(input)).not.toContain('@import')
  })

  it('removes @import string form', () => {
    const input = '@import "https://evil.com/bad.css";'
    expect(sanitizeCustomCss(input)).not.toContain('@import')
  })

  it('removes url(http://...) — external absolute URL', () => {
    const result = sanitizeCustomCss('div { background: url(http://evil.com/x.png) }')
    expect(result).not.toContain('http://evil.com')
  })

  it('removes url(//evil/x) — protocol-relative URL', () => {
    const result = sanitizeCustomCss('div { background: url(//evil.com/x.png) }')
    expect(result).not.toContain('//evil.com')
  })

  it('removes url(https://...) — external https URL', () => {
    const result = sanitizeCustomCss('div { background: url(https://evil.com/x.png) }')
    expect(result).not.toContain('https://evil.com')
  })

  it('removes url(javascript:...) — script URL', () => {
    const result = sanitizeCustomCss("div { background: url(javascript:alert('xss')) }")
    expect(result).not.toContain('javascript:')
  })

  it('removes url(data:...) — data URI script vector', () => {
    const result = sanitizeCustomCss(
      'div { background: url(data:text/html,<script>alert(1)</script>) }',
    )
    expect(result).not.toContain('data:')
  })

  it('keeps safe relative url(...) (relative path)', () => {
    const result = sanitizeCustomCss("div { background: url('/assets/bg.png') }")
    // Relative path — not an external URL, so it is kept (replaced with url('/assets/bg.png'))
    // The implementation replaces with url('...') preserving the href.
    expect(result).toContain("url('/assets/bg.png')")
  })

  it('removes expression(...) — IE CSS expression', () => {
    const result = sanitizeCustomCss('div { width: expression(alert(1)) }')
    expect(result).not.toContain('expression(')
  })

  it('removes any < character — prevents </style> injection', () => {
    const result = sanitizeCustomCss('div::after { content: "</style><script>bad</script>" }')
    expect(result).not.toContain('<')
  })

  it('caps length at 20000 characters', () => {
    const big = 'a'.repeat(25_000)
    expect(sanitizeCustomCss(big).length).toBeLessThanOrEqual(20_000)
  })

  it('returns empty string for non-string input', () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing runtime safety
    expect(sanitizeCustomCss(null as any)).toBe('')
    // biome-ignore lint/suspicious/noExplicitAny: testing runtime safety
    expect(sanitizeCustomCss(42 as any)).toBe('')
  })

  it('strips @scope block entirely — adversarial :root prelude (scope-escape #1)', () => {
    // @scope (:root) lets the inner selector target the document root, completely
    // bypassing the .parchment-custom-scope prefix defence.
    const input = '@scope (:root) { body { background: red } }'
    const result = sanitizeCustomCss(input)
    expect(result).not.toContain('@scope')
    expect(result).not.toContain('background: red')
  })

  it('strips @scope block entirely — adversarial html prelude (scope-escape #2)', () => {
    const input = '@scope (html) { .parchment-toolbar { display: none !important } }'
    const result = sanitizeCustomCss(input)
    expect(result).not.toContain('@scope')
    expect(result).not.toContain('parchment-toolbar')
  })

  it('strips @scope block entirely — universal selector inside (scope-escape #3)', () => {
    const input = '@scope (:root) { * { color: hotpink !important } }'
    const result = sanitizeCustomCss(input)
    expect(result).not.toContain('@scope')
  })

  it('strips @scope and preserves surrounding safe rules', () => {
    const input = 'h1 { color: blue } @scope (:root) { body { background: red } } p { margin: 0 }'
    const result = sanitizeCustomCss(input)
    expect(result).not.toContain('@scope')
    expect(result).not.toContain('background: red')
    // Safe rules before and after the @scope block must survive.
    expect(result).toContain('h1')
    expect(result).toContain('p')
  })
})

// ── scopeCustomCss ────────────────────────────────────────────────────────────

describe('scopeCustomCss', () => {
  it('prefixes a simple h1 rule', () => {
    const result = scopeCustomCss('h1 { color: red }', SCOPE)
    expect(result).toContain(`${SCOPE} h1`)
  })

  it('prefixes each of h1, h2 in a grouped selector', () => {
    const result = scopeCustomCss('h1, h2 { color: blue }', SCOPE)
    expect(result).toContain(`${SCOPE} h1`)
    expect(result).toContain(`${SCOPE} h2`)
  })

  it('prefixes the INNER selector inside @media, keeping the prelude', () => {
    const result = scopeCustomCss('@media (max-width: 600px) { p { margin: 0 } }', SCOPE)
    expect(result).toContain('@media (max-width: 600px)')
    expect(result).toContain(`${SCOPE} p`)
  })

  it('leaves @keyframes body untouched (from/to are not selectors)', () => {
    const input =
      '@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }'
    const result = scopeCustomCss(input, SCOPE)
    expect(result).toContain('@keyframes spin')
    // The keyframe stops must NOT be prefixed with the scope class.
    expect(result).not.toContain(`${SCOPE} from`)
    expect(result).not.toContain(`${SCOPE} to`)
  })

  it('leaves @font-face body untouched', () => {
    const input = "@font-face { font-family: 'MyFont'; src: url('/fonts/my.woff2') }"
    const result = scopeCustomCss(input, SCOPE)
    expect(result).toContain('@font-face')
    expect(result).not.toContain(`${SCOPE} font-family`)
  })

  it('scopes a rule targeting body — becomes .parchment-custom-scope body (harmless)', () => {
    const result = scopeCustomCss('body { background: red }', SCOPE)
    // Must be scoped — never matches the real body (no .parchment-custom-scope on <body>)
    expect(result).toContain(`${SCOPE} body`)
    expect(result).not.toMatch(/^body\s*\{/) // must not be bare `body {` at start
  })

  it('scopes a rule targeting .parchment-toolbar — becomes harmlessly nested', () => {
    const result = scopeCustomCss('.parchment-toolbar { display: none }', SCOPE)
    expect(result).toContain(`${SCOPE} .parchment-toolbar`)
    // The scope class is never on the toolbar element → rule never matches
  })

  it('returns empty string for blank input', () => {
    expect(scopeCustomCss('', SCOPE)).toBe('')
    expect(scopeCustomCss('   ', SCOPE)).toBe('')
  })

  it('prefixes inside @supports', () => {
    const result = scopeCustomCss('@supports (display: grid) { .grid { display: grid } }', SCOPE)
    expect(result).toContain('@supports')
    expect(result).toContain(`${SCOPE} .grid`)
  })
})

// ── prepareCustomCss ──────────────────────────────────────────────────────────

describe('prepareCustomCss', () => {
  it('applies sanitize then scope (pipeline)', () => {
    // @import must be stripped AND the remaining rule scoped.
    const input = '@import url("evil.css"); h1 { color: red }'
    const result = prepareCustomCss(input, SCOPE)
    expect(result).not.toContain('@import')
    expect(result).toContain(`${SCOPE} h1`)
  })

  it('strips external url and scopes the remaining rule', () => {
    const input = 'div { background: url(https://evil.com/img.png); color: red }'
    const result = prepareCustomCss(input, SCOPE)
    expect(result).not.toContain('https://evil.com')
    expect(result).toContain(`${SCOPE} div`)
  })
})

// ── parseCustomCss ────────────────────────────────────────────────────────────

describe('parseCustomCss', () => {
  it('returns empty string for non-string values', () => {
    expect(parseCustomCss(null)).toBe('')
    expect(parseCustomCss(undefined)).toBe('')
    expect(parseCustomCss(123)).toBe('')
    expect(parseCustomCss({})).toBe('')
  })

  it('returns the string as-is when within the length cap', () => {
    expect(parseCustomCss('h1 { color: red }')).toBe('h1 { color: red }')
  })

  it('caps the string at 20000 characters', () => {
    const big = 'x'.repeat(25_000)
    expect(parseCustomCss(big).length).toBe(20_000)
  })
})

// ── J12-3: workspace/share break-out regression (the values that reach anonymous
// viewers MUST be neutralized) ────────────────────────────────────────────────

describe('sanitizeCustomCss — J12-3 break-out regression', () => {
  it('strips a vbscript: scheme', () => {
    const out = sanitizeCustomCss("div { background: url(vbscript:msgbox('x')) }")
    expect(out).not.toMatch(/vbscript:/i)
  })

  it('strips @scope with NO prelude (relative form)', () => {
    const out = sanitizeCustomCss('@scope { :scope { color: red } }')
    expect(out).not.toContain('@scope')
  })

  it('neutralizes a </style> break-out hidden inside a comment', () => {
    const out = sanitizeCustomCss('/* </style><script>x</script> */ h1 { color: red }')
    expect(out).not.toContain('<')
  })

  it('strips a protocol-relative url that the structured pass might miss', () => {
    const out = sanitizeCustomCss("div { background: url('//evil.example/x.png') }")
    expect(out).not.toContain('//evil.example')
  })

  it('pipeline output for a hostile sheet never contains < or an external scheme', () => {
    const hostile =
      '@import "//evil/x.css"; @scope(:root){body{background:url(https://evil/t)}} a::after{content:"</style>"}'
    const out = prepareCustomCss(hostile, SCOPE)
    expect(out).not.toContain('<')
    expect(out).not.toContain('@import')
    expect(out).not.toContain('@scope')
    expect(out).not.toMatch(/https?:\/\//)
  })
})
