import { expect, test } from '@playwright/test'

// CF1 — theme-save robustness regression guard.
//
// On the v0.1.2 deploy the Account → Appearance control failed with an opaque
// "Could not save appearance" toast. This spec pins the happy path locally: on
// the seeded owner session (storageState carries the `parchment_session`
// cookie), a PUT to /api/settings/theme must return 200 AND the chosen
// colorScheme must persist across a re-GET. It cycles light → dark → system so
// every option is exercised through the same auth + DB-write path the deploy
// uses. `page.request` inherits the page context's storageState cookie, so this
// runs as the authenticated owner — the exact path AccountThemeSelect drives.

const ENDPOINT = '/api/settings/theme'

const FULL_THEME = {
  accent: '#1a73e8',
  fontPair: 'system',
  pageBg: 'white',
  highContrast: false,
  dyslexicFont: false,
} as const

test.describe.configure({ mode: 'serial' })

test('CF1: theme PUT returns 200 and the scheme persists across a re-GET', async ({ page }) => {
  // The select loads the full stored theme on mount; merging the scheme over it
  // is what AccountThemeSelect/applyColorScheme do. We send the whole theme so
  // parseTheme on the server doesn't reset the other fields.
  for (const colorScheme of ['light', 'dark', 'system'] as const) {
    const put = await page.request.put(ENDPOINT, {
      headers: { 'content-type': 'application/json' },
      data: { ...FULL_THEME, colorScheme },
    })
    expect(put.status(), `PUT ${colorScheme}`).toBe(200)
    const putBody = (await put.json()) as { ok: boolean; theme: { colorScheme: string } }
    expect(putBody.ok).toBe(true)
    expect(putBody.theme.colorScheme).toBe(colorScheme)

    // Re-GET on the same session must reflect the persisted value (guards the
    // DB write, not just the response echo).
    const get = await page.request.get(ENDPOINT)
    expect(get.status(), `GET after ${colorScheme}`).toBe(200)
    const getBody = (await get.json()) as { colorScheme: string }
    expect(getBody.colorScheme, `persisted ${colorScheme}`).toBe(colorScheme)
  }
})

test('CF1: a malformed JSON body returns a diagnosable 400 (not an opaque 500)', async ({
  page,
}) => {
  // Surfaces the try/catch fix: a non-JSON body must not crash into an opaque
  // 500 — the handler returns 400 with a clear message so a deploy failure is
  // diagnosable. A *Buffer* body is sent raw (a plain string would be re-encoded
  // by Playwright into a valid JSON string), so this is genuinely malformed JSON.
  const res = await page.request.put(ENDPOINT, {
    headers: { 'content-type': 'application/json' },
    data: Buffer.from('not json{'),
  })
  expect(res.status()).toBe(400)
  const body = (await res.json()) as { error: string }
  expect(body.error).toBe('invalid JSON body')
})
