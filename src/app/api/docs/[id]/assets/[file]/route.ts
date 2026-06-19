import { readFile } from 'node:fs/promises'
import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/guard'
import { getDocument } from '@/lib/docs/repo'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

const EXT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; file: string }> },
) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id, file } = await ctx.params

  // Guard against path traversal — reject any filename containing / or ..
  if (file.includes('/') || file.includes('..') || file.includes('\\')) {
    return NextResponse.json({ error: 'invalid_filename' }, { status: 400 })
  }

  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const filepath = `${env.filesRoot}/.assets/${id}/${file}`

  let buffer: Buffer
  try {
    buffer = await readFile(filepath)
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const ext = file.split('.').at(-1)?.toLowerCase() ?? ''
  const contentType = EXT_TYPES[ext] ?? 'application/octet-stream'

  return new NextResponse(buffer.buffer as ArrayBuffer, {
    status: 200,
    headers: { 'content-type': contentType, 'cache-control': 'private, max-age=3600' },
  })
}
