# Phase 07 — Exchange Core

Tracking issue: **#6 — Phase 07: evidence-first exchange mechanics on public testnet**.

This is project work and is intentionally evidence-first. The target is a minimal public-testnet pool whose custody, arithmetic, state transition, and finality claims can be reproduced and reviewed. It is not a mainnet or production-DEX claim.

## 1. Boundary inherited from Asset Lab

Asset Lab runtime v1 keeps the MakeMint authority and its managed purse map private. Its public surface can transfer between REV-address-owned purses, but another contract cannot safely retain a purse capability, so v1 assets are readable/transferable but are **not pool-compatible**.

Newly created assets use runtime v2. Fixed supply remains unchanged. Runtime v2 adds only the capability bridge required by Phase 07:

- `makeEmptyPurse` — creates a zero-balance same-brand purse and returns its capability;
- `depositInto` — moves units from the signed deployer's managed purse into a supplied same-brand purse capability;
- `withdrawFrom` — moves units from a supplied purse capability into a named REV-address-owned managed purse.

There is still no public post-creation mint operation.

### Live capability negative/positive boundary

The capability bridge was exercised independently before using it for pool custody:

```text
asset id       2a3e115a15e53f97b3ab73ebee0a5baadcf32501b53d86bfd91d5bad805fbf45
runtime        v2
create include #224
create final   #225
roundtrip      deposit 37 into private purse -> withdraw 37 to holder
roundtrip incl #229
receipt        (true, "asset-v2-capability-roundtrip")
final balance  1000 @ #229
```

The roundtrip establishes the custody capability needed by the pool without exposing mint authority or changing total supply. Heights are one public-testnet observation and may disappear on reset.

## 2. Pool identity and custody

A pool is identified by a random 256-bit lowercase hexadecimal `poolId` and a public testnet channel:

```text
rholox:pool:v1:<poolId>
```

The pool canonicalizes the two asset IDs lexicographically and refuses:

- identical assets;
- Asset Lab runtime v1 assets;
- asset state that is not visible from finalized reads.

At installation the pool calls `makeEmptyPurse` once for each v2 asset. The resulting purse capabilities are lexically private inside the pool contract. The read surface never returns either capability.

Pool state contains:

- canonical asset A / asset B IDs;
- recorded reserve A / reserve B integer units;
- total LP share units;
- LP shares by REV address.

`info` independently reads the two private purse balances and returns both **recorded** and **actual custody** values. The client only marks custody verified when:

```text
recorded A == actual purse A
recorded B == actual purse B
```

Every mutation repeats this check before touching value. A mismatch refuses the operation.

## 3. Deterministic integer arithmetic

All arithmetic is integer-only. The client and the pool use the same deliberately small v1 model.

Public-testnet reserve cap:

```text
10,000,000 raw asset units per side
```

The cap is an arithmetic/review bound, not an economic parameter.

### Initial liquidity

For positive deposits `a` and `b`:

```text
shares = a + b
```

These shares are internal accounting units. No external token-standard claim is made.

### Subsequent liquidity

A subsequent deposit must preserve the existing reserve ratio exactly:

```text
a * reserveB == b * reserveA
```

Minted shares:

```text
a * totalShares / reserveA
```

The B side must imply the same share count. The caller can require `minShares`.

### Remove liquidity

For share amount `s`:

```text
outA = floor(s * reserveA / totalShares)
outB = floor(s * reserveB / totalShares)
```

Removing all outstanding shares returns the complete remaining reserves exactly. The caller supplies `minA` and `minB`.

### Swap

Exchange v1 has **0 bps fee**. There is no hidden spread.

For exact input `dx`, input reserve `x`, and output reserve `y`:

```text
dy = floor(dx * y / (x + dx))
```

The caller supplies `minOut`. A swap refuses if:

- input is non-positive;
- output rounds to zero;
- output would exhaust the reserve;
- `minOut` is not met;
- the reserve cap would be exceeded;
- the post-state constant product would decrease.

Accepted swaps satisfy:

```text
(x + dx) * (y - dy) >= x * y
```

The deterministic property sweep in `scripts/test-amm.mjs` currently exercises more than 100,000 accepted swap vectors across both directions, plus focused negative controls.

## 4. State transition and compensation boundary

Each mutating pool call consumes the single pool state cell until it completes, serializing contract-level state transitions.

Two-asset operations are sequenced with compensation:

- **add liquidity** — A is deposited, then B; if B fails, A is withdrawn back to the signer;
- **remove liquidity** — A is withdrawn, then B; if B fails, A is deposited back into the pool;
- **swap** — input is deposited, then output is withdrawn; if output fails, input is returned.

This is **not described as transactional rollback**. If compensation itself fails, the receipt is `pool-fatal`. The old recorded state is restored, actual custody then differs, and the custody-equality guard makes subsequent mutations fail closed until the inconsistency is investigated.

That distinction is intentional: a compensation failure cannot be reported as success or hidden behind a client-side balance.

## 5. Stale-state / slippage boundary

Client-side arithmetic is a quote, not authority. Every signed mutation carries the exact `reserveA`, `reserveB`, and `totalShares` values against which that quote was produced. The pool compares all three with the state cell it consumes **before moving either asset**. A mismatch returns `stale pool state` and moves no value.

The pool then re-evaluates its arithmetic and guards on-chain. The caller also controls adverse execution through:

- `minShares` for adding liquidity;
- `minA` / `minB` for removing liquidity;
- `minOut` for swaps.

The UI labels swap output as a **current-state quote**, not a guaranteed price. A changed state must be refreshed and signed again rather than being silently accepted.

## 6. Evidence ladder

A successful UI receipt is intentionally stronger than HTTP submission.

For each mutation the client distinguishes:

1. locally signed deploy submission;
2. execution result;
3. inclusion block;
4. finalized pool-state read-back;
5. actual private-purse custody read-back;
6. finalized LP position / wallet asset balance deltas when applicable.

Only finalized read-back can produce `FINALIZED / VERIFIED`. A timeout remains pending.

## 7. Public-testnet end-to-end evidence — 2026-10-11

The complete lifecycle below was executed against the **current Phase 07 source path** using a throwaway session wallet. The detailed sanitized transcript is committed at [`docs/evidence/phase07-public-testnet-2026-10-11.txt`](evidence/phase07-public-testnet-2026-10-11.txt).

```text
asset A
  id            9206f59350833e862e9c2911cab85ae677936f2f04727f162d5338e39e47a2b8
  supply        1000 raw units
  create incl   #325
  final read    #328

asset B
  id            f215d53cb0be00c398af204e6d4461bee45fdfc849715b858da81cad7e4da5c1
  supply        1000 raw units
  create incl   #333
  final read    #334

pool
  id            bc1f115383b72115d4ab4ca9dc44958b085a9dfa8798d05ef1f857e1cf604191
  create incl   #338
  final read    #340
  creator       derived from signed deployer on-chain
  custody       verified (0 == 0 on both sides)

initial liquidity
  deposit       100 A + 200 B
  LP minted     300
  inclusion     #348
  final read    #351
  reserves      100 / 200
  custody       verified

stale-state negative control
  concurrent    two +10 A / +20 B calls from the same observed state
  result        exactly one finalized winner; exactly one rejection
  rejection     "stale pool state"
  post-state    reserves 110 / 220; shares 330; custody verified

swap A -> B
  input         10 A
  output        18 B
  inclusion     #368
  final read    #371
  reserves      120 / 202
  k             24,200 -> 24,240
  custody       verified

remove all liquidity
  LP burned     330
  output        120 A + 202 B
  inclusion     #375
  final read    #377
  reserves      0 / 0
  LP supply     0
  position      0
  actual purse  0 / 0
  custody       verified

final holder balances
  asset A       1000
  asset B       1000
```

The stale-state race is important: client arithmetic is not trusted as current merely because it was correct when read. Expected reserves/share supply are carried into the signed mutation, and the losing operation is refused before value movement when the pool has advanced.

The accepted swap increased the integer-truncated constant product from 24,200 to 24,240. Full withdrawal then returned both original asset balances exactly. Post-run read-back at finalized block #381 still showed recorded/custody reserves `0/0`, total shares `0`, the signer-derived creator address, and holder balances `1000/1000`. The public testnet may reset, so these heights are evidence from one observation and are not stable fixtures.

## 8. Automated negative controls

The project gate covers or source-pins these boundaries:

- zero/negative liquidity and swap input refused;
- reserve cap exceeded refused;
- non-proportional follow-up liquidity refused;
- LP overspend refused;
- `minShares`, `minA`, `minB`, and `minOut` adverse-execution guards;
- zero-output swap refused;
- constant product cannot decrease for an accepted quote;
- v1 asset refused for pool creation;
- same-asset pair refused;
- custody mismatch refuses mutation;
- compensation failure has a distinct `pool-fatal` surface;
- pool/asset IDs remain random 32-byte / 64-hex public-testnet namespaces;
- existing Network / Wallet / Proof / Explorer / REV Transfer / legacy Asset Lab reads remain separate from the new pool implementation.

## 9. Explicit non-claims

Phase 07 v1 does **not** claim:

- mainnet readiness;
- audited production custody;
- economic security for real value;
- a canonical global pool registry;
- unique pool-per-pair semantics;
- oracle pricing;
- externally meaningful LP-token compatibility;
- multi-hop routing;
- order books;
- dynamic fees;
- TVL, volume, APR, yield, or synthetic activity metrics;
- atomic rollback if a compensation operation itself fails.

The implemented claim is narrower: a public-testnet, capability-custodied two-asset pool whose arithmetic and finalized state can be independently inspected and whose failure boundaries remain explicit.

## Phase 07 merge gate — adversarial follow-up (2026-10-11)

The reproducible CI command `npm run test:amm:actors` now tests a two-holder LP accounting **off-chain transition model**: Alice initial liquidity, Bob proportional liquidity, Bob's excess-withdrawal refusal, Bob's partial withdrawal, a swap, Bob's remaining exit, Alice's full exit, and zeroed reserves and LP shares. It also rejects zero-rounded swaps, reserve-cap overflow, excessive `minOut`, and zero-rounded LP withdrawal.

**Evidence boundary:** These tests validate the TypeScript quote/state model only. They do not execute the generated Rholang contract, verify that `rho:rchain:deployerId` cannot be forged, or force a failure in either leg of an on-chain two-asset operation. A stale-state mismatch is asserted in the model, not executed as a fresh on-chain race here; the historical on-chain race is documented separately in the evidence file. The following remain release blockers: live two-actor contract execution, adversarial capability/identity review, forced second-leg failure and compensation-failure recovery observations, and automated isolated-node contract tests. No mainnet release claim follows from passing this suite.
