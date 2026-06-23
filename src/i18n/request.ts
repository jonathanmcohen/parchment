import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale } from './config'

// K5: next-intl WITHOUT i18n routing.
//
// The active locale comes from the NEXT_LOCALE cookie (set by the LocaleSwitcher)
// rather than a URL prefix, so every existing route path is unchanged — there is
// no [locale]/ segment and no middleware rewrite. `getRequestConfig` runs per
// request on the server; the resolved messages are handed to the root layout's
// NextIntlClientProvider.
//
// Hebrew (he) ships a partial catalog. We deep-merge it over the default (en)
// catalog so any key missing from he.json still renders in English instead of
// throwing — full he coverage is iterative (see report GAPs).

type Messages = Record<string, unknown>

function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const baseValue = out[key]
    if (
      baseValue !== null &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue) &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      out[key] = deepMerge(baseValue as Messages, value as Messages)
    } else {
      out[key] = value
    }
  }
  return out
}

async function loadMessages(locale: string): Promise<Messages> {
  const defaultMessages = (await import(`../../messages/${DEFAULT_LOCALE}.json`))
    .default as Messages
  if (locale === DEFAULT_LOCALE) return defaultMessages
  const localeMessages = (await import(`../../messages/${locale}.json`)).default as Messages
  // Fill any gaps in a partial catalog (e.g. he) from the default catalog.
  return deepMerge(defaultMessages, localeMessages)
}

export default getRequestConfig(async () => {
  const store = await cookies()
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value)
  return {
    locale,
    messages: await loadMessages(locale),
  }
})
