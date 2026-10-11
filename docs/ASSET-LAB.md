# Asset Lab v1 — public-testnet boundary

Asset Lab is a deliberately narrow MakeMint integration. It proves that the existing session-wallet signing path can create and move a fixed-supply purse asset while keeping inclusion, finality, balance evidence, and purse-brand evidence distinct.

## Runtime model

1. The browser generates a 32-byte random Asset ID and derives a public testnet channel `rholox:asset:v1:<64-hex-id>`.
2. A locally signed deploy resolves `rho:rchain:makeMint` and the deployer's REV address on-chain.
3. MakeMint creates the issuer purse with the requested fixed initial integer-unit supply.
4. The installed asset service exposes only:
   - `info`
   - `balanceOf`
   - `verifyBrand`
   - `transfer`
5. `transfer` derives the sender from `rho:rchain:deployerId`; it never trusts a browser-supplied sender address.
6. A recipient with no purse gets a zero-balance purse from the same mint, then MakeMint `deposit` performs the move.
7. The client reports finality only after finalized-state reads show the expected balance transition and same-mint brand evidence.

Human-facing decimals are metadata only. The chain asset stores integer units; the client converts display amounts to safe integers with at most eight decimal places.

## Brand evidence

MakeMint purses expose a `decr` capability used to compare mint identity without revealing the private decrement authority. Asset Lab's `verifyBrand` asks the selected purse and issuer purse for their brand values and reports equality. A successful balance read alone is not treated as brand evidence.

## Explicit limitations

- Public testnet only; test assets have no monetary value and may disappear on reset.
- Fixed supply after creation; no public mint method exists in v1.
- The 256-bit Asset ID is a collision-resistant public namespace, not a registry-issued unforgeable identity.
- No mainnet readiness, custody, token-standard compatibility, DEX, liquidity, pricing, or economic-security claim.
- Long finality/reconciliation delays are possible. Inclusion without finalized read-back remains `PENDING`.

## Reproducible review path

From a clean checkout:

```bash
npm ci
npm run verify
npm audit --audit-level=high
git diff --check
```

Manual testnet review requires a funded session wallet: create an asset, wait for finalized metadata/balance/brand evidence, transfer to a second REV address, then verify both balance deltas and recipient brand from finalized state.

## Observed public-testnet smoke — 2026-10-11

One final pre-PR run against the public testnet used the same 64-hex Asset ID format and runtime that is shipped in this branch:

```text
asset id       cefebaab69a847356f7da8934de0bdf8379b516e71031e6740036b9f276fec32
create include #283
create read    #284
initial        1000.00 RTP
issuer brand   verified
transfer       12.34 RTP
transfer incl  #288
final read     #291
sender final   987.66 RTP
recipient      12.34 RTP
recipient brand verified
```

These heights are evidence from one observation, not stable fixtures; the public testnet advances and may reset.
