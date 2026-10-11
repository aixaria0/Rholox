import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const transfer = readFileSync(new URL('../src/lib/transfer.ts', import.meta.url), 'utf8')
const proof = readFileSync(new URL('../src/lib/proof.ts', import.meta.url), 'utf8')
const rchain = readFileSync(new URL('../src/lib/rchain.ts', import.meta.url), 'utf8')
const asset = readFileSync(new URL('../src/lib/asset.ts', import.meta.url), 'utf8')
const assetLab = readFileSync(new URL('../src/AssetLabPanel.tsx', import.meta.url), 'utf8')

const failures = []

for (const forbidden of ['Mainnet Live', 'RChain Testnet', 'RChain, observable.']) {
  if (main.includes(forbidden) || html.includes(forbidden) || assetLab.includes(forbidden)) {
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
for (const source of [rchain, proof, transfer, asset]) {
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
for (const label of ['Asset ID', 'Asset name', 'Asset symbol', 'Asset decimals', 'Initial asset supply', 'Asset recipient REV address', 'Asset transfer amount']) {
  if (!assetLab.includes(`aria-label="${label}"`)) failures.push(`Asset Lab accessible label missing: ${label}`)
}
if (!assetLab.includes('No mainnet value, custody, DEX, or post-creation mint claim')) failures.push('Asset Lab scope boundary copy missing')

if (failures.length) {
  console.error('Source verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Source verification passed.')
