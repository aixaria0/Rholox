import { validateRevTransferPackage, canonicalAssurance, assuranceDigest, rawAssuranceDigest, assurancePayloadDigest, assuranceReproductionDigest, } from "./rchain-assurance-validation.js";
export function revTransferTerm(to, amount) {
    if (!/^[A-Za-z0-9]{1,128}$/.test(to) || !Number.isSafeInteger(amount) || amount <= 0)
        throw new Error("Invalid REV transfer parameters");
    return `new return, revVault(\`rho:rchain:revVault\`), deployerId(\`rho:rchain:deployerId\`), deployId(\`rho:rchain:deployId\`), resultCh in {\n    revVault!("transfer", *deployerId, "${to}", ${amount}, *resultCh) |\n    for (@result <- resultCh) { return!(result) | deployId!(result) }\n  }`;
}
export function revBalanceTerm(to) {
    if (!/^[A-Za-z0-9]{1,128}$/.test(to))
        throw new Error("Invalid REV recipient");
    return `new return, revVault(\`rho:rchain:revVault\`), balanceCh in { revVault!("getBalance", "${to}", *balanceCh) | for (@balance <- balanceCh) { return!(balance) } }`;
}
const info = (b) => b?.blockInfo ?? b;
const blockHash = (b) => info(b)?.blockHash;
const blockHeight = (b) => info(b)?.blockNumber;
const protocolFields = [
    "blockHash",
    "blockNumber",
    "shardId",
    "sender",
    "seqNum",
    "preStateHash",
    "postStateHash",
    "justifications",
    "bonds",
    "sigAlgorithm",
    "sig",
];
function compareBlock(a, b) {
    let missing = false;
    for (const key of protocolFields) {
        if (!Object.hasOwn(info(a) ?? {}, key) || !Object.hasOwn(info(b) ?? {}, key)) {
            missing = true;
            continue;
        }
        if (canonicalAssurance(info(a)[key]) !== canonicalAssurance(info(b)[key]))
            return false;
    }
    return missing ? undefined : true;
}
const canonicalClass = (match) => match === undefined ? "BLOCKED" : match ? "PASS" : "FAIL";
function trueResult(results) {
    const bool = results?.[0]?.ExprTuple?.ps?.[0]?.ExprBool ?? results?.[0]?.ExprBool;
    return typeof bool === "boolean" ? bool : typeof bool?.data === "boolean" ? bool.data : undefined;
}
const finality = (v) => typeof v === "boolean"
    ? v
    : ["finalized", "isFinalized", "is_finalized", "value"]
        .map((k) => v?.[k])
        .find((x) => typeof x === "boolean");
const balanceValue = (v) => typeof v?.expr?.[0]?.ExprInt === "number" ? v.expr[0].ExprInt : v?.expr?.[0]?.ExprInt?.data;
const parents = (v) => [
    ...(info(v)?.parents ?? []),
    ...(info(v)?.parentsHash ?? []),
    ...(typeof info(v)?.parentHash === "string" ? [info(v).parentHash] : []),
].filter((x) => typeof x === "string");
function ancestry(high, low) {
    const blocks = [high.raw.finalized_block, ...high.raw.ancestry];
    const seen = new Set();
    const pending = [high.hash];
    while (pending.length) {
        const h = pending.pop();
        if (h === low.hash)
            return true;
        if (seen.has(h))
            continue;
        seen.add(h);
        const block = blocks.find((b) => blockHash(b) === h);
        if (!block)
            continue;
        pending.push(...parents(block));
    }
    return false;
}
/** Recompute a bounded claim. Evidence never supplies policy, current time or trust roots. */
export async function verifyRevTransferAssurance(input, policy) {
    const result = {
        verifier: "rchain-rev-transfer-assurance/v1",
        status: "BLOCKED",
        reasons: [],
        checks: {},
        package_digest: null,
        policy_digest: null,
        payload_trust: "UNPINNED",
        agreement: "INSUFFICIENT_EVIDENCE",
        stages: { execution: false, inclusion: false, finalized_state: false, corroborated: false },
    };
    function check(name, status, reason) {
        const prior = result.checks[name];
        if (prior !== "FAIL" && !(prior === "BLOCKED" && status === "PASS"))
            result.checks[name] = status;
        if (status !== "PASS" && reason && !result.reasons.includes(reason))
            result.reasons.push(reason);
    }
    function finish() {
        result.status = Object.values(result.checks).includes("FAIL")
            ? "FAIL"
            : Object.values(result.checks).includes("BLOCKED")
                ? "BLOCKED"
                : "PASS";
        return result;
    }
    const errors = validateRevTransferPackage(input);
    if (errors.length) {
        check("schema", "FAIL", `Invalid evidence contract: ${errors.join("; ")}`);
        return finish();
    }
    check("schema", "PASS");
    const pkg = input;
    try {
        result.package_digest = await assurancePayloadDigest(pkg);
        check("payload_integrity", result.package_digest === pkg.provenance.payload_digest ? "PASS" : "FAIL", "Internal payload digest mismatch");
        check("received_payload_integrity", !policy?.received_payload_digest
            ? "BLOCKED"
            : result.package_digest === policy.received_payload_digest
                ? "PASS"
                : "FAIL", "Received-package digest missing or mismatched (receipt bookkeeping only)");
        const externalPin = policy?.external_payload_digest;
        if (externalPin == null) {
            check("external_payload_pin", "BLOCKED", "Independent reviewer/operator package pin not supplied");
        }
        else if (!/^[0-9a-f]{64}$/.test(externalPin) || externalPin !== result.package_digest) {
            result.payload_trust = "PIN_MISMATCH";
            check("external_payload_pin", "FAIL", "Package differs from the independent reviewer/operator pin");
        }
        else {
            check("external_payload_pin", "PASS");
            if (result.checks.payload_integrity === "PASS" &&
                result.checks.received_payload_integrity === "PASS")
                result.payload_trust = "EXTERNALLY_PINNED";
        }
        if (policy && Object.hasOwn(policy, "expected_payload_digest"))
            check("external_policy", "FAIL", "Ambiguous legacy expected_payload_digest is not an independent pin; migrate policy explicitly");
        const declaredConflict = pkg.agreement.status === "CONFLICT" || pkg.finalized_state.status === "CONFLICT";
        const summaryConflict = pkg.observers.some((a, i) => pkg.observers
            .slice(i + 1)
            .some((b) => a.finalized_height !== null &&
            a.finalized_height === b.finalized_height &&
            a.finalized_hash !== null &&
            b.finalized_hash !== null &&
            a.finalized_hash !== b.finalized_hash));
        if (declaredConflict || summaryConflict) {
            result.agreement = "CONFLICT";
            check("cross_node_agreement", "FAIL", "Finalized/canonical conflict remains a contradiction even without complete trust pins");
        }
        if (pkg.execution.status === "FAILED")
            check("execution", "FAIL", "Producer retains a failed transfer execution");
        for (const [key, status] of Object.entries(pkg.verification))
            if (status === "FAIL")
                check(key, "FAIL", `Producer contradiction: ${key}`);
        if (!policy ||
            !Array.isArray(policy.observers) ||
            policy.observers.length < 2 ||
            !policy.source_revision ||
            !policy.received_payload_digest) {
            check("external_policy", "BLOCKED", "External observer/revision policy or received-package digest is incomplete");
            return finish();
        }
        const requiredStrings = [
            policy?.action_id,
            policy?.deploy_id,
            policy?.claim_id,
            policy?.network_id,
            policy?.shard_id,
            policy?.signer,
            policy?.term,
            policy?.recipient,
            policy?.producer,
            policy?.source_revision,
        ];
        if (policy?.verifier !== result.verifier ||
            requiredStrings.some((s) => typeof s !== "string" || !s.length) ||
            !/^[0-9a-f]{64}$/.test(policy.received_payload_digest) ||
            !Array.isArray(policy.observers) ||
            policy.observers.length < 2 ||
            policy.observers.length > 16 ||
            policy.observers.some((o) => !o ||
                [o.observer_id, o.source, o.node_identity, o.failure_domain].some((s) => typeof s !== "string" || !s.length)) ||
            ![
                policy.now_ms,
                policy.max_age_ms,
                policy.max_future_skew_ms,
                policy.min_observers,
                policy.min_failure_domains,
                policy.recipient_balance_before,
            ].every((n) => Number.isSafeInteger(n) && n >= 0) ||
            policy.max_age_ms <= 0 ||
            policy.min_observers < 2 ||
            policy.min_observers > policy.observers.length ||
            policy.min_failure_domains < 1 ||
            policy.min_failure_domains > policy.min_observers ||
            policy.term !== revTransferTerm(policy.recipient, policy.amount_drops))
            throw new Error("Invalid external policy or unsigned transfer binding");
        for (const field of ["observer_id", "source", "node_identity"])
            if (new Set(policy.observers.map((o) => o[field])).size !== policy.observers.length)
                throw new Error("External policy repeats an observer identity or source");
        result.policy_digest = await assuranceDigest(policy);
        check("external_policy", "PASS");
        check("task_binding", pkg.subject.action_id === policy.action_id && pkg.subject.deploy_id === policy.deploy_id
            ? "PASS"
            : "FAIL", "Task/deploy does not match external selection");
        check("claim_binding", pkg.claim.claim_id === policy.claim_id ? "PASS" : "FAIL", "Claim does not match external selection");
        check("network_identity", pkg.network.network_id === null || pkg.network.shard_id === null
            ? "BLOCKED"
            : pkg.network.network_id === policy.network_id && pkg.network.shard_id === policy.shard_id
                ? "PASS"
                : "FAIL", "Network/shard identity unavailable or mismatched");
        check("producer_binding", pkg.provenance.producer === policy.producer &&
            pkg.provenance.source_revision === policy.source_revision
            ? "PASS"
            : "FAIL", "Unpinned evidence producer/revision");
        const fresh = (time) => time <= policy.now_ms + policy.max_future_skew_ms &&
            time >= policy.now_ms - policy.max_age_ms;
        check("freshness", fresh(pkg.provenance.generated_at) ? "PASS" : "BLOCKED", "Evidence is stale or from the future");
        check("deterministic_reproduction", (await assuranceReproductionDigest(pkg)) === pkg.reproduction_digest ? "PASS" : "FAIL", "Reproduction digest diverges");
        const seen = new Set();
        const observed = [];
        for (const observer of pkg.observers) {
            const pin = policy.observers.find((o) => o.observer_id === observer.observer_id);
            if (!pin || seen.has(observer.observer_id)) {
                check("observer_policy", "FAIL", "Unexpected/duplicate observer");
                continue;
            }
            seen.add(observer.observer_id);
            const { observation_digest, ...data } = observer;
            check("observation_integrity", (await assuranceDigest(data)) === observation_digest ? "PASS" : "FAIL", "Observation digest mismatch");
            check("observer_policy", observer.source === pin.source &&
                observer.failure_domain === pin.failure_domain &&
                (observer.node_identity === null || observer.node_identity === pin.node_identity)
                ? "PASS"
                : "FAIL", "Observer source/identity/domain differs from external pin");
            const raw = { ancestry: [] };
            for (const [key, item] of Object.entries(observer.evidence)) {
                const entries = key === "ancestry" ? item : item ? [item] : [];
                for (const entry of entries) {
                    check("raw_integrity", (await rawAssuranceDigest(entry.body)) === entry.digest ? "PASS" : "FAIL", "Exact observation bytes/digest mismatch");
                    check("freshness", fresh(entry.observed_at) ? "PASS" : "BLOCKED", "Raw observation is stale or from the future");
                    const parsed = JSON.parse(entry.body);
                    if (key === "ancestry") {
                        check("source_binding", entry.path === `/api/block/${blockHash(parsed)}` && entry.request === undefined
                            ? "PASS"
                            : "FAIL", "Ancestry source does not bind to block");
                        raw.ancestry.push(parsed);
                    }
                    else
                        raw[key] = parsed;
                }
            }
            const paths = {
                status: "/api/status",
                deploy: `/api/v1/deploy-status/${policy.deploy_id}`,
                block: `/api/block/${blockHash(raw.deploy?.ProcessedWithSuccess?.block ?? raw.deploy?.ProcessedWithError?.block)}`,
                finalized: "/api/last-finalized-block",
                finalized_block: `/api/block/${blockHash(raw.finalized)}`,
                is_finalized: `/api/is-finalized/${blockHash(raw.deploy?.ProcessedWithSuccess?.block ?? raw.deploy?.ProcessedWithError?.block)}`,
                balance: `/api/explore-deploy?blockHash=${encodeURIComponent(blockHash(raw.finalized) ?? "")}`,
            };
            for (const [key, path] of Object.entries(paths))
                if (observer.evidence[key])
                    check("source_binding", observer.evidence[key].path === path &&
                        (key === "balance"
                            ? observer.evidence[key].request === revBalanceTerm(policy.recipient)
                            : observer.evidence[key].request === undefined)
                        ? "PASS"
                        : "FAIL", "Observation request differs from selected action");
            const identity = raw.status?.node?.id ?? raw.status?.address;
            if (raw.status) {
                check("network_identity", raw.status.networkId == null || raw.status.shardId == null
                    ? "BLOCKED"
                    : raw.status.networkId === policy.network_id && raw.status.shardId === policy.shard_id
                        ? "PASS"
                        : "FAIL", "Observer reports wrong network/shard");
                check("observer_identity", identity == null
                    ? "BLOCKED"
                    : identity === pin.node_identity && identity === observer.node_identity
                        ? "PASS"
                        : "FAIL", "Raw node identity does not match observer pin");
            }
            const hash = blockHash(raw.finalized), height = blockHeight(raw.finalized);
            if (raw.finalized)
                check("canonical_consistency", (hash ?? null) === observer.finalized_hash &&
                    (height ?? null) === observer.finalized_height
                    ? "PASS"
                    : "FAIL", "Finalized summary differs from raw evidence");
            for (const b of [raw.block, raw.finalized, raw.finalized_block, ...raw.ancestry].filter(Boolean))
                check("network_identity", info(b)?.shardId == null
                    ? "BLOCKED"
                    : info(b).shardId === policy.shard_id
                        ? "PASS"
                        : "FAIL", "Block shard does not match expected shard");
            const processed = raw.deploy?.ProcessedWithSuccess;
            const includedBlock = processed?.block ?? raw.deploy?.ProcessedWithError?.block;
            const entry = raw.block?.deploys?.find((d) => d.sig === policy.deploy_id);
            const included = !!entry &&
                !!includedBlock &&
                !!blockHash(includedBlock) &&
                Number.isSafeInteger(blockHeight(includedBlock));
            if (entry)
                check("signed_action_binding", entry.term === policy.term &&
                    entry.deployer === policy.signer &&
                    entry.sig === policy.deploy_id
                    ? "PASS"
                    : "FAIL", "Canonical deploy does not match signed transfer");
            if (raw.block && includedBlock)
                check("canonical_consistency", canonicalClass(compareBlock(includedBlock, raw.block)), "Included/canonical representation mismatch");
            if (raw.finalized && raw.finalized_block)
                check("canonical_consistency", canonicalClass(compareBlock(raw.finalized, raw.finalized_block)), "Finalized/canonical representation mismatch");
            const returned = trueResult(processed?.deployResult);
            if (raw.deploy?.ProcessedWithError || returned === false || entry?.errored === true)
                check("execution", "FAIL", "Transfer execution or contract result failed");
            const executed = included && returned === true && entry.errored === false;
            if (raw.is_finalized && finality(raw.is_finalized) === false)
                check("finalized_state_observation", "BLOCKED", "Node has not finalized the included action");
            if (raw.balance?.block && raw.finalized_block && blockHash(raw.balance.block) === hash) {
                check("canonical_consistency", canonicalClass(compareBlock(raw.balance.block, raw.finalized_block)), "Finalized read-back block metadata differs from canonical block");
            }
            const balance = balanceValue(raw.balance);
            const readback = executed &&
                finality(raw.is_finalized) === true &&
                !!raw.finalized_block &&
                hash !== undefined &&
                blockHash(raw.balance?.block) === hash &&
                blockHeight(raw.balance?.block) === height &&
                compareBlock(raw.finalized, raw.finalized_block) &&
                Number.isSafeInteger(balance) &&
                balance >= policy.recipient_balance_before + policy.amount_drops;
            const current = fresh(observer.observed_at) && observer.status === "OBSERVED" && !!raw.status;
            if (!current)
                check("freshness", "BLOCKED", "Required observer unavailable or stale");
            observed.push({
                id: observer.observer_id,
                hash,
                height,
                raw,
                included,
                executed,
                readback,
                current,
                domain: pin.failure_domain,
                block: includedBlock,
            });
        }
        if (policy.observers.some((pin) => !seen.has(pin.observer_id)))
            check("observer_policy", "BLOCKED", "Required observer evidence missing");
        let conflict = false, skew = false, lag = false;
        for (let i = 0; i < observed.length; i++)
            for (const b of observed.slice(i + 1)) {
                const a = observed[i];
                if (a.height === undefined || b.height === undefined || !a.hash || !b.hash)
                    continue;
                if (a.height === b.height && a.hash !== b.hash)
                    conflict = true;
                if (a.height !== b.height) {
                    lag = true;
                    const [low, high] = a.height < b.height ? [a, b] : [b, a];
                    if (!ancestry(high, low))
                        skew = true;
                }
            }
        const comparable = observed.filter((o) => o.raw.status &&
            o.hash &&
            Number.isSafeInteger(o.height) &&
            pkg.observers.find((p) => p.observer_id === o.id)?.status === "OBSERVED");
        result.agreement =
            conflict || declaredConflict || summaryConflict
                ? "CONFLICT"
                : Object.values(result.checks).includes("FAIL") && pkg.agreement.status === "CONFLICT"
                    ? "CONFLICT"
                    : comparable.length < policy.observers.length
                        ? "INSUFFICIENT_EVIDENCE"
                        : skew
                            ? "HEIGHT_SKEW"
                            : lag
                                ? "PROVEN_LAG"
                                : comparable.length >= 2
                                    ? "EXACT_AGREEMENT"
                                    : "INSUFFICIENT_EVIDENCE";
        check("cross_node_agreement", conflict
            ? "FAIL"
            : ["EXACT_AGREEMENT", "PROVEN_LAG"].includes(result.agreement) &&
                comparable.length >= policy.min_observers &&
                new Set(comparable.map((o) => o.domain)).size >= policy.min_failure_domains
                ? "PASS"
                : "BLOCKED", conflict
            ? "Same-height conflicting finalized hashes"
            : "Insufficient compatible independent observer evidence");
        check("canonical_consistency", observed.every((o) => o.raw.block && o.raw.finalized_block) && observed.length
            ? "PASS"
            : "BLOCKED", "Canonical evidence unavailable");
        if (result.agreement !== "INSUFFICIENT_EVIDENCE" && pkg.agreement.status !== result.agreement)
            check("deterministic_reproduction", "FAIL", "Producer agreement differs from recomputed agreement");
        const included = observed.find((o) => o.included), executed = observed.find((o) => o.executed), finalized = observed.find((o) => o.readback);
        result.stages = {
            inclusion: !!included,
            execution: !!executed,
            finalized_state: !!finalized,
            corroborated: result.checks.cross_node_agreement === "PASS",
        };
        for (const [key, fact] of [
            ["inclusion", included],
            ["execution", executed],
        ]) {
            const declared = pkg[key];
            if (declared.status === "OBSERVED")
                check("deterministic_reproduction", fact &&
                    declared.block_hash === blockHash(fact.block) &&
                    declared.block_height === blockHeight(fact.block)
                    ? "PASS"
                    : "FAIL", `Unsupported ${key} summary`);
            check(key, fact && declared.status === "OBSERVED" ? "PASS" : "BLOCKED", `${key} evidence unavailable`);
        }
        if (pkg.finalized_state.status === "OBSERVED")
            check("deterministic_reproduction", finalized &&
                pkg.finalized_state.finalized_block_hash === finalized.hash &&
                pkg.finalized_state.finalized_block_height === finalized.height
                ? "PASS"
                : "FAIL", "Unsupported finalized-state summary");
        check("finalized_state_observation", observed.length >= policy.min_observers &&
            observed.every((o) => o.current && o.readback) &&
            pkg.finalized_state.status === "OBSERVED"
            ? "PASS"
            : "BLOCKED", "Finalized transfer read-back unavailable or insufficient");
        if (pkg.finalized_state.status === "CONFLICT" || pkg.agreement.status === "CONFLICT")
            check("cross_node_agreement", "FAIL", "Producer retains a conflict");
        for (const [key, status] of Object.entries(pkg.verification))
            if (status === "FAIL")
                check(key, "FAIL", `Producer contradiction: ${key}`);
    }
    catch (error) {
        check("deterministic_reproduction", "FAIL", error instanceof Error ? error.message : "Malformed evidence");
    }
    return finish();
}
