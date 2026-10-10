import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { createWallet, walletFromPrivateKey, type RholoxWallet } from './lib/wallet'
import { createProof, type ProofReceipt } from './lib/proof'
import {
  RCHAIN_API,
  dropsToRev,
  getJson,
  readBalance,
  readDeployStatus,
  requestFaucet,
  type Capabilities,
  type FaucetResponse,
  type Finalized,
  type NodeStatus,
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
      <section className="wallet-card">
        <div className="wallet-intro">
          <div>
            <div className="eyebrow">PHASE 2 · WALLET</div>
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
              autoComplete="off"
              spellCheck={false}
            />
            <button className="ghost" onClick={importWallet}>IMPORT</button>
          </div>
        )}
        {error && <div className="error">{error}</div>}
      </section>
    )
  }

  return (
    <>
    <section className="wallet-card wallet-live">
      <div className="panel-head">
        <div>
          <div className="eyebrow">RHOLOX WALLET · SESSION ONLY</div>
          <h2>{balance === null ? 'Reading balance…' : `${dropsToRev(balance)} REV`}</h2>
        </div>
        <span className="badge">TESTNET</span>
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
      {error && <div className="error">{error}</div>}
    </section>
    <ProofPanel wallet={wallet} balance={balance} onBalance={() => updateBalance(wallet)} />
    </>
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
    <section className="proof-card">
      <div className="panel-head">
        <div><div className="eyebrow">PHASE 3 · RHOLOX PROOF</div><h2>Anchor a SHA-256 proof on RChain.</h2></div>
        <span className="badge">SIGNED DEPLOY</span>
      </div>
      <p className="proof-copy">The payload stays in your browser. Rholox hashes it locally, signs a Rholang deploy with this session key, then waits for block inclusion and checks whether the proof is visible from finalized state.</p>
      <textarea value={payload} onChange={(event) => setPayload(event.target.value)} maxLength={500} spellCheck={false} />
      <div className="wallet-controls">
        <button className="primary" onClick={anchor} disabled={busy || !payload.trim()}>{busy ? 'SIGNING / VERIFYING…' : 'SIGN + ANCHOR PROOF'}</button>
      </div>
      {receipt && (
        <div className="proof-receipt">
          <div><span>SHA-256</span><code>{receipt.sha256}</code></div>
          <div><span>DEPLOY</span><code>{receipt.deployId}</code></div>
          <div><span>INCLUSION</span><code>#{receipt.inclusionBlock.blockNumber} · {short(receipt.inclusionBlock.blockHash, 14, 10)}</code></div>
          <div><span>FINALITY</span><strong className={receipt.finalized ? 'receipt-good' : 'receipt-warn'}>{receipt.finalized ? `VERIFIED @ #${receipt.finalizedBlock?.blockNumber}` : 'PENDING — inclusion verified'}</strong></div>
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </section>
  )
}

function App() {
  const [status, setStatus] = useState<NodeStatus | null>(null)
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [finalized, setFinalized] = useState<Finalized | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    setRefreshing(true)
    try {
      const [nextStatus, nextCapabilities, nextFinalized] = await Promise.all([
        getJson<NodeStatus>('/api/status'),
        getJson<Capabilities>('/api/v1/capabilities'),
        getJson<Finalized>('/api/last-finalized-block'),
      ])
      setStatus(nextStatus)
      setCapabilities(nextCapabilities)
      setFinalized(nextFinalized)
      setUpdatedAt(new Date())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reach the RChain testnet')
    } finally {
      setRefreshing(false)
    }
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
  const online = Boolean(status && !error)

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Rholox home"><span className="mark">ρ</span><span>RHOLOX</span></a>
        <div className="top-actions">
          <span className="testnet-pill">RCHAIN TESTNET</span>
          <button className="ghost" onClick={refresh} disabled={refreshing}>{refreshing ? 'SYNCING…' : 'REFRESH'}</button>
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow">RCHAIN, OBSERVABLE.</div>
        <h1>One surface for the chain<br />and the DApps built on it.</h1>
        <p>Rholox is starting on the public RChain testnet. This console reads live node, capability, validator and finality data directly from <code>testnet.rhobot.net</code>.</p>
        <div className="status-line"><span className={`dot ${online ? 'live' : 'dead'}`} /><strong>{online ? 'NETWORK REACHABLE' : 'NETWORK UNREACHABLE'}</strong><span className="muted">{updatedAt ? `updated ${updatedAt.toLocaleTimeString()}` : 'waiting for first observation'}</span></div>
        {error && <div className="error">{error}</div>}
      </section>

      <section className="grid">
        <Metric label="NETWORK" value={status?.networkId ?? '—'} sub={status?.version?.node} />
        <Metric label="SHARD" value={status?.shardId ?? finalized?.blockInfo?.shardId ?? '—'} />
        <Metric label="CHAIN HEIGHT" value={latest ?? '—'} sub="latest observed block" />
        <Metric label="FINALIZED" value={finalBlock ?? '—'} sub={finalityGap === null ? undefined : `${finalityGap} block gap`} />
        <Metric label="BONDED VALIDATORS" value={bonds.length || '—'} sub={bonds.length ? `${totalStake} total observed stake` : undefined} />
        <Metric label="CONNECTED PEERS" value={status?.peers ?? '—'} sub={status?.nodes !== undefined ? `${status.nodes} reported nodes` : undefined} />
      </section>

      <section className="panel-row">
        <article className="panel">
          <div className="panel-head"><div><div className="eyebrow">LATEST FINALIZED</div><h2>Block evidence</h2></div><span className="badge">LIVE</span></div>
          <dl>
            <div><dt>Block</dt><dd>#{finalBlock ?? '—'}</dd></div>
            <div><dt>Hash</dt><dd title={finalized?.blockInfo?.blockHash}>{short(finalized?.blockInfo?.blockHash, 12, 10)}</dd></div>
            <div><dt>Proposer</dt><dd title={finalized?.blockInfo?.sender}>{short(finalized?.blockInfo?.sender, 12, 8)}</dd></div>
            <div><dt>Deploys</dt><dd>{finalized?.blockInfo?.deployCount ?? '—'}</dd></div>
          </dl>
        </article>
        <article className="panel">
          <div className="panel-head"><div><div className="eyebrow">CAPABILITIES</div><h2>DApp readiness</h2></div><span className="badge">TESTNET</span></div>
          <dl>
            <div><dt>Propose on deploy</dt><dd>{capabilities?.proposeOnDeploy ? 'YES' : 'NO'}</dd></div>
            <div><dt>Faucet</dt><dd>{capabilities?.faucet ? 'AVAILABLE' : 'UNAVAILABLE'}</dd></div>
            <div><dt>Dev mode</dt><dd>{capabilities?.devMode ? 'ON' : 'OFF'}</dd></div>
            <div><dt>Admin exposed</dt><dd>{capabilities?.adminHttp ? 'YES' : 'NO'}</dd></div>
          </dl>
        </article>
      </section>

      <WalletPanel />

      <section className="roadmap">
        <div><div className="eyebrow">FIRST VERTICAL SLICE</div><h2>From observation to signed deploy.</h2></div>
        <ol>
          <li className="done"><span>01</span><div><strong>Network console</strong><small>Live status, capabilities, validators and finality.</small></div></li>
          <li className="done"><span>02</span><div><strong>Wallet + test REV</strong><small>Session-only keys, faucet funding and balance reads.</small></div></li>
          <li className="active"><span>03</span><div><strong>Rholox Proof</strong><small>Signed Rholang deploy → inclusion → finalized receipt.</small></div></li>
          <li><span>04</span><div><strong>Explorer</strong><small>Block details and evidence-backed verification.</small></div></li>
        </ol>
      </section>

      <footer><span>Rholox v0.3 · testnet only · no monetary value</span><a href={`${RCHAIN_API}/api/status`} target="_blank" rel="noreferrer">RAW NODE STATUS ↗</a></footer>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
