import { parseObserverReport } from './observer'
export const RCHAIN_API = 'https://testnet.rhobot.net'
export const OBSERVER_API = `${RCHAIN_API}/observer`
export const DROPS_PER_REV = 100_000_000

export type NodeStatus = {
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

export type Capabilities = {
  autopropose?: boolean
  proposeOnDeploy?: boolean
  manualPropose?: boolean
  adminHttp?: boolean
  devMode?: boolean
  faucet?: boolean
  faucetRemaining?: number
}

export type Finalized = {
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

export type ObserverVerdictClass =
  | 'agreement'
  | 'proven_lag'
  | 'height_skew'
  | 'majority'
  | 'conflicting_finalized_history'
  | 'divergence'
  | 'unavailable'

export type ObserverAncestryClass =
  | 'proven_lag'
  | 'conflicting_finalized_history'
  | 'unresolved_height_skew'

export type ObserverFinalizedIdentity = {
  network_id: string
  shard_id: string
  block_number: number
  block_hash: string
}

export type ObserverAncestryCheck = {
  class: ObserverAncestryClass
  lower: ObserverFinalizedIdentity
  higher: ObserverFinalizedIdentity
  witness_node?: string | null
  examined_blocks: number
  cryptographically_verified_blocks: number
  path: string[]
  reason: string
}

export type ObserverNode = {
  node: string
  reachable: boolean
  network_id?: string | null
  shard_id?: string | null
  latest_block?: number | null
  finalized_block?: number | null
  finalized_hash?: string | null
  error?: string | null
}

export type ObserverReport = {
  schema_version?: number
  completed_at_ms?: number
  duration_ms?: number
  observed_at_ms: number
  heights: {
    reachable_nodes: number
    latest_min?: number | null
    latest_max?: number | null
    finalized_min?: number | null
    finalized_max?: number | null
  }
  observations: ObserverNode[]
  ancestry_checks: ObserverAncestryCheck[]
  verdict: {
    class: ObserverVerdictClass
    observed_nodes: number
    comparable_nodes: number
    agreeing_nodes: number
    summary: string
    reference?: ObserverFinalizedIdentity | null
  }
}

export type LightBlock = {
  version: number
  shardId: string
  blockHash: string
  blockNumber: number
  sender: string
  seqNum: number
  preStateHash: string
  postStateHash: string
  justifications: string[]
  bonds: Array<{ validator: string; stake: number }>
  sigAlgorithm: string
  sig: string
  blockSize: string
  deployCount: number
  rejectedDeploys: string[]
  timestamp: number
}

export type BlockDetails = {
  blockInfo: LightBlock
  deploys: Array<{
    deployer: string
    term: string
    timestamp: number
    sig: string
    sigAlgorithm: string
    phloPrice: number
    phloLimit: number
    validAfterBlockNumber: number
    cost: number
    errored: boolean
    systemDeployError: string
  }>
}

export type FaucetResponse = {
  deployId: string
  amount: number
  to: string
  status: 'pending' | 'resubmitted' | 'failed' | string
  deployError?: string | null
}

// The deadline remains active until the response body finishes, including stalled streams.
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 12_000,
): Promise<Response> {
  const controller = new AbortController()
  const forwardAbort = () => controller.abort(init.signal?.reason)
  if (init.signal?.aborted) forwardAbort()
  else init.signal?.addEventListener('abort', forwardAbort, { once: true })
  let timedOut = false
  const timer = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const cleanup = () => {
    window.clearTimeout(timer)
    init.signal?.removeEventListener('abort', forwardAbort)
  }
  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
      redirect: 'error',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
    if (!response.body) {
      cleanup()
      return response
    }
    const reader = response.body.getReader()
    let bytes = 0
    const body = new ReadableStream<Uint8Array>({
      async pull(stream) {
        try {
          const chunk = await reader.read()
          if (chunk.done) {
            cleanup()
            stream.close()
            return
          }
          bytes += chunk.value.byteLength
          if (bytes > 8 * 1024 * 1024) {
            controller.abort()
            await reader.cancel()
            throw new Error('Connected node response exceeded the 8 MiB limit.')
          }
          stream.enqueue(chunk.value)
        } catch (cause) {
          cleanup()
          stream.error(timedOut ? new Error('Connected node request timed out.') : cause)
        }
      },
      async cancel(reason) {
        cleanup()
        controller.abort()
        await reader.cancel(reason)
      },
    })
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  } catch (cause) {
    cleanup()
    if (timedOut) throw new Error('Connected node request timed out.')
    throw cause
  }
}

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetchWithTimeout(`${RCHAIN_API}${path}`, {
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error(`${path} returned ${response.status}`)
  const parsed: unknown = await response.json()
  validateNetworkRead(path, parsed)
  return parsed as T
}

function validateNetworkRead(path: string, value: unknown): void {
  if (
    ![
      '/api/status',
      '/api/last-finalized-block',
      '/api/v1/capabilities',
      '/api/v1/blocks',
    ].includes(path) &&
    !path.startsWith('/api/v1/block/') &&
    !path.startsWith('/api/v1/deploy-status/')
  )
    return
  const fail = () => {
    throw new Error(`${path} returned an invalid observation.`)
  }
  const record = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
  const count = (v: unknown): v is number =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
  const text = (v: unknown, limit = 1024): v is string => typeof v === 'string' && v.length <= limit
  const identityText = (v: unknown) => text(v) && v.trim().length > 0
  const hash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-fA-F]{64}$/.test(v)
  const list = (v: unknown): v is unknown[] => Array.isArray(v) && v.length <= 4096
  const bond = (v: unknown) => record(v) && identityText(v.validator) && count(v.stake)
  const chainBlock = (v: unknown): v is Record<string, unknown> =>
    record(v) &&
    hash(v.blockHash) &&
    count(v.blockNumber) &&
    identityText(v.shardId) &&
    text(v.sender)
  const lightBlock = (v: unknown) =>
    chainBlock(v) &&
    count(v.version) &&
    count(v.seqNum) &&
    count(v.timestamp) &&
    hash(v.preStateHash) &&
    hash(v.postStateHash) &&
    text(v.sigAlgorithm) &&
    text(v.sig, 2048) &&
    text(v.blockSize, 128) &&
    count(v.deployCount) &&
    list(v.justifications) &&
    v.justifications.every(hash) &&
    list(v.rejectedDeploys) &&
    v.rejectedDeploys.every((item) => text(item, 2048)) &&
    list(v.bonds) &&
    v.bonds.every(bond)
  const deploy = (v: unknown) =>
    record(v) &&
    identityText(v.deployer) &&
    text(v.sig, 2048) &&
    text(v.sigAlgorithm) &&
    text(v.term, 8 * 1024 * 1024) &&
    ['timestamp', 'phloPrice', 'phloLimit', 'validAfterBlockNumber', 'cost'].every((key) =>
      count(v[key]),
    ) &&
    typeof v.errored === 'boolean' &&
    text(v.systemDeployError, 8192)
  if (path === '/api/v1/blocks') {
    if (!list(value) || !value.every(lightBlock)) fail()
    const blocks = value as Array<Record<string, unknown>>
    if (new Set(blocks.map((b) => (b.blockHash as string).toLowerCase())).size !== blocks.length)
      fail()
    return
  }
  if (!record(value)) fail()
  const data = value as Record<string, unknown>
  if (path === '/api/status') {
    if (
      !identityText(data.networkId) ||
      !identityText(data.shardId) ||
      !count(data.latestBlockNumber)
    )
      fail()
    for (const key of ['peers', 'nodes', 'minPhloPrice', 'finalityStallEpisodes'])
      if (data[key] !== undefined && !count(data[key])) fail()
    for (const key of ['autopropose', 'proposeOnDeploy', 'manualPropose', 'adminHttp', 'devMode'])
      if (data[key] !== undefined && typeof data[key] !== 'boolean') fail()
  } else if (path === '/api/last-finalized-block') {
    if (!record(data.blockInfo)) fail()
    const block = data.blockInfo as Record<string, unknown>
    if (!count(block.blockNumber) || !hash(block.blockHash)) fail()
    if (block.shardId !== undefined && !identityText(block.shardId)) fail()
    if (block.bonds !== undefined && (!list(block.bonds) || !block.bonds.every(bond))) fail()
  } else if (path.startsWith('/api/v1/block/')) {
    if (!lightBlock(data.blockInfo) || !list(data.deploys) || !data.deploys.every(deploy)) fail()
    const requested = decodeURIComponent(path.slice('/api/v1/block/'.length))
    const returned = (data.blockInfo as Record<string, unknown>).blockHash as string
    if (!hash(requested) || returned.toLowerCase() !== requested.toLowerCase()) fail()
  } else if (path.startsWith('/api/v1/deploy-status/')) {
    const variants = ['ProcessedWithSuccess', 'ProcessedWithError', 'NotProcessed'].filter((key) =>
      Object.hasOwn(data, key),
    )
    if (variants.length !== 1 || !record(data[variants[0]])) fail()
    const payload = data[variants[0]] as Record<string, unknown>
    if (variants[0] === 'NotProcessed') {
      if (!identityText(payload.status)) fail()
    } else {
      if (!chainBlock(payload.block)) fail()
      if (variants[0] === 'ProcessedWithSuccess' && !list(payload.deployResult)) fail()
      if (variants[0] === 'ProcessedWithError' && !text(payload.deployError, 8192)) fail()
    }
  } else {
    for (const key of [
      'autopropose',
      'proposeOnDeploy',
      'manualPropose',
      'adminHttp',
      'devMode',
      'faucet',
    ])
      if (data[key] !== undefined && typeof data[key] !== 'boolean') fail()
    if (data.faucetRemaining !== undefined && !count(data.faucetRemaining)) fail()
  }
}

export async function getObserverObservation(signal?: AbortSignal): Promise<ObserverReport> {
  const response = await fetchWithTimeout(
    `${OBSERVER_API}/v1/observation`,
    { cache: 'no-store', signal },
    6_000,
  )
  if (!response.ok) throw new Error(`Observer returned ${response.status}`)
  return parseObserverReport(await response.json())
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetchWithTimeout(`${RCHAIN_API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text || `${path} returned ${response.status}`)
  return JSON.parse(text) as T
}

export async function readBalance(revAddress: string): Promise<number> {
  const term = `
    new return, revVault(\`rho:rchain:revVault\`), balanceCh in {
      revVault!("getBalance", "${revAddress}", *balanceCh) |
      for (@balance <- balanceCh) { return!(balance) }
    }
  `

  const response = await fetchWithTimeout(`${RCHAIN_API}/api/explore-deploy`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(term),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text || `Balance read returned ${response.status}`)

  const parsed = JSON.parse(text) as {
    expr?: Array<{ ExprInt?: { data?: number } | number }>
  }
  const first = parsed.expr?.[0]
  const wrapped = first?.ExprInt
  const balance = typeof wrapped === 'number' ? wrapped : wrapped?.data
  if (typeof balance !== 'number' || !Number.isSafeInteger(balance) || balance < 0)
    throw new Error('Unexpected balance response from connected node.')
  return balance
}

export async function requestFaucet(revAddress: string): Promise<FaucetResponse> {
  return postJson<FaucetResponse>('/api/faucet', { address: revAddress })
}

export async function readDeployStatus(deployId: string): Promise<unknown> {
  return getJson<unknown>(`/api/v1/deploy-status/${encodeURIComponent(deployId)}`)
}

export async function getRecentBlocks(): Promise<LightBlock[]> {
  return getJson<LightBlock[]>('/api/v1/blocks')
}

export async function getBlockByHash(hash: string): Promise<BlockDetails> {
  return getJson<BlockDetails>(`/api/v1/block/${encodeURIComponent(hash)}`)
}

export function dropsToRev(drops: number): string {
  return (drops / DROPS_PER_REV).toLocaleString(undefined, {
    maximumFractionDigits: 8,
  })
}
