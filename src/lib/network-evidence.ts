/**
 * Bounded offline preview of the Sentinel Witness Gate v1 capture format.
 * This browser reader is deliberately NOT the native Python receipt verifier.
 * No HTTP, storage, signing or mutation is performed.
 */
export type FinalityObservation = {
  label: string
  utc: string
  status: 'RESPONDED' | 'UNANSWERED' | 'NOT_PRESENT'
  height: number | null
  hash: string | null
  availableMb: number | null
  healthAgeSeconds: number | null
}

export type EvidenceFinding = {
  code: 'REPORTED_FINALIZED_IDENTITY_CONFLICT' | 'REPORTED_FINALIZED_HEIGHT_REGRESSION' | 'HEALTH_SNAPSHOT_STALE_OR_FUTURE'
  detail: string
}

export type EvidenceAssessment =
  | 'REPORTED_CONFLICT_REVIEW_REQUIRED'
  | 'INSUFFICIENT_FINALITY_OBSERVATION'
  | 'OBSERVATIONS_ONLY_NO_FINALITY_PROOF'

export type EvidenceSummary = {
  schema: 'rholox-local-incident-preview/v1'
  sourceSha256: string
  sampleCount: number
  observedSources: string[]
  sampleStartUtc: string
  sampleEndUtc: string
  unansweredFinality: number
  finalityRequests: number
  assessment: EvidenceAssessment
  observations: FinalityObservation[]
  progress: Record<string, 'REPORTED_PROGRESS' | 'NO_PROGRESS_OBSERVED' | 'REPORTED_REGRESSION_REQUIRES_REVIEW' | 'ONE_OBSERVATION_ONLY'>
  lowMemory: Array<{ source: string; utc: string; availableMb: number }>
  findings: EvidenceFinding[]
  hostFailures: Array<{ host: string; affected: string[]; remainingStake: string; exceedsTwoThirds: boolean }>
  topologyUsed: boolean
  boundary: 'LOCAL_PREVIEW_NOT_A_CASPER_FINALITY_CERTIFICATE'
}

export type SentinelReportMatch = {
  status: 'BOUND_OBSERVATIONS_MATCH' | 'MISMATCH'
  detail: string
}

const MAX_BYTES = 5 * 1024 * 1024
const LABEL = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/
const HEX64 = /^[a-f0-9]{64}$/
const UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|\+00:00)$/

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function safeHeight(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function validReply(value: unknown): Record<string, unknown> {
  const reply = record(value)
  if (!reply || typeof reply.ok !== 'boolean') throw new Error('Invalid snapshot response; ok must be boolean.')
  if (reply.sha256 !== undefined && (typeof reply.sha256 !== 'string' || !HEX64.test(reply.sha256)))
    throw new Error('Invalid response SHA-256.')
  if (reply.ok && !record(reply.data)) throw new Error('Successful response without a data object.')
  return reply
}

function sampleTimestamp(value: unknown): number {
  if (typeof value !== 'string' || !UTC.test(value)) throw new Error('Sample timestamp must be UTC.')
  const date = Date.parse(value)
  if (!Number.isFinite(date)) throw new Error('Invalid sample timestamp.')
  return date
}

function utcText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Missing UTC sample timestamp.')
  sampleTimestamp(value)
  return value
}

export function parseCapture(text: string, sourceSha256: string): EvidenceSummary {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('Capture exceeds 5 MiB.')
  const lines = text.split(/\r?\n/)
  if (lines.at(-1) === '') lines.pop()
  if (lines.length < 1 || lines.length > 100) throw new Error('Expected 1–100 JSONL samples.')
  if (!HEX64.test(sourceSha256)) throw new Error('Invalid raw capture digest.')

  const observations: FinalityObservation[] = []
  const findings: EvidenceFinding[] = []
  const lowMemory: EvidenceSummary['lowMemory'] = []
  const progressSeries = new Map<string, number[]>()
  const sourceSet = new Set<string>()
  let previous = -Infinity
  let missing = 0
  let finalityRequests = 0
  let start = ''
  let end = ''

  for (let index = 0; index < lines.length; index += 1) {
    let parsed: unknown
    try { parsed = parseStrictJson(lines[index]) } catch { throw new Error('Invalid JSONL on line ' + (index + 1)) }
    const row = record(parsed)
    if (!row || row.read_only !== true) throw new Error('Read-only snapshot required on line ' + (index + 1))
    const utc = utcText(row.sample_utc)
    const time = sampleTimestamp(utc)
    if (time <= previous) throw new Error('Capture timestamps must increase strictly.')
    previous = time
    if (index === 0) start = utc
    end = utc
    const sources = record(row.sources)
    if (!sources || Object.keys(sources).length < 1 || Object.keys(sources).length > 50)
      throw new Error('Snapshot requires 1–50 named sources.')
    const byHeight = new Map<number, Map<string, string[]>>()

    for (const [label, raw] of Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))) {
      if (!LABEL.test(label)) throw new Error('Invalid source label.')
      const kinds = record(raw)
      if (!kinds || !Object.keys(kinds).length || Object.keys(kinds).some((k) => !['status', 'health', 'finality'].includes(k)))
        throw new Error('Unsupported source response shape for ' + label)
      sourceSet.add(label)
      for (const value of Object.values(kinds)) validReply(value)
      const finality = kinds.finality === undefined ? null : validReply(kinds.finality)
      const health = kinds.health === undefined ? null : validReply(kinds.health)
      let height: number | null = null
      let hash: string | null = null
      let memory: number | null = null
      let age: number | null = null
      if (finality?.ok) {
        const data = record(finality.data)!
        height = safeHeight(data.blockNumber)
        if (typeof data.blockHash === 'string' && data.blockHash.length > 0 && data.blockHash.length <= 256)
          hash = data.blockHash
        if (height !== null) {
          const series = progressSeries.get(label) ?? []
          series.push(height)
          progressSeries.set(label, series)
          if (hash !== null) {
            const hashes = byHeight.get(height) ?? new Map<string, string[]>()
            hashes.set(hash, [...(hashes.get(hash) ?? []), label])
            byHeight.set(height, hashes)
          }
        }
      } else missing += 1
      finalityRequests += 1
      if (health?.ok) {
        const data = record(health.data)!
        const free = data.mem_available_mb
        if (typeof free === 'number' && Number.isFinite(free) && free >= 0 && free < 1e12) {
          memory = free
          if (free <= 16) lowMemory.push({ source: label, utc, availableMb: free })
        }
        const stamp = data.ts
        if (typeof stamp === 'number' && Number.isFinite(stamp) && stamp > -2208988800 && stamp < 4102444800) {
          age = Math.round((time / 1000 - stamp) * 1000) / 1000
          if (age > 120 || age < -30) findings.push({
            code: 'HEALTH_SNAPSHOT_STALE_OR_FUTURE',
            detail: label + ' health timestamp differs by ' + age + ' seconds at ' + utc,
          })
        }
      }
      observations.push({
        label, utc,
        status: finality === null ? 'NOT_PRESENT' : finality.ok ? 'RESPONDED' : 'UNANSWERED',
        height, hash, availableMb: memory, healthAgeSeconds: age,
      })
    }
    for (const [height, hashes] of byHeight) {
      if (hashes.size > 1) findings.push({
        code: 'REPORTED_FINALIZED_IDENTITY_CONFLICT',
        detail: 'At ' + utc + ', sources reported ' + hashes.size + ' different finalized hashes at height ' + height + '.',
      })
    }
  }

  const progress: EvidenceSummary['progress'] = {}
  for (const [label, series] of [...progressSeries].sort(([a], [b]) => a.localeCompare(b))) {
    const decreases = series.slice(1).some((value, i) => value < series[i])
    progress[label] = series.length < 2 ? 'ONE_OBSERVATION_ONLY'
      : decreases ? 'REPORTED_REGRESSION_REQUIRES_REVIEW'
      : series.at(-1)! > series[0] ? 'REPORTED_PROGRESS' : 'NO_PROGRESS_OBSERVED'
    if (decreases) findings.push({
      code: 'REPORTED_FINALIZED_HEIGHT_REGRESSION',
      detail: label + ' reported a lower finalized height in a later sample.',
    })
  }
  const conflict = findings.some((item) => item.code !== 'HEALTH_SNAPSHOT_STALE_OR_FUTURE')
  return {
    schema: 'rholox-local-incident-preview/v1',
    sourceSha256, sampleCount: lines.length,
    observedSources: [...sourceSet].sort(), sampleStartUtc: start, sampleEndUtc: end,
    unansweredFinality: missing, finalityRequests,
    assessment: conflict ? 'REPORTED_CONFLICT_REVIEW_REQUIRED'
      : missing ? 'INSUFFICIENT_FINALITY_OBSERVATION'
      : 'OBSERVATIONS_ONLY_NO_FINALITY_PROOF',
    observations, progress, lowMemory, findings, hostFailures: [], topologyUsed: false,
    boundary: 'LOCAL_PREVIEW_NOT_A_CASPER_FINALITY_CERTIFICATE',
  }
}

export function parseTopology(text: string, summary: EvidenceSummary): EvidenceSummary {
  let data: unknown
  try { data = parseStrictJson(text) } catch { throw new Error('Invalid topology JSON.') }
  const envelope = record(data)
  if (!envelope || envelope.schema !== 'sentinel-observation-topology/v1') throw new Error('Unsupported topology schema.')
  const validators = record(envelope.validators)
  if (!validators || !Object.keys(validators).length || Object.keys(validators).length > 100)
    throw new Error('Topology must define 1–100 validators.')
  let total = 0n
  const entries: Array<{ label: string; host: string; stake: bigint }> = []
  for (const [label, value] of Object.entries(validators)) {
    const field = record(value)
    if (!LABEL.test(label) || !field || Object.keys(field).sort().join(',') !== 'host,stake' ||
        typeof field.host !== 'string' || !LABEL.test(field.host) ||
        typeof field.stake !== 'number' || !Number.isSafeInteger(field.stake) || field.stake <= 0)
      throw new Error('Invalid validator topology.')
    const stake = BigInt(field.stake)
    total += stake
    entries.push({ label, host: field.host, stake })
  }
  const hosts = [...new Set(entries.map((v) => v.host))].sort()
  return {
    ...summary, topologyUsed: true,
    hostFailures: hosts.map((host) => {
      const affected = entries.filter((item) => item.host === host)
      const remaining = total - affected.reduce((sum, item) => sum + item.stake, 0n)
      return {
        host, affected: affected.map((item) => item.label).sort(),
        remainingStake: remaining.toString(), exceedsTwoThirds: 3n * remaining > 2n * total,
      }
    }),
  }
}

export function checkSentinelReport(raw: unknown, summary: EvidenceSummary, topologySha256?: string): SentinelReportMatch {
  const report = record(raw)
  const input = record(report?.input)
  const analysis = record(report?.analysis)
  const trust = record(report?.trust)
  if (!report || report.schema !== 'sentinel-incident-witness/v1' || !input || !analysis || !trust)
    return { status: 'MISMATCH', detail: 'Unsupported Sentinel report structure.' }
  if (input.sha256 !== summary.sourceSha256 || input.sample_count !== summary.sampleCount ||
      analysis.assessment !== summary.assessment || analysis.unanswered_finality_requests !== summary.unansweredFinality ||
      analysis.protocol_finality_proven !== false || analysis.finalized_write_integrity_proven !== false ||
      trust.network_access !== 'NONE' || trust.provenance_authenticated !== false)
    return { status: 'MISMATCH', detail: 'The report does not match the raw capture summary.' }
  if (topologySha256 && report.topology_sha256 !== topologySha256)
    return { status: 'MISMATCH', detail: 'Topology input digest differs from the Sentinel report.' }
  if (!topologySha256 && report.topology_sha256 !== null)
    return { status: 'MISMATCH', detail: 'The report references a topology file that was not supplied.' }
  return {
    status: 'BOUND_OBSERVATIONS_MATCH',
    detail: 'Source digest, sample count, assessment, missing observations and topology binding agree. This is a partial browser cross-check, NOT full Python report verification.',
  }
}

export async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function readEvidenceFile(file: File): Promise<{ text: string; sha: string }> {
  if (file.size < 1 || file.size > MAX_BYTES) throw new Error('File must be 1 byte to 5 MiB.')
  const bytes = await file.arrayBuffer()
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  return { text, sha: await sha256(bytes) }
}


/** Reject ambiguous JSON with duplicate keys, even deep in the nested payload. */
export function parseStrictJson(text: string): unknown {
  let i = 0
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i += 1 }
  const stringToken = (): string => {
    const start = i
    if (text[i] !== '"') throw new Error('Invalid JSON string.')
    i += 1
    while (i < text.length) {
      if (text[i] === '\\') { i += 2; continue }
      if (text[i++] === '"') return JSON.parse(text.slice(start, i)) as string
    }
    throw new Error('Unterminated JSON string.')
  }
  const value = (depth: number): void => {
    if (depth > 64) throw new Error('JSON nesting exceeds 64 levels.')
    ws()
    if (text[i] === '{') {
      i += 1
      const keys = new Set<string>()
      ws()
      if (text[i] === '}') { i += 1; return }
      while (i < text.length) {
        ws()
        const key = stringToken()
        if (keys.has(key)) throw new Error('Duplicate JSON key: ' + key.slice(0, 48))
        keys.add(key)
        ws()
        if (text[i++] !== ':') throw new Error('Invalid JSON object separator.')
        value(depth + 1)
        ws()
        if (text[i] === '}') { i += 1; return }
        if (text[i++] !== ',') throw new Error('Invalid JSON object delimiter.')
      }
      throw new Error('Unterminated JSON object.')
    }
    if (text[i] === '[') {
      i += 1
      ws()
      if (text[i] === ']') { i += 1; return }
      while (i < text.length) {
        value(depth + 1)
        ws()
        if (text[i] === ']') { i += 1; return }
        if (text[i++] !== ',') throw new Error('Invalid JSON array delimiter.')
      }
      throw new Error('Unterminated JSON array.')
    }
    if (text[i] === '"') { stringToken(); return }
    const chunk = text.slice(i)
    const match = chunk.match(/^(?:-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null)/)
    if (!match) throw new Error('Invalid JSON value.')
    i += match[0].length
  }
  value(0)
  ws()
  if (i !== text.length) throw new Error('Trailing invalid JSON content.')
  return JSON.parse(text) as unknown
}
