export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <section>
      <h1 className="font-semibold text-2xl tracking-tight">Document</h1>
      <p className="mt-2 text-[var(--muted)]">
        Page-bounded Tiptap canvas for <code>{id}</code> — Plans B / C / D.
      </p>
    </section>
  )
}
