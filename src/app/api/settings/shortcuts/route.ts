import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getShortcutOverrides, setShortcutOverrides } from '@/lib/help/keymap-repo'

export const dynamic = 'force-dynamic'

/** GET /api/settings/shortcuts → { overrides: Record<action, combo> } */
export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const overrides = await getShortcutOverrides(user.id)
  return NextResponse.json({ overrides })
}

/** PUT /api/settings/shortcuts { overrides: Record<action, combo> } → { overrides } */
export async function PUT(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { overrides?: unknown } | null
  if (body === null || typeof body !== 'object') {
    return NextResponse.json({ error: 'body must be an object' }, { status: 400 })
  }

  // setShortcutOverrides sanitizes (drops unknown/non-customizable actions and
  // invalid combos), so we never store a malformed map.
  const overrides = await setShortcutOverrides(user.id, body.overrides)
  return NextResponse.json({ overrides })
}
