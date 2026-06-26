import { redirect } from 'next/navigation'

// Trash is surfaced inside the FileManager as `view === 'trash'` via
// `/files?view=trash`. Redirect any existing /trash bookmarks or links so
// nothing breaks.
export default function TrashPage() {
  redirect('/files?view=trash')
}
