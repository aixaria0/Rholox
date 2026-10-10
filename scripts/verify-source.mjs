import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8')
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const transfer = readFileSync(new URL('../src/lib/transfer.ts', import.meta.url), 'utf8')

const failures = []

for (const forbidden of ['Mainnet Live', 'RChain Testnet', 'RChain, observable.']) {
  if (main.includes(forbidden) || html.includes(forbidden)) {
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

if (failures.length) {
  console.error('Source verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Source verification passed.')
