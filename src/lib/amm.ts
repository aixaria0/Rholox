export const POOL_MAX_RESERVE_UNITS = 10_000_000n

export type PoolReserves = {
  reserveA: bigint
  reserveB: bigint
  totalShares: bigint
}

export type AddLiquidityQuote = PoolReserves & {
  mintedShares: bigint
}

export type RemoveLiquidityQuote = PoolReserves & {
  amountA: bigint
  amountB: bigint
}

export type SwapDirection = 'A_TO_B' | 'B_TO_A'

export type SwapQuote = PoolReserves & {
  direction: SwapDirection
  amountIn: bigint
  amountOut: bigint
  productBefore: bigint
  productAfter: bigint
}

function positive(value: bigint, label: string) {
  if (value <= 0n) throw new Error(`${label} must be greater than zero.`)
}

function nonNegative(value: bigint, label: string) {
  if (value < 0n) throw new Error(`${label} cannot be negative.`)
}

function capped(value: bigint, label: string) {
  if (value > POOL_MAX_RESERVE_UNITS) {
    throw new Error(`${label} exceeds the public-testnet reserve cap.`)
  }
}

function validState(state: PoolReserves) {
  nonNegative(state.reserveA, 'Reserve A')
  nonNegative(state.reserveB, 'Reserve B')
  nonNegative(state.totalShares, 'Total shares')
  capped(state.reserveA, 'Reserve A')
  capped(state.reserveB, 'Reserve B')
  const empty = state.reserveA === 0n && state.reserveB === 0n && state.totalShares === 0n
  const live = state.reserveA > 0n && state.reserveB > 0n && state.totalShares > 0n
  if (!empty && !live) throw new Error('Pool state is internally inconsistent.')
}

export function quoteAddLiquidity(
  state: PoolReserves,
  amountA: bigint,
  amountB: bigint,
  minShares = 0n,
): AddLiquidityQuote {
  validState(state)
  positive(amountA, 'Asset A amount')
  positive(amountB, 'Asset B amount')
  nonNegative(minShares, 'Minimum shares')

  const reserveA = state.reserveA + amountA
  const reserveB = state.reserveB + amountB
  capped(reserveA, 'Reserve A')
  capped(reserveB, 'Reserve B')

  let mintedShares: bigint
  if (state.totalShares === 0n) {
    mintedShares = amountA + amountB
  } else {
    if (amountA * state.reserveB !== amountB * state.reserveA) {
      throw new Error('Liquidity deposit must preserve the current reserve ratio exactly.')
    }
    mintedShares = (amountA * state.totalShares) / state.reserveA
    const sharesFromB = (amountB * state.totalShares) / state.reserveB
    if (sharesFromB !== mintedShares) throw new Error('Liquidity share calculation is not exact for both reserves.')
  }

  positive(mintedShares, 'Minted shares')
  if (mintedShares < minShares) throw new Error('Minted shares are below the requested minimum.')

  return {
    reserveA,
    reserveB,
    totalShares: state.totalShares + mintedShares,
    mintedShares,
  }
}

export function quoteRemoveLiquidity(
  state: PoolReserves,
  ownedShares: bigint,
  shares: bigint,
  minA = 0n,
  minB = 0n,
): RemoveLiquidityQuote {
  validState(state)
  positive(shares, 'Shares to remove')
  nonNegative(ownedShares, 'Owned shares')
  nonNegative(minA, 'Minimum asset A output')
  nonNegative(minB, 'Minimum asset B output')
  if (state.totalShares === 0n) throw new Error('Pool has no liquidity.')
  if (shares > ownedShares) throw new Error('Cannot remove more LP shares than are owned.')
  if (shares > state.totalShares) throw new Error('Cannot remove more LP shares than exist.')

  const amountA = shares === state.totalShares
    ? state.reserveA
    : (shares * state.reserveA) / state.totalShares
  const amountB = shares === state.totalShares
    ? state.reserveB
    : (shares * state.reserveB) / state.totalShares

  positive(amountA, 'Asset A output')
  positive(amountB, 'Asset B output')
  if (amountA < minA) throw new Error('Asset A output is below the requested minimum.')
  if (amountB < minB) throw new Error('Asset B output is below the requested minimum.')

  return {
    amountA,
    amountB,
    reserveA: state.reserveA - amountA,
    reserveB: state.reserveB - amountB,
    totalShares: state.totalShares - shares,
  }
}

export function quoteSwap(
  state: PoolReserves,
  direction: SwapDirection,
  amountIn: bigint,
  minOut = 0n,
): SwapQuote {
  validState(state)
  if (direction !== 'A_TO_B' && direction !== 'B_TO_A') throw new Error('Unknown swap direction.')
  positive(amountIn, 'Swap input')
  nonNegative(minOut, 'Minimum swap output')
  if (state.totalShares === 0n) throw new Error('Pool has no liquidity.')

  const inputReserve = direction === 'A_TO_B' ? state.reserveA : state.reserveB
  const outputReserve = direction === 'A_TO_B' ? state.reserveB : state.reserveA
  const nextInputReserve = inputReserve + amountIn
  capped(nextInputReserve, direction === 'A_TO_B' ? 'Reserve A' : 'Reserve B')

  const amountOut = (amountIn * outputReserve) / nextInputReserve
  positive(amountOut, 'Swap output')
  if (amountOut >= outputReserve) throw new Error('Swap would exhaust the output reserve.')
  if (amountOut < minOut) throw new Error('Swap output is below the requested minimum.')

  const reserveA = direction === 'A_TO_B' ? nextInputReserve : state.reserveA - amountOut
  const reserveB = direction === 'A_TO_B' ? state.reserveB - amountOut : nextInputReserve
  const productBefore = state.reserveA * state.reserveB
  const productAfter = reserveA * reserveB
  if (productAfter < productBefore) throw new Error('Constant-product invariant would decrease.')

  return {
    direction,
    amountIn,
    amountOut,
    reserveA,
    reserveB,
    totalShares: state.totalShares,
    productBefore,
    productAfter,
  }
}
