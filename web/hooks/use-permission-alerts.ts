'use client'

/**
 * Permission alerts — makes a blocked session impossible to miss.
 *
 * While any session (selected or background) is waiting on a permission
 * prompt: flash the tab title, swap the favicon to a gold alert sparkle,
 * chime once per newly-blocked session, and post a browser notification
 * when the tab is hidden. Everything restores itself when the set empties.
 */

import { useEffect, useRef } from 'react'
import type { SessionInfo } from '@/lib/vscode-bridge'

const FLASH_INTERVAL_MS = 900

// Gold sparkle with a red alert dot, as an inline SVG favicon.
const ALERT_FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
  '<path fill="#ffd24d" d="M42 16 L50.8 47.2 L82 56 L50.8 64.8 L42 96 L33.2 64.8 L2 56 L33.2 47.2 Z"/>' +
  '<circle cx="78" cy="24" r="17" fill="#ff4444"/>' +
  '</svg>',
)

export function usePermissionAlerts(
  awaiting: Set<string>,
  sessions: SessionInfo[],
  chime: () => void,
) {
  const prevAwaitingRef = useRef<Set<string>>(new Set())
  const notifPermissionRequestedRef = useRef(false)
  const sessionsRef = useRef(sessions)
  sessionsRef.current = sessions

  // Chime + notification, edge-triggered per newly-blocked session
  useEffect(() => {
    const prev = prevAwaitingRef.current
    const fresh: string[] = []
    for (const sid of awaiting) {
      if (!prev.has(sid)) fresh.push(sid)
    }
    prevAwaitingRef.current = new Set(awaiting)
    if (fresh.length === 0) return

    chime()

    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default' && !notifPermissionRequestedRef.current) {
      // May be ignored without a user gesture — that's fine, we degrade to
      // title flash + favicon which need no permission.
      notifPermissionRequestedRef.current = true
      try { Notification.requestPermission() } catch { /* ignore */ }
    }
    if (document.hidden && Notification.permission === 'granted') {
      for (const sid of fresh) {
        const label = sessionsRef.current.find(s => s.id === sid)?.label || `Session ${sid.slice(0, 8)}`
        try {
          new Notification('Kirameki ✨ — permission needed', {
            body: `"${label}" is waiting for you to approve a tool call.`,
            tag: `kirameki-permission-${sid}`,
          })
        } catch { /* notifications unavailable (e.g. no OS support) */ }
      }
    }
  }, [awaiting, chime])

  // Title flash + favicon swap while anything is blocked
  useEffect(() => {
    if (awaiting.size === 0) return

    const baseTitle = document.title
    const alertTitle = awaiting.size === 1
      ? '⚠ Permission needed — Kirameki'
      : `⚠ ${awaiting.size} sessions need permission — Kirameki`

    let showingAlert = false
    const interval = setInterval(() => {
      showingAlert = !showingAlert
      document.title = showingAlert ? alertTitle : baseTitle
    }, FLASH_INTERVAL_MS)
    document.title = alertTitle
    showingAlert = true

    const icons = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel*="icon"]'))
    const originalHrefs = icons.map(l => l.href)
    for (const l of icons) l.href = ALERT_FAVICON

    return () => {
      clearInterval(interval)
      document.title = baseTitle
      icons.forEach((l, i) => { l.href = originalHrefs[i] })
    }
  }, [awaiting])
}
