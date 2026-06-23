import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { addDictWord, getCustomDict, removeDictWord } from '@/lib/docs/dictionary-repo'

export const dynamic = 'force-dynamic'

/** K7: GET /api/dictionary → { words: string[] } (owner-scoped, normalized). */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const words = await getCustomDict(user.id)
  return NextResponse.json({ words })
}

/** K7: POST /api/dictionary { word } → { ok: true, words } (add, deduped). */
export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const word = (body as { word?: unknown }).word
  if (typeof word !== 'string' || word.trim().length === 0) {
    return NextResponse.json({ error: 'word_required' }, { status: 400 })
  }

  const words = await addDictWord(user.id, word)
  return NextResponse.json({ ok: true, words })
}

/** K7: DELETE /api/dictionary { word } → { ok: true, words } (remove). */
export async function DELETE(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const word = (body as { word?: unknown }).word
  if (typeof word !== 'string' || word.trim().length === 0) {
    return NextResponse.json({ error: 'word_required' }, { status: 400 })
  }

  const words = await removeDictWord(user.id, word)
  return NextResponse.json({ ok: true, words })
}
