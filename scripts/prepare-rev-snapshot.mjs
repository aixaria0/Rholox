import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import bs58 from 'bs58'
import { blake2b } from 'blakejs'

const args = process.argv.slice(2)
assert.equal(args.length, 3, 'Usage: node scripts/prepare-rev-snapshot.mjs INPUT.csv PRIVATE_OUTPUT_DIR YYYY-MM-DD')
const [input, output, date] = args
assert.match(date, /^\d{4}-\d{2}-\d{2}$/)
assert.equal(new Date(date + 'T00:00:00Z').toISOString().slice(0, 10), date)
const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)))
const directory = resolve(output)
assert.ok(directory !== root && !directory.startsWith(root + sep), 'Private output must be outside the repository')
assert.ok(!directory.split(sep).some((part) => ['public', 'public_html', 'dist', 'htdocs', 'www'].includes(part)), 'Private output must be outside public web directories')
const lines = readFileSync(input, 'utf8').trimEnd().split(/\r?\n/)
assert.equal(lines.shift(), 'address,balance_drops')
const balances = []
const seen = new Set()
for (const [index, line] of lines.entries()) {
  const row = line.split(',')
  assert.equal(row.length, 2, 'Invalid CSV row ' + (index + 2))
  const [address, drops] = row
  assert.ok(address.length >= 40 && address.length <= 64)
  const bytes = bs58.decode(address)
  assert.equal(bytes.length, 40)
  assert.ok(bytes.slice(0, 4).every((value) => value === 0))
  assert.deepEqual(bytes.slice(36), blake2b(bytes.slice(0, 36), undefined, 32).slice(0, 4))
  assert.match(drops, /^(0|[1-9]\d{0,19})$/)
  assert.ok(BigInt(drops) <= 18_446_744_073_709_551_615n)
  assert.ok(!seen.has(address), 'Duplicate reference address')
  seen.add(address)
  balances.push([address, drops])
}
assert.ok(balances.length > 0 && balances.length <= 50_000)
balances.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
const data = JSON.stringify({ schema_version: 1, balances }) + '\n'
assert.ok(Buffer.byteLength(data) <= 8 * 1024 * 1024)
const manifest = {
  schema_version: 1, snapshot_date: date, snapshot_date_basis: 'source_title', decimals: 8,
  record_count: balances.length, byte_length: Buffer.byteLength(data),
  sha256: createHash('sha256').update(data).digest('hex'),
}
mkdirSync(directory, { recursive: true, mode: 0o700 })
const actual = realpathSync(directory)
assert.ok(actual !== root && !actual.startsWith(root + sep), 'Resolved private output is inside the repository')
assert.ok(!actual.split(sep).some((part) => ['public', 'public_html', 'dist', 'htdocs', 'www'].includes(part)))
// Refuse to overwrite an active import; deploy a new directory and switch it as one unit.
writeFileSync(directory + '/balances.json', data, { mode: 0o600, flag: 'wx' })
writeFileSync(directory + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
console.log('Prepared ' + balances.length + ' validated records outside the repository. No data is part of the application build.')
