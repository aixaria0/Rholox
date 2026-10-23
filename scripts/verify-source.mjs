import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const transfer = readFileSync(new URL('../src/lib/transfer.ts', import.meta.url), 'utf8')
const proof = readFileSync(new URL('../src/lib/proof.ts', import.meta.url), 'utf8')
const rchain = readFileSync(new URL('../src/lib/rchain.ts', import.meta.url), 'utf8')
const asset = readFileSync(new URL('../src/lib/asset.ts', import.meta.url), 'utf8')
const assetLab = readFileSync(new URL('../src/AssetLabPanel.tsx', import.meta.url), 'utf8')
const exchange = readFileSync(new URL('../src/ExchangePanel.tsx', import.meta.url), 'utf8')
const exchangeCore = readFileSync(new URL('../src/lib/exchange.ts', import.meta.url), 'utf8')
const amm = readFileSync(new URL('../src/lib/amm.ts', import.meta.url), 'utf8')
const deploy = readFileSync(new URL('../src/lib/deploy.ts', import.meta.url), 'utf8')
const wallet = readFileSync(new URL('../src/lib/wallet.ts', import.meta.url), 'utf8')

const failures = []

const privateStateSources = [main, wallet, proof, transfer, deploy, asset, exchangeCore]
for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB']) {
  if (privateStateSources.some((source) => source.includes(forbidden))) failures.push(`browser persistence forbidden for signing/custody state: ${forbidden}`)
}


for (const forbidden of ['Mainnet Live', 'RChain Testnet', 'RChain, observable.']) {
  if (main.includes(forbidden) || html.includes(forbidden) || assetLab.includes(forbidden) || exchange.includes(forbidden)) {
    failures.push(`forbidden UI label present: ${forbidden}`)
  }
}

for (const required of [
  'PUBLIC TESTNET',
  'Network Console',
  'Wallet + Test REV',
  'Rholox Proof',
  'Explorer',
  'REV transfer',
  'Asset Lab',
  'Exchange Core',
]) {
  if (!main.includes(required)) failures.push(`required product surface missing: ${required}`)
}

if (!main.includes("/^\\d+$/.test(value)")) {
  failures.push('numeric explorer height lookup is not using the expected digit regex')
}

for (const invariant of [
  "Recipient is not a valid REV address.",
  "Recipient cannot be this wallet itself.",
  "Transfer amount must be greater than zero.",
]) {
  if (!transfer.includes(invariant)) failures.push(`transfer guard missing: ${invariant}`)
}


if (main.includes('status?.version?.node')) failures.push('raw node vendor/version metadata must not be rendered')
if (!main.includes('Promise.allSettled')) failures.push('network observations must degrade independently')
if (!main.includes("value === undefined ? 'UNKNOWN'")) failures.push('unknown capability state must remain explicit')
if (!main.includes('environment-pill--pending')) failures.push('initial network state must not be presented as offline')
if (!main.includes('Recent block list may be stale.')) failures.push('explorer stale-state marker missing')
if (!main.includes("prefers-reduced-motion: reduce")) failures.push('motion-aware scrolling guard missing')
for (const label of ['Private key', 'Recipient REV address', 'Amount in REV', 'Proof payload', 'Explorer lookup']) {
  if (!main.includes(`aria-label=\"${label}\"`)) failures.push(`accessible label missing: ${label}`)
}
for (const source of [rchain, proof, transfer, deploy]) {
  if (!source.includes('fetchWithTimeout')) failures.push('network request timeout guard missing from an operational module')
}

if (main.includes('title="Asset Lab" detail="Next phase"')) failures.push('Asset Lab is still presented as a future placeholder')
for (const marker of [
  'rho:rchain:makeMint',
  'MakeMint fixed-supply purse asset',
  'verifyBrand',
  'balanceOf',
  'asset-transfer',
]) {
  if (!asset.includes(marker)) failures.push(`asset runtime invariant missing: ${marker}`)
}
if (!asset.includes('const ASSET_ID = /^[0-9a-f]{64}$/')) failures.push('asset IDs must remain 256-bit / 64-hex')
if (!asset.includes('new Uint8Array(32)')) failures.push('asset ID generation must use 32 random bytes')
if (asset.includes('@"mint"')) failures.push('Asset Lab v1 must not expose a post-creation mint method')
for (const label of ['Asset reference', 'Asset name', 'Asset symbol', 'Asset decimals', 'Initial asset supply', 'Asset recipient REV address', 'Asset transfer amount']) {
  if (!assetLab.includes(`aria-label="${label}"`)) failures.push(`Asset Lab accessible label missing: ${label}`)
}
if (!assetLab.includes('Runtime v2 adds the capability bridge used by Exchange Core')) failures.push('Asset Lab v2 capability boundary copy missing')


for (const marker of [
  'makeEmptyPurse',
  'depositInto',
  'withdrawFrom',
  'custody balance mismatch',
  'pool-fatal',
  'rho:registry:insertArbitrary',
  'bundle+{*poolService}',
]) {
  if (!exchangeCore.includes(marker) && !asset.includes(marker)) failures.push(`exchange custody invariant missing: ${marker}`)
}
for (const marker of [
  'quoteAddLiquidity',
  'quoteRemoveLiquidity',
  'quoteSwap',
  'productAfter < productBefore',
  'POOL_MAX_RESERVE_UNITS',
]) {
  if (!amm.includes(marker)) failures.push(`AMM math invariant missing: ${marker}`)
}
if (!exchangeCore.includes('const POOL_ID = /^[0-9a-f]{64}$/')) failures.push('pool metadata IDs must remain 256-bit / 64-hex')
if (!exchangeCore.includes('const REGISTRY_URI = /^rho:id:[a-z0-9]+$/')) failures.push('pool public locator must be a native registry URI')
if (!asset.includes('const REGISTRY_URI = /^rho:id:[a-z0-9]+$/')) failures.push('asset v2 public locator must be a native registry URI')
if (!asset.includes('rho:registry:insertArbitrary') || !asset.includes('bundle+{*assetService}')) failures.push('asset v2 service must be registered as a bundled native-registry capability')
if (!exchangeCore.includes('rho:registry:lookup')) failures.push('exchange must resolve pool/asset capabilities through the native registry')
if (!exchangeCore.includes('new Uint8Array(32)')) failures.push('pool ID generation must use 32 random bytes')
if (!exchangeCore.includes("feeBps: 0")) failures.push('exchange v1 fee must remain explicit and zero')

if (!exchangeCore.includes("stale pool state")) failures.push('pool mutations must refuse stale quoted state')
if (!exchangeCore.includes('rho:rchain:deployerId') || !exchangeCore.includes('creatorCh') || !exchangeCore.includes('revAddr!("fromDeployerId", *deployerId, *creatorCh)')) failures.push('pool creator must be derived from deployerId on-chain')
const poolIdentityCalls = exchangeCore.match(/revAddr!\(\"fromDeployerId\", \*_id, \*holderCh\)/g) ?? []
if (poolIdentityCalls.length !== 3) failures.push(`all three pool mutations must derive holder identity from a deployerId capability (found ${poolIdentityCalls.length})`)
const assetIdentityCalls = asset.match(/revAddr!\(\"fromDeployerId\", \*_id, \*fromCh\)/g) ?? []
if (assetIdentityCalls.length !== 2) failures.push(`asset deposit/transfer must derive sender identity from a deployerId capability (found ${assetIdentityCalls.length})`)
if (!asset.includes('contract assetService(@"withdrawFrom", sourcePurse')) failures.push('asset withdrawal authority must remain source-purse capability based')

if (!exchangeCore.includes('@expectedA') || !exchangeCore.includes('@expectedB') || !exchangeCore.includes('@expectedShares')) failures.push('pool mutations must carry the quoted reserve/share state')
if (!exchangeCore.includes('poolAfter.custodyVerified')) failures.push('pool mutation finality must verify custody equality')
if (!exchange.includes('no TVL · APR · volume · mainnet')) failures.push('exchange non-claims must remain visible')
if (!exchange.includes('FINALIZED · CUSTODY VERIFIED')) failures.push('exchange finalized custody status marker missing')
for (const label of [
  'Pool registry URI', 'Pool asset A registry URI', 'Pool asset B registry URI', 'Add asset A amount', 'Add asset B amount',
  'Minimum LP shares', 'Swap direction', 'Swap input amount', 'Minimum swap output',
  'LP shares to remove', 'Minimum asset A output', 'Minimum asset B output',
]) {
  if (!exchange.includes(`aria-label="${label}"`)) failures.push(`Exchange accessible label missing: ${label}`)
}
if (!main.includes("id: 'exchange'")) failures.push('Exchange Core module navigation is missing')

if (failures.length) {
  console.error('Source verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Source verification passed.')
