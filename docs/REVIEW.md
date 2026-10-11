# Rholox public-testnet vertical slice — review matrix

This document is the review boundary for the current Rholox slice. It is intentionally specific about what is implemented, what is verified, and what is not claimed.

## Scope

| Surface | Implementation | Evidence / expected behavior |
| --- | --- | --- |
| Network Console | `src/lib/rchain.ts`, `src/main.tsx` | Reads public node status, capabilities, latest/finalized heights, validator bonds, peers |
| Session wallet | `src/lib/wallet.ts` | secp256k1 key generation/import in browser memory; deterministic REV address derivation |
| Faucet + balance | `src/lib/rchain.ts` | Requests 0.3 test REV, polls deploy status, reads balance through `explore-deploy` |
| Proof | `src/lib/proof.ts` | SHA-256 locally, deploy signed locally, waits for inclusion, verifies visibility from finalized state |
| Explorer | `src/lib/rchain.ts`, `src/main.tsx` | Recent blocks, block hash lookup, numeric recent-height lookup, deploy-status lookup |
| REV transfer | `src/lib/transfer.ts` | validates destination/amount, signs locally, waits for inclusion, verifies recipient balance from finalized state |
| Asset Lab | `src/lib/asset.ts`, `src/AssetLabPanel.tsx` | creates fixed-supply MakeMint assets, reads finalized metadata/balances, verifies purse brand, signs asset transfers |

## Review invariants

### Key handling

- Private keys remain in browser state only.
- There is no local-storage persistence of private keys.
- There is no server-side key upload path in this slice.
- All signed proof and transfer operations use the active session key locally.

### Network boundary

- The client uses the public testnet endpoint configured in `src/lib/rchain.ts`.
- No admin HTTP operation is used by the application.
- UI status is derived from node responses; there is no synthetic mainnet/production telemetry.
- Raw node vendor/version strings are not rendered into the product UI; only neutral API metadata is shown.
- Status, capabilities, and finalized-state reads settle independently so one failed endpoint cannot make another observation false.
- Unknown and stale observations remain explicit rather than being coerced into `NO`, `OFF`, or `UNAVAILABLE`.
- Public-node requests use a bounded timeout so degraded connections cannot leave controls indefinitely pending.

### Inclusion versus finality

The UI does not equate deploy acceptance or block inclusion with finality.

- Proof: reports inclusion first, then independently checks finalized-state visibility.
- Transfer: reports inclusion first, then independently checks the recipient balance from the finalized read path.
- A timeout leaves finality pending rather than fabricating a success state.
- Asset creation is not considered finalized until metadata, issuer balance, and issuer brand are independently visible from finalized state.
- Asset transfer is not considered finalized until sender/recipient balance deltas and recipient brand are independently visible from finalized state.

### Transfer guards

Before submission the client rejects:

- invalid REV addresses,
- self-transfer,
- zero/negative or malformed amounts,
- more than 8 REV decimal places,
- amounts outside the client's safe integer range,
- sender balances that do not leave room beyond the requested transfer amount.

### Asset Lab boundary

- Asset Lab v1 uses the blessed `rho:rchain:makeMint` purse model.
- Initial supply is created exactly once during installation; the public asset surface has no post-creation mint method.
- Asset IDs are 32 random bytes rendered as 64 lowercase hex characters.
- The ID derives a public-testnet contract channel. It is a collision-resistant namespace, not an unforgeable registry identity or production token standard.
- Transfer authority comes from the signed deployer's on-chain `rho:rchain:deployerId` -> REV-address mapping, not from browser-supplied sender text.
- Brand verification compares the recipient/holder purse `decr` capability against the issuer purse brand without exposing the private mint capability.
- Invalid REV recipients, self-transfer, non-positive amounts, excessive decimals, unsafe integer amounts, and insufficient asset balances are rejected before or during submission.
- Test assets have no monetary/economic-security claim and may disappear when the public testnet resets.

### Explorer behavior

- 64-hex-character input is treated as a block hash.
- Decimal input is treated as a recent block height.
- Other input is treated as a deploy ID.
- Multiple blocks at the same height remain distinct because block identity is the block hash, not height alone.

### Accessibility and degraded-state behavior

- Form controls have programmatic accessible names.
- Asynchronous errors are exposed as alerts.
- Explorer distinguishes loading, empty, failed, and stale recent-block states.
- Reduced-motion preference disables scripted smooth scrolling as well as CSS animation/transition effects.

## Automated gates

Run from a clean checkout:

```bash
npm ci
npm run verify
npm audit --audit-level=high
git diff --check
```

`npm run verify` performs:

1. a source-level product/invariant guard,
2. strict TypeScript compilation,
3. a production Vite build.

CI runs the same build/source checks on pull requests and pushes to `main`.

## Manual public-testnet smoke matrix

The reviewer can exercise these in order without privileged node access:

1. Refresh Network Console and confirm node/shard/latest/finalized values load.
2. Create a new session wallet.
3. Request 0.3 test REV and confirm balance changes after processing.
4. Anchor a short proof and confirm:
   - deploy ID is returned,
   - inclusion block is reported,
   - finality changes only after finalized-state visibility is observed.
5. Search the proof deploy ID in Explorer and inspect its containing block.
6. Create a second session wallet in another tab.
7. Send a small test REV amount to the second address and confirm:
   - inclusion block,
   - finalized recipient balance increase.
8. In Asset Lab, create a fixed-supply test asset and confirm:
   - a 64-hex Asset ID is returned,
   - creation inclusion is reported separately from finality,
   - metadata and issuer balance become visible from finalized state,
   - issuer purse brand verifies.
9. In a second wallet, transfer a small asset amount and confirm:
   - signed transfer inclusion,
   - finalized sender/recipient balance delta,
   - recipient purse brand verifies.
10. Reload or use another browser and inspect the Asset ID to confirm finalized metadata remains readable without the issuer private key.

## Current observed testnet smoke result

A local review run immediately before opening this PR observed:

```text
network:    testnet
shard:      /root
validators: 4
peers:      3
```

Block heights are intentionally not pinned in this document because they advance and may reset on public testnet.

Asset Lab's final pre-PR smoke created a 64-hex fixed-supply asset, observed `1000.00 RTP` plus issuer-brand verification from finalized state, transferred `12.34 RTP`, then independently observed `987.66 / 12.34 RTP` with recipient-brand verification. The detailed observed block evidence is recorded in [`docs/ASSET-LAB.md`](ASSET-LAB.md).

## Explicit non-claims

This PR does **not** claim:

- mainnet readiness,
- production custody,
- economic security of test REV,
- persistence/recovery of browser session keys,
- a mainnet token standard or production asset identity scheme,
- post-creation asset minting,
- DEX/liquidity functionality,
- a new consensus or finality theorem.

The purpose of the slice is narrower: provide a small, reproducible operational surface whose visible claims map directly to observed testnet behavior.
