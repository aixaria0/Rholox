import { revTransferTerm } from '@aixaria/rchain-assurance-v1'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { blake2b } from 'blakejs'
import bs58 from 'bs58'
import { RCHAIN_API, fetchWithTimeout, getJson, type NodeStatus } from './rchain'
import type { RholoxWallet } from './wallet'

export type TransferBlock = {
  blockHash: string
  blockNumber: number
  shardId: string
  sender: string
}

export type TransferAction = {
  deployId: string
  signer: string
  signedAt: number
  submittedAt?: number
  submissionSource?: string
  signed: { data: DeployData; deployer: string; signature: string; sigAlgorithm: string }
  to: string
  amountDrops: number
  recipientBalanceBefore: number
}

export type TransferReceipt = {
  deployId: string
  amountDrops: number
  amountRev: string
  to: string
  inclusionBlock: TransferBlock
  finalizedBlock?: TransferBlock
  senderBalanceBefore: number
  senderBalanceAfter?: number
  recipientBalanceBefore: number
  recipientBalanceAfter?: number
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

type DeployExecStatus =
  | { ProcessedWithSuccess: { deployResult: unknown[]; block: TransferBlock } }
  | { ProcessedWithError: { deployError: string; block: TransferBlock } }
  | { NotProcessed: { status: string } }

const enc = new TextEncoder()
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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
  return {
    data,
    deployer: wallet.publicKey,
    signature: bytesToHex(signature),
    sigAlgorithm: 'secp256k1',
  }
}

export function parseRevToDrops(input: string): number {
  const value = input.trim()
  if (!/^\d+(?:\.\d{1,8})?$/.test(value)) throw new Error('Enter a positive REV amount with up to 8 decimals.')
  const [whole, fraction = ''] = value.split('.')
  const drops = BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, '0'))
  if (drops <= 0n) throw new Error('Transfer amount must be greater than zero.')
  if (drops > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount is too large for this client.')
  return Number(drops)
}

export function isValidRevAddress(address: string): boolean {
  try {
    const bytes = bs58.decode(address.trim())
    if (bytes.length !== 40) return false
    if (bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 0 || bytes[3] !== 0) return false
    const body = bytes.slice(0, 36)
    const checksum = blake2b(body, undefined, 32).slice(0, 4)
    return checksum.every((byte, index) => byte === bytes[36 + index])
  } catch {
    return false
  }
}

function transferTerm(to: string, amountDrops: number) {
  return revTransferTerm(to, amountDrops)
}

async function readBalanceWithBlock(address: string): Promise<{ balance: number; block?: TransferBlock }> {
  const term = `new return, revVault(\`rho:rchain:revVault\`), balanceCh in {
    revVault!("getBalance", "${address}", *balanceCh) |
    for (@balance <- balanceCh) { return!(balance) }
  }`
  const response = await fetchWithTimeout(`${RCHAIN_API}/api/explore-deploy`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(term),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text || `Balance read returned ${response.status}`)
  const parsed = JSON.parse(text) as { expr?: Array<{ ExprInt?: { data?: number } | number }>; block?: TransferBlock }
  const wrapped = parsed.expr?.[0]?.ExprInt
  const balance = typeof wrapped === 'number' ? wrapped : wrapped?.data
  if (typeof balance !== 'number') throw new Error('Unexpected balance response from connected node.')
  return { balance, block: parsed.block }
}

async function submit(wallet: RholoxWallet, to: string, amountDrops: number, recipientBalanceBefore: number, onProgress?: (action: TransferAction) => void): Promise<string> {
  const status = await getJson<NodeStatus>('/api/status')
  const data: DeployData = {
    term: transferTerm(to, amountDrops),
    timestamp: Date.now(),
    phloPrice: Math.max(1, status.minPhloPrice ?? 1),
    phloLimit: 500_000,
    validAfterBlockNumber: status.latestBlockNumber ?? 0,
    shardId: status.shardId ?? '/root',
  }
  const signed = signDeploy(data, wallet)
  const action: TransferAction = { deployId: signed.signature, signer: wallet.publicKey, signedAt: Date.now(), signed, to, amountDrops, recipientBalanceBefore }
  onProgress?.(action)
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
  } catch { /* plain text is valid */ }
  const match = result.match(/DeployId is: ([0-9a-fA-F]+)/)
  if (!match) throw new Error(result || 'Node accepted no deploy id.')
  if (match[1] !== signed.signature) throw new Error('Submission returned a different deploy identity.')
  onProgress?.({ ...action, submittedAt: Date.now(), submissionSource: `${RCHAIN_API}/api/deploy` })
  return match[1]
}

async function waitForInclusion(deployId: string): Promise<TransferBlock> {
  let unknown = 0
  for (let i = 0; i < 40; i += 1) {
    const status = await getJson<DeployExecStatus>(`/api/v1/deploy-status/${deployId}`)
    if ('ProcessedWithSuccess' in status) {
      const result = status.ProcessedWithSuccess.deployResult[0] as { ExprTuple?: { ps?: Array<{ ExprBool?: boolean | { data?: boolean } }> } } | undefined
      const value = result?.ExprTuple?.ps?.[0]?.ExprBool
      const success = typeof value === 'boolean' ? value : value?.data
      if (success === false) throw new Error('REV Vault rejected the transfer.')
      if (success !== true) throw new Error('Transfer was included, but its contract result is unknown. Inspect assurance before retrying.')
      return status.ProcessedWithSuccess.block
    }
    if ('ProcessedWithError' in status) throw new Error(status.ProcessedWithError.deployError || 'Transfer deploy failed.')
    unknown = status.NotProcessed.status === 'Unknown' ? unknown + 1 : 0
    if (unknown >= 5) throw new Error('The node has no record of this transfer after five polls.')
    await sleep(3000)
  }
  throw new Error('Timed out waiting for transfer inclusion.')
}

export async function sendRev(wallet: RholoxWallet, toInput: string, amountInput: string, onProgress?: (action: TransferAction) => void): Promise<TransferReceipt> {
  const to = toInput.trim()
  if (!isValidRevAddress(to)) throw new Error('Recipient is not a valid REV address.')
  if (to === wallet.revAddress) throw new Error('Recipient cannot be this wallet itself.')
  const amountDrops = parseRevToDrops(amountInput)
  const senderBefore = await readBalanceWithBlock(wallet.revAddress)
  const recipientBefore = await readBalanceWithBlock(to)
  if (senderBefore.balance <= amountDrops) throw new Error('Insufficient balance after allowing for deploy cost.')

  const deployId = await submit(wallet, to, amountDrops, recipientBefore.balance, onProgress)
  const inclusionBlock = await waitForInclusion(deployId)

  let finalizedBlock: TransferBlock | undefined
  let senderAfter: number | undefined
  let recipientAfter: number | undefined
  for (let i = 0; i < 24; i += 1) {
    const [sender, recipient] = await Promise.all([
      readBalanceWithBlock(wallet.revAddress),
      readBalanceWithBlock(to),
    ])
    senderAfter = sender.balance
    recipientAfter = recipient.balance
    if (recipient.balance >= recipientBefore.balance + amountDrops && recipient.block && recipient.block.blockNumber >= inclusionBlock.blockNumber) {
      const [tip, assertion] = await Promise.allSettled([
        getJson<{ blockInfo?: TransferBlock }>('/api/last-finalized-block'),
        getJson<boolean | { finalized?: boolean }>(`/api/is-finalized/${inclusionBlock.blockHash}`),
      ])
      const nodeFinality = assertion.status === 'fulfilled' && (assertion.value === true || (typeof assertion.value === 'object' && assertion.value.finalized === true))
      const tipBlock = tip.status === 'fulfilled' ? tip.value.blockInfo : undefined
      if (nodeFinality && tipBlock?.blockHash === recipient.block.blockHash && tipBlock.blockNumber === recipient.block.blockNumber) {
        finalizedBlock = recipient.block
        break
      }
    }
    await sleep(3000)
  }

  return {
    deployId,
    amountDrops,
    amountRev: amountInput.trim(),
    to,
    inclusionBlock,
    finalizedBlock,
    senderBalanceBefore: senderBefore.balance,
    senderBalanceAfter: senderAfter,
    recipientBalanceBefore: recipientBefore.balance,
    recipientBalanceAfter: recipientAfter,
    finalized: Boolean(finalizedBlock),
  }
}
