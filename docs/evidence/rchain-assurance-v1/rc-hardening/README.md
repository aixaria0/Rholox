# RC hardening evidence

These snapshots use Compiler `1054e4919ad2557a57bedf6c8a54ef2d6173747e`, Sentinel `65862e4069df22e5569b914e086376d1fb6256e3`, and Rholox implementation `59bddb2adca42a146f260be5e4555de5ce0dc840`. Later evidence-only commits do not change that implementation. Recorded policies use their observation-time clock; replay is historical, not a fresh finality claim.

- `synthetic-unpinned`: actual Rholox signing/submission, real Sentinel, canonical verifier and actual renderer. All local checks pass; the sole blocked check is the missing independent package pin. The runner deliberately does not promote its locally computed received digest into a reviewer pin. Positive externally pinned PASS and coherent-substitution rejection are covered by the controlled canonical fixtures and Rholox assurance tests.
- `live`: read-only resume of the already retained deploy. No new keys, faucet requests or transfers. Result BLOCKED/UNPINNED; raw-byte tampering returns FAIL. Package commitment: `e005467ee4cc863e9d36d26e700afb91764332e807b1bff653482fc9f2048cf2`.

UPSTREAM/API LIMITATION is established by the exact reported node source and read-only Nil/boolean controls in [Sentinel evidence](https://github.com/aixaria0/rchain-sentinel/tree/65862e4069df22e5569b914e086376d1fb6256e3/evidence/rc-hardening). The classic transfer replies Nil; expression serialization drops Nil. Neither the transfer term nor any verifier gate was changed to turn that into true. PASS still requires the supported typed positive transfer receipt, finalized read-back, enough independently approved observers and an independently selected exact package pin.

The policies use `received_payload_digest` for bookkeeping and a separate null `external_payload_digest`, correctly reflecting the absence of independent approval. Historical policies and old snapshots remain unchanged; legacy expected digests are not silently migrated into independent pins.

Validation: 295 full Compiler tests (31 focused), full typecheck/lint/build and zero audit findings; Rholox verify/build/assurance tests and zero audit findings; Sentinel locked check/test/build (17 tests); diff checks pass.
