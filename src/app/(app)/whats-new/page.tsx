import { permanentRedirect } from 'next/navigation'

// I5: About/What's-new moved INTO the settings shell at /settings/about. This old
// standalone route 308-redirects there so existing bookmarks / links keep working.
export default function WhatsNewPage() {
  permanentRedirect('/settings/about')
}
