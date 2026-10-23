import { useState } from 'react'
import {
  checkSentinelReport, parseCapture, parseStrictJson, parseTopology, readEvidenceFile,
  type EvidenceSummary, type SentinelReportMatch,
} from './lib/network-evidence'

const DOCS = 'https://github.com/aixaria0/rchain-sentinel/blob/feat/sentinel-witness-gate/docs/SENTINEL_WITNESS_GATE.md'
const PR = 'https://github.com/aixaria0/rchain-sentinel/pull/9'

export default function NetworkEvidencePanel() {
  const [capture, setCapture] = useState<File | null>(null)
  const [topology, setTopology] = useState<File | null>(null)
  const [report, setReport] = useState<File | null>(null)
  const [summary, setSummary] = useState<EvidenceSummary | null>(null)
  const [match, setMatch] = useState<SentinelReportMatch | null>(null)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)

  function reset() {
    setSummary(null)
    setMatch(null)
    setError('')
  }

  async function inspect() {
    if (!capture || running) return
    setRunning(true)
    reset()
    try {
      const original = await readEvidenceFile(capture)
      let data = parseCapture(original.text, original.sha)
      let topologySha: string | undefined
      if (topology) {
        const file = await readEvidenceFile(topology)
        data = parseTopology(file.text, data)
        topologySha = file.sha
      }
      let binding: SentinelReportMatch | null = null
      if (report) {
        const file = await readEvidenceFile(report)
        let received: unknown
        try { received = parseStrictJson(file.text) } catch { throw new Error('Invalid Sentinel report JSON.') }
        binding = checkSentinelReport(received, data, topologySha)
      }
      setSummary(data)
      setMatch(binding)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to inspect the selected evidence.')
    } finally { setRunning(false) }
  }

  function downloadPreview() {
    if (!summary) return
    const bytes = JSON.stringify(summary, null, 2) + '\n'
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'rholox-local-incident-preview.json'
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <section className="network-evidence-section" id="network-evidence" aria-labelledby="network-evidence-title">
      <div className="panel-head">
        <div>
          <div className="eyebrow">OFFLINE VERIFICATION / SENTINEL</div>
          <h2 id="network-evidence-title">Network Evidence</h2>
          <p className="panel-description">
            Inspect read-only captures locally. This panel never contacts validators
            or uploads selected files.
          </p>
        </div>
        <span className="badge">LOCAL FILES ONLY</span>
      </div>
      <div className="network-evidence-grid">
        <div className="panel network-evidence-input">
          <div className="eyebrow">01 / IMPORT WITNESSES</div>
          <label>
            Read-only incident capture (.jsonl)
            <input type="file" accept=".jsonl,application/x-ndjson,text/plain"
              aria-label="Read-only incident capture JSONL"
              onChange={(event) => { setCapture(event.target.files?.[0] ?? null); reset() }} />
          </label>
          <label>
            Host and stake topology (.json, optional)
            <input type="file" accept=".json,application/json"
              aria-label="Optional host topology"
              onChange={(event) => { setTopology(event.target.files?.[0] ?? null); reset() }} />
          </label>
          <label>
            Sentinel Witness Gate report (.json, optional)
            <input type="file" accept=".json,application/json"
              aria-label="Optional Sentinel report for partial cross-check"
              onChange={(event) => { setReport(event.target.files?.[0] ?? null); reset() }} />
          </label>
          <button type="button" className="primary" onClick={() => void inspect()}
            disabled={!capture || running}>{running ? 'INSPECTING…' : 'INSPECT CAPTURE'}</button>
          {error && <p className="error" role="alert">{error}</p>}
          <p className="evidence-privacy">
            Files remain in browser memory. Maximum 5 MiB per file and 100 samples.
            SHA-256 identifies exact bytes, not the operator who supplied them.
          </p>
        </div>
        <div className="panel network-evidence-verdict" aria-live="polite">
          <div className="eyebrow">02 / OBSERVATION BOUNDARY</div>
          {summary ? (
            <>
              <h3 className={summary.assessment === 'REPORTED_CONFLICT_REVIEW_REQUIRED' ? 'evidence-critical' : 'evidence-caution'}>
                {summary.assessment.replaceAll('_', ' ')}
              </h3>
              <dl className="evidence-kpis">
                <div><dt>Samples</dt><dd>{summary.sampleCount}</dd></div>
                <div><dt>Sources</dt><dd>{summary.observedSources.length}</dd></div>
                <div><dt>Unanswered finality</dt><dd>{summary.unansweredFinality} / {summary.finalityRequests}</dd></div>
                <div><dt>Low memory ≤16 MB</dt><dd>{summary.lowMemory.length}</dd></div>
              </dl>
              <div className="evidence-hash">
                <span>RAW CAPTURE SHA-256</span>
                <code>{summary.sourceSha256}</code>
              </div>
              <p className="evidence-boundary">
                Consensus finality: <strong>NOT VERIFIED</strong>. Finalized-write integrity:
                {' '}<strong>NOT VERIFIED</strong>.
              </p>
            </>
          ) : (
            <div className="evidence-empty">
              <h3>No capture selected</h3>
              <p>Load an original JSONL to review reported finality, reachability,
                health timestamps and optional correlated host failure.</p>
            </div>
          )}
          {match && <p className={match.status === 'MISMATCH' ? 'error' : 'evidence-match'}>
            Native report: {match.status.replaceAll('_', ' ')}. {match.detail}
          </p>}
        </div>
      </div>

      {summary && (
        <div className="panel network-evidence-results">
          <div className="panel-head">
            <div><div className="eyebrow">03 / EVIDENCE REVIEW</div><h3>Source observations</h3></div>
            <button type="button" className="ghost compact" onClick={downloadPreview}>EXPORT LOCAL PREVIEW</button>
          </div>
          <p className="panel-description">Reported observations only. Different tips are not a
            finalized fork witness; HTTP timeout does not prove a stopped node process.</p>
          <div className="table-scroll" role="region" tabIndex={0} aria-label="Imported incident observations">
            <table className="source-table">
              <thead><tr><th scope="col">Sample UTC</th><th scope="col">Node</th>
                <th scope="col">Finality request</th><th scope="col">Finalized height</th>
                <th scope="col">Available MB</th></tr></thead>
              <tbody>
                {summary.observations.map((o, i) => (
                  <tr key={o.utc + '/' + o.label + '/' + i}>
                    <td><code>{o.utc}</code></td>
                    <th scope="row">{o.label}</th>
                    <td>{o.status.replaceAll('_', ' ')}</td>
                    <td>{o.height ?? '—'}</td>
                    <td>{o.availableMb ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="network-evidence-findings">
            <div>
              <h3>Temporal checks</h3>
              {Object.entries(summary.progress).length ? <ul>
                {Object.entries(summary.progress).map(([node, state]) => (
                  <li key={node}><strong>{node}:</strong> {state.replaceAll('_', ' ')}</li>
                ))}
              </ul> : <p>No comparable finalized-height series.</p>}
              {summary.findings.length > 0 && <ul>
                {summary.findings.map((finding, i) => (
                  <li key={i}><strong>{finding.code.replaceAll('_', ' ')}:</strong> {finding.detail}</li>
                ))}
              </ul>}
            </div>
            <div>
              <h3>Correlated host failure</h3>
              {summary.topologyUsed ? (
                <>
                  <p className="evidence-boundary">Illustrative caller-supplied topology;
                    not an authenticated bond set or a Casper CBC proof.</p>
                  <ul>{summary.hostFailures.map((f) => (
                    <li key={f.host}>
                      <strong>{f.host}:</strong> loss of {f.affected.join(', ')} leaves
                      {' '}{f.remainingStake} configured stake — {f.exceedsTwoThirds ? 'above' : 'not above'}
                      {' '}the illustrative two-thirds threshold.
                    </li>
                  ))}</ul>
                </>
              ) : <p>No host topology supplied; failure domains are unknown.</p>}
            </div>
          </div>
        </div>
      )}
      <div className="evidence-readme">
        <p>
          This browser view is a partial observation cross-check, not the Python
          reference verifier. Use <code>--verify-report</code> with original raw
          evidence for full native recomputation. Files are never automatically published.
        </p>
        <div>
          <a href={DOCS} target="_blank" rel="noopener noreferrer">Sentinel runbook ↗</a>
          <a href={PR} target="_blank" rel="noopener noreferrer">Source and review ↗</a>
        </div>
      </div>
    </section>
  )
}
