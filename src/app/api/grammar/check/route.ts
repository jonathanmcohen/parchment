import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getCustomDict } from '@/lib/docs/dictionary-repo'
import { filterMatchesByDict } from '@/lib/integrations/dictionary'
import {
  checkGrammar,
  isLanguageToolEnabled,
  LANGUAGETOOL_INPUT_CAP,
  normalizeLocale,
} from '@/lib/integrations/languagetool'

export const dynamic = 'force-dynamic'

/**
 * K7: POST /api/grammar/check { text, locale? } → { matches }
 *
 *   • Auth required (401 when unauthenticated).
 *   • 404 when LanguageTool is NOT configured — the editor uses this to hide the
 *     grammar action entirely. The off path makes NO external call.
 *   • Caps text length (413 over LANGUAGETOOL_INPUT_CAP). The check is
 *     server-proxied so LANGUAGETOOL_API_KEY never reaches the client.
 *   • Words in the owner's custom dictionary are filtered out of the matches.
 */
export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Off by default: when LanguageTool is not configured the endpoint does not
  // exist as far as the client is concerned (404) — NO external call is made.
  if (!isLanguageToolEnabled()) {
    return NextResponse.json({ error: 'grammar_disabled' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const { text, locale } = body as Record<string, unknown>
  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'text_required' }, { status: 400 })
  }
  if (text.length > LANGUAGETOOL_INPUT_CAP) {
    return NextResponse.json({ error: 'text_too_long' }, { status: 413 })
  }

  const matches = await checkGrammar(text, normalizeLocale(locale))
  const dict = await getCustomDict(user.id)
  const filtered = filterMatchesByDict(matches, text, dict)

  return NextResponse.json({ matches: filtered })
}
