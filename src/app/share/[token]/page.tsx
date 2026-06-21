import { ShareViewer } from '@/components/share/ShareViewer'

// G1 PUBLIC share route. Lives OUTSIDE the auth-gated (app) group, so the root
// layout — which gates nothing — renders it for any visitor with no session.
// The page is a thin server shell; ALL data fetching happens client-side through
// the public /api/share/[token] data path, which enforces token validity,
// expiry, and the optional password server-side. No owner/other-doc data ever
// reaches this route.
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ShareViewer token={token} />
}
