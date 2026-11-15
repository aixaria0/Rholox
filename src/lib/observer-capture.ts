import type { ObserverReport } from './rchain'

export const OBSERVER_SOURCE = 'https://testnet.rhobot.net/observer/v1/observation' as const
export const CAPTURE_SCHEMA = 'rho-witness-observer-capture/v1' as const

/** Exact UTF-8 capture serialization. SHA-256 is an integrity checksum, never a signature. */
export async function createObserverCapture(report: ObserverReport, capturedAtMs = Date.now()) {
  if (!Number.isSafeInteger(capturedAtMs) || capturedAtMs < 1) {
    throw new Error('Invalid capture timestamp')
  }
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto unavailable; cannot hash evidence')
  const reportText = JSON.stringify(report, null, 2) + '\n'
  const encoded = new TextEncoder().encode(reportText)
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', encoded))
  const digest = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return {
    schema: CAPTURE_SCHEMA,
    source_uri: OBSERVER_SOURCE,
    captured_at_ms: capturedAtMs,
    report_sha256: digest,
    report_text: reportText,
    evidence_type: 'parsed-observer-report',
    signature: null,
    trust_boundary:
      'Client-validated public HTTP snapshot; not a signed attestation, stake quorum or independent Casper finality certificate',
  }
}
