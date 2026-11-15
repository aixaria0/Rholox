import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const content = readFileSync(new URL('../src/lib/observer-capture.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(content, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const src = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64')
const { createObserverCapture, CAPTURE_SCHEMA, OBSERVER_SOURCE } = await import(src)
const mock = {
  schema_version: 1,
  observed_at_ms: 1794769776653,
  completed_at_ms: 1794769776746,
  duration_ms: 93,
  heights: { reachable_nodes: 2, latest_min: 1178, latest_max: 1178, finalized_min: 1174, finalized_max: 1174 },
  observations: [
    { node: 'A', reachable: true, network_id: 'testnet', shard_id: '/testnet', latest_block: 1178, finalized_block: 1174, finalized_hash: 'a'.repeat(64), error: null },
    { node: 'B', reachable: true, network_id: 'testnet', shard_id: '/testnet', latest_block: 1178, finalized_block: 1174, finalized_hash: 'a'.repeat(64), error: null },
  ],
  ancestry_checks: [],
  verdict: { class: 'agreement', observed_nodes: 2, comparable_nodes: 2, agreeing_nodes: 2,
    summary: '2/2', reference: { network_id: 'testnet', shard_id: '/testnet', block_number: 1174, block_hash: 'a'.repeat(64) } },
}
const first = await createObserverCapture(mock, 1794769777500)
const again = await createObserverCapture(mock, 1794769777500)
assert.deepEqual(first, again)
assert.equal(first.schema, CAPTURE_SCHEMA)
assert.equal(first.source_uri, OBSERVER_SOURCE)
assert.equal(first.evidence_type, 'parsed-observer-report')
assert.equal(first.signature, null)
assert.deepEqual(JSON.parse(first.report_text), mock)
const computed = createHash('sha256').update(Buffer.from(first.report_text,'utf8')).digest('hex')
assert.equal(first.report_sha256, computed)
assert.match(first.report_sha256, /^[0-9a-f]{64}$/)
assert.notEqual(first.report_sha256,createHash('sha256').update(first.report_text+' ').digest('hex'))
await assert.rejects(() => createObserverCapture(mock,-1),/Invalid capture timestamp/)
console.log('PASS observer-capture: deterministic serialization, source binding, SHA-256, unsigned boundary, tamper rejection')
