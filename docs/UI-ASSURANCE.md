# Evidence console review

Baseline production-build browser review, 22 October 2026; live v0.8.1 follow-up, 23 October 2026. Screenshots below belong to the baseline and show sampled public-testnet data; heights and availability can change.

![Desktop evidence console](evidence/console-desktop.jpg)

[Phone viewport](evidence/console-phone.jpg)

## Verified behavior

| Check | Result and scope |
|---|---|
| Desktop layout | Production assets loaded with the restrictive content policy; logo, source rows and real observer data rendered |
| Phone/tablet layout | 375px and 768px iframe viewport checks; no document-level horizontal overflow; wide source table scrolls within its own labeled region |
| Key prerequisites | Proof and transfer anchors remain navigable before wallet creation |
| Session wallet | Generated an unfunded test identity; balance read returned zero; navigation retained session state; the private key was not revealed or exported |
| Explorer | Recent-height lookup loaded block details from the public node, including justifications, bonds and rejected-deploy count |
| Copy | Reference-hash copy displayed success feedback |
| Export | Browser downloaded the validated observer JSON without wallet state |
| Protocol/transport policy | The baseline 28 deterministic checks covered malformed/inconsistent reports, clock/freshness boundaries, coverage, lag/conflict, stalled bodies, cancellation, body limits and malformed direct-node responses |
| Existing operation models | AMM arithmetic sweep, actor model and recovery source guards pass; those tests retain their documented execution limits |

No funding, signed deploy, transfer, asset creation or exchange mutation was performed for this review. Production build verification does not establish that a deployment to the existing custom domain succeeded. Use the PR's CI artifacts and hosting deployment result as separate evidence.

## Live v0.8.1 follow-up — 23 October 2026

- All 57 observer/transport checks passed, including contradictory sampling clocks, nested explorer fields, duplicate identities and requested-block binding. The existing models, TypeScript build and dependency audit also passed.
- The exact successful CI artifact was published to `rholox.com`. All 14 public files matched their SHA-256 digests; the fifteenth artifact file was the non-public hosting policy. The index was replaced atomically after staging assets, with a verified private backup available.
- An isolated path on the actual LiteSpeed host verified HTTP security headers before publication. Final checks covered single CSP/frame-denial headers, no-store on the index, the HTTPS redirect, configuration-file denial and a missing asset remaining 404.
- The live browser displayed fresh 4/4 comparable observations. The JSON download contained schema version 1, ordered sample/completion timestamps and a duration.
- Block 804 opened with its requested full hash, state roots, justifications, bonds and rejection count. Row selection was disabled while the request was pending.
- An unfunded session wallet returned zero balance. Opening the runtime/font notices in a separate tab retained the session. No private key was revealed or exported.
- The notice response explicitly declares UTF-8 so typographic license characters render correctly.

These checks concern the deployed observation UI and HTTP policy. They do not execute or replace the separate contract-assurance gates.

## Legacy REV utility follow-up — 23 October 2026

The v0.9.1 utility uses a private historical reference through a same-origin read-only endpoint. The public source and build contain no reference records, source spreadsheet URL or bulk dataset. Tests generate synthetic addresses and amounts independently of the operator's data.

- Client checks cover checksum validation, exact large integer strings, eight-decimal formatting, zero versus absence, response-address binding and contradictory/bulk results.
- The private importer refuses duplicate addresses, noncanonical amounts, invalid checksums and output in the repository or public web directories.
- PHP contract checks cover metadata-only GET, one-address POST, malformed/oversized requests, unsupported methods, private-file absence and digest mismatch. Data failures return service errors rather than false zero/absence.
- The lookup requires no session wallet, signature or private key. Its privacy text states that the public address is sent to Rholox over HTTPS and is not included in the URL.
- Historical reference status remains separate from live network evidence and signed testnet actions. No historical-chain authenticity, current-balance or migration-entitlement claim is made.

Live deployment and browser verification are separate from these source/contract gates. [The endpoint runbook](LEGACY-REV-LOOKUP.md) describes private provisioning and its operational limits.

## Display policy

- Full-coverage positive state requires at least two fresh comparable configured endpoints.
- Exact matching snapshots do not constitute a consensus certificate; raw signature checks apply to traversed ancestry evidence in the separate observer service.
- A singleton, missing source, partial identity, stale/future-clock sample, failed refresh or unresolved path cannot produce a full-coverage positive state.
- A retained snapshot stays inspectable after failure and is explicitly stale. Snapshot freshness does not establish finality progress.
- Same-height majority is a count finding in a conflict, not a stake-weighted quorum.

The existing transaction/contract assurance and isolated-node release gates remain documented in `REVIEW.md` and `EXCHANGE-MECHANICS.md`. This UI change does not merge or replace the separate unmerged assurance branches.
