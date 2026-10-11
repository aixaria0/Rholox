import { secp256k1 } from '@noble/curves/secp256k1.js'
import { blake2b } from 'blakejs'
import { RCHAIN_API, fetchWithTimeout, getJson, type NodeStatus } from './rchain'
import type { RholoxWallet } from './wallet'

export type ChainBlock = {
  blockHash: string
  blockNumber: number
  shardId: string
  sender: string
}

export type ProcessedDeploy = {
  deployResult: unknown[]
  block: ChainBlock
}

type DeployData = {
  term: string
  timestamp: number
  phloPrice: number
  phloLimit: number
  validAfterBlockNumber: number
  shardId: string
}

type DeployExecStatus =
  | { ProcessedWithSuccess: ProcessedDeploy }
  | { ProcessedWithError: { deployError: string; block: ChainBlock } }
  | { NotProcessed: { status: string } }

type Expr = Record<string, unknown>

const enc = new TextEncoder()
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

function varint(value: number): number[] {
  let n = BigInt(value)
  const out: number[] = []
  while (n >= 0x80n) {
    out.push(Number((n & 0x7fn) | 0x80n))
    n >>= 7n
  }
  out.push(Number(n))
  return out
}

function pushString(out: number[], field: number, value: string) {
  if (!value) return
  const bytes = enc.encode(value)
  out.push(...varint((field << 3) | 2), ...varint(bytes.length), ...bytes)
}

function pushInt64(out: number[], field: number, value: number) {
  if (!value) return
  out.push(...varint(field << 3), ...varint(value))
}

function serializeDeployData(data: DeployData): Uint8Array {
  const out: number[] = []
  pushString(out, 2, data.term)
  pushInt64(out, 3, data.timestamp)
  pushInt64(out, 7, data.phloPrice)
  pushInt64(out, 8, data.phloLimit)
  pushInt64(out, 10, data.validAfterBlockNumber)
  pushString(out, 11, data.shardId)
  return new Uint8Array(out)
}

function signDeploy(data: DeployData, wallet: RholoxWallet) {
  const digest = blake2b(serializeDeployData(data), undefined, 32)
  const signature = secp256k1.sign(digest, hexToBytes(wallet.privateKey), { prehash: false, format: 'der' }) as Uint8Array
  return { data, deployer: wallet.publicKey, signature: bytesToHex(signature), sigAlgorithm: 'secp256k1' as const }
}

export async function submitSignedTerm(wallet: RholoxWallet, term: string, phloLimit: number): Promise<string> {
  const status = await getJson<NodeStatus>('/api/status')
  const data: DeployData = {
    term,
    timestamp: Date.now(),
    phloPrice: Math.max(1, status.minPhloPrice ?? 1),
    phloLimit,
    validAfterBlockNumber: status.latestBlockNumber ?? 0,
    shardId: status.shardId ?? '/root',
  }
  const response = await fetchWithTimeout(`${RCHAIN_API}/api/deploy`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(signDeploy(data, wallet)),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text || `Deploy returned ${response.status}`)
  let result = text
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed === 'string') result = parsed
  } catch { /* plain text is valid */ }
  const match = result.match(/DeployId is: ([0-9a-fA-F]+)/)
  if (!match) throw new Error(result || 'Node accepted no deploy id.')
  return match[1]
}

export async function waitForProcessedDeploy(deployId: string, subject = 'Deploy'): Promise<ProcessedDeploy> {
  let unknown = 0
  for (let i = 0; i < 40; i += 1) {
    const status = await getJson<DeployExecStatus>(`/api/v1/deploy-status/${deployId}`)
    if ('ProcessedWithSuccess' in status) return status.ProcessedWithSuccess
    if ('ProcessedWithError' in status) throw new Error(status.ProcessedWithError.deployError || `${subject} failed.`)
    unknown = status.NotProcessed.status === 'Unknown' ? unknown + 1 : 0
    if (unknown >= 5) throw new Error(`The node has no record of this ${subject.toLowerCase()} after five polls.`)
    await sleep(3000)
  }
  throw new Error(`Timed out waiting for ${subject.toLowerCase()} inclusion.`)
}

export function decodeExpr(expr: unknown): unknown {
  if (!expr || typeof expr !== 'object') return undefined
  const node = expr as Expr
  const str = node.ExprString as { data?: string } | string | undefined
  if (typeof str === 'string') return str
  if (str && typeof str === 'object') return str.data
  const uri = node.ExprUri as { data?: string } | string | undefined
  if (typeof uri === 'string') return uri
  if (uri && typeof uri === 'object') return uri.data
  const int = node.ExprInt as { data?: number } | number | undefined
  if (typeof int === 'number') return int
  if (int && typeof int === 'object') return int.data
  const bool = node.ExprBool as { data?: boolean } | boolean | undefined
  if (typeof bool === 'boolean') return bool
  if (bool && typeof bool === 'object') return bool.data
  const tuple = node.ExprTuple as { data?: unknown[] } | undefined
  if (tuple?.data) return tuple.data.map(decodeExpr)
  return undefined
}

export function decodeDeployTuple(result: unknown[]): unknown[] | undefined {
  const decoded = decodeExpr(result[0])
  return Array.isArray(decoded) ? decoded : undefined
}

export async function exploreTerm<T>(
  term: string,
  parse: (expr: unknown) => T | undefined,
  unavailableMessage: string,
): Promise<{ value: T; block?: ChainBlock }> {
  const response = await fetchWithTimeout(`${RCHAIN_API}/api/explore-deploy`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(term),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text || `Explore-deploy returned ${response.status}`)
  const parsed = JSON.parse(text) as { expr?: unknown[]; block?: ChainBlock }
  const value = parse(parsed.expr?.[0])
  if (value === undefined) throw new Error(unavailableMessage)
  return { value, block: parsed.block }
}
