import { secp256k1 } from '@noble/curves/secp256k1.js'
import { blake2b } from 'blakejs'
import { RCHAIN_API, fetchWithTimeout, getJson, type NodeStatus } from './rchain'
import type { RholoxWallet } from './wallet'

export type LightBlock = {
  blockHash: string
  blockNumber: number
  shardId: string
  sender: string
}

export type ProofReceipt = {
  payload: string
  sha256: string
  deployId: string
  inclusionBlock: LightBlock
  finalizedBlock?: LightBlock
  finalized: boolean
}

type DeployData = {
  term: string
  timestamp: number
  phloPrice: number
  phloLimit: number
  validAfterBlockNumber: number
  shardId: string
}

type DeployRequest = {
  data: DeployData
  deployer: string
  signature: string
  sigAlgorithm: 'secp256k1'
}

type DeployExecStatus =
  | { ProcessedWithSuccess: { deployResult: unknown[]; block: LightBlock } }
  | { ProcessedWithError: { deployError: string; block: LightBlock } }
  | { NotProcessed: { status: string } }

const enc = new TextEncoder()
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

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

function signDeploy(data: DeployData, wallet: RholoxWallet): DeployRequest {
  const privateKey = hexToBytes(wallet.privateKey)
  const digest = blake2b(serializeDeployData(data), undefined, 32)
  const signature = secp256k1.sign(digest, privateKey, { prehash: false, format: 'der' }) as Uint8Array
  return {
    data,
    deployer: wallet.publicKey,
    signature: bytesToHex(signature),
    sigAlgorithm: 'secp256k1',
  }
}

export async function sha256Hex(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(payload))
  return bytesToHex(new Uint8Array(digest))
}

function proofName(hash: string) {
  return `rholox:proof:${hash}`
}

function proofTerm(hash: string) {
  const name = proofName(hash)
  return `new deployId(\`rho:rchain:deployId\`) in {
    @"${name}"!("${hash}") |
    deployId!((true, "Rholox proof recorded", "${hash}"))
  }`
}

async function submitSignedDeploy(wallet: RholoxWallet, hash: string): Promise<string> {
  const status = await getJson<NodeStatus>('/api/status')
  const data: DeployData = {
    term: proofTerm(hash),
    timestamp: Date.now(),
    phloPrice: Math.max(1, status.minPhloPrice ?? 1),
    phloLimit: 100_000,
    validAfterBlockNumber: status.latestBlockNumber ?? 0,
    shardId: status.shardId ?? '/root',
  }
  const signed = signDeploy(data, wallet)
  const response = await fetchWithTimeout(`${RCHAIN_API}/api/deploy`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(signed),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text || `Deploy returned ${response.status}`)
  let result = text
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed === 'string') result = parsed
  } catch { /* response may be plain text */ }
  const match = result.match(/DeployId is: ([0-9a-fA-F]+)/)
  if (!match) throw new Error(result || 'Node accepted no deploy id.')
  return match[1]
}

async function waitForInclusion(deployId: string): Promise<LightBlock> {
  let unknown = 0
  for (let i = 0; i < 40; i += 1) {
    const status = await getJson<DeployExecStatus>(`/api/v1/deploy-status/${deployId}`)
    if ('ProcessedWithSuccess' in status) return status.ProcessedWithSuccess.block
    if ('ProcessedWithError' in status) throw new Error(status.ProcessedWithError.deployError || 'Deploy execution failed.')
    unknown = status.NotProcessed.status === 'Unknown' ? unknown + 1 : 0
    if (unknown >= 5) throw new Error('The node has no record of this deploy after five polls.')
    await sleep(3000)
  }
  throw new Error('Timed out waiting for block inclusion.')
}

async function finalizedVisibility(hash: string, inclusionHeight: number): Promise<LightBlock | undefined> {
  const term = `new return in { for (@value <- @"${proofName(hash)}") { return!(value) } }`
  for (let i = 0; i < 20; i += 1) {
    const response = await fetchWithTimeout(`${RCHAIN_API}/api/explore-deploy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(term),
    })
    const text = await response.text()
    if (response.ok) {
      const parsed = JSON.parse(text) as {
        expr?: Array<{ ExprString?: { data?: string } | string }>
        block?: LightBlock
      }
      const wrapped = parsed.expr?.[0]?.ExprString
      const value = typeof wrapped === 'string' ? wrapped : wrapped?.data
      if (value === hash && parsed.block && parsed.block.blockNumber >= inclusionHeight) return parsed.block
    }
    await sleep(3000)
  }
  return undefined
}

export async function createProof(wallet: RholoxWallet, payload: string): Promise<ProofReceipt> {
  const clean = payload.trim()
  if (!clean) throw new Error('Enter something to anchor before signing.')
  const hash = await sha256Hex(clean)
  const deployId = await submitSignedDeploy(wallet, hash)
  const inclusionBlock = await waitForInclusion(deployId)
  const finalizedBlock = await finalizedVisibility(hash, inclusionBlock.blockNumber)
  return {
    payload: clean,
    sha256: hash,
    deployId,
    inclusionBlock,
    finalizedBlock,
    finalized: Boolean(finalizedBlock),
  }
}
