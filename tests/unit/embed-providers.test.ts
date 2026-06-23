// @vitest-environment node
//
// J2 + J3: embed provider allowlist (pure logic). embed-providers.ts imports NO
// React / DOM / db — it is a pure URL allowlist + src derivation module, so it
// runs in the node env with zero editor deps.
//
// THE CRUX INVARIANT under test: an iframe src is ALWAYS an allowlisted https
// provider URL, or there is NO iframe. resolveProvider() must:
//   - resolve a Google Calendar embed URL → the calendar provider + an https
//     embed url on calendar.google.com;
//   - resolve a Google Sheets /edit URL → the spreadsheet provider + a pubhtml /
//     widget embed url on docs.google.com;
//   - resolve an Airtable share URL → an airtable.com/embed url;
//   - REJECT (return null) any javascript:/data:/http: URL — these can never
//     become an iframe src;
//   - REJECT any arbitrary non-allowlisted https host (evil.example);
//   - guarantee toEmbedUrl NEVER returns a URL on a non-allowlisted host;
//   - round-trip a parsed embed node through serialize → parse preserving
//     provider/url/title.

import { describe, expect, it } from 'vitest'
import { EMBED_PROVIDERS, resolveProvider } from '@/lib/editor/embed-providers'
import { markdownToJson } from '@/lib/markdown/parse'
import { serializeMarkdown } from '@/lib/markdown/serialize'

type Node = {
  type?: string
  attrs?: Record<string, unknown>
  content?: Node[]
  text?: string
}

const doc = (...content: unknown[]) => ({ type: 'doc', content })

function find(node: Node | undefined, pred: (n: Node) => boolean): Node | undefined {
  if (!node) return undefined
  if (pred(node)) return node
  for (const child of node.content ?? []) {
    const hit = find(child, pred)
    if (hit) return hit
  }
  return undefined
}

/** Hosts that ANY provider is allowed to produce an embed URL on. */
const ALLOWLISTED_HOSTS = new Set([
  'calendar.google.com',
  'docs.google.com',
  'airtable.com',
  'onedrive.live.com',
  'view.officeapps.live.com',
])

describe('J2/J3 — embed provider allowlist', () => {
  // ── Google Calendar (J2) ──────────────────────────────────────────────────
  it('resolves a Google Calendar embed URL → calendar provider + https calendar.google.com src', () => {
    const url =
      'https://calendar.google.com/calendar/embed?src=team%40example.com&ctz=America%2FNew_York'
    const r = resolveProvider(url)
    expect(r).not.toBeNull()
    expect(r?.provider.kind).toBe('calendar')
    expect(r?.embedUrl.startsWith('https://calendar.google.com/')).toBe(true)
    expect(new URL(r?.embedUrl ?? '').protocol).toBe('https:')
  })

  // ── Google Sheets (J3) ────────────────────────────────────────────────────
  it('resolves a Google Sheets /edit URL → spreadsheet provider + docs.google.com embed src', () => {
    const url = 'https://docs.google.com/spreadsheets/d/ABC123def456/edit#gid=0'
    const r = resolveProvider(url)
    expect(r).not.toBeNull()
    expect(r?.provider.kind).toBe('spreadsheet')
    expect(r?.embedUrl.startsWith('https://docs.google.com/spreadsheets/')).toBe(true)
    // Embed form must use the widget/pubhtml shape, never a raw /edit src.
    expect(/widget=true|pubhtml/.test(r?.embedUrl ?? '')).toBe(true)
    expect(r?.embedUrl.includes('/edit')).toBe(false)
  })

  it('resolves a Google Sheets pubhtml URL → spreadsheet provider on docs.google.com', () => {
    const url = 'https://docs.google.com/spreadsheets/d/ABC123def456/pubhtml'
    const r = resolveProvider(url)
    expect(r).not.toBeNull()
    expect(r?.provider.kind).toBe('spreadsheet')
    expect(new URL(r?.embedUrl ?? '').hostname).toBe('docs.google.com')
  })

  // ── Airtable (J3) ─────────────────────────────────────────────────────────
  it('resolves an Airtable share URL → airtable.com/embed src', () => {
    const url = 'https://airtable.com/shrAbCdEfGh123456'
    const r = resolveProvider(url)
    expect(r).not.toBeNull()
    expect(r?.provider.kind).toBe('spreadsheet')
    expect(r?.embedUrl.startsWith('https://airtable.com/embed/')).toBe(true)
  })

  it('resolves an Airtable /embed URL idempotently → airtable.com/embed src', () => {
    const url = 'https://airtable.com/embed/shrAbCdEfGh123456'
    const r = resolveProvider(url)
    expect(r).not.toBeNull()
    expect(r?.embedUrl.startsWith('https://airtable.com/embed/')).toBe(true)
  })

  // ── REJECTIONS — the crux ─────────────────────────────────────────────────
  it('rejects a javascript: URL (no iframe)', () => {
    expect(resolveProvider('javascript:alert(1)')).toBeNull()
  })

  it('rejects a data: URL (no iframe)', () => {
    expect(resolveProvider('data:text/html,<script>alert(1)</script>')).toBeNull()
  })

  it('rejects an http: (non-https) URL even on an allowlisted host (no iframe)', () => {
    expect(resolveProvider('http://calendar.google.com/calendar/embed?src=x')).toBeNull()
  })

  it('rejects an arbitrary non-allowlisted https host (no iframe)', () => {
    expect(resolveProvider('https://evil.example/x')).toBeNull()
  })

  it('rejects a look-alike host that merely contains an allowlisted host as a substring', () => {
    // calendar.google.com.evil.example must NOT match calendar.google.com.
    expect(resolveProvider('https://calendar.google.com.evil.example/calendar/embed')).toBeNull()
    expect(resolveProvider('https://notairtable.com/embed/shr1')).toBeNull()
  })

  it('rejects empty / garbage input (no iframe)', () => {
    expect(resolveProvider('')).toBeNull()
    expect(resolveProvider('not a url')).toBeNull()
    expect(resolveProvider('//calendar.google.com/calendar/embed')).toBeNull()
  })

  // ── toEmbedUrl host invariant ─────────────────────────────────────────────
  it('toEmbedUrl NEVER returns a URL on a non-allowlisted host', () => {
    const inputs = [
      'https://calendar.google.com/calendar/embed?src=team%40example.com',
      'https://docs.google.com/spreadsheets/d/ABC/edit',
      'https://docs.google.com/spreadsheets/d/ABC/pubhtml',
      'https://airtable.com/shr123',
      'https://airtable.com/embed/shr123',
      'https://onedrive.live.com/embed?cid=ABC&resid=DEF&authkey=GHI',
      // Exercise the Office web-apps VIEWER branch so its
      // view.officeapps.live.com output is actually checked against the host set.
      'https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fexample.com%2Fa.xlsx',
      // adversarial inputs each provider must refuse to reflect:
      'javascript:alert(1)',
      'data:text/html,x',
      'http://airtable.com/shr123',
      'https://evil.example/x',
    ]
    for (const p of EMBED_PROVIDERS) {
      for (const input of inputs) {
        const out = p.toEmbedUrl(input)
        if (out === null) continue
        const parsed = new URL(out)
        expect(parsed.protocol).toBe('https:')
        expect(ALLOWLISTED_HOSTS.has(parsed.hostname)).toBe(true)
      }
    }
  })

  it('every provider only ever claims (test=true) URLs it can turn into an allowlisted https embed', () => {
    const probes = [
      'https://calendar.google.com/calendar/embed?src=x',
      'https://docs.google.com/spreadsheets/d/ABC/edit',
      'https://airtable.com/shr123',
      'https://onedrive.live.com/embed?cid=A&resid=B&authkey=C',
      // Office web-apps viewer → emits a view.officeapps.live.com embed url.
      'https://view.officeapps.live.com/op/embed.aspx?src=https%3A%2F%2Fexample.com%2Fa.xlsx',
      'javascript:alert(1)',
      'data:text/html,x',
      'https://evil.example/x',
    ]
    for (const p of EMBED_PROVIDERS) {
      for (const probe of probes) {
        if (!p.test(probe)) continue
        const out = p.toEmbedUrl(probe)
        expect(out).not.toBeNull()
        const parsed = new URL(out ?? '')
        expect(parsed.protocol).toBe('https:')
        expect(ALLOWLISTED_HOSTS.has(parsed.hostname)).toBe(true)
      }
    }
  })

  // ── Markdown round-trip (parchment:embed fence) ───────────────────────────
  it('round-trips an embed node through serialize → parse preserving provider/url/title', () => {
    const EMBED_NODE = {
      type: 'embed',
      attrs: {
        provider: 'google-sheets',
        url: 'https://docs.google.com/spreadsheets/d/ABC123def456/edit#gid=0',
        title: 'Q3 budget',
      },
    }
    const md = serializeMarkdown(doc(EMBED_NODE))
    expect(md).toContain('```parchment:embed')
    const back = markdownToJson(md) as Node
    const node = find(back, (n) => n.type === 'embed')
    expect(node).toBeDefined()
    expect(node?.attrs?.provider).toBe('google-sheets')
    expect(node?.attrs?.url).toBe(EMBED_NODE.attrs.url)
    expect(node?.attrs?.title).toBe('Q3 budget')
  })

  it('a malformed parchment:embed fence body parses without throwing (degrades to codeBlock)', () => {
    const malformed = '```parchment:embed\n{not json!!!\n```\n'
    let result: Node | undefined
    expect(() => {
      result = markdownToJson(malformed) as Node
    }).not.toThrow()
    expect(find(result, (n) => n.type === 'embed')).toBeUndefined()
  })
})
