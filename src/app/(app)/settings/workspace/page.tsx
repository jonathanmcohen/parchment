import { getTranslations } from 'next-intl/server'
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher'
import { AppearanceSettings } from '@/components/settings/AppearanceSettings'
import { AutosaveSlider } from '@/components/settings/AutosaveSlider'
import { PageLayoutSetting } from '@/components/settings/PageLayoutSetting'
import { ShortcutsSettings } from '@/components/settings/ShortcutsSettings'
import { SpellingSettings } from '@/components/settings/SpellingSettings'
import { StylesManager } from '@/components/settings/StylesManager'
import { WorkspaceNameSetting } from '@/components/settings/WorkspaceNameSetting'
import { isLanguageToolEnabled } from '@/lib/integrations/languagetool'

export default async function WorkspaceSettingsPage() {
  const t = await getTranslations('settings')
  // K7: grammar status computed server-side (the LANGUAGETOOL_URL env is never
  // read client-side); the UI shows enabled/disabled + the env-config note.
  const grammarEnabled = isLanguageToolEnabled()
  return (
    <section className="max-w-2xl px-4 sm:px-6 md:px-0">
      <h1 className="font-semibold text-2xl tracking-tight">Workspace</h1>
      <p className="mt-2 text-[var(--muted)]">Settings that apply to everyone in this workspace.</p>

      <section aria-labelledby="workspace-identity" className="mt-10">
        <h2 id="workspace-identity" className="font-medium text-lg">
          Identity
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          The name shown across the app and in shared links.
        </p>
        {/* F7: real, wired control (GET/PUT /api/settings/workspace). */}
        <WorkspaceNameSetting />
      </section>

      <section
        aria-labelledby="workspace-autosave"
        className="mt-12 border-t border-[var(--border)] pt-8"
      >
        <h2 id="workspace-autosave" className="font-medium text-lg">
          Autosave
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          How often a version snapshot is saved while you are editing.
        </p>
        <AutosaveSlider />
      </section>

      <section
        aria-labelledby="workspace-page-layout"
        className="mt-12 border-t border-[var(--border)] pt-8"
      >
        <h2 id="workspace-page-layout" className="font-medium text-lg">
          Page layout
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">
          How page breaks are shown in the editor. Continuous flows as one sheet; Paged renders
          stronger sheet edges between pages.
        </p>
        {/* v0.1.5: real, wired control (GET/PUT /api/settings/page-layout). */}
        <PageLayoutSetting />
      </section>

      <section
        aria-labelledby="workspace-language"
        className="mt-12 border-t border-[var(--border)] pt-8"
      >
        <h2 id="workspace-language" className="font-medium text-lg">
          {t('language')}
        </h2>
        <p className="mt-1 text-[var(--muted)] text-sm">{t('languageDescription')}</p>
        <div className="mt-4 max-w-xs">
          <LocaleSwitcher />
        </div>
      </section>

      <AppearanceSettings />

      <SpellingSettings grammarEnabled={grammarEnabled} />

      <ShortcutsSettings />

      <StylesManager />
    </section>
  )
}
