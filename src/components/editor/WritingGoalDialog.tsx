'use client'

import { useId, useState } from 'react'
import { goalProgress } from '@/lib/editor/goals'

// J10: set or clear the per-doc writing goal (target words). Mirrors the
// established `.parchment-dialog*` shell (same as WordCountDialog). Persistence is
// the parent's job (PUT /api/docs/[id]/goal); this dialog only collects the number.

export type WritingGoalDialogProps = {
  /** Current saved target (0 = no goal). */
  currentTarget: number
  /** Live word count, so the dialog can preview progress against a new target. */
  currentWords: number
  onSave: (target: number) => void
  onClose: () => void
}

export function WritingGoalDialog({
  currentTarget,
  currentWords,
  onSave,
  onClose,
}: WritingGoalDialogProps) {
  const titleId = useId()
  const inputId = useId()
  const [value, setValue] = useState(currentTarget > 0 ? String(currentTarget) : '')

  const parsed = Number.parseInt(value, 10)
  const target = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
  const preview = goalProgress({ words: currentWords, targetWords: target })

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss on click is standard modal UX
    <div
      role="presentation"
      className="parchment-dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="writing-goal-dialog"
        className="parchment-dialog parchment-wordcount-dialog"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
      >
        <div className="parchment-dialog-header">
          <h2 id={titleId} className="parchment-dialog-title">
            Writing goal
          </h2>
          <button
            type="button"
            className="parchment-dialog-close"
            aria-label="Close"
            onClick={onClose}
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              close
            </span>
          </button>
        </div>

        <div className="flex flex-col gap-3 px-1 py-2">
          <label htmlFor={inputId} className="text-sm text-[var(--foreground)]">
            Target word count (0 or blank to remove the goal)
          </label>
          <input
            id={inputId}
            type="number"
            min="0"
            value={value}
            // biome-ignore lint/a11y/noAutofocus: a single-field dialog opened on demand; focus belongs on the input
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--background)] text-[var(--foreground)]"
          />
          {target > 0 && (
            <p data-testid="writing-goal-preview" className="text-sm text-[var(--muted)]">
              {currentWords} / {target} words — {preview.pct}%
              {preview.done ? ' (goal met)' : ` (${preview.remaining} to go)`}
            </p>
          )}
        </div>

        <div className="parchment-dialog-actions">
          <button
            type="button"
            className="parchment-dialog-btn-secondary"
            onClick={() => onSave(0)}
          >
            Remove goal
          </button>
          <button
            type="button"
            className="parchment-dialog-btn-primary"
            onClick={() => onSave(target)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
