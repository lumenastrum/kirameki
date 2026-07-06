#!/usr/bin/env node
/**
 * Cross-platform wrapper for starting only the Next.js web app.
 */
'use strict'

const { spawn } = require('child_process')
const path = require('path')

const args = process.argv.slice(2)
const demo = args.includes('--demo')
const DEFAULT_WEB_PORT = '3333'

function parseArgs(argv) {
  let webPort = process.env.KIRAMEKI_WEB_PORT || DEFAULT_WEB_PORT
  const passthrough = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--demo' || arg === '--') {
      continue
    } else if ((arg === '--web-port' || arg === '--ui-port') && argv[i + 1]) {
      webPort = argv[i + 1]
      i++
    } else {
      passthrough.push(arg)
    }
  }

  return { webPort, passthrough }
}

function packageManagerCommand() {
  const npmExecPath = process.env.npm_execpath || ''
  if (npmExecPath.toLowerCase().includes('pnpm')) {
    return { command: process.execPath, args: [npmExecPath] }
  }
  return { command: 'corepack', args: ['pnpm'] }
}

const packageManager = packageManagerCommand()
const { webPort, passthrough } = parseArgs(args)
const child = spawn(packageManager.command, [
  ...packageManager.args,
  '--filter', 'kirameki-web',
  'run', 'dev',
  '--port', webPort,
  ...passthrough,
], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_PUBLIC_DEMO: demo ? '1' : (process.env.NEXT_PUBLIC_DEMO || '0'),
    NEXT_PUBLIC_RELAY_PORT: process.env.NEXT_PUBLIC_RELAY_PORT || '3001',
    KIRAMEKI_WEB_PORT: webPort,
  },
})

child.on('exit', code => process.exit(code || 0))
