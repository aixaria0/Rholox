import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function compiled(file) {
 return ts.transpileModule(readFileSync(new URL(file, import.meta.url),'utf8'),
 {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
}
function asUrl(source) { return 'data:text/javascript;base64,'+Buffer.from(source).toString('base64') }
const dependency=asUrl(compiled('../src/lib/network-evidence.ts'))
const mod=compiled('../src/lib/state-integrity.ts').replace(/from ['"]\.\/network-evidence['"]/, 'from "'+dependency+'"')
const lib=await import(asUrl(mod))
const A='a'.repeat(64), B='b'.repeat(64), C='c'.repeat(64), D='d'.repeat(64)
const root=lib.ROOT_URI
const tests=[]
function test(name,fn){fn();tests.push(name);console.log('PASS '+name)}
function witness(){
 return {
  schema:'rholox-root-state-witness/v1',rootUri:root,ancestorHash:A,descendantHash:B,
  blocks:[{hash:A,height:835,justifications:[]},{hash:B,height:845,justifications:[A]}],
  reads:[{blockHash:A,node:'B',keys:['admin-guard','governor','verifier'],postState:true},
    {blockHash:B,node:'B',keys:['admin-guard','clock','codec'],postState:true}]
 }
}
function run(x){return lib.evaluateRootWitness(lib.parseRootWitness(JSON.stringify(x)))}
test('published table 835→845 missing governor and verifier',()=>assert.deepEqual(lib.publicComparison(835,845).lost,['governor','verifier']))
test('published 830→845 missing verifier not bounds',()=>assert.deepEqual(lib.publicComparison(830,845).lost,['verifier']))
test('published 845→1254 has no missing keys',()=>assert.deepEqual(lib.publicComparison(845,1254).lost,[]))
test('reported figure never claims source replay',()=>assert.equal(lib.publicComparison(835,845).provenance,'PUBLISHED_TABLE_NOT_RAW_RPC'))
test('valid supplied direct-ancestor counterexample',()=>{
 const p=run(witness());assert.equal(p.status,'COUNTEREXAMPLE_IN_SUPPLIED_RECORDS')
 assert.equal(p.ancestry,'CONFIRMED_IN_SUPPLIED_GRAPH')
 assert.deepEqual(p.lostKeys,['governor','verifier']);assert.equal(p.protocolViolationProven,false)
})
test('missing keys not promoted to proved finality loss',()=>assert.equal(run(witness()).acceptedMergeEffectsProven,false))
test('added keys detected',()=>assert.deepEqual(run(witness()).gainedKeys,['clock','codec']))
test('same key set yields no loss',()=>{const x=witness();x.reads[1].keys=x.reads[0].keys;assert.equal(run(x).status,'NO_SET_LOSS_IN_SUPPLIED_RECORDS')})
test('same-height read equivalence across two labels accepted',()=>{const x=witness();x.reads.push({...x.reads[0],node:'C'});assert.equal(run(x).sourceAgreement.ancestor.nodeCount,2)})
test('same block disagreement between nodes fails closed',()=>{const x=witness();x.reads.push({...x.reads[0],node:'C',keys:['different']});assert.equal(run(x).status,'INCONSISTENT_SOURCE_READS')})
test('unresolved reported ancestry does not establish relation',()=>{const x=witness();x.blocks[1].justifications=[C];const p=run(x);assert.equal(p.status,'INCOMPLETE_JUSTIFICATION_GRAPH');assert.equal(p.ancestry,'NOT_ESTABLISHED')})
test('missing ancestor key read fails closed',()=>{const x=witness();x.reads=x.reads.slice(1);assert.equal(run(x).status,'INCOMPLETE_JUSTIFICATION_GRAPH')})
test('justification closure through intermediate block',()=>{const x=witness();x.blocks[1].justifications=[C];x.blocks.push({hash:C,height:840,justifications:[A]});assert.equal(run(x).status,'COUNTEREXAMPLE_IN_SUPPLIED_RECORDS')})
test('different same-height branches rejected as ancestor by ordering',()=>{const x=witness();x.blocks[1].height=835;assert.throws(()=>lib.parseRootWitness(JSON.stringify(x)),/Ancestor height/)})
test('unrecognized root URI rejected',()=>{const x=witness();x.rootUri='rho:id:other';assert.throws(()=>lib.parseRootWitness(JSON.stringify(x)),/Root URI/)})
test('duplicate block records rejected',()=>{const x=witness();x.blocks.push(x.blocks[0]);assert.throws(()=>lib.parseRootWitness(JSON.stringify(x)),/Duplicate block/)})
test('self-justifications rejected',()=>{const x=witness();x.blocks[1].justifications=[B];assert.throws(()=>lib.parseRootWitness(JSON.stringify(x)),/Self-referential/)})
test('duplicate justification edges rejected',()=>{const x=witness();x.blocks[1].justifications=[A,A];assert.throws(()=>lib.parseRootWitness(JSON.stringify(x)),/Duplicate justification/)})
test('unknown block state read rejected',()=>{const x=witness();x.reads[0].blockHash=D;assert.throws(()=>lib.parseRootWitness(JSON.stringify(x)),/unknown block/)})
test('duplicate source/block read rejected',()=>{const x=witness();x.reads.push(x.reads[0]);assert.throws(()=>lib.parseRootWitness(JSON.stringify(x)),/Duplicate node/)})
test('duplicate keys rejected',()=>{const x=witness();x.reads[0].keys=['governor','governor'];assert.throws(()=>lib.parseRootWitness(JSON.stringify(x)),/key set/)})
test('non-post-state read rejected',()=>{const x=witness();x.reads[0].postState=false;assert.throws(()=>lib.parseRootWitness(JSON.stringify(x)),/post-state/)})
test('unsafe non-integer height rejected',()=>{const x=witness();x.blocks[0].height=Number.MAX_SAFE_INTEGER+1;assert.throws(()=>lib.parseRootWitness(JSON.stringify(x)),/block height/)})
test('hash mismatch blocks rejected',()=>{const x=witness();x.ancestorHash='not-a-hash';assert.throws(()=>lib.parseRootWitness(JSON.stringify(x)),/ancestor hash/)})
test('duplicate object keys rejected including escaped variants',()=>{
 const text=JSON.stringify(witness()).replace('"rootUri":','"rootUri":"one","rootUri":')
 assert.throws(()=>lib.parseRootWitness(text),/Duplicate JSON key/)
})
test('payload over 1 MiB rejected',()=>{assert.throws(()=>lib.parseRootWitness('x'.repeat(1048577)),/1 MiB/)})
test('synthetic fixture matches same counterexample, remains unauthenticated',()=>{
 const x=JSON.parse(readFileSync(new URL('../public/state-integrity-synthetic.json',import.meta.url),'utf8'))
 const r=run(x);assert.equal(r.status,'COUNTEREXAMPLE_IN_SUPPLIED_RECORDS')
 assert.equal(r.sourceAuthenticated,false);assert.equal(r.protocolViolationProven,false)
})
console.log('TOTAL '+tests.length+' PASS')
