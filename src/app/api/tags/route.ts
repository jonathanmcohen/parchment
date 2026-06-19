import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { createTag, listTags, tagCounts } from '@/lib/docs/tags-repo'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const [tags, counts] = await Promise.all([listTags(user.id), tagCounts(user.id)])

  return NextResponse.json(
    tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      count: counts[t.id] ?? 0,
    })),
  )
}

export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json()) as { name?: unknown; color?: unknown }
  const name = typeof body.name === 'string' ? body.name : ''
  const colorRaw = typeof body.color === 'string' ? body.color : undefined

  try {
    const result = await createTag(
      user.id,
      colorRaw !== undefined ? { name, color: colorRaw } : { name },
    )
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === 'empty name') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    throw err
  }
}
