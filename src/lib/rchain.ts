export const RCHAIN_API = 'https://testnet.rhobot.net'
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

export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 12_000): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new Error('Connected node request timed out.')
    }
    throw cause
  } finally {
    window.clearTimeout(timer)
  }
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetchWithTimeout(`${RCHAIN_API}${path}`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`${path} returned ${response.status}`)
  return response.json() as Promise<T>
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
  if (typeof balance !== 'number') throw new Error('Unexpected balance response from connected node.')
  return balance
}

export async function requestFaucet(revAddress: string): Promise<FaucetResponse> {
  return postJson<FaucetResponse>('/api/faucet', { address: revAddress })
}

export async function readDeployStatus(deployId: string): Promise<unknown> {
  return getJson<unknown>(`/api/v1/deploy-status/${deployId}`)
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
