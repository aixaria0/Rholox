# Rholox

A public-testnet workspace for comparing RChain observations and exercising locally signed DApp primitives. Source coverage, sample age, execution, block inclusion and finalized-state read-back remain separate facts.

[Live workspace](https://rholox.com/) · [Observer service](https://github.com/rchain-community/rchain-observer) · [Browser verification](docs/UI-ASSURANCE.md) · [Review matrix](docs/REVIEW.md)

**Public testnet only.** Test REV and test assets have no monetary value; the network may reset. This release does not establish mainnet readiness, production custody or an independently audited financial protocol.

## Release record

| Component | Recorded release |
| --- | --- |
| Browser application | `0.9.1`, declared in `package.json`; adds a data-independent legacy REV lookup utility |
| Evidence-console integration | Source `d5eb4c4`; [PR #17](https://github.com/aixaria0/Rholox/pull/17), merge `6324f06` |
| Companion observer | `0.2.0`; [PR #4](https://github.com/rchain-community/rchain-observer/pull/4), merge `a5d0796` |
| Application post-merge CI | [Run 39885484816](https://github.com/aixaria0/Rholox/actions/runs/39885484816), successful |
| Observer post-merge CI | [Run 39885469376](https://github.com/rchain-community/rchain-observer/actions/runs/39885469376), successful |
| v0.8.1 production record | 23 October 2026: all 14 public release files matched the reviewed artifact; the fifteenth artifact file was the non-public hosting policy |

This is a dated release record. A later source commit, merge or successful workflow does not by itself deploy the website or guarantee current availability.

## Start locally

Use Node.js 22 and npm to match CI. Full verification also needs PHP 8.2+ with Sodium. Use a modern browser with Web Crypto support. Secure-context browser features require HTTPS or a trustworthy local development origin.

```bash
npm ci
npm run dev
```

The development command listens on `0.0.0.0`; select appropriate network exposure for your environment. It still connects to the configured public testnet. It does not start validators or deploy contracts automatically.

```bash
npm run build
npm run preview
```

The build runs TypeScript, Vite and runtime-license packaging, writing the application and PHP utility to `dist/`. Preview serves that build locally; it is not the production deployment procedure.

## Current surface

**Network Evidence** allows local import and bounded inspection of read-only Sentinel/Rholo incident captures without posting source data or connecting to a validator. This is an observational preview, not a Casper CBC certificate. See [the integration and verification boundary](docs/NETWORK-EVIDENCE.md).

**Legacy REV** provides the independent historical balance reference described below.

**DApps** lists `rev.exchange` first as an exchange preview. Its destination is pending launch verification, so the listing does not open a wallet connection or trading page. A listing is not evidence that an external application is operating or that Rholox's testnet Exchange Core is a production exchange.

The live and signed testnet surfaces are:

1. **Network Console** — multi-source finalized observations, coverage, sample age, full hashes and ancestry evidence, alongside a separate execution-gateway status/capability view.
2. **Wallet + Test REV** — session-only secp256k1 key generation/import, REV address derivation, faucet funding, and finalized balance reads.
3. **Rholox Proof** — local SHA-256 hashing, locally signed deploy submission, inclusion polling, and finalized-state visibility checks.
4. **Explorer** — recent blocks, block-by-hash detail, recent-height lookup, deploy-status lookup, justifications, bonds, deploys, and rejected deploys.
5. **REV Transfer** — local signing, REV-address validation, signed test transfer, inclusion polling, and finalized recipient-balance verification.
6. **Asset Lab** — fixed-supply MakeMint asset creation, finalized metadata/balance reads, purse-brand verification, signed asset transfer, and an exchange capability bridge in runtime v2.
7. **Exchange Core** — two-asset capability custody, integer constant-product quotes, LP accounting, add/remove liquidity, swaps, compensation on partial two-asset failure, and finalized reserve/custody verification.

## Legacy REV balance lookup

Open **Legacy REV** and enter a public REV address. A session wallet, signature or private key is unnecessary. This historical reference is separate from live testnet balances.

The repository contains the utility, importer, endpoint and synthetic tests. Reference records, source spreadsheets and deployment manifests are operator-managed files outside the repository and public web directory. A normal build needs no dataset and packages no balances or spreadsheet link.

| Behavior | Boundary |
| --- | --- |
| Lookup | A same-origin JSON POST submits one checksum-valid public REV address |
| Data access | PHP reads a private, digest-checked reference and returns one exact integer amount or explicit absence |
| Public metadata | Reference date, its basis, record count, decimal scale and a dataset revision identifier |
| Amount handling | Decimal integer strings and BigInt; eight-decimal formatting, including values above JavaScript safe-number precision |
| Privacy | The address is sent over HTTPS to Rholox; it is not placed in a URL or sent to the source document or execution gateway |
| Failures | Malformed, unavailable or integrity-failing data returns an error; it cannot become a missing-address result |

A missing row differs from a recorded zero. Editing input clears the previous result. Historical records do not establish a current spendable balance or migration entitlement. Source rounding cannot be reconstructed, and the utility does not authenticate historical chain state.

See [endpoint contract, private import and deployment](docs/LEGACY-REV-LOOKUP.md). `npm run test:rev-snapshot` uses generated synthetic addresses; `npm run test:rev-endpoint` requires PHP 8.2+ with Sodium. The application build remains data-independent. Vite alone does not execute PHP.

## Architecture and configuration

| Path | Destination | Boundary |
| --- | --- | --- |
| Observation | Browser → cached observer → configured node HTTP endpoints | Read-only comparison; page requests do not initiate validator fan-out |
| Execution | Browser → public execution gateway | One execution source; submission/inclusion are separate from finalized read-back |
| Legacy REV | Browser → same-origin read-only endpoint → private reference files | One-address result; no public dataset download |
| Signing | Session memory → locally signed deploy → gateway | Keys stay in the browser; the observer never signs or proxies writes |

The browser gateway is `https://testnet.rhobot.net`; the observer base is `https://testnet.rhobot.net/observer`. Both are source constants in `src/lib/rchain.ts`, not runtime environment settings. Changing the gateway also requires reviewing the API contract and updating both production connection allowlists: `vite.config.ts` and `public/.htaccess`.

The observer compares configured finalized identities. When heights differ, it can walk the raw justification DAG, checking BLAKE2b-256 content addresses and proposer signatures before accepting traversed ancestry fields. Endpoint labels do not attest operator independence, and matching snapshots do not constitute a consensus finality certificate.

| Implementation | Responsibility |
| --- | --- |
| `src/lib/observer.ts` | Report consistency, coverage and freshness policy |
| `src/lib/rchain.ts` | Bounded public HTTP transport and API reads |
| `src/lib/wallet.ts` | Session keys and REV address derivation |
| `src/lib/deploy.ts` | Shared signed-deploy submission and processing/explore helpers |
| `src/lib/proof.ts` | Proof hashing, submission and finalized visibility |
| `src/lib/transfer.ts` | REV-transfer guards and finalized recipient verification |
| `src/lib/asset.ts` | Fixed-supply asset runtimes and v2 capability bridge |
| `src/lib/amm.ts` | Integer pool arithmetic and invariant guards |
| `src/lib/exchange.ts` | Rholang pool runtime and client verification |
| `src/AssetLabPanel.tsx`, `src/ExchangePanel.tsx` | Asset and pool interaction surfaces |
| `src/main.tsx`, `src/styles.css` | Workspace state, navigation and presentation |
| `src/RevSnapshotPanel.tsx`, `src/lib/rev-snapshot.ts` | Historical lookup interface and response/address validation |
| `server/legacy-rev.php` | Bounded one-address endpoint; private reference integrity checks |
| `scripts/prepare-rev-snapshot.mjs` | Explicit private CSV import, independent of the application build |
| `scripts/write-notices.mjs` | Runtime JavaScript/font license packaging |

## Network evidence workspace

The interface starts with a source matrix and an explicit evidence boundary. A persistent navigation rail links to Network Console, Legacy REV, DApps, Explorer, Wallet + Test REV, Rholox Proof, REV transfer, Asset Lab and Exchange Core. Phone layouts use a scrollable section navigation; data tables scroll within their own labeled region. Keys remain mounted in the session when navigating between sections.

A positive **Snapshots agree** state requires a structurally valid, internally consistent report, at least two configured sources, complete comparable/reachable coverage, and a sample younger than 30 seconds. The UI validates node labels, exact reference support, height summaries, counters, verdict consistency, ancestry endpoints, path shape and verified-block counts. These are report-contract checks: the browser does **not** independently reverify the raw block signatures or a consensus finality certificate.

| Display | Condition |
|---|---|
| Awaiting / unavailable | No validated report available |
| Snapshots agree | Fresh, complete multi-source snapshot agreement |
| Limited coverage | Singleton observation or any incomplete/unreachable configured source |
| Ancestry connected · lag observed | Verified ancestry reported for every lower identity, with different observed heights |
| Unresolved height skew | Ancestry evidence remains incomplete |
| Conflicting observations | Same-height, identity-domain or complete raw-history non-connection finding |
| Stale evidence / clock mismatch | Request failure, sample age at least 30 seconds, or implausible future timestamp |

Freshness updates every second even when polling fails. Polling runs every 15 seconds while visible; returning to the tab requests a refresh. Overlapping refreshes are refused and unmounted/obsolete requests cannot overwrite newer state. The retained report remains inspectable after a failed request, with its stale state explicit. Fresh sampling does not itself establish chain progress.

Each source keeps its full finalized hash in an expandable cell. The reference hash can be copied with explicit success/failure feedback. **Download JSON** exports the validated observation report; it contains no wallet state. Missing proof/transfer prerequisites have navigable locked panels rather than missing section targets.

Transport deadlines cover response-body consumption, including streams stalled after headers. Bodies are capped at 8 MiB. Redirects are refused; requests omit credentials and referrers. Malformed status/finalized/capability/explorer responses are rejected before presentation. The production build adds a restrictive content-security policy: scripts/styles/fonts/images come from this origin, and outbound connections are limited to this origin and the configured public testnet gateway. Vite development behavior is separate from that production policy.

Schema version 1 requires complete, ordered sampling metadata. Wall-clock window length and the reported monotonic duration may differ by at most five seconds; contradictory samples cannot receive a positive state. Legacy reports without sampling-window metadata remain supported. Explorer reads validate nested block/deploy/status fields and bounded arrays, reject duplicate block identities, and require a returned block hash to match its lookup. These checks validate reported JSON; the browser does not recompute an explorer block's content address. Block selection is serialized while a lookup is pending.

### Operational defaults

| Policy | Current value |
| --- | --- |
| Visible-tab polling | 15 seconds; returning to the tab requests a refresh |
| Age display | Updated every second |
| Multi-source freshness | Sample age strictly below 30 seconds |
| Execution-gateway read freshness | Successful read age strictly below 45 seconds |
| Future-clock allowance | At most 5 seconds |
| Schema-version-1 window consistency | Ordered timestamps; wall-clock window and monotonic duration differ by at most 5 seconds |
| Default bounded HTTP deadline | 12 seconds, including response-body consumption |
| Browser response-body limit | 8 MiB, including streamed bodies |

The observer classifier can report `agreement` for a comparable subset. Rholox checks full coverage separately. A fresh sample does not prove finalized height is advancing. Missing deploy outcomes cannot become successful execution; nested block responses must match the requested full hash.

## Session and transaction evidence

Private keys remain in browser memory without application persistence. Reloading or closing the page loses the session unless the user has retained the key themselves. This storage boundary does not protect against a compromised browser, extension or served application.

| Stage | What it establishes |
| --- | --- |
| Submission | The gateway accepted or returned a deploy identifier |
| Processing / inclusion | A node reports execution or inclusion in a block |
| Finalized-state read-back | The expected operation-specific state is observed through the node's finalized read surface |

Successful HTTP submission or block inclusion is insufficient for the final stage. Timeouts remain pending or unknown. Proofs check finalized proof visibility; REV transfers check finalized recipient state; asset and pool operations additionally check their metadata, balances, brands, positions and custody invariants. Recorded inclusion/orphan negative controls are linked from [the review matrix](docs/REVIEW.md).

## Security and scope boundary

- **Public testnet only.** Test REV and test assets have no monetary value and the network may reset.
- **No key custody.** Private keys are generated/imported in the browser and are not uploaded or persisted by Rholox.
- **No production-custody claim.** Exchange reserve authority is held by private purse capabilities inside the pool contract; Phase 07 is testnet evidence, not an audited financial protocol.
- **No mainnet claim.** The UI does not present production/mainnet status or synthetic production metrics.
- **No admin surface.** The client uses the public node HTTP surface only.
- **Independent observation path.** Signed writes still go to the public execution gateway; network/finality evidence is cross-checked by the read-only `rchain-observer` service across the four live testnet validators.
- **No hidden finality claim.** Submission, execution, inclusion, and finalized-state read-back remain distinct.
- **No fabricated market telemetry.** The exchange UI does not invent TVL, volume, APR, yield, price feeds, or activity.
- **Fixed-supply assets.** Asset runtime v2 adds empty-purse/deposit/withdraw capability plumbing for pools but does not add post-creation minting.
- **Public-testnet namespaces.** Asset IDs and pool IDs are random 256-bit identifiers used to derive public contract channels; they are not presented as production registry identities.
- **Fail closed on custody mismatch.** A pool mutation refuses to proceed when recorded reserves differ from actual private-purse balances.

## Exchange v1 model

Phase 07 deliberately uses a small reviewable model:

```text
fee                         0 bps
reserve cap                 10,000,000 raw units / side
initial LP shares           amountA + amountB
subsequent liquidity        exact reserve ratio only
swap                        dy = floor(dx * y / (x + dx))
slippage guard              caller-provided minOut / minimum outputs
custody evidence            recorded reserve == private purse balance
```

A compensation failure is surfaced as `pool-fatal`; it is not described as atomic rollback. The restored state then disagrees with custody and later mutations fail closed on the custody check.

## Reproducible verification

```bash
npm ci
npm run verify
npm audit --audit-level=high
git diff --check
```

| Gate | Evidence and scope |
| --- | --- |
| `verify:source` | Source-level storage, authorization and product guards |
| `test:amm` | Arithmetic regressions and 119,434 accepted swap quotes |
| `test:amm:actors` | Modeled multi-actor transitions and negative controls |
| `test:exchange:recovery-source` | Static compensation and custody source guards |
| `test:observer` | 57 deterministic report, sampling, transport and direct-read checks |
| `test:rev-snapshot` | Synthetic client/import checks for exact amounts, checksums, zero/absence, response binding and private output guards |
| `test:rev-endpoint` | PHP contract checks with synthetic records, including malformed requests, private-data failures and metadata-only GET |
| `check:public-package` | Rejects reference data directories, spreadsheet artifacts and spreadsheet links in the public build |
| `build` | TypeScript compilation, production assets, the data-free PHP endpoint, content policy and runtime notices |
| Dependency audit | Known advisory results at scan time; CI fails at high severity or above |
| Artifact read-back | Byte equality for index, hidden hosting policy, notices and PHP utility after upload/download |

CI runs these gates on pull requests and pushes to `main`. The static artifact is named `rholox-static-site`; hidden files are explicitly included.

The default verification sequence does not fund wallets, submit signed deploys or execute live pool mutations. Models and source guards do not replace isolated-node contract execution, adversarial recovery tests or independent review. `test:exchange:rholang` is a separate network-dependent semantics check, not part of `npm run verify`; inspect its endpoint and scope before running it.

The dated [UI review](docs/UI-ASSURANCE.md) covers responsive layouts, read-only observations, block exploration, copy/export and an unfunded session. Its v0.8.1 follow-up records custom-domain verification. Separate assurance branches are not implicitly included by a passing UI build.

## Production hosting and rollback

Deploy the reviewed CI artifact, including `.htaccess`, `third-party-notices.txt` and `api/legacy-rev.php`, to a PHP 8.2+ host with Sodium. Install the reference separately outside the web root as described in the lookup runbook. Copying only visible files drops part of the hosting policy.

| Apache/LiteSpeed control | Policy |
| --- | --- |
| Content-Security-Policy | Same-origin scripts/styles/images/fonts; connections to this origin and the configured gateway; objects, forms, base changes and framing denied |
| X-Frame-Options | `DENY` |
| X-Content-Type-Options | `nosniff` |
| Referrer-Policy | `no-referrer` |
| Permissions-Policy | Camera, microphone, geolocation, payment and USB disabled |
| Strict-Transport-Security | `max-age=31536000`, current host only; no subdomain or preload enrollment |
| Index and manifest | `Cache-Control: no-store` |
| Runtime notices | `text/plain; charset=utf-8` |
| Directory listing | Disabled |

The build also embeds an HTML meta content policy. Frame denial requires the HTTP policy; other hosts must configure equivalent headers. Header-module support is conditional, so inspect actual HTTPS responses.

1. Confirm the exact reviewed source and successful artifact.
2. Back up the prior index, assets and hosting configuration outside the document root.
3. Test the candidate policy on an isolated path on the actual host.
4. Stage content-addressed assets before atomically replacing the index; retain old assets for rollback.
5. Verify public file digests, a fresh browser load, live observations, single headers, UTF-8 notices, configuration-file denial and missing-asset 404 behavior.
6. Verify the existing HTTP-to-HTTPS redirect. The repository hosting file does not create that redirect.
7. Restore the prior index/configuration if release checks fail.

Keep credentials, private keys, host-specific configuration and release backups outside the repository and public document root. A preview or merge is not deployment evidence.

## Documentation and licensing

- [Review matrix](docs/REVIEW.md): implementation invariants, contract gates and dated evidence.
- [UI assurance](docs/UI-ASSURANCE.md): browser review and deployed-interface checks.
- [Asset Lab](docs/ASSET-LAB.md): asset runtime and capability boundaries.
- [Exchange mechanics](docs/EXCHANGE-MECHANICS.md): Phase 07 model, negative controls and recorded lifecycle.
- [Observer README](https://github.com/rchain-community/rchain-observer#readme): API, verdicts, readiness and resource limits.

Phase 07 is tracked in issue #6. Its evidence is a dated public-testnet record; network resets can invalidate historical locators.

The project is licensed under Apache-2.0; see [LICENSE](LICENSE). Builds distribute the installed runtime packages' license texts, including the IBM Plex font license, in `third-party-notices.txt`. The footer opens those notices separately to preserve the active session.
