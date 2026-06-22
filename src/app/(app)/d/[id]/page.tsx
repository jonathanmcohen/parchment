import { notFound } from 'next/navigation'
import { Editor } from '@/components/editor/Editor'
import { isAiEnabled } from '@/lib/ai/compose'
import { requireUser } from '@/lib/auth/guard'
import { getDocument, hasCollabState } from '@/lib/docs/repo'
import { parseWatermark } from '@/lib/editor/watermark'

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id) notFound()

  // D4: whether the collab server already holds a Yjs snapshot — gates first-open
  // seeding so the client never seeds on top of authoritative server state.
  const collabStateExists = await hasCollabState(doc.id)

  // G9: parse the stored watermark from documents.meta.watermark (falls back to
  // DEFAULT_WATERMARK when absent or malformed — never throws).
  const docMeta = doc.meta as Record<string, unknown> | null
  const initialWatermark = parseWatermark(docMeta?.watermark)

  // G13: AI is off by default — only enabled when AI_BASE_URL is configured.
  // Computed server-side so the client never reads process.env directly.
  const aiEnabled = isAiEnabled()

  return (
    <Editor
      docId={doc.id}
      initialTitle={doc.title}
      initialJson={(doc.content as Record<string, unknown> | null) ?? null}
      currentUserName={user.name}
      currentUserId={user.id}
      hasCollabState={collabStateExists}
      initialWatermark={initialWatermark}
      aiEnabled={aiEnabled}
    />
  )
}
