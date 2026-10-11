# Phase 07 — inclusion is not finality: observed negative controls

Date: 2026-10-11
Surface: RChain public testnet
Purpose: verify that Rholox does not promote a successful inclusion receipt to a finalized asset when the resulting registry state is absent from the finalized read path.

## Observation A

- Asset-create inclusion block: `#563`
- Inclusion block hash: `0ced17de5365c81ffbb03845dab79af2adba31cd3355acd8f727b4bed074fc9d`
- Returned registry locator: `rho:id:hzjgmm94kn19wnos96884pqwjbcd8zjhr4t9cah7huhgynuo158o`
- `createAsset(...).finalized`: `false`

## Observation B

- Asset-create inclusion block: `#653`
- Inclusion block hash: `c0390103443eb70bfa05e7c2b0ebbc1dd8432a900cafdbe435f85ef10bcbff1c`
- Returned registry locator: `rho:id:x6aphfiykm5denpatx7buqm6fnk9tk1kica8a5xfn7i787r89jso`
- `createAsset(...).finalized`: `false`

The first run used a more aggressive diagnostic finality-driver cadence and is not treated as evidence of normal network behavior. The second used a substantially slower cadence and still did not produce finalized registry visibility.

## Independent finalized-state recheck

Both locators were queried again through `explore-deploy` at finalized context:

- finalized context block: `#711`
- finalized block hash: `da909167c8131d68dd039644a9a7132cf23c9e5b212f5b49d17e3f3f9a603b88`
- locator A result expressions: `0`
- locator B result expressions: `0`

The observed inclusion heights were therefore well behind the finalized read context, yet neither asset capability was visible there.

## Verdict

This is a **negative finality control**, not a successful multi-actor exchange test. It establishes that, under the observed public-testnet fork/reorg conditions, `ProcessedWithSuccess` plus an inclusion block is insufficient evidence for a durable state claim.

Rholox behaved correctly in both attempts: it returned `finalized=false` and did not proceed to pool creation. The UI must preserve that distinction and require a finalized-state refresh before a user retries an operation. A retry must never be inferred safe from inclusion alone.

No private keys are recorded in this evidence file. The disposable live multi-actor harness was not added to the product or CI because its result depended on current public-testnet fork conditions rather than deterministic repository behavior.
