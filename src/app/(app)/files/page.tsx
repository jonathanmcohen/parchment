import type { DocDTO, FolderDTO } from '@/components/file-manager/FileManager'
import FileManager from '@/components/file-manager/FileManager'
import { requireUser } from '@/lib/auth/guard'
import { listFolders } from '@/lib/docs/folders-repo'
import { listDocumentsInFolder } from '@/lib/docs/repo'
import { newDocument } from './actions'

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
    folderId: d.folderId,
  }))

  return (
    <section className="mx-auto max-w-5xl h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-2xl tracking-tight">Files</h1>
        <form action={newDocument}>
          <button
            type="submit"
            className="rounded-md bg-[var(--accent-contrast)] px-3 py-1.5 font-medium text-sm text-white"
          >
            + New document
          </button>
        </form>
      </div>

      <FileManager initialFolders={initialFolders} initialDocs={initialDocs} />
    </section>
  )
}
