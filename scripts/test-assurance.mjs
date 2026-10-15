import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { moduleUrl } from './load-ts-for-test.mjs'
const rchain = moduleUrl('../src/lib/rchain.ts')
const assuranceUrl = moduleUrl('../src/lib/assurance.ts', { './rchain': rchain })
const assurance = await import(assuranceUrl)
const { AssuranceEvidence } = await import(moduleUrl('../src/AssurancePanel.tsx', { './lib/assurance': assuranceUrl }))
const render = (observation, action, gatewayUnavailable=false) => renderToStaticMarkup(createElement(AssuranceEvidence,{deployId:action?.deployId??'unknown',action,observation,gatewayUnavailable}))
const NOW = 1792080001000
const originalNow = Date.now
const originalFetch = globalThis.fetch
globalThis.window = { setTimeout, clearTimeout }
Date.now = () => NOW
const read = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url),'utf8'))
const pkg = read('pass')
const term = JSON.parse(pkg.observers[0].evidence.block.body).deploys[0].term
const action = { deployId: pkg.subject.deploy_id, signer: 'synthetic-signer', signedAt: NOW-1000, submittedAt: NOW-900, submissionSource: 'synthetic gateway', to: '1111syntheticRecipient', amountDrops: 100, recipientBalanceBefore: 1000, signed: { data: { term }, deployer: 'synthetic-signer', signature: pkg.subject.deploy_id } }
const config = { sentinel_url: 'http://127.0.0.1:18181', producer: 'rchain-sentinel', source_revision: 'synthetic-fixture-v1', network_id: 'synthetic-testnet', shard_id: 'root', observers: pkg.observers.map(o=>({ observer_id:o.observer_id,source:o.source,node_identity:o.node_identity,failure_domain:o.failure_domain })), min_observers:2,min_failure_domains:2,max_age_ms:60000,max_future_skew_ms:1000 }
function respond(body) { globalThis.fetch = async () => new Response(JSON.stringify(body),{status:200}) }
try {
  respond(pkg)
  const pass = await assurance.observeTransferAssurance(action.deployId,action,config)
  assert.equal(pass.verdict.status,'PASS')
  assert.equal(assurance.assurancePresentation(pass,action).verdict,'PASS')
  assert.match(assurance.assurancePresentation(pass,action).why,/required checks.*PASS/)
  respond(read('blocked'))
  const blocked = await assurance.observeTransferAssurance(action.deployId,action,config)
  assert.equal(blocked.verdict.status,'BLOCKED')
  assert.match(assurance.assurancePresentation(blocked,action).why,/submitted and included.*BLOCKED/)
  assert.equal(assurance.assurancePresentation(pass,action,true).capability,'DEGRADED')
  globalThis.fetch=async()=>{throw new Error('observation offline')}
  const unavailable=await assurance.observeTransferAssurance(action.deployId,action,config)
  assert.equal(assurance.assurancePresentation(unavailable,action).verdict,'BLOCKED')
  assert.equal(assurance.assurancePresentation(unavailable,action).capability,'INSUFFICIENT EVIDENCE')
  respond(read('conflict'))
  const conflict=await assurance.observeTransferAssurance(action.deployId,action,config)
  assert.equal(conflict.verdict.status,'FAIL'); assert.equal(conflict.verdict.agreement,'CONFLICT')
  respond({...pkg, reproduction_digest:'0'.repeat(64)})
  assert.equal((await assurance.observeTransferAssurance(action.deployId,action,config)).verdict.status,'FAIL')
  const waiting=await assurance.observeTransferAssurance(action.deployId,action,{...config,sentinel_url:null})
  for (const observation of [pass, blocked, unavailable, conflict, waiting]) { const html=render(observation,action); assert.ok(html.includes('WHY THIS ACTION?')); assert.ok(html.includes(assurance.assurancePresentation(observation,action).verdict)); }
  assert.ok(render(pass,{...action,submittedAt:undefined,submissionError:'Gateway unavailable'}).includes('DEGRADED'))
  assert.ok(render(pass,action,true).includes('DEGRADED'))
  assert.equal(waiting.state,'WAITING');assert.equal(assurance.assurancePresentation(waiting,action).verdict,'BLOCKED')
  respond(pkg)
  const unseen=await assurance.observeTransferAssurance(action.deployId,undefined,config)
  assert.equal(assurance.assurancePresentation(unseen).verdict,'BLOCKED')
  respond({version:'rchain-assurance/v1'})
  assert.equal((await assurance.observeTransferAssurance(action.deployId,action,config)).state,'REJECTED')
  console.log('Assurance UI integration: seven required states + missing signed context + truncated evidence PASS')
} finally { Date.now=originalNow;globalThis.fetch=originalFetch }
