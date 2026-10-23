import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
mkdirSync(root + '/dist/api', { recursive: true })
copyFileSync(root + '/server/legacy-rev.php', root + '/dist/api/legacy-rev.php')
console.log('Packaged the lookup endpoint without reference data.')
