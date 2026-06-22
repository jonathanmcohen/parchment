import { AppearanceSettings } from '@/components/settings/AppearanceSettings'
import { StylesManager } from '@/components/settings/StylesManager'

export default function WorkspaceSettingsPage() {
  return (
    <section className="max-w-2xl">
      <h1 className="font-semibold text-2xl tracking-tight">Workspace</h1>
      <p className="mt-2 text-[var(--muted)]">Settings that apply to everyone in this workspace.</p>

      <section aria-labelledby="workspace-identity" className="mt-8">
        <h2 id="workspace-identity" className="font-medium text-lg">
          Identity
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          The name shown across the app and in shared links.
        </p>
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="workspace-name" className="font-medium text-sm">
            Workspace name
          </label>
          <input
            id="workspace-name"
            name="workspaceName"
            type="text"
            className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
          />
        </div>
      </section>

      <section aria-labelledby="workspace-documents" className="mt-8">
        <h2 id="workspace-documents" className="font-medium text-lg">
          Documents
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          Defaults applied to newly created documents.
        </p>
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="workspace-page-size" className="font-medium text-sm">
            Default page size
          </label>
          <select
            id="workspace-page-size"
            name="pageSize"
            defaultValue="letter"
            className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm"
          >
            <option value="letter">Letter</option>
            <option value="a4">A4</option>
          </select>
        </div>
      </section>

      <section aria-labelledby="workspace-storage" className="mt-8">
        <h2 id="workspace-storage" className="font-medium text-lg">
          Storage
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          The root directory where document files are stored on disk (Plan F).
        </p>
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="workspace-files-root" className="font-medium text-sm">
            Files root
          </label>
          <input
            id="workspace-files-root"
            name="filesRoot"
            type="text"
            spellCheck={false}
            className="rounded-md border border-[var(--border)] bg-[var(--paper)] px-3 py-2 font-mono text-sm"
          />
          <p className="text-[var(--muted)] text-xs">
            An absolute path on the server. Changing this does not move existing files.
          </p>
        </div>
      </section>

      <AppearanceSettings />

      <StylesManager />
    </section>
  )
}
