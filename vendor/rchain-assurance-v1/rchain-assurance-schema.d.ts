export declare const rchainAssuranceSchema: {
    readonly $schema: "http://json-schema.org/draft-07/schema#";
    readonly $id: "rchain-assurance/v1";
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly version: {
            readonly const: "rchain-assurance/v1";
        };
        readonly subject: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly action_type: {
                    readonly const: "REV_TRANSFER";
                };
                readonly action_id: {
                    readonly type: "string";
                    readonly minLength: 1;
                    readonly maxLength: 2048;
                };
                readonly deploy_id: {
                    readonly type: "string";
                    readonly minLength: 1;
                    readonly maxLength: 2048;
                };
            };
            readonly required: readonly ["action_type", "action_id", "deploy_id"];
        };
        readonly network: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly network_id: {
                    readonly anyOf: readonly [{
                        readonly type: "string";
                        readonly minLength: 1;
                        readonly maxLength: 2048;
                    }, {
                        readonly type: "null";
                    }];
                };
                readonly shard_id: {
                    readonly anyOf: readonly [{
                        readonly type: "string";
                        readonly minLength: 1;
                        readonly maxLength: 2048;
                    }, {
                        readonly type: "null";
                    }];
                };
            };
            readonly required: readonly ["network_id", "shard_id"];
        };
        readonly submission: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly status: {
                    readonly enum: readonly ["UNKNOWN", "OBSERVED", "SUBMITTED"];
                };
                readonly signer: {
                    readonly type: "string";
                    readonly minLength: 1;
                    readonly maxLength: 2048;
                };
                readonly submitted_at: {
                    readonly type: "integer";
                    readonly minimum: 0;
                    readonly maximum: 9007199254740991;
                };
                readonly reason: {
                    readonly type: "string";
                    readonly minLength: 1;
                    readonly maxLength: 2048;
                };
            };
            readonly required: readonly ["status"];
        };
        readonly execution: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly status: {
                    readonly enum: readonly ["UNKNOWN", "OBSERVED", "FAILED", "UNAVAILABLE"];
                };
                readonly observed_at: {
                    readonly type: "integer";
                    readonly minimum: 0;
                    readonly maximum: 9007199254740991;
                };
                readonly block_hash: {
                    readonly type: "string";
                    readonly minLength: 1;
                    readonly maxLength: 2048;
                };
                readonly block_height: {
                    readonly type: "integer";
                    readonly minimum: 0;
                    readonly maximum: 9007199254740991;
                };
                readonly reason: {
                    readonly type: "string";
                    readonly minLength: 1;
                    readonly maxLength: 2048;
                };
            };
            readonly required: readonly ["status"];
        };
        readonly inclusion: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly status: {
                    readonly enum: readonly ["UNKNOWN", "OBSERVED", "FAILED", "UNAVAILABLE"];
                };
                readonly observed_at: {
                    readonly type: "integer";
                    readonly minimum: 0;
                    readonly maximum: 9007199254740991;
                };
                readonly block_hash: {
                    readonly type: "string";
                    readonly minLength: 1;
                    readonly maxLength: 2048;
                };
                readonly block_height: {
                    readonly type: "integer";
                    readonly minimum: 0;
                    readonly maximum: 9007199254740991;
                };
                readonly reason: {
                    readonly type: "string";
                    readonly minLength: 1;
                    readonly maxLength: 2048;
                };
            };
            readonly required: readonly ["status"];
        };
        readonly finalized_state: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly status: {
                    readonly enum: readonly ["UNKNOWN", "UNAVAILABLE", "OBSERVED", "CONFLICT"];
                };
                readonly observed_at: {
                    readonly type: "integer";
                    readonly minimum: 0;
                    readonly maximum: 9007199254740991;
                };
                readonly finalized_block_hash: {
                    readonly type: "string";
                    readonly minLength: 1;
                    readonly maxLength: 2048;
                };
                readonly finalized_block_height: {
                    readonly type: "integer";
                    readonly minimum: 0;
                    readonly maximum: 9007199254740991;
                };
                readonly reason: {
                    readonly type: "string";
                    readonly minLength: 1;
                    readonly maxLength: 2048;
                };
            };
            readonly required: readonly ["status"];
        };
        readonly observers: {
            readonly type: "array";
            readonly maxItems: 16;
            readonly items: {
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly observer_id: {
                        readonly type: "string";
                        readonly minLength: 1;
                        readonly maxLength: 2048;
                    };
                    readonly node_identity: {
                        readonly anyOf: readonly [{
                            readonly type: "string";
                            readonly minLength: 1;
                            readonly maxLength: 2048;
                        }, {
                            readonly type: "null";
                        }];
                    };
                    readonly source: {
                        readonly type: "string";
                        readonly minLength: 1;
                        readonly maxLength: 2048;
                    };
                    readonly failure_domain: {
                        readonly anyOf: readonly [{
                            readonly type: "string";
                            readonly minLength: 1;
                            readonly maxLength: 2048;
                        }, {
                            readonly type: "null";
                        }];
                    };
                    readonly observed_at: {
                        readonly type: "integer";
                        readonly minimum: 0;
                        readonly maximum: 9007199254740991;
                    };
                    readonly finalized_height: {
                        readonly anyOf: readonly [{
                            readonly type: "integer";
                            readonly minimum: 0;
                            readonly maximum: 9007199254740991;
                        }, {
                            readonly type: "null";
                        }];
                    };
                    readonly finalized_hash: {
                        readonly anyOf: readonly [{
                            readonly type: "string";
                            readonly minLength: 1;
                            readonly maxLength: 2048;
                        }, {
                            readonly type: "null";
                        }];
                    };
                    readonly observation_digest: {
                        readonly type: "string";
                        readonly pattern: "^[0-9a-f]{64}$";
                    };
                    readonly status: {
                        readonly enum: readonly ["OBSERVED", "UNAVAILABLE", "STALE", "CONFLICT"];
                    };
                    readonly reason: {
                        readonly anyOf: readonly [{
                            readonly type: "string";
                            readonly minLength: 1;
                            readonly maxLength: 2048;
                        }, {
                            readonly type: "null";
                        }];
                    };
                    readonly evidence: {
                        readonly type: "object";
                        readonly additionalProperties: false;
                        readonly properties: {
                            readonly status: {
                                readonly anyOf: readonly [{
                                    readonly $ref: "#/$defs/raw";
                                }, {
                                    readonly type: "null";
                                }];
                            };
                            readonly deploy: {
                                readonly anyOf: readonly [{
                                    readonly $ref: "#/$defs/raw";
                                }, {
                                    readonly type: "null";
                                }];
                            };
                            readonly block: {
                                readonly anyOf: readonly [{
                                    readonly $ref: "#/$defs/raw";
                                }, {
                                    readonly type: "null";
                                }];
                            };
                            readonly finalized: {
                                readonly anyOf: readonly [{
                                    readonly $ref: "#/$defs/raw";
                                }, {
                                    readonly type: "null";
                                }];
                            };
                            readonly finalized_block: {
                                readonly anyOf: readonly [{
                                    readonly $ref: "#/$defs/raw";
                                }, {
                                    readonly type: "null";
                                }];
                            };
                            readonly is_finalized: {
                                readonly anyOf: readonly [{
                                    readonly $ref: "#/$defs/raw";
                                }, {
                                    readonly type: "null";
                                }];
                            };
                            readonly balance: {
                                readonly anyOf: readonly [{
                                    readonly $ref: "#/$defs/raw";
                                }, {
                                    readonly type: "null";
                                }];
                            };
                            readonly ancestry: {
                                readonly type: "array";
                                readonly maxItems: 64;
                                readonly items: {
                                    readonly $ref: "#/$defs/raw";
                                };
                            };
                        };
                        readonly required: readonly ["status", "deploy", "block", "finalized", "finalized_block", "is_finalized", "balance", "ancestry"];
                    };
                };
                readonly required: readonly ["observer_id", "node_identity", "source", "failure_domain", "observed_at", "finalized_height", "finalized_hash", "observation_digest", "status", "reason", "evidence"];
            };
        };
        readonly agreement: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly status: {
                    readonly enum: readonly ["EXACT_AGREEMENT", "PROVEN_LAG", "HEIGHT_SKEW", "CONFLICT", "INSUFFICIENT_EVIDENCE"];
                };
            };
            readonly required: readonly ["status"];
        };
        readonly claim: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly claim_id: {
                    readonly type: "string";
                    readonly minLength: 1;
                    readonly maxLength: 2048;
                };
                readonly claim_type: {
                    readonly const: "REV_TRANSFER_FINALIZED";
                };
            };
            readonly required: readonly ["claim_id", "claim_type"];
        };
        readonly verification: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly payload_integrity: {
                    readonly enum: readonly ["UNKNOWN", "PASS", "BLOCKED", "FAIL"];
                };
                readonly network_identity: {
                    readonly enum: readonly ["UNKNOWN", "PASS", "BLOCKED", "FAIL"];
                };
                readonly canonical_consistency: {
                    readonly enum: readonly ["UNKNOWN", "PASS", "BLOCKED", "FAIL"];
                };
                readonly cross_node_agreement: {
                    readonly enum: readonly ["UNKNOWN", "PASS", "BLOCKED", "FAIL"];
                };
                readonly finalized_state_observation: {
                    readonly enum: readonly ["UNKNOWN", "PASS", "BLOCKED", "FAIL"];
                };
                readonly deterministic_reproduction: {
                    readonly enum: readonly ["UNKNOWN", "PASS", "BLOCKED", "FAIL"];
                };
            };
            readonly required: readonly ["payload_integrity", "network_identity", "canonical_consistency", "cross_node_agreement", "finalized_state_observation", "deterministic_reproduction"];
        };
        readonly reproduction_digest: {
            readonly type: "string";
            readonly pattern: "^[0-9a-f]{64}$";
        };
        readonly provenance: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly producer: {
                    readonly type: "string";
                    readonly minLength: 1;
                    readonly maxLength: 2048;
                };
                readonly source_revision: {
                    readonly type: "string";
                    readonly minLength: 1;
                    readonly maxLength: 2048;
                };
                readonly payload_digest: {
                    readonly type: "string";
                    readonly pattern: "^[0-9a-f]{64}$";
                };
                readonly generated_at: {
                    readonly type: "integer";
                    readonly minimum: 0;
                    readonly maximum: 9007199254740991;
                };
            };
            readonly required: readonly ["producer", "source_revision", "payload_digest", "generated_at"];
        };
    };
    readonly required: readonly ["version", "subject", "network", "submission", "execution", "inclusion", "finalized_state", "observers", "agreement", "claim", "verification", "reproduction_digest", "provenance"];
    readonly $defs: {
        readonly raw: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly path: {
                    readonly type: "string";
                    readonly minLength: 1;
                    readonly maxLength: 2048;
                };
                readonly request: {
                    readonly type: "string";
                    readonly minLength: 1;
                    readonly maxLength: 2000000;
                };
                readonly body: {
                    readonly type: "string";
                    readonly minLength: 1;
                    readonly maxLength: 2000000;
                };
                readonly digest: {
                    readonly type: "string";
                    readonly pattern: "^[0-9a-f]{64}$";
                };
                readonly observed_at: {
                    readonly type: "integer";
                    readonly minimum: 0;
                    readonly maximum: 9007199254740991;
                };
            };
            readonly required: readonly ["path", "body", "digest", "observed_at"];
        };
    };
};
