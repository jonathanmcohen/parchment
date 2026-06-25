'use client'

import type { HocuspocusProvider } from '@hocuspocus/provider'
import { useEffect, useState } from 'react'
import type { ConnectionState } from './StatusBar'

// S3-6: the connection state that was previously rendered by the standalone
// OfflineIndicator pill is now a colored dot in the status bar's right slot.
// This hook owns the SAME derivation OfflineIndicator used (online / syncing /
// offline) — a glyph/placement change, NOT new connection logic. The dot +
// optional label live in the status bar; no standalone indicator sibling
// remains.

type ProviderStatus = 'connected' | 'connecting' | 'disconnected'

export function useConnectionState(provider: HocuspocusProvider | null): ConnectionState {
  // V5: initialize to a STABLE, server-safe default and read the real value in a
  // post-mount effect — do NOT read navigator.onLine in the initializer.
  //
  // `typeof navigator !== 'undefined' ? navigator.onLine : true` looks server-safe
  // but is not: Node 21+ defines a GLOBAL `navigator` object that has no `onLine`
  // property, so on the server the expression evaluates to `undefined` (falsy).
  // The status bar then renders connection='offline' on the server while the
  // browser renders the real 'online'/'syncing' — a server/client text+structure
  // divergence that triggers React hydration error #418 on every editor load
  // (confirmed: SSR data-state="offline" vs hydrated data-state="online").
  //
  // Defaulting to `true` keeps the server render and the client's FIRST render
  // identical (both isOnline=true, providerStatus='connecting' → 'syncing'); the
  // effect below then syncs to the true navigator.onLine after mount.
  const [isOnline, setIsOnline] = useState(true)
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>('connecting')

  useEffect(() => {
    // Now on the client: adopt the real online status (browsers always expose
    // navigator.onLine) and keep it current via the online/offline events.
    setIsOnline(navigator.onLine)
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (!provider) {
      setProviderStatus('disconnected')
      return
    }

    // Snapshot the provider's current WebSocket status eagerly so a stable
    // connection (no future 'connect' event) shows the correct state immediately.
    const wsProvider = (
      provider as unknown as {
        configuration?: { websocketProvider?: { wsconnected?: boolean; wsconnecting?: boolean } }
      }
    ).configuration?.websocketProvider
    if (wsProvider) {
      if (wsProvider.wsconnected) {
        setProviderStatus('connected')
      } else if (wsProvider.wsconnecting) {
        setProviderStatus('connecting')
      } else {
        setProviderStatus('disconnected')
      }
    }

    const handleConnect = () => setProviderStatus('connected')
    const handleDisconnect = () => setProviderStatus('disconnected')
    const handleStatus = ({ status }: { status: string }) => {
      if (status === 'connected') setProviderStatus('connected')
      else if (status === 'connecting') setProviderStatus('connecting')
      else setProviderStatus('disconnected')
    }

    provider.on('connect', handleConnect)
    provider.on('disconnect', handleDisconnect)
    provider.on('status', handleStatus)

    return () => {
      provider.off('connect', handleConnect)
      provider.off('disconnect', handleDisconnect)
      provider.off('status', handleStatus)
    }
  }, [provider])

  if (!isOnline) return 'offline'
  if (providerStatus === 'connecting') return 'syncing'
  if (providerStatus === 'disconnected') return 'offline'
  return 'online'
}
