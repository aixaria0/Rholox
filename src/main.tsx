import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-600.css'
import '@fontsource/monaspace-xenon/latin-500.css'
import '@fontsource/monaspace-xenon/latin-600.css'
import './styles.css'
import rholoxLogo from './assets/rholox-logo.svg'
import AssetLabPanel from './AssetLabPanel'
import ExchangePanel from './ExchangePanel'
import AssurancePanel from './AssurancePanel'
import AssuranceSite from './AssuranceSite'
import { createWallet, walletFromPrivateKey, type RholoxWallet } from './lib/wallet'
import { createProof, type ProofReceipt } from './lib/proof'
import { sendRev, type TransferReceipt, type TransferAction } from './lib/transfer'
import {
  RCHAIN_API,
  dropsToRev,
  getJson,
  getObserverObservation,
  getRecentBlocks,
  getBlockByHash,
  readBalance,
  readDeployStatus,
  requestFaucet,
  type Capabilities,
  type FaucetResponse,
  type Finalized,
  type NodeStatus,
  type ObserverReport,
  type LightBlock,
  type BlockDetails,
} from './lib/rchain'

function short(value?: string, left = 8, right = 6) {
  if (!value) return '—'
  if (value.length <= left + right + 1) return value
  return `${value.slice(0, left)}…${value.slice(-right)}`
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function Metric({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  )
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

function motionBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: motionBehavior(), block: 'start' })
}

function observedBoolean(value: boolean | undefined, yes: string, no: string) {
  return value === undefined ? 'UNKNOWN' : value ? yes : no
}

function observerHeightRange(min?: number | null, max?: number | null) {
  if (typeof min !== 'number' || typeof max !== 'number') return '—'
  return min === max ? String(max) : `${min}–${max}`
}

function observerVerdictLabel(report: ObserverReport | null) {
  if (!report) return 'AWAITING'
  const reachable = report.heights.reachable_nodes
  const observed = report.verdict.observed_nodes
  const reachability = reachable < observed ? `${reachable}/${observed} REACHABLE · ` : ''
  switch (report.verdict.class) {
    case 'agreement': return `${reachability}${report.verdict.agreeing_nodes}/${report.verdict.comparable_nodes} AGREE`
    case 'proven_lag': return `${reachability}PROVEN LAG`
    case 'height_skew': return `${reachability}HEIGHT SKEW`
    case 'conflicting_finalized_history': return `${reachability}CONFLICTING HISTORY`
    case 'majority': return `${reachability}${report.verdict.agreeing_nodes}/${report.verdict.comparable_nodes} MAJORITY`
    case 'divergence': return `${reachability}DIVERGENCE`
    default: return `${reachability}UNAVAILABLE`
  }
}

function ModuleCard({ index, title, detail, target, next = false }: { index: string; title: string; detail: string; target?: string; next?: boolean }) {
  const body = (
    <>
      <span className="module-index">{index}</span>
      <span className="module-copy"><strong>{title}</strong><small>{detail}</small></span>
      <span className="module-arrow" aria-hidden="true">{next ? 'NEXT' : '↗'}</span>
    </>
  )
  return target
    ? <button className="module-card" type="button" onClick={() => scrollToSection(target)}>{body}</button>
    : <div className="module-card module-card--next" aria-label={`${title}, coming next`}>{body}</div>
}

function TopologyMark() {
  return (
    <div className="topology-mark" aria-hidden="true">
      <svg viewBox="0 0 680 300" focusable="false">
        <g className="topology-lines">
          <path d="M12 224 C112 180 168 246 256 196 S420 170 668 224" />
          <path d="M18 252 C118 210 184 268 274 226 S440 204 662 248" />
          <path d="M72 206 L142 166 L228 208 L310 142 L400 198 L486 150 L602 204" />
          <path d="M142 166 L174 112 M228 208 L258 154 M310 142 L348 96 M400 198 L430 132 M486 150 L534 96" />
        </g>
        <g className="topology-nodes">
          {[['72','206'],['142','166'],['174','112'],['228','208'],['258','154'],['310','142'],['348','96'],['400','198'],['430','132'],['486','150'],['534','96'],['602','204']].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" />)}
        </g>
      </svg>
      <div className="topology-orbit topology-orbit--one" />
      <div className="topology-orbit topology-orbit--two" />
    </div>
  )
}

function WalletPanel({ onTransferAction, gatewayUnavailable }: { onTransferAction: (action: TransferAction) => void; gatewayUnavailable: boolean }) {
  const [wallet, setWallet] = useState<RholoxWallet | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [faucetResult, setFaucetResult] = useState<FaucetResponse | null>(null)
  const [showPrivate, setShowPrivate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importKey, setImportKey] = useState('')

  async function updateBalance(target = wallet) {
    if (!target) return
    try {
      const next = await readBalance(target.revAddress)
      setBalance(next)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to read wallet balance.')
    }
  }

  async function selectWallet(next: RholoxWallet) {
    setWallet(next)
    setBalance(null)
    setFaucetResult(null)
    setShowPrivate(false)
    setError(null)
    try {
      setBalance(await readBalance(next.revAddress))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to read wallet balance.')
    }
  }

  async function generate() {
    await selectWallet(createWallet())
  }

  async function importWallet() {
    try {
      const next = walletFromPrivateKey(importKey)
      setImportKey('')
      setShowImport(false)
      await selectWallet(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid private key.')
    }
  }

  async function fund() {
    if (!wallet || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await requestFaucet(wallet.revAddress)
      setFaucetResult(result)
      if (result.status === 'failed') {
        throw new Error(result.deployError || 'Faucet deploy failed.')
      }

      for (let i = 0; i < 20; i += 1) {
        await sleep(3000)
        const status = await readDeployStatus(result.deployId) as Record<string, unknown>
        if ('ProcessedWithError' in status) throw new Error('Faucet deploy was processed with an error.')
        if ('ProcessedWithSuccess' in status) break
      }
      await updateBalance(wallet)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Faucet request failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!wallet) {
    return (
      <div className="wallet-workspace">
      <section className="wallet-card" id="wallet">
        <div className="wallet-intro">
          <div>
            <div className="eyebrow">SESSION WALLET</div>
            <h2>Create a testnet identity.</h2>
            <p>Keys are generated and held only in this browser session. Rholox does not upload or persist your private key.</p>
          </div>
          <div className="wallet-actions">
            <button className="primary" onClick={generate}>CREATE TESTNET WALLET</button>
            <button className="ghost" onClick={() => setShowImport((value) => !value)}>IMPORT PRIVATE KEY</button>
          </div>
        </div>
        {showImport && (
          <div className="import-row">
            <input
              type="password"
              value={importKey}
              onChange={(event) => setImportKey(event.target.value)}
              placeholder="64-character secp256k1 private key"
              aria-label="Private key"
              autoComplete="off"
              spellCheck={false}
            />
            <button className="ghost" onClick={importWallet}>IMPORT</button>
          </div>
        )}
        {error && <div className="error" role="alert">{error}</div>}
      </section>
      <AssetLabPanel wallet={null} revBalance={null} />
      <ExchangePanel wallet={null} />
      </div>
    )
  }

  return (
    <div className="wallet-workspace">
    <section className="wallet-card wallet-live" id="wallet">
      <div className="panel-head">
        <div>
          <div className="eyebrow">SESSION WALLET · LOCAL KEY</div>
          <h2>{balance === null ? 'Reading balance…' : `${dropsToRev(balance)} REV`}</h2>
        </div>
        <span className="badge">PUBLIC TESTNET</span>
      </div>

      <div className="wallet-address">
        <span>REV ADDRESS</span>
        <code>{wallet.revAddress}</code>
        <button className="mini" onClick={() => copyText(wallet.revAddress)}>COPY</button>
      </div>

      <div className="wallet-grid">
        <div><span>PUBLIC KEY</span><code title={wallet.publicKey}>{short(wallet.publicKey, 18, 12)}</code></div>
        <div><span>ETH ADDRESS</span><code>{wallet.ethAddress}</code></div>
      </div>

      <div className="wallet-controls">
        <button className="primary" onClick={fund} disabled={busy}>{busy ? 'WAITING FOR CHAIN…' : 'GET 0.3 TEST REV'}</button>
        <button className="ghost" onClick={() => updateBalance()} disabled={busy}>REFRESH BALANCE</button>
        <button className="ghost" onClick={() => setShowPrivate((value) => !value)}>{showPrivate ? 'HIDE PRIVATE KEY' : 'SHOW PRIVATE KEY'}</button>
      </div>

      {showPrivate && (
        <div className="private-key-box">
          <strong>PRIVATE KEY — TESTNET</strong>
          <code>{wallet.privateKey}</code>
          <button className="mini" onClick={() => copyText(wallet.privateKey)}>COPY</button>
          <small>Save it before reloading if you want to keep this test wallet. Rholox does not store it.</small>
        </div>
      )}

      {faucetResult && (
        <div className="receipt-line">
          <span>FAUCET {faucetResult.status.toUpperCase()}</span>
          <code title={faucetResult.deployId}>{short(faucetResult.deployId, 14, 10)}</code>
          <span>{dropsToRev(faucetResult.amount)} REV</span>
        </div>
      )}
      {error && <div className="error" role="alert">{error}</div>}
    </section>
    <div className="signed-actions-grid">
      <ProofPanel wallet={wallet} balance={balance} onBalance={() => updateBalance(wallet)} />
      <TransferPanel wallet={wallet} balance={balance} onBalance={() => updateBalance(wallet)} onAction={onTransferAction} gatewayUnavailable={gatewayUnavailable} />
    </div>
    <AssetLabPanel wallet={wallet} revBalance={balance} onRevBalance={() => updateBalance(wallet)} />
    <ExchangePanel wallet={wallet} onRevBalance={() => updateBalance(wallet)} />
    </div>
  )
}

function TransferPanel({ wallet, balance, onBalance, onAction, gatewayUnavailable }: { wallet: RholoxWallet; balance: number | null; onBalance: () => Promise<void>; onAction: (action: TransferAction) => void; gatewayUnavailable: boolean }) {
  const [action, setAction] = useState<TransferAction>()
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('0.01')
  const [receipt, setReceipt] = useState<TransferReceipt | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function transfer() {
    if (busy) return
    setBusy(true)
    setError(null)
    setReceipt(null)
    setAction(undefined)
    try {
      const next = await sendRev(wallet, recipient, amount, nextAction => { setAction(nextAction); onAction(nextAction) })
      setReceipt(next)
      await onBalance()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send REV.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="transfer-card" id="transfer">
      <div className="panel-head">
        <div><div className="eyebrow">REV TRANSFER</div><h2>Send test REV with a signed deploy.</h2></div>
        <span className="badge">PUBLIC TESTNET</span>
      </div>
      <p className="proof-copy">The transfer is signed locally with this session key. Rholox retains the signed deploy, observes inclusion, and checks finalized-state read-back. RChain Assurance reports the bounded evidence verdict separately.</p>
      <div className="transfer-grid">
        <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Recipient REV address" aria-label="Recipient REV address" spellCheck={false} autoComplete="off" />
        <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount in REV" aria-label="Amount in REV" inputMode="decimal" />
      </div>
      <div className="wallet-controls">
        <button className="primary" onClick={transfer} disabled={busy || !recipient.trim() || !amount.trim()}>{busy ? 'SIGNING / VERIFYING…' : 'SEND TEST REV'}</button>
        <span className="muted">Available: {balance === null ? '—' : `${dropsToRev(balance)} REV`}</span>
      </div>
      {receipt && (
        <div className="proof-receipt">
          <div><span>AMOUNT</span><strong>{receipt.amountRev} REV</strong></div>
          <div><span>TO</span><code>{receipt.to}</code></div>
          <div><span>DEPLOY</span><code>{receipt.deployId}</code></div>
          <div><span>INCLUSION</span><code>#{receipt.inclusionBlock.blockNumber} · {short(receipt.inclusionBlock.blockHash, 14, 10)}</code></div>
          <div><span>FINALITY</span><strong className={receipt.finalized ? 'receipt-good' : 'receipt-warn'}>{receipt.finalized ? `FINALIZED STATE OBSERVED @ #${receipt.finalizedBlock?.blockNumber}` : 'PENDING — finalized-state evidence unavailable'}</strong></div>
          <div><span>RECIPIENT</span><code>{receipt.recipientBalanceAfter === undefined ? '—' : `${dropsToRev(receipt.recipientBalanceAfter)} REV`}</code></div>
        </div>
      )}
      {action && <AssurancePanel deployId={action.deployId} action={action} gatewayUnavailable={gatewayUnavailable} />}
      {error && <div className="error" role="alert">{error}</div>}
    </section>
  )
}

function ProofPanel({ wallet, balance, onBalance }: { wallet: RholoxWallet; balance: number | null; onBalance: () => Promise<void> }) {
  const [payload, setPayload] = useState('Rholox first proof')
  const [receipt, setReceipt] = useState<ProofReceipt | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function anchor() {
    if (busy) return
    if (balance !== null && balance <= 0) {
      setError('Fund this testnet wallet before signing a proof.')
      return
    }
    setBusy(true)
    setError(null)
    setReceipt(null)
    try {
      const next = await createProof(wallet, payload)
      setReceipt(next)
      await onBalance()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create Rholox proof.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="proof-card" id="proof">
      <div className="panel-head">
        <div><div className="eyebrow">PROOF</div><h2>Anchor a SHA-256 proof on the public testnet.</h2></div>
        <span className="badge">SIGNED DEPLOY</span>
      </div>
      <p className="proof-copy">The payload stays in your browser. Rholox hashes it locally, signs a Rholang deploy with this session key, then waits for inclusion and verifies the proof against finalized state.</p>
      <textarea value={payload} onChange={(event) => setPayload(event.target.value)} aria-label="Proof payload" maxLength={500} spellCheck={false} />
      <div className="wallet-controls">
        <button className="primary" onClick={anchor} disabled={busy || !payload.trim()}>{busy ? 'SIGNING / VERIFYING…' : 'SIGN + ANCHOR PROOF'}</button>
      </div>
      {receipt && (
        <div className="proof-receipt">
          <div><span>SHA-256</span><code>{receipt.sha256}</code></div>
          <div><span>DEPLOY</span><code>{receipt.deployId}</code></div>
          <div><span>INCLUSION</span><code>#{receipt.inclusionBlock.blockNumber} · {short(receipt.inclusionBlock.blockHash, 14, 10)}</code></div>
          <div><span>FINALITY</span><strong className={receipt.finalized ? 'receipt-good' : 'receipt-warn'}>{receipt.finalized ? `FINALIZED STATE OBSERVED @ #${receipt.finalizedBlock?.blockNumber}` : 'PENDING — finalized-state evidence unavailable'}</strong></div>
        </div>
      )}
      {error && <div className="error" role="alert">{error}</div>}
    </section>
  )
}

function ExplorerPanel({ action, gatewayUnavailable }: { action?: TransferAction; gatewayUnavailable: boolean }) {
  const [assuranceDeploy, setAssuranceDeploy] = useState<string>()
  const [recent, setRecent] = useState<LightBlock[]>([])
  const [query, setQuery] = useState('')
  const [block, setBlock] = useState<BlockDetails | null>(null)
  const [deployStatus, setDeployStatus] = useState<Record<string, unknown> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recentLoading, setRecentLoading] = useState(true)
  const [recentLoaded, setRecentLoaded] = useState(false)
  const [recentError, setRecentError] = useState<string | null>(null)

  async function loadRecent() {
    setRecentLoading(true)
    try {
      setRecent(await getRecentBlocks())
      setRecentLoaded(true)
      setRecentError(null)
    } catch (cause) {
      setRecentError(cause instanceof Error ? cause.message : 'Unable to read recent blocks.')
    } finally {
      setRecentLoading(false)
    }
  }

  useEffect(() => { void loadRecent() }, [])

  async function openBlock(hash: string) {
    setAssuranceDeploy(undefined)
    setBusy(true)
    setError(null)
    setDeployStatus(null)
    try {
      setBlock(await getBlockByHash(hash))
    } catch (cause) {
      setBlock(null)
      setError(cause instanceof Error ? cause.message : 'Unable to read block.')
    } finally {
      setBusy(false)
    }
  }

  async function lookup() {
    const value = query.trim()
    if (!value || busy) return
    setBusy(true)
    setError(null)
    setBlock(null)
    setDeployStatus(null)
    setAssuranceDeploy(undefined)
    try {
      if (/^[0-9a-fA-F]{64}$/.test(value)) {
        setBlock(await getBlockByHash(value))
      } else if (/^\d+$/.test(value)) {
        const match = recent.find((item) => item.blockNumber === Number(value))
        if (!match) throw new Error('That height is not in the recent block window. Paste a block hash for older blocks.')
        setBlock(await getBlockByHash(match.blockHash))
      } else {
        setAssuranceDeploy(value)
        setDeployStatus(await readDeployStatus(value) as Record<string, unknown>)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Explorer lookup failed.')
    } finally {
      setBusy(false)
    }
  }

  const deployBlock = deployStatus && 'ProcessedWithSuccess' in deployStatus
    ? (deployStatus.ProcessedWithSuccess as { block?: LightBlock }).block
    : deployStatus && 'ProcessedWithError' in deployStatus
      ? (deployStatus.ProcessedWithError as { block?: LightBlock }).block
      : null

  return (
    <section className="explorer-card" id="explorer">
      <div className="panel-head">
        <div><div className="eyebrow">EXPLORER</div><h2>Inspect blocks and deploy evidence.</h2></div>
        <button className="ghost" onClick={loadRecent} disabled={recentLoading}>{recentLoading ? 'LOADING…' : 'REFRESH BLOCKS'}</button>
      </div>
      <div className="explorer-search">
        <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void lookup() }} placeholder="Block hash, recent height, or deploy ID" aria-label="Explorer lookup" spellCheck={false} />
        <button className="primary" onClick={lookup} disabled={busy || !query.trim()}>{busy ? 'LOOKING…' : 'LOOK UP'}</button>
      </div>

      {recentLoading && !recentLoaded && <div className="empty-state" role="status">Loading recent blocks…</div>}
      {!recentLoading && recentLoaded && recent.length === 0 && <div className="empty-state" role="status">No recent blocks were returned by the connected node.</div>}
      {recentError && <div className="error" role="alert">{recentError}{recent.length ? ' Showing the last successful observation.' : ''}</div>}
      {recentError && recent.length > 0 && <div className="stale-note" role="status">Recent block list may be stale.</div>}

      <div className="recent-blocks" aria-busy={recentLoading}>
        {recent.map((item) => (
          <button key={item.blockHash} className="block-row" onClick={() => openBlock(item.blockHash)}>
            <span className="block-height">#{item.blockNumber}</span>
            <code>{short(item.blockHash, 14, 10)}</code>
            <span>{item.deployCount} deploy{item.deployCount === 1 ? '' : 's'}</span>
            <span>{item.rejectedDeploys.length} rejected</span>
          </button>
        ))}
      </div>

      {block && (
        <div className="explorer-detail">
          <div><span>BLOCK</span><strong>#{block.blockInfo.blockNumber}</strong></div>
          <div><span>HASH</span><code>{block.blockInfo.blockHash}</code></div>
          <div><span>PROPOSER</span><code>{block.blockInfo.sender}</code></div>
          <div><span>STATE</span><code>{short(block.blockInfo.preStateHash, 14, 10)} → {short(block.blockInfo.postStateHash, 14, 10)}</code></div>
          <div><span>JUSTIFICATIONS</span><strong>{block.blockInfo.justifications.length}</strong></div>
          <div><span>BONDS</span><strong>{block.blockInfo.bonds.length}</strong></div>
          <div><span>DEPLOYS</span><strong>{block.deploys.length}</strong></div>
          <div><span>REJECTED</span><strong>{block.blockInfo.rejectedDeploys.length}</strong></div>
          {block.deploys.map((deploy) => (
            <div className="deploy-detail" key={deploy.sig}>
              <button className="text-button" type="button" onClick={() => setAssuranceDeploy(deploy.sig)}>DEPLOY {short(deploy.sig, 12, 10)} · ASSURANCE</button>
              <code>{short(deploy.deployer, 16, 12)} · cost {deploy.cost} · {deploy.errored ? 'EXECUTION ERROR' : 'NO VM ERROR REPORTED'}</code>
            </div>
          ))}
        </div>
      )}

      {deployStatus && (
        <div className="explorer-detail">
          <div><span>DEPLOY STATUS</span><strong>{'ProcessedWithSuccess' in deployStatus ? 'EXECUTION OBSERVED · RESULT REQUIRES CHECKING' : 'ProcessedWithError' in deployStatus ? 'PROCESSED · ERROR' : 'NOT PROCESSED'}</strong></div>
          {deployBlock && <div><span>BLOCK</span><button className="text-button" onClick={() => openBlock(deployBlock.blockHash)}>#{deployBlock.blockNumber} · {short(deployBlock.blockHash, 14, 10)}</button></div>}
          {'NotProcessed' in deployStatus && <div><span>STATE</span><code>{JSON.stringify(deployStatus.NotProcessed)}</code></div>}
        </div>
      )}
      {assuranceDeploy && <AssurancePanel deployId={assuranceDeploy} action={action?.deployId === assuranceDeploy ? action : undefined} gatewayUnavailable={gatewayUnavailable} />}
      {error && <div className="error" role="alert">{error}</div>}
    </section>
  )
}

function App() {
  const [lastTransferAction, setLastTransferAction] = useState<TransferAction>()
  const [status, setStatus] = useState<NodeStatus | null>(null)
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [finalized, setFinalized] = useState<Finalized | null>(null)
  const [observer, setObserver] = useState<ObserverReport | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(null)
  const [finalizedError, setFinalizedError] = useState<string | null>(null)
  const [observerError, setObserverError] = useState<string | null>(null)
  const [statusReachable, setStatusReachable] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    setRefreshing(true)
    const [statusResult, capabilitiesResult, finalizedResult, observerResult] = await Promise.allSettled([
      getJson<NodeStatus>('/api/status'),
      getJson<Capabilities>('/api/v1/capabilities'),
      getJson<Finalized>('/api/last-finalized-block'),
      getObserverObservation(),
    ])

    if (statusResult.status === 'fulfilled') {
      setStatus(statusResult.value)
      setStatusReachable(true)
      setStatusError(null)
      setUpdatedAt(new Date())
    } else {
      setStatusReachable(false)
      setStatusError(statusResult.reason instanceof Error ? statusResult.reason.message : 'Unable to reach the public testnet.')
    }

    if (capabilitiesResult.status === 'fulfilled') {
      setCapabilities(capabilitiesResult.value)
      setCapabilitiesError(null)
    } else {
      setCapabilitiesError(capabilitiesResult.reason instanceof Error ? capabilitiesResult.reason.message : 'Unable to observe node capabilities.')
    }

    if (finalizedResult.status === 'fulfilled') {
      setFinalized(finalizedResult.value)
      setFinalizedError(null)
    } else {
      setFinalizedError(finalizedResult.reason instanceof Error ? finalizedResult.reason.message : 'Unable to observe finalized state.')
    }

    if (observerResult.status === 'fulfilled') {
      setObserver(observerResult.value)
      setObserverError(null)
    } else {
      setObserverError(observerResult.reason instanceof Error ? observerResult.reason.message : 'Unable to reach the multi-node observer.')
    }

    setRefreshing(false)
  }

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const bonds = finalized?.blockInfo?.bonds ?? []
  const totalStake = useMemo(() => bonds.reduce((sum, bond) => sum + bond.stake, 0), [bonds])
  const latest = status?.latestBlockNumber
  const finalBlock = finalized?.blockInfo?.blockNumber
  const finalityGap = typeof latest === 'number' && typeof finalBlock === 'number' ? latest - finalBlock : null
  const online = Boolean(status && statusReachable)
  const statusObservation = statusError ? (status ? 'STALE' : 'UNAVAILABLE') : status ? 'OBSERVED' : 'AWAITING'
  const finalizedObservation = finalizedError ? (finalized ? 'STALE' : 'UNAVAILABLE') : finalized ? 'OBSERVED' : 'AWAITING'
  const capabilitiesObservation = capabilitiesError ? (capabilities ? 'STALE' : 'UNAVAILABLE') : capabilities ? 'OBSERVED' : 'AWAITING'
  const observerObservation = observerError ? (observer ? 'STALE' : 'UNAVAILABLE') : observer ? 'OBSERVED' : 'AWAITING'
  const observerAgreement = observer?.verdict.class === 'agreement'
  const observerCompatible = observer?.verdict.class === 'proven_lag'
  const observerConflict = observer?.verdict.class === 'divergence' || observer?.verdict.class === 'majority' || observer?.verdict.class === 'conflicting_finalized_history'
  const observerReference = observer?.verdict.reference
  const observerReachable = Boolean(observer && observer.heights.reachable_nodes > 0)
  const observerDegraded = Boolean(observer && observer.heights.reachable_nodes < observer.verdict.observed_nodes)
  const testnetObserved = online || observerReachable
  const observerBadge = observerAgreement || observerCompatible ? 'badge badge--verified' : observerConflict ? 'badge badge--danger' : 'badge'
  const observerStateLabel = observer
    ? observerAgreement
      ? observerDegraded
        ? `DEGRADED · ${observer.heights.reachable_nodes}/${observer.verdict.observed_nodes} REACHABLE · ${observer.verdict.agreeing_nodes}/${observer.verdict.comparable_nodes} COMPARABLE AGREE`
        : `${observer.verdict.agreeing_nodes}/${observer.verdict.comparable_nodes} FINALIZED SNAPSHOT AGREEMENT`
      : observerCompatible
        ? `${observerDegraded ? 'DEGRADED · ' : ''}FINALIZED ANCESTRY COMPATIBLE · PROVEN LAG`
        : `${observerDegraded ? 'DEGRADED · ' : ''}MULTI-NODE ${observer.verdict.class.replaceAll('_', ' ').toUpperCase()}`
    : null
  const nodeStateLabel = observerStateLabel ?? (online ? 'NODE REACHABLE' : statusError ? 'NODE UNREACHABLE' : 'OBSERVING NODE')
  const executionGatewayMessage = statusError
    ? observerReachable
      ? `EXECUTION GATEWAY UNAVAILABLE · multi-node evidence remains active (${observer!.heights.reachable_nodes}/${observer!.verdict.observed_nodes} nodes reachable).`
      : 'PUBLIC TESTNET EXECUTION GATEWAY UNAVAILABLE.'
    : null

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => window.scrollTo({ top: 0, behavior: motionBehavior() })} aria-label="Rholox home">
          <img src={rholoxLogo} alt="" />
          <span>RHOLOX</span>
        </button>
        <nav className="primary-nav" aria-label="Primary navigation">
          <button type="button" onClick={() => { window.location.hash = 'assurance' }}>Assurance</button>
          <button type="button" onClick={() => scrollToSection('network')}>Network</button>
          <button type="button" onClick={() => scrollToSection('wallet')}>Wallet</button>
          <button type="button" onClick={() => scrollToSection('proof')}>Proof</button>
          <button type="button" onClick={() => scrollToSection('explorer')}>Explorer</button>
          <button type="button" onClick={() => scrollToSection('transfer')}>Transfer</button>
          <button type="button" onClick={() => scrollToSection('asset-lab')}>Assets</button>
          <button type="button" onClick={() => scrollToSection('exchange')}>Exchange</button>
        </nav>
        <div className="top-actions">
          <span className={`environment-pill ${observerDegraded ? 'environment-pill--degraded' : testnetObserved ? 'environment-pill--online' : statusError ? 'environment-pill--offline' : 'environment-pill--pending'}`}><span className="dot" />PUBLIC TESTNET</span>
          <button className="ghost compact" onClick={refresh} disabled={refreshing}>{refreshing ? 'SYNCING…' : 'REFRESH'}</button>
        </div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="eyebrow">EVIDENCE-FIRST TESTNET INTERFACE</div>
          <h1 id="hero-title">One surface for <span>consensus</span>, <span>provenance</span>, and testnet execution.</h1>
          <p>Observe live node state, work with session-only keys, obtain test REV, anchor proofs, inspect blocks, and verify signed transfers from one operational interface.</p>
          <div className="hero-actions">
            <button className="primary" type="button" onClick={() => scrollToSection('wallet')}>OPEN WALLET <span aria-hidden="true">→</span></button>
            <button className="secondary" type="button" onClick={() => scrollToSection('network')}>INSPECT NETWORK</button>
          </div>
          <div className="hero-state" role="status">
            <span className={`dot ${observerDegraded ? 'degraded' : testnetObserved ? 'live' : statusError ? 'dead' : ''}`} />
            <strong>{nodeStateLabel}</strong>
            <span>{updatedAt ? `observed ${updatedAt.toLocaleTimeString()}` : 'awaiting first observation'}</span>
          </div>
          {executionGatewayMessage && <div className={`error ${observerReachable ? 'degraded-error' : ''}`} role="alert">{executionGatewayMessage}</div>}
        </div>
        <div className="hero-visual">
          <TopologyMark />
          <div className="logo-stage"><img src={rholoxLogo} alt="Rholox" /></div>
          <div className="hero-keywords" aria-hidden="true"><span>CONSENSUS</span><span>PROVENANCE</span><span>HORIZONTAL</span><span>FRACTAL</span></div>
        </div>
      </section>

      <section className="module-grid" aria-label="Rholox modules">
        <ModuleCard index="01" title="Network Console" detail="4-node finality evidence + execution state" target="network" />
        <ModuleCard index="02" title="Wallet + Test REV" detail="Session keys, faucet, balance" target="wallet" />
        <ModuleCard index="03" title="Proof" detail="SHA-256 anchor + finalized receipt" target="proof" />
        <ModuleCard index="04" title="Explorer" detail="Blocks, deploys, evidence" target="explorer" />
        <ModuleCard index="05" title="REV Transfer" detail="Signed test transfers" target="transfer" />
        <ModuleCard index="06" title="Asset Lab" detail="MakeMint fixed-supply assets" target="asset-lab" />
        <ModuleCard index="07" title="Exchange Core" detail="Capability-custodied test pools" target="exchange" />
      </section>

      <section className="network-surface" id="network">
        <div className="section-heading">
          <div><div className="eyebrow">LIVE OBSERVATION</div><h2>Network state</h2></div>
          <span className="observation-note">Direct execution node · independent 4-node finality cross-check</span>
        </div>
        <div className="grid status-grid">
          <Metric label="NETWORK" value={observerReference?.network_id ?? status?.networkId ?? '—'} sub={observer ? `${observer.heights.reachable_nodes}/${observer.verdict.observed_nodes} observer nodes reachable` : statusObservation === 'STALE' ? 'stale observation' : status?.version?.api ? `API ${status.version.api} · execution node` : statusObservation.toLowerCase()} />
          <Metric label="SHARD" value={observerReference?.shard_id ?? status?.shardId ?? finalized?.blockInfo?.shardId ?? '—'} />
          <Metric label="LATEST BLOCK" value={observer ? observerHeightRange(observer.heights.latest_min, observer.heights.latest_max) : latest ?? '—'} sub={observer ? 'range across reachable nodes' : statusObservation === 'STALE' ? 'stale observation' : 'latest observed block'} />
          <Metric label="FINALIZED BLOCK" value={observer ? observerHeightRange(observer.heights.finalized_min, observer.heights.finalized_max) : finalBlock ?? '—'} sub={observer ? observerVerdictLabel(observer) : finalizedObservation === 'STALE' ? 'stale observation' : finalityGap === null ? finalizedObservation.toLowerCase() : `${finalityGap} block gap`} />
          <Metric label="VALIDATORS" value={bonds.length || '—'} sub={finalizedObservation === 'STALE' ? 'stale observation' : bonds.length ? `${totalStake} observed stake` : finalizedObservation.toLowerCase()} />
          <Metric label="NODE A PEERS" value={status?.peers ?? '—'} sub={status?.nodes !== undefined ? `${status.nodes} reported nodes` : 'execution-node view'} />
        </div>

        <div className="panel-row evidence-row">
          <article className="panel observer-panel">
            <div className="panel-head">
              <div><div className="eyebrow">MULTI-NODE EVIDENCE</div><h2>Finalized snapshot cross-check</h2></div>
              <span className={observerBadge}>{observerError && observer ? 'STALE · ' : ''}{observerVerdictLabel(observer)}</span>
            </div>
            {observer ? (
              <>
                <dl className="observer-summary">
                  <div><dt>Reachability</dt><dd>{observer.heights.reachable_nodes}/{observer.verdict.observed_nodes} nodes</dd></div>
                  <div><dt>Latest range</dt><dd>{observerHeightRange(observer.heights.latest_min, observer.heights.latest_max)}</dd></div>
                  <div><dt>Finalized range</dt><dd>{observerHeightRange(observer.heights.finalized_min, observer.heights.finalized_max)}</dd></div>
                  <div><dt>Reference hash</dt><dd title={observerReference?.block_hash}>{short(observerReference?.block_hash, 12, 10)}</dd></div>
                </dl>
                <div className="observer-node-grid" aria-label="Observed testnet nodes">
                  {observer.observations.map((node) => (
                    <div className={`observer-node ${node.reachable ? 'observer-node--online' : 'observer-node--offline'}`} key={node.node}>
                      <span>{node.node}</span>
                      <strong>{node.reachable ? 'REACHABLE' : 'UNREACHABLE'}</strong>
                      <code>tip {node.latest_block ?? '—'} · final {node.finalized_block ?? '—'}</code>
                    </div>
                  ))}
                </div>
                {observer.ancestry_checks?.length > 0 && (
                  <div className="observer-ancestry-grid" aria-label="Finality ancestry evidence">
                    {observer.ancestry_checks.map((check) => (
                      <div className={`observer-ancestry observer-ancestry--${check.class}`} key={`${check.lower.block_hash}:${check.higher.block_hash}`}>
                        <span>{check.class.replaceAll('_', ' ').toUpperCase()}</span>
                        <code>#{check.lower.block_number} → #{check.higher.block_number} · {check.cryptographically_verified_blocks}/{check.examined_blocks} crypto-verified · witness {check.witness_node ?? '—'}</code>
                      </div>
                    ))}
                  </div>
                )}
                <p className="observer-verdict-copy">{observer.verdict.summary}. Ancestry fields are accepted only from raw block preimages whose BLAKE2b-256 content address and detached proposer signature both verify.</p>
              </>
            ) : (
              <p className="observer-verdict-copy">{observerObservation === 'UNAVAILABLE' ? 'Multi-node evidence is currently unavailable.' : 'Waiting for the first multi-node snapshot.'}</p>
            )}
            {observerError && <div className="error compact-error" role="alert">{observerError}{observer ? ' Showing the last successful multi-node snapshot.' : ''}</div>}
          </article>
          <article className="panel evidence-panel">
            <div className="panel-head"><div><div className="eyebrow">FINALIZED EVIDENCE</div><h2>Latest finalized block</h2></div><span className={finalizedObservation === 'OBSERVED' ? 'badge badge--verified' : 'badge'}>{finalizedObservation}</span></div>
            <dl>
              <div><dt>Block</dt><dd>#{finalBlock ?? '—'}</dd></div>
              <div><dt>Hash</dt><dd title={finalized?.blockInfo?.blockHash}>{short(finalized?.blockInfo?.blockHash, 12, 10)}</dd></div>
              <div><dt>Proposer</dt><dd title={finalized?.blockInfo?.sender}>{short(finalized?.blockInfo?.sender, 12, 8)}</dd></div>
              <div><dt>Deploys</dt><dd>{finalized?.blockInfo?.deployCount ?? '—'}</dd></div>
            </dl>
          </article>
          <article className="panel evidence-panel">
            <div className="panel-head"><div><div className="eyebrow">NODE CAPABILITIES</div><h2>Execution surface</h2></div><span className="badge">{capabilitiesObservation}</span></div>
            <dl>
              <div><dt>Propose on deploy</dt><dd>{observedBoolean(capabilities?.proposeOnDeploy, 'YES', 'NO')}</dd></div>
              <div><dt>Faucet</dt><dd>{observedBoolean(capabilities?.faucet, 'AVAILABLE', 'UNAVAILABLE')}</dd></div>
              <div><dt>Dev mode</dt><dd>{observedBoolean(capabilities?.devMode, 'ON', 'OFF')}</dd></div>
              <div><dt>Admin exposed</dt><dd>{observedBoolean(capabilities?.adminHttp, 'YES', 'NO')}</dd></div>
            </dl>
            {capabilitiesError && <div className="error compact-error" role="alert">{capabilitiesError}{capabilities ? ' Showing the last successful observation.' : ''}</div>}
          </article>
        </div>
        {finalizedError && <div className="error compact-error" role="alert">{finalizedError}{finalized ? ' Finalized evidence shown above may be stale.' : ''}</div>}
      </section>

      <section className="concept-strip" aria-label="Design principles">
        <article><div className="concept-glyph concept-glyph--consensus" aria-hidden="true"><i /><i /><i /><i /></div><div><strong>Consensus</strong><p>Observe validator, justification, and finality evidence without hiding the underlying block structure.</p></div></article>
        <article><div className="concept-glyph concept-glyph--provenance" aria-hidden="true"><i /><i /><i /></div><div><strong>Provenance</strong><p>Follow a signed action from submission to inclusion and finalized state.</p></div></article>
        <article><div className="concept-glyph concept-glyph--fractal" aria-hidden="true"><i /><i /><i /><i /><i /></div><div><strong>Fractal structure</strong><p>Repeated node-and-edge motifs keep dense, horizontal evidence navigable.</p></div></article>
      </section>

      <WalletPanel onTransferAction={setLastTransferAction} gatewayUnavailable={Boolean(statusError)} />
      <ExplorerPanel action={lastTransferAction} gatewayUnavailable={Boolean(statusError)} />

      <section className="roadmap" id="roadmap">
        <div><div className="eyebrow">VERIFIED SURFACE</div><h2>Implemented before expanded.</h2><p>Each capability stays explicit about what is observed, signed, included, and finalized.</p></div>
        <ol>
          <li className="done"><span>01</span><div><strong>Network console</strong><small>Execution-node state plus independent A/D/B/C finalized-snapshot evidence.</small></div></li>
          <li className="done"><span>02</span><div><strong>Wallet + test REV</strong><small>Session-only keys, faucet funding and balance reads.</small></div></li>
          <li className="done"><span>03</span><div><strong>Rholox Proof</strong><small>Signed deploy → inclusion → finalized receipt.</small></div></li>
          <li className="done"><span>04</span><div><strong>Explorer</strong><small>Block details and evidence-backed verification.</small></div></li>
          <li className="done"><span>05</span><div><strong>REV transfer</strong><small>Signed value transfer → inclusion → finalized balance verification.</small></div></li>
          <li className="done"><span>06</span><div><strong>Asset Lab</strong><small>Fixed-supply MakeMint assets, brand verification and signed transfers.</small></div></li>
          <li className="done"><span>07</span><div><strong>Exchange Core</strong><small>Capability custody, constant-product swaps and finalized reserve verification.</small></div></li>
        </ol>
      </section>

      <footer><span>Rholox v0.7 · public testnet · test value only</span><div className="footer-links"><a href={`${RCHAIN_API}/observer/v1/observation`} target="_blank" rel="noreferrer">MULTI-NODE EVIDENCE ↗</a><a href={`${RCHAIN_API}/api/status`} target="_blank" rel="noreferrer">RAW NODE STATUS ↗</a></div></footer>
    </main>
  )
}

function Root() {
  const [surface, setSurface] = useState(window.location.hash)

  useEffect(() => {
    const syncSurface = () => setSurface(window.location.hash)
    window.addEventListener('hashchange', syncSurface)
    return () => window.removeEventListener('hashchange', syncSurface)
  }, [])

  return surface.startsWith('#assurance') ? <AssuranceSite /> : <App />
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>)
