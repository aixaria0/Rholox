import type { RholoxWallet } from './wallet'
import { readAssetBalance, readAssetInfo, type AssetBlock, type AssetInfo, type AssetObservation } from './asset'
import {
  decodeDeployTuple,
  decodeExpr,
  exploreTerm,
  sleep,
  submitSignedTerm,
  waitForProcessedDeploy,
} from './deploy'
import {
  POOL_MAX_RESERVE_UNITS,
  quoteAddLiquidity,
  quoteRemoveLiquidity,
  quoteSwap,
  type PoolReserves,
  type SwapDirection,
} from './amm'

export const POOL_FEE_BPS = 0 as const
const POOL_ID = /^[0-9a-f]{64}$/
const REGISTRY_URI = /^rho:id:[a-z0-9]+$/

export type PoolInfo = PoolReserves & {
  poolId: string
  locator: string
  assetA: AssetInfo
  assetB: AssetInfo
  creatorAddress: string
  feeBps: 0
  actualA: bigint
  actualB: bigint
  custodyVerified: boolean
}

export type PoolCreateReceipt = {
  pool: PoolInfo
  deployId: string
  inclusionBlock: AssetBlock
  finalizedBlock?: AssetBlock
  finalized: boolean
}

function quote(value: string): string {
  return JSON.stringify(value)
}

function rhoUri(value: string): string {
  const clean = value.trim().toLowerCase()
  if (!REGISTRY_URI.test(clean)) throw new Error('Registry locator must be a rho:id: URI.')
  return '`' + clean + '`'
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function asSafeInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined
}

function asBigInt(value: unknown): bigint | undefined {
  const int = asSafeInt(value)
  return int === undefined ? undefined : BigInt(int)
}

export function createPoolId(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

export function isPoolLocator(value: string): boolean {
  return REGISTRY_URI.test(value.trim().toLowerCase())
}

export function canonicalPoolAssets(left: AssetInfo, right: AssetInfo): [AssetInfo, AssetInfo] {
  if (left.assetId === right.assetId) throw new Error('A pool requires two different assets.')
  if (left.runtimeVersion !== 2 || right.runtimeVersion !== 2) {
    throw new Error('Pool creation requires exchange-capable Asset Lab v2 assets.')
  }
  return left.assetId < right.assetId ? [left, right] : [right, left]
}

function installPoolTerm(poolId: string, assetA: AssetInfo, assetB: AssetInfo): string {
  return `new rl(\`rho:registry:lookup\`), insertArbitrary(\`rho:registry:insertArbitrary\`), deployId(\`rho:rchain:deployId\`), deployerId(\`rho:rchain:deployerId\`), revAddr(\`rho:rev:address\`), creatorCh, assetACh, assetBCh, purseACh, purseBCh, stateCh, addCore, removeCore, swapAtoB, swapBtoA, poolService, poolUriCh in {
  rl!(${rhoUri(assetA.locator)}, *assetACh) |
  rl!(${rhoUri(assetB.locator)}, *assetBCh) |
  revAddr!("fromDeployerId", *deployerId, *creatorCh) |
  for (assetAService <- assetACh & assetBService <- assetBCh & @creatorAddress <- creatorCh) {
    assetAService!("makeEmptyPurse", *purseACh) |
    assetBService!("makeEmptyPurse", *purseBCh) |
    for (purseA <- purseACh & purseB <- purseBCh) {
    stateCh!((0, 0, 0, {})) |

    contract addCore(_id, @holder, @amountA, @amountB, @minted, @reserveA, @reserveB, @totalShares, @ownedShares, @positions, ret) = {
      new aOkCh in {
        assetAService!(*_id, "depositInto", *purseA, amountA, *aOkCh) |
        for (@aOk <- aOkCh) {
          if (aOk) {
            new bOkCh in {
              assetBService!(*_id, "depositInto", *purseB, amountB, *bOkCh) |
              for (@bOk <- bOkCh) {
                if (bOk) {
                  stateCh!((reserveA + amountA, reserveB + amountB, totalShares + minted, positions.set(holder, ownedShares + minted))) |
                  ret!(("liquidity-added", amountA, amountB, minted, holder))
                } else {
                  new rollbackCh in {
                    assetAService!("withdrawFrom", *purseA, holder, amountA, *rollbackCh) |
                    for (@rolledBack <- rollbackCh) {
                      stateCh!((reserveA, reserveB, totalShares, positions)) |
                      if (rolledBack) {
                        ret!(("pool-error", "second asset deposit failed; first deposit rolled back"))
                      } else {
                        ret!(("pool-fatal", "second asset deposit failed and rollback failed"))
                      }
                    }
                  }
                }
              }
            }
          } else {
            stateCh!((reserveA, reserveB, totalShares, positions)) |
            ret!(("pool-error", "first asset deposit failed"))
          }
        }
      }
    } |

    contract removeCore(_id, @holder, @shares, @outA, @outB, @reserveA, @reserveB, @totalShares, @ownedShares, @positions, ret) = {
      new aOkCh in {
        assetAService!("withdrawFrom", *purseA, holder, outA, *aOkCh) |
        for (@aOk <- aOkCh) {
          if (aOk) {
            new bOkCh in {
              assetBService!("withdrawFrom", *purseB, holder, outB, *bOkCh) |
              for (@bOk <- bOkCh) {
                if (bOk) {
                  stateCh!((reserveA - outA, reserveB - outB, totalShares - shares, positions.set(holder, ownedShares - shares))) |
                  ret!(("liquidity-removed", outA, outB, shares, holder))
                } else {
                  new rollbackCh in {
                    assetAService!(*_id, "depositInto", *purseA, outA, *rollbackCh) |
                    for (@rolledBack <- rollbackCh) {
                      stateCh!((reserveA, reserveB, totalShares, positions)) |
                      if (rolledBack) {
                        ret!(("pool-error", "second asset withdrawal failed; first withdrawal rolled back"))
                      } else {
                        ret!(("pool-fatal", "second asset withdrawal failed and rollback failed"))
                      }
                    }
                  }
                }
              }
            }
          } else {
            stateCh!((reserveA, reserveB, totalShares, positions)) |
            ret!(("pool-error", "first asset withdrawal failed"))
          }
        }
      }
    } |

    contract swapAtoB(_id, @holder, @amountIn, @amountOut, @reserveA, @reserveB, @totalShares, @positions, ret) = {
      new inOkCh in {
        assetAService!(*_id, "depositInto", *purseA, amountIn, *inOkCh) |
        for (@inOk <- inOkCh) {
          if (inOk) {
            new outOkCh in {
              assetBService!("withdrawFrom", *purseB, holder, amountOut, *outOkCh) |
              for (@outOk <- outOkCh) {
                if (outOk) {
                  stateCh!((reserveA + amountIn, reserveB - amountOut, totalShares, positions)) |
                  ret!(("swapped", "A_TO_B", amountIn, amountOut, holder))
                } else {
                  new rollbackCh in {
                    assetAService!("withdrawFrom", *purseA, holder, amountIn, *rollbackCh) |
                    for (@rolledBack <- rollbackCh) {
                      stateCh!((reserveA, reserveB, totalShares, positions)) |
                      if (rolledBack) {
                        ret!(("pool-error", "swap output withdrawal failed; input rolled back"))
                      } else {
                        ret!(("pool-fatal", "swap output withdrawal failed and input rollback failed"))
                      }
                    }
                  }
                }
              }
            }
          } else {
            stateCh!((reserveA, reserveB, totalShares, positions)) |
            ret!(("pool-error", "swap input deposit failed"))
          }
        }
      }
    } |

    contract swapBtoA(_id, @holder, @amountIn, @amountOut, @reserveA, @reserveB, @totalShares, @positions, ret) = {
      new inOkCh in {
        assetBService!(*_id, "depositInto", *purseB, amountIn, *inOkCh) |
        for (@inOk <- inOkCh) {
          if (inOk) {
            new outOkCh in {
              assetAService!("withdrawFrom", *purseA, holder, amountOut, *outOkCh) |
              for (@outOk <- outOkCh) {
                if (outOk) {
                  stateCh!((reserveA - amountOut, reserveB + amountIn, totalShares, positions)) |
                  ret!(("swapped", "B_TO_A", amountIn, amountOut, holder))
                } else {
                  new rollbackCh in {
                    assetBService!("withdrawFrom", *purseB, holder, amountIn, *rollbackCh) |
                    for (@rolledBack <- rollbackCh) {
                      stateCh!((reserveA, reserveB, totalShares, positions)) |
                      if (rolledBack) {
                        ret!(("pool-error", "swap output withdrawal failed; input rolled back"))
                      } else {
                        ret!(("pool-fatal", "swap output withdrawal failed and input rollback failed"))
                      }
                    }
                  }
                }
              }
            }
          } else {
            stateCh!((reserveA, reserveB, totalShares, positions)) |
            ret!(("pool-error", "swap input deposit failed"))
          }
        }
      }
    } |

    contract poolService(@"info", ret) = {
      for (@(reserveA, reserveB, totalShares, _positions) <<- stateCh) {
        new actualACh, actualBCh in {
          purseA!("getBalance", *actualACh) |
          purseB!("getBalance", *actualBCh) |
          for (@actualA <- actualACh & @actualB <- actualBCh) {
            ret!(("rholox-pool-v1", ${quote(poolId)}, ${quote(assetA.assetId)}, ${quote(assetA.locator)}, ${quote(assetB.assetId)}, ${quote(assetB.locator)}, creatorAddress, reserveA, reserveB, totalShares, 0, actualA, actualB, reserveA == actualA && reserveB == actualB))
          }
        }
      }
    } |

    contract poolService(@"position", @holder, ret) = {
      for (@(_reserveA, _reserveB, _totalShares, positions) <<- stateCh) {
        match positions.get(holder) {
          Nil => { ret!(0) }
          shares => { ret!(shares) }
        }
      }
    } |

    contract poolService(_id, @"addLiquidity", @amountA, @amountB, @minShares, @expectedA, @expectedB, @expectedShares, ret) = {
      new holderCh in {
        revAddr!("fromDeployerId", *_id, *holderCh) |
        for (@holder <- holderCh) {
          for (@(reserveA, reserveB, totalShares, positions) <- stateCh) {
            new actualACh, actualBCh, balanceACh, balanceBCh in {
              purseA!("getBalance", *actualACh) |
              purseB!("getBalance", *actualBCh) |
              assetAService!("balanceOf", holder, *balanceACh) |
              assetBService!("balanceOf", holder, *balanceBCh) |
              for (@actualA <- actualACh & @actualB <- actualBCh & @balanceA <- balanceACh & @balanceB <- balanceBCh) {
                if (actualA != reserveA || actualB != reserveB) {
                  stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "custody balance mismatch"))
                } else if (reserveA != expectedA || reserveB != expectedB || totalShares != expectedShares) {
                  stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "stale pool state"))
                } else if (amountA <= 0 || amountB <= 0 || minShares < 0) {
                  stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "invalid liquidity amount"))
                } else if (reserveA + amountA > ${POOL_MAX_RESERVE_UNITS} || reserveB + amountB > ${POOL_MAX_RESERVE_UNITS}) {
                  stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "reserve cap exceeded"))
                } else if (balanceA < amountA || balanceB < amountB) {
                  stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "insufficient asset balance"))
                } else {
                  match positions.get(holder) {
                    Nil => {
                      if (totalShares == 0 && reserveA == 0 && reserveB == 0) {
                        if (amountA + amountB < minShares) {
                          stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "minted shares below minimum"))
                        } else {
                          addCore!(*_id, holder, amountA, amountB, amountA + amountB, reserveA, reserveB, totalShares, 0, positions, *ret)
                        }
                      } else if (totalShares > 0 && reserveA > 0 && reserveB > 0) {
                        if (amountA * reserveB != amountB * reserveA) {
                          stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "liquidity ratio mismatch"))
                        } else if ((amountA * totalShares) / reserveA < minShares) {
                          stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "minted shares below minimum"))
                        } else {
                          addCore!(*_id, holder, amountA, amountB, (amountA * totalShares) / reserveA, reserveA, reserveB, totalShares, 0, positions, *ret)
                        }
                      } else {
                        stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "inconsistent pool state"))
                      }
                    }
                    ownedShares => {
                      if (totalShares > 0 && reserveA > 0 && reserveB > 0) {
                        if (amountA * reserveB != amountB * reserveA) {
                          stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "liquidity ratio mismatch"))
                        } else if ((amountA * totalShares) / reserveA < minShares) {
                          stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "minted shares below minimum"))
                        } else {
                          addCore!(*_id, holder, amountA, amountB, (amountA * totalShares) / reserveA, reserveA, reserveB, totalShares, ownedShares, positions, *ret)
                        }
                      } else {
                        stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "inconsistent pool state"))
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

    contract poolService(_id, @"removeLiquidity", @shares, @minA, @minB, @expectedA, @expectedB, @expectedShares, ret) = {
      new holderCh in {
        revAddr!("fromDeployerId", *_id, *holderCh) |
        for (@holder <- holderCh) {
          for (@(reserveA, reserveB, totalShares, positions) <- stateCh) {
            new actualACh, actualBCh in {
              purseA!("getBalance", *actualACh) | purseB!("getBalance", *actualBCh) |
              for (@actualA <- actualACh & @actualB <- actualBCh) {
                if (actualA != reserveA || actualB != reserveB) {
                  stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "custody balance mismatch"))
                } else if (reserveA != expectedA || reserveB != expectedB || totalShares != expectedShares) {
                  stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "stale pool state"))
                } else if (shares <= 0 || minA < 0 || minB < 0 || totalShares <= 0) {
                  stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "invalid liquidity removal"))
                } else {
                  match positions.get(holder) {
                    Nil => { stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "no LP position")) }
                    ownedShares => {
                      if (shares > ownedShares || shares > totalShares) {
                        stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "LP share amount exceeds position"))
                      } else if (shares == totalShares) {
                        if (reserveA < minA || reserveB < minB || reserveA <= 0 || reserveB <= 0) {
                          stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "withdrawal output below minimum"))
                        } else {
                          removeCore!(*_id, holder, shares, reserveA, reserveB, reserveA, reserveB, totalShares, ownedShares, positions, *ret)
                        }
                      } else {
                        if ((shares * reserveA) / totalShares <= 0 || (shares * reserveB) / totalShares <= 0) {
                          stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "withdrawal output rounds to zero"))
                        } else if ((shares * reserveA) / totalShares < minA || (shares * reserveB) / totalShares < minB) {
                          stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "withdrawal output below minimum"))
                        } else {
                          removeCore!(*_id, holder, shares, (shares * reserveA) / totalShares, (shares * reserveB) / totalShares, reserveA, reserveB, totalShares, ownedShares, positions, *ret)
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

    contract poolService(_id, @"swap", @direction, @amountIn, @minOut, @expectedA, @expectedB, @expectedShares, ret) = {
      new holderCh in {
        revAddr!("fromDeployerId", *_id, *holderCh) |
        for (@holder <- holderCh) {
          for (@(reserveA, reserveB, totalShares, positions) <- stateCh) {
            new actualACh, actualBCh in {
              purseA!("getBalance", *actualACh) | purseB!("getBalance", *actualBCh) |
              for (@actualA <- actualACh & @actualB <- actualBCh) {
                if (actualA != reserveA || actualB != reserveB) {
                  stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "custody balance mismatch"))
                } else if (reserveA != expectedA || reserveB != expectedB || totalShares != expectedShares) {
                  stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "stale pool state"))
                } else if (amountIn <= 0 || minOut < 0 || totalShares <= 0 || reserveA <= 0 || reserveB <= 0) {
                  stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "invalid swap"))
                } else {
                  match direction {
                    "A_TO_B" => {
                      if (reserveA + amountIn > ${POOL_MAX_RESERVE_UNITS}) {
                        stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "reserve cap exceeded"))
                      } else if ((amountIn * reserveB) / (reserveA + amountIn) <= 0 || (amountIn * reserveB) / (reserveA + amountIn) >= reserveB) {
                        stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "invalid swap output"))
                      } else if ((amountIn * reserveB) / (reserveA + amountIn) < minOut) {
                        stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "swap output below minimum"))
                      } else if ((reserveA + amountIn) * (reserveB - ((amountIn * reserveB) / (reserveA + amountIn))) < reserveA * reserveB) {
                        stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "constant-product invariant would decrease"))
                      } else {
                        swapAtoB!(*_id, holder, amountIn, (amountIn * reserveB) / (reserveA + amountIn), reserveA, reserveB, totalShares, positions, *ret)
                      }
                    }
                    "B_TO_A" => {
                      if (reserveB + amountIn > ${POOL_MAX_RESERVE_UNITS}) {
                        stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "reserve cap exceeded"))
                      } else if ((amountIn * reserveA) / (reserveB + amountIn) <= 0 || (amountIn * reserveA) / (reserveB + amountIn) >= reserveA) {
                        stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "invalid swap output"))
                      } else if ((amountIn * reserveA) / (reserveB + amountIn) < minOut) {
                        stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "swap output below minimum"))
                      } else if ((reserveB + amountIn) * (reserveA - ((amountIn * reserveA) / (reserveB + amountIn))) < reserveA * reserveB) {
                        stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "constant-product invariant would decrease"))
                      } else {
                        swapBtoA!(*_id, holder, amountIn, (amountIn * reserveA) / (reserveB + amountIn), reserveA, reserveB, totalShares, positions, *ret)
                      }
                    }
                    _ => { stateCh!((reserveA, reserveB, totalShares, positions)) | ret!(("pool-error", "unknown swap direction")) }
                  }
                }
              }
            }
          }
        }
      }
    } |

    insertArbitrary!(bundle+{*poolService}, *poolUriCh) |
    for (@poolUri <- poolUriCh) {
      deployId!((true, "pool-created", ${quote(poolId)}, poolUri, ${quote(assetA.assetId)}, ${quote(assetB.assetId)}))
    }
    }
  }
}`
}

function readPoolTerm(locator: string): string {
  return `new rl(\`rho:registry:lookup\`), poolCh, return in {
    rl!(${rhoUri(locator)}, *poolCh) |
    for (poolService <- poolCh) { poolService!("info", *return) }
  }`
}

function readPositionTerm(locator: string, holder: string): string {
  return `new rl(\`rho:registry:lookup\`), poolCh, return in {
    rl!(${rhoUri(locator)}, *poolCh) |
    for (poolService <- poolCh) { poolService!("position", ${quote(holder)}, *return) }
  }`
}

export async function readPoolInfo(reference: string): Promise<AssetObservation<PoolInfo>> {
  const locator = reference.trim().toLowerCase()
  if (!REGISTRY_URI.test(locator)) throw new Error('Pool locator must be a rho:id: registry URI.')
  const raw = await exploreTerm(readPoolTerm(locator), (expr) => {
    const tuple = decodeExpr(expr)
    if (!Array.isArray(tuple) || tuple[0] !== 'rholox-pool-v1') return undefined
    const [,
      poolId,
      assetAId,
      assetALocator,
      assetBId,
      assetBLocator,
      creatorAddress,
      reserveAValue,
      reserveBValue,
      totalSharesValue,
      feeBps,
      actualAValue,
      actualBValue,
      custodyVerified,
    ] = tuple
    if (
      typeof poolId !== 'string' || !POOL_ID.test(poolId) ||
      typeof assetAId !== 'string' || typeof assetBId !== 'string' ||
      typeof assetALocator !== 'string' || !REGISTRY_URI.test(assetALocator) ||
      typeof assetBLocator !== 'string' || !REGISTRY_URI.test(assetBLocator) ||
      typeof creatorAddress !== 'string' || feeBps !== 0 || typeof custodyVerified !== 'boolean'
    ) return undefined
    const reserveA = asBigInt(reserveAValue)
    const reserveB = asBigInt(reserveBValue)
    const totalShares = asBigInt(totalSharesValue)
    const actualA = asBigInt(actualAValue)
    const actualB = asBigInt(actualBValue)
    if (reserveA === undefined || reserveB === undefined || totalShares === undefined || actualA === undefined || actualB === undefined) return undefined
    if (reserveA > POOL_MAX_RESERVE_UNITS || reserveB > POOL_MAX_RESERVE_UNITS) return undefined
    return { poolId, assetAId, assetALocator, assetBId, assetBLocator, creatorAddress, reserveA, reserveB, totalShares, actualA, actualB, custodyVerified }
  }, 'Pool state is not visible from the finalized read path.')

  const core = raw.value
  const [assetAObs, assetBObs] = await Promise.all([
    readAssetInfo(core.assetALocator),
    readAssetInfo(core.assetBLocator),
  ])
  if (
    assetAObs.value.runtimeVersion !== 2 || assetBObs.value.runtimeVersion !== 2 ||
    assetAObs.value.assetId !== core.assetAId || assetBObs.value.assetId !== core.assetBId
  ) {
    throw new Error('Pool asset registry metadata does not match its recorded asset identities.')
  }
  return {
    value: {
      poolId: core.poolId,
      locator,
      assetA: assetAObs.value,
      assetB: assetBObs.value,
      creatorAddress: core.creatorAddress,
      reserveA: core.reserveA,
      reserveB: core.reserveB,
      totalShares: core.totalShares,
      feeBps: POOL_FEE_BPS,
      actualA: core.actualA,
      actualB: core.actualB,
      custodyVerified: core.custodyVerified,
    },
    block: raw.block,
  }
}

export async function readPoolPosition(locator: string, holder: string): Promise<AssetObservation<bigint>> {
  const uri = locator.trim().toLowerCase()
  if (!REGISTRY_URI.test(uri)) throw new Error('Pool locator must be a rho:id: registry URI.')
  return exploreTerm(readPositionTerm(uri, holder), (expr) => asBigInt(decodeExpr(expr)), 'Pool position is not visible from the finalized read path.')
}

export async function createPool(wallet: RholoxWallet, left: AssetInfo, right: AssetInfo): Promise<PoolCreateReceipt> {
  const [assetA, assetB] = canonicalPoolAssets(left, right)
  const poolId = createPoolId()
  const deployId = await submitSignedTerm(wallet, installPoolTerm(poolId, assetA, assetB), 1_800_000)
  const processed = await waitForProcessedDeploy(deployId, 'Pool deploy')
  const tuple = decodeDeployTuple(processed.deployResult)
  const locator = tuple && typeof tuple[3] === 'string' ? tuple[3].toLowerCase() : ''
  if (
    !tuple || tuple[0] !== true || tuple[1] !== 'pool-created' || tuple[2] !== poolId ||
    !REGISTRY_URI.test(locator) || tuple[4] !== assetA.assetId || tuple[5] !== assetB.assetId
  ) {
    throw new Error('Pool install returned an unexpected registry receipt.')
  }

  let pool: PoolInfo | undefined
  let finalizedBlock: AssetBlock | undefined
  for (let i = 0; i < 24; i += 1) {
    try {
      const observed = await readPoolInfo(locator)
      pool = observed.value
      if (
        pool.poolId === poolId &&
        pool.reserveA === 0n && pool.reserveB === 0n && pool.totalShares === 0n &&
        pool.actualA === 0n && pool.actualB === 0n && pool.custodyVerified &&
        pool.creatorAddress === wallet.revAddress &&
        observed.block && observed.block.blockNumber >= processed.block.blockNumber
      ) {
        finalizedBlock = observed.block
        break
      }
    } catch { /* wait for finalized visibility */ }
    await sleep(3000)
  }

  if (!pool) {
    pool = {
      poolId,
      locator,
      assetA,
      assetB,
      creatorAddress: wallet.revAddress,
      reserveA: 0n,
      reserveB: 0n,
      totalShares: 0n,
      feeBps: POOL_FEE_BPS,
      actualA: 0n,
      actualB: 0n,
      custodyVerified: false,
    }
  }

  return { pool, deployId, inclusionBlock: processed.block, finalizedBlock, finalized: Boolean(finalizedBlock) }
}

export type LiquidityAddReceipt = {
  poolBefore: PoolInfo
  poolAfter?: PoolInfo
  deployId: string
  inclusionBlock: AssetBlock
  finalizedBlock?: AssetBlock
  amountA: bigint
  amountB: bigint
  mintedShares: bigint
  positionBefore: bigint
  positionAfter?: bigint
  finalized: boolean
}

export type LiquidityRemoveReceipt = {
  poolBefore: PoolInfo
  poolAfter?: PoolInfo
  deployId: string
  inclusionBlock: AssetBlock
  finalizedBlock?: AssetBlock
  shares: bigint
  amountA: bigint
  amountB: bigint
  positionBefore: bigint
  positionAfter?: bigint
  finalized: boolean
}

export type SwapReceipt = {
  poolBefore: PoolInfo
  poolAfter?: PoolInfo
  deployId: string
  inclusionBlock: AssetBlock
  finalizedBlock?: AssetBlock
  direction: SwapDirection
  amountIn: bigint
  amountOut: bigint
  positionBefore: bigint
  positionAfter?: bigint
  finalized: boolean
}

function operationResult(tuple: unknown[] | undefined, expectedTag: string): unknown[] {
  if (!tuple) throw new Error('Pool operation returned no receipt.')
  if (tuple[0] === true && tuple[1] === expectedTag) return tuple
  const failure = tuple[0] === false && typeof tuple[2] === 'string' ? tuple[2] : 'Pool operation returned an unexpected receipt.'
  throw new Error(failure)
}

function addLiquidityTerm(pool: PoolInfo, amountA: bigint, amountB: bigint, minShares: bigint): string {
  return `new rl(\`rho:registry:lookup\`), poolCh, deployerId(\`rho:rchain:deployerId\`), deployId(\`rho:rchain:deployId\`), ret in {
    rl!(${rhoUri(pool.locator)}, *poolCh) |
    for (poolService <- poolCh) {
      poolService!(*deployerId, "addLiquidity", ${amountA}, ${amountB}, ${minShares}, ${pool.reserveA}, ${pool.reserveB}, ${pool.totalShares}, *ret)
    } |
    for (@result <- ret) {
      match result {
        ("liquidity-added", a, b, shares, holder) => { deployId!((true, "pool-add-liquidity", a, b, shares, holder)) }
        ("pool-error", message) => { deployId!((false, "pool-add-liquidity", message)) }
        ("pool-fatal", message) => { deployId!((false, "pool-fatal", message)) }
      }
    }
  }`
}

function removeLiquidityTerm(pool: PoolInfo, shares: bigint, minA: bigint, minB: bigint): string {
  return `new rl(\`rho:registry:lookup\`), poolCh, deployerId(\`rho:rchain:deployerId\`), deployId(\`rho:rchain:deployId\`), ret in {
    rl!(${rhoUri(pool.locator)}, *poolCh) |
    for (poolService <- poolCh) {
      poolService!(*deployerId, "removeLiquidity", ${shares}, ${minA}, ${minB}, ${pool.reserveA}, ${pool.reserveB}, ${pool.totalShares}, *ret)
    } |
    for (@result <- ret) {
      match result {
        ("liquidity-removed", a, b, burned, holder) => { deployId!((true, "pool-remove-liquidity", a, b, burned, holder)) }
        ("pool-error", message) => { deployId!((false, "pool-remove-liquidity", message)) }
        ("pool-fatal", message) => { deployId!((false, "pool-fatal", message)) }
      }
    }
  }`
}

function swapTerm(pool: PoolInfo, direction: SwapDirection, amountIn: bigint, minOut: bigint): string {
  return `new rl(\`rho:registry:lookup\`), poolCh, deployerId(\`rho:rchain:deployerId\`), deployId(\`rho:rchain:deployId\`), ret in {
    rl!(${rhoUri(pool.locator)}, *poolCh) |
    for (poolService <- poolCh) {
      poolService!(*deployerId, "swap", ${quote(direction)}, ${amountIn}, ${minOut}, ${pool.reserveA}, ${pool.reserveB}, ${pool.totalShares}, *ret)
    } |
    for (@result <- ret) {
      match result {
        ("swapped", dir, amount, output, holder) => { deployId!((true, "pool-swap", dir, amount, output, holder)) }
        ("pool-error", message) => { deployId!((false, "pool-swap", message)) }
        ("pool-fatal", message) => { deployId!((false, "pool-fatal", message)) }
      }
    }
  }`
}

function observedAtOrAfter(block: AssetBlock | undefined, inclusionHeight: number): boolean {
  return Boolean(block && block.blockNumber >= inclusionHeight)
}

function balanceAsBigInt(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Asset balance is outside the supported client integer range.')
  return BigInt(value)
}

export async function addLiquidity(
  wallet: RholoxWallet,
  poolLocator: string,
  amountA: bigint,
  amountB: bigint,
  minShares = 0n,
): Promise<LiquidityAddReceipt> {
  const poolObs = await readPoolInfo(poolLocator)
  const pool = poolObs.value
  if (!pool.custodyVerified) throw new Error('Pool custody does not match its recorded reserves.')
  const [positionObs, balanceAObs, balanceBObs] = await Promise.all([
    readPoolPosition(poolLocator, wallet.revAddress),
    readAssetBalance(pool.assetA, wallet.revAddress),
    readAssetBalance(pool.assetB, wallet.revAddress),
  ])
  const balanceABefore = balanceAsBigInt(balanceAObs.value)
  const balanceBBefore = balanceAsBigInt(balanceBObs.value)
  if (balanceABefore < amountA || balanceBBefore < amountB) throw new Error('Insufficient asset balance for this liquidity deposit.')
  const quoteResult = quoteAddLiquidity(pool, amountA, amountB, minShares)

  const deployId = await submitSignedTerm(wallet, addLiquidityTerm(pool, amountA, amountB, minShares), 1_500_000)
  const processed = await waitForProcessedDeploy(deployId, 'Pool add-liquidity deploy')
  const tuple = operationResult(decodeDeployTuple(processed.deployResult), 'pool-add-liquidity')
  if (asBigInt(tuple[2]) !== amountA || asBigInt(tuple[3]) !== amountB || asBigInt(tuple[4]) !== quoteResult.mintedShares || tuple[5] !== wallet.revAddress) {
    throw new Error('Pool add-liquidity receipt does not match the requested transition.')
  }

  let poolAfter: PoolInfo | undefined
  let positionAfter: bigint | undefined
  let finalizedBlock: AssetBlock | undefined
  for (let i = 0; i < 24; i += 1) {
    try {
      const [nextPoolObs, nextPositionObs, nextAObs, nextBObs] = await Promise.all([
        readPoolInfo(poolLocator),
        readPoolPosition(poolLocator, wallet.revAddress),
        readAssetBalance(pool.assetA, wallet.revAddress),
        readAssetBalance(pool.assetB, wallet.revAddress),
      ])
      poolAfter = nextPoolObs.value
      positionAfter = nextPositionObs.value
      if (
        poolAfter.custodyVerified &&
        poolAfter.reserveA === quoteResult.reserveA &&
        poolAfter.reserveB === quoteResult.reserveB &&
        poolAfter.totalShares === quoteResult.totalShares &&
        positionAfter === positionObs.value + quoteResult.mintedShares &&
        balanceAsBigInt(nextAObs.value) === balanceABefore - amountA &&
        balanceAsBigInt(nextBObs.value) === balanceBBefore - amountB &&
        observedAtOrAfter(nextPoolObs.block, processed.block.blockNumber) &&
        observedAtOrAfter(nextPositionObs.block, processed.block.blockNumber) &&
        observedAtOrAfter(nextAObs.block, processed.block.blockNumber) &&
        observedAtOrAfter(nextBObs.block, processed.block.blockNumber)
      ) {
        finalizedBlock = nextPoolObs.block
        break
      }
    } catch { /* wait for finalized visibility */ }
    await sleep(3000)
  }

  return {
    poolBefore: pool,
    poolAfter,
    deployId,
    inclusionBlock: processed.block,
    finalizedBlock,
    amountA,
    amountB,
    mintedShares: quoteResult.mintedShares,
    positionBefore: positionObs.value,
    positionAfter,
    finalized: Boolean(finalizedBlock),
  }
}

export async function removeLiquidity(
  wallet: RholoxWallet,
  poolLocator: string,
  shares: bigint,
  minA = 0n,
  minB = 0n,
): Promise<LiquidityRemoveReceipt> {
  const poolObs = await readPoolInfo(poolLocator)
  const pool = poolObs.value
  if (!pool.custodyVerified) throw new Error('Pool custody does not match its recorded reserves.')
  const [positionObs, balanceAObs, balanceBObs] = await Promise.all([
    readPoolPosition(poolLocator, wallet.revAddress),
    readAssetBalance(pool.assetA, wallet.revAddress),
    readAssetBalance(pool.assetB, wallet.revAddress),
  ])
  const balanceABefore = balanceAsBigInt(balanceAObs.value)
  const balanceBBefore = balanceAsBigInt(balanceBObs.value)
  const quoteResult = quoteRemoveLiquidity(pool, positionObs.value, shares, minA, minB)

  const deployId = await submitSignedTerm(wallet, removeLiquidityTerm(pool, shares, minA, minB), 1_500_000)
  const processed = await waitForProcessedDeploy(deployId, 'Pool remove-liquidity deploy')
  const tuple = operationResult(decodeDeployTuple(processed.deployResult), 'pool-remove-liquidity')
  if (asBigInt(tuple[2]) !== quoteResult.amountA || asBigInt(tuple[3]) !== quoteResult.amountB || asBigInt(tuple[4]) !== shares || tuple[5] !== wallet.revAddress) {
    throw new Error('Pool remove-liquidity receipt does not match the requested transition.')
  }

  let poolAfter: PoolInfo | undefined
  let positionAfter: bigint | undefined
  let finalizedBlock: AssetBlock | undefined
  for (let i = 0; i < 24; i += 1) {
    try {
      const [nextPoolObs, nextPositionObs, nextAObs, nextBObs] = await Promise.all([
        readPoolInfo(poolLocator),
        readPoolPosition(poolLocator, wallet.revAddress),
        readAssetBalance(pool.assetA, wallet.revAddress),
        readAssetBalance(pool.assetB, wallet.revAddress),
      ])
      poolAfter = nextPoolObs.value
      positionAfter = nextPositionObs.value
      if (
        poolAfter.custodyVerified &&
        poolAfter.reserveA === quoteResult.reserveA &&
        poolAfter.reserveB === quoteResult.reserveB &&
        poolAfter.totalShares === quoteResult.totalShares &&
        positionAfter === positionObs.value - shares &&
        balanceAsBigInt(nextAObs.value) === balanceABefore + quoteResult.amountA &&
        balanceAsBigInt(nextBObs.value) === balanceBBefore + quoteResult.amountB &&
        observedAtOrAfter(nextPoolObs.block, processed.block.blockNumber) &&
        observedAtOrAfter(nextPositionObs.block, processed.block.blockNumber) &&
        observedAtOrAfter(nextAObs.block, processed.block.blockNumber) &&
        observedAtOrAfter(nextBObs.block, processed.block.blockNumber)
      ) {
        finalizedBlock = nextPoolObs.block
        break
      }
    } catch { /* wait for finalized visibility */ }
    await sleep(3000)
  }

  return {
    poolBefore: pool,
    poolAfter,
    deployId,
    inclusionBlock: processed.block,
    finalizedBlock,
    shares,
    amountA: quoteResult.amountA,
    amountB: quoteResult.amountB,
    positionBefore: positionObs.value,
    positionAfter,
    finalized: Boolean(finalizedBlock),
  }
}

export async function swap(
  wallet: RholoxWallet,
  poolLocator: string,
  direction: SwapDirection,
  amountIn: bigint,
  minOut = 0n,
): Promise<SwapReceipt> {
  const poolObs = await readPoolInfo(poolLocator)
  const pool = poolObs.value
  if (!pool.custodyVerified) throw new Error('Pool custody does not match its recorded reserves.')
  const [positionObs, balanceAObs, balanceBObs] = await Promise.all([
    readPoolPosition(poolLocator, wallet.revAddress),
    readAssetBalance(pool.assetA, wallet.revAddress),
    readAssetBalance(pool.assetB, wallet.revAddress),
  ])
  const balanceABefore = balanceAsBigInt(balanceAObs.value)
  const balanceBBefore = balanceAsBigInt(balanceBObs.value)
  const quoteResult = quoteSwap(pool, direction, amountIn, minOut)
  if (direction === 'A_TO_B' && balanceABefore < amountIn) throw new Error(`Insufficient ${pool.assetA.symbol} balance for this swap.`)
  if (direction === 'B_TO_A' && balanceBBefore < amountIn) throw new Error(`Insufficient ${pool.assetB.symbol} balance for this swap.`)

  const deployId = await submitSignedTerm(wallet, swapTerm(pool, direction, amountIn, minOut), 1_500_000)
  const processed = await waitForProcessedDeploy(deployId, 'Pool swap deploy')
  const tuple = operationResult(decodeDeployTuple(processed.deployResult), 'pool-swap')
  if (tuple[2] !== direction || asBigInt(tuple[3]) !== amountIn || asBigInt(tuple[4]) !== quoteResult.amountOut || tuple[5] !== wallet.revAddress) {
    throw new Error('Pool swap receipt does not match the requested transition.')
  }

  const expectedA = direction === 'A_TO_B' ? balanceABefore - amountIn : balanceABefore + quoteResult.amountOut
  const expectedB = direction === 'A_TO_B' ? balanceBBefore + quoteResult.amountOut : balanceBBefore - amountIn
  let poolAfter: PoolInfo | undefined
  let positionAfter: bigint | undefined
  let finalizedBlock: AssetBlock | undefined
  for (let i = 0; i < 24; i += 1) {
    try {
      const [nextPoolObs, nextPositionObs, nextAObs, nextBObs] = await Promise.all([
        readPoolInfo(poolLocator),
        readPoolPosition(poolLocator, wallet.revAddress),
        readAssetBalance(pool.assetA, wallet.revAddress),
        readAssetBalance(pool.assetB, wallet.revAddress),
      ])
      poolAfter = nextPoolObs.value
      positionAfter = nextPositionObs.value
      if (
        poolAfter.custodyVerified &&
        poolAfter.reserveA === quoteResult.reserveA &&
        poolAfter.reserveB === quoteResult.reserveB &&
        poolAfter.totalShares === pool.totalShares &&
        positionAfter === positionObs.value &&
        balanceAsBigInt(nextAObs.value) === expectedA &&
        balanceAsBigInt(nextBObs.value) === expectedB &&
        observedAtOrAfter(nextPoolObs.block, processed.block.blockNumber) &&
        observedAtOrAfter(nextPositionObs.block, processed.block.blockNumber) &&
        observedAtOrAfter(nextAObs.block, processed.block.blockNumber) &&
        observedAtOrAfter(nextBObs.block, processed.block.blockNumber)
      ) {
        finalizedBlock = nextPoolObs.block
        break
      }
    } catch { /* wait for finalized visibility */ }
    await sleep(3000)
  }

  return {
    poolBefore: pool,
    poolAfter,
    deployId,
    inclusionBlock: processed.block,
    finalizedBlock,
    direction,
    amountIn,
    amountOut: quoteResult.amountOut,
    positionBefore: positionObs.value,
    positionAfter,
    finalized: Boolean(finalizedBlock),
  }
}
