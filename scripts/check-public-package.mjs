import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

for (const path of ['data/rev-snapshot', 'src/data/rev-snapshot-manifest.json', 'public/data'])
  assert.ok(!existsSync(path), 'Reference data must not be in the public source/build: ' + path)
function inspect(directory) {
  if (!existsSync(directory)) return
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, item.name)
    if (item.isDirectory()) { inspect(path); continue }
    assert.ok(!/\.(csv|tsv|xlsx?)$/i.test(item.name), 'Spreadsheet artifact in public package: ' + path)
    assert.ok(!/^(balances|manifest|rev-snapshot.*)\.json$/i.test(item.name), 'Reference payload in public package: ' + path)
    if (/\.(html|js|json|txt|php)$/.test(item.name))
      assert.ok(!readFileSync(path, 'utf8').includes('docs.google.com/spreadsheets/'), 'Spreadsheet link in public package: ' + path)
  }
}
inspect('dist')
console.log('Public source/build guard passed: utility only, without spreadsheet data or links.')
