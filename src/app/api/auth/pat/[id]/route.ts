import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { revokePat } from '@/lib/auth/pat'

// DELETE /api/auth/pat/:id — revoke one of the caller's tokens. Session-only.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const hasBearer = req.headers.get('authorization')?.startsWith('Bearer ')
  const user = hasBearer ? null : await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const revoked = await revokePat(user.id, id)
  if (!revoked) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
