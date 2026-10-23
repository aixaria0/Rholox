import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import ts from 'typescript'
const text=readFileSync(new URL('../src/lib/network-evidence.ts',import.meta.url),'utf8')
const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const source='data:text/javascript;base64,'+Buffer.from(js).toString('base64')
const m=await import(source)
const cases=[]
function test(name,fn){fn();cases.push(name);console.log('PASS '+name)}
function hash(s){return createHash('sha256').update(s).digest('hex')}
function ok(data){return {ok:true,data,sha256:'a'.repeat(64)}}
function timeout(){return {ok:false,error_type:'TimeoutError'}}
function sample(t='2026-10-23T20:12:35+00:00',a=10,b=10,h1='a',h2='a'){
  return {sample_utc:t,read_only:true,sources:{A:{status:timeout(),finality:a===null?timeout():ok({blockNumber:a,blockHash:h1}),health:ok({mem_available_mb:11,ts:1792786355})},B:{finality:b===null?timeout():ok({blockNumber:b,blockHash:h2})}}}
}
function pack(...entries){return entries.map(x=>JSON.stringify(x)).join('\n')+'\n'}
function analyze(...samples){const text=pack(...samples);return m.parseCapture(text,hash(text))}
const topology=JSON.stringify({schema:'sentinel-observation-topology/v1',validators:{A:{host:'one',stake:250},D:{host:'one',stake:250},B:{host:'two',stake:250},C:{host:'two',stake:250}}})
test('unanswered finality stays inconclusive',()=>{const a=analyze(sample(undefined,null,null));assert.equal(a.assessment,'INSUFFICIENT_FINALITY_OBSERVATION');assert.equal(a.unansweredFinality,2)})
test('matching reports not consensus proof',()=>{const a=analyze(sample());assert.equal(a.assessment,'OBSERVATIONS_ONLY_NO_FINALITY_PROOF');assert.equal(a.boundary,'LOCAL_PREVIEW_NOT_A_CASPER_FINALITY_CERTIFICATE')})
test('reported conflicting same-height identity',()=>{const a=analyze(sample(undefined,10,10,'a','b'));assert.equal(a.assessment,'REPORTED_CONFLICT_REVIEW_REQUIRED');assert.equal(a.findings[0].code,'REPORTED_FINALIZED_IDENTITY_CONFLICT')})
test('different heights do not imply fork',()=>{const a=analyze(sample(undefined,10,11,'a','b'));assert.equal(a.assessment,'OBSERVATIONS_ONLY_NO_FINALITY_PROOF')})
test('progress is per node and time ordered',()=>{const a=analyze(sample('2026-10-23T20:00:00+00:00',10,10),sample('2026-10-23T20:01:00+00:00',11,10));assert.equal(a.progress.A,'REPORTED_PROGRESS');assert.equal(a.progress.B,'NO_PROGRESS_OBSERVED')})
test('reported finalized regression marked for review',()=>{const a=analyze(sample('2026-10-23T20:00:00+00:00',11,10),sample('2026-10-23T20:01:00+00:00',10,10));assert.equal(a.assessment,'REPORTED_CONFLICT_REVIEW_REQUIRED')})
test('memory pressure not an OOM conclusion',()=>{const a=analyze(sample());assert.equal(a.lowMemory[0].availableMb,11);assert.equal(a.assessment,'OBSERVATIONS_ONLY_NO_FINALITY_PROOF')})
test('illustrative host domain loses two validators',()=>{const a=m.parseTopology(topology,analyze(sample()));assert.equal(a.hostFailures.length,2);assert.equal(a.hostFailures[0].remainingStake,'500');assert.equal(a.hostFailures[0].exceedsTwoThirds,false)})
test('threshold exact two thirds not greater',()=>{const t=JSON.stringify({schema:'sentinel-observation-topology/v1',validators:{A:{host:'one',stake:1},B:{host:'two',stake:2}}});const r=m.parseTopology(t,analyze(sample()));assert.equal(r.hostFailures.find(x=>x.host==='one').exceedsTwoThirds,false)})
test('unsafe host/topology rejected',()=>{const t=JSON.stringify({schema:'sentinel-observation-topology/v1',validators:{A:{host:'../x',stake:2}}});assert.throws(()=>m.parseTopology(t,analyze(sample())),/topology/)})
test('read only required',()=>{const s=sample();s.read_only=false;assert.throws(()=>analyze(s),/Read-only/)})
test('out of order timestamp rejected',()=>{assert.throws(()=>analyze(sample(),sample('2026-10-23T20:00:00+00:00')),/strictly/)})
test('invalid response fails closed',()=>{const s=sample();s.sources.A.finality={ok:true};assert.throws(()=>analyze(s),/data object/)})
test('out-of-range height not promoted',()=>{const s=sample();s.sources.A.finality=ok({blockNumber:9007199254740992,blockHash:'x'});const a=analyze(s);assert.equal(a.observations[0].height,null)})
test('native report matching requires matching byte hash and boundary',()=>{
 const a=analyze(sample())
 const report={schema:'sentinel-incident-witness/v1',input:{sha256:a.sourceSha256,sample_count:a.sampleCount},
 analysis:{assessment:a.assessment,unanswered_finality_requests:a.unansweredFinality,protocol_finality_proven:false,finalized_write_integrity_proven:false},
 trust:{network_access:'NONE',provenance_authenticated:false},topology_sha256:null}
 assert.equal(m.checkSentinelReport(report,a).status,'BOUND_OBSERVATIONS_MATCH')
 report.input.sha256='f'.repeat(64)
 assert.equal(m.checkSentinelReport(report,a).status,'MISMATCH')
})
test('topology binding demands topology bytes',()=>{const a=analyze(sample());const report={schema:'sentinel-incident-witness/v1',input:{sha256:a.sourceSha256,sample_count:a.sampleCount},analysis:{assessment:a.assessment,unanswered_finality_requests:a.unansweredFinality,protocol_finality_proven:false,finalized_write_integrity_proven:false},trust:{network_access:'NONE',provenance_authenticated:false},topology_sha256:'a'.repeat(64)};assert.equal(m.checkSentinelReport(report,a).status,'MISMATCH')})
test('duplicate keys rejected including nested keys',()=>{
  assert.throws(()=>m.parseStrictJson('{"ok":true,"ok":false}'),/Duplicate JSON key/)
  assert.throws(()=>m.parseStrictJson('{"sources":{"A":{"data":1,"data":2}}}'),/Duplicate JSON key/)
  assert.deepEqual(m.parseStrictJson('{"a":1,"b":{"c":2}}'),{a:1,b:{c:2}})
})
test('escaped equivalent keys rejected',()=>{
  assert.throws(()=>m.parseStrictJson('{"a":1,"\\u0061":2}'),/Duplicate JSON key/)
})
test('unsupported source category rejected',()=>{
  const s=sample();s.sources.A.deploy={ok:true,data:{}};assert.throws(()=>analyze(s),/Unsupported source/)
})
test('absent finality is inconclusive',()=>{
  const s=sample();delete s.sources.A.finality;const a=analyze(s);assert.equal(a.assessment,'INSUFFICIENT_FINALITY_OBSERVATION')
})
test('topology integers must be safe',()=>{
  const t=JSON.stringify({schema:'sentinel-observation-topology/v1',validators:{A:{host:'one',stake:9007199254740992}}})
  assert.throws(()=>m.parseTopology(t,analyze(sample())),/Invalid validator topology/)
})
test('unsupported native report is rejected',()=>{
  const a=analyze(sample());assert.equal(m.checkSentinelReport({schema:'unknown'},a).status,'MISMATCH')
})
console.log('TOTAL '+cases.length+' PASS')
