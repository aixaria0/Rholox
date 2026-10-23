import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'
import bs58 from 'bs58'
import { blake2b } from 'blakejs'

let source = ts.transpileModule(readFileSync(new URL('../src/lib/rev-snapshot.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
for (const dependency of ['bs58', 'blakejs'])
  source = source.replaceAll(`from '${dependency}'`, `from '${import.meta.resolve(dependency)}'`)
const { normalizeSnapshotAddress, parseSnapshotLookup, parseSnapshotMetadata, formatSnapshotRev } =
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
function address(seed) {
  const body = new Uint8Array(36)
  body.fill(seed, 4)
  return bs58.encode(new Uint8Array([...body, ...blake2b(body, undefined, 32).slice(0, 4)]))
}
const known = address(17), missing = address(18)
const metadata = {
  schema_version: 1, snapshot_date: '2000-01-01', snapshot_date_basis: 'operator_reference',
  decimals: 8, record_count: 2, snapshot_id: 'a'.repeat(64),
}
const response = { ...metadata, address: known, found: true, balance_drops: '9007199254740993' }
let checks = 0
function check(name, fn) { fn(); checks++; console.log('PASS ' + name) }
check('synthetic checksum-valid address and whitespace preserve case', () => {
  assert.equal(normalizeSnapshotAddress(' ' + known + '\n'), known)
})
for (const input of ['', 'ab'.repeat(32), known.toLowerCase(), known.slice(0, -1) + '0', '1'.repeat(65)])
  check('rejects malformed or private-key-shaped input', () => assert.throws(() => normalizeSnapshotAddress(input)))
check('valid metadata is projected without private fields', () => {
  assert.deepEqual(parseSnapshotMetadata({ ...metadata, balances: ['never returned'] }), metadata)
})
for (const patch of [{ schema_version: 2 }, { decimals: 9 }, { record_count: 0 }, { record_count: 50001 },
  { snapshot_date: '2000-02-30' }, { snapshot_date_basis: 'unverified' }, { snapshot_id: 'bad' }])
  check('rejects invalid reference metadata', () => assert.throws(() => parseSnapshotMetadata({ ...metadata, ...patch })))
check('amount above 2^53 retains an odd final unit', () => {
  assert.equal(parseSnapshotLookup(response, known).drops, '9007199254740993')
  assert.equal(formatSnapshotRev('9007199254740993'), '90,071,992.54740993')
  assert.equal(formatSnapshotRev('1'), '0.00000001')
})
check('recorded zero is distinct from absence', () => {
  assert.equal(parseSnapshotLookup({ ...response, balance_drops: '0' }, known).drops, '0')
  assert.equal(formatSnapshotRev('0'), '0.00000000')
  assert.equal(parseSnapshotLookup({ ...response, found: false, balance_drops: null }, known).drops, null)
})
for (const patch of [{ address: missing }, { found: false }, { balance_drops: null }, { found: 'true' },
  { balances: [[known, '1']] }, { balance_drops: 1 }, { balance_drops: '01' },
  { balance_drops: '-1' }, { balance_drops: '1e8' }, { balance_drops: '18446744073709551616' }])
  check('rejects contradictory, bulk, noncanonical or mismatched result', () => {
    assert.throws(() => parseSnapshotLookup({ ...response, ...patch }, known))
  })
check('maximum u64 formats exactly', () => {
  assert.equal(formatSnapshotRev('18446744073709551615'), '184,467,440,737.09551615')
})
const temporary = mkdtempSync(join(tmpdir(), 'rholox-synthetic-'))
const runImport = (csv, destination) => {
  const input = join(temporary, 'input.csv')
  writeFileSync(input, csv)
  return execFileSync(process.execPath, ['scripts/prepare-rev-snapshot.mjs', input, destination, '2000-01-01'], { stdio: 'pipe' })
}
try {
  check('private importer reconciles synthetic exact strings without building public data', () => {
    const directory = join(temporary, 'private')
    runImport('address,balance_drops\n' + known + ',9007199254740993\n' + missing + ',0\n', directory)
    const data = JSON.parse(readFileSync(join(directory, 'balances.json')))
    assert.equal(data.balances.find(([key]) => key === known)[1], '9007199254740993')
    assert.equal(JSON.parse(readFileSync(join(directory, 'manifest.json'))).record_count, 2)
  })
  for (const csv of ['address,balance_drops\n' + known + ',1\n' + known + ',2\n',
    'address,balance_drops\n' + known + ',1.0\n', 'address,balance_drops\ninvalid,0\n'])
    check('importer rejects duplicate, inexact or invalid rows', () => {
      assert.throws(() => runImport(csv, join(temporary, 'invalid')))
    })
  check('importer refuses a public output directory', () => {
    assert.throws(() => runImport('address,balance_drops\n' + known + ',1\n', join(temporary, 'public', 'data')))
  })
} finally { rmSync(temporary, { recursive: true, force: true }) }
console.log(checks + ' synthetic lookup/import checks passed; no production records were used.')
