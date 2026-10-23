# Rholox

Rholox is an evidence-first public-testnet interface for observing network state and exercising signed DApp primitives without presenting the system as more mature than the evidence supports.

The current vertical slice covers observation, session-only signing, test-value funding, proof anchoring, block/deploy inspection, finalized REV transfer verification, fixed-supply MakeMint assets, and a capability-custodied testnet exchange core.

[Desktop preview and browser verification](docs/UI-ASSURANCE.md)

## Network evidence workspace (v0.8)

The interface now starts with a source matrix and an explicit evidence boundary. A persistent navigation rail links to Network Console, Explorer, Wallet + Test REV, Rholox Proof, REV transfer, Asset Lab and Exchange Core. Phone layouts use a scrollable section navigation; data tables scroll within their own labeled region. Keys remain mounted in the session when navigating between sections.

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

The v0.8.1 hardening pass requires complete, ordered sampling metadata for schema version 1. Wall-clock window length and the reported monotonic duration may differ by at most five seconds; contradictory samples cannot receive a positive state. Legacy reports without sampling-window metadata remain supported. Explorer reads validate nested block/deploy/status fields and bounded arrays, reject duplicate block identities, and require a returned block hash to match its lookup. These checks validate reported JSON; the browser does not recompute an explorer block's content address. Block selection is serialized while a lookup is pending.

`dist/.htaccess` supplies Apache/LiteSpeed response headers, including frame-ancestor denial, `nosniff`, no-referrer, restricted browser permissions, and HSTS for the current host without subdomain/preload enrollment. The index and manifest are served with `no-store`. Other hosts must configure equivalent HTTP headers: the HTML meta policy alone cannot deny embedding. Test the configuration on an isolated path on the actual host before publishing it. CI includes hidden deployment files and reads the artifact back to verify the hosting policy survives packaging.

Builds also include UTF-8 `third-party-notices.txt`, served with an explicit text charset and generated from the installed runtime packages' own license files, including the font license. The footer opens these notices separately so the in-memory session stays mounted. An unused font dependency was removed.

### Verify this change

```bash
npm ci
npm run verify
npm audit --audit-level=high
git diff --check
```

The suite includes 57 deterministic observer/transport checks in `scripts/test-observer.mjs`, the existing 119,434-case accepted-swap arithmetic sweep, the multi-actor transition model, source-level recovery guards, TypeScript compilation and the production build. The models/source checks do not replace the isolated-node/live contract gates documented below and in the existing review record.

`src/lib/observer.ts` owns report validation and freshness/coverage display policy. `src/lib/rchain.ts` owns bounded, cancellable transport and direct API read validation. The observer service remains a separate repository and release: the UI accepts the existing report shape and the additive version-1 sampling metadata.

Browser QA uses live **read-only** observations and block exploration. No faucet funding, signed transfer, proof deployment, asset creation, liquidity change or swap is needed to verify this UI change. Existing unmerged assurance work is preserved on its own branches; it is not included in this main-based redesign.

Production assets are built into `dist/` and uploaded as a CI artifact. Deploy reviewed assets to the existing site's root, retain the prior index/assets for rollback, upload content-addressed assets first, then atomically replace `index.html`. Keep existing hosting configuration and credentials outside this repository. Publishing a preview or opening a PR does not establish that rholox.com was updated.

## Current surface

1. **Network Console** — live node status, shard, latest height, finalized block, validators, peers, and advertised capabilities.
2. **Wallet + Test REV** — session-only secp256k1 key generation/import, REV address derivation, faucet funding, and finalized balance reads.
3. **Rholox Proof** — local SHA-256 hashing, locally signed deploy submission, inclusion polling, and finalized-state visibility checks.
4. **Explorer** — recent blocks, block-by-hash detail, recent-height lookup, deploy-status lookup, justifications, bonds, deploys, and rejected deploys.
5. **REV Transfer** — local signing, REV-address validation, signed test transfer, inclusion polling, and finalized recipient-balance verification.
6. **Asset Lab** — fixed-supply MakeMint asset creation, finalized metadata/balance reads, purse-brand verification, signed asset transfer, and an exchange capability bridge in runtime v2.
7. **Exchange Core** — two-asset capability custody, integer constant-product quotes, LP accounting, add/remove liquidity, swaps, compensation on partial two-asset failure, and finalized reserve/custody verification.

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

## Architecture

```text
Browser
  ├─ session wallet / secp256k1 signing
  ├─ proof / transfer / assets / exchange writes
  │       │
  │       ▼
  │   https://testnet.rhobot.net
  │       └─ public execution gateway → validator A
  │
  └─ network + finality evidence
          │
          ▼
      /observer/v1/observation
          │
          ▼
      rchain-observer
          ├─ validator A
          ├─ validator D
          ├─ validator B
          └─ validator C
               │
               ▼
       exact agreement / proven lag / unresolved skew / conflict
```

The observer is intentionally not a write proxy. It polls the four live validators on a bounded interval and serves a cached read-only snapshot to Rholox, so page traffic does not fan out into fresh validator requests. Exact finalized-snapshot agreement is separated from different-height observations; when heights differ, the observer walks the justification DAG using raw block preimages. Each traversed block must reproduce its BLAKE2b-256 content address and pass proposer-signature verification before its ancestry fields are accepted, after which the condition can become `proven_lag`, `conflicting_finalized_history`, or unresolved `height_skew`. The service source and deployment boundary live in [`rchain-community/rchain-observer`](https://github.com/rchain-community/rchain-observer).

Core implementation boundaries:

```text
src/lib/wallet.ts       key generation/import + REV address derivation
src/lib/rchain.ts       public-testnet reads, faucet, block/deploy API access
src/lib/deploy.ts       shared signed-deploy submission / processing / explore helpers
src/lib/proof.ts        SHA-256 proof deploy + inclusion/finality verification
src/lib/transfer.ts     signed REV transfer + finalized recipient verification
src/lib/asset.ts        MakeMint fixed-supply runtime + v2 purse capability bridge
src/lib/amm.ts          deterministic integer pool arithmetic + invariant guards
src/lib/exchange.ts     Rholang pool runtime + finalized client verification
src/AssetLabPanel.tsx   asset create/inspect/transfer surface
src/ExchangePanel.tsx   pool inspect/create/liquidity/swap surface
src/main.tsx            product state + presentation wiring
src/styles.css          presentation only
```

## Project record

Phase 07 is tracked in GitHub issue **#6 — Phase 07: evidence-first exchange mechanics on public testnet**. The architecture, arithmetic, negative controls, live testnet evidence, claims, and non-claims are recorded in [`docs/EXCHANGE-MECHANICS.md`](docs/EXCHANGE-MECHANICS.md).

## Local verification

```bash
npm ci
npm run verify
npm audit --audit-level=high
git diff --check
```

`npm run verify` runs the source-level invariant guard, AMM arithmetic and actor models, recovery source guards, observer/transport regression checks, strict TypeScript compilation, and production Vite build.

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Static output is written to `dist/`.

## Review evidence

See [`docs/REVIEW.md`](docs/REVIEW.md) for the current review matrix and [`docs/EXCHANGE-MECHANICS.md`](docs/EXCHANGE-MECHANICS.md) for Phase 07 evidence.
