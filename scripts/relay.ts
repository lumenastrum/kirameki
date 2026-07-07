/**
 * Shared relay module — receives agent events and streams them to SSE clients.
 * Used by both the dev relay server and the standalone app.
 */
import * as http from 'http'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import { HookServer } from '../extension/src/hook-server'
import { AgentEvent, SessionInfo, WatchedSession } from '../extension/src/protocol'
import { TranscriptParser } from '../extension/src/transcript-parser'
import { readNewFileLines } from '../extension/src/fs-utils'
import { scanSubagentsDir, readSubagentNewLines } from '../extension/src/subagent-watcher'
import { handlePermissionDetection } from '../extension/src/permission-detection'
import { CodexSessionWatcher } from '../extension/src/codex-session-watcher'
import {
  INACTIVITY_TIMEOUT_MS, SCAN_INTERVAL_MS, ACTIVE_SESSION_AGE_S, POLL_FALLBACK_MS,
  SESSION_ID_DISPLAY, SYSTEM_PROMPT_BASE_TOKENS, ORCHESTRATOR_NAME,
  HOOK_SERVER_NOT_STARTED, WORKSPACE_HASH_LENGTH, SYSTEM_CONTENT_PREFIXES,
} from '../extension/src/constants'
import { setLogLevel } from '../extension/src/logger'

const MAX_EVENT_BUFFER = 5000
const DISCOVERY_DIR = path.join(os.homedir(), '.claude', 'kirameki')
const CLAUDE_DIR = path.join(os.homedir(), '.claude', 'projects')

let relayCreated = false
let verbose = false
/** Mission-control mode: watch every project under ~/.claude/projects.
 *  Enabled by passing '*' as the workspace. */
let watchAll = false

function log(...args: unknown[]) {
  if (verbose) console.log(...args)
}

/** Derive a project tag from a transcript's early lines (first `cwd` field).
 *  The opening lines can be queue-operation/summary entries without a cwd —
 *  the first user/assistant entry carries it. */
function readProjectName(filePath: string): string | undefined {
  try {
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(32768)
    const n = fs.readSync(fd, buf, 0, 32768, 0)
    fs.closeSync(fd)
    const lines = buf.toString('utf8', 0, n).split('\n')
    for (const line of lines.slice(0, 10)) {
      try {
        const cwd = JSON.parse(line)?.cwd
        if (typeof cwd === 'string' && cwd) return path.basename(cwd)
      } catch { /* truncated or malformed line — try the next */ }
    }
  } catch { /* unreadable file — no tag */ }
  return undefined
}

// ─── SSE client management ──────────────────────────────────────────────────

const sseClients = new Set<http.ServerResponse>()

function sendSSE(res: http.ServerResponse, data: unknown) {
  try { res.write(`data: ${JSON.stringify(data)}\n\n`) } catch {
    sseClients.delete(res)
  }
}

function broadcast(data: string) {
  for (const res of sseClients) {
    try { res.write(`data: ${data}\n\n`) } catch {
      sseClients.delete(res)
    }
  }
}

// ─── Event buffering ────────────────────────────────────────────────────────

const eventBuffer = new Map<string, AgentEvent[]>()

function broadcastEvent(event: AgentEvent) {
  const sid = event.sessionId?.slice(0, SESSION_ID_DISPLAY) || '?'
  log(`[event] ${event.type} (session ${sid})`)

  if (event.sessionId) {
    let buf = eventBuffer.get(event.sessionId) || []
    buf.push(event)
    if (buf.length > MAX_EVENT_BUFFER) {
      buf = buf.slice(buf.length - MAX_EVENT_BUFFER)
    }
    eventBuffer.set(event.sessionId, buf)
  }

  broadcast(JSON.stringify({ type: 'agent-event', event }))
}

function broadcastSessionLifecycle(type: 'started' | 'ended' | 'updated', sessionId: string, label: string, project?: string) {
  if (type === 'started') {
    broadcast(JSON.stringify({
      type: 'session-started',
      session: { id: sessionId, label, status: 'active', startTime: Date.now(), lastActivityTime: Date.now(), ...(project ? { project } : {}) } as SessionInfo,
    }))
  } else if (type === 'ended') {
    broadcast(JSON.stringify({ type: 'session-ended', sessionId }))
  } else if (type === 'updated') {
    broadcast(JSON.stringify({ type: 'session-updated', sessionId, label }))
  }
}

// ─── Session watcher ────────────────────────────────────────────────────────

const sessions = new Map<string, WatchedSession>()

function elapsed(sessionId?: string): number {
  if (sessionId) {
    const session = sessions.get(sessionId)
    if (session) return (Date.now() - session.sessionStartTime) / 1000
  }
  return 0
}

function emitContextUpdate(agentName: string, session: WatchedSession, sessionId?: string) {
  const bd = session.contextBreakdown
  const total = bd.systemPrompt + bd.userMessages + bd.toolResults + bd.reasoning + bd.subagentResults
  broadcastEvent({
    time: elapsed(sessionId),
    type: 'context_update',
    payload: { agent: agentName, tokens: total, breakdown: { ...bd } },
    sessionId,
  })
}

function emitEvent(event: AgentEvent, sessionId?: string) {
  broadcastEvent(sessionId ? { ...event, sessionId } : event)
}

const parser = new TranscriptParser({
  emit: emitEvent,
  elapsed,
  getSession: (sessionId: string) => sessions.get(sessionId),
  fireSessionLifecycle: (event) => broadcastSessionLifecycle(event.type, event.sessionId, event.label),
  emitContextUpdate,
})

const watcherDelegate = {
  emit: emitEvent,
  elapsed,
  getSession: (sessionId: string) => sessions.get(sessionId),
  getLastActivityTime: (sessionId: string) => sessions.get(sessionId)?.lastActivityTime,
  resetInactivityTimer: (sessionId: string) => resetInactivityTimer(sessionId),
}

function resetInactivityTimer(sessionId: string) {
  const session = sessions.get(sessionId)
  if (!session) return

  const wasCompleted = session.sessionCompleted
  session.lastActivityTime = Date.now()
  session.sessionCompleted = false

  if (wasCompleted) {
    broadcastEvent({
      time: elapsed(sessionId),
      type: 'agent_spawn',
      payload: { name: ORCHESTRATOR_NAME, isMain: true, task: session.label, ...(session.model ? { model: session.model } : {}) },
      sessionId,
    })
    broadcastSessionLifecycle('started', sessionId, session.label, session.project)
  }

  if (session.inactivityTimer) clearTimeout(session.inactivityTimer)
  session.inactivityTimer = setTimeout(() => {
    if (!session.sessionCompleted && session.sessionDetected) {
      log(`[session] ${sessionId.slice(0, SESSION_ID_DISPLAY)} inactive`)
      session.sessionCompleted = true
      broadcastEvent({
        time: elapsed(sessionId),
        type: 'agent_complete',
        payload: { name: ORCHESTRATOR_NAME },
        sessionId,
      })
      broadcastSessionLifecycle('ended', sessionId, session.label)
    }
  }, INACTIVITY_TIMEOUT_MS)
}

function watchSession(sessionId: string, filePath: string) {
  const defaultLabel = `Session ${sessionId.slice(0, SESSION_ID_DISPLAY)}`
  const session: WatchedSession = {
    sessionId, filePath,
    project: readProjectName(filePath),
    fileWatcher: null, pollTimer: null, fileSize: 0,
    sessionStartTime: Date.now(),
    pendingToolCalls: new Map(),
    seenToolUseIds: new Set(),
    seenMessageHashes: new Set(),
    sessionDetected: false, sessionCompleted: false,
    lastActivityTime: Date.now(),
    inactivityTimer: null,
    subagentWatchers: new Map(),
    spawnedSubagents: new Set(),
    inlineProgressAgents: new Set(),
    subagentsDirWatcher: null, subagentsDir: null,
    label: defaultLabel, labelSet: false,
    model: null,
    permissionTimer: null, permissionEmitted: false,
    contextBreakdown: { systemPrompt: SYSTEM_PROMPT_BASE_TOKENS, userMessages: 0, toolResults: 0, reasoning: 0, subagentResults: 0 },
  }
  sessions.set(sessionId, session)

  const stat = fs.statSync(filePath)
  const catchUpEntries = parser.prescanExistingContent(filePath, stat.size, session)
  session.fileSize = stat.size
  parser.extractSessionLabel(catchUpEntries, session)

  broadcastSessionLifecycle('started', sessionId, session.label, session.project)
  broadcastEvent({
    time: 0, type: 'agent_spawn',
    payload: { name: ORCHESTRATOR_NAME, isMain: true, task: session.label, ...(session.model ? { model: session.model } : {}) },
    sessionId,
  })
  session.sessionDetected = true

  emitContextUpdate(ORCHESTRATOR_NAME, session, sessionId)
  parser.emitCatchUpEntries(catchUpEntries, session, sessionId)

  session.fileWatcher = fs.watch(filePath, (eventType) => {
    if (eventType === 'change') readNewLines(sessionId)
  })

  session.pollTimer = setInterval(() => {
    readNewLines(sessionId)
    for (const [subPath] of session.subagentWatchers) {
      readSubagentNewLines(watcherDelegate, parser, subPath, sessionId)
    }
    scanSubagentsDir(watcherDelegate, parser, sessionId)
  }, POLL_FALLBACK_MS)

  session.subagentsDir = path.join(path.dirname(filePath), sessionId, 'subagents')
  scanSubagentsDir(watcherDelegate, parser, sessionId)
  resetInactivityTimer(sessionId)

  log(`[session] Watching ${sessionId.slice(0, SESSION_ID_DISPLAY)} — "${session.label}"`)
}

function readNewLines(sessionId: string) {
  const session = sessions.get(sessionId)
  if (!session) return

  const result = readNewFileLines(session.filePath, session.fileSize)
  if (!result) return
  session.fileSize = result.newSize
  for (const line of result.lines) {
    parser.processTranscriptLine(line, ORCHESTRATOR_NAME, session.pendingToolCalls, session.seenToolUseIds, sessionId, session.seenMessageHashes)
  }

  handlePermissionDetection(watcherDelegate, ORCHESTRATOR_NAME, session.pendingToolCalls, session, sessionId, session.sessionCompleted, true)
  scanSubagentsDir(watcherDelegate, parser, sessionId)
  resetInactivityTimer(sessionId)
}

// ─── Session scanner ────────────────────────────────────────────────────────

function scanForActiveSessions(workspace: string) {
  if (!fs.existsSync(CLAUDE_DIR)) return

  const dirsToScan: string[] = []
  if (watchAll) {
    // Mission control: every project directory is fair game
    try {
      for (const dir of fs.readdirSync(CLAUDE_DIR, { withFileTypes: true })) {
        if (dir.isDirectory()) dirsToScan.push(path.join(CLAUDE_DIR, dir.name))
      }
    } catch {}
  } else {
    let resolved = workspace
    try { resolved = fs.realpathSync(resolved) } catch {}
    const encoded = resolved.replace(/[^a-zA-Z0-9]/g, '-')

    const projectDir = path.join(CLAUDE_DIR, encoded)
    if (fs.existsSync(projectDir)) dirsToScan.push(projectDir)

    try {
      for (const dir of fs.readdirSync(CLAUDE_DIR, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue
        const fullPath = path.join(CLAUDE_DIR, dir.name)
        if (fullPath === projectDir) continue
        if (dir.name.startsWith(encoded + '-')) {
          dirsToScan.push(fullPath)
        }
      }
    } catch {}
  }

  for (const dirPath of dirsToScan) {
    try {
      for (const file of fs.readdirSync(dirPath)) {
        if (!file.endsWith('.jsonl')) continue
        const filePath = path.join(dirPath, file)
        const stat = fs.statSync(filePath)
        const sessionId = path.basename(file, '.jsonl')

        let newestMtime = stat.mtimeMs
        const subagentsDir = path.join(dirPath, sessionId, 'subagents')
        try {
          if (fs.existsSync(subagentsDir)) {
            for (const subFile of fs.readdirSync(subagentsDir)) {
              if (!subFile.endsWith('.jsonl')) continue
              const subStat = fs.statSync(path.join(subagentsDir, subFile))
              if (subStat.mtimeMs > newestMtime) newestMtime = subStat.mtimeMs
            }
          }
        } catch {}

        const ageSeconds = (Date.now() - newestMtime) / 1000
        if (ageSeconds <= ACTIVE_SESSION_AGE_S && !sessions.has(sessionId)) {
          watchSession(sessionId, filePath)
        }
      }
    } catch {}
  }
}

// ─── Session history (time machine) ─────────────────────────────────────────

const HISTORY_LIMIT = 100

export interface HistorySession {
  id: string
  project?: string
  label?: string
  mtimeMs: number
  watched: boolean
}

/** Preview label for a transcript: first real user message, truncated. */
function readSessionLabel(filePath: string): string | undefined {
  try {
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(65536)
    const n = fs.readSync(fd, buf, 0, 65536, 0)
    fs.closeSync(fd)
    for (const line of buf.toString('utf8', 0, n).split('\n').slice(0, 25)) {
      try {
        const entry = JSON.parse(line)
        if (entry?.type !== 'user') continue
        const content = entry.message?.content
        let text = ''
        if (typeof content === 'string') {
          text = content
        } else if (Array.isArray(content)) {
          const block = content.find((b: unknown) =>
            (b as { type?: string })?.type === 'text' && typeof (b as { text?: unknown }).text === 'string')
          text = (block as { text?: string })?.text || ''
        }
        text = text.trim()
        if (!text || SYSTEM_CONTENT_PREFIXES.some(p => text.startsWith(p))) continue
        return text.length > 60 ? text.slice(0, 57) + '…' : text
      } catch { /* malformed or truncated line — try the next */ }
    }
  } catch { /* unreadable file */ }
  return undefined
}

/** Every transcript on disk (any project, any age), newest first. */
function listHistorySessions(): HistorySession[] {
  if (!fs.existsSync(CLAUDE_DIR)) return []
  const found: Array<{ id: string; filePath: string; mtimeMs: number }> = []
  let projectDirs: fs.Dirent[] = []
  try { projectDirs = fs.readdirSync(CLAUDE_DIR, { withFileTypes: true }) } catch { return [] }
  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue
    const dirPath = path.join(CLAUDE_DIR, dir.name)
    let files: string[] = []
    try { files = fs.readdirSync(dirPath) } catch { continue }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue
      const filePath = path.join(dirPath, file)
      try {
        const stat = fs.statSync(filePath)
        if (stat.size === 0) continue
        found.push({ id: path.basename(file, '.jsonl'), filePath, mtimeMs: stat.mtimeMs })
      } catch { /* file vanished mid-scan */ }
    }
  }
  found.sort((a, b) => b.mtimeMs - a.mtimeMs)
  // Read labels/projects only for the entries we actually return
  return found.slice(0, HISTORY_LIMIT).map(s => ({
    id: s.id,
    project: readProjectName(s.filePath),
    label: readSessionLabel(s.filePath),
    mtimeMs: s.mtimeMs,
    watched: sessions.has(s.id),
  }))
}

/** Attach a past session for replay via the normal watch machinery.
 *  Stale sessions are immediately marked completed so tabs don't lie. */
function replaySession(id: string): { ok: boolean; error?: string } {
  if (!/^[\w-]+$/.test(id)) return { ok: false, error: 'invalid session id' }
  if (sessions.has(id)) return { ok: true } // already live or replayed
  if (!fs.existsSync(CLAUDE_DIR)) return { ok: false, error: 'no projects dir' }

  let filePath: string | null = null
  try {
    for (const dir of fs.readdirSync(CLAUDE_DIR, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue
      const candidate = path.join(CLAUDE_DIR, dir.name, `${id}.jsonl`)
      if (fs.existsSync(candidate)) { filePath = candidate; break }
    }
  } catch { /* fall through to not-found */ }
  if (!filePath) return { ok: false, error: 'session not found' }

  const stat = fs.statSync(filePath)
  watchSession(id, filePath)

  const isStale = (Date.now() - stat.mtimeMs) / 1000 > ACTIVE_SESSION_AGE_S
  if (isStale) {
    const session = sessions.get(id)
    if (session) {
      session.sessionCompleted = true
      if (session.inactivityTimer) { clearTimeout(session.inactivityTimer); session.inactivityTimer = null }
      broadcastEvent({
        time: elapsed(id), type: 'agent_complete',
        payload: { name: ORCHESTRATOR_NAME }, sessionId: id,
      })
      broadcastSessionLifecycle('ended', id, session.label, session.project)
    }
  }
  return { ok: true }
}

// ─── Discovery file ─────────────────────────────────────────────────────────

function normalizePath(p: string): string {
  let resolved = path.resolve(p)
  try { resolved = fs.realpathSync(resolved) } catch {}
  return resolved
}

function hashWorkspace(workspace: string): string {
  return crypto.createHash('sha256').update(normalizePath(workspace)).digest('hex').slice(0, WORKSPACE_HASH_LENGTH)
}

let discoveryFilePath: string | null = null

function writeDiscoveryFile(port: number, workspace: string) {
  if (!fs.existsSync(DISCOVERY_DIR)) fs.mkdirSync(DISCOVERY_DIR, { recursive: true })
  // '*' is a literal match-all sentinel for the hook forwarder — never path-resolve it
  const wsOut = watchAll ? '*' : normalizePath(workspace)
  const hash = crypto.createHash('sha256').update(wsOut).digest('hex').slice(0, WORKSPACE_HASH_LENGTH)
  discoveryFilePath = path.join(DISCOVERY_DIR, `${hash}-${process.pid}.json`)
  fs.writeFileSync(discoveryFilePath, JSON.stringify({ port, pid: process.pid, workspace: wsOut }, null, 2) + '\n')
}

function removeDiscoveryFile() {
  if (discoveryFilePath) {
    try { fs.unlinkSync(discoveryFilePath) } catch {}
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface Relay {
  /** Handle an incoming SSE connection */
  handleSSE: (req: http.IncomingMessage, res: http.ServerResponse) => void
  /** List every transcript on disk (any project, any age), newest first */
  listHistory: () => HistorySession[]
  /** Attach a past session for replay; broadcasts its full event history */
  replaySession: (id: string) => { ok: boolean; error?: string }
  /** Clean up all resources */
  dispose: () => void
}

export type RelayRuntimeMode = 'claude' | 'codex' | 'auto'

export interface RelayOptions {
  workspace: string
  verbose?: boolean
  /** Which runtimes to watch. Defaults to KIRAMEKI_RUNTIME env var, or 'auto'.
   *  Mirrors the extension's `kirameki.runtime` setting so users of the
   *  dev relay and `npx kirameki-app` have a way to opt out of one runtime. */
  runtime?: RelayRuntimeMode
}

function resolveRuntimeMode(explicit?: RelayRuntimeMode): RelayRuntimeMode {
  if (explicit === 'claude' || explicit === 'codex' || explicit === 'auto') return explicit
  const raw = process.env.KIRAMEKI_RUNTIME
  return raw === 'claude' || raw === 'codex' ? raw : 'auto'
}

export async function createRelay(options: RelayOptions): Promise<Relay> {
  const { workspace } = options
  verbose = options.verbose ?? false
  watchAll = workspace === '*'
  if (!verbose) setLogLevel('error')
  if (relayCreated) {
    throw new Error('createRelay() can only be called once per process')
  }
  relayCreated = true
  if (watchAll) log('[relay] Mission control: watching ALL workspaces under ~/.claude/projects')

  const mode = resolveRuntimeMode(options.runtime)
  const wantClaude = mode === 'claude' || mode === 'auto'
  const wantCodex = mode === 'codex' || mode === 'auto'
  log(`[relay] Runtime mode: ${mode} (watching: ${[wantClaude && 'claude', wantCodex && 'codex'].filter(Boolean).join(', ')})`)

  let hookServer: HookServer | null = null
  let scanInterval: NodeJS.Timeout | null = null
  let projectDirWatcher: fs.FSWatcher | null = null

  if (wantClaude) {
    hookServer = new HookServer()
    const hookPort = await hookServer.start()
    if (hookPort === HOOK_SERVER_NOT_STARTED) {
      throw new Error('Failed to start hook server (port in use)')
    }

    hookServer.onEvent((event: AgentEvent) => {
      broadcast(JSON.stringify({ type: 'agent-event', event }))
    })

    writeDiscoveryFile(hookPort, workspace)

    scanForActiveSessions(workspace)
    scanInterval = setInterval(() => scanForActiveSessions(workspace), SCAN_INTERVAL_MS)

    if (watchAll) {
      // Watch the projects root — new project dirs appear when a session
      // starts in a never-before-seen workspace. Per-file changes inside
      // existing dirs are covered by the 1s scan interval.
      if (fs.existsSync(CLAUDE_DIR)) {
        try {
          projectDirWatcher = fs.watch(CLAUDE_DIR, () => scanForActiveSessions(workspace))
        } catch {}
      }
    } else {
      const resolved = (() => { try { return fs.realpathSync(workspace) } catch { return workspace } })()
      const encoded = resolved.replace(/[^a-zA-Z0-9]/g, '-')
      const projectDir = path.join(CLAUDE_DIR, encoded)
      if (fs.existsSync(projectDir)) {
        try {
          projectDirWatcher = fs.watch(projectDir, (_eventType, filename) => {
            if (filename?.endsWith('.jsonl')) scanForActiveSessions(workspace)
          })
        } catch {}
      }
    }
  }

  // ─── Codex runtime ────────────────────────────────────────────────────────
  // Watch Codex rollouts in parallel. No-op if ~/.codex/sessions doesn't
  // exist or no sessions match the current workspace.
  // We don't subscribe to onSessionDetected — it fires together with the
  // lifecycle 'started' event in CodexSessionWatcher.attachSession, so
  // wiring both would double-broadcast session-started to SSE clients.
  let codexWatcher: CodexSessionWatcher | null = null
  if (wantCodex) {
    codexWatcher = new CodexSessionWatcher(workspace)
    codexWatcher.onEvent((event) => broadcastEvent(event))
    codexWatcher.onSessionLifecycle((lifecycle) => {
      broadcastSessionLifecycle(lifecycle.type, lifecycle.sessionId, lifecycle.label)
    })
    codexWatcher.start()
  }

  let relayDisposed = false

  return {
    listHistory: listHistorySessions,
    replaySession,

    handleSSE(req: http.IncomingMessage, res: http.ServerResponse) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      })

      sseClients.add(res)
      log(`[sse] Client connected (${sseClients.size} total)`)

      req.on('close', () => {
        sseClients.delete(res)
        log(`[sse] Client disconnected (${sseClients.size} total)`)
      })

      // Send current session list (Claude + Codex)
      const sessionList: SessionInfo[] = []
      for (const session of sessions.values()) {
        if (!session.sessionDetected) continue
        sessionList.push({
          id: session.sessionId, label: session.label,
          status: session.sessionCompleted ? 'completed' : 'active',
          startTime: session.sessionStartTime, lastActivityTime: session.lastActivityTime,
          ...(session.project ? { project: session.project } : {}),
        })
      }
      if (codexWatcher) sessionList.push(...codexWatcher.getActiveSessions())
      if (sessionList.length > 0) {
        sendSSE(res, { type: 'session-list', sessions: sessionList })
      }

      // Replay buffered events for the most recent active session
      const sorted = [...sessionList].sort((a, b) => {
        const aActive = a.status === 'active' ? 1 : 0
        const bActive = b.status === 'active' ? 1 : 0
        if (aActive !== bActive) return bActive - aActive
        return b.lastActivityTime - a.lastActivityTime
      })
      if (sorted.length > 0) {
        const buffered = eventBuffer.get(sorted[0].id)
        if (buffered) {
          sendSSE(res, { type: 'agent-event-batch', events: buffered })
        }
      }
    },

    dispose() {
      // Defense in depth — server.ts already guards cleanup(), but direct
      // callers or hot-reload could call this twice.
      if (relayDisposed) return
      relayDisposed = true
      if (wantClaude) {
        removeDiscoveryFile()
        hookServer?.dispose()
        if (scanInterval) clearInterval(scanInterval)
        projectDirWatcher?.close()
        for (const session of sessions.values()) {
          session.fileWatcher?.close()
          if (session.pollTimer) clearInterval(session.pollTimer)
          if (session.inactivityTimer) clearTimeout(session.inactivityTimer)
        }
      }
      codexWatcher?.dispose()
    },
  }
}
