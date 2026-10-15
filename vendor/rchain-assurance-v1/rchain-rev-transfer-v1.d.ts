export interface RevTransferPolicy {
    verifier: "rchain-rev-transfer-assurance/v1";
    action_id: string;
    deploy_id: string;
    claim_id: string;
    network_id: string;
    shard_id: string;
    signer: string;
    term: string;
    recipient: string;
    amount_drops: number;
    recipient_balance_before: number;
    now_ms: number;
    max_age_ms: number;
    max_future_skew_ms: number;
    min_observers: number;
    min_failure_domains: number;
    observers: {
        observer_id: string;
        source: string;
        node_identity: string;
        failure_domain: string;
    }[];
    producer: string;
    source_revision: string;
    expected_payload_digest: string;
}
export type AssuranceClass = "PASS" | "BLOCKED" | "FAIL";
export interface RevTransferVerdict {
    verifier: "rchain-rev-transfer-assurance/v1";
    status: AssuranceClass;
    reasons: string[];
    checks: Record<string, AssuranceClass>;
    package_digest: string | null;
    policy_digest: string | null;
    agreement: string;
    stages: {
        execution: boolean;
        inclusion: boolean;
        finalized_state: boolean;
        corroborated: boolean;
    };
}
export declare function revTransferTerm(to: string, amount: number): string;
export declare function revBalanceTerm(to: string): string;
/** Recompute a bounded claim. Evidence never supplies policy, current time or trust roots. */
export declare function verifyRevTransferAssurance(input: unknown, policy: RevTransferPolicy): Promise<RevTransferVerdict>;
