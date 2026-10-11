import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Static source contract: confirms failure/recovery branches remain wired.
// Does NOT execute Rholang or prove compensation succeeds on-chain.
const source = readFileSync(new URL('../src/lib/exchange.ts', import.meta.url), 'utf8')
const cases = [
  ['addCore', 'removeCore', 'second asset deposit failed; first deposit rolled back', 'second asset deposit failed and rollback failed', 'assetAService!("withdrawFrom"'],
  ['removeCore', 'swapAtoB', 'second asset withdrawal failed; first withdrawal rolled back', 'second asset withdrawal failed and rollback failed', 'assetAService!(*_id, "depositInto"'],
  ['swapAtoB', 'swapBtoA', 'swap output withdrawal failed; input rolled back', 'swap output withdrawal failed and input rollback failed', 'assetAService!("withdrawFrom"'],
  ['swapBtoA', 'contract poolService(@"info"', 'swap output withdrawal failed; input rolled back', 'swap output withdrawal failed and input rollback failed', 'assetBService!("withdrawFrom"'],
]
for (const [start, end, compensated, fatal, inverse] of cases) {
  const begin = source.indexOf(`contract ${start}(`)
  const finish = source.indexOf(end.startsWith('contract ') ? end : `contract ${end}(`, begin + 1)
  assert.ok(begin >= 0 && finish > begin, `${start}: recovery block boundaries not found`)
  const block = source.slice(begin, finish)
  assert.ok(block.includes(inverse), `${start}: inverse compensation call missing`)
  assert.ok(block.includes(compensated), `${start}: compensated-failure receipt missing`)
  assert.ok(block.includes(fatal), `${start}: failed-compensation receipt missing`)
  assert.match(block, /if \(rolledBack\)/, `${start}: compensation result not checked`)
  assert.match(block, /stateCh!\(\(reserveA, reserveB, totalShares, positions\)\)/, `${start}: old state restoration missing`)
}
for (const verb of ['addLiquidity', 'removeLiquidity', 'swap']) {
  const start = source.indexOf(`@"${verb}"`)
  assert.ok(start >= 0, `${verb}: entrypoint missing`)
  const guard = source.slice(start, start + 1200)
  assert.match(guard, /custody balance mismatch/, `${verb}: fail-closed custody guard missing`)
  assert.match(guard, /stale pool state/, `${verb}: expected-state guard missing`)
}
console.log('Exchange recovery source contract PASS (4 compensation paths, 3 custody/stale guards). STATIC ONLY.')
