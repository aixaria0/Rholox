import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const API = 'https://testnet.rhobot.net'

type NodeStatus = {
  version?: { api?: string; node?: string }
  address?: string
  networkId?: string
  shardId?: string
  peers?: number
  nodes?: number
  minPhloPrice?: number
  latestBlockNumber?: number
  autopropose?: boolean
  proposeOnDeploy?: boolean
  manualPropose?: boolean
  adminHttp?: boolean
  devMode?: boolean
  finalityStall?: unknown
  finalityStallEpisodes?: number
}

type Capabilities = {
  autopropose?: boolean
  proposeOnDeploy?: boolean
  manualPropose?: boolean
  adminHttp?: boolean
  devMode?: boolean
  faucet?: boolean
  faucetRemaining?: number
}

type Finalized = {
  blockInfo?: {
    blockHash?: string
    blockNumber?: number
    shardId?: string
    sender?: string
    bonds?: Array<{ validator: string; stake: number }>
    deployCount?: number
    timestamp?: number
  }
}

function short(value?: string, left = 8, right = 6) {
  if (!value) return '—'
  if (value.length <= left + right + 1) return value
  return `${value.slice(0, left)}…${value.slice(-right)}`
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`${path} returned ${response.status}`)
  return response.json() as Promise<T>
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
        <a className="brand" href="/" aria-label="Rholox home">
          <span className="mark">ρ</span>
          <span>RHOLOX</span>
        </a>
        <div className="top-actions">
          <span className="testnet-pill">RCHAIN TESTNET</span>
          <button className="ghost" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'SYNCING…' : 'REFRESH'}
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow">RCHAIN, OBSERVABLE.</div>
        <h1>One surface for the chain<br />and the DApps built on it.</h1>
        <p>
          Rholox is starting on the public RChain testnet. This console reads live node, capability,
          validator and finality data directly from <code>testnet.rhobot.net</code>.
        </p>
        <div className="status-line">
          <span className={`dot ${online ? 'live' : 'dead'}`} />
          <strong>{online ? 'NETWORK REACHABLE' : 'NETWORK UNREACHABLE'}</strong>
          <span className="muted">{updatedAt ? `updated ${updatedAt.toLocaleTimeString()}` : 'waiting for first observation'}</span>
        </div>
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
          <div className="panel-head">
            <div>
              <div className="eyebrow">LATEST FINALIZED</div>
              <h2>Block evidence</h2>
            </div>
            <span className="badge">LIVE</span>
          </div>
          <dl>
            <div><dt>Block</dt><dd>#{finalBlock ?? '—'}</dd></div>
            <div><dt>Hash</dt><dd title={finalized?.blockInfo?.blockHash}>{short(finalized?.blockInfo?.blockHash, 12, 10)}</dd></div>
            <div><dt>Proposer</dt><dd title={finalized?.blockInfo?.sender}>{short(finalized?.blockInfo?.sender, 12, 8)}</dd></div>
            <div><dt>Deploys</dt><dd>{finalized?.blockInfo?.deployCount ?? '—'}</dd></div>
          </dl>
        </article>

        <article className="panel">
          <div className="panel-head">
            <div>
              <div className="eyebrow">CAPABILITIES</div>
              <h2>DApp readiness</h2>
            </div>
            <span className="badge">TESTNET</span>
          </div>
          <dl>
            <div><dt>Propose on deploy</dt><dd>{capabilities?.proposeOnDeploy ? 'YES' : 'NO'}</dd></div>
            <div><dt>Faucet</dt><dd>{capabilities?.faucet ? 'AVAILABLE' : 'UNAVAILABLE'}</dd></div>
            <div><dt>Dev mode</dt><dd>{capabilities?.devMode ? 'ON' : 'OFF'}</dd></div>
            <div><dt>Admin exposed</dt><dd>{capabilities?.adminHttp ? 'YES' : 'NO'}</dd></div>
          </dl>
        </article>
      </section>

      <section className="roadmap">
        <div>
          <div className="eyebrow">FIRST VERTICAL SLICE</div>
          <h2>From observation to signed deploy.</h2>
        </div>
        <ol>
          <li className="done"><span>01</span><div><strong>Network console</strong><small>Live status, capabilities, validators and finality.</small></div></li>
          <li><span>02</span><div><strong>Wallet + test REV</strong><small>Local keys, faucet funding and balance reads.</small></div></li>
          <li><span>03</span><div><strong>Rholox Proof</strong><small>Signed Rholang deploy → inclusion → finalized receipt.</small></div></li>
          <li><span>04</span><div><strong>Explorer</strong><small>Block details and evidence-backed verification.</small></div></li>
        </ol>
      </section>

      <footer>
        <span>Rholox v0.1 · testnet only · no monetary value</span>
        <a href="https://testnet.rhobot.net/api/status" target="_blank" rel="noreferrer">RAW NODE STATUS ↗</a>
      </footer>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
