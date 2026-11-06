import { useState } from 'react'
import './rho-observer.css'
import { comparableIdentity, evidenceState, EVIDENCE_MAX_AGE_MS } from './lib/observer'
import type { ObserverReport } from './lib/rchain'

type Props = {
  report: ObserverReport | null
  error: string | null
  now: number
  onDownload: () => void
}

function count(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString('en-US') : '—'
}

function range(min: number | null | undefined, max: number | null | undefined) {
  if (typeof min !== 'number' || typeof max !== 'number') return '—'
  return min === max ? count(min) : count(min) + ' – ' + count(max)
}

function shortened(value: string | null | undefined) {
  if (!value) return 'No finalized hash'
  return value.slice(0, 9) + '…' + value.slice(-8)
}

export default function RhoObserverPanel({ report, error, now, onDownload }: Props) {
  const [lens, setLens] = useState<'method' | 'limits'>('method')
  const state = evidenceState(report, error, now)
  const observations = report?.observations ?? []
  const verdict = report?.verdict
  const checks = report?.ancestry_checks ?? []
  const covered = Boolean(
    report &&
      verdict &&
      verdict.observed_nodes >= 2 &&
      report.heights.reachable_nodes === verdict.observed_nodes &&
      verdict.comparable_nodes === verdict.observed_nodes,
  )
  const ageValid = state.ageMs !== null &&
    state.ageMs >= 0 &&
    state.ageMs < EVIDENCE_MAX_AGE_MS &&
    !error &&
    state.label !== 'Clock mismatch'
  // This is a browser-side rendering of the documented readiness predicate,
  // not a remote consensus-finality or independently attested operator claim.
  const policyReady = Boolean(
    covered &&
    ageValid &&
    (verdict?.class === 'agreement' || verdict?.class === 'proven_lag'),
  )
  const freshness = state.ageMs === null ? '—' : Math.floor(state.ageMs / 1000) + 's'
  const verified = checks.reduce((total, check) => total + check.cryptographically_verified_blocks, 0)
  const observedTime = report
    ? new Date(report.observed_at_ms).toLocaleString('en-GB', {
        timeZone: 'UTC',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) + ' UTC'
    : 'No sample received'

  return (
    <section id="rho-observer" className="rho-experience" aria-labelledby="rho-experience-title">
      <div className="rho-identity-bar">
        <span><span className="rho-monogram">ρ</span> RHO VISION / OBSERVABILITY</span>
        <span className="rho-identity-link">READ-ONLY EVIDENCE LAYER <span aria-hidden="true">↗</span></span>
      </div>

      <div className="rho-hero-grid">
        <div className="rho-intro">
          <div className="rho-eyebrow"><span className="rho-led" /> THE NETWORK, WITHOUT THE GUESSWORK</div>
          <h2 id="rho-experience-title">Rho <em>Observer.</em></h2>
          <p className="rho-intro-lead">A second opinion for every finalized state.</p>
          <p className="rho-intro-body">
            One node can answer a request. That does not tell you what the other nodes saw.
            Rho Observer compares source-by-source evidence, verifies bounded ancestry when
            heights differ, and leaves uncertainty visible.
          </p>
          <div className="rho-hero-actions">
            <a className="rho-action-primary" href="#source-observations">Inspect source evidence <span aria-hidden="true">↗</span></a>
            <a className="rho-action-secondary" href="https://github.com/rhovision-org/rho-observer" target="_blank" rel="noopener noreferrer">
              Explore the source <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="rho-proofline">
            <span>01 / COMPARE</span><i aria-hidden="true" /><span>02 / VERIFY</span><i aria-hidden="true" /><span>03 / REPORT</span>
          </div>
        </div>

        <div className={['rho-map-panel', 'rho-state-' + state.tone].join(' ')} aria-label="Rho Observer cached network topology">
          <div className="rho-panel-top">
            <div><span className="rho-panel-kicker">CACHED NETWORK TOPOLOGY</span><strong>Source witness layer</strong></div>
            <div className="rho-signal"><span className="rho-signal-light" /> {state.label}</div>
          </div>
          <div className="rho-map-content">
            <div className="rho-map-scene" aria-hidden="true">
              <div className="rho-map-orbit rho-map-orbit-one" />
              <div className="rho-map-orbit rho-map-orbit-two" />
              <div className="rho-map-hub">
                <div className="rho-hub-emblem">ρ</div>
                <strong>OBSERVER</strong>
                <span>NO WRITE PATH</span>
              </div>
            </div>
            <div className="rho-endpoint-grid">
              {observations.length ? observations.map((node) => {
                const comparable = Boolean(comparableIdentity(node))
                return (
                  <div className={['rho-endpoint', comparable ? 'rho-endpoint-ok' : 'rho-endpoint-limited'].join(' ')} key={node.node}>
                    <div className="rho-endpoint-title">
                      <span className="rho-endpoint-dot" />
                      <strong>NODE {node.node}</strong>
                      <span>{comparable ? 'COMPARABLE' : node.reachable ? 'INCOMPLETE' : 'OFFLINE'}</span>
                    </div>
                    <div className="rho-endpoint-data">
                      <span>FINALIZED</span><strong>{count(node.finalized_block)}</strong>
                    </div>
                    <small title={node.error ?? undefined}>{node.error ?? shortened(node.finalized_hash)}</small>
                  </div>
                )
              }) : (
                <div className="rho-map-empty">
                  <span className="rho-pulse" />
                  {error ? 'Observer unavailable. No live source matrix to display.' : 'Requesting the first observation…'}
                </div>
              )}
            </div>
          </div>
          <div className="rho-map-footer">
            <span>OBSERVED <strong>{observations.length ? observedTime : '—'}</strong></span>
            <span className={policyReady ? 'rho-policy-ok' : 'rho-policy-pending'}>
              <span className="rho-policy-dot" /> POLICY {policyReady ? 'READY' : 'NOT READY'}
            </span>
          </div>
        </div>
      </div>

      <div className="rho-readouts" aria-label="Rho Observer observation metrics">
        <div className="rho-readout">
          <span>COMPARABLE COVERAGE</span>
          <strong>{report ? String(verdict?.comparable_nodes ?? 0) + ' / ' + String(verdict?.observed_nodes ?? 0) : '—'}</strong>
          <small>Complete finalized identities</small>
        </div>
        <div className="rho-readout">
          <span>NODE REACHABILITY</span>
          <strong>{report ? String(report.heights.reachable_nodes) + ' / ' + String(verdict?.observed_nodes ?? 0) : '—'}</strong>
          <small>Transport ≠ agreement</small>
        </div>
        <div className="rho-readout">
          <span>SNAPSHOT AGE</span>
          <strong>{freshness}</strong>
          <small>30-second client freshness policy</small>
        </div>
        <div className="rho-readout">
          <span>FINALIZED HEIGHT</span>
          <strong>{report ? range(report.heights.finalized_min, report.heights.finalized_max) : '—'}</strong>
          <small>Reported by reachable sources</small>
        </div>
      </div>

      <div className="rho-breakdown">
        <div className="rho-method">
          <div className="rho-heading-row">
            <div><span className="rho-panel-kicker">THE EVIDENCE PIPELINE</span><h3>How a verdict earns its name.</h3></div>
            <div className="rho-switch" role="group" aria-label="Observer explanation">
              <button type="button" className={lens === 'method' ? 'rho-switch-active' : ''} aria-pressed={lens === 'method'} onClick={() => setLens('method')}>Method</button>
              <button type="button" className={lens === 'limits' ? 'rho-switch-active' : ''} aria-pressed={lens === 'limits'} onClick={() => setLens('limits')}>Boundaries</button>
            </div>
          </div>
          {lens === 'method' ? (
            <ol className="rho-steps">
              <li><span>01</span><div><strong>Observe each source independently.</strong><p>Fetch bounded status and finalized-block snapshots. Incomplete or failed identities cannot vote.</p></div></li>
              <li><span>02</span><div><strong>Compare like with like.</strong><p>Normalize hashes and compare network, shard, finalized height and block hash. Preserve exact coverage denominators.</p></div></li>
              <li><span>03</span><div><strong>Verify the ancestry when needed.</strong><p>For height skew, inspect bounded raw preimages and check content-address hashes plus proposer signatures.</p></div></li>
              <li><span>04</span><div><strong>Publish evidence, not a proclamation.</strong><p>Expose cached rows, verdict, readiness and operational metrics. Disagreement or missing proof remains unresolved.</p></div></li>
            </ol>
          ) : (
            <div className="rho-limits-list">
              <p><strong>Not a Casper verifier.</strong> The service does not independently execute consensus, attest validator membership or calculate stake-weighted finality.</p>
              <p><strong>Not an independence certificate.</strong> Different configured HTTP endpoints are not proof of distinct operators.</p>
              <p><strong>Not a transaction executor.</strong> The observer has no keys, block-production path or deploy/write API.</p>
              <p><strong>Not an uptime promise.</strong> Readiness can be false even if the HTTP process and some endpoints respond.</p>
            </div>
          )}
        </div>
        <aside className="rho-inspector">
          <span className="rho-panel-kicker">CURRENT EVIDENCE RESULT</span>
          <div className={['rho-current-verdict', 'tone-' + state.tone].join(' ')}>
            <span className="rho-current-dot" />
            <strong>{state.label}</strong>
          </div>
          <p>{state.detail}</p>
          <dl>
            <div><dt>Verdict class</dt><dd>{verdict?.class.replaceAll('_', ' ') ?? 'Not observed'}</dd></div>
            <div><dt>Ancestry checks</dt><dd>{checks.length}</dd></div>
            <div><dt>Verified raw blocks</dt><dd>{verified}</dd></div>
            <div><dt>Readiness policy</dt><dd>{policyReady ? 'Satisfied' : 'Not satisfied'}</dd></div>
          </dl>
          <button className="rho-download" type="button" disabled={!report} onClick={onDownload}>
            Export cached observation JSON <span aria-hidden="true">↓</span>
          </button>
          <div className="rho-operator-links">
            <a href="https://testnet.rhobot.net/observer/health" target="_blank" rel="noopener noreferrer">Health ↗</a>
            <a href="https://testnet.rhobot.net/observer/ready" target="_blank" rel="noopener noreferrer">Readiness ↗</a>
            <a href="https://testnet.rhobot.net/observer/v1/observation" target="_blank" rel="noopener noreferrer">Raw JSON ↗</a>
          </div>
          <small>The browser evaluates freshness and coverage; a published report is not a consensus certificate. Service versions may differ from the repository.</small>
        </aside>
      </div>
    </section>
  )
}
