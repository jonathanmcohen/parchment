import { notFound } from 'next/navigation'
import { Editor } from '@/components/editor/Editor'
import { requireUser } from '@/lib/auth/guard'
import { getDocument, hasCollabState } from '@/lib/docs/repo'

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id) notFound()

  // D4: whether the collab server already holds a Yjs snapshot — gates first-open
  // seeding so the client never seeds on top of authoritative server state.
  const collabStateExists = await hasCollabState(doc.id)

  return (
    <Editor
      docId={doc.id}
      initialTitle={doc.title}
      initialJson={(doc.content as Record<string, unknown> | null) ?? null}
      currentUserName={user.name}
      currentUserId={user.id}
      hasCollabState={collabStateExists}
    />
  )
}
