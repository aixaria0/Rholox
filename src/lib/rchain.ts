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
  const response = await fetchWithTimeout(`${RCHAIN_API}${path}`, { cache: 'no-store', signal })
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
  const isCount = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
  const isBlock = (v: unknown) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false
    const block = v as Record<string, unknown>
    return (
      isCount(block.blockNumber) &&
      typeof block.blockHash === 'string' &&
      /^[0-9a-fA-F]{64}$/.test(block.blockHash) &&
      isCount(block.deployCount) &&
      Array.isArray(block.rejectedDeploys) &&
      Array.isArray(block.justifications) &&
      Array.isArray(block.bonds)
    )
  }
  if (path === '/api/v1/blocks') {
    if (!Array.isArray(value) || value.length > 4096 || !value.every(isBlock)) fail()
    return
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail()
  const data = value as Record<string, unknown>
  const count = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
  if (path === '/api/status') {
    if (
      typeof data.networkId !== 'string' ||
      !data.networkId.trim() ||
      typeof data.shardId !== 'string' ||
      !data.shardId.trim() ||
      !count(data.latestBlockNumber)
    )
      fail()
    for (const key of ['peers', 'nodes']) if (data[key] !== undefined && !count(data[key])) fail()
  } else if (path === '/api/last-finalized-block') {
    if (!data.blockInfo || typeof data.blockInfo !== 'object' || Array.isArray(data.blockInfo))
      fail()
    const block = data.blockInfo as Record<string, unknown>
    if (
      !count(block.blockNumber) ||
      typeof block.blockHash !== 'string' ||
      !/^[0-9a-fA-F]{64}$/.test(block.blockHash)
    )
      fail()
    if (
      block.bonds !== undefined &&
      (!Array.isArray(block.bonds) ||
        block.bonds.length > 4096 ||
        block.bonds.some(
          (bond: unknown) =>
            !bond || typeof bond !== 'object' || !count((bond as Record<string, unknown>).stake),
        ))
    )
      fail()
  } else if (path.startsWith('/api/v1/block/')) {
    if (
      !isBlock(data.blockInfo) ||
      !Array.isArray(data.deploys) ||
      data.deploys.some(
        (deploy: unknown) =>
          !deploy ||
          typeof deploy !== 'object' ||
          typeof (deploy as Record<string, unknown>).sig !== 'string' ||
          typeof (deploy as Record<string, unknown>).deployer !== 'string',
      )
    )
      fail()
  } else if (path.startsWith('/api/v1/deploy-status/')) {
    if (
      ['ProcessedWithSuccess', 'ProcessedWithError', 'NotProcessed'].filter((key) => key in data)
        .length !== 1
    )
      fail()
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

  const parsed = JSON.parse(text) as { expr?: Array<{ ExprInt?: { data?: number } | number }> }
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
  return (drops / DROPS_PER_REV).toLocaleString(undefined, { maximumFractionDigits: 8 })
}
