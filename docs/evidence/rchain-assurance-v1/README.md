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

## Read-only live resume

The same signed deploy was observed again with Sentinel `5ecc4a185f20fb5e5964831057305869acb65dc2`; no keys, faucet request or transfer submission were created. Exact evidence is in [live-resume-20261015](live-resume-20261015). Inclusion remains height 765. The observer reported finalized height 771, hash `8f3fb55fe7341f4cb72dbc8e88192f20a6517e59601b438a241e32ee3f4d7ffb`, with observation digest `9d908a9c962e2b23931288a3e4a8be5146332e5dfd4e81fb955917444fa82e3c`.

The new package commitment is `a281346a659f3aab7c60c6db363e7294d931255cecb2f3d55e3db08492fc4788`. The canonical verifier returned BLOCKED and its tampered-package negative control passed. The same external receipt/independent-observer evidence gap remains. All original evidence files and historical verification results are unchanged. [RECOVERY.json](RECOVERY.json) records recovered revisions and final source validation.

## Dependency review

Compiler's original high-severity findings were brace-expansion (development lint/parser dependency) and source-map-js (PostCSS/@tailwindcss/node, present in the repository production dependency graph). Compatible lockfile fixes resolved both. The exported standalone verifier has no runtime npm dependencies. Repository-wide and production-only audits report zero findings. Rholox's audit also reports zero findings. No broad dependency modernization was performed.
