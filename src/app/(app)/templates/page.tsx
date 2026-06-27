import type { BundledTemplateDTO, UserTemplateDTO } from '@/components/templates/TemplateGallery'
import TemplateGallery from '@/components/templates/TemplateGallery'
import { requireUser } from '@/lib/auth/guard'
import { BUILTIN_TEMPLATES } from '@/lib/docs/builtin-templates'
import { listTemplates } from '@/lib/docs/templates-repo'

export default async function TemplatesPage() {
  const user = await requireUser()
  const userTemplates = await listTemplates(user.id)

  const bundled: BundledTemplateDTO[] = BUILTIN_TEMPLATES.map((t) => ({
    key: t.key,
    name: t.name,
    description: t.description,
    category: t.category,
    content: t.content,
  }))

  const initialUserTemplates: UserTemplateDTO[] = userTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
  }))

  return (
    <section className="mx-auto flex h-full max-w-5xl flex-col gap-4">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Templates</h1>
        <p className="mt-1 text-[var(--muted)]">
          Start a new document from a bundled template or one you&rsquo;ve saved.
        </p>
      </div>
      <TemplateGallery bundled={bundled} initialUserTemplates={initialUserTemplates} />
    </section>
  )
}
