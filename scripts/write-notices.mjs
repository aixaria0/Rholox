import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'))
const sections = [
  'Rholox runtime dependency notices\n\nThe following notices accompany the JavaScript and fonts distributed with this build.',
]
const packages = Object.entries(lock.packages)
  .filter(([path, entry]) => path.startsWith('node_modules/') && !entry.dev)
  .sort(([a], [b]) => a.localeCompare(b, 'en'))

for (const [path, entry] of packages) {
  const directory = join(root, path)
  const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  let license
  for (const filename of [
    'LICENSE',
    'LICENSE.md',
    'LICENSE.txt',
    'license',
    'license.md',
    'license.txt',
  ]) {
    try {
      license = await readFile(join(directory, filename), 'utf8')
      break
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  if (!license)
    throw new Error(`Runtime dependency ${metadata.name} has no packaged license notice.`)
  sections.push(`${metadata.name} ${entry.version}\n${'='.repeat(72)}\n\n${license.trim()}`)
}

const destination = resolve(root, process.argv[2] ?? 'dist')
await mkdir(destination, { recursive: true })
await writeFile(join(destination, 'third-party-notices.txt'), sections.join('\n\n\n') + '\n')
console.log(`Runtime notices included for ${packages.length} packages.`)
