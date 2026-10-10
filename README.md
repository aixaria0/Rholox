# Rholox

Rholox is an evidence-first public-testnet interface for observing network state and exercising a small set of signed DApp primitives without pretending the system is more mature than it is.

The current vertical slice is intentionally narrow and reviewable. It covers observation, local session keys, test-value funding, signed proof anchoring, block/deploy inspection, and finalized test REV transfer verification.

## Current surface

1. **Network Console** — live node status, shard, latest height, finalized block, validators, peers, and advertised capabilities.
2. **Wallet + Test REV** — session-only secp256k1 key generation/import, REV address derivation, faucet funding, and finalized balance reads.
3. **Rholox Proof** — local SHA-256 hashing, locally signed deploy submission, inclusion polling, and finalized-state visibility checks.
4. **Explorer** — recent blocks, block-by-hash detail, recent-height lookup, deploy-status lookup, justifications, bonds, deploys, and rejected deploys.
5. **REV Transfer** — local signing, REV-address validation, signed test transfer, inclusion polling, and recipient balance verification from finalized state.
6. **Asset Lab** — explicitly not implemented yet; it remains the next phase.

## Security and scope boundary

- **Public testnet only.** Test REV has no monetary value and the network may reset.
- **No custody.** Private keys are generated/imported in the browser and are not uploaded or persisted by Rholox.
- **No mainnet claim.** The UI does not present production/mainnet status or synthetic production metrics.
- **No admin surface.** The client uses the public node HTTP surface only.
- **No hidden finality claim.** Proofs and transfers distinguish inclusion from finalized-state verification.
- **No fabricated telemetry.** Network values shown by the interface come from the connected public-testnet node.

## Architecture

```text
Browser
  ├─ session wallet / secp256k1 signing
  ├─ network observation
  ├─ proof hashing + signed deploy
  ├─ REV transfer + finalized balance verification
  └─ block/deploy explorer
          │
          ▼
https://testnet.rhobot.net
```

Core implementation boundaries:

```text
src/lib/wallet.ts    key generation/import + REV address derivation
src/lib/rchain.ts    public-testnet reads, faucet, block/deploy API access
src/lib/proof.ts     SHA-256 proof deploy + inclusion/finality verification
src/lib/transfer.ts  signed REV transfer + finalized recipient verification
src/main.tsx         product state + presentation wiring
src/styles.css       presentation only
```

## Local verification

```bash
npm ci
npm run verify
npm audit --audit-level=high
```

`npm run verify` runs the source-level product guard and a production TypeScript/Vite build.

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

See [`docs/REVIEW.md`](docs/REVIEW.md) for the current vertical-slice review matrix, invariants, and manual testnet checks.
