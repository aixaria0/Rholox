# RChain Assurance v1 retained evidence

The three directories contain exact inputs, external policies, verifier results, public signed deploy bytes and the actual Rholox evidence renderer output. No private key is retained. `report.json` records source revisions and content commitments. These are historical observation snapshots; reproducing a saved policy uses its recorded external time. A current decision must supply a current time and freshness policy.

| Run | Result | Tamper control |
| --- | --- | --- |
| Synthetic Rholox → real Sentinel → canonical Compiler → actual Rholox renderer | PASS | PASS (tampered package rejected) |
| Same complete software path with a missing contract result | BLOCKED | PASS |
| Authorized public dev testnet | BLOCKED | PASS |

## Live observation

- Deploy: `304402203a7a87b2fe2fdb23d583f7f98871979636bd171cf4cb1238d58e0c26ba4f2ae50220592d5a704d5c3bab32b2ed4231b7d8a42ca0efcae31769f2468ebd0cf2023385`
- Inclusion: height 765, hash `d968c7f8b8ffeffef0043a54f9fa10c7f3f75007fe3d54ac7f3f722f096c6a57`.
- Package commitment: `1a029ebd84d1842ad610e013a6dc7ac512f0cdb2a1f119d138776487567883bb`.
- The actual Rholox client observed recipient balance increase from 0 to 100 drops and a matching finalized-block/read-back observation. This is retained as client evidence, not promoted to assurance PASS.
- The node's deploy-status response still returned `deployResult: []`. The selected transfer-execution receipt is unknown. Sentinel therefore preserves execution UNKNOWN and the selected finalized-transfer assurance observation UNAVAILABLE.
- Only the independently checked public gateway endpoint/identity is pinned in the available external policy. The separate four-node aggregate observer feed does not supply independent action evidence or replace the missing observer pins.

**EXTERNAL LIVE BLOCKER:** the authorized test environment does not expose all evidence required by this bounded claim: a usable contract-result receipt and a second independently addressable, operator-approved observer identity/failure-domain pin. The software integration passes the complete synthetic path and refuses to fill these live gaps.

The exact retry/resume commands are in ../../RCHAIN_ASSURANCE_V1.md. Use `--live --resume docs/evidence/rchain-assurance-v1/live/signed-action.json` to observe this same deploy without resubmitting or creating keys. Configure approved Sentinel/observer pins first; after the node exposes the missing result, a new current package can be evaluated under those external pins.

## Dependency review

Compiler's original high-severity findings were brace-expansion (development lint/parser dependency) and source-map-js (PostCSS/@tailwindcss/node, present in the repository production dependency graph). Compatible lockfile fixes resolved both. The exported standalone verifier has no runtime npm dependencies. Repository-wide and production-only audits report zero findings. Rholox's audit also reports zero findings. No broad dependency modernization was performed.
