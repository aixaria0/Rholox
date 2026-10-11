import { secp256k1 } from '@noble/curves/secp256k1.js'
import { blake2b } from 'blakejs'
import { RCHAIN_API, fetchWithTimeout, getJson, type NodeStatus } from './rchain'
import { isValidRevAddress } from './transfer'
import type { RholoxWallet } from './wallet'

export type AssetBlock = {
  blockHash: string
  blockNumber: number
  shardId: string
  sender: string
}

export type AssetInfo = {
  assetId: string
  channel: string
  name: string
  symbol: string
  decimals: number
  supplyUnits: number
  issuerAddress: string
  model: 'MakeMint fixed-supply purse asset'
}

export type AssetObservation<T> = {
  value: T
  block?: AssetBlock
}

export type AssetCreateReceipt = {
  asset: AssetInfo
  deployId: string
  inclusionBlock: AssetBlock
  finalizedBlock?: AssetBlock
  issuerBalanceUnits?: number
  brandVerified: boolean
  finalized: boolean
}

export type AssetTransferReceipt = {
  asset: AssetInfo
  deployId: string
  amountUnits: number
  amountDisplay: string
  from: string
  to: string
  inclusionBlock: AssetBlock
  finalizedBlock?: AssetBlock
  senderBalanceBefore: number
  senderBalanceAfter?: number
  recipientBalanceBefore: number
  recipientBalanceAfter?: number
  recipientBrandVerified: boolean
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
  | { ProcessedWithSuccess: { deployResult: unknown[]; block: AssetBlock } }
  | { ProcessedWithError: { deployError: string; block: AssetBlock } }
  | { NotProcessed: { status: string } }

type Processed = { deployResult: unknown[]; block: AssetBlock }

type Expr = Record<string, unknown>

const enc = new TextEncoder()
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const ASSET_ID = /^[0-9a-f]{64}$/

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

function quote(value: string): string {
  return JSON.stringify(value)
}

export function assetChannel(assetId: string): string {
  const id = assetId.trim().toLowerCase()
  if (!ASSET_ID.test(id)) throw new Error('Asset ID must be 64 lowercase hexadecimal characters.')
  return `rholox:asset:v1:${id}`
}

export function createAssetId(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

export function validateAssetName(value: string): string {
  const clean = value.trim().replace(/\s+/g, ' ')
  if (clean.length < 2 || clean.length > 40) throw new Error('Asset name must be 2–40 characters.')
  return clean
}

export function validateAssetSymbol(value: string): string {
  const clean = value.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(clean)) throw new Error('Symbol must be 2–8 uppercase letters or digits and start with a letter.')
  return clean
}

export function validateAssetDecimals(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 8) throw new Error('Decimals must be an integer from 0 to 8.')
  return value
}

export function parseAssetUnits(input: string, decimals: number): number {
  validateAssetDecimals(decimals)
  const value = input.trim()
  const pattern = decimals === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`)
  if (!pattern.test(value)) throw new Error(`Enter a positive amount with at most ${decimals} decimal${decimals === 1 ? '' : 's'}.`)
  const [whole, fraction = ''] = value.split('.')
  const scale = 10n ** BigInt(decimals)
  const units = BigInt(whole) * scale + BigInt(fraction.padEnd(decimals, '0') || '0')
  if (units <= 0n) throw new Error('Asset amount must be greater than zero.')
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Asset amount is too large for this client.')
  return Number(units)
}

export function formatAssetUnits(units: number, decimals: number): string {
  if (!Number.isSafeInteger(units) || units < 0) return String(units)
  if (decimals === 0) return String(units)
  const scale = 10 ** decimals
  const whole = Math.floor(units / scale)
  const fraction = String(units % scale).padStart(decimals, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}

function installAssetTerm(assetId: string, name: string, symbol: string, decimals: number, supplyUnits: number): string {
  const channel = assetChannel(assetId)
  return `new
  rl(\`rho:registry:lookup\`),
  revAddr(\`rho:rev:address\`),
  deployerId(\`rho:rchain:deployerId\`),
  deployId(\`rho:rchain:deployId\`),
  makeMintCh, mintCh, issuerPurseCh, issuerAddrCh, pursesCh
in {
  rl!(\`rho:rchain:makeMint\`, *makeMintCh) |
  revAddr!("fromDeployerId", *deployerId, *issuerAddrCh) |
  for (@(_, MakeMint) <- makeMintCh & @issuerAddr <- issuerAddrCh) {
    @MakeMint!(*mintCh) |
    for (mint <- mintCh) {
      mint!("makePurse", ${supplyUnits}, *issuerPurseCh) |
      for (issuerPurse <- issuerPurseCh) {
        pursesCh!({}.set(issuerAddr, *issuerPurse)) |

        contract @${quote(channel)}(@"info", ret) = {
          ret!(("rholox-asset-v1", ${quote(name)}, ${quote(symbol)}, ${decimals}, ${supplyUnits}, issuerAddr, "MakeMint fixed-supply purse asset"))
        } |

        contract @${quote(channel)}(@"balanceOf", @holder, ret) = {
          for (@purses <<- pursesCh) {
            match purses.get(holder) {
              Nil => { ret!(0) }
              purse => {
                new balanceCh in {
                  @purse!("getBalance", *balanceCh) |
                  for (@balance <- balanceCh) { ret!(balance) }
                }
              }
            }
          }
        } |

        contract @${quote(channel)}(@"verifyBrand", @holder, ret) = {
          for (@purses <<- pursesCh) {
            match purses.get(holder) {
              Nil => { ret!(false) }
              purse => {
                new purseBrandCh, issuerBrandCh in {
                  @purse!("decr", *purseBrandCh) |
                  issuerPurse!("decr", *issuerBrandCh) |
                  for (@purseBrand <- purseBrandCh & @issuerBrand <- issuerBrandCh) {
                    ret!(purseBrand == issuerBrand)
                  }
                }
              }
            }
          }
        } |

        contract @${quote(channel)}(_id, @"transfer", @to, @amount, ret) = {
          new fromCh in {
            revAddr!("fromDeployerId", *_id, *fromCh) |
            for (@from <- fromCh) {
              if (amount <= 0) {
                ret!(("asset-error", "amount must be positive"))
              } else if (from == to) {
                ret!(("asset-error", "cannot transfer to yourself"))
              } else {
                for (@purses <- pursesCh) {
                  match purses.get(from) {
                    Nil => { pursesCh!(purses) | ret!(("asset-error", "sender has no purse")) }
                    sourcePurse => {
                      match purses.get(to) {
                        Nil => {
                          new destinationCh, successCh in {
                            mint!("makePurse", 0, *destinationCh) |
                            for (destinationPurse <- destinationCh) {
                              destinationPurse!("deposit", amount, sourcePurse, *successCh) |
                              for (@success <- successCh) {
                                if (success) {
                                  pursesCh!(purses.set(to, *destinationPurse)) |
                                  ret!(("transferred", amount, from, to))
                                } else {
                                  pursesCh!(purses) |
                                  ret!(("asset-error", "insufficient balance or brand mismatch"))
                                }
                              }
                            }
                          }
                        }
                        destinationPurse => {
                          new successCh in {
                            @destinationPurse!("deposit", amount, sourcePurse, *successCh) |
                            for (@success <- successCh) {
                              pursesCh!(purses) |
                              if (success) {
                                ret!(("transferred", amount, from, to))
                              } else {
                                ret!(("asset-error", "insufficient balance or brand mismatch"))
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        } |

        deployId!((true, "asset-created", ${quote(assetId)}, ${quote(channel)}, issuerAddr))
      }
    }
  }
}`
}

function readAssetTerm(assetId: string, verb: 'info' | 'balanceOf' | 'verifyBrand', arg?: string): string {
  const channel = assetChannel(assetId)
  const suffix = arg === undefined ? '' : `, ${quote(arg)}`
  return `new return in {
    @${quote(channel)}!("${verb}"${suffix}, *return)
  }`
}

function transferAssetTerm(assetId: string, to: string, amountUnits: number): string {
  const channel = assetChannel(assetId)
  return `new deployerId(\`rho:rchain:deployerId\`), deployId(\`rho:rchain:deployId\`), ret in {
    @${quote(channel)}!(*deployerId, "transfer", ${quote(to)}, ${amountUnits}, *ret) |
    for (@result <- ret) {
      match result {
        ("transferred", amount, from, destination) => { deployId!((true, "asset-transfer", amount, from, destination)) }
        ("asset-error", message) => { deployId!((false, "asset-transfer", message)) }
      }
    }
  }`
}

async function submitSigned(wallet: RholoxWallet, term: string, phloLimit: number): Promise<string> {
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

async function waitForProcessed(deployId: string): Promise<Processed> {
  let unknown = 0
  for (let i = 0; i < 40; i += 1) {
    const status = await getJson<DeployExecStatus>(`/api/v1/deploy-status/${deployId}`)
    if ('ProcessedWithSuccess' in status) return status.ProcessedWithSuccess
    if ('ProcessedWithError' in status) throw new Error(status.ProcessedWithError.deployError || 'Asset deploy failed.')
    unknown = status.NotProcessed.status === 'Unknown' ? unknown + 1 : 0
    if (unknown >= 5) throw new Error('The node has no record of this asset deploy after five polls.')
    await sleep(3000)
  }
  throw new Error('Timed out waiting for asset deploy inclusion.')
}

function decodeExpr(expr: unknown): unknown {
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

function deployTuple(result: unknown[]): unknown[] | undefined {
  const decoded = decodeExpr(result[0])
  return Array.isArray(decoded) ? decoded : undefined
}

async function explore<T>(term: string, parse: (expr: unknown) => T | undefined): Promise<AssetObservation<T>> {
  const response = await fetchWithTimeout(`${RCHAIN_API}/api/explore-deploy`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(term),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(text || `Asset read returned ${response.status}`)
  const parsed = JSON.parse(text) as { expr?: unknown[]; block?: AssetBlock }
  const value = parse(parsed.expr?.[0])
  if (value === undefined) throw new Error('Asset state is not visible from the finalized read path.')
  return { value, block: parsed.block }
}

export async function readAssetInfo(assetId: string): Promise<AssetObservation<AssetInfo>> {
  const id = assetId.trim().toLowerCase()
  const channel = assetChannel(id)
  return explore(readAssetTerm(id, 'info'), (expr) => {
    const tuple = decodeExpr(expr)
    if (!Array.isArray(tuple) || tuple[0] !== 'rholox-asset-v1') return undefined
    const [, name, symbol, decimals, supplyUnits, issuerAddress, model] = tuple
    if (typeof name !== 'string' || typeof symbol !== 'string' || typeof decimals !== 'number' || typeof supplyUnits !== 'number' || typeof issuerAddress !== 'string' || model !== 'MakeMint fixed-supply purse asset') return undefined
    return { assetId: id, channel, name, symbol, decimals, supplyUnits, issuerAddress, model }
  })
}

export async function readAssetBalance(assetId: string, holder: string): Promise<AssetObservation<number>> {
  const address = holder.trim()
  if (!isValidRevAddress(address)) throw new Error('Holder is not a valid REV address.')
  return explore(readAssetTerm(assetId, 'balanceOf', address), (expr) => {
    const value = decodeExpr(expr)
    return typeof value === 'number' ? value : undefined
  })
}

export async function verifyAssetBrand(assetId: string, holder: string): Promise<AssetObservation<boolean>> {
  const address = holder.trim()
  if (!isValidRevAddress(address)) throw new Error('Holder is not a valid REV address.')
  return explore(readAssetTerm(assetId, 'verifyBrand', address), (expr) => {
    const value = decodeExpr(expr)
    return typeof value === 'boolean' ? value : undefined
  })
}

export async function createAsset(
  wallet: RholoxWallet,
  input: { name: string; symbol: string; decimals: number; initialSupply: string },
): Promise<AssetCreateReceipt> {
  const name = validateAssetName(input.name)
  const symbol = validateAssetSymbol(input.symbol)
  const decimals = validateAssetDecimals(input.decimals)
  const supplyUnits = parseAssetUnits(input.initialSupply, decimals)
  const assetId = createAssetId()
  const deployId = await submitSigned(wallet, installAssetTerm(assetId, name, symbol, decimals, supplyUnits), 1_500_000)
  const processed = await waitForProcessed(deployId)
  const tuple = deployTuple(processed.deployResult)
  if (!tuple || tuple[0] !== true || tuple[1] !== 'asset-created' || tuple[2] !== assetId || tuple[3] !== assetChannel(assetId) || tuple[4] !== wallet.revAddress) {
    throw new Error('Asset install returned an unexpected receipt.')
  }

  let info: AssetInfo | undefined
  let issuerBalanceUnits: number | undefined
  let brandVerified = false
  let finalizedBlock: AssetBlock | undefined
  for (let i = 0; i < 24; i += 1) {
    try {
      const [infoObs, balanceObs, brandObs] = await Promise.all([
        readAssetInfo(assetId),
        readAssetBalance(assetId, wallet.revAddress),
        verifyAssetBrand(assetId, wallet.revAddress),
      ])
      info = infoObs.value
      issuerBalanceUnits = balanceObs.value
      brandVerified = brandObs.value
      const block = infoObs.block ?? balanceObs.block ?? brandObs.block
      if (issuerBalanceUnits === supplyUnits && brandVerified && block && block.blockNumber >= processed.block.blockNumber) {
        finalizedBlock = block
        break
      }
    } catch { /* finalized state may not include the install yet */ }
    await sleep(3000)
  }

  const fallback: AssetInfo = { assetId, channel: assetChannel(assetId), name, symbol, decimals, supplyUnits, issuerAddress: wallet.revAddress, model: 'MakeMint fixed-supply purse asset' }
  return {
    asset: info ?? fallback,
    deployId,
    inclusionBlock: processed.block,
    finalizedBlock,
    issuerBalanceUnits,
    brandVerified,
    finalized: Boolean(finalizedBlock),
  }
}

export async function sendAsset(
  wallet: RholoxWallet,
  asset: AssetInfo,
  toInput: string,
  amountInput: string,
): Promise<AssetTransferReceipt> {
  const to = toInput.trim()
  if (!isValidRevAddress(to)) throw new Error('Recipient is not a valid REV address.')
  if (to === wallet.revAddress) throw new Error('Recipient cannot be this wallet itself.')
  const amountUnits = parseAssetUnits(amountInput, asset.decimals)
  const [senderBeforeObs, recipientBeforeObs] = await Promise.all([
    readAssetBalance(asset.assetId, wallet.revAddress),
    readAssetBalance(asset.assetId, to),
  ])
  if (senderBeforeObs.value < amountUnits) throw new Error(`Insufficient ${asset.symbol} balance.`)

  const deployId = await submitSigned(wallet, transferAssetTerm(asset.assetId, to, amountUnits), 900_000)
  const processed = await waitForProcessed(deployId)
  const tuple = deployTuple(processed.deployResult)
  if (!tuple || tuple[0] !== true || tuple[1] !== 'asset-transfer') {
    const message = tuple && tuple[0] === false && typeof tuple[2] === 'string' ? tuple[2] : 'Asset transfer returned an unexpected receipt.'
    throw new Error(message)
  }

  let senderBalanceAfter: number | undefined
  let recipientBalanceAfter: number | undefined
  let recipientBrandVerified = false
  let finalizedBlock: AssetBlock | undefined
  for (let i = 0; i < 24; i += 1) {
    try {
      const [sender, recipient, brand] = await Promise.all([
        readAssetBalance(asset.assetId, wallet.revAddress),
        readAssetBalance(asset.assetId, to),
        verifyAssetBrand(asset.assetId, to),
      ])
      senderBalanceAfter = sender.value
      recipientBalanceAfter = recipient.value
      recipientBrandVerified = brand.value
      const block = recipient.block ?? sender.block ?? brand.block
      if (
        senderBalanceAfter === senderBeforeObs.value - amountUnits &&
        recipientBalanceAfter === recipientBeforeObs.value + amountUnits &&
        recipientBrandVerified &&
        block && block.blockNumber >= processed.block.blockNumber
      ) {
        finalizedBlock = block
        break
      }
    } catch { /* wait for finalized visibility */ }
    await sleep(3000)
  }

  return {
    asset,
    deployId,
    amountUnits,
    amountDisplay: amountInput.trim(),
    from: wallet.revAddress,
    to,
    inclusionBlock: processed.block,
    finalizedBlock,
    senderBalanceBefore: senderBeforeObs.value,
    senderBalanceAfter,
    recipientBalanceBefore: recipientBeforeObs.value,
    recipientBalanceAfter,
    recipientBrandVerified,
    finalized: Boolean(finalizedBlock),
  }
}
