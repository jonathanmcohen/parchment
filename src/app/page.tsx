import { redirect } from 'next/navigation'

// S5-6: the landing card is gone — `/` redirects straight to `/files`.
//
// No middleware exists; the (app) layout's requireUser() is the only gate. So:
//   • unauthed `/` → `/files` → requireUser() → `/login` (single hop, no loop)
//   • authed   `/` → `/files`
// Health is reachable via Settings → Admin → Health (no dangling link is left
// behind, since the whole card — tagline, version, Health link — is removed).
export default function Home() {
  redirect('/files')
}
