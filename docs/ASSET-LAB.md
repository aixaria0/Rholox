# Asset Lab — public-testnet boundary

Asset Lab is a deliberately narrow MakeMint integration. It proves that the session-wallet signing path can create and move a fixed-supply purse asset while keeping inclusion, finality, balance evidence, and purse-brand evidence distinct.

Runtime v2 extends that same fixed-supply model with a capability bridge for Phase 07. It does **not** add post-creation minting.

## Runtime versions

### v1 — legacy fixed-supply transfer surface

Existing assets remain readable and transferable on:

```text
rholox:asset:v1:<64-hex-id>
```

The public surface is:

- `info`
- `balanceOf`
- `verifyBrand`
- `transfer`

v1 keeps its MakeMint purses behind the REV-address-owned map and does not expose a purse capability suitable for contract custody. It is therefore not accepted by Exchange Core.

### v2 — exchange capability bridge

Newly created assets use:

```text
rholox:asset:v2:<64-hex-id>
```

v2 preserves all v1 behavior and adds:

- `makeEmptyPurse` — sprouts an empty same-brand purse;
- `depositInto` — moves value from the signed deployer's managed purse to a supplied purse capability;
- `withdrawFrom` — moves value from a supplied purse capability to a named REV-address-owned managed purse.

The bridge does not expose MakeMint's private mint authority and does not expose a public mint operation.

## Runtime model

1. The browser generates a 32-byte random Asset ID.
2. A locally signed deploy resolves `rho:rchain:makeMint` and the deployer's REV address on-chain.
3. MakeMint creates the issuer purse with the requested fixed initial integer-unit supply.
4. Transfer authority derives from `rho:rchain:deployerId`; a browser-supplied sender address is never trusted.
5. A recipient with no managed purse gets a zero-balance purse from the same mint before MakeMint `deposit` performs the move.
6. The client reports finality only after finalized-state reads show the expected balance transition and same-mint brand evidence.

Human-facing decimals are metadata only. The chain stores integer units; the client converts display amounts to safe integers with at most eight decimal places.

## Brand evidence

MakeMint purses expose a `decr` capability used to compare mint identity without revealing the private decrement authority. Asset Lab's `verifyBrand` asks the selected purse and issuer purse for their brand values and reports equality. A successful balance read alone is not treated as brand evidence.

## Capability evidence for Phase 07

Before the pool implementation used v2, a live public-testnet probe created an empty same-brand purse, deposited 37 units into it from the signer, then withdrew all 37 back to the signer:

```text
asset id       2a3e115a15e53f97b3ab73ebee0a5baadcf32501b53d86bfd91d5bad805fbf45
runtime        v2
create include #224
create final   #225
roundtrip incl #229
receipt        (true, "asset-v2-capability-roundtrip")
final balance  1000 @ #229
```

This is evidence for the purse capability path, not a production-custody claim. The public testnet may reset, so block heights are observations rather than fixtures.

## Earlier v1 public-testnet smoke

The original Asset Lab slice remains recorded for backward-compatibility review:

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

## Explicit limitations

- Public testnet only; test assets have no monetary value and may disappear on reset.
- Fixed supply after creation; neither runtime exposes a public post-creation mint method.
- The 256-bit Asset ID is a collision-resistant public namespace, not a registry-issued unforgeable identity.
- Runtime v2 exposes purse capabilities because Exchange Core needs contract-held reserves; that is testnet capability evidence, not audited production custody.
- No mainnet readiness or production token-standard compatibility claim.
- Long finality/reconciliation delays are possible. Inclusion without finalized read-back remains `PENDING`.

## Reproducible review path

```bash
npm ci
npm run verify
npm audit --audit-level=high
git diff --check
```

For Phase 07 pool-specific evidence, see [`EXCHANGE-MECHANICS.md`](EXCHANGE-MECHANICS.md).
