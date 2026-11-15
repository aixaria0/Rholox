import { copyFile, rm, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve('dist-observer-mirror')
const nested = resolve(root, 'observer-mirror/index.html')
await stat(nested)
await copyFile(nested, resolve(root, 'index.html'))
await copyFile(resolve('public/rholox-blue-v2.svg'), resolve(root, 'rholox-blue-v2.svg'))
await rm(resolve(root, 'observer-mirror'), { recursive: true, force: true })
console.log('Observer-only mirror packaged; no wallet, transaction or PHP entrypoint.')