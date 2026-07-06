import test from 'node:test'
import assert from 'node:assert/strict'
import { parseArgs } from './args'
import { DEFAULT_RELAY_PORT } from '../../extension/src/constants'

test('parseArgs reads defaults', () => {
  const args = parseArgs([])
  assert.equal(args.port, DEFAULT_RELAY_PORT)
  assert.equal(args.open, true)
  assert.equal(args.verbose, false)
  assert.equal(args.workspace, process.env.KIRAMEKI_WORKSPACE || '')
})

test('parseArgs reads workspace option', () => {
  const args = parseArgs(['--workspace', 'C:\\Users\\me\\project'])
  assert.equal(args.workspace, 'C:\\Users\\me\\project')
})

test('parseArgs reads short workspace option', () => {
  const args = parseArgs(['-w', '/tmp/project'])
  assert.equal(args.workspace, '/tmp/project')
})
