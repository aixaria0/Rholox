import { useEffect, useState } from 'react'
import { assurancePresentation, observeTransferAssurance, type AssuranceObservation } from './lib/assurance'
import type { TransferAction } from './lib/transfer'

export default function AssurancePanel({ deployId, action, gatewayUnavailable = false }: { deployId: string; action?: TransferAction; gatewayUnavailable?: boolean }) {
  const [observation, setObservation] = useState<AssuranceObservation>({ state: 'WAITING', reason: 'Waiting for assurance observations.' })
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    setBusy(true)
    setObservation({ state: 'WAITING', reason: 'Waiting for current assurance evidence.' })
    void observeTransferAssurance(deployId, action).then(value => { if (active) { setObservation(value); setBusy(false) } })
    return () => { active = false }
  }, [deployId, action, refresh])
  return <AssuranceEvidence deployId={deployId} action={action} gatewayUnavailable={gatewayUnavailable} observation={observation} busy={busy} onRefresh={() => setRefresh(n => n + 1)} />
}

export function AssuranceEvidence({ deployId, action, gatewayUnavailable = false, observation, busy = false, onRefresh = () => {} }: { deployId: string; action?: TransferAction; gatewayUnavailable?: boolean; observation: AssuranceObservation; busy?: boolean; onRefresh?: () => void }) {
  const view = assurancePresentation(observation, action, gatewayUnavailable || Boolean(action?.submissionError))
  const pkg = observation.package
  const source = pkg?.provenance?.producer ?? 'Sentinel unavailable'
  const verdict = observation.verdict
  const stages = [
    { name: 'SIGNED', status: action ? 'OBSERVED LOCALLY' : 'UNKNOWN', time: action?.signedAt, evidence: action ? `${action.signer} · session signer` : 'No local signed action in this session.' },
    { name: 'SUBMITTED', status: action?.submittedAt ? 'SUBMITTED' : 'UNKNOWN', time: action?.submittedAt, evidence: action?.submittedAt ? action.submissionSource : action?.submissionError ?? 'No submission acknowledgment observed.' },
    ...(['execution','inclusion','finalized_state'] as const).map((key) => {
      const stage = pkg?.[key]
      return { name: key === 'finalized_state' ? 'FINALIZED STATE OBSERVED' : key === 'execution' ? 'EXECUTED' : 'INCLUDED', status: stage?.status === 'OBSERVED' ? verdict?.checks[key === 'finalized_state' ? 'finalized_state_observation' : key] === 'PASS' ? 'OBSERVED' : 'OBSERVED · UNVERIFIED' : stage?.status ?? 'WAITING', time: stage?.observed_at, evidence: stage?.block_hash || stage?.finalized_block_hash ? `#${stage.block_height ?? stage.finalized_block_height} · ${stage.block_hash ?? stage.finalized_block_hash} · ${source}` : stage?.reason ?? observation.reason }
    }),
    { name: 'OBSERVER AGREEMENT', status: verdict?.agreement ?? pkg?.agreement?.status ?? 'INSUFFICIENT_EVIDENCE', time: pkg?.provenance?.generated_at, evidence: `${pkg?.observers?.length ?? 0} configured observations · ${source}. Node observations do not prove stake-weighted Casper finality.` },
    { name: 'ASSURANCE VERDICT', status: view.verdict, time: observation.policy?.now_ms, evidence: observation.reason },
  ]
  function download() {
    const blob = new Blob([JSON.stringify({ package: pkg, policy: observation.policy, verdict }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `rchain-assurance-${deployId.slice(0,16)}.json`; a.click(); URL.revokeObjectURL(url)
  }
  return <section className="assurance-panel" aria-label="RChain Assurance" aria-busy={busy}>
    <div className="panel-head"><div><div className="eyebrow">RCHAIN ASSURANCE</div><strong>{view.verdict} · {view.capability}</strong></div><button type="button" className="ghost" disabled={busy} onClick={onRefresh}>{busy ? 'OBSERVING…' : 'REFRESH EVIDENCE'}</button></div>
    <p className="muted">DEPLOY <code>{deployId}</code></p>
    <div className="assurance-stages">{stages.map(stage => <div key={stage.name}><span>{stage.name}</span><strong className={stage.status === 'PASS' ? 'receipt-good' : stage.status === 'FAIL' || stage.status === 'CONFLICT' ? 'error' : 'receipt-warn'}>{stage.status}</strong><small>{stage.time && Number.isFinite(new Date(stage.time).getTime()) ? new Date(stage.time).toISOString() : 'Timestamp unknown'} · {stage.evidence}</small></div>)}</div>
    <div className="assurance-why" role="status"><strong>WHY THIS ACTION?</strong><p>{view.why}</p></div>
    {action && <details><summary>WHAT WAS SIGNED?</summary><pre>{JSON.stringify(action.signed, null, 2)}</pre></details>}
    {pkg && <details><summary>OBSERVATION SOURCES & DIGESTS</summary><pre>{JSON.stringify({ observers: pkg.observers?.map((o: Record<string, unknown>) => ({ observer_id: o.observer_id, node_identity: o.node_identity, source: o.source, status: o.status, observed_at: o.observed_at, finalized_height: o.finalized_height, finalized_hash: o.finalized_hash, observation_digest: o.observation_digest, reason: o.reason })), provenance: pkg.provenance, payload_trust: verdict?.payload_trust ?? 'UNPINNED', received_payload_digest: observation.policy?.received_payload_digest, external_payload_digest: observation.policy?.external_payload_digest ?? null, checks: verdict?.checks },null,2)}</pre><button className="ghost" onClick={download}>DOWNLOAD EVIDENCE + POLICY</button></details>}
  </section>
}
