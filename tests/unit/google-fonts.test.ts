import { describe, expect, it } from 'vitest'
import {
  GOOGLE_FONT_FAMILIES,
  isAllowedGoogleFont,
  searchGoogleFonts,
} from '@/lib/fonts/google-catalog'
import {
  familyFromSlug,
  firstWoff2Url,
  fontSlug,
  googleCssApiUrl,
  googleFontFace,
  googleFontFacesCss,
  googleFontStack,
  isGstaticWoff2,
  localFontUrl,
} from '@/lib/fonts/google-fonts'

// v0.2.7 #4b: privacy-preserving Google Fonts picker. The browser must NEVER load
// from Google — fonts are server-proxied + self-hosted. These pin the SSRF gate,
// the URL plumbing, and the local-only @font-face output.

describe('catalogue + SSRF allow-list', () => {
  it('is a non-empty set of plausible family names', () => {
    expect(GOOGLE_FONT_FAMILIES.length).toBeGreaterThan(30)
    expect(GOOGLE_FONT_FAMILIES).toContain('Inter')
    expect(GOOGLE_FONT_FAMILIES).toContain('EB Garamond')
  })

  it('allows only exact catalogue families (SSRF gate)', () => {
    expect(isAllowedGoogleFont('Inter')).toBe(true)
    expect(isAllowedGoogleFont('inter')).toBe(false) // case-sensitive exact match
    expect(isAllowedGoogleFont('Evil Font; rm -rf')).toBe(false)
    expect(isAllowedGoogleFont('')).toBe(false)
    expect(isAllowedGoogleFont('../../etc/passwd')).toBe(false)
  })

  it('searches case-insensitively and caps results', () => {
    expect(searchGoogleFonts('serif').every((f) => f.toLowerCase().includes('serif'))).toBe(true)
    expect(searchGoogleFonts('')).toHaveLength(Math.min(60, GOOGLE_FONT_FAMILIES.length))
    expect(searchGoogleFonts('inter')).toContain('Inter')
    expect(searchGoogleFonts('zzzznotafont')).toEqual([])
  })
})

describe('fontSlug / familyFromSlug', () => {
  it('slugs family names to safe path/file tokens', () => {
    expect(fontSlug('Inter')).toBe('inter')
    expect(fontSlug('Source Serif 4')).toBe('source-serif-4')
    expect(fontSlug('EB Garamond')).toBe('eb-garamond')
    // No path traversal / metacharacters survive.
    expect(fontSlug('../../x')).toBe('x')
  })

  it('round-trips slug → family for catalogue entries only', () => {
    expect(familyFromSlug('eb-garamond')).toBe('EB Garamond')
    expect(familyFromSlug('jetbrains-mono')).toBe('JetBrains Mono')
    expect(familyFromSlug('not-a-real-font')).toBeNull()
    // Slug is the inverse of fontSlug for every catalogue family (collision-free).
    for (const fam of GOOGLE_FONT_FAMILIES) {
      expect(familyFromSlug(fontSlug(fam))).toBe(fam)
    }
  })
})

describe('googleCssApiUrl', () => {
  it('builds a css2 URL with the family + weights + display=swap', () => {
    const url = googleCssApiUrl('Open Sans', [400, 700])
    expect(url).toContain('https://fonts.googleapis.com/css2?family=')
    expect(url).toContain('Open+Sans')
    expect(url).toContain('wght@400;700')
    expect(url).toContain('display=swap')
  })
})

describe('firstWoff2Url / isGstaticWoff2', () => {
  it('extracts the first gstatic woff2 from a Google CSS response', () => {
    const css = `
      /* latin */
      @font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 400;
        src: url(https://fonts.gstatic.com/s/inter/v13/abcd.woff2) format('woff2');
      }`
    const u = firstWoff2Url(css)
    expect(u).toBe('https://fonts.gstatic.com/s/inter/v13/abcd.woff2')
    expect(isGstaticWoff2(u as string)).toBe(true)
  })

  it('returns null when there is no woff2 (e.g. an error page)', () => {
    expect(firstWoff2Url('<html>Not Found</html>')).toBeNull()
  })

  it('rejects non-gstatic / non-woff2 URLs (defense in depth)', () => {
    expect(isGstaticWoff2('https://evil.example/x.woff2')).toBe(false)
    expect(isGstaticWoff2('http://fonts.gstatic.com/x.woff2')).toBe(false) // not https
    expect(isGstaticWoff2('https://fonts.gstatic.com/x.ttf')).toBe(false) // not woff2
    expect(isGstaticWoff2('not a url')).toBe(false)
  })
})

describe('local @font-face output (privacy)', () => {
  it('points ONLY at the local origin, never gstatic/googleapis', () => {
    expect(localFontUrl('EB Garamond')).toBe('/api/fonts/google/eb-garamond.woff2')
    const face = googleFontFace('EB Garamond')
    expect(face).toContain('font-family:"EB Garamond"')
    expect(face).toContain('/api/fonts/google/eb-garamond.woff2')
    expect(face).not.toContain('gstatic')
    expect(face).not.toContain('googleapis')
    expect(face).toContain('font-display:swap')
  })

  it('font stack quotes the family', () => {
    expect(googleFontStack('JetBrains Mono')).toBe('"JetBrains Mono", sans-serif')
  })

  it('combined faces css only emits allow-listed families', () => {
    const css = googleFontFacesCss(['Inter', 'NotAFont', 'Lora'])
    expect(css).toContain('"Inter"')
    expect(css).toContain('"Lora"')
    expect(css).not.toContain('NotAFont')
  })
})
