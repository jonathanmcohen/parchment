import { type NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/session'
import { familyFromSlug } from '@/lib/fonts/google-fonts'
import { getGoogleFontWoff2 } from '@/lib/fonts/google-fonts-server'

// v0.2.7 #4b: serve a picked Google font's woff2 from THIS origin (privacy: the
// browser never loads from fonts.gstatic.com). The slug must resolve to an
// allow-listed catalogue family; the server fetches + caches the woff2 on a miss.
// The slug is the SSRF gate (familyFromSlug only matches the bundled catalogue), so
// the client can never steer the outbound fetch to an arbitrary URL.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await ctx.params

  // Gate to authenticated app users (same-origin @font-face fetches send the
  // session cookie). The catalogue is non-sensitive, but the app is behind auth.
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Accept `<slug>.woff2` or a bare `<slug>`; strip the extension before lookup.
  const slug = rawSlug.replace(/\.woff2$/, '')
  const family = familyFromSlug(slug)
  if (!family) return NextResponse.json({ error: 'unknown_font' }, { status: 404 })

  const bytes = await getGoogleFontWoff2(family)
  if (!bytes) return NextResponse.json({ error: 'unavailable' }, { status: 502 })

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'font/woff2',
      // Immutable once cached on disk — a family's woff2 doesn't change under us.
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  })
}
