# Network Evidence — Sentinel integration

The Network Evidence section is a browser-local import and inspection surface for
the **offline Sentinel Witness Gate** from
[aixaria0/rchain-sentinel PR #9](https://github.com/aixaria0/rchain-sentinel/pull/9).
It is not a remote validator adapter, does not fetch raw incident data, and
does not require any custody, wallet connection, backend access, or private keys.

## How to use

1. Open the **Network Evidence** item in the Rholox navigation.
2. Select a raw, timestamped read-only capture in the JSONL format emitted by
   the diagnostic tool introduced in [Rholo #421](https://github.com/rhovision-org/rholo/pull/421).
3. Optionally select a caller-reviewed Sentinel topology JSON file and a JSON
   report emitted by the native Python Witness Gate.
4. Click **Inspect capture**. The browser calculates raw input SHA-256,
   validates shapes/timestamps and shows reachability, reported finality
   progress, same-height hash disagreement, stale health and low-memory
   observations. A supplied topology adds illustrative correlated host failures.
5. Export a **Rholox local preview**, which is intentionally marked with its own
   schema, not the Sentinel reference report schema.

Uploaded file bytes stay in **browser memory only**. They are not stored,
sent to a server, linked publicly, posted to GitHub or included in site builds.
Inputs are bounded to 5 MiB each and up to 100 timestamped read-only samples.
Users must remove private information from any locally exported report they
decide to share.

## Two distinct verification scopes

- **Rholox browser preview** — independently summarizes the selected raw
  capture and computes a SHA-256 digest using Web Crypto. It is an observational
  convenience; it does not verify a Casper CBC finality certificate. JavaScript
  number limits mean the browser declines to compare non-safe finalized heights.
- **Partial Sentinel report cross-check** — if a native JSON report is provided,
  compare the input digest, sample count, assessment, missing finality count,
  explicit protocol-boundary booleans and, when supplied, topology digest.
  The browser does **not** verify the native report's entire contents/digest or
  produce an equivalent native verification verdict.
- **Authoritative report recomputation** — use the pinned Sentinel Python tool
  with the **same** original capture and topology, then
  \`--verify-report <native-report.json>\` to recompute every field. A correct
  recomputation still attests only local artifact consistency, not source
  identity or independently verified finality.

The frontend does **not** infer a Casper safety failure from a different block
tip, nonresponsive endpoint or a low available-memory reading. Correlated host
failure uses caller-provided labels/stakes and the illustrative greater-than-2/3
arithmetic check; it does not authenticate a live bond set.

No evidence of incident #420 is committed to this repository. Test coverage
uses synthetic fixtures only. This feature does not change existing live
observation, execution gateway, wallet, or REV snapshot paths.

## Verify the integration

\`\`\`sh
npm run test:network-evidence
npm run build
npm run check:public-package
\`\`\`

For an independent native reference:
[Sentinel Witness Gate runbook](https://github.com/aixaria0/rchain-sentinel/blob/feat/sentinel-witness-gate/docs/SENTINEL_WITNESS_GATE.md).
