import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function compile(file) {
  return ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText
}
const uri = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const observerUri = uri(compile('../src/lib/observer.ts'))
const { parseObserverReport, evidenceState } = await import(observerUri)
const now = 1_792_696_000_000
const hash = 'a'.repeat(64),
  highHash = 'b'.repeat(64)
const identity = (height = 8, blockHash = hash) => ({
  network_id: 'testnet',
  shard_id: '/root',
  block_number: height,
  block_hash: blockHash,
})
const node = (name) => ({
  node: name,
  reachable: true,
  network_id: 'testnet',
  shard_id: '/root',
  latest_block: 10,
  finalized_block: 8,
  finalized_hash: hash,
  error: null,
})
const base = () => ({
  observed_at_ms: now - 1000,
  heights: {
    reachable_nodes: 2,
    latest_min: 10,
    latest_max: 10,
    finalized_min: 8,
    finalized_max: 8,
  },
  observations: [node('A'), node('B')],
  ancestry_checks: [],
  verdict: {
    class: 'agreement',
    observed_nodes: 2,
    comparable_nodes: 2,
    agreeing_nodes: 2,
    summary: '2/2 comparable nodes agree',
    reference: identity(),
  },
})
let count = 0
const test = (name, fn) => {
  fn()
  count += 1
  console.log(`PASS ${name}`)
}

test('accepts the legacy schema and a canonical matching snapshot', () => {
  const report = parseObserverReport(base())
  assert.equal(evidenceState(report, null, now).tone, 'good')
})
test('accepts additive sampling metadata and normalizes hex case', () => {
  const input = base()
  input.schema_version = 1
  input.duration_ms = 3
  input.completed_at_ms = input.observed_at_ms + 3
  input.observations[1].finalized_hash = hash.toUpperCase()
  assert.equal(parseObserverReport(input).observations[1].finalized_hash, hash)
})
for (const [name, mutate] of [
  [
    'unknown schema',
    (r) => {
      r.schema_version = 2
    },
  ],
  [
    'unknown verdict',
    (r) => {
      r.verdict.class = 'trusted'
    },
  ],
  [
    'empty report',
    (r) => {
      r.observations = []
    },
  ],
  [
    'duplicate sources',
    (r) => {
      r.observations[1].node = 'A'
    },
  ],
  [
    'inflated coverage',
    (r) => {
      r.verdict.comparable_nodes = 3
    },
  ],
  [
    'inflated agreement',
    (r) => {
      r.verdict.agreeing_nodes = 3
    },
  ],
  [
    'incorrect reachability summary',
    (r) => {
      r.heights.reachable_nodes = 1
    },
  ],
  [
    'incorrect height summary',
    (r) => {
      r.heights.finalized_min = 7
    },
  ],
  [
    'fabricated reference',
    (r) => {
      r.verdict.reference.block_hash = highHash
    },
  ],
  [
    'false agreement over conflicting hashes',
    (r) => {
      r.observations[1].finalized_hash = highHash
      r.verdict.agreeing_nodes = 1
    },
  ],
  [
    'blank network identity',
    (r) => {
      r.observations[1].network_id = ' '
      r.verdict.comparable_nodes = 1
    },
  ],
  [
    'unsafe integer height',
    (r) => {
      r.observations[0].finalized_block = Number.MAX_SAFE_INTEGER + 1
    },
  ],
  [
    'invalid timestamp',
    (r) => {
      r.observed_at_ms = Number.MAX_SAFE_INTEGER
    },
  ],
])
  test(`rejects ${name}`, () => {
    const r = base()
    mutate(r)
    assert.throws(() => parseObserverReport(r), /Invalid observer evidence/)
  })

test('freshness expires at the exact 30-second boundary', () => {
  const r = parseObserverReport(base())
  assert.equal(evidenceState(r, null, r.observed_at_ms + 29_999).tone, 'good')
  assert.equal(evidenceState(r, null, r.observed_at_ms + 30_000).label, 'Stale evidence')
  assert.equal(evidenceState(r, 'request failed', now).label, 'Stale evidence')
  assert.equal(evidenceState(r, null, r.observed_at_ms - 5001).label, 'Clock mismatch')
})
test('a singleton cannot produce a full-coverage positive state', () => {
  const r = base()
  r.observations.pop()
  r.heights.reachable_nodes = 1
  Object.assign(r.verdict, { observed_nodes: 1, comparable_nodes: 1, agreeing_nodes: 1 })
  assert.equal(evidenceState(parseObserverReport(r), null, now).label, 'Limited coverage')
})
test('unreachable source stays visible and suppresses a positive state', () => {
  const r = base()
  r.observations[1] = {
    node: 'B',
    reachable: false,
    network_id: null,
    shard_id: null,
    latest_block: null,
    finalized_block: null,
    finalized_hash: null,
    error: 'timeout',
  }
  r.heights.reachable_nodes = 1
  Object.assign(r.verdict, { comparable_nodes: 1, agreeing_nodes: 1 })
  assert.equal(evidenceState(parseObserverReport(r), null, now).tone, 'warning')
})
function skew() {
  const r = base()
  r.observations[1].finalized_block = 9
  r.observations[1].finalized_hash = highHash
  r.heights.finalized_max = 9
  Object.assign(r.verdict, {
    class: 'height_skew',
    agreeing_nodes: 1,
    reference: identity(9, highHash),
  })
  return r
}
function check(kind) {
  return {
    class: kind,
    lower: identity(),
    higher: identity(9, highHash),
    witness_node: 'B',
    examined_blocks: 2,
    cryptographically_verified_blocks: 2,
    path: kind === 'proven_lag' ? [highHash, hash] : [],
    reason: 'Bounded raw ancestry check.',
  }
}
test('height ordering alone cannot claim proven ancestry', () => {
  const r = skew()
  assert.equal(parseObserverReport(r).verdict.class, 'height_skew')
  r.verdict.class = 'proven_lag'
  assert.throws(() => parseObserverReport(r))
})
test('proven lag retains its path and an explicit lag status', () => {
  const r = skew()
  r.verdict.class = 'proven_lag'
  r.ancestry_checks = [check('proven_lag')]
  assert.equal(
    evidenceState(parseObserverReport(r), null, now).label,
    'Ancestry connected · lag observed',
  )
  r.ancestry_checks[0].cryptographically_verified_blocks = 0
  assert.throws(() => parseObserverReport(r))
})
test('non-connection evidence produces a conflict status', () => {
  const r = skew()
  r.verdict.class = 'conflicting_finalized_history'
  r.ancestry_checks = [check('conflicting_finalized_history')]
  assert.equal(evidenceState(parseObserverReport(r), null, now).tone, 'danger')
})
test('unresolved ancestry is never upgraded', () => {
  const r = skew()
  r.ancestry_checks = [check('unresolved_height_skew')]
  assert.equal(parseObserverReport(r).verdict.class, 'height_skew')
})

// Exercise actual transport code with deterministic fetch responses and abort delivery.
globalThis.window = { setTimeout, clearTimeout }
const network = await import(
  uri(compile('../src/lib/rchain.ts').replace("'./observer'", JSON.stringify(observerUri)))
)
const realFetch = globalThis.fetch
try {
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.redirect, 'error')
    assert.equal(init.credentials, 'omit')
    return new Response(JSON.stringify(base()))
  }
  assert.equal((await network.getObserverObservation()).verdict.class, 'agreement')
  count += 1
  globalThis.fetch = async (_url, init) => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{'))
        init.signal.addEventListener('abort', () =>
          controller.error(new DOMException('aborted', 'AbortError')),
        )
      },
    })
    return new Response(stream)
  }
  const stalled = await network.fetchWithTimeout('https://example.invalid', {}, 25)
  await assert.rejects(
    Promise.race([
      stalled.text(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('body deadline failed')), 500)),
    ]),
    /timed out/,
  )
  count += 1
  console.log('PASS deadline covers a stalled response body')
  const abort = new AbortController()
  const response = await network.fetchWithTimeout(
    'https://example.invalid',
    { signal: abort.signal },
    500,
  )
  abort.abort()
  await assert.rejects(response.text(), /aborted/)
  count += 1
  console.log('PASS caller cancellation reaches the body')
  globalThis.fetch = async () => new Response(new Uint8Array(8 * 1024 * 1024 + 1))
  const oversized = await network.fetchWithTimeout('https://example.invalid', {}, 500)
  await assert.rejects(oversized.text(), /8 MiB/)
  count += 1
  console.log('PASS response body size is bounded')
  globalThis.fetch = async () =>
    new Response('{"networkId":"testnet","shardId":"/root","latestBlockNumber":"not-a-number"}')
  await assert.rejects(network.getJson('/api/status'), /invalid observation/)
  count += 1
  globalThis.fetch = async () =>
    new Response('{"blockInfo":{"blockHash":"bad","blockNumber":10,"bonds":{}}}')
  await assert.rejects(network.getJson('/api/last-finalized-block'), /invalid observation/)
  count += 1
  console.log('PASS malformed direct-node observations are rejected')
} finally {
  globalThis.fetch = realFetch
}
console.log(`Observer and transport verification passed (${count} checks).`)
