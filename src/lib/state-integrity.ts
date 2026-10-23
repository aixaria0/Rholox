import { parseStrictJson } from './network-evidence'

export const ISSUE_URL = 'https://github.com/rhovision-org/rholo/issues/420'
export const ISSUE_EVIDENCE = 'https://github.com/rhovision-org/rholo/issues/420#issuecomment-6375656151'
export const ISSUE_REPRO = 'https://github.com/rhovision-org/rholo/issues/420#issuecomment-6375688758'
export const ROOT_URI = 'rho:id:7srrj8is8zcz6de4p1oqsi87sj1fod7x4r5dzz8pf1fnnsy176co'

export const REPORTED_STATES = [
  {
    height: 830,
    hash: 'c4f10d9152c20a15d83eef766227602dad97fe1c9ee81ae2279f6c2b2bb5c29b',
    keys: ['admin-guard', 'verifier'],
  },
  {
    height: 835,
    hash: '3c12c6e02aec52b44c8f0953e1a60f9dedd5a1ed5ebc40d76a0df4f4200bd6d6',
    keys: ['admin-guard', 'governor', 'verifier'],
  },
  {
    height: 845,
    hash: '083e118904f2fdf27e87e03ee2523d7c805dd960a29c013b1d5220dbb8a51950',
    keys: ['admin-guard', 'clock', 'codec'],
  },
  {
    height: 1254,
    hash: 'dfed8a269ed35d893e64b61abb6fcfbe2c1112a38ea5cb449cdfeec1fd3e79db',
    keys: ['account-factory', 'admin-guard', 'claim-code', 'clock', 'codec',
      'collateral-math', 'oracle-hub', 'oracle-math', 'oracle-registry',
      'stablecoin-directory', 'rcash:root'],
  },
] as const

const HASH = /^[0-9a-f]{64}$/
const NODE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/
const MAX_BYTES = 1024 * 1024
const MAX_NODES = 1000
const MAX_READS = 500
const MAX_KEYS = 512

type GraphBlock = {
  hash: string
  height: number
  justifications: string[]
}
type StateRead = {
  blockHash: string
  node: string
  keys: string[]
  postState: true
}
export type RootWitness = {
  schema: 'rholox-root-state-witness/v1'
  rootUri: string
  ancestorHash: string
  descendantHash: string
  blocks: GraphBlock[]
  reads: StateRead[]
}
export type RootProofResult = {
  status:
    | 'COUNTEREXAMPLE_IN_SUPPLIED_RECORDS'
    | 'NO_SET_LOSS_IN_SUPPLIED_RECORDS'
    | 'INCOMPLETE_JUSTIFICATION_GRAPH'
    | 'INCONSISTENT_SOURCE_READS'
  ancestry: 'CONFIRMED_IN_SUPPLIED_GRAPH' | 'NOT_ESTABLISHED'
  lostKeys: string[]
  gainedKeys: string[]
  sourceAgreement: Record<string, { nodeCount: number; nodeNames: string[] }>
  unresolvedBlockCount: number
  sourceAuthenticated: false
  acceptedMergeEffectsProven: false
  protocolViolationProven: false
  summary: string
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}
function positiveInt(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function assertHash(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !HASH.test(value)) throw new Error('Invalid ' + label + '.')
}
function assertKeyArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length > MAX_KEYS ||
    value.some((item) => typeof item !== 'string' || item.length === 0 || item.length > 256) ||
    new Set(value).size !== value.length)
    throw new Error('Invalid ' + label + ' key set.')
}
export function missingKeys(ancestor: readonly string[], descendant: readonly string[]) {
  const later = new Set(descendant)
  return ancestor.filter((item) => !later.has(item)).sort()
}
export function addedKeys(ancestor: readonly string[], descendant: readonly string[]) {
  const earlier = new Set(ancestor)
  return descendant.filter((item) => !earlier.has(item)).sort()
}
export function publicComparison(from: number, to: number) {
  const a = REPORTED_STATES.find((entry) => entry.height === from)
  const b = REPORTED_STATES.find((entry) => entry.height === to)
  if (!a || !b) throw new Error('Published block pair not found.')
  return {
    from, to,
    lost: missingKeys(a.keys, b.keys),
    gained: addedKeys(a.keys, b.keys),
    ancestry: 'ASSERTED_IN_ISSUE_NOT_INDEPENDENTLY_REPLAYED' as const,
    provenance: 'PUBLISHED_TABLE_NOT_RAW_RPC' as const,
  }
}

export function parseRootWitness(text: string): RootWitness {
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES)
    throw new Error('Root witness exceeds 1 MiB.')
  const doc = object(parseStrictJson(text))
  if (!doc || doc.schema !== 'rholox-root-state-witness/v1' || doc.rootUri !== ROOT_URI)
    throw new Error('Unsupported schema or Root URI. This verifier is pinned to Issue #420.')
  assertHash(doc.ancestorHash, 'ancestor hash')
  assertHash(doc.descendantHash, 'descendant hash')
  if (doc.ancestorHash === doc.descendantHash)
    throw new Error('Ancestor and descendant cannot be identical.')
  if (!Array.isArray(doc.blocks) || !doc.blocks.length || doc.blocks.length > MAX_NODES ||
      !Array.isArray(doc.reads) || !doc.reads.length || doc.reads.length > MAX_READS)
    throw new Error('Missing or oversized block graph / state reads.')
  const seen = new Set<string>()
  const blocks: GraphBlock[] = []
  for (const entry of doc.blocks) {
    const block = object(entry)
    if (!block) throw new Error('Malformed block.')
    assertHash(block.hash, 'block hash')
    if (!positiveInt(block.height) || !Array.isArray(block.justifications) ||
        block.justifications.length > 50)
      throw new Error('Invalid block height or justifications.')
    const parents: string[] = []
    for (const candidate of block.justifications) {
      assertHash(candidate, 'justification hash')
      if (candidate === block.hash) throw new Error('Self-referential justification.')
      if (parents.includes(candidate)) throw new Error('Duplicate justification.')
      parents.push(candidate)
    }
    if (seen.has(block.hash)) throw new Error('Duplicate block record.')
    seen.add(block.hash)
    blocks.push({ hash: block.hash, height: block.height as number, justifications: parents })
  }
  const reads: StateRead[] = []
  const observed = new Set<string>()
  for (const entry of doc.reads) {
    const read = object(entry)
    if (!read) throw new Error('Malformed read.')
    assertHash(read.blockHash, 'read block hash')
    if (typeof read.node !== 'string' || !NODE.test(read.node) || read.postState !== true)
      throw new Error('Invalid read node or post-state marker.')
    assertKeyArray(read.keys, 'read')
    if (!seen.has(read.blockHash)) throw new Error('State read references an unknown block.')
    const id = read.blockHash + ':' + read.node
    if (observed.has(id)) throw new Error('Duplicate node/block read.')
    observed.add(id)
    reads.push({ blockHash: read.blockHash, node: read.node, keys: read.keys, postState: true })
  }
  if (!seen.has(doc.ancestorHash) || !seen.has(doc.descendantHash))
    throw new Error('Pinned ancestor/descendant blocks are missing.')
  const heights = new Map(blocks.map((b) => [b.hash, b.height]))
  if (heights.get(doc.ancestorHash)! >= heights.get(doc.descendantHash)!)
    throw new Error('Ancestor height must precede descendant height.')
  for (const block of blocks)
    for (const parent of block.justifications)
      if (heights.has(parent) && heights.get(parent)! >= block.height)
        throw new Error('Invalid justification height ordering.')
  return {
    schema: 'rholox-root-state-witness/v1',
    rootUri: ROOT_URI,
    ancestorHash: doc.ancestorHash,
    descendantHash: doc.descendantHash,
    blocks, reads,
  }
}

function comparison(reads: StateRead[], hash: string) {
  const observations = reads.filter((x) => x.blockHash === hash)
  const sets = new Map<string, string[]>()
  for (const read of observations) {
    const normalized = [...read.keys].sort().join('\u0000')
    if (!sets.has(normalized)) sets.set(normalized, [])
    sets.get(normalized)!.push(read.node)
  }
  return { observations, sets }
}

export function evaluateRootWitness(input: RootWitness): RootProofResult {
  const graph = new Map(input.blocks.map((block) => [block.hash, block]))
  const visited = new Set<string>()
  const queue = [input.descendantHash]
  let unresolved = 0
  let linked = false
  // Justifications are graph edges, not a declaration that ancestor deploy effects survived a merge.
  while (queue.length && visited.size < MAX_NODES) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    if (current === input.ancestorHash) { linked = true; break }
    const block = graph.get(current)
    if (!block) { unresolved += 1; continue }
    for (const edge of block.justifications) if (!visited.has(edge)) queue.push(edge)
  }
  const a = comparison(input.reads, input.ancestorHash)
  const b = comparison(input.reads, input.descendantHash)
  const agreement: RootProofResult['sourceAgreement'] = {
    ancestor: { nodeCount: a.observations.length, nodeNames: a.observations.map(x => x.node).sort() },
    descendant: { nodeCount: b.observations.length, nodeNames: b.observations.map(x => x.node).sort() },
  }
  const base = {
    ancestry: linked ? 'CONFIRMED_IN_SUPPLIED_GRAPH' as const : 'NOT_ESTABLISHED' as const,
    lostKeys: [] as string[], gainedKeys: [] as string[], sourceAgreement: agreement,
    unresolvedBlockCount: unresolved, sourceAuthenticated: false as const,
    acceptedMergeEffectsProven: false as const,
    protocolViolationProven: false as const,
  }
  if (a.sets.size > 1 || b.sets.size > 1) return {
    ...base, status: 'INCONSISTENT_SOURCE_READS',
    summary: 'Uploaded sources disagree on the key set at a pinned block. No single state comparison is justified.',
  }
  if (!linked || !a.observations.length || !b.observations.length) return {
    ...base, status: 'INCOMPLETE_JUSTIFICATION_GRAPH',
    summary: 'A complete source-supplied ancestor path and both post-state reads are needed before comparing sets.',
  }
  const ancestor = a.observations[0].keys
  const descendant = b.observations[0].keys
  const lost = missingKeys(ancestor, descendant)
  const gained = addedKeys(ancestor, descendant)
  return {
    ...base, lostKeys: lost, gainedKeys: gained,
    status: lost.length ? 'COUNTEREXAMPLE_IN_SUPPLIED_RECORDS' : 'NO_SET_LOSS_IN_SUPPLIED_RECORDS',
    summary: lost.length
      ? 'The uploaded records contain a justification-ancestor pair with a non-monotonic Root key set. Acceptance of the ancestor writes into the descendant merge and source authenticity remain unproved.'
      : 'The uploaded ancestor key set is a subset of the descendant set; this pair does not demonstrate missing keys.',
  }
}
