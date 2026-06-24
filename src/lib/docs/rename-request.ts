// S3-1: build the request descriptor for the inline-title save (DECISION 3).
//
// The doc title bar's inline title saves on blur via the EXISTING title-only
// endpoint `POST /api/docs/:id/rename` (backed by `renameDocument`), which
// writes ONLY the title and can never touch `contentJson`/`markdown`. It must
// NOT reuse the body-save `PUT /api/docs/:id` (which sends
// `{ contentJson, markdown }` and would write an empty body — the I4 clobber).
//
// Keeping the request shape in a pure helper lets the unit gate prove, without a
// network call, that the title save targets `/rename` with `{ title }` only and
// never the body-PUT. Returns null when there is nothing to persist (empty title
// or unchanged from the previous value) so the caller skips a needless write.

export type RenameRequest = {
  url: string
  method: 'POST'
  body: { title: string }
}

export function buildRenameRequest(
  docId: string,
  nextTitle: string,
  previousTitle?: string,
): RenameRequest | null {
  const title = nextTitle.trim()
  if (title.length === 0) return null
  if (previousTitle !== undefined && title === previousTitle.trim()) return null

  return {
    url: `/api/docs/${docId}/rename`,
    method: 'POST',
    body: { title },
  }
}
