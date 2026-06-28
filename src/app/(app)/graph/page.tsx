import { GraphView } from '@/components/graph/GraphView'
import { requireUser } from '@/lib/auth/guard'

// J5-3: the link-graph page. Gates on an authenticated user (the layout already
// does too) and renders the client GraphView, which fetches /api/graph.
export default async function GraphPage() {
  await requireUser()

  return (
    <section className="mx-auto flex h-full max-w-5xl flex-col gap-4">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Graph</h1>
        <p className="mt-1 text-[var(--muted)]">
          How your documents connect through <code>[[wiki]]</code> links. Click a node to open it.
        </p>
      </div>
      <GraphView />
    </section>
  )
}
