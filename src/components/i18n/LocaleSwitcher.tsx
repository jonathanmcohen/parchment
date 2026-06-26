'use client'

import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { type ChangeEvent, useId, useTransition } from 'react'
import { setLocale } from '@/i18n/actions'
import { LOCALE_LABELS, LOCALES } from '@/i18n/config'

// K5: accessible locale switcher. A labelled <select> writes the NEXT_LOCALE
// cookie via the setLocale server action, then router.refresh() re-runs the
// server tree so <html lang/dir> and every translated string update without a
// full page reload. Self-named option labels (English / العربية / עברית) stay
// readable regardless of the current locale.
//
// This is a pure UI control — it does NOT import @/db; persistence is a cookie.
export function LocaleSwitcher() {
  const t = useTranslations('locale')
  const activeLocale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const selectId = useId()

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value
    startTransition(async () => {
      await setLocale(next)
      router.refresh()
    })
  }

  return (
    /* K5: locale switcher row — matches the sidebar footer nav-row height/padding
       so all footer controls feel visually cohesive. The icon + label inline the
       switcher label; the select is visually minimal (no extra border box). */
    <div className="parchment-footer-locale-row">
      <span
        aria-hidden
        className="material-symbols-rounded text-[20px] leading-none text-[var(--muted)] shrink-0"
      >
        language
      </span>
      <label htmlFor={selectId} className="sr-only">
        {t('switcherLabel')}
      </label>
      <select
        id={selectId}
        value={activeLocale}
        onChange={onChange}
        disabled={isPending}
        className="parchment-footer-locale-select"
        title={t('switcherLabel')}
      >
        {LOCALES.map((loc) => (
          <option key={loc} value={loc}>
            {LOCALE_LABELS[loc]}
          </option>
        ))}
      </select>
    </div>
  )
}
