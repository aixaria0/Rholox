import {
  decodeDeployTuple,
  decodeExpr,
  exploreTerm,
  sleep,
  submitSignedTerm,
  waitForProcessedDeploy,
  type ChainBlock,
} from './deploy'
import { isValidRevAddress } from './transfer'
import type { RholoxWallet } from './wallet'

export type AssetBlock = ChainBlock

export type AssetInfo = {
  assetId: string
  locator: string
  name: string
  symbol: string
  decimals: number
  supplyUnits: number
  issuerAddress: string
  model: 'MakeMint fixed-supply purse asset'
  runtimeVersion: 1 | 2
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

const ASSET_ID = /^[0-9a-f]{64}$/
const REGISTRY_URI = /^rho:id:[a-z0-9]+$/

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function quote(value: string): string {
  return JSON.stringify(value)
}

function rhoUri(value: string): string {
  const clean = value.trim().toLowerCase()
  if (!REGISTRY_URI.test(clean)) throw new Error('Registry locator must be a rho:id: URI.')
  return '`' + clean + '`'
}

export function assetChannel(assetId: string): string {
  const id = assetId.trim().toLowerCase()
  if (!ASSET_ID.test(id)) throw new Error('Asset ID must be 64 lowercase hexadecimal characters.')
  return `rholox:asset:v1:${id}`
}

export function isRegistryAssetLocator(value: string): boolean {
  return REGISTRY_URI.test(value.trim().toLowerCase())
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
  return `new
  rl(\`rho:registry:lookup\`),
  insertArbitrary(\`rho:registry:insertArbitrary\`),
  revAddr(\`rho:rev:address\`),
  deployerId(\`rho:rchain:deployerId\`),
  deployId(\`rho:rchain:deployId\`),
  makeMintCh, mintCh, issuerPurseCh, issuerAddrCh, pursesCh, assetService, uriCh
in {
  rl!(\`rho:rchain:makeMint\`, *makeMintCh) |
  revAddr!("fromDeployerId", *deployerId, *issuerAddrCh) |
  for (@(_, MakeMint) <- makeMintCh & @issuerAddr <- issuerAddrCh) {
    @MakeMint!(*mintCh) |
    for (mint <- mintCh) {
      mint!("makePurse", ${supplyUnits}, *issuerPurseCh) |
      for (issuerPurse <- issuerPurseCh) {
        pursesCh!({}.set(issuerAddr, *issuerPurse)) |

        contract assetService(@"info", ret) = {
          ret!(("rholox-asset-v2", ${quote(assetId)}, ${quote(name)}, ${quote(symbol)}, ${decimals}, ${supplyUnits}, issuerAddr, "MakeMint fixed-supply purse asset"))
        } |

        contract assetService(@"balanceOf", @holder, ret) = {
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

        contract assetService(@"verifyBrand", @holder, ret) = {
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

        contract assetService(@"makeEmptyPurse", ret) = {
          issuerPurse!("sprout", *ret)
        } |

        contract assetService(_id, @"depositInto", destinationPurse, @amount, ret) = {
          new fromCh in {
            revAddr!("fromDeployerId", *_id, *fromCh) |
            for (@from <- fromCh) {
              if (amount <= 0) {
                ret!(false)
              } else {
                for (@purses <- pursesCh) {
                  match purses.get(from) {
                    Nil => { pursesCh!(purses) | ret!(false) }
                    sourcePurse => {
                      new successCh in {
                        destinationPurse!("deposit", amount, sourcePurse, *successCh) |
                        for (@success <- successCh) {
                          pursesCh!(purses) | ret!(success)
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        } |

        contract assetService(@"withdrawFrom", sourcePurse, @to, @amount, ret) = {
          if (amount <= 0) {
            ret!(false)
          } else {
            for (@purses <- pursesCh) {
              match purses.get(to) {
                Nil => {
                  new destinationCh, successCh in {
                    mint!("makePurse", 0, *destinationCh) |
                    for (destinationPurse <- destinationCh) {
                      destinationPurse!("deposit", amount, *sourcePurse, *successCh) |
                      for (@success <- successCh) {
                        if (success) {
                          pursesCh!(purses.set(to, *destinationPurse)) | ret!(true)
                        } else {
                          pursesCh!(purses) | ret!(false)
                        }
                      }
                    }
                  }
                }
                destinationPurse => {
                  new successCh in {
                    @destinationPurse!("deposit", amount, *sourcePurse, *successCh) |
                    for (@success <- successCh) {
                      pursesCh!(purses) | ret!(success)
                    }
                  }
                }
              }
            }
          }
        } |

        contract assetService(_id, @"transfer", @to, @amount, ret) = {
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

        insertArbitrary!(bundle+{*assetService}, *uriCh) |
        for (@uri <- uriCh) {
          deployId!((true, "asset-created", ${quote(assetId)}, uri, issuerAddr))
        }
      }
    }
  }
}`
}

function readLegacyAssetTerm(channel: string, verb: 'info' | 'balanceOf' | 'verifyBrand', arg?: string): string {
  const suffix = arg === undefined ? '' : `, ${quote(arg)}`
  return `new return in { @${quote(channel)}!("${verb}"${suffix}, *return) }`
}

function readRegisteredAssetTerm(locator: string, verb: 'info' | 'balanceOf' | 'verifyBrand', arg?: string): string {
  const suffix = arg === undefined ? '' : `, ${quote(arg)}`
  return `new rl(\`rho:registry:lookup\`), assetCh, return in {
    rl!(${rhoUri(locator)}, *assetCh) |
    for (assetService <- assetCh) {
      assetService!("${verb}"${suffix}, *return)
    }
  }`
}

function transferAssetTerm(asset: AssetInfo, to: string, amountUnits: number): string {
  const call = asset.runtimeVersion === 2
    ? `new rl(\`rho:registry:lookup\`), assetCh in { rl!(${rhoUri(asset.locator)}, *assetCh) | for (assetService <- assetCh) { assetService!(*deployerId, "transfer", ${quote(to)}, ${amountUnits}, *ret) } }`
    : `@${quote(asset.locator)}!(*deployerId, "transfer", ${quote(to)}, ${amountUnits}, *ret)`
  return `new deployerId(\`rho:rchain:deployerId\`), deployId(\`rho:rchain:deployId\`), ret in {
    ${call} |
    for (@result <- ret) {
      match result {
        ("transferred", amount, from, destination) => { deployId!((true, "asset-transfer", amount, from, destination)) }
        ("asset-error", message) => { deployId!((false, "asset-transfer", message)) }
      }
    }
  }`
}

export const submitSigned = submitSignedTerm
const waitForProcessed = (deployId: string) => waitForProcessedDeploy(deployId, 'Asset deploy')
const deployTuple = decodeDeployTuple

function explore<T>(term: string, parse: (expr: unknown) => T | undefined): Promise<AssetObservation<T>> {
  return exploreTerm(term, parse, 'Asset state is not visible from the finalized read path.')
}

export async function readAssetInfo(reference: string): Promise<AssetObservation<AssetInfo>> {
  const locator = reference.trim().toLowerCase()
  if (REGISTRY_URI.test(locator)) {
    return explore(readRegisteredAssetTerm(locator, 'info'), (expr) => {
      const tuple = decodeExpr(expr)
      if (!Array.isArray(tuple) || tuple[0] !== 'rholox-asset-v2') return undefined
      const [, assetId, name, symbol, decimals, supplyUnits, issuerAddress, model] = tuple
      if (
        typeof assetId !== 'string' || !ASSET_ID.test(assetId) ||
        typeof name !== 'string' || typeof symbol !== 'string' ||
        typeof decimals !== 'number' || typeof supplyUnits !== 'number' ||
        typeof issuerAddress !== 'string' || model !== 'MakeMint fixed-supply purse asset'
      ) return undefined
      return { assetId, locator, name, symbol, decimals, supplyUnits, issuerAddress, model, runtimeVersion: 2 }
    })
  }

  if (!ASSET_ID.test(locator)) throw new Error('Enter a 64-hex legacy Asset ID or a rho:id: registry URI.')
  const channel = assetChannel(locator)
  return explore(readLegacyAssetTerm(channel, 'info'), (expr) => {
    const tuple = decodeExpr(expr)
    if (!Array.isArray(tuple) || tuple[0] !== 'rholox-asset-v1') return undefined
    const [, name, symbol, decimals, supplyUnits, issuerAddress, model] = tuple
    if (typeof name !== 'string' || typeof symbol !== 'string' || typeof decimals !== 'number' || typeof supplyUnits !== 'number' || typeof issuerAddress !== 'string' || model !== 'MakeMint fixed-supply purse asset') return undefined
    return { assetId: locator, locator: channel, name, symbol, decimals, supplyUnits, issuerAddress, model, runtimeVersion: 1 }
  })
}

async function resolveAsset(assetOrReference: AssetInfo | string): Promise<AssetInfo> {
  return typeof assetOrReference === 'string' ? (await readAssetInfo(assetOrReference)).value : assetOrReference
}

function assetReadTerm(asset: AssetInfo, verb: 'balanceOf' | 'verifyBrand', holder: string): string {
  return asset.runtimeVersion === 2
    ? readRegisteredAssetTerm(asset.locator, verb, holder)
    : readLegacyAssetTerm(asset.locator, verb, holder)
}

export async function readAssetBalance(assetOrReference: AssetInfo | string, holder: string): Promise<AssetObservation<number>> {
  const asset = await resolveAsset(assetOrReference)
  const address = holder.trim()
  if (!isValidRevAddress(address)) throw new Error('Holder is not a valid REV address.')
  return explore(assetReadTerm(asset, 'balanceOf', address), (expr) => {
    const value = decodeExpr(expr)
    return typeof value === 'number' ? value : undefined
  })
}

export async function verifyAssetBrand(assetOrReference: AssetInfo | string, holder: string): Promise<AssetObservation<boolean>> {
  const asset = await resolveAsset(assetOrReference)
  const address = holder.trim()
  if (!isValidRevAddress(address)) throw new Error('Holder is not a valid REV address.')
  return explore(assetReadTerm(asset, 'verifyBrand', address), (expr) => {
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
  const locator = tuple && typeof tuple[3] === 'string' ? tuple[3].toLowerCase() : ''
  if (!tuple || tuple[0] !== true || tuple[1] !== 'asset-created' || tuple[2] !== assetId || !REGISTRY_URI.test(locator) || tuple[4] !== wallet.revAddress) {
    throw new Error('Asset install returned an unexpected registry receipt.')
  }

  const fallback: AssetInfo = {
    assetId,
    locator,
    name,
    symbol,
    decimals,
    supplyUnits,
    issuerAddress: wallet.revAddress,
    model: 'MakeMint fixed-supply purse asset',
    runtimeVersion: 2,
  }
  let info: AssetInfo | undefined
  let issuerBalanceUnits: number | undefined
  let brandVerified = false
  let finalizedBlock: AssetBlock | undefined
  for (let i = 0; i < 24; i += 1) {
    try {
      const [infoObs, balanceObs, brandObs] = await Promise.all([
        readAssetInfo(locator),
        readAssetBalance(fallback, wallet.revAddress),
        verifyAssetBrand(fallback, wallet.revAddress),
      ])
      info = infoObs.value
      issuerBalanceUnits = balanceObs.value
      brandVerified = brandObs.value
      const block = infoObs.block ?? balanceObs.block ?? brandObs.block
      if (
        info.assetId === assetId &&
        issuerBalanceUnits === supplyUnits &&
        brandVerified &&
        block && block.blockNumber >= processed.block.blockNumber
      ) {
        finalizedBlock = block
        break
      }
    } catch { /* finalized state may not include the install yet */ }
    await sleep(3000)
  }

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
    readAssetBalance(asset, wallet.revAddress),
    readAssetBalance(asset, to),
  ])
  if (senderBeforeObs.value < amountUnits) throw new Error(`Insufficient ${asset.symbol} balance.`)

  const deployId = await submitSigned(wallet, transferAssetTerm(asset, to, amountUnits), 900_000)
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
        readAssetBalance(asset, wallet.revAddress),
        readAssetBalance(asset, to),
        verifyAssetBrand(asset, to),
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
