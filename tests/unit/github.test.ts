// @vitest-environment node
//
// J6: GitHub PR/issue embed — pure logic (parseGithubRef / githubApiUrl /
// githubWebUrl / isGithubTokenSet) + the parchment:github markdown round-trip.
// github.ts imports NO React / DOM / db — it is env-only, so it runs in the node
// env with zero editor deps.
//
// THE ANTI-SSRF INVARIANT under test: parseGithubRef accepts ONLY a github.com
// PR/issue web URL and rejects EVERY other host; githubApiUrl ALWAYS targets
// api.github.com with the validated parts. No user input can steer a fetch to a
// host other than api.github.com.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  githubApiUrl,
  githubWebUrl,
  isGithubTokenSet,
  parseGithubRef,
} from '@/lib/integrations/github'
import { markdownToJson } from '@/lib/markdown/parse'
import { serializeMarkdown } from '@/lib/markdown/serialize'

type Node = {
  type?: string
  attrs?: Record<string, unknown>
  content?: Node[]
}

describe('parseGithubRef — valid github.com PR/issue URLs', () => {
  it('parses a pull-request URL into owner/repo/number/kind', () => {
    const ref = parseGithubRef('https://github.com/facebook/react/pull/12345')
    expect(ref).toEqual({ owner: 'facebook', repo: 'react', number: 12345, kind: 'pr' })
  })

  it('parses an issue URL into owner/repo/number/kind', () => {
    const ref = parseGithubRef('https://github.com/vercel/next.js/issues/678')
    expect(ref).toEqual({ owner: 'vercel', repo: 'next.js', number: 678, kind: 'issue' })
  })

  it('accepts the www.github.com alias and ignores trailing path/query/hash', () => {
    const ref = parseGithubRef('https://www.github.com/a-b/c_d.e/pull/9/files?w=1#diff')
    expect(ref).toEqual({ owner: 'a-b', repo: 'c_d.e', number: 9, kind: 'pr' })
  })
})

describe('parseGithubRef — rejects non-github / malicious hosts (anti-SSRF)', () => {
  it('rejects a non-github host', () => {
    expect(parseGithubRef('https://evil.com/x/y/pull/1')).toBeNull()
  })

  it('rejects a github.com.evil.com suffix-spoof host', () => {
    expect(parseGithubRef('https://github.com.evil.com/a/b/pull/1')).toBeNull()
  })

  it('rejects a userinfo @-spoof (github.com@evil.com → host is evil.com)', () => {
    expect(parseGithubRef('https://github.com@evil.com/a/b/issues/1')).toBeNull()
  })

  it('rejects an api.github.com spoof (only the web host is parsed)', () => {
    expect(parseGithubRef('https://api.github.com/repos/a/b/issues/1')).toBeNull()
  })

  it('rejects non-https schemes (javascript:, http:, data:)', () => {
    expect(parseGithubRef('javascript:alert(1)//github.com/a/b/pull/1')).toBeNull()
    expect(parseGithubRef('http://github.com/a/b/pull/1')).toBeNull()
    expect(parseGithubRef('data:text/html,github.com/a/b/pull/1')).toBeNull()
  })

  it('rejects bad owner/repo chars, non-digit numbers, and wrong path shapes', () => {
    expect(parseGithubRef('https://github.com/a/b/pull/abc')).toBeNull()
    expect(parseGithubRef('https://github.com/a b/c/pull/1')).toBeNull()
    expect(parseGithubRef('https://github.com/a/b%2Fc/pull/1')).toBeNull()
    expect(parseGithubRef('https://github.com/a/b/commits/1')).toBeNull()
    expect(parseGithubRef('https://github.com/a/b/pull/0')).toBeNull()
    expect(parseGithubRef('not a url')).toBeNull()
    expect(parseGithubRef('')).toBeNull()
    expect(parseGithubRef(null)).toBeNull()
  })
})

describe('githubApiUrl / githubWebUrl — always the hard-coded hosts', () => {
  it('githubApiUrl always targets api.github.com/repos/.../issues/<n> with validated parts', () => {
    const ref = parseGithubRef('https://github.com/facebook/react/pull/12345')
    expect(ref).not.toBeNull()
    if (ref) {
      expect(githubApiUrl(ref)).toBe('https://api.github.com/repos/facebook/react/issues/12345')
      // The issues endpoint serves both kinds — an issue ref hits the same path shape.
      const issueRef = parseGithubRef('https://github.com/vercel/next.js/issues/678')
      if (issueRef)
        expect(githubApiUrl(issueRef)).toBe(
          'https://api.github.com/repos/vercel/next.js/issues/678',
        )
      // The host is ALWAYS api.github.com.
      expect(new URL(githubApiUrl(ref)).hostname).toBe('api.github.com')
    }
  })

  it('githubWebUrl rebuilds the canonical github.com page URL per kind', () => {
    expect(githubWebUrl({ owner: 'a', repo: 'b', number: 7, kind: 'pr' })).toBe(
      'https://github.com/a/b/pull/7',
    )
    expect(githubWebUrl({ owner: 'a', repo: 'b', number: 7, kind: 'issue' })).toBe(
      'https://github.com/a/b/issues/7',
    )
    expect(new URL(githubWebUrl({ owner: 'a', repo: 'b', number: 7, kind: 'pr' })).hostname).toBe(
      'github.com',
    )
  })
})

describe('isGithubTokenSet — reflects env', () => {
  const original = process.env.GITHUB_TOKEN
  beforeEach(() => {
    delete process.env.GITHUB_TOKEN
  })
  afterEach(() => {
    if (original === undefined) delete process.env.GITHUB_TOKEN
    else process.env.GITHUB_TOKEN = original
  })

  it('is false when unset and true when set', () => {
    expect(isGithubTokenSet()).toBe(false)
    process.env.GITHUB_TOKEN = 'ghp_example'
    expect(isGithubTokenSet()).toBe(true)
    process.env.GITHUB_TOKEN = ''
    expect(isGithubTokenSet()).toBe(false)
  })
})

describe('parchment:github markdown round-trip', () => {
  it('round-trips a githubEmbed node through serialize → parse', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'githubEmbed',
          attrs: {
            owner: 'facebook',
            repo: 'react',
            number: 12345,
            kind: 'pr',
            title: 'Fix the thing',
          },
        },
      ],
    }
    const md = serializeMarkdown(doc)
    expect(md).toContain('parchment:github')

    const parsed = markdownToJson(md) as { content?: Node[] }
    const node = parsed.content?.[0]
    expect(node?.type).toBe('githubEmbed')
    expect(node?.attrs).toEqual({
      owner: 'facebook',
      repo: 'react',
      number: 12345,
      kind: 'pr',
      title: 'Fix the thing',
    })
  })

  it('degrades a github fence carrying an illegal-char owner to a codeBlock (not a node)', () => {
    // A hand-built/tampered fence whose owner has illegal chars (a space →
    // %20 after URL encoding) must NOT reconstruct a githubEmbed: parseGithubRef
    // re-validation rejects the `%`, so it falls through to a plain codeBlock.
    const md = '```parchment:github\n{"owner":"a b","repo":"r","number":1,"kind":"pr"}\n```\n'
    const parsed = markdownToJson(md) as { content?: Node[] }
    const node = parsed.content?.[0]
    expect(node?.type).toBe('codeBlock')
  })

  it('safely normalizes a traversal-laden owner to a valid github.com ref (no off-host node)', () => {
    // `a/../b` is path-traversal: the URL parser COLLAPSES it before validation,
    // so the fence reconstructs to a legitimate github ref (owner from the
    // collapsed path) — never an off-github / off-api host. The anti-SSRF
    // guarantee holds: any reconstructed ref is a clean github.com ref.
    const md = '```parchment:github\n{"owner":"a/../b","repo":"r","number":1,"kind":"pr"}\n```\n'
    const parsed = markdownToJson(md) as { content?: Node[] }
    const node = parsed.content?.[0]
    expect(node?.type).toBe('githubEmbed')
    // Whatever the collapsed owner/repo is, githubApiUrl stays on api.github.com.
    expect(githubApiUrl(node?.attrs as never)).toMatch(/^https:\/\/api\.github\.com\/repos\//)
  })
})
