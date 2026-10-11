import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/amm.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  fileName: 'amm.ts',
}).outputText
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
const { POOL_MAX_RESERVE_UNITS, quoteAddLiquidity, quoteRemoveLiquidity, quoteSwap } = await import(moduleUrl)

function rejects(fn, pattern) {
  assert.throws(fn, pattern)
}

const empty = { reserveA: 0n, reserveB: 0n, totalShares: 0n }
const seeded = quoteAddLiquidity(empty, 2n, 3n)
assert.deepEqual(seeded, { reserveA: 2n, reserveB: 3n, totalShares: 5n, mintedShares: 5n })

const topped = quoteAddLiquidity(seeded, 4n, 6n, 10n)
assert.deepEqual(topped, { reserveA: 6n, reserveB: 9n, totalShares: 15n, mintedShares: 10n })
rejects(() => quoteAddLiquidity(seeded, 4n, 5n), /preserve the current reserve ratio/)
rejects(() => quoteAddLiquidity(empty, 1n, 1n, 3n), /below the requested minimum/)
rejects(() => quoteAddLiquidity(empty, 0n, 1n), /greater than zero/)
rejects(() => quoteAddLiquidity(empty, POOL_MAX_RESERVE_UNITS + 1n, 1n), /reserve cap/)

const partial = quoteRemoveLiquidity(topped, 10n, 5n)
assert.deepEqual(partial, { reserveA: 4n, reserveB: 6n, totalShares: 10n, amountA: 2n, amountB: 3n })
rejects(() => quoteRemoveLiquidity(topped, 4n, 5n), /more LP shares than are owned/)
rejects(() => quoteRemoveLiquidity(topped, 15n, 5n, 3n, 0n), /below the requested minimum/)

const drained = quoteRemoveLiquidity(topped, 15n, 15n)
assert.deepEqual(drained, { reserveA: 0n, reserveB: 0n, totalShares: 0n, amountA: 6n, amountB: 9n })

const swapAB = quoteSwap(topped, 'A_TO_B', 1n, 1n)
assert.equal(swapAB.amountOut, 1n)
assert.equal(swapAB.reserveA, 7n)
assert.equal(swapAB.reserveB, 8n)
assert.ok(swapAB.productAfter >= swapAB.productBefore)
rejects(() => quoteSwap(topped, 'A_TO_B', 1n, 2n), /below the requested minimum/)
rejects(() => quoteSwap({ reserveA: 1n, reserveB: 1n, totalShares: 2n }, 'A_TO_B', 1n), /greater than zero/)
rejects(() => quoteSwap({ reserveA: POOL_MAX_RESERVE_UNITS, reserveB: 2n, totalShares: 2n }, 'A_TO_B', 1n), /reserve cap/)

let acceptedQuotes = 0
for (let reserveA = 1n; reserveA <= 40n; reserveA += 1n) {
  for (let reserveB = 1n; reserveB <= 40n; reserveB += 1n) {
    const state = { reserveA, reserveB, totalShares: reserveA + reserveB }
    for (let amountIn = 1n; amountIn <= 40n; amountIn += 1n) {
      for (const direction of ['A_TO_B', 'B_TO_A']) {
        try {
          const quote = quoteSwap(state, direction, amountIn)
          assert.ok(quote.amountOut > 0n)
          assert.ok(quote.reserveA > 0n)
          assert.ok(quote.reserveB > 0n)
          assert.ok(quote.productAfter >= quote.productBefore)
          acceptedQuotes += 1
        } catch (error) {
          assert.match(String(error), /Swap output must be greater than zero|reserve cap/)
        }
      }
    }
  }
}

assert.ok(acceptedQuotes > 100_000, 'property sweep must exercise a substantial accepted quote set')
console.log(`AMM math verification passed (${acceptedQuotes} accepted swap quotes).`)
