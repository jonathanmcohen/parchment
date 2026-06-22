'use client'

import type { HocuspocusProvider } from '@hocuspocus/provider'
import { useEffect, useState } from 'react'

type ProviderStatus = 'connected' | 'connecting' | 'disconnected'

type Props = {
  /** Pass the Hocuspocus provider when available (may be null when offline at startup). */
  provider: HocuspocusProvider | null
}

/**
 * Unobtrusive online/offline + sync status indicator.
 *
 * Shows nothing when connected and online (the happy path is silent).
 * Renders a small pill only when offline or syncing so it doesn't clutter
 * the editor UI during normal use.
 *
 * Accessibility: the wrapping div uses aria-live="polite" so screen readers
 * announce status changes without interrupting the user.
 */
export function OfflineIndicator({ provider }: Props) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>('connecting')

  // Track browser online/offline events.
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Track provider connection status events.
  useEffect(() => {
    if (!provider) {
      setProviderStatus('disconnected')
      return
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

  // Derive a display state.
  type DisplayState = 'online' | 'offline' | 'syncing'
  let displayState: DisplayState = 'online'
  if (!isOnline) {
    displayState = 'offline'
  } else if (providerStatus === 'connecting') {
    displayState = 'syncing'
  } else if (providerStatus === 'disconnected') {
    displayState = 'offline'
  }

  // When connected + online, render nothing (silent happy path). The aria-live
  // region is always in the DOM so screen readers track transitions correctly.
  const label =
    displayState === 'offline'
      ? 'Offline — changes saved locally'
      : displayState === 'syncing'
        ? 'Syncing…'
        : ''

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="parchment-offline-indicator"
      data-state={displayState}
    >
      {displayState !== 'online' && (
        <span className="parchment-offline-pill" title={label}>
          {displayState === 'offline' ? '⊘ Offline' : '↻ Syncing'}
        </span>
      )}
      {/* Hidden accessible label for screen readers */}
      <span className="sr-only">{label}</span>
    </div>
  )
}
