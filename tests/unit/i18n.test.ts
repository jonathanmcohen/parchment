import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE, isLocale, isRtl, LOCALES, localeDir, resolveLocale } from '@/i18n/config'

// Resolve messages/*.json relative to this test file (repo root is two levels up
// from tests/unit), independent of the process cwd.
function loadCatalog(locale: string): Record<string, unknown> {
  const url = new URL(`../../messages/${locale}.json`, import.meta.url)
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8'))
}

// Flatten a nested catalog into dotted keys so parity is checked leaf-by-leaf
// (a missing `nav.files` is caught even if the `nav` namespace exists).
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v as Record<string, unknown>, path))
    } else {
      keys.push(path)
    }
  }
  return keys.sort()
}

describe('i18n config', () => {
  it('isRtl is true for ar/he and false for en', () => {
    expect(isRtl('ar')).toBe(true)
    expect(isRtl('he')).toBe(true)
    expect(isRtl('en')).toBe(false)
  })

  it('localeDir returns rtl for RTL locales and ltr otherwise', () => {
    expect(localeDir('ar')).toBe('rtl')
    expect(localeDir('he')).toBe('rtl')
    expect(localeDir('en')).toBe('ltr')
    expect(localeDir('fr')).toBe('ltr') // unknown → ltr, never throws
  })

  it('LOCALES includes en and ar', () => {
    expect(LOCALES).toContain('en')
    expect(LOCALES).toContain('ar')
  })

  it('DEFAULT_LOCALE is a valid shipped locale', () => {
    expect(isLocale(DEFAULT_LOCALE)).toBe(true)
    expect(LOCALES).toContain(DEFAULT_LOCALE)
  })

  it('resolveLocale falls back to the default for unknown/empty values', () => {
    expect(resolveLocale('ar')).toBe('ar')
    expect(resolveLocale('zz')).toBe(DEFAULT_LOCALE)
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE)
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE)
  })

  it('en.json and ar.json have an identical key set (key parity)', () => {
    const en = flattenKeys(loadCatalog('en'))
    const ar = flattenKeys(loadCatalog('ar'))
    expect(ar).toEqual(en)
  })
})
