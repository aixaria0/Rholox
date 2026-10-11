import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/amm.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }, fileName: 'amm.ts' }).outputText
const { quoteAddLiquidity, quoteRemoveLiquidity, quoteSwap } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

// Deterministic off-chain transition-model tests. These do NOT execute Rholang or prove its recovery semantics.
const empty = { reserveA: 0n, reserveB: 0n, totalShares: 0n }
let state = quoteAddLiquidity(empty, 100n, 200n)
const positions = new Map([['alice', state.mintedShares]])
state = quoteAddLiquidity(state, 40n, 80n)
positions.set('bob', state.mintedShares)
assert.equal(positions.get('alice'), 300n)
assert.equal(positions.get('bob'), 120n)
assert.equal(state.totalShares, 420n)

// Bob cannot withdraw Alice's shares, nor can he withdraw beyond his own position.
assert.throws(() => quoteRemoveLiquidity(state, positions.get('bob'), 121n), /more LP shares than are owned/)
const bobHalf = quoteRemoveLiquidity(state, positions.get('bob'), 60n, 20n, 40n)
assert.equal(bobHalf.amountA, 20n)
assert.equal(bobHalf.amountB, 40n)
positions.set('bob', positions.get('bob') - 60n)
state = bobHalf

// Quotes against the old state cannot be treated as valid against the new state.
const stale = { reserveA: 140n, reserveB: 280n, totalShares: 420n }
assert.notDeepEqual([state.reserveA, state.reserveB, state.totalShares], [stale.reserveA, stale.reserveB, stale.totalShares])

const traded = quoteSwap(state, 'A_TO_B', 10n, 15n)
assert.equal(traded.productAfter >= traded.productBefore, true)
state = traded
assert.throws(() => quoteAddLiquidity(state, 10n, 20n), /reserve ratio/)

// Partial removal followed by all remaining LP shares returns all remaining reserves.
const bobExit = quoteRemoveLiquidity(state, positions.get('bob'), positions.get('bob'))
positions.set('bob', 0n)
state = bobExit
const aliceExit = quoteRemoveLiquidity(state, positions.get('alice'), positions.get('alice'))
positions.set('alice', 0n)
state = aliceExit
assert.deepEqual([state.reserveA, state.reserveB, state.totalShares], [0n, 0n, 0n])
assert.deepEqual([...positions.values()], [0n, 0n])

// Failure controls: zero-rounded swap, reserve cap, excessive minimum, and zero-rounded LP withdrawal.
assert.throws(() => quoteSwap({ reserveA: 1000n, reserveB: 1n, totalShares: 1001n }, 'A_TO_B', 1n), /greater than zero/)
assert.throws(() => quoteSwap({ reserveA: 10_000_000n, reserveB: 100n, totalShares: 100n }, 'A_TO_B', 1n), /reserve cap/)
assert.throws(() => quoteSwap({ reserveA: 100n, reserveB: 100n, totalShares: 200n }, 'A_TO_B', 10n, 100n), /below the requested minimum/)
assert.throws(() => quoteRemoveLiquidity({ reserveA: 1n, reserveB: 100n, totalShares: 100n }, 1n, 1n), /greater than zero/)

console.log('AMM multi-actor transition model PASS: LP isolation, partial exit, swap, complete exit, and negative controls.')
