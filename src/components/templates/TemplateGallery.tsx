'use client'

import { useState } from 'react'

// G2: the templates gallery. Renders two sections — bundled templates (shipped
// in code) and the user's saved templates. "Use template" POSTs to
// /api/docs/from-template and navigates to the new doc; user templates get a
// delete (✕) action. Client component — never imports @/db.

export interface BundledTemplateDTO {
  key: string
  name: string
  description: string
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
  const [error, setError] = useState<string | null>(null)

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

      <section aria-labelledby="bundled-heading">
        <h2 id="bundled-heading" className="mb-3 font-semibold text-lg text-[var(--foreground)]">
          Bundled
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bundled.map((t) => (
            <li
              key={t.key}
              className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-4"
            >
              <h3 className="font-medium text-[var(--foreground)]">{t.name}</h3>
              <p className="flex-1 text-[var(--muted)] text-sm">{t.description}</p>
              <button
                type="button"
                disabled={busyKey !== null}
                onClick={() => instantiate(`builtin:${t.key}`, { builtinKey: t.key })}
                className="self-start rounded-md bg-[var(--primary)] px-3 py-1.5 font-medium text-sm text-[var(--on-primary)] disabled:opacity-50"
              >
                {busyKey === `builtin:${t.key}` ? 'Creating…' : 'Use template'}
              </button>
            </li>
          ))}
        </ul>
      </section>

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
