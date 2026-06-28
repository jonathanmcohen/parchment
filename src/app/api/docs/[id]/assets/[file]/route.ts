import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { getDocAccess } from '@/lib/authz/doc-access'
import { resolveShareGrant } from '@/lib/docs/share-grant'
import { isUuidName } from '@/lib/uploads/asset-path'
import { getAsset } from '@/lib/uploads/store'

// J1-5: serve a doc asset to any AUTHORIZED viewer — owner, a shared-grant user, OR
// an unauthenticated share-link visitor whose token grants canView. Access is decided
// by the canonical getDocAccess (folds owner + document_permissions + share grant).
// Storage is read via the shared adapter (disk or S3). The filename MUST be a minted
// `<uuid>.<ext>` — anything else (slash, dot-dot, null byte) is rejected before any fs.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Content type by stored extension. Images render inline; everything else downloads.
const EXT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  json: 'application/json',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}
const INLINE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf'])
// SVG is served as an attachment (download), never inline, so a residual script in a
// stored SVG can never execute in the app origin. (Upload also rejects active SVGs.)

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; file: string }> },
) {
  const { id, file } = await ctx.params

  // Path-traversal guard FIRST — reject anything that is not a minted safe name.
  if (file.includes('/') || file.includes('\\') || file.includes('..') || !isUuidName(file)) {
    return NextResponse.json({ error: 'invalid_filename' }, { status: 400 })
  }

  // Resolve the principal: an authenticated user (Bearer needs docs:read), and/or a
  // share-token grant. At least one must yield canView.
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  const user = auth.ok ? auth.user : null
  // A Bearer present-but-insufficient-scope is a 403 even if a share token would pass.
  if (!auth.ok && auth.status === 403) return apiAuthFailure(403)

  const token = req.nextUrl.searchParams.get('token') ?? req.headers.get('x-share-token') ?? null
  const password = req.nextUrl.searchParams.get('password')
  const shareGrant = token ? await resolveShareGrant(token, password) : null

  if (!user && !token) {
    // No credential of any kind presented → 401.
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  // A token WAS presented but did not resolve to a grant (expired/wrong/unknown), and
  // there is no authenticated user → treat as denied resource (404, no existence leak).
  if (!user && !shareGrant) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const access = await getDocAccess({ user, shareGrant }, id)
  if (!access.canView) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const bytes = await getAsset({ id }, file)
  if (!bytes) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const ext = file.split('.').at(-1)?.toLowerCase() ?? ''
  const contentType = EXT_TYPES[ext] ?? 'application/octet-stream'
  const disposition = INLINE_EXTS.has(ext) ? 'inline' : `attachment; filename="${file}"`

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'content-type': contentType,
      'content-disposition': disposition,
      'cache-control': 'private, max-age=3600',
      // Defense-in-depth: never let a served asset be sniffed into active content.
      'x-content-type-options': 'nosniff',
    },
  })
}
