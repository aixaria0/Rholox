import { useState } from 'react'
import {
 ISSUE_URL, ISSUE_EVIDENCE, ISSUE_REPRO, REPORTED_STATES, ROOT_URI,
 evaluateRootWitness, parseRootWitness, publicComparison, type RootProofResult,
} from './lib/state-integrity'
import { readEvidenceFile } from './lib/network-evidence'

const PAIRS = [
 { label: '835 → 845', from: 835, to: 845 },
 { label: '830 → 845', from: 830, to: 845 },
 { label: '845 → 1254', from: 845, to: 1254 },
]
const DOCS='https://github.com/aixaria0/Rholox/blob/main/docs/STATE-INTEGRITY-420.md'
const SHORT=(value:string)=>value.slice(0,12)+'…'+value.slice(-8)
export default function StateIntegrityPanel(){
 const [pair,setPair]=useState(0)
 const [file,setFile]=useState<File|null>(null)
 const [hash,setHash]=useState<string|null>(null)
 const [result,setResult]=useState<RootProofResult|null>(null)
 const [error,setError]=useState('')
 const [running,setRunning]=useState(false)
 const selected=PAIRS[pair]
 const contrast=publicComparison(selected.from,selected.to)
 const ancestor=REPORTED_STATES.find(v=>v.height===selected.from)!
 const descendant=REPORTED_STATES.find(v=>v.height===selected.to)!
 async function inspect(){
  if(!file||running)return
  setRunning(true);setError('');setResult(null);setHash(null)
  try{
   if(file.size>1024*1024)throw new Error('Maximum witness size is 1 MiB.')
   const raw=await readEvidenceFile(file)
   const witness=parseRootWitness(raw.text)
   setResult(evaluateRootWitness(witness));setHash(raw.sha)
  }catch(cause){setError(cause instanceof Error?cause.message:'Cannot verify this witness.')}
  finally{setRunning(false)}
 }
 return (
  <section id="state-integrity" className="state-proof" aria-labelledby="state-proof-title">
   <div className="panel-head">
    <div><div className="eyebrow">ISSUE #420 / REPRODUCIBLE CLAIM ANALYSIS</div>
     <h2 id="state-proof-title">Root State Integrity</h2>
     <p className="panel-description">Examine the reported disappearance of append-only Root keys between pinned block post-states. Published table values are not authenticated validator evidence.</p>
    </div>
    <span className="badge">NOT A CONSENSUS PROOF</span>
   </div>
   <div className="state-proof-status panel">
    <div><span className="eyebrow">PUBLISHED CLAIM</span><strong>SET-INCLUSION COUNTEREXAMPLE REPORTED</strong>
     <p>Issue #420 reports disappearing keys between block 835 and 845. Ancestry and source data are not independently reproduced by this website.</p></div>
    <div><span className="eyebrow">INDEPENDENT NETWORK REPLAY</span><strong>NOT VERIFIED</strong>
     <p>Bounded read-only probes against B/C on 24 October 2026 returned no usable block/state replies. A timeout is not a proven node crash.</p></div>
    <div><span className="eyebrow">CASPER CBC / MERGE ACCEPTANCE</span><strong>UNRESOLVED</strong>
     <p>Justification ancestry does not prove every ancestor deploy effect was accepted into the descendant merged state.</p></div>
   </div>
   <div className="state-proof-grid">
    <article className="panel state-proof-comparison">
     <div className="eyebrow">01 / PUBLISHED BLOCK COMPARISON</div><h3>Compare key sets</h3>
     <div className="state-proof-switcher" role="group" aria-label="Select published block pair">
      {PAIRS.map((p,i)=><button key={p.label} type="button" aria-pressed={pair===i}
       className={pair===i?'state-proof-selected':''} onClick={()=>setPair(i)}>{p.label}</button>)}
     </div>
     <div className="state-proof-pair">
      {[ancestor,descendant].map((b,i)=><div key={b.hash}>
       <span className="eyebrow">{i===0?'REPORTED ANCESTOR':'REPORTED DESCENDANT'}</span>
       <strong>Height {b.height}</strong><code title={b.hash}>{SHORT(b.hash)}</code>
      </div>)}
     </div>
     <div className="state-proof-set-comparison">
      <div className="state-proof-lost"><span>Keys missing in later reported state</span>
       <strong>{contrast.lost.length}</strong><p>{contrast.lost.join(', ')||'None in published table'}</p></div>
      <div><span>Keys newly present</span><strong>{contrast.gained.length}</strong>
       <p>{contrast.gained.join(', ')||'None in published table'}</p></div>
     </div>
     <p className="state-proof-note">{contrast.lost.length
      ? 'Conditional set-inclusion failure in the published table: Keys(earlier) is not a subset of Keys(later).'
      : 'Set inclusion holds for this published pair. This pair is not a counterexample.'}</p>
     <p className="evidence-boundary">Source: public issue table, not authenticated RPC replies. B and C share a physical host. The reported justification path and accepted merge effects remain separate verification gates.</p>
    </article>
    <article className="panel state-proof-witness">
     <div className="eyebrow">02 / RECOMPUTE A SUPPLIED WITNESS</div>
     <h3>Check ancestry and post-state sets</h3>
     <p>Import a bounded JSON witness containing exact block hashes, justification links and per-node post-state key sets. All checks run locally in the browser.</p>
     <p className="state-proof-fixture"><a href={import.meta.env.BASE_URL + "state-integrity-synthetic.json"} download="state-integrity-synthetic.json">Download synthetic witness for testing ↗</a><span>Fabricated test data — not a real network capture.</span></p>
     <label>Witness JSON (max 1 MiB)
      <input type="file" accept=".json,application/json" aria-label="Select Root post-state witness"
       onChange={e=>{setFile(e.target.files?.[0]??null);setError('');setResult(null);setHash(null)}}/>
     </label>
     <button className="primary" type="button" disabled={!file||running} onClick={()=>void inspect()}>
      {running?'CHECKING LOCAL RECORDS…':'VERIFY SUPPLIED RECORDS'}</button>
     {error&&<p role="alert" className="error">{error}</p>}
     {result?<div className="state-proof-result" aria-live="polite">
      <div className="eyebrow">RECOMPUTED LOCAL RESULT</div>
      <strong>{result.status.replaceAll('_',' ')}</strong><p>{result.summary}</p>
      <dl>
       <div><dt>Supplied ancestry</dt><dd>{result.ancestry.replaceAll('_',' ')}</dd></div>
       <div><dt>Missing keys</dt><dd>{result.lostKeys.join(', ')||'None'}</dd></div>
       <div><dt>Unresolved graph edges</dt><dd>{result.unresolvedBlockCount}</dd></div>
       <div><dt>Source authentication</dt><dd>NOT VERIFIED</dd></div>
       <div><dt>Accepted merge effects</dt><dd>NOT VERIFIED</dd></div>
       <div><dt>Protocol safety violation</dt><dd>NOT PROVEN</dd></div>
      </dl>
      {hash&&<div className="evidence-hash"><span>INPUT FILE SHA-256</span><code>{hash}</code></div>}
     </div>:<p className="evidence-privacy">Uploaded records are caller-supplied, not signed or independently authenticated. A successful deploy or a justification path does not establish lost finalized writes.</p>}
    </article>
   </div>
   <div className="panel state-proof-why">
    <div className="eyebrow">03 / WHAT IS STILL REQUIRED</div>
    <h3>From a published discrepancy to a verified state-integrity finding</h3>
    <div className="state-proof-steps">
     <div><strong>1. Preserve raw responses</strong><p>Save exact Root key reads and block responses at the pinned hashes, with UTC timestamps and binary/source revisions.</p></div>
     <div><strong>2. Validate ancestry independently</strong><p>Walk 845 → 835 through raw justifications, repeat on an independent physical host and compare state roots.</p></div>
     <div><strong>3. Inspect accepted merge effects</strong><p>Determine whether governor/verifier writes were accepted, rejected or superseded during merge.</p></div>
     <div><strong>4. Replay in isolation</strong><p>Pin binary 71c6a513d; compare sequential versus parallel hot-state writes, with and without resource constraints.</p></div>
    </div>
   </div>
   <div className="evidence-readme">
    <p>Published installer: 23 Oct, 18:00–18:03 UTC; resource degradation: 18:55–19:10 UTC.
     These are separate events. Height below finalized block 1254 does not establish acceptance of every ancestor effect. Issue #420 remains open.</p>
    <div>
     <a href={ISSUE_EVIDENCE} target="_blank" rel="noopener noreferrer">Published block table ↗</a>
     <a href={ISSUE_REPRO} target="_blank" rel="noopener noreferrer">Reproduction method ↗</a>
     <a href={ISSUE_URL} target="_blank" rel="noopener noreferrer">Issue #420 ↗</a>
     <a href={DOCS} target="_blank" rel="noopener noreferrer">Witness format ↗</a>
    </div>
   </div>
   <p className="state-proof-root">Public Root URI: <code>{ROOT_URI}</code></p>
  </section>
 )
}
