import type {
  ObserverAncestryCheck,
  ObserverFinalizedIdentity,
  ObserverNode,
  ObserverReport,
  ObserverVerdictClass,
} from './rchain'

export const EVIDENCE_MAX_AGE_MS = 30_000
const HASH = /^[0-9a-fA-F]{64}$/
const classes = [
  'agreement',
  'proven_lag',
  'height_skew',
  'majority',
  'conflicting_finalized_history',
  'divergence',
  'unavailable',
]

function requireValue(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(`Invalid observer evidence: ${detail}.`)
}
function object(value: unknown): Record<string, unknown> {
  requireValue(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'expected object',
  )
  return value as Record<string, unknown>
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 1024
}
function nullableInteger(value: unknown) {
  requireValue(value == null || integer(value), 'invalid height')
  return value as number | null | undefined
}
function nullableText(value: unknown) {
  requireValue(value == null || text(value), 'invalid text')
  return value as string | null | undefined
}
function identity(value: unknown): ObserverFinalizedIdentity {
  const v = object(value)
  requireValue(
    text(v.network_id) &&
      text(v.shard_id) &&
      integer(v.block_number) &&
      typeof v.block_hash === 'string' &&
      HASH.test(v.block_hash),
    'invalid finalized identity',
  )
  return {
    network_id: v.network_id,
    shard_id: v.shard_id,
    block_number: v.block_number,
    block_hash: v.block_hash.toLowerCase(),
  }
}
function key(value: ObserverFinalizedIdentity) {
  return JSON.stringify([value.network_id, value.shard_id, value.block_number, value.block_hash])
}
export function comparableIdentity(node: ObserverNode): ObserverFinalizedIdentity | null {
  if (
    !node.reachable ||
    node.error ||
    !text(node.network_id) ||
    !text(node.shard_id) ||
    !integer(node.finalized_block) ||
    !node.finalized_hash ||
    !HASH.test(node.finalized_hash)
  )
    return null
  return {
    network_id: node.network_id,
    shard_id: node.shard_id,
    block_number: node.finalized_block,
    block_hash: node.finalized_hash.toLowerCase(),
  }
}
function range(values: Array<number | null | undefined>) {
  const numbers = values.filter((v): v is number => typeof v === 'number')
  return numbers.length ? [Math.min(...numbers), Math.max(...numbers)] : [null, null]
}

/** Validate both shape and cross-field consistency before granting any positive UI state.
 * Ancestry signatures are checked by the observer; this client validates the report contract.
 */
export function parseObserverReport(input: unknown): ObserverReport {
  const v = object(input)
  requireValue(
    v.schema_version === undefined || v.schema_version === 1,
    'unsupported schema version',
  )
  requireValue(
    integer(v.observed_at_ms) && v.observed_at_ms > 0 && v.observed_at_ms <= 8_640_000_000_000_000,
    'invalid sample time',
  )
  requireValue(
    v.completed_at_ms === undefined || integer(v.completed_at_ms),
    'invalid completion time',
  )
  requireValue(v.duration_ms === undefined || integer(v.duration_ms), 'invalid duration')
  requireValue(
    Array.isArray(v.observations) && v.observations.length > 0 && v.observations.length <= 32,
    'invalid node count',
  )
  const names = new Set<string>()
  const observations: ObserverNode[] = v.observations.map((value) => {
    const n = object(value)
    requireValue(
      typeof n.node === 'string' && /^[a-zA-Z0-9._-]{1,64}$/.test(n.node) && !names.has(n.node),
      'duplicate or invalid node label',
    )
    names.add(n.node)
    requireValue(typeof n.reachable === 'boolean', 'missing reachability')
    const hash = nullableText(n.finalized_hash)
    return {
      node: n.node,
      reachable: n.reachable,
      network_id: nullableText(n.network_id),
      shard_id: nullableText(n.shard_id),
      latest_block: nullableInteger(n.latest_block),
      finalized_block: nullableInteger(n.finalized_block),
      finalized_hash: hash?.toLowerCase() ?? hash,
      error: nullableText(n.error),
    }
  })
  const h = object(v.heights)
  const reachable = observations.filter((n) => n.reachable)
  const [latestMin, latestMax] = range(reachable.map((n) => n.latest_block))
  const [finalizedMin, finalizedMax] = range(reachable.map((n) => n.finalized_block))
  requireValue(
    h.reachable_nodes === reachable.length &&
      (h.latest_min ?? null) === latestMin &&
      (h.latest_max ?? null) === latestMax &&
      (h.finalized_min ?? null) === finalizedMin &&
      (h.finalized_max ?? null) === finalizedMax,
    'height summary does not match node rows',
  )
  const verdict = object(v.verdict)
  requireValue(
    typeof verdict.class === 'string' && classes.includes(verdict.class) && text(verdict.summary),
    'invalid verdict',
  )
  const ids = observations
    .map(comparableIdentity)
    .filter((i): i is ObserverFinalizedIdentity => i !== null)
  requireValue(
    verdict.observed_nodes === observations.length &&
      verdict.comparable_nodes === ids.length &&
      integer(verdict.agreeing_nodes),
    'verdict coverage does not match node rows',
  )
  const reference = verdict.reference == null ? null : identity(verdict.reference)
  requireValue(
    reference ? ids.some((i) => key(i) === key(reference)) : ids.length === 0,
    'reference does not match an observed identity',
  )
  requireValue(
    verdict.agreeing_nodes ===
      (reference ? ids.filter((i) => key(i) === key(reference)).length : 0),
    'agreement count does not match reference',
  )
  requireValue(
    Array.isArray(v.ancestry_checks) && v.ancestry_checks.length <= 31,
    'invalid ancestry checks',
  )
  const ancestry: ObserverAncestryCheck[] = v.ancestry_checks.map((value) => {
    const c = object(value)
    requireValue(
      c.class === 'proven_lag' ||
        c.class === 'conflicting_finalized_history' ||
        c.class === 'unresolved_height_skew',
      'invalid ancestry class',
    )
    const lower = identity(c.lower),
      higher = identity(c.higher)
    requireValue(
      reference &&
        key(higher) === key(reference) &&
        lower.block_number < higher.block_number &&
        lower.network_id === higher.network_id &&
        lower.shard_id === higher.shard_id &&
        ids.some((i) => key(i) === key(lower)),
      'ancestry pair does not match observations',
    )
    requireValue(
      integer(c.examined_blocks) &&
        c.examined_blocks <= 4096 &&
        integer(c.cryptographically_verified_blocks) &&
        c.cryptographically_verified_blocks === c.examined_blocks,
      'invalid verified block count',
    )
    requireValue(
      Array.isArray(c.path) &&
        c.path.length <= 4096 &&
        c.path.every((p) => typeof p === 'string' && HASH.test(p)),
      'invalid ancestry path',
    )
    const path = (c.path as string[]).map((p) => p.toLowerCase())
    if (c.class === 'proven_lag')
      requireValue(
        path.length >= 2 &&
          path.length <= c.examined_blocks &&
          new Set(path).size === path.length &&
          path[0] === higher.block_hash &&
          path.at(-1) === lower.block_hash,
        'proven path does not connect endpoints',
      )
    if (c.class === 'conflicting_finalized_history')
      requireValue(c.examined_blocks > 0 && path.length === 0, 'invalid non-connection evidence')
    requireValue(text(c.reason), 'missing ancestry reason')
    const witness = nullableText(c.witness_node)
    requireValue(witness == null || names.has(witness), 'unknown ancestry witness')
    return {
      class: c.class,
      lower,
      higher,
      witness_node: witness,
      examined_blocks: c.examined_blocks,
      cryptographically_verified_blocks: c.cryptographically_verified_blocks,
      path,
      reason: c.reason,
    }
  })
  requireValue(
    new Set(ancestry.map((c) => key(c.lower))).size === ancestry.length,
    'duplicate ancestry pair',
  )
  const groups = new Set(ids.map(key))
  const networks = new Set(ids.map((i) => JSON.stringify([i.network_id, i.shard_id])))
  const heights = new Map<number, Set<string>>()
  ids.forEach((i) => {
    const hashes = heights.get(i.block_number) ?? new Set()
    hashes.add(i.block_hash)
    heights.set(i.block_number, hashes)
  })
  let expected: ObserverVerdictClass =
    ids.length === 0
      ? 'unavailable'
      : groups.size === 1
        ? 'agreement'
        : networks.size > 1
          ? 'divergence'
          : [...heights.values()].some((hashes) => hashes.size > 1)
            ? Math.max(...ids.map((i) => ids.filter((other) => key(i) === key(other)).length)) >
              ids.length / 2
              ? 'majority'
              : 'divergence'
            : 'height_skew'
  if (expected === 'height_skew') {
    requireValue(
      reference && reference.block_number === Math.max(...ids.map((i) => i.block_number)),
      'height-skew reference is not the highest observation',
    )
    const lowerCount = new Set(ids.filter((i) => i.block_number < reference.block_number).map(key))
      .size
    if (ancestry.some((c) => c.class === 'conflicting_finalized_history'))
      expected = 'conflicting_finalized_history'
    else if (ancestry.length === lowerCount && ancestry.every((c) => c.class === 'proven_lag'))
      expected = 'proven_lag'
  } else requireValue(ancestry.length === 0, 'unexpected ancestry checks')
  requireValue(verdict.class === expected, 'verdict contradicts its evidence')
  if (expected === 'majority')
    requireValue(verdict.agreeing_nodes > ids.length / 2, 'reference is not the strict majority')
  return {
    schema_version: v.schema_version as number | undefined,
    observed_at_ms: v.observed_at_ms,
    completed_at_ms: v.completed_at_ms as number | undefined,
    duration_ms: v.duration_ms as number | undefined,
    heights: {
      reachable_nodes: reachable.length,
      latest_min: latestMin,
      latest_max: latestMax,
      finalized_min: finalizedMin,
      finalized_max: finalizedMax,
    },
    observations,
    ancestry_checks: ancestry,
    verdict: {
      class: expected,
      observed_nodes: observations.length,
      comparable_nodes: ids.length,
      agreeing_nodes: verdict.agreeing_nodes,
      summary: verdict.summary,
      reference,
    },
  }
}

export function evidenceState(report: ObserverReport | null, error: string | null, now: number) {
  if (!report)
    return {
      tone: 'neutral',
      label: error ? 'Evidence unavailable' : 'Awaiting evidence',
      detail: error ?? 'Requesting the first multi-node observation.',
      ageMs: null,
    }
  const ageMs = now - report.observed_at_ms
  const clockInvalid = ageMs < -5_000 || (report.completed_at_ms ?? 0) > now + 5_000
  if (error || ageMs >= EVIDENCE_MAX_AGE_MS || clockInvalid)
    return {
      tone: 'warning',
      label: clockInvalid ? 'Clock mismatch' : 'Stale evidence',
      detail:
        error ??
        'Snapshot freshness could not be established. Refresh before relying on these observations.',
      ageMs: Math.max(0, ageMs),
    }
  const v = report.verdict
  if (['divergence', 'majority', 'conflicting_finalized_history'].includes(v.class))
    return { tone: 'danger', label: 'Conflicting observations', detail: v.summary, ageMs }
  if (v.class === 'unavailable')
    return { tone: 'warning', label: 'No comparable evidence', detail: v.summary, ageMs }
  if (
    v.observed_nodes < 2 ||
    v.comparable_nodes < v.observed_nodes ||
    report.heights.reachable_nodes < v.observed_nodes
  )
    return {
      tone: 'warning',
      label: 'Limited coverage',
      detail: `${v.comparable_nodes}/${v.observed_nodes} configured nodes returned comparable snapshots.`,
      ageMs,
    }
  if (v.class === 'agreement')
    return {
      tone: 'good',
      label: 'Snapshots agree',
      detail: `${v.agreeing_nodes}/${v.observed_nodes} configured nodes report the same finalized identity.`,
      ageMs,
    }
  if (v.class === 'proven_lag')
    return { tone: 'warning', label: 'Ancestry connected · lag observed', detail: v.summary, ageMs }
  return { tone: 'warning', label: 'Unresolved height skew', detail: v.summary, ageMs }
}
