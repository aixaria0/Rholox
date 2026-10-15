# RChain Assurance v1

REV Transfer retains the exact public signed deploy and submission acknowledgment even if later polling fails. Execution, canonical inclusion, finalized-state observation, observer agreement and the deterministic verdict are shown separately. WHY THIS ACTION? is derived from these structured states. Explorer can observe a selected deploy; it stays BLOCKED without this session's independent signed action context and pre-transfer balance.

The existing Network, Wallet, Proof, Explorer, REV Transfer, Asset Lab and Exchange surfaces remain available. An unavailable write gateway can coexist with a live observation plane (DEGRADED). An unavailable assurance plane does not disable transfer signing/submission. No policy configuration means WAITING/BLOCKED, never PASS. No observer count establishes independent stake-weighted Casper finality.

The former REV term replaced every Vault response with true. The canonical v1 term now forwards the actual Vault result to both the first private return channel and the deploy identity channel. A read-only test established that consuming the first private reply leaves the node result empty; retaining it makes the actual result observable. The client no longer labels height-only balance read-back as verified finality; the matching finalized hash and explicit inclusion-block finality assertion are required. Those observations still require the separate assurance verifier and external trust policy.

## Deployment pins

`public/rchain-assurance-policy.json` is operator configuration shipped with Rholox. It is deliberately unconfigured until approved Sentinel and independently addressable RNode observers are available. It is never obtained from an evidence package. Configure `sentinel_url` (HTTPS or loopback), exact `source_revision`, network/shard, and at least two observer entries:

```json
{
  "observer_id": "https://approved-node.example",
  "source": "https://approved-node.example",
  "node_identity": "the independently checked /api/status node.id or address",
  "failure_domain": "operator-selected-domain"
}
```

Do not count aliases of one node as separate observers. Failure domains must come from operator knowledge. Match Sentinel's `RCHAIN_RNODE_URLS` and `RCHAIN_ASSURANCE_FAILURE_DOMAINS` in order. Set `RCHAIN_SENTINEL_REVISION` to Sentinel's deployed commit SHA. Serve Sentinel with the existing approved test infrastructure; these draft PRs do not deploy or change infrastructure.

The expected package commitment is computed from the response received over this operator-pinned transport. It is not copied from the package's self-declared digest. This is trust in the configured producer/transport, not proof that its observations are truthful.

The verifier in `vendor/rchain-assurance-v1` is generated from the canonical RCHAIN-COMPLIER implementation. SOURCE.json pins its revision and file digests; `npm run test:assurance` checks drift. Update it only by running Compiler's `node scripts/export-rchain-assurance.mjs ../Rholox/vendor/rchain-assurance-v1`, then review the pin changes.

## Reproducible integration

Build the authorized Sentinel checkout:

```sh
cd ../rchain-sentinel/backend
cargo build --locked
cd ../../Rholox
SENTINEL_BIN=../rchain-sentinel/backend/target/debug/rchain-sentinel node scripts/test-assurance-e2e.mjs
```

This starts two loopback synthetic RNode fixtures and the real Sentinel binary, runs the actual Rholox signing/submission modules, retains deploy identity, obtains canonical assurance evidence, executes the canonical Compiler verifier and renders the real Rholox evidence component. A raw-byte tamper must return FAIL. It does not claim to execute Rholang or prove external execution. Output defaults to `/tmp/rchain-assurance-e2e`.

For the final authorized live proof, configure the approved testnet observers as above, run Sentinel locally on port 18181, then:

```sh
ASSURANCE_LIVE_POLICY=public/rchain-assurance-policy.json \
ASSURANCE_SENTINEL_URL=http://127.0.0.1:18181 \
ASSURANCE_SENTINEL_REVISION=$(git -C ../rchain-sentinel rev-parse HEAD) \
node scripts/test-assurance-e2e.mjs --live
```

Live mode refuses any gateway other than the existing hardcoded public testnet unless source code is changed, and checks `networkId=testnet` and `devMode=true` before creating ephemeral test keys, requesting test faucet funding and submitting one tiny REV transfer. Private keys remain in process memory. Evidence includes public signed bytes, deploy/block identities, exact raw responses, observer/package digests, source pins, policy, rendered HTML and the tamper verdict. No production keys or mainnet paths exist in this runner. With fewer than two external observer pins, the live verdict is BLOCKED and the exact missing infrastructure is recorded.

An omitted contract result does not erase inclusion or disable observation of an existing action. The assurance execution/claim remains UNKNOWN/BLOCKED even if the client later observes a recipient balance. The synthetic integration also tests this exact negative case (`ASSURANCE_MOCK_EMPTY_RESULT=1`).

Refresh an already signed live action without requesting faucet funds, creating keys, or resubmitting:

```sh
ASSURANCE_OUTPUT=/tmp/rchain-assurance-live-resume \
ASSURANCE_SENTINEL_URL=http://127.0.0.1:18181 \
ASSURANCE_SENTINEL_REVISION=$(git -C ../rchain-sentinel rev-parse HEAD) \
ASSURANCE_LIVE_POLICY=public/rchain-assurance-policy.json \
node scripts/test-assurance-e2e.mjs --live --resume docs/evidence/rchain-assurance-v1/live/signed-action.json
```

The producer explicitly requests the observed finalized hash for balance read-back. The node response is compared to that exact canonical block even when the node ignores the query parameter; a different returned block leaves the state unavailable.

To repeat only the retained one-observer observation with the currently approved public test endpoint, start Sentinel in a separate terminal:

```sh
cd ../rchain-sentinel/backend
PORT=18181 \
RCHAIN_RNODE_URL=https://testnet.rhobot.net \
RCHAIN_RNODE_URLS=https://testnet.rhobot.net \
RCHAIN_ASSURANCE_FAILURE_DOMAINS=public-testnet-gateway \
RCHAIN_SENTINEL_REVISION=$(git rev-parse HEAD) \
cargo run --locked
```

From Rholox, run the resume command above with `ASSURANCE_LIVE_POLICY=docs/evidence/rchain-assurance-v1/live/policy.json`. That historical policy independently retains the approved observer identity; the command overrides its producer revision and uses a current freshness time. This observation remains BLOCKED until the authorized environment supplies a usable transfer-result receipt and the operator configures a second approved independent observer. Save the new output outside the retained original evidence directory.
