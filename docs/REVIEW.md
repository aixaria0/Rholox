# Rholox public-testnet vertical slice — review matrix

This document is the review boundary for the current Rholox slice. It states what is implemented, what is verified, and what is deliberately not claimed.

## Scope

| Surface | Implementation | Evidence / expected behavior |
| --- | --- | --- |
| Network Console | `src/lib/rchain.ts`, `src/main.tsx` | Public node status, capabilities, latest/finalized heights, validator bonds, peers |
| Session wallet | `src/lib/wallet.ts` | secp256k1 key generation/import in browser memory; deterministic REV address derivation |
| Faucet + balance | `src/lib/rchain.ts` | Requests test REV, polls deploy status, reads balance through `explore-deploy` |
| Proof | `src/lib/proof.ts` | SHA-256 locally, deploy signed locally, waits for inclusion, verifies finalized-state visibility |
| Explorer | `src/lib/rchain.ts`, `src/main.tsx` | Recent blocks, block hash lookup, numeric recent-height lookup, deploy-status lookup |
| REV transfer | `src/lib/transfer.ts` | Destination/amount guards, local signing, inclusion, finalized recipient balance verification |
| Asset Lab | `src/lib/asset.ts`, `src/AssetLabPanel.tsx` | Fixed-supply MakeMint v1/v2 assets, finalized metadata/balances, purse brand, signed transfers |
| Exchange Core | `src/lib/amm.ts`, `src/lib/exchange.ts`, `src/ExchangePanel.tsx` | v2 purse capability custody, deterministic pool math, LP accounting, add/remove/swap, finalized reserve/custody verification |

## Review invariants

### Key handling

- Private keys remain in browser state only.
- There is no local-storage persistence of private keys.
- There is no server-side private-key upload path.
- Proof, REV transfer, Asset Lab mutation, and Exchange mutation deploys are signed with the active session key locally.

### Network boundary

- The client uses the public testnet endpoint configured in `src/lib/rchain.ts`.
- No admin/propose HTTP operation is used by the application.
- UI status is derived from node responses; there is no synthetic mainnet/production telemetry.
- Raw node vendor/version strings are not rendered into the product UI.
- Status, capabilities, and finalized-state reads degrade independently.
- Unknown/stale observations remain explicit rather than being coerced into success/failure claims.
- Public-node requests have bounded timeouts.

### Submission, inclusion, finality

The UI does not equate HTTP acceptance or block inclusion with finality.

- **Proof:** inclusion first; finalized-state proof visibility independently observed.
- **REV transfer:** inclusion first; finalized recipient-balance change independently observed.
- **Asset creation:** finalized only when metadata, exact issuer balance, and brand evidence are visible from finalized state.
- **Asset transfer:** finalized only when sender/recipient balance deltas and recipient brand are visible from finalized state.
- **Pool creation:** finalized only when pool state is visible and recorded reserves equal actual private-purse balances.
- **Liquidity / swap:** finalized only when expected pool state, custody equality, LP position where relevant, and wallet asset balance deltas are visible from finalized state.
- A timeout remains pending/unknown.

## Asset Lab boundary

- Asset creation resolves the blessed `rho:rchain:makeMint` purse model.
- Initial supply is created exactly once during installation; neither v1 nor v2 exposes a public post-creation mint method.
- Asset IDs are 32 random bytes rendered as 64 lowercase hex characters.
- Asset ID channels are public-testnet namespaces, not production registry identities.
- Sender authority derives on-chain from `rho:rchain:deployerId`, not browser-supplied sender text.
- Brand verification compares MakeMint purse brand capability without exposing mint authority.
- Runtime v1 remains readable/transferable.
- Runtime v2 additionally exposes `makeEmptyPurse`, `depositInto`, and `withdrawFrom` so another Rholang contract can retain reserve purse capabilities.
- Exchange Core refuses runtime v1 assets.

## Exchange Core boundary

### Custody

- Pool creation makes one empty same-brand purse for each v2 asset.
- Those reserve purse capabilities remain lexically private inside the pool contract.
- `info` exposes balances, not purse capabilities.
- Recorded reserve values and actual private-purse balances are reported separately.
- Every mutation refuses when `recorded != actual custody` on either side.

### Arithmetic

Exchange v1 is intentionally small and integer-only:

```text
fee                         0 bps
reserve cap                 10,000,000 raw units / side
initial shares              amountA + amountB
subsequent liquidity        exact reserve ratio
swap output                 floor(dx * y / (x + dx))
accepted swap invariant     post-product >= pre-product
```

The caller supplies adverse-execution guards:

- add: `minShares`;
- remove: `minA`, `minB`;
- swap: `minOut`.

`npm run test:amm` pins focused negative controls and a deterministic property sweep over more than 100,000 accepted swap quotes in both directions.

### Two-asset failure handling

Operations are sequential and compensating, not described as transactional rollback:

- failed second add deposit attempts to return the first deposit;
- failed second removal withdrawal attempts to restore the first output to the pool;
- failed swap output attempts to refund the input.

If compensation itself fails, the contract returns `pool-fatal`. It restores the old recorded state, causing the custody-equality check to fail closed on subsequent mutations. A `pool-fatal` outcome is never presented as finalized success.

### Identity / registry limits

- Pool IDs are 32 random bytes / 64 lowercase hex.
- Pool channel: `rholox:pool:v1:<poolId>`.
- Assets are canonicalized by ID order.
- There is no global canonical pool registry and no unique-pool-per-pair claim in v1.

## Existing transfer guards

REV transfer rejects invalid addresses, self-transfer, malformed/non-positive amounts, excessive decimals, unsafe integer amounts, and balances that do not leave room beyond the requested transfer amount.

Asset transfer similarly validates recipient, amount precision/range, and balance.

## Explorer behavior

- 64-hex-character input is treated as a block hash.
- Decimal input is treated as a recent block height.
- Other input is treated as a deploy ID.
- Multiple blocks at one height remain distinct because block identity is the hash, not height alone.

## Accessibility and degraded-state behavior

- Form controls have programmatic accessible names.
- Asynchronous errors are exposed as alerts.
- Explorer distinguishes loading, empty, failed, and stale recent-block states.
- Reduced-motion preference disables scripted smooth scrolling and CSS animation/transition effects.
- Exchange Core exposes `PENDING / MISMATCH` rather than a verified badge when finalized custody equality is absent.

## Automated gates

From a clean checkout:

```bash
npm ci
npm run verify
npm audit --audit-level=high
git diff --check
```

`npm run verify` performs:

1. source-level product/invariant guards;
2. deterministic AMM regression/property tests;
3. strict TypeScript compilation;
4. production Vite build.

CI runs the same source/build checks on pull requests and pushes to `main`.

## Manual public-testnet smoke matrix

The reviewer can exercise the product without privileged node access:

1. Refresh Network Console and confirm node/shard/latest/finalized observations.
2. Create a session wallet and request test REV.
3. Anchor a proof; confirm deploy ID, inclusion, then finalized proof visibility.
4. Inspect its deploy/block in Explorer.
5. Send test REV to a second wallet; confirm inclusion and finalized recipient balance.
6. Create a fixed-supply v2 test asset and verify metadata, issuer balance, brand, and runtime version.
7. Create a second v2 asset.
8. Create a pool from the two Asset IDs; confirm zero recorded reserves equal zero private-purse custody from finalized state.
9. Add liquidity; confirm LP position, wallet balance deltas, recorded reserves, and custody equality.
10. Execute a swap with `minOut`; confirm expected output, wallet deltas, custody equality, and non-decreasing constant product.
11. Remove liquidity; confirm LP position and finalized outputs.
12. Remove all remaining shares and confirm zero reserves / zero LP supply / zero position, with custody equality preserved.

## Recorded Phase 07 public-testnet evidence

A complete lifecycle against the current Phase 07 source was run on 2026-10-11. Detailed sanitized evidence is in [`docs/evidence/phase07-public-testnet-2026-10-11.txt`](evidence/phase07-public-testnet-2026-10-11.txt) and the architecture/interpretation is in [`EXCHANGE-MECHANICS.md`](EXCHANGE-MECHANICS.md).

```text
asset A       9206f5…7a2b8   create #325 -> final #328
asset B       f215d5…da5c1   create #333 -> final #334
pool          bc1f11…04191   create #338 -> final #340
add           100 / 200      inclusion #348 -> final #351; LP 300
stale race    1 winner       1 refusal: "stale pool state"; post 110/220, LP 330
swap A->B     10 -> 18       inclusion #368 -> final #371; k 24200 -> 24240
remove all    120 / 202      inclusion #375 -> final #377
final         reserves 0/0; actual 0/0; shares 0; position 0; custody verified; holder 1000/1000
recheck       #381 confirms zero pool/custody state and holder 1000/1000
```

The public testnet may reset; heights are evidence from one observation and are not stable fixtures.

## Explicit non-claims

The current slice does **not** claim:

- mainnet readiness;
- audited production custody;
- economic security for real value;
- persistence/recovery of browser session keys;
- a production token standard or canonical asset identity scheme;
- post-creation asset minting;
- a canonical/global pool registry;
- production LP-token compatibility;
- oracle pricing, routing, order books, dynamic fees, TVL, volume, APR, yield, or fabricated activity;
- atomic rollback when compensation itself fails;
- a new consensus or finality theorem.

The purpose is narrower: provide a reproducible public-testnet execution surface whose visible claims map to recorded evidence.

### Phase 07 recovery evidence update — 2026-10-11

The exact recovery-core and public custody-guard Rholang blocks are now exercised through non-persistent `explore-deploy` fault injection. Twelve scenarios cover compensated and `pool-fatal` second-leg failures for add/remove/both swap directions, fail-closed custody mismatch on all public mutation entrypoints, and rejection of a fresh private name as a `deployerId`. See `docs/evidence/phase07-rholang-recovery-explore-2026-10-11.json`.

This closes the previous **Rholang semantics** gap for those branches, but not the stronger isolated-node deployment gate. The evidence does not claim mainnet safety or an independent security audit.
