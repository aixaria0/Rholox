#!/usr/bin/env node
/** Fail-closed GitHub Pages sanitizer: never publish server scripts or private material. */
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
const root = resolve(process.argv[2] ?? 'rholox-source/dist');
if (!existsSync(join(root, 'index.html'))) throw new Error('Missing static index.html');
const forbidden = /(^|\/)(\.env(?:\..*)?|[^/]+\.(?:pem|key|p12|pfx|sqlite3?|db|csv|tsv|bak|tar|gz|zip))$/i;
const suspicious = /(?:private[-_.]key|seed[-_.]phrase|mnemonic|wallet[-_.]secret|rev[-_.]snapshot[-_.]raw)/i;
let removed = 0;
function scan(dir) {
  for (const name of readdirSync(dir)) {
    const entry = join(dir, name);
    const rel = relative(root, entry).replaceAll('\\', '/');
    const stat = lstatSync(entry);
    if (stat.isSymbolicLink()) throw new Error('Symlink forbidden: ' + rel);
    if (stat.isDirectory()) { scan(entry); continue; }
    if (!stat.isFile()) throw new Error('Unexpected artifact: ' + rel);
    if (/\.php\d*$|(^|\/)\.htaccess$/i.test(rel)) {
      rmSync(entry);
      removed++;
      console.log('Removed server-only file:', rel);
      continue;
    }
    if (forbidden.test(rel) || suspicious.test(rel)) throw new Error('Sensitive file: ' + rel);
  }
}
scan(root);
const index = readFileSync(join(root, 'index.html'), 'utf8');
if (!index.includes('type="module"') || !index.includes('/assets/')) {
  throw new Error('Root static build does not reference expected module assets');
}
console.log('Static deployment guard PASS. Removed server-only files:', removed);
