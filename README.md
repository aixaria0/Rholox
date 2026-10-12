# Rholox

Rholox is an evidence-first public-testnet interface for observing network state and exercising signed DApp primitives without presenting the system as more mature than the evidence supports.

The current vertical slice covers observation, session-only signing, test-value funding, proof anchoring, block/deploy inspection, finalized REV transfer verification, fixed-supply MakeMint assets, and a capability-custodied testnet exchange core.

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

`npm run verify` runs the source-level invariant guard, deterministic AMM regression/property sweep, strict TypeScript compilation, and production Vite build.

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
