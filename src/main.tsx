import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-600.css'
import './styles.css'
import { comparableIdentity, evidenceState } from './lib/observer'
import rholoxLogo from './assets/rholox-logo.svg'
import AssetLabPanel from './AssetLabPanel'
import ExchangePanel from './ExchangePanel'
import { createWallet, walletFromPrivateKey, type RholoxWallet } from './lib/wallet'
import { createProof, type ProofReceipt } from './lib/proof'
import { sendRev, type TransferReceipt } from './lib/transfer'
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

function WalletPanel() {
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
        const status = (await readDeployStatus(result.deployId)) as Record<string, unknown>
        if ('ProcessedWithError' in status)
          throw new Error('Faucet deploy was processed with an error.')
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
              <p>
                Keys are generated and held only in this browser session. Rholox does not upload or
                persist your private key.
              </p>
            </div>
            <div className="wallet-actions">
              <button className="primary" onClick={generate}>
                CREATE TESTNET WALLET
              </button>
              <button className="ghost" onClick={() => setShowImport((value) => !value)}>
                IMPORT PRIVATE KEY
              </button>
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
              <button className="ghost" onClick={importWallet}>
                IMPORT
              </button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
        </section>
        <section className="locked-tool" id="proof">
          <span className="eyebrow">RHOLOX PROOF</span>
          <h2>Anchor a proof</h2>
          <p>
            Create or import a session wallet above to sign a SHA-256 proof. Your payload stays in
            the browser.
          </p>
          <button className="ghost" onClick={() => scrollToSection('wallet')}>
            Open session wallet ↑
          </button>
        </section>
        <section className="locked-tool" id="transfer">
          <span className="eyebrow">REV TRANSFER</span>
          <h2>Send test REV</h2>
          <p>
            A session wallet is required to sign a transfer and verify finalized recipient state.
          </p>
          <button className="ghost" onClick={() => scrollToSection('wallet')}>
            Open session wallet ↑
          </button>
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
          <button className="mini" onClick={() => copyText(wallet.revAddress)}>
            COPY
          </button>
        </div>

        <div className="wallet-grid">
          <div>
            <span>PUBLIC KEY</span>
            <code title={wallet.publicKey}>{short(wallet.publicKey, 18, 12)}</code>
          </div>
          <div>
            <span>ETH ADDRESS</span>
            <code>{wallet.ethAddress}</code>
          </div>
        </div>

        <div className="wallet-controls">
          <button className="primary" onClick={fund} disabled={busy}>
            {busy ? 'WAITING FOR CHAIN…' : 'GET 0.3 TEST REV'}
          </button>
          <button className="ghost" onClick={() => updateBalance()} disabled={busy}>
            REFRESH BALANCE
          </button>
          <button className="ghost" onClick={() => setShowPrivate((value) => !value)}>
            {showPrivate ? 'HIDE PRIVATE KEY' : 'SHOW PRIVATE KEY'}
          </button>
        </div>

        {showPrivate && (
          <div className="private-key-box">
            <strong>PRIVATE KEY — TESTNET</strong>
            <code>{wallet.privateKey}</code>
            <button className="mini" onClick={() => copyText(wallet.privateKey)}>
              COPY
            </button>
            <small>
              Save it before reloading if you want to keep this test wallet. Rholox does not store
              it.
            </small>
          </div>
        )}

        {faucetResult && (
          <div className="receipt-line">
            <span>FAUCET {faucetResult.status.toUpperCase()}</span>
            <code title={faucetResult.deployId}>{short(faucetResult.deployId, 14, 10)}</code>
            <span>{dropsToRev(faucetResult.amount)} REV</span>
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </section>
      <div className="signed-actions-grid">
        <ProofPanel wallet={wallet} balance={balance} onBalance={() => updateBalance(wallet)} />
        <TransferPanel wallet={wallet} balance={balance} onBalance={() => updateBalance(wallet)} />
      </div>
      <AssetLabPanel
        wallet={wallet}
        revBalance={balance}
        onRevBalance={() => updateBalance(wallet)}
      />
      <ExchangePanel wallet={wallet} onRevBalance={() => updateBalance(wallet)} />
    </div>
  )
}

function TransferPanel({
  wallet,
  balance,
  onBalance,
}: {
  wallet: RholoxWallet
  balance: number | null
  onBalance: () => Promise<void>
}) {
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
    try {
      const next = await sendRev(wallet, recipient, amount)
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
        <div>
          <div className="eyebrow">REV TRANSFER</div>
          <h2>Send test REV with a signed deploy.</h2>
        </div>
        <span className="badge">PUBLIC TESTNET</span>
      </div>
      <p className="proof-copy">
        The transfer is signed locally with this session key. Rholox waits for inclusion, then
        confirms the recipient balance from finalized state.
      </p>
      <div className="transfer-grid">
        <input
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="Recipient REV address"
          aria-label="Recipient REV address"
          spellCheck={false}
          autoComplete="off"
        />
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Amount in REV"
          aria-label="Amount in REV"
          inputMode="decimal"
        />
      </div>
      <div className="wallet-controls">
        <button
          className="primary"
          onClick={transfer}
          disabled={busy || !recipient.trim() || !amount.trim()}
        >
          {busy ? 'SIGNING / VERIFYING…' : 'SEND TEST REV'}
        </button>
        <span className="muted">
          Available: {balance === null ? '—' : `${dropsToRev(balance)} REV`}
        </span>
      </div>
      {receipt && (
        <div className="proof-receipt">
          <div>
            <span>AMOUNT</span>
            <strong>{receipt.amountRev} REV</strong>
          </div>
          <div>
            <span>TO</span>
            <code>{receipt.to}</code>
          </div>
          <div>
            <span>DEPLOY</span>
            <code>{receipt.deployId}</code>
          </div>
          <div>
            <span>INCLUSION</span>
            <code>
              #{receipt.inclusionBlock.blockNumber} ·{' '}
              {short(receipt.inclusionBlock.blockHash, 14, 10)}
            </code>
          </div>
          <div>
            <span>FINALITY</span>
            <strong className={receipt.finalized ? 'receipt-good' : 'receipt-warn'}>
              {receipt.finalized
                ? `VERIFIED @ #${receipt.finalizedBlock?.blockNumber}`
                : 'PENDING — inclusion verified'}
            </strong>
          </div>
          <div>
            <span>RECIPIENT</span>
            <code>
              {receipt.recipientBalanceAfter === undefined
                ? '—'
                : `${dropsToRev(receipt.recipientBalanceAfter)} REV`}
            </code>
          </div>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </section>
  )
}

function ProofPanel({
  wallet,
  balance,
  onBalance,
}: {
  wallet: RholoxWallet
  balance: number | null
  onBalance: () => Promise<void>
}) {
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
        <div>
          <div className="eyebrow">PROOF</div>
          <h2>Anchor a SHA-256 proof on the public testnet.</h2>
        </div>
        <span className="badge">SIGNED DEPLOY</span>
      </div>
      <p className="proof-copy">
        The payload stays in your browser. Rholox hashes it locally, signs a Rholang deploy with
        this session key, then waits for inclusion and verifies the proof against finalized state.
      </p>
      <textarea
        value={payload}
        onChange={(event) => setPayload(event.target.value)}
        aria-label="Proof payload"
        maxLength={500}
        spellCheck={false}
      />
      <div className="wallet-controls">
        <button className="primary" onClick={anchor} disabled={busy || !payload.trim()}>
          {busy ? 'SIGNING / VERIFYING…' : 'SIGN + ANCHOR PROOF'}
        </button>
      </div>
      {receipt && (
        <div className="proof-receipt">
          <div>
            <span>SHA-256</span>
            <code>{receipt.sha256}</code>
          </div>
          <div>
            <span>DEPLOY</span>
            <code>{receipt.deployId}</code>
          </div>
          <div>
            <span>INCLUSION</span>
            <code>
              #{receipt.inclusionBlock.blockNumber} ·{' '}
              {short(receipt.inclusionBlock.blockHash, 14, 10)}
            </code>
          </div>
          <div>
            <span>FINALITY</span>
            <strong className={receipt.finalized ? 'receipt-good' : 'receipt-warn'}>
              {receipt.finalized
                ? `VERIFIED @ #${receipt.finalizedBlock?.blockNumber}`
                : 'PENDING — inclusion verified'}
            </strong>
          </div>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </section>
  )
}

function ExplorerPanel() {
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

  useEffect(() => {
    void loadRecent()
  }, [])

  async function openBlock(hash: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    setBlock(null)
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
    try {
      if (/^[0-9a-fA-F]{64}$/.test(value)) {
        setBlock(await getBlockByHash(value))
      } else if (/^\d+$/.test(value)) {
        const match = recent.find((item) => item.blockNumber === Number(value))
        if (!match)
          throw new Error(
            'That height is not in the recent block window. Paste a block hash for older blocks.',
          )
        setBlock(await getBlockByHash(match.blockHash))
      } else {
        setDeployStatus((await readDeployStatus(value)) as Record<string, unknown>)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Explorer lookup failed.')
    } finally {
      setBusy(false)
    }
  }

  const deployBlock =
    deployStatus && 'ProcessedWithSuccess' in deployStatus
      ? (deployStatus.ProcessedWithSuccess as { block?: LightBlock }).block
      : deployStatus && 'ProcessedWithError' in deployStatus
        ? (deployStatus.ProcessedWithError as { block?: LightBlock }).block
        : null

  return (
    <section className="explorer-card" id="explorer">
      <div className="panel-head">
        <div>
          <div className="eyebrow">EXPLORER</div>
          <h2>Inspect blocks and deploy evidence.</h2>
        </div>
        <button className="ghost" onClick={loadRecent} disabled={recentLoading}>
          {recentLoading ? 'LOADING…' : 'REFRESH BLOCKS'}
        </button>
      </div>
      <div className="explorer-search">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void lookup()
          }}
          placeholder="Block hash, recent height, or deploy ID"
          aria-label="Explorer lookup"
          spellCheck={false}
        />
        <button className="primary" onClick={lookup} disabled={busy || !query.trim()}>
          {busy ? 'LOOKING…' : 'LOOK UP'}
        </button>
      </div>

      {recentLoading && !recentLoaded && (
        <div className="empty-state" role="status">
          Loading recent blocks…
        </div>
      )}
      {!recentLoading && recentLoaded && recent.length === 0 && (
        <div className="empty-state" role="status">
          No recent blocks were returned by the connected node.
        </div>
      )}
      {recentError && (
        <div className="error" role="alert">
          {recentError}
          {recent.length ? ' Showing the last successful observation.' : ''}
        </div>
      )}
      {recentError && recent.length > 0 && (
        <div className="stale-note" role="status">
          Recent block list may be stale.
        </div>
      )}

      <div className="recent-blocks" aria-busy={recentLoading}>
        {recent.map((item) => (
          <button
            key={item.blockHash}
            className="block-row"
            onClick={() => openBlock(item.blockHash)}
            disabled={busy}
          >
            <span className="block-height">#{item.blockNumber}</span>
            <code>{short(item.blockHash, 14, 10)}</code>
            <span>
              {item.deployCount} deploy{item.deployCount === 1 ? '' : 's'}
            </span>
            <span>{item.rejectedDeploys.length} rejected</span>
          </button>
        ))}
      </div>

      {block && (
        <div className="explorer-detail">
          <div>
            <span>BLOCK</span>
            <strong>#{block.blockInfo.blockNumber}</strong>
          </div>
          <div>
            <span>HASH</span>
            <code>{block.blockInfo.blockHash}</code>
          </div>
          <div>
            <span>PROPOSER</span>
            <code>{block.blockInfo.sender}</code>
          </div>
          <div>
            <span>STATE</span>
            <code>
              {short(block.blockInfo.preStateHash, 14, 10)} →{' '}
              {short(block.blockInfo.postStateHash, 14, 10)}
            </code>
          </div>
          <div>
            <span>JUSTIFICATIONS</span>
            <strong>{block.blockInfo.justifications.length}</strong>
          </div>
          <div>
            <span>BONDS</span>
            <strong>{block.blockInfo.bonds.length}</strong>
          </div>
          <div>
            <span>DEPLOYS</span>
            <strong>{block.deploys.length}</strong>
          </div>
          <div>
            <span>REJECTED</span>
            <strong>{block.blockInfo.rejectedDeploys.length}</strong>
          </div>
          {block.deploys.map((deploy) => (
            <div className="deploy-detail" key={deploy.sig}>
              <span>DEPLOY {short(deploy.sig, 12, 10)}</span>
              <code>
                {short(deploy.deployer, 16, 12)} · cost {deploy.cost} ·{' '}
                {deploy.errored ? 'ERROR' : 'SUCCESS'}
              </code>
            </div>
          ))}
        </div>
      )}

      {deployStatus && (
        <div className="explorer-detail">
          <div>
            <span>DEPLOY STATUS</span>
            <strong>
              {'ProcessedWithSuccess' in deployStatus
                ? 'PROCESSED · SUCCESS'
                : 'ProcessedWithError' in deployStatus
                  ? 'PROCESSED · ERROR'
                  : 'NOT PROCESSED'}
            </strong>
          </div>
          {deployBlock && (
            <div>
              <span>BLOCK</span>
              <button className="text-button" onClick={() => openBlock(deployBlock.blockHash)}>
                #{deployBlock.blockNumber} · {short(deployBlock.blockHash, 14, 10)}
              </button>
            </div>
          )}
          {'NotProcessed' in deployStatus && (
            <div>
              <span>STATE</span>
              <code>{JSON.stringify(deployStatus.NotProcessed)}</code>
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </section>
  )
}

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [feedback, setFeedback] = useState('')
  async function copy() {
    try {
      await copyText(value)
      setFeedback('Copied')
    } catch {
      setFeedback('Clipboard unavailable')
    }
    window.setTimeout(() => setFeedback(''), 2500)
  }
  return (
    <button
      type="button"
      className="mini"
      onClick={copy}
      aria-label={feedback || `${label} ${value}`}
    >
      <span aria-live="polite">{feedback || label}</span>
    </button>
  )
}

function App() {
  const [status, setStatus] = useState<NodeStatus | null>(null)
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [finalized, setFinalized] = useState<Finalized | null>(null)
  const [observer, setObserver] = useState<ObserverReport | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(null)
  const [finalizedError, setFinalizedError] = useState<string | null>(null)
  const [observerError, setObserverError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState(0)
  const [finalizedAt, setFinalizedAt] = useState(0)
  const [capabilitiesAt, setCapabilitiesAt] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [refreshing, setRefreshing] = useState(false)
  const [active, setActive] = useState('network')
  const request = useRef<AbortController | null>(null)
  const generation = useRef(0)

  async function refresh() {
    if (request.current) return
    const controller = new AbortController()
    const current = ++generation.current
    request.current = controller
    setRefreshing(true)
    const [statusResult, capabilitiesResult, finalizedResult, observerResult] =
      await Promise.allSettled([
        getJson<NodeStatus>('/api/status', controller.signal),
        getJson<Capabilities>('/api/v1/capabilities', controller.signal),
        getJson<Finalized>('/api/last-finalized-block', controller.signal),
        getObserverObservation(controller.signal),
      ])
    if (controller.signal.aborted || current !== generation.current) return
    const at = Date.now()
    const message = (reason: unknown) =>
      reason instanceof Error ? reason.message : 'Request failed.'
    if (statusResult.status === 'fulfilled') {
      setStatus(statusResult.value)
      setStatusError(null)
      setUpdatedAt(at)
    } else setStatusError(message(statusResult.reason))
    if (capabilitiesResult.status === 'fulfilled') {
      setCapabilities(capabilitiesResult.value)
      setCapabilitiesError(null)
      setCapabilitiesAt(at)
    } else setCapabilitiesError(message(capabilitiesResult.reason))
    if (finalizedResult.status === 'fulfilled') {
      setFinalized(finalizedResult.value)
      setFinalizedError(null)
      setFinalizedAt(at)
    } else setFinalizedError(message(finalizedResult.reason))
    if (observerResult.status === 'fulfilled') {
      setObserver(observerResult.value)
      setObserverError(null)
    } else setObserverError(message(observerResult.reason))
    request.current = null
    setNow(at)
    setRefreshing(false)
  }

  useEffect(() => {
    void refresh()
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 15_000)
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    const onVisible = () => {
      setNow(Date.now())
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(poll)
      window.clearInterval(clock)
      document.removeEventListener('visibilitychange', onVisible)
      ++generation.current
      request.current?.abort()
      request.current = null
    }
  }, [])

  useEffect(() => {
    const listener = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-80px 0px -55% 0px', threshold: 0 },
    )
    document.querySelectorAll('section[id]').forEach((section) => listener.observe(section))
    return () => listener.disconnect()
  }, [])

  const evidence = evidenceState(observer, observerError, now)
  const reference = observer?.verdict.reference
  const fresh = (at: number, error: string | null) => Boolean(at && !error && now - at < 45_000)
  const gatewayFresh = fresh(updatedAt, statusError)
  const finalizedFresh = fresh(finalizedAt, finalizedError)
  const capabilitiesFresh = fresh(capabilitiesAt, capabilitiesError)
  const bonds = finalized?.blockInfo?.bonds ?? []
  const totalStake = useMemo(
    () => bonds.reduce((sum, bond) => sum + BigInt(bond.stake), 0n).toString(),
    [bonds],
  )
  const checks = observer?.ancestry_checks ?? []
  const verifiedBlocks = checks.reduce(
    (sum, check) => sum + check.cryptographically_verified_blocks,
    0,
  )
  const age = evidence.ageMs === null ? '—' : `${Math.floor(Math.max(0, evidence.ageMs) / 1000)}s`
  const observationTime = observer
    ? new Date(observer.observed_at_ms).toUTCString()
    : 'Awaiting first sample'
  const nav = [
    { id: 'network', name: 'Network Console', icon: '◈' },
    { id: 'explorer', name: 'Explorer', icon: '⌕' },
    { id: 'wallet', name: 'Wallet + Test REV', icon: '▣' },
    { id: 'proof', name: 'Rholox Proof', icon: '◇' },
    { id: 'transfer', name: 'REV transfer', icon: '⇄' },
    { id: 'asset-lab', name: 'Asset Lab', icon: '▧' },
    { id: 'exchange', name: 'Exchange Core', icon: '⇌' },
  ]

  function downloadEvidence() {
    if (!observer) return
    const blob = new Blob([JSON.stringify(observer, null, 2) + '\n'], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `rholox-observation-${observer.observed_at_ms}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="console-shell">
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <a className="brand" href="#network" aria-label="Rholox home">
          <img src={rholoxLogo} alt="" width="34" height="34" />
          <span>
            rholox<span className="brand-period">.</span>
          </span>
        </a>
        <div className="sidebar-caption">
          PROTOCOL WORKSPACE <span>01</span>
        </div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {nav.map((item, index) => (
            <React.Fragment key={item.id}>
              {index === 0 && <span className="nav-group">OBSERVE</span>}
              {index === 2 && <span className="nav-group">INTERACT</span>}
              <a
                href={`#${item.id}`}
                aria-current={active === item.id ? 'location' : undefined}
                onClick={() => setActive(item.id)}
              >
                <span className="nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.name}</span>
                <span className="nav-number">0{index + 1}</span>
              </a>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="testnet-note">
            <span className="small-square" />
            PUBLIC TESTNET
          </div>
          <p>
            Test value only.
            <br />
            The network may reset.
          </p>
          <a
            href="https://github.com/rchain-community/rchain-observer"
            target="_blank"
            rel="noreferrer"
          >
            Observer source <span aria-hidden="true">↗</span>
          </a>
          <a href="https://github.com/aixaria0/Rholox" target="_blank" rel="noreferrer">
            Workspace source <span aria-hidden="true">↗</span>
          </a>
        </div>
      </aside>

      <div className="workspace-column">
        <header className="topbar">
          <div className="breadcrumb">
            RChain <span>/</span> <strong>Public testnet</strong>
          </div>
          <div className="top-actions">
            <span
              className={`environment-pill ${evidence.tone === 'good' ? 'environment-pill--online' : observer ? 'environment-pill--degraded' : 'environment-pill--pending'}`}
            >
              <span className="dot" />
              {evidence.label}
            </span>
            <button
              type="button"
              className="ghost compact"
              onClick={() => void refresh()}
              disabled={refreshing}
              aria-label="Refresh network evidence"
            >
              <span
                className={refreshing ? 'refresh-icon spinning' : 'refresh-icon'}
                aria-hidden="true"
              >
                ↻
              </span>
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </header>
        <main id="workspace" className="app-shell" tabIndex={-1}>
          <section id="network" aria-labelledby="network-title">
            <div className="page-heading">
              <div>
                <div className="eyebrow">NETWORK & EVIDENCE</div>
                <h1 id="network-title">
                  A clear view of the chain<span>.</span>
                </h1>
                <p>
                  Compare finalized observations. Inspect the evidence. Keep uncertainty visible.
                </p>
              </div>
              <div className="page-heading-meta">
                <span className="live-label">PUBLIC TESTNET · TEST VALUE ONLY</span>
                <span>
                  Network <strong>{reference?.network_id ?? status?.networkId ?? '—'}</strong>
                </span>
                <span>
                  Shard <code>{reference?.shard_id ?? status?.shardId ?? '—'}</code>
                </span>
              </div>
            </div>

            <div className={`evidence-overview tone-${evidence.tone}`}>
              <div className="overview-copy">
                <div className="eyebrow">
                  <span className="signal-dot" />
                  MULTI-NODE OBSERVATION
                </div>
                <h2 aria-live="polite" aria-atomic="true">
                  {evidence.label}
                </h2>
                <p>{evidence.detail}</p>
                <div className="overview-actions">
                  <a className="text-button" href="#source-observations">
                    Inspect source observations <span aria-hidden="true">↓</span>
                  </a>
                  <button
                    className="text-button"
                    type="button"
                    onClick={downloadEvidence}
                    disabled={!observer}
                  >
                    Download JSON <span aria-hidden="true">↗</span>
                  </button>
                </div>
              </div>
              <div className="coverage-display">
                <div className="coverage-number">
                  {observer?.verdict.comparable_nodes ?? '—'}
                  <span>/{observer?.verdict.observed_nodes ?? '—'}</span>
                </div>
                <span className="eyebrow">COMPARABLE SOURCES</span>
                <div className="source-dots">
                  {observer ? (
                    observer.observations.map((node) => (
                      <span
                        title={`${node.node}: ${comparableIdentity(node) ? 'comparable' : (node.error ?? 'incomplete')}`}
                        className={
                          comparableIdentity(node)
                            ? 'source-dot source-dot--available'
                            : 'source-dot'
                        }
                        key={node.node}
                      >
                        {node.node}
                      </span>
                    ))
                  ) : (
                    <span className="muted">Connecting to observer…</span>
                  )}
                </div>
              </div>
              <div className="overview-footer">
                <span>
                  Sample age <strong>{age}</strong>
                  <span className="footer-divider">/</span>Freshness limit 30s · refresh 15s
                </span>
                <span>{observationTime}</span>
              </div>
            </div>
            {observerError && (
              <p className="error" role="alert">
                {observerError}
                {observer ? ' Last successful evidence is shown for inspection.' : ''}
              </p>
            )}

            <div className="status-grid">
              <Metric
                label="LATEST HEIGHT"
                value={
                  observer
                    ? observerHeightRange(observer.heights.latest_min, observer.heights.latest_max)
                    : '—'
                }
                sub="range across responding sources"
              />
              <Metric
                label="FINALIZED HEIGHT"
                value={
                  observer
                    ? observerHeightRange(
                        observer.heights.finalized_min,
                        observer.heights.finalized_max,
                      )
                    : '—'
                }
                sub="reported snapshots · not a certificate"
              />
              <Metric
                label="REACHABLE NODES"
                value={
                  observer
                    ? `${observer.heights.reachable_nodes} / ${observer.verdict.observed_nodes}`
                    : '—'
                }
                sub="HTTP reachability is not comparability"
              />
              <Metric
                label="RAW ANCESTRY CHECKS"
                value={observer ? checks.length : '—'}
                sub={
                  checks.length
                    ? `${verifiedBlocks} verified block reads across checks`
                    : !observer
                      ? 'awaiting first report'
                      : observer.verdict.class === 'agreement'
                        ? 'not required for identical snapshots'
                        : 'no raw ancestry evidence returned'
                }
              />
            </div>

            <div className="evidence-layout">
              <article id="source-observations" className="panel sources-panel">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow">01 / SOURCE MATRIX</div>
                    <h2>Finalized observations</h2>
                  </div>
                  <span className={`badge ${evidence.tone === 'good' ? 'badge--verified' : ''}`}>
                    {observer ? observer.verdict.class.replaceAll('_', ' ') : 'awaiting'}
                  </span>
                </div>
                <p className="panel-description">
                  One row per configured endpoint. Matching snapshots do not independently establish
                  consensus finality.
                </p>
                <div
                  className="table-scroll"
                  role="region"
                  aria-label="Observed testnet nodes"
                  tabIndex={0}
                >
                  <table className="source-table">
                    <caption className="sr-only">
                      Per-node transport, identity, height and finalized hash
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Source</th>
                        <th scope="col">Identity</th>
                        <th scope="col">Latest</th>
                        <th scope="col">Finalized</th>
                        <th scope="col">Finalized hash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {observer?.observations.map((node) => (
                        <tr key={node.node}>
                          <th scope="row">
                            <span
                              className={`node-avatar ${comparableIdentity(node) ? 'node-avatar--ok' : 'node-avatar--warning'}`}
                            >
                              {node.node}
                            </span>
                            <small>
                              {node.reachable
                                ? comparableIdentity(node)
                                  ? 'Comparable'
                                  : 'Incomplete'
                                : 'Unreachable'}
                            </small>
                          </th>
                          <td>
                            <span>{node.network_id ?? '—'}</span>
                            <small>{node.shard_id ?? '—'}</small>
                          </td>
                          <td>{node.latest_block ?? '—'}</td>
                          <td>{node.finalized_block ?? '—'}</td>
                          <td>
                            <details className="hash-detail">
                              <summary title={node.finalized_hash ?? undefined}>
                                {short(node.finalized_hash ?? undefined, 8, 6)}
                              </summary>
                              <code>{node.finalized_hash ?? 'No finalized hash returned'}</code>
                              {node.finalized_hash && (
                                <CopyButton value={node.finalized_hash} label="Copy hash" />
                              )}
                            </details>
                            {node.error && <span className="node-error">{node.error}</span>}
                          </td>
                        </tr>
                      ))}
                      {!observer && (
                        <tr>
                          <td colSpan={5} className="empty-state">
                            {observerError
                              ? 'No validated observer report available.'
                              : 'Waiting for source observations…'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="reference-row">
                  <span>REFERENCE HASH</span>
                  <code>{reference?.block_hash ?? 'No comparable reference'}</code>
                  {reference && <CopyButton value={reference.block_hash} label="Copy reference" />}
                </div>
              </article>

              <aside className="panel trust-panel">
                <div className="eyebrow">02 / EVIDENCE BOUNDARY</div>
                <h2>What this establishes</h2>
                <dl>
                  <div>
                    <dt>Snapshot comparison</dt>
                    <dd>
                      {observer
                        ? `${observer.verdict.comparable_nodes} comparable sources`
                        : 'Awaiting evidence'}
                    </dd>
                  </div>
                  <div>
                    <dt>Raw ancestry</dt>
                    <dd>
                      {checks.length
                        ? `${verifiedBlocks} hash + signature verified reads`
                        : 'No ancestry evidence in this report'}
                    </dd>
                  </div>
                  <div>
                    <dt>Consensus certificate</dt>
                    <dd>Not verified by this observer</dd>
                  </div>
                  <div>
                    <dt>Source independence</dt>
                    <dd>Endpoint labels; operator diversity is not attested</dd>
                  </div>
                </dl>
                <p>
                  Signatures bind raw blocks to proposer keys. Validator membership, stake,
                  consensus execution and the correctness of reported finality are outside this
                  check.
                </p>
                <a
                  className="source-link"
                  href={`${RCHAIN_API}/observer/v1/observation`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open observer API <span aria-hidden="true">↗</span>
                </a>
              </aside>
            </div>

            {checks.length > 0 && (
              <article className="panel ancestry-panel">
                <div className="panel-head">
                  <div>
                    <div className="eyebrow">JUSTIFICATION PATHS</div>
                    <h2>Ancestry evidence</h2>
                  </div>
                  <span className="badge">{checks.length} checks</span>
                </div>
                {checks.map((check) => (
                  <details
                    className={`ancestry-check tone-${check.class === 'conflicting_finalized_history' ? 'danger' : 'warning'}`}
                    key={`${check.lower.block_hash}:${check.higher.block_hash}`}
                  >
                    <summary>
                      <strong>{check.class.replaceAll('_', ' ')}</strong>
                      <span>
                        #{check.lower.block_number} → #{check.higher.block_number}
                      </span>
                      <span>
                        {check.cryptographically_verified_blocks} verified / {check.examined_blocks}{' '}
                        examined
                      </span>
                    </summary>
                    <p>{check.reason}</p>
                    <dl>
                      <div>
                        <dt>Witness</dt>
                        <dd>{check.witness_node ?? 'None'}</dd>
                      </div>
                      <div>
                        <dt>Lower identity</dt>
                        <dd>
                          <code>{check.lower.block_hash}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>Higher identity</dt>
                        <dd>
                          <code>{check.higher.block_hash}</code>
                        </dd>
                      </div>
                    </dl>
                    {check.path.length > 0 && (
                      <ol className="ancestry-path">
                        {check.path.map((hash) => (
                          <li key={hash}>
                            <code>{hash}</code>
                          </li>
                        ))}
                      </ol>
                    )}
                  </details>
                ))}
              </article>
            )}

            <div className="gateway-strip">
              <div className="gateway-heading">
                <span className={`signal-dot ${gatewayFresh ? 'signal-dot--good' : ''}`} />
                <div>
                  <strong>Execution gateway</strong>
                  <small>Single-source execution view</small>
                </div>
                <span className="badge">
                  {gatewayFresh
                    ? 'Responding'
                    : status
                      ? 'Stale'
                      : statusError
                        ? 'Unavailable'
                        : 'Awaiting'}
                </span>
              </div>
              <div>
                <span>Latest</span>
                <strong>{status?.latestBlockNumber ?? '—'}</strong>
              </div>
              <div>
                <span>Finalized</span>
                <strong>
                  {finalized?.blockInfo?.blockNumber ?? '—'}
                  {!finalizedFresh && finalized ? ' · stale' : ''}
                </strong>
              </div>
              <div>
                <span>Bonded entries</span>
                <strong>{finalized ? bonds.length : '—'}</strong>
                <small>
                  {finalizedFresh && bonds.length
                    ? `${totalStake} reported stake`
                    : 'source-reported'}
                </small>
              </div>
              <div>
                <span>Faucet</span>
                <strong>
                  {capabilitiesFresh
                    ? observedBoolean(capabilities?.faucet, 'Available', 'Unavailable')
                    : 'Unknown'}
                </strong>
              </div>
              <a
                href={`${RCHAIN_API}/api/status`}
                target="_blank"
                rel="noreferrer"
                aria-label="Open raw execution node status"
              >
                ↗
              </a>
            </div>
            {(statusError || capabilitiesError || finalizedError) && (
              <div className="gateway-errors" role="status">
                {statusError && <p>Execution status: {statusError}</p>}
                {finalizedError && <p>Finalized read: {finalizedError}</p>}
                {capabilitiesError && <p>Capabilities: {capabilitiesError}</p>}
              </div>
            )}
          </section>

          <div className="workspace-divider">
            <div className="eyebrow">SIGNED INTERACTIONS</div>
            <h2>Your testnet workspace</h2>
            <p>
              Session keys stay in this browser. Every action keeps submission, inclusion and
              finalized read-back distinct.
            </p>
          </div>
          <WalletPanel />
          <ExplorerPanel />
          <footer>
            <span>Rholox · public testnet · test value only</span>
            <div className="footer-links">
              <a
                href="https://github.com/rchain-community/rchain-observer#trust-boundary"
                target="_blank"
                rel="noreferrer"
              >
                Trust boundary ↗
              </a>
              <a href="https://github.com/aixaria0/Rholox" target="_blank" rel="noreferrer">
                Source ↗
              </a>
              <a
                href={`${import.meta.env.BASE_URL}third-party-notices.txt`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Third-party notices ↗
              </a>
            </div>
          </footer>
        </main>
      </div>
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount())
