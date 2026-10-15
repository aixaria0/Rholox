import { verifyRevTransferAssurance, type RevTransferPolicy, type RevTransferVerdict } from '@aixaria/rchain-assurance-v1'
import { assurancePayloadDigest, validateRevTransferPackage } from '@aixaria/rchain-assurance-v1/integrity'
import { fetchWithTimeout } from './rchain'
import type { TransferAction } from './transfer'

export type AssuranceConfig = {
  sentinel_url: string | null
  producer: string
  source_revision: string | null
  network_id: string
  shard_id: string
  observers: RevTransferPolicy['observers']
  min_observers: number
  min_failure_domains: number
  max_age_ms: number
  max_future_skew_ms: number
}
export type AssuranceObservation = {
  state: 'WAITING' | 'OBSERVED' | 'UNAVAILABLE' | 'REJECTED'
  reason: string
  package?: Record<string, any>
  verdict?: RevTransferVerdict
  policy?: RevTransferPolicy
}
export async function observeTransferAssurance(deployId: string, action?: TransferAction, configOverride?: AssuranceConfig): Promise<AssuranceObservation> {
  try {
    const config = configOverride ?? await (async () => {
      const response = await fetchWithTimeout('/rchain-assurance-policy.json')
      if (!response.ok) throw new Error('Assurance observer policy is unavailable.')
      return await response.json() as AssuranceConfig
    })()
    if (!config.sentinel_url || !config.source_revision || config.observers.length < 2) return { state: 'WAITING', reason: 'Waiting for operator-pinned Sentinel and observer configuration. Transfer capability remains available.' }
    const endpoint = new URL(config.sentinel_url, globalThis.location?.origin ?? 'http://localhost')
    if (endpoint.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)) throw new Error('Assurance source requires HTTPS or loopback.')
    if (!/^[0-9a-fA-F]{64,512}$/.test(deployId)) return { state: 'REJECTED', reason: 'Invalid deploy identity.' }
    const response = await fetchWithTimeout(`${endpoint.href.replace(/\/$/,'')}/api/assurance/action/${encodeURIComponent(deployId)}`, {}, 30000)
    if (!response.ok) throw new Error(`Assurance observation unavailable (HTTP ${response.status}).`)
    const text = await response.text()
    if (text.length > 32_000_000) return { state: 'REJECTED', reason: 'Assurance response exceeds size limit.' }
    let pkg: Record<string, any>
    try { pkg = JSON.parse(text) as Record<string, any> } catch { return { state: 'REJECTED', reason: 'Assurance response is not valid JSON.' } }
    const errors = validateRevTransferPackage(pkg)
    if (errors.length) return { state: 'REJECTED', reason: `Verifier rejected evidence contract: ${errors.join('; ')}` }
    if (!action || action.deployId !== deployId) return { state: 'OBSERVED', package: pkg, reason: 'Observation received. Assurance is BLOCKED: this session has no independently selected signed transfer and pre-transfer balance.' }
    // This commitment is selected from the operator-pinned transport response, never pkg.provenance.payload_digest.
    const policy: RevTransferPolicy = {
      verifier: 'rchain-rev-transfer-assurance/v1', action_id: action.deployId, deploy_id: action.deployId, claim_id: `rev-transfer:${action.deployId}`,
      network_id: config.network_id, shard_id: config.shard_id, signer: action.signer, term: action.signed.data.term,
      recipient: action.to, amount_drops: action.amountDrops, recipient_balance_before: action.recipientBalanceBefore,
      now_ms: Date.now(), max_age_ms: config.max_age_ms, max_future_skew_ms: config.max_future_skew_ms,
      min_observers: config.min_observers, min_failure_domains: config.min_failure_domains, observers: config.observers,
      producer: config.producer, source_revision: config.source_revision, expected_payload_digest: await assurancePayloadDigest(pkg),
    }
    const verdict = await verifyRevTransferAssurance(pkg, policy)
    return { state: verdict.status === 'FAIL' ? 'REJECTED' : 'OBSERVED', package: pkg, verdict, policy, reason: verdict.reasons.join(' ') || 'All required bounded checks reproduced.' }
  } catch (cause) {
    return { state: 'UNAVAILABLE', reason: cause instanceof Error ? cause.message : 'Observation plane unavailable.' }
  }
}
export function assurancePresentation(observation: AssuranceObservation, action?: TransferAction, gatewayUnavailable = false) {
  const verdict = observation.verdict?.status ?? (observation.state === 'REJECTED' ? 'FAIL' : 'BLOCKED')
  const capability = gatewayUnavailable && ['OBSERVED','REJECTED'].includes(observation.state) ? 'DEGRADED' : observation.state === 'UNAVAILABLE' ? 'INSUFFICIENT EVIDENCE' : observation.state === 'WAITING' ? 'WAITING FOR EVIDENCE' : 'OBSERVATION AVAILABLE'
  const pkg = observation.package
  let why: string
  if (observation.verdict?.agreement === 'CONFLICT' || (verdict === 'FAIL' && pkg?.agreement?.status === 'CONFLICT')) why = 'Observers reported different finalized or canonical evidence. The assurance claim failed.'
  else if (verdict === 'FAIL') why = `The assurance verifier rejected this claim. ${observation.reason}`
  else if (verdict === 'PASS') why = `Transfer execution was observed in block ${pkg?.execution?.block_hash}. Finalized-state read-back was observed at block ${pkg?.finalized_state?.finalized_block_hash}. Configured observers produced compatible evidence. The assurance verifier reproduced the required checks and returned PASS.`
  else if (action?.submittedAt && !observation.verdict?.stages.finalized_state) why = `The transfer was submitted${observation.verdict?.stages.inclusion ? ' and included' : ''}, but required finalized-state assurance evidence is not available. Assurance remains BLOCKED. ${observation.reason}`
  else why = `Assurance remains BLOCKED. ${observation.reason}`
  return { verdict, capability, why }
}
