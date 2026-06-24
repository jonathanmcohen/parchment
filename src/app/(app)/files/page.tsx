import type { DocDTO, FolderDTO } from '@/components/file-manager/FileManager'
import FileManager from '@/components/file-manager/FileManager'
import { requireUser } from '@/lib/auth/guard'
import { listFolders } from '@/lib/docs/folders-repo'
import { listDocumentsInFolder } from '@/lib/docs/repo'

export default async function FilesPage() {
  const user = await requireUser()
  const [folders, rootDocs] = await Promise.all([
    listFolders(user.id),
    listDocumentsInFolder(user.id, null),
  ])

  const initialFolders: FolderDTO[] = folders.map((f) => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId,
  }))

  const initialDocs: DocDTO[] = rootDocs.map((d) => ({
    id: d.id,
    title: d.title,
    updatedAt: d.updatedAt.toISOString(),
    createdAt: d.createdAt.toISOString(),
    folderId: d.folderId,
    starred: d.starred,
    size: Number(d.size),
    preview: d.preview,
  }))

  return (
    <section className="mx-auto max-w-5xl h-full flex flex-col gap-4">
      {/* S5-7: the Drive hero — "My Drive" at 22px Google Sans 400 (.px-title).
          S5-8: the standalone "+ New document" button is gone; "Blank document"
          lives in the sidebar "+ New" mega-menu (S2-1). */}
      <h1 className="px-title">My Drive</h1>

      <FileManager initialFolders={initialFolders} initialDocs={initialDocs} />
    </section>
  )
}
