import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const root = new URL('../vendor/rchain-assurance-v1/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('SOURCE.json', root), 'utf8'))
assert.equal(manifest.repository,'aixaria0/RCHAIN-COMPLIER')
assert.match(manifest.revision,/^[a-f0-9]{40}$/)
assert.equal(manifest.contract,'rchain-assurance/v1')
for (const [file, digest] of Object.entries(manifest.files)) assert.equal(createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex'), digest, `Compiler vendor drift: ${file}`)
console.log(`Compiler verifier source pin verified: ${manifest.revision}`)
