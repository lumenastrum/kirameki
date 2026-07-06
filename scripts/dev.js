#!/usr/bin/env node
/**
 * Cross-platform dev runner for the relay + Next.js web app.
 *
 * Usage:
 *   pnpm run dev -- --workspace "C:\path\to\project" --web-port 3333
 */
'use strict'

const { spawn, spawnSync } = require('child_process')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DEFAULT_RELAY_PORT = '3001'
const DEFAULT_WEB_PORT = '3333'

function parseArgs(argv) {
  let workspace = process.env.KIRAMEKI_WORKSPACE || ''
  let webPort = process.env.KIRAMEKI_WEB_PORT || DEFAULT_WEB_PORT
  const passthrough = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--') {
      continue
    } else if ((arg === '--workspace' || arg === '-w') && argv[i + 1]) {
      workspace = argv[i + 1]
      i++
    } else if ((arg === '--web-port' || arg === '--ui-port') && argv[i + 1]) {
      webPort = argv[i + 1]
      i++
    } else {
      passthrough.push(arg)
    }
  }

  return { workspace, webPort, passthrough }
}

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    ...options,
  })
}

function packageManagerCommand() {
  const npmExecPath = process.env.npm_execpath || ''
  if (npmExecPath.toLowerCase().includes('pnpm')) {
    return { command: process.execPath, args: [npmExecPath] }
  }
  return { command: 'corepack', args: ['pnpm'] }
}

const { workspace, webPort, passthrough } = parseArgs(process.argv.slice(2))
const env = {
  ...process.env,
  NEXT_PUBLIC_DEMO: '0',
  NEXT_PUBLIC_RELAY_PORT: process.env.NEXT_PUBLIC_RELAY_PORT || DEFAULT_RELAY_PORT,
  KIRAMEKI_WEB_PORT: webPort,
  ...(workspace ? { KIRAMEKI_WORKSPACE: workspace } : {}),
}

const build = spawnSync(process.execPath, [path.join(__dirname, 'build-relay.js')], {
  cwd: ROOT,
  stdio: 'inherit',
  env,
})

if (build.status !== 0) {
  process.exit(build.status || 1)
}

const relayArgs = [path.join(__dirname, '.dev-relay.js')]
if (workspace) relayArgs.push(workspace)

const packageManager = packageManagerCommand()
const relay = run(process.execPath, relayArgs, { env })
const web = run(packageManager.command, [
  ...packageManager.args,
  '--filter', 'kirameki-web',
  'run', 'dev',
  '--port', webPort,
  ...passthrough,
], { env })

let shuttingDown = false
function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of [relay, web]) {
    if (!child.killed) child.kill()
  }
  process.exit(code)
}

relay.on('exit', code => shutdown(code || 0))
web.on('exit', code => shutdown(code || 0))
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
