import { notFound } from 'next/navigation'
import { Editor } from '@/components/editor/Editor'
import { isAiEnabled } from '@/lib/ai/compose'
import { requireUser } from '@/lib/auth/guard'
import { resolveDocAccess } from '@/lib/authz/doc-access'
import { hasCollabState } from '@/lib/docs/repo'
import {
  getAutosaveInterval,
  getPageLayoutMode,
  getSpellcheckEnabled,
} from '@/lib/docs/settings-repo'
import { parseCustomCss } from '@/lib/editor/custom-css'
import { parseWatermark } from '@/lib/editor/watermark'
import { isLanguageToolEnabled } from '@/lib/integrations/languagetool'

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  // A4: open if the user can VIEW the doc — owner, workspace admin, or any
  // document_permissions grant (viewer+). A denied/missing doc 404s (no leak).
  const doc = await resolveDocAccess(user, id, 'view')
  if (!doc) notFound()

  // D4: whether the collab server already holds a Yjs snapshot — gates first-open
  // seeding so the client never seeds on top of authoritative server state.
  const collabStateExists = await hasCollabState(doc.id)

  // G9: parse the stored watermark from documents.meta.watermark (falls back to
  // DEFAULT_WATERMARK when absent or malformed — never throws).
  const docMeta = doc.meta as Record<string, unknown> | null
  const initialWatermark = parseWatermark(docMeta?.watermark)

  // G17: parse the stored custom CSS from documents.meta.customCss (empty string
  // when absent — never throws). Raw CSS; sanitize+scope happen at render time.
  const initialCustomCss = parseCustomCss(docMeta?.customCss)

  // G13: AI is off by default — only enabled when AI_BASE_URL is configured.
  // Computed server-side so the client never reads process.env directly.
  const aiEnabled = isAiEnabled()

  // I3: fetch the owner's autosave cadence; falls back to 30s when unset.
  const autosaveIntervalMs = await getAutosaveInterval(user.id)

  // K6: the owner's native-spellcheck preference (default ON).
  const spellcheckEnabled = await getSpellcheckEnabled(user.id)

  // v0.1.5: the owner's page-layout mode (default 'continuous'); drives the
  // stronger sheet-edge boundary visual in Paged mode.
  const pageLayoutMode = await getPageLayoutMode(user.id)

  // K7: grammar check is off by default — only enabled when LANGUAGETOOL_URL is
  // configured. Computed server-side so the client never reads the env / key.
  const grammarEnabled = isLanguageToolEnabled()

  return (
    <Editor
      docId={doc.id}
      initialTitle={doc.title}
      initialStarred={doc.starred ?? false}
      initialJson={(doc.content as Record<string, unknown> | null) ?? null}
      currentUserName={user.name}
      currentUserId={user.id}
      hasCollabState={collabStateExists}
      initialWatermark={initialWatermark}
      initialCustomCss={initialCustomCss}
      aiEnabled={aiEnabled}
      autosaveIntervalMs={autosaveIntervalMs}
      spellcheckEnabled={spellcheckEnabled}
      grammarEnabled={grammarEnabled}
      pageLayoutMode={pageLayoutMode}
    />
  )
}
