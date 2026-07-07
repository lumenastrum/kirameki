'use client'

/**
 * Session history panel — the time machine.
 *
 * Lists every transcript the relay can see (any project, any age) and
 * replays the selected one through the normal event pipeline. Standalone
 * mode only: in VS Code the relay HTTP endpoints don't exist.
 */

import { useEffect, useState } from 'react'
import { COLORS } from '@/lib/colors'
import { Z } from '@/lib/agent-types'

interface HistorySession {
  id: string
  project?: string
  label?: string
  mtimeMs: number
  watched: boolean
}

const relayPort = process.env.NEXT_PUBLIC_RELAY_PORT || ''
const RELAY_BASE = relayPort ? `http://127.0.0.1:${relayPort}` : ''

function relativeTime(mtimeMs: number): string {
  const s = Math.max(0, (Date.now() - mtimeMs) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function HistoryPanel({ visible, onClose }: {
  visible: boolean
  onClose: () => void
}) {
  const [items, setItems] = useState<HistorySession[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [replayingId, setReplayingId] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setStatus('loading')
    fetch(`${RELAY_BASE}/sessions/history`)
      .then(r => r.json())
      .then((data: HistorySession[]) => {
        if (cancelled) return
        setItems(data)
        setStatus('ready')
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [visible])

  const replay = async (id: string) => {
    setReplayingId(id)
    try {
      const r = await fetch(`${RELAY_BASE}/sessions/replay?id=${encodeURIComponent(id)}`)
      if (r.ok) {
        // The relay broadcasts session-started; the bridge auto-selects it.
        onClose()
      }
    } catch { /* relay unreachable — leave the panel open */ }
    setReplayingId(null)
  }

  if (!visible) return null

  return (
    <div
      className="glass-card absolute top-12 right-3 flex flex-col font-mono"
      style={{ width: 380, maxHeight: '70vh', zIndex: Z.sidePanel, position: 'absolute' }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] tracking-widest" style={{ color: COLORS.panelLabel }}>
          SESSION HISTORY
        </span>
        <button
          onClick={onClose}
          className="text-[10px] px-1"
          style={{ color: COLORS.tabClose }}
        >
          ✕
        </button>
      </div>

      {status === 'loading' && (
        <div className="text-[10px] py-4 text-center" style={{ color: COLORS.textMuted }}>loading…</div>
      )}
      {status === 'error' && (
        <div className="text-[10px] py-4 text-center" style={{ color: COLORS.error }}>
          could not reach the relay
        </div>
      )}

      {status === 'ready' && (
        <div className="overflow-y-auto flex flex-col gap-1" style={{ scrollbarWidth: 'thin' }}>
          {items.length === 0 && (
            <div className="text-[10px] py-4 text-center" style={{ color: COLORS.textMuted }}>
              no transcripts found
            </div>
          )}
          {items.map(item => (
            <button
              key={item.id}
              disabled={replayingId !== null}
              onClick={() => replay(item.id)}
              className="text-left rounded px-2 py-1.5 transition-colors hover:brightness-125"
              style={{
                background: COLORS.holoBg05,
                border: `1px solid ${COLORS.holoBorder08}`,
                opacity: replayingId && replayingId !== item.id ? 0.5 : 1,
                cursor: 'pointer',
              }}
            >
              <div className="flex items-center gap-2 text-[10px]">
                {item.project && (
                  <span style={{ color: COLORS.costText, flexShrink: 0 }}>{item.project}</span>
                )}
                <span style={{ color: COLORS.textDim, marginLeft: 'auto', flexShrink: 0 }}>
                  {relativeTime(item.mtimeMs)}
                </span>
                {item.watched && (
                  <span style={{ color: COLORS.complete, flexShrink: 0 }}>●</span>
                )}
              </div>
              <div
                className="text-[11px] mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap"
                style={{ color: COLORS.textPrimary }}
              >
                {replayingId === item.id ? 'replaying…' : (item.label || `Session ${item.id.slice(0, 8)}`)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
