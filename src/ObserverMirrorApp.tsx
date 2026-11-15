import { useCallback, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, ArrowDownToLine, ArrowUpRight, RefreshCw, ShieldCheck } from 'lucide-react'
import './styles.css'
import './observer-mirror.css'
import RhoObserverPanel from './RhoObserverPanel'
import { parseObserverReport, evidenceState } from './lib/observer'
import { createObserverCapture, OBSERVER_SOURCE } from './lib/observer-capture'
import type { ObserverReport } from './lib/rchain'
import logo from './assets/rholox-logo.svg'

function saveJson(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Mirror() {
  const [report, setReport] = useState<ObserverReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [refreshing, setRefreshing] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const pending = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    setRefreshing(true)
    const timeout = window.setTimeout(() => controller.abort(), 6500)
    try {
      const response = await fetch(OBSERVER_SOURCE, { method: 'GET', cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error('Observer returned HTTP ' + response.status)
      const type = response.headers.get('Content-Type') ?? ''
      if (!type.toLowerCase().includes('json')) throw new Error('Observer returned non-JSON content')
      const validated = parseObserverReport(await response.json())
      if (pending.current !== controller) return
      setReport(validated)
      setError(null)
    } catch (cause) {
      if (pending.current !== controller) return
      // Retained prior snapshot remains visible but its freshness is not asserted.
      setError(cause instanceof Error ? cause.message : 'Observation could not be obtained')
    } finally {
      window.clearTimeout(timeout)
      if (pending.current === controller) {
        pending.current = null
        setNow(Date.now())
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    // The mirror observes a cached service. Hidden tabs do not poll.
    const poll = window.setInterval(() => {
      if (!document.hidden && !pending.current) void refresh()
    }, 15000)
    const onVisible = () => { if (!document.hidden) void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      pending.current?.abort()
      window.clearInterval(tick)
      window.clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const state = evidenceState(report, error, now)
  const canExport = Boolean(report)
  const exportRaw = () => {
    if (!report) return
    saveJson('rholox-observation.json', JSON.stringify(report, null, 2) + '\n')
  }
  const exportCapture = async () => {
    if (!report) return
    setExportError(null)
    try {
      const envelope = await createObserverCapture(report)
      saveJson('rho-witness-observer-capture.json', JSON.stringify(envelope, null, 2) + '\n')
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'Capture failed')
    }
  }

  return (
    <div className="mirror-shell">
      <a href="#rho-observer" className="mirror-skip">Skip to observer evidence</a>
      <header className="mirror-header">
        <div className="mirror-brand">
          <img src={logo} alt="" width="36" height="36" />
          <div><strong>RHOLOX</strong><span>OBSERVABILITY / READ-ONLY MIRROR</span></div>
        </div>
        <nav className="mirror-links" aria-label="External project resources">
          <a href="https://github.com/aixaria0/Rholox" rel="noopener noreferrer" target="_blank">Website source <ArrowUpRight size={14} /></a>
          <a href="https://github.com/rhovision-org/rho-observer" rel="noopener noreferrer" target="_blank">Observer source <ArrowUpRight size={14} /></a>
          <a href="https://rholox.com/" rel="noopener noreferrer" target="_blank">Primary site <ArrowUpRight size={14} /></a>
        </nav>
      </header>

      <div className="mirror-context">
        <div className="mirror-context-copy">
          <span className="mirror-label">INDEPENDENT ACCESS / PUBLIC TESTNET</span>
          <h1>Rholox <em>Observer mirror</em></h1>
          <p>A read-only path to the same published Rho Observer snapshots, independent of the main website's hosting. No wallet, no signing, no transfers, no transaction submission.</p>
        </div>
        <div className="mirror-control">
          <span className={'mirror-health mirror-health--' + state.tone}><Activity size={13} />{state.label}</span>
          <button type="button" onClick={() => void refresh()} disabled={refreshing} className="mirror-refresh">
            <RefreshCw size={15} className={refreshing ? 'mirror-spinning' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh evidence'}
          </button>
        </div>
      </div>

      <main id="source-observations" className="mirror-main">
        <RhoObserverPanel report={report} error={error} now={now} onDownload={exportRaw} />
        <section className="mirror-export" aria-labelledby="mirror-export-title">
          <div><span className="mirror-label">WITNESS INTEROPERABILITY / UNSIGNED EVIDENCE</span>
            <h2 id="mirror-export-title">Bring this observation into RHO Witness.</h2>
            <p>Export a timestamped client capture with SHA-256 over the exact serialized report. Local checksum only — not a cryptographic identity or consensus certificate.</p>
          </div>
          <button type="button" className="mirror-export-button" disabled={!canExport} onClick={() => void exportCapture()}>
            <ArrowDownToLine size={17} /> Export witness capture
          </button>
          {exportError && <p role="alert" className="mirror-export-error">{exportError}</p>}
        </section>
      </main>
      <footer className="mirror-footer">
        <span><ShieldCheck size={15} /> NO KEYS · NO WRITE ROUTES · SCHEMA V1</span>
        <span>STATIC RECOVERY SURFACE — NOT A CASPER FINALITY CERTIFICATE</span>
      </footer>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<Mirror />)
