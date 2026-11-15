#!/usr/bin/env node
/** Fail-closed GitHub Pages sanitizer: do not publish server scripts or secrets. */
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
const root = resolve(process.argv[2] ?? 'rholox-source/dist')
if (!existsSync(join(root, 'index.html'))) throw new Error('Missing index.html')
const forbidden = /(^|\\/)(\\.env(?:\\..*)?|[^/]+\\.(?:pem|key|p12|pfx|sqlite3?|db|csv|tsv|bak|tar|gz|zip))$/i
const suspicious = /(?:private[-_.]key|seed[-_.]phrase|mnemonic|wallet[-_.]secret|rev[-_.]snapshot[-_.]raw)/i
let removed = 0
function scan(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const rel = relative(root, path).replaceAll('\\\\', '/')
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) throw new Error('Symlink forbidden: ' + rel)
    if (stat.isDirectory()) { scan(path); continue }
    if (!stat.isFile()) throw new Error('Unexpected artifact: ' + rel)
    if (/\\.php\\d*$|(^|\\/)\\.htaccess$/i.test(rel)) {
      rmSync(path)
      removed++
      continue
    }
    if (forbidden.test(rel) || suspicious.test(rel)) {
      throw new Error('Sensitive deployment candidate: ' + rel)
    }
  }
}
scan(root)
const index = readFileSync(join(root, 'index.html'), 'utf8')
if (!index.includes('type="module"') || !index.includes('/assets/')) {
  throw new Error('Root static build lacks expected module asset links')
}
console.log('Static publish guard passed. Removed server-only files:', removed)
