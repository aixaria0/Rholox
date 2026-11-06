import { useState } from 'react'
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Check, ChevronRight, Clock3, GitBranch, Layers3, LockKeyhole, RadioTower, ShieldAlert, ShieldCheck } from 'lucide-react'
import './rho-observer.css'
import { comparableIdentity, evidenceState, EVIDENCE_MAX_AGE_MS } from './lib/observer'
import type { ObserverReport } from './lib/rchain'

type Props = { report: ObserverReport | null; error: string | null; now: number; onDownload: () => void }
const count = (value: number | null | undefined) => typeof value === 'number' ? value.toLocaleString('en-US') : '—'
const heightRange = (a: number | null | undefined, b: number | null | undefined) =>
  typeof a !== 'number' || typeof b !== 'number' ? '—' : a === b ? count(a) : count(a) + '–' + count(b)
const shortHash = (hash: string | null | undefined) =>
  hash ? hash.slice(0, 10) + '…' + hash.slice(-8) : 'No finalized identity'

export default function RhoObserverPanel({ report, error, now, onDownload }: Props) {
  const [tab, setTab] = useState<'method' | 'boundaries'>('method')
  const evidence = evidenceState(report, error, now)
  const verdict = report?.verdict
  const observations = report?.observations ?? []
  const checks = report?.ancestry_checks ?? []
  const verified = checks.reduce((sum, check) => sum + check.cryptographically_verified_blocks, 0)
  const fullCoverage = Boolean(
    verdict && verdict.observed_nodes >= 2 &&
    verdict.comparable_nodes === verdict.observed_nodes &&
    report?.heights.reachable_nodes === verdict.observed_nodes,
  )
  const ageValid = evidence.ageMs !== null && evidence.ageMs >= 0 &&
    evidence.ageMs < EVIDENCE_MAX_AGE_MS && !error && evidence.label !== 'Clock mismatch'
  // Evidence readiness is not independent consensus, membership, or stake-based finality.
  const policyReady = Boolean(fullCoverage && ageValid &&
    (verdict?.class === 'agreement' || verdict?.class === 'proven_lag'))
  const age = evidence.ageMs === null ? '—' : Math.floor(evidence.ageMs / 1000) + 's'
  const observedAt = report
    ? new Date(report.observed_at_ms).toLocaleString('en-GB', {
        timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }) + ' UTC'
    : 'No sample'
  const tone = 'rho-signal--' + evidence.tone

  return (
    <section id="rho-observer" className="rho-experience" aria-labelledby="rho-experience-title">
      <div className="rho-frame-head">
        <div className="rho-frame-id"><span className="rho-frame-cross" aria-hidden="true">✳</span> 01 / SYSTEM OBSERVABILITY</div>
        <span className="rho-frame-meta">RHOLOX <span>/</span> PUBLIC TESTNET</span>
      </div>

      <div className="rho-masthead">
        <div className="rho-masthead-copy">
          <div className="rho-overline"><span className="rho-rail-mark" /> READ-ONLY EVIDENCE RUNTIME</div>
          <h2 id="rho-experience-title">Rho <span>Observer</span><span className="rho-title-stop">.</span></h2>
          <p className="rho-headline">Clarity across nodes. No assumed consensus.</p>
          <p className="rho-deck">Multi-source finalized-state observation with bounded ancestry verification.
            Inspect what the nodes reported—and what the evidence cannot establish.</p>
          <div className="rho-actions">
            <a href="#source-observations" className="rho-primary-action">Inspect evidence <ArrowRight size={16} aria-hidden="true" /></a>
            <a href="https://github.com/rhovision-org/rho-observer" target="_blank" rel="noopener noreferrer" className="rho-secondary-action">
              View source <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
        <aside className={'rho-status-panel ' + tone} aria-label="Current evidence status">
          <div className="rho-status-caption">CURRENT EVIDENCE / 001</div>
          <span className="rho-status-symbol" aria-hidden="true">{evidence.tone === 'good' ? <Check size={20} /> : <ShieldAlert size={20} />}</span>
          <div className="rho-status-state">{evidence.label}</div>
          <p>{evidence.detail}</p>
          <div className="rho-status-foot"><span>POLICY READINESS</span><strong>{policyReady ? 'READY' : 'NOT READY'}</strong></div>
        </aside>
      </div>

      <div className="rho-interface">
        <div className="rho-interface-heading">
          <div className="rho-section-heading">
            <span className="rho-section-index">01 / EVIDENCE SURFACE</span>
            <h3>Source correlation</h3>
            <p>Each source is a configured HTTP endpoint, not an attested validator.</p>
          </div>
          <div className={'rho-snapshot-badge ' + tone}><span className="rho-live-dot" aria-hidden="true" />{evidence.label}</div>
        </div>

        <div className="rho-node-layout">
          <div className="rho-schematic" aria-label="Read-only schematic of the first four reported source inputs">
            <div className="rho-schematic-top"><RadioTower size={15} aria-hidden="true" /> READ-ONLY INGEST</div>
            <div className="rho-schematic-body" aria-hidden="true">
              <svg className="rho-schematic-lines" viewBox="0 0 268 196" preserveAspectRatio="xMidYMid meet">
                <path d="M36 36 H95 L124 83 M232 36 H171 L144 83 M36 160 H95 L124 113 M232 160 H171 L144 113"
                  fill="none" stroke="currentColor" strokeWidth="1.2" />
                <circle cx="36" cy="36" r="3" /><circle cx="232" cy="36" r="3" />
                <circle cx="36" cy="160" r="3" /><circle cx="232" cy="160" r="3" />
              </svg>
              <div className="rho-schematic-core"><span>ρ</span><strong>OBSERVER</strong><small>NO WRITE PATH</small></div>
              {['rho-marker-one', 'rho-marker-two', 'rho-marker-three', 'rho-marker-four'].map((position, index) => (
                <span className={'rho-schematic-marker ' + position} key={position}>{observations[index]?.node ?? '–'}</span>
              ))}
            </div>
            <div className="rho-schematic-bottom"><LockKeyhole size={13} aria-hidden="true" /> KEYS NEVER HELD</div>
          </div>
          <div className="rho-node-list" aria-label="Source observations">
            {observations.length ? observations.map((node, index) => {
              const comparable = Boolean(comparableIdentity(node))
              return (
                <div className={'rho-node ' + (comparable ? 'rho-node--ok' : 'rho-node--limited')} key={node.node}>
                  <div className="rho-node-top">
                    <span className="rho-node-number">{String(index + 1).padStart(2, '0')}</span>
                    <strong>NODE {node.node}</strong>
                    <span className="rho-node-health"><i aria-hidden="true" />{comparable ? 'COMPARABLE' : node.reachable ? 'INCOMPLETE' : 'OFFLINE'}</span>
                  </div>
                  <div className="rho-node-value"><span>FINALIZED HEIGHT</span><strong>{count(node.finalized_block)}</strong></div>
                  <code title={node.error ?? node.finalized_hash ?? undefined}>{node.error ?? shortHash(node.finalized_hash)}</code>
                </div>
              )
            }) : (
              <div className="rho-node-placeholder" role="status">
                <Activity size={23} strokeWidth={1.4} aria-hidden="true" />
                <p>{error ? 'Evidence endpoint unavailable. No live node data.' : 'Awaiting the first multi-node observation.'}</p>
              </div>
            )}
          </div>
        </div>
        <div className="rho-sample-strip">
          <span><Clock3 size={14} aria-hidden="true" /> OBSERVED <strong>{observedAt}</strong></span>
          <span className={policyReady ? 'rho-policy-ready' : 'rho-policy-limited'}><span className="rho-live-dot" aria-hidden="true" />{policyReady ? 'EVIDENCE READY' : 'EVIDENCE LIMITED'}</span>
        </div>
      </div>

      <div className="rho-measures" aria-label="Evidence measurements">
        <div className="rho-measure">
          <div className="rho-measure-top"><Layers3 size={17} aria-hidden="true" /><span>COMPARABLE SOURCES</span></div>
          <strong>{verdict ? verdict.comparable_nodes + ' / ' + verdict.observed_nodes : '—'}</strong>
          <p>Complete finalized identities</p>
        </div>
        <div className="rho-measure">
          <div className="rho-measure-top"><RadioTower size={17} aria-hidden="true" /><span>REACHABLE SOURCES</span></div>
          <strong>{verdict && report ? report.heights.reachable_nodes + ' / ' + verdict.observed_nodes : '—'}</strong>
          <p>Transport reachability only</p>
        </div>
        <div className="rho-measure">
          <div className="rho-measure-top"><Clock3 size={17} aria-hidden="true" /><span>SNAPSHOT AGE</span></div>
          <strong>{age}</strong><p>30s client freshness window</p>
        </div>
        <div className="rho-measure">
          <div className="rho-measure-top"><GitBranch size={17} aria-hidden="true" /><span>FINALIZED HEIGHT</span></div>
          <strong>{report ? heightRange(report.heights.finalized_min, report.heights.finalized_max) : '—'}</strong>
          <p>Range across sources</p>
        </div>
      </div>

      <div className="rho-lower-grid">
        <article className="rho-method-card">
          <div className="rho-method-header">
            <div><span className="rho-section-index">02 / UNDER THE HOOD</span><h3>Evidence pipeline</h3></div>
            <div className="rho-tabbar" role="group" aria-label="Evidence explanation">
              <button type="button" aria-pressed={tab === 'method'} className={tab === 'method' ? 'is-active' : ''} onClick={() => setTab('method')}>Method</button>
              <button type="button" aria-pressed={tab === 'boundaries'} className={tab === 'boundaries' ? 'is-active' : ''} onClick={() => setTab('boundaries')}>Limits</button>
            </div>
          </div>
          {tab === 'method' ? (
            <ol className="rho-method-steps">
              <li><span>01</span><div><strong>Observe</strong><p>Independently read bounded status and finalized snapshots from each configured source.</p></div><ChevronRight size={15} aria-hidden="true" /></li>
              <li><span>02</span><div><strong>Correlate</strong><p>Compare network, shard, height and finalized hash without hiding incomplete responses.</p></div><ChevronRight size={15} aria-hidden="true" /></li>
              <li><span>03</span><div><strong>Verify ancestry</strong><p>For height skew, check bounded raw ancestry, block content hashes and proposer signatures.</p></div><ChevronRight size={15} aria-hidden="true" /></li>
              <li><span>04</span><div><strong>Publish</strong><p>Expose cached evidence, explicit verdicts and readiness; never claim independent Casper finality.</p></div><ChevronRight size={15} aria-hidden="true" /></li>
            </ol>
          ) : (
            <div className="rho-boundaries">
              <p><strong>No independent finality certificate.</strong> No Casper execution, validator membership check or stake-weighted quorum.</p>
              <p><strong>No operator-independence claim.</strong> Different configured endpoints may have common control.</p>
              <p><strong>No transaction signing.</strong> Observer holds no keys and submits no deploys.</p>
              <p><strong>No uptime guarantee.</strong> A responsive server does not imply fresh or consistent evidence.</p>
            </div>
          )}
        </article>
        <aside className="rho-evidence-card">
          <div className="rho-section-index">03 / OBSERVATION CONTRACT</div>
          <h3>Evidence, not inference.</h3>
          <p>{evidence.detail}</p>
          <dl>
            <div><dt>Verdict</dt><dd>{verdict?.class.replaceAll('_', ' ') ?? 'Unobserved'}</dd></div>
            <div><dt>Ancestry checks</dt><dd>{checks.length}</dd></div>
            <div><dt>Verified raw blocks</dt><dd>{verified}</dd></div>
            <div><dt>Readiness policy</dt><dd>{policyReady ? 'Satisfied' : 'Not satisfied'}</dd></div>
          </dl>
          <button type="button" className="rho-export" disabled={!report} onClick={onDownload}>
            Export observation.json <ArrowDownToLine size={16} aria-hidden="true" />
          </button>
          <div className="rho-evidence-links">
            <a href="https://testnet.rhobot.net/observer/health" target="_blank" rel="noopener noreferrer">Health <ArrowUpRight size={12} aria-hidden="true" /></a>
            <a href="https://testnet.rhobot.net/observer/ready" target="_blank" rel="noopener noreferrer">Ready <ArrowUpRight size={12} aria-hidden="true" /></a>
            <a href="https://testnet.rhobot.net/observer/v1/observation" target="_blank" rel="noopener noreferrer">JSON <ArrowUpRight size={12} aria-hidden="true" /></a>
          </div>
          <div className="rho-evidence-caution"><ShieldCheck size={16} aria-hidden="true" /> Matching endpoints do not establish stake-based finality.</div>
        </aside>
      </div>
      <div className="rho-section-footer">
        <span>RH / OBSERVER <span className="rho-footer-separator" /> EVIDENCE-BASED NETWORK VISIBILITY</span>
        <span>SCHEMA V1 / READ ONLY</span>
      </div>
    </section>
  )
}
