// K5: i18n configuration — locale list, default, and RTL helpers.
//
// This module is the SINGLE source of truth for which locales exist and which
// of them are right-to-left. It is intentionally dependency-free (no next-intl,
// no @/db, no next/headers) so it is safe to import from the server request
// path, the root layout, client components, and unit tests alike.

/** Cookie that holds the active locale (next-intl's documented default name). */
export const LOCALE_COOKIE = 'NEXT_LOCALE'

/**
 * Shipped locales. `en` and `ar` have full (representative) catalogs; `he` is a
 * partial/stub catalog — see messages/he.json. Adding a locale here without a
 * matching messages/<locale>.json file will fall back to the default catalog.
 */
export const LOCALES = ['en', 'ar', 'he'] as const

export type Locale = (typeof LOCALES)[number]

/** Locale used when the cookie is absent or holds an unknown value. */
export const DEFAULT_LOCALE: Locale = 'en'

/** Locales rendered right-to-left. */
export const RTL_LOCALES: readonly Locale[] = ['ar', 'he']

/** Type guard: is `value` one of the shipped locales? */
export function isLocale(value: string | undefined | null): value is Locale {
  return value != null && (LOCALES as readonly string[]).includes(value)
}

/** Normalize an arbitrary cookie/header value to a shipped locale. */
export function resolveLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

/** True when the locale is written right-to-left. */
export function isRtl(locale: string): boolean {
  return (RTL_LOCALES as readonly string[]).includes(locale)
}

/** The HTML `dir` attribute value for a locale: 'rtl' or 'ltr'. */
export function localeDir(locale: string): 'rtl' | 'ltr' {
  return isRtl(locale) ? 'rtl' : 'ltr'
}

/** Human-readable, self-named label for each locale (for the switcher UI). */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
  he: 'עברית',
}
