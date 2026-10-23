import bs58 from 'bs58'
import { blake2b } from 'blakejs'

export type RevSnapshotMetadata = {
  schema_version: 1
  snapshot_date: string
  snapshot_date_basis: 'source_title' | 'operator_reference'
  decimals: 8
  record_count: number
  snapshot_id: string
}
export type SnapshotLookup = { address: string; drops: string | null; metadata: RevSnapshotMetadata }
const MAX_DROPS = 18_446_744_073_709_551_615n
const metadataKeys = [
  'schema_version', 'snapshot_date', 'snapshot_date_basis', 'decimals', 'record_count', 'snapshot_id',
]

export function normalizeSnapshotAddress(input: string): string {
  const address = input.trim()
  try {
    if (address.length < 40 || address.length > 64) throw new Error()
    const bytes = bs58.decode(address)
    if (bytes.length !== 40 || !bytes.slice(0, 4).every((value) => value === 0)) throw new Error()
    const checksum = blake2b(bytes.slice(0, 36), undefined, 32).slice(0, 4)
    if (!checksum.every((value, i) => value === bytes[36 + i])) throw new Error()
  } catch {
    throw new Error('Enter a valid public REV address. Do not enter a private key.')
  }
  return address
}

function validDrops(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d{0,19})$/.test(value) && BigInt(value) <= MAX_DROPS
}

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('The lookup service returned an invalid response.')
  return input as Record<string, unknown>
}

export function parseSnapshotMetadata(input: unknown): RevSnapshotMetadata {
  const data = object(input)
  if (
    data.schema_version !== 1 || data.decimals !== 8 ||
    typeof data.snapshot_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.snapshot_date) ||
    !Number.isFinite(Date.parse(data.snapshot_date + 'T00:00:00Z')) ||
    new Date(data.snapshot_date + 'T00:00:00Z').toISOString().slice(0, 10) !== data.snapshot_date ||
    !['source_title', 'operator_reference'].includes(String(data.snapshot_date_basis)) ||
    !Number.isSafeInteger(data.record_count) || (data.record_count as number) < 1 ||
    (data.record_count as number) > 50_000 ||
    typeof data.snapshot_id !== 'string' || !/^[a-f0-9]{64}$/.test(data.snapshot_id)
  ) throw new Error('The lookup service returned invalid snapshot metadata.')
  return Object.fromEntries(metadataKeys.map((key) => [key, data[key]])) as RevSnapshotMetadata
}

export function parseSnapshotLookup(input: unknown, requestedAddress: string): SnapshotLookup {
  const data = object(input)
  const allowedKeys = [...metadataKeys, 'address', 'found', 'balance_drops'].sort()
  if (
    Object.keys(data).sort().join(',') !== allowedKeys.join(',') ||
    data.address !== normalizeSnapshotAddress(requestedAddress) || typeof data.found !== 'boolean' ||
    (data.found ? !validDrops(data.balance_drops) : data.balance_drops !== null)
  ) throw new Error('The lookup service returned an invalid balance result.')
  return {
    address: data.address as string,
    drops: data.balance_drops as string | null,
    metadata: parseSnapshotMetadata(data),
  }
}

export function formatSnapshotRev(drops: string): string {
  if (!validDrops(drops)) throw new Error('Invalid snapshot balance.')
  const value = BigInt(drops)
  const whole = (value / 100_000_000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return whole + '.' + (value % 100_000_000n).toString().padStart(8, '0')
}
