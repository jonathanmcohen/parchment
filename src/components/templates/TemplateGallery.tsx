'use client'

import { useMemo, useState } from 'react'
import { TemplatePreview } from '@/components/templates/TemplatePreview'

// G2 + J3-2: the templates gallery. Bundled templates are grouped into category
// sections; each card has a "Preview" toggle (a read-only render of the
// template's ProseMirror JSON) and a "Use template" action that POSTs to
// /api/docs/from-template and navigates to the new doc. User templates get a
// delete (✕). Client component — never imports @/db.

export interface BundledTemplateDTO {
  key: string
  name: string
  description: string
  category: string
  content: unknown
}

export interface UserTemplateDTO {
  id: string
  name: string
  description: string | null
}

interface Props {
  bundled: BundledTemplateDTO[]
  initialUserTemplates: UserTemplateDTO[]
}

export default function TemplateGallery({ bundled, initialUserTemplates }: Props) {
  const [userTemplates, setUserTemplates] = useState<UserTemplateDTO[]>(initialUserTemplates)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // J3-2: stable category order; any unexpected category falls to the end.
  const grouped = useMemo(() => {
    const order = ['Work', 'Writing', 'Personal']
    const byCat = new Map<string, BundledTemplateDTO[]>()
    for (const t of bundled) {
      const list = byCat.get(t.category) ?? []
      list.push(t)
      byCat.set(t.category, list)
    }
    return [...byCat.entries()].sort(
      (a, b) =>
        (order.indexOf(a[0]) === -1 ? 99 : order.indexOf(a[0])) -
        (order.indexOf(b[0]) === -1 ? 99 : order.indexOf(b[0])),
    )
  }, [bundled])

  const instantiate = async (
    busyId: string,
    body: { builtinKey: string } | { templateId: string },
  ) => {
    setBusyKey(busyId)
    setError(null)
    try {
      const res = await fetch('/api/docs/from-template', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const data = (await res.json()) as { id: string }
        window.location.href = `/d/${data.id}`
        return
      }
      setError('Could not create a document from that template.')
    } catch {
      setError('Could not create a document from that template.')
    } finally {
      setBusyKey(null)
    }
  }

  const deleteTemplate = async (id: string) => {
    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setUserTemplates((prev) => prev.filter((t) => t.id !== id))
      }
    } catch {
      // leave state unchanged
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {error !== null && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {grouped.map(([category, items]) => (
        <section key={category} aria-labelledby={`cat-${category}`}>
          <h2
            id={`cat-${category}`}
            data-template-category={category}
            className="mb-3 font-semibold text-lg text-[var(--foreground)]"
          >
            {category}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((t) => (
              <li
                key={t.key}
                className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-4"
              >
                <h3 className="font-medium text-[var(--foreground)]">{t.name}</h3>
                <p className="flex-1 text-[var(--muted)] text-sm">{t.description}</p>
                {previewKey === t.key && <TemplatePreview doc={t.content as { content?: [] }} />}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() => instantiate(`builtin:${t.key}`, { builtinKey: t.key })}
                    className="rounded-md bg-[var(--primary)] px-3 py-1.5 font-medium text-sm text-[var(--on-primary)] disabled:opacity-50"
                  >
                    {busyKey === `builtin:${t.key}` ? 'Creating…' : 'Use template'}
                  </button>
                  <button
                    type="button"
                    aria-expanded={previewKey === t.key}
                    onClick={() => setPreviewKey((cur) => (cur === t.key ? null : t.key))}
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 font-medium text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    {previewKey === t.key ? 'Hide preview' : 'Preview'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section aria-labelledby="your-templates-heading">
        <h2
          id="your-templates-heading"
          className="mb-3 font-semibold text-lg text-[var(--foreground)]"
        >
          Your templates
        </h2>
        {userTemplates.length === 0 ? (
          <p className="text-[var(--muted)] text-sm">
            You haven&rsquo;t saved any templates yet. Use &ldquo;Save as template&rdquo; from a
            document&rsquo;s actions menu.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {userTemplates.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-[var(--foreground)]">{t.name}</h3>
                  <button
                    type="button"
                    onClick={() => deleteTemplate(t.id)}
                    aria-label={`Delete template ${t.name}`}
                    className="shrink-0 text-[var(--muted)] text-sm hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
                {t.description !== null && t.description.length > 0 && (
                  <p className="flex-1 text-[var(--muted)] text-sm">{t.description}</p>
                )}
                <button
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => instantiate(`user:${t.id}`, { templateId: t.id })}
                  className="self-start rounded-md bg-[var(--primary)] px-3 py-1.5 font-medium text-sm text-[var(--on-primary)] disabled:opacity-50"
                >
                  {busyKey === `user:${t.id}` ? 'Creating…' : 'Use template'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
