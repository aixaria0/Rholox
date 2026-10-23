import { useEffect, useRef, useState, type FormEvent } from 'react'
import { fetchWithTimeout } from './lib/rchain'
import {
  formatSnapshotRev, normalizeSnapshotAddress, parseSnapshotLookup, parseSnapshotMetadata,
  type RevSnapshotMetadata, type SnapshotLookup,
} from './lib/rev-snapshot'

const endpoint = import.meta.env.BASE_URL + 'api/legacy-rev.php'

async function readResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!response.ok) throw new Error('The snapshot lookup is temporarily unavailable. Please retry.')
  if (text.length > 4096 || !response.headers.get('Content-Type')?.includes('application/json'))
    throw new Error('The lookup service returned an invalid response.')
  return JSON.parse(text) as unknown
}

export default function RevSnapshotPanel() {
  const [metadata, setMetadata] = useState<RevSnapshotMetadata | null>(null)
  const [address, setAddress] = useState('')
  const [result, setResult] = useState<SnapshotLookup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [invalidAddress, setInvalidAddress] = useState(false)
  const [busy, setBusy] = useState(false)
  const request = useRef<AbortController | null>(null)
  const activeMetadata = result?.metadata ?? metadata
  const snapshotDate = activeMetadata
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' })
      .format(new Date(activeMetadata.snapshot_date + 'T00:00:00Z'))
    : 'Historical snapshot'

  useEffect(() => {
    const controller = new AbortController()
    void fetchWithTimeout(endpoint, { signal: controller.signal, cache: 'no-store' })
      .then(readResponse)
      .then((data) => { if (!controller.signal.aborted) setMetadata(parseSnapshotMetadata(data)) })
      .catch(() => { /* A submitted lookup retries the service and reports its own failure. */ })
    return () => { controller.abort(); request.current?.abort() }
  }, [])

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (request.current) return
    setError(null)
    setInvalidAddress(false)
    setResult(null)
    let normalized: string
    try {
      normalized = normalizeSnapshotAddress(address)
    } catch (cause) {
      setInvalidAddress(true)
      setError(cause instanceof Error ? cause.message : 'Enter a valid public REV address.')
      return
    }
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: normalized }),
        signal: controller.signal,
        cache: 'no-store',
      })
      const lookupResult = parseSnapshotLookup(await readResponse(response), normalized)
      if (controller.signal.aborted) return
      setMetadata(lookupResult.metadata)
      setAddress(normalized)
      setResult(lookupResult)
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Unable to read the snapshot. Please retry.')
    } finally {
      if (request.current === controller) request.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <section id="legacy-rev" className="snapshot-panel" aria-labelledby="snapshot-title">
      <div className="snapshot-heading">
        <div>
          <div className="eyebrow">LEGACY REV · SNAPSHOT LOOKUP</div>
          <h2 id="snapshot-title">Find your recorded REV balance.</h2>
        </div>
        <span className="snapshot-date">{snapshotDate}</span>
      </div>
      <p className="snapshot-intro">
        Look up a public REV address in the historical balance snapshot. No wallet connection,
        signature or private key is needed.
      </p>
      <div className="snapshot-facts" aria-label="Snapshot coverage">
        <span><strong>{activeMetadata ? activeMetadata.record_count.toLocaleString('en-US') : '—'}</strong> recorded addresses</span>
        <span><strong>8</strong> decimal places</span>
        <span>Returns <strong>one address at a time</strong></span>
      </div>
      <form onSubmit={lookup} className="snapshot-form">
        <label htmlFor="snapshot-address">REV wallet address</label>
        <div className="snapshot-controls">
          <input id="snapshot-address" aria-label="Snapshot REV address"
            aria-describedby="snapshot-help" aria-invalid={invalidAddress}
            autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={64}
            placeholder="1111…" value={address} disabled={busy}
            onChange={(event) => {
              setAddress(event.target.value); setResult(null); setError(null); setInvalidAddress(false)
            }} />
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'LOOKING UP…' : 'LOOK UP BALANCE'}
          </button>
        </div>
        <p id="snapshot-help" className="snapshot-help">
          Your public address is sent to Rholox over HTTPS for this lookup. It is not added to the
          page URL. REV addresses are case-sensitive.
        </p>
      </form>
      {error && <div className="error" role="alert">{error}</div>}
      {result && (
        <div className="snapshot-result" role="status" aria-live="polite" aria-atomic="true">
          <div className="eyebrow">{result.drops === null ? 'ADDRESS NOT LISTED' : 'RECORDED SNAPSHOT BALANCE'}</div>
          <code className="snapshot-result-address">{result.address}</code>
          {result.drops === null ? (
            <><h3>No row in this snapshot.</h3>
              <p>The reference has no entry for this address. This does not establish a zero balance.</p></>
          ) : (
            <><div className="snapshot-amount">
              <strong>{formatSnapshotRev(result.drops)}</strong><span>REV</span>
            </div>
              <p>{result.drops === '0' ? 'This address is present with a zero balance. ' : ''}
                Historical record · {snapshotDate}.</p></>
          )}
        </div>
      )}
      <div className="snapshot-boundary">
        <strong>Historical reference.</strong> This is separate from live testnet balances.
        It does not establish a current spendable balance or a migration entitlement.
      </div>
      <div className="snapshot-source">
        <details>
          <summary>Snapshot details</summary>
          <dl>
            <dt>Date basis</dt><dd>{activeMetadata?.snapshot_date_basis === 'source_title'
              ? 'The date in the source title; no source block was supplied.'
              : 'A historical reference date; no independently verified chain state is claimed.'}</dd>
            <dt>Units</dt><dd>100,000,000 integer units = 1 REV.</dd>
            <dt>Delivery</dt><dd>Individual read-only lookup. The full dataset is not downloaded.</dd>
          </dl>
          <p>Amounts retain the supplied integer precision. Prior source rounding cannot be recovered.
            The reference has not been verified against a historical block.</p>
        </details>
      </div>
    </section>
  )
}
