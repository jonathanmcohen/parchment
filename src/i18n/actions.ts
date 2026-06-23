'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, resolveLocale } from './config'

// K5: persist the chosen locale in the NEXT_LOCALE cookie. A server action keeps
// the client component free of next/headers (and free of @/db). next-intl's
// request config reads this cookie on the next render; revalidatePath('/','layout')
// forces the root layout to re-run so <html lang/dir> and every translated string
// update immediately after the switch.
export async function setLocale(value: string): Promise<void> {
  const locale = resolveLocale(value)
  const store = await cookies()
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    sameSite: 'lax',
    // One year; locale is a non-sensitive UI preference (readable by JS is fine).
    maxAge: 60 * 60 * 24 * 365,
  })
  revalidatePath('/', 'layout')
}
