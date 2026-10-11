import React, { useEffect, useMemo, useState } from 'react'
import { formatAssetUnits, parseAssetUnits, readAssetBalance, readAssetInfo, type AssetInfo } from './lib/asset'
import {
  addLiquidity,
  createPool,
  readPoolInfo,
  readPoolPosition,
  removeLiquidity,
  swap,
  type LiquidityAddReceipt,
  type LiquidityRemoveReceipt,
  type PoolCreateReceipt,
  type PoolInfo,
  type SwapReceipt,
} from './lib/exchange'
import { quoteSwap, type SwapDirection } from './lib/amm'
import type { RholoxWallet } from './lib/wallet'

type Props = {
  wallet: RholoxWallet | null
  onRevBalance?: () => Promise<void>
}

type OperationReceipt = PoolCreateReceipt | LiquidityAddReceipt | LiquidityRemoveReceipt | SwapReceipt

function short(value?: string, left = 12, right = 10) {
  if (!value) return '—'
  if (value.length <= left + right + 1) return value
  return `${value.slice(0, left)}…${value.slice(-right)}`
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

function units(value: string, asset: AssetInfo): bigint {
  return BigInt(parseAssetUnits(value, asset.decimals))
}

function optionalUnits(value: string, asset: AssetInfo): bigint {
  const clean = value.trim()
  if (!clean || /^0(?:\.0+)?$/.test(clean)) return 0n
  return units(clean, asset)
}

function displayUnits(value: bigint, asset: AssetInfo): string {
  return formatAssetUnits(Number(value), asset.decimals)
}

export default function ExchangePanel({ wallet, onRevBalance }: Props) {
  const [assetAInput, setAssetAInput] = useState('')
  const [assetBInput, setAssetBInput] = useState('')
  const [poolIdInput, setPoolIdInput] = useState('')
  const [pool, setPool] = useState<PoolInfo | null>(null)
  const [observedBlock, setObservedBlock] = useState<number | null>(null)
  const [position, setPosition] = useState<bigint | null>(null)
  const [walletA, setWalletA] = useState<number | null>(null)
  const [walletB, setWalletB] = useState<number | null>(null)
  const [addA, setAddA] = useState('100')
  const [addB, setAddB] = useState('200')
  const [minShares, setMinShares] = useState('0')
  const [swapDirection, setSwapDirection] = useState<SwapDirection>('A_TO_B')
  const [swapIn, setSwapIn] = useState('10')
  const [minOut, setMinOut] = useState('0')
  const [removeShares, setRemoveShares] = useState('')
  const [minA, setMinA] = useState('0')
  const [minB, setMinB] = useState('0')
  const [receipt, setReceipt] = useState<OperationReceipt | null>(null)
  const [busy, setBusy] = useState<'inspect' | 'create' | 'add' | 'swap' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPosition(null)
    setWalletA(null)
    setWalletB(null)
    setReceipt(null)
  }, [wallet?.revAddress])

  async function hydratePool(next: PoolInfo, blockNumber?: number) {
    setPool(next)
    setPoolIdInput(next.locator)
    setObservedBlock(blockNumber ?? null)
    if (wallet) {
      const [positionObs, aBalance, bBalance] = await Promise.all([
        readPoolPosition(next.locator, wallet.revAddress),
        readAssetBalance(next.assetA, wallet.revAddress),
        readAssetBalance(next.assetB, wallet.revAddress),
      ])
      setPosition(positionObs.value)
      setWalletA(aBalance.value)
      setWalletB(bBalance.value)
    } else {
      setPosition(null)
      setWalletA(null)
      setWalletB(null)
    }
  }

  async function inspect(target = poolIdInput.trim()) {
    if (!target || busy) return
    setBusy('inspect')
    setError(null)
    try {
      const observed = await readPoolInfo(target)
      await hydratePool(observed.value, observed.block?.blockNumber)
    } catch (cause) {
      setObservedBlock(null)
      setError(cause instanceof Error ? cause.message : 'Unable to inspect pool state.')
    } finally {
      setBusy(null)
    }
  }

  async function create() {
    if (!wallet || busy) return
    setBusy('create')
    setError(null)
    setReceipt(null)
    try {
      const [left, right] = await Promise.all([
        readAssetInfo(assetAInput.trim()),
        readAssetInfo(assetBInput.trim()),
      ])
      const result = await createPool(wallet, left.value, right.value)
      setReceipt(result)
      await hydratePool(result.pool, result.finalizedBlock?.blockNumber)
      await onRevBalance?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create pool.')
    } finally {
      setBusy(null)
    }
  }

  async function add() {
    if (!wallet || !pool || busy) return
    setBusy('add')
    setError(null)
    setReceipt(null)
    try {
      const result = await addLiquidity(
        wallet,
        pool.locator,
        units(addA, pool.assetA),
        units(addB, pool.assetB),
        BigInt(minShares || '0'),
      )
      setReceipt(result)
      if (result.poolAfter) await hydratePool(result.poolAfter, result.finalizedBlock?.blockNumber)
      await onRevBalance?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add liquidity.')
    } finally {
      setBusy(null)
    }
  }

  async function executeSwap() {
    if (!wallet || !pool || busy) return
    setBusy('swap')
    setError(null)
    setReceipt(null)
    try {
      const inputAsset = swapDirection === 'A_TO_B' ? pool.assetA : pool.assetB
      const outputAsset = swapDirection === 'A_TO_B' ? pool.assetB : pool.assetA
      const result = await swap(
        wallet,
        pool.locator,
        swapDirection,
        units(swapIn, inputAsset),
        optionalUnits(minOut, outputAsset),
      )
      setReceipt(result)
      if (result.poolAfter) await hydratePool(result.poolAfter, result.finalizedBlock?.blockNumber)
      await onRevBalance?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to execute swap.')
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    if (!wallet || !pool || busy) return
    setBusy('remove')
    setError(null)
    setReceipt(null)
    try {
      const shares = BigInt(removeShares)
      const result = await removeLiquidity(
        wallet,
        pool.locator,
        shares,
        optionalUnits(minA, pool.assetA),
        optionalUnits(minB, pool.assetB),
      )
      setReceipt(result)
      if (result.poolAfter) await hydratePool(result.poolAfter, result.finalizedBlock?.blockNumber)
      await onRevBalance?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove liquidity.')
    } finally {
      setBusy(null)
    }
  }

  const swapPreview = useMemo(() => {
    if (!pool || pool.totalShares <= 0n) return null
    try {
      const inputAsset = swapDirection === 'A_TO_B' ? pool.assetA : pool.assetB
      return quoteSwap(pool, swapDirection, units(swapIn, inputAsset)).amountOut
    } catch {
      return null
    }
  }, [pool, swapDirection, swapIn])

  const finalized = Boolean(pool && pool.custodyVerified && observedBlock)
  const createReceipt = receipt && 'pool' in receipt ? receipt as PoolCreateReceipt : null
  const addReceipt = receipt && 'mintedShares' in receipt ? receipt as LiquidityAddReceipt : null
  const removeReceipt = receipt && 'shares' in receipt && 'amountA' in receipt ? receipt as LiquidityRemoveReceipt : null
  const swapReceipt = receipt && 'direction' in receipt ? receipt as SwapReceipt : null

  return (
    <section className="exchange-card" id="exchange">
      <div className="panel-head">
        <div><div className="eyebrow">EXCHANGE CORE · PHASE 07</div><h2>Capability-custodied testnet pools.</h2></div>
        <span className="badge">PUBLIC TESTNET</span>
      </div>

      <p className="proof-copy">
        Constant-product pools hold two Asset Lab v2 purse capabilities inside the pool contract. Mutations are signed locally and only become verified after finalized reserve, custody, position, and wallet-balance read-back.
      </p>

      <div className="exchange-boundary" role="note">
        <span>MATH</span><strong>integer constant product</strong>
        <span>CUSTODY</span><strong>private purse capabilities</strong>
        <span>FEE</span><strong>0 bps · testnet v1</strong>
        <span>CLAIMS</span><strong>no TVL · APR · volume · mainnet</strong>
      </div>

      <div className="exchange-inspect-row">
        <input value={poolIdInput} onChange={(event) => setPoolIdInput(event.target.value.trim().toLowerCase())} placeholder="rho:id: pool registry URI" aria-label="Pool registry URI" spellCheck={false} autoComplete="off" />
        <button className="ghost" type="button" onClick={() => inspect()} disabled={busy !== null || !poolIdInput.trim()}>{busy === 'inspect' ? 'VERIFYING…' : 'INSPECT POOL'}</button>
      </div>

      {pool && (
        <div className="exchange-observation">
          <div className="asset-title-row">
            <div><span className="asset-symbol">{pool.assetA.symbol} / {pool.assetB.symbol}</span><strong>Pool state</strong></div>
            <span className={finalized ? 'badge badge--verified' : 'badge'}>{finalized ? 'FINALIZED · CUSTODY VERIFIED' : 'PENDING / MISMATCH'}</span>
          </div>
          <div className="asset-id-line">
            <span>POOL URI</span><code>{pool.locator}</code><button className="mini" type="button" onClick={() => copyText(pool.locator)}>COPY</button>
          </div>
          <dl className="exchange-facts">
            <div><dt>{pool.assetA.symbol} recorded</dt><dd>{displayUnits(pool.reserveA, pool.assetA)}</dd></div>
            <div><dt>{pool.assetA.symbol} custody</dt><dd>{displayUnits(pool.actualA, pool.assetA)}</dd></div>
            <div><dt>{pool.assetB.symbol} recorded</dt><dd>{displayUnits(pool.reserveB, pool.assetB)}</dd></div>
            <div><dt>{pool.assetB.symbol} custody</dt><dd>{displayUnits(pool.actualB, pool.assetB)}</dd></div>
            <div><dt>Pool ID</dt><dd>{short(pool.poolId, 10, 8)}</dd></div>
            <div><dt>LP shares</dt><dd>{pool.totalShares.toString()}</dd></div>
            <div><dt>Your position</dt><dd>{wallet ? (position?.toString() ?? 'UNKNOWN') : 'SESSION WALLET REQUIRED'}</dd></div>
            <div><dt>Custody equality</dt><dd>{pool.custodyVerified ? 'VERIFIED' : 'MISMATCH · MUTATIONS REFUSED'}</dd></div>
            <div><dt>Observed block</dt><dd>{observedBlock ? `#${observedBlock}` : '—'}</dd></div>
          </dl>
          {wallet && <div className="exchange-wallet-balances"><span>YOUR BALANCES</span><strong>{walletA === null ? '—' : `${formatAssetUnits(walletA, pool.assetA.decimals)} ${pool.assetA.symbol}`}</strong><strong>{walletB === null ? '—' : `${formatAssetUnits(walletB, pool.assetB.decimals)} ${pool.assetB.symbol}`}</strong></div>}
          <button className="ghost" type="button" onClick={() => inspect(pool.locator)} disabled={busy !== null}>REFRESH FINALIZED STATE</button>
        </div>
      )}

      {!wallet ? (
        <div className="asset-locked" role="status"><strong>Pool inspection is public; pool mutations require a session wallet.</strong><span>Create or import a testnet wallet to create pools, provide liquidity, swap, or withdraw LP shares.</span></div>
      ) : (
        <>
          <article className="exchange-create-panel">
            <div className="eyebrow">CREATE POOL</div><h3>Two exchange-capable Asset Lab v2 assets</h3>
            <div className="exchange-two-inputs">
              <input value={assetAInput} onChange={(event) => setAssetAInput(event.target.value.trim().toLowerCase())} placeholder="rho:id: Asset A registry URI" aria-label="Pool asset A registry URI" spellCheck={false} autoComplete="off" />
              <input value={assetBInput} onChange={(event) => setAssetBInput(event.target.value.trim().toLowerCase())} placeholder="rho:id: Asset B registry URI" aria-label="Pool asset B registry URI" spellCheck={false} autoComplete="off" />
            </div>
            <div className="wallet-controls"><button className="primary" type="button" onClick={create} disabled={busy !== null || !assetAInput || !assetBInput}>{busy === 'create' ? 'SIGNING / VERIFYING…' : 'CREATE TESTNET POOL'}</button><span className="muted">Registry capabilities are canonicalized by embedded Asset ID; legacy v1 assets are refused.</span></div>
          </article>

          {pool && finalized && (
            <div className="exchange-action-grid">
              <article className="asset-work-panel">
                <div className="eyebrow">ADD LIQUIDITY</div><h3>Exact reserve ratio</h3>
                <div className="exchange-three-inputs">
                  <input value={addA} onChange={(event) => setAddA(event.target.value)} aria-label="Add asset A amount" placeholder={`${pool.assetA.symbol} amount`} inputMode="decimal" />
                  <input value={addB} onChange={(event) => setAddB(event.target.value)} aria-label="Add asset B amount" placeholder={`${pool.assetB.symbol} amount`} inputMode="decimal" />
                  <input value={minShares} onChange={(event) => setMinShares(event.target.value)} aria-label="Minimum LP shares" placeholder="Min LP shares" inputMode="numeric" />
                </div>
                <button className="primary" type="button" onClick={add} disabled={busy !== null}>{busy === 'add' ? 'SIGNING / VERIFYING…' : 'ADD TEST LIQUIDITY'}</button>
              </article>

              <article className="asset-work-panel">
                <div className="eyebrow">SWAP</div><h3>Exact input · minimum output</h3>
                <select value={swapDirection} onChange={(event) => setSwapDirection(event.target.value as SwapDirection)} aria-label="Swap direction"><option value="A_TO_B">{pool.assetA.symbol} → {pool.assetB.symbol}</option><option value="B_TO_A">{pool.assetB.symbol} → {pool.assetA.symbol}</option></select>
                <div className="exchange-two-inputs">
                  <input value={swapIn} onChange={(event) => setSwapIn(event.target.value)} aria-label="Swap input amount" placeholder="Input amount" inputMode="decimal" />
                  <input value={minOut} onChange={(event) => setMinOut(event.target.value)} aria-label="Minimum swap output" placeholder="Minimum output" inputMode="decimal" />
                </div>
                <div className="exchange-quote">CURRENT-STATE QUOTE · {swapPreview === null ? 'UNAVAILABLE' : `${displayUnits(swapPreview, swapDirection === 'A_TO_B' ? pool.assetB : pool.assetA)} ${swapDirection === 'A_TO_B' ? pool.assetB.symbol : pool.assetA.symbol}`}</div>
                <button className="primary" type="button" onClick={executeSwap} disabled={busy !== null || pool.totalShares <= 0n}>{busy === 'swap' ? 'SIGNING / VERIFYING…' : 'SWAP TEST ASSET'}</button>
              </article>

              <article className="asset-work-panel exchange-remove-panel">
                <div className="eyebrow">REMOVE LIQUIDITY</div><h3>Burn internal LP shares</h3>
                <div className="exchange-three-inputs">
                  <input value={removeShares} onChange={(event) => setRemoveShares(event.target.value)} aria-label="LP shares to remove" placeholder={position ? `Up to ${position}` : 'LP shares'} inputMode="numeric" />
                  <input value={minA} onChange={(event) => setMinA(event.target.value)} aria-label="Minimum asset A output" placeholder={`Min ${pool.assetA.symbol}`} inputMode="decimal" />
                  <input value={minB} onChange={(event) => setMinB(event.target.value)} aria-label="Minimum asset B output" placeholder={`Min ${pool.assetB.symbol}`} inputMode="decimal" />
                </div>
                <button className="primary" type="button" onClick={remove} disabled={busy !== null || !position || position <= 0n}>{busy === 'remove' ? 'SIGNING / VERIFYING…' : 'REMOVE TEST LIQUIDITY'}</button>
              </article>
            </div>
          )}
        </>
      )}

      {createReceipt && <div className="proof-receipt asset-receipt"><div><span>POOL CREATE</span><code>{createReceipt.deployId}</code></div><div><span>INCLUSION</span><code>#{createReceipt.inclusionBlock.blockNumber} · {short(createReceipt.inclusionBlock.blockHash)}</code></div><div><span>FINALITY</span><strong className={createReceipt.finalized ? 'receipt-good' : 'receipt-warn'}>{createReceipt.finalized ? `VERIFIED @ #${createReceipt.finalizedBlock?.blockNumber}` : 'PENDING — recheck Pool URI'}</strong></div></div>}
      {addReceipt && <div className="proof-receipt asset-receipt"><div><span>LIQUIDITY ADDED</span><strong>{addReceipt.mintedShares.toString()} LP shares</strong></div><div><span>DEPLOY</span><code>{addReceipt.deployId}</code></div><div><span>INCLUSION</span><code>#{addReceipt.inclusionBlock.blockNumber} · {short(addReceipt.inclusionBlock.blockHash)}</code></div><div><span>FINALITY</span><strong className={addReceipt.finalized ? 'receipt-good' : 'receipt-warn'}>{addReceipt.finalized ? `VERIFIED @ #${addReceipt.finalizedBlock?.blockNumber}` : 'PENDING — inclusion verified'}</strong></div></div>}
      {removeReceipt && <div className="proof-receipt asset-receipt"><div><span>LIQUIDITY REMOVED</span><strong>{removeReceipt.shares.toString()} LP shares</strong></div><div><span>DEPLOY</span><code>{removeReceipt.deployId}</code></div><div><span>INCLUSION</span><code>#{removeReceipt.inclusionBlock.blockNumber} · {short(removeReceipt.inclusionBlock.blockHash)}</code></div><div><span>FINALITY</span><strong className={removeReceipt.finalized ? 'receipt-good' : 'receipt-warn'}>{removeReceipt.finalized ? `VERIFIED @ #${removeReceipt.finalizedBlock?.blockNumber}` : 'PENDING — inclusion verified'}</strong></div></div>}
      {swapReceipt && <div className="proof-receipt asset-receipt"><div><span>SWAP</span><strong>{swapReceipt.direction}</strong></div><div><span>RAW AMOUNTS</span><strong>{swapReceipt.amountIn.toString()} → {swapReceipt.amountOut.toString()}</strong></div><div><span>DEPLOY</span><code>{swapReceipt.deployId}</code></div><div><span>FINALITY</span><strong className={swapReceipt.finalized ? 'receipt-good' : 'receipt-warn'}>{swapReceipt.finalized ? `VERIFIED @ #${swapReceipt.finalizedBlock?.blockNumber}` : 'PENDING — inclusion verified'}</strong></div></div>}
      {error && <div className="error" role="alert">{error}</div>}
    </section>
  )
}
