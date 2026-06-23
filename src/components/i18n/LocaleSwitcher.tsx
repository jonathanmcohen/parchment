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
    <div className="flex flex-col gap-1 px-2">
      <label htmlFor={selectId} className="text-[var(--muted)] text-xs">
        {t('switcherLabel')}
      </label>
      <select
        id={selectId}
        value={activeLocale}
        onChange={onChange}
        disabled={isPending}
        className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-2 py-1 text-[var(--foreground)] text-sm"
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
