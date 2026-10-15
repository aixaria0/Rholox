// Generated from contracts/rchain-assurance/v1.schema.json; do not edit.
export const rchainAssuranceSchema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "rchain-assurance/v1",
    type: "object",
    additionalProperties: false,
    properties: {
        version: {
            const: "rchain-assurance/v1",
        },
        subject: {
            type: "object",
            additionalProperties: false,
            properties: {
                action_type: {
                    const: "REV_TRANSFER",
                },
                action_id: {
                    type: "string",
                    minLength: 1,
                    maxLength: 2048,
                },
                deploy_id: {
                    type: "string",
                    minLength: 1,
                    maxLength: 2048,
                },
            },
            required: ["action_type", "action_id", "deploy_id"],
        },
        network: {
            type: "object",
            additionalProperties: false,
            properties: {
                network_id: {
                    anyOf: [
                        {
                            type: "string",
                            minLength: 1,
                            maxLength: 2048,
                        },
                        {
                            type: "null",
                        },
                    ],
                },
                shard_id: {
                    anyOf: [
                        {
                            type: "string",
                            minLength: 1,
                            maxLength: 2048,
                        },
                        {
                            type: "null",
                        },
                    ],
                },
            },
            required: ["network_id", "shard_id"],
        },
        submission: {
            type: "object",
            additionalProperties: false,
            properties: {
                status: {
                    enum: ["UNKNOWN", "OBSERVED", "SUBMITTED"],
                },
                signer: {
                    type: "string",
                    minLength: 1,
                    maxLength: 2048,
                },
                submitted_at: {
                    type: "integer",
                    minimum: 0,
                    maximum: 9007199254740991,
                },
                reason: {
                    type: "string",
                    minLength: 1,
                    maxLength: 2048,
                },
            },
            required: ["status"],
        },
        execution: {
            type: "object",
            additionalProperties: false,
            properties: {
                status: {
                    enum: ["UNKNOWN", "OBSERVED", "FAILED", "UNAVAILABLE"],
                },
                observed_at: {
                    type: "integer",
                    minimum: 0,
                    maximum: 9007199254740991,
                },
                block_hash: {
                    type: "string",
                    minLength: 1,
                    maxLength: 2048,
                },
                block_height: {
                    type: "integer",
                    minimum: 0,
                    maximum: 9007199254740991,
                },
                reason: {
                    type: "string",
                    minLength: 1,
                    maxLength: 2048,
                },
            },
            required: ["status"],
        },
        inclusion: {
            type: "object",
            additionalProperties: false,
            properties: {
                status: {
                    enum: ["UNKNOWN", "OBSERVED", "FAILED", "UNAVAILABLE"],
                },
                observed_at: {
                    type: "integer",
                    minimum: 0,
                    maximum: 9007199254740991,
                },
                block_hash: {
                    type: "string",
                    minLength: 1,
                    maxLength: 2048,
                },
                block_height: {
                    type: "integer",
                    minimum: 0,
                    maximum: 9007199254740991,
                },
                reason: {
                    type: "string",
                    minLength: 1,
                    maxLength: 2048,
                },
            },
            required: ["status"],
        },
        finalized_state: {
            type: "object",
            additionalProperties: false,
            properties: {
                status: {
                    enum: ["UNKNOWN", "UNAVAILABLE", "OBSERVED", "CONFLICT"],
                },
                observed_at: {
                    type: "integer",
                    minimum: 0,
                    maximum: 9007199254740991,
                },
                finalized_block_hash: {
                    type: "string",
                    minLength: 1,
                    maxLength: 2048,
                },
                finalized_block_height: {
                    type: "integer",
                    minimum: 0,
                    maximum: 9007199254740991,
                },
                reason: {
                    type: "string",
                    minLength: 1,
                    maxLength: 2048,
                },
            },
            required: ["status"],
        },
        observers: {
            type: "array",
            maxItems: 16,
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    observer_id: {
                        type: "string",
                        minLength: 1,
                        maxLength: 2048,
                    },
                    node_identity: {
                        anyOf: [
                            {
                                type: "string",
                                minLength: 1,
                                maxLength: 2048,
                            },
                            {
                                type: "null",
                            },
                        ],
                    },
                    source: {
                        type: "string",
                        minLength: 1,
                        maxLength: 2048,
                    },
                    failure_domain: {
                        anyOf: [
                            {
                                type: "string",
                                minLength: 1,
                                maxLength: 2048,
                            },
                            {
                                type: "null",
                            },
                        ],
                    },
                    observed_at: {
                        type: "integer",
                        minimum: 0,
                        maximum: 9007199254740991,
                    },
                    finalized_height: {
                        anyOf: [
                            {
                                type: "integer",
                                minimum: 0,
                                maximum: 9007199254740991,
                            },
                            {
                                type: "null",
                            },
                        ],
                    },
                    finalized_hash: {
                        anyOf: [
                            {
                                type: "string",
                                minLength: 1,
                                maxLength: 2048,
                            },
                            {
                                type: "null",
                            },
                        ],
                    },
                    observation_digest: {
                        type: "string",
                        pattern: "^[0-9a-f]{64}$",
                    },
                    status: {
                        enum: ["OBSERVED", "UNAVAILABLE", "STALE", "CONFLICT"],
                    },
                    reason: {
                        anyOf: [
                            {
                                type: "string",
                                minLength: 1,
                                maxLength: 2048,
                            },
                            {
                                type: "null",
                            },
                        ],
                    },
                    evidence: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            status: {
                                anyOf: [
                                    {
                                        $ref: "#/$defs/raw",
                                    },
                                    {
                                        type: "null",
                                    },
                                ],
                            },
                            deploy: {
                                anyOf: [
                                    {
                                        $ref: "#/$defs/raw",
                                    },
                                    {
                                        type: "null",
                                    },
                                ],
                            },
                            block: {
                                anyOf: [
                                    {
                                        $ref: "#/$defs/raw",
                                    },
                                    {
                                        type: "null",
                                    },
                                ],
                            },
                            finalized: {
                                anyOf: [
                                    {
                                        $ref: "#/$defs/raw",
                                    },
                                    {
                                        type: "null",
                                    },
                                ],
                            },
                            finalized_block: {
                                anyOf: [
                                    {
                                        $ref: "#/$defs/raw",
                                    },
                                    {
                                        type: "null",
                                    },
                                ],
                            },
                            is_finalized: {
                                anyOf: [
                                    {
                                        $ref: "#/$defs/raw",
                                    },
                                    {
                                        type: "null",
                                    },
                                ],
                            },
                            balance: {
                                anyOf: [
                                    {
                                        $ref: "#/$defs/raw",
                                    },
                                    {
                                        type: "null",
                                    },
                                ],
                            },
                            ancestry: {
                                type: "array",
                                maxItems: 64,
                                items: {
                                    $ref: "#/$defs/raw",
                                },
                            },
                        },
                        required: [
                            "status",
                            "deploy",
                            "block",
                            "finalized",
                            "finalized_block",
                            "is_finalized",
                            "balance",
                            "ancestry",
                        ],
                    },
                },
                required: [
                    "observer_id",
                    "node_identity",
                    "source",
                    "failure_domain",
                    "observed_at",
                    "finalized_height",
                    "finalized_hash",
                    "observation_digest",
                    "status",
                    "reason",
                    "evidence",
                ],
            },
        },
        agreement: {
            type: "object",
            additionalProperties: false,
            properties: {
                status: {
                    enum: [
                        "EXACT_AGREEMENT",
                        "PROVEN_LAG",
                        "HEIGHT_SKEW",
                        "CONFLICT",
                        "INSUFFICIENT_EVIDENCE",
                    ],
                },
            },
            required: ["status"],
        },
        claim: {
            type: "object",
            additionalProperties: false,
            properties: {
                claim_id: {
                    type: "string",
                    minLength: 1,
                    maxLength: 2048,
                },
                claim_type: {
                    const: "REV_TRANSFER_FINALIZED",
                },
            },
            required: ["claim_id", "claim_type"],
        },
        verification: {
            type: "object",
            additionalProperties: false,
            properties: {
                payload_integrity: {
                    enum: ["UNKNOWN", "PASS", "BLOCKED", "FAIL"],
                },
                network_identity: {
                    enum: ["UNKNOWN", "PASS", "BLOCKED", "FAIL"],
                },
                canonical_consistency: {
                    enum: ["UNKNOWN", "PASS", "BLOCKED", "FAIL"],
                },
                cross_node_agreement: {
                    enum: ["UNKNOWN", "PASS", "BLOCKED", "FAIL"],
                },
                finalized_state_observation: {
                    enum: ["UNKNOWN", "PASS", "BLOCKED", "FAIL"],
                },
                deterministic_reproduction: {
                    enum: ["UNKNOWN", "PASS", "BLOCKED", "FAIL"],
                },
            },
            required: [
                "payload_integrity",
                "network_identity",
                "canonical_consistency",
                "cross_node_agreement",
                "finalized_state_observation",
                "deterministic_reproduction",
            ],
        },
        reproduction_digest: {
            type: "string",
            pattern: "^[0-9a-f]{64}$",
        },
        provenance: {
            type: "object",
            additionalProperties: false,
            properties: {
                producer: {
                    type: "string",
                    minLength: 1,
                    maxLength: 2048,
                },
                source_revision: {
                    type: "string",
                    minLength: 1,
                    maxLength: 2048,
                },
                payload_digest: {
                    type: "string",
                    pattern: "^[0-9a-f]{64}$",
                },
                generated_at: {
                    type: "integer",
                    minimum: 0,
                    maximum: 9007199254740991,
                },
            },
            required: ["producer", "source_revision", "payload_digest", "generated_at"],
        },
    },
    required: [
        "version",
        "subject",
        "network",
        "submission",
        "execution",
        "inclusion",
        "finalized_state",
        "observers",
        "agreement",
        "claim",
        "verification",
        "reproduction_digest",
        "provenance",
    ],
    $defs: {
        raw: {
            type: "object",
            additionalProperties: false,
            properties: {
                path: {
                    type: "string",
                    minLength: 1,
                    maxLength: 2048,
                },
                request: {
                    type: "string",
                    minLength: 1,
                    maxLength: 2000000,
                },
                body: {
                    type: "string",
                    minLength: 1,
                    maxLength: 2000000,
                },
                digest: {
                    type: "string",
                    pattern: "^[0-9a-f]{64}$",
                },
                observed_at: {
                    type: "integer",
                    minimum: 0,
                    maximum: 9007199254740991,
                },
            },
            required: ["path", "body", "digest", "observed_at"],
        },
    },
};
