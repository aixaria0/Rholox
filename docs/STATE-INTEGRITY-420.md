# Root State Integrity — Issue #420

This public Rholox panel compares source-attributed **reported key sets**
and evaluates caller-supplied justification graphs offline. It does not prove
a Casper CBC safety violation, finalized write loss, or merge defect.

Source: https://github.com/rhovision-org/rholo/issues/420
Published table: https://github.com/rhovision-org/rholo/issues/420#issuecomment-6375656151
Reproduction: https://github.com/rhovision-org/rholo/issues/420#issuecomment-6375688758
Reported binary: 71c6a513d. r-cash source revision:
018dec336f56488e6b6479fa8356422cafe680fd.

## Exactly what the public table shows

- 835: admin-guard, governor, verifier.
- 845: admin-guard, clock, codec.
- 835 -> 845: governor and verifier are absent in the later reported state.
- 845 -> finalized 1254: the reported later state retains all 845 keys;
  this pair is **not** a set-inclusion counterexample.
- 830 -> 845: the table does not report bounds at 830.

The first difference is a conditional **table-level counterexample**. The
justification ancestry and actual acceptance of ancestor effects into the
descendant state have not been independently authenticated. B/C share one
physical host. Short bounded read-only probes on 24 October 2026 did not
return usable block or state responses. Timeout does not prove process death.

## Offline witness file

The site accepts a JSON file (max 1 MiB) with schema
rholox-root-state-witness/v1, rootUri set to the public Root URI in Issue
#420, ancestorHash and descendantHash (64 lowercase hexadecimal characters),
blocks as {hash, height, justifications} with complete intermediary graph
records, and reads as {blockHash, node, keys, postState:true}.

The downloadable state-integrity-synthetic.json uses deliberately invented
block hashes, sources and sets. It is **not evidence from Rholo**.

For a real case: preserve the unaltered GET /api/v1/block/{hash} response
and read-only POST /api/v1/explore-deploy-by-block-hash response using
camelCase term, blockHash, usePreStateHash:false. Record UTC, server,
exact source revision, and raw body digest. Derive a normalized witness
without inventing any edges or keys. A normalized JSON file is not proof
of the authority or independence of the source.

Results:
- COUNTEREXAMPLE_IN_SUPPLIED_RECORDS: graph ancestry and key-set loss within
  caller-supplied bytes.
- NO_SET_LOSS_IN_SUPPLIED_RECORDS: inclusion holds for this pair.
- INCOMPLETE_JUSTIFICATION_GRAPH: missing ancestry/read evidence.
- INCONSISTENT_SOURCE_READS: different reported sets at the same hash.

All results retain sourceAuthenticated:false,
acceptedMergeEffectsProven:false and protocolViolationProven:false.
Justification ancestry is causal visibility, not guaranteed acceptance of
every ancestor deploy effect after merge. Being below finalized height 1254
does not alone prove a finalized ancestor write.

## Tests
Run npm run test:state-integrity then npm run verify. The website does
not contact validators or publish uploaded files.

Before Issue #420 can be resolved, obtain raw pinned reads from independent
hosts, establish accepted merge effects, and reproduce in an isolated,
revision-pinned chain.
