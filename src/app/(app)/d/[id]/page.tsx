import { notFound } from 'next/navigation'
import { Editor } from '@/components/editor/Editor'
import { requireUser } from '@/lib/auth/guard'
import { getDocument } from '@/lib/docs/repo'

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const doc = await getDocument(id)
  if (!doc || doc.ownerId !== user.id) notFound()

  return (
    <Editor
      docId={doc.id}
      initialTitle={doc.title}
      initialJson={(doc.content as Record<string, unknown> | null) ?? null}
    />
  )
}
