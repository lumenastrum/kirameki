/**
 * Combined HTTP server: serves the visualizer UI and streams events via SSE.
 * Reuses the extension's hook server, transcript parser, and session watcher.
 */
import * as http from 'http'
import { exec, execFile } from 'child_process'

import { createRelay } from '../../scripts/relay'
import { serveStatic } from './static'

interface ServerOptions {
  port: number
  openBrowser: boolean
  workspace: string
  verbose?: boolean
}

export async function startServer(options: ServerOptions) {
  const { port, openBrowser, workspace } = options

  const relay = await createRelay({ workspace, verbose: options.verbose })

  const server = http.createServer((req, res) => {
    // SSE endpoint
    if (req.url === '/events') {
      return relay.handleSSE(req, res)
    }

    // Session history (time machine)
    if (req.url === '/sessions/history') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(relay.listHistory()))
      return
    }
    if (req.url?.startsWith('/sessions/replay')) {
      const id = new URL(req.url, 'http://localhost').searchParams.get('id') || ''
      const result = relay.replaySession(id)
      res.writeHead(result.ok ? 200 : 404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result))
      return
    }

    // Static files (UI)
    if (req.method === 'GET') {
      return serveStatic(req, res)
    }

    res.writeHead(404)
    res.end('Not found')
  })

  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}`
    console.log(`Server running at ${url}`)
    console.log('Waiting for agent events...\n')

    if (openBrowser) {
      openURL(url)
    }
  })

  // Cleanup on exit. Idempotent — repeat signals (Ctrl+C spam, SIGTERM+SIGHUP,
  // etc.) would otherwise double-dispose the relay.
  let shuttingDown = false
  function cleanup() {
    if (shuttingDown) return
    shuttingDown = true
    server.close()
    relay.dispose()
    process.exit(0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  // SIGHUP fires when the controlling terminal closes (SSH session drops, tmux
  // pane killed). Without a handler, Node's default behavior is to terminate
  // without running cleanup.
  process.on('SIGHUP', cleanup)
}

function openURL(url: string) {
  if (process.platform === 'win32') {
    // 'start' is a shell builtin on Windows — must use exec, not execFile
    exec(`start "" "${url}"`)
  } else {
    const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open'
    execFile(cmd, [url], () => {})
  }
}
