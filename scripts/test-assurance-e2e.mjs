// Real product modules + real Sentinel. Mock mode is explicitly synthetic; live mode is testnet only.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { verifyRevTransferAssurance } from '@aixaria/rchain-assurance-v1'
import { assurancePayloadDigest, rawAssuranceDigest } from '@aixaria/rchain-assurance-v1/integrity'
import { moduleUrl } from './load-ts-for-test.mjs'

const live = process.argv.includes('--live')
const resumeIndex = process.argv.indexOf('--resume')
const resumeAction = resumeIndex >= 0 ? JSON.parse(readFileSync(process.argv[resumeIndex + 1], 'utf8')) : null
if (resumeAction && !live) throw new Error('--resume requires --live; it performs observations only')
const output = resolve(process.env.ASSURANCE_OUTPUT ?? (live ? 'docs/evidence/rchain-assurance-v1/live' : '/tmp/rchain-assurance-e2e'))
const livePolicy = live && process.env.ASSURANCE_LIVE_POLICY ? JSON.parse(readFileSync(process.env.ASSURANCE_LIVE_POLICY, "utf8")) : null
const servers = []
let sentinel
let mockSigned
let mockRecipient
const template = JSON.parse(readFileSync(new URL('./fixtures/pass.json',import.meta.url),'utf8'))
const baseBlock = JSON.parse(template.observers[0].evidence.block.body).blockInfo
const resultTuple = JSON.parse(template.observers[0].evidence.deploy.body).ProcessedWithSuccess.deployResult
const pause = ms => new Promise(resolve => setTimeout(resolve,ms))
globalThis.window = { setTimeout, clearTimeout }

async function mockNode(id) {
  const server = createServer(async (req,res) => {
    const chunks=[];for await (const chunk of req) chunks.push(chunk)
    const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):undefined
    const canonical={blockInfo:baseBlock,deploys:mockSigned?[{sig:mockSigned.signature,deployer:mockSigned.deployer,term:mockSigned.data.term,errored:false}]:[]}
    let data
    if(req.url==='/api/status')data={networkId:'synthetic-testnet',shardId:'root',node:{id},latestBlockNumber:10,minPhloPrice:1,devMode:true}
    else if(req.url==='/api/deploy'&&req.method==='POST'){mockSigned=body;data=`DeployId is: ${body.signature}`}
    else if(req.url.startsWith('/api/v1/deploy-status/'))data=mockSigned?{ProcessedWithSuccess:{deployResult:process.env.ASSURANCE_MOCK_EMPTY_RESULT?[]:resultTuple,block:baseBlock}}:{NotProcessed:{status:'Unknown'}}
    else if(req.url==='/api/last-finalized-block')data={blockInfo:baseBlock}
    else if(req.url.startsWith('/api/block/'))data=canonical
    else if(req.url.startsWith('/api/is-finalized/'))data={finalized:true}
    else if(req.url==='/api/explore-deploy')data={expr:[{ExprInt:{data:body.includes(`"${mockRecipient}"`)?1000+(mockSigned?100:0):1000000000}}],block:baseBlock}
    else {res.writeHead(404);res.end('not found');return}
    res.setHeader('content-type','application/json');res.end(JSON.stringify(data))
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server)
  return `http://127.0.0.1:${server.address().port}`
}
async function json(url,options){const r=await fetch(url,options);if(!r.ok)throw new Error(`${url}: HTTP ${r.status}`);return r.json()}
function revision(path='.'){return execFileSync('git',['-C',path,'rev-parse','HEAD'],{encoding:'utf8'}).trim()}
try {
  let gateway='https://testnet.rhobot.net', sentinelUrl=process.env.ASSURANCE_SENTINEL_URL??livePolicy?.sentinel_url??'http://127.0.0.1:18181'
  let pins, producerRevision=process.env.ASSURANCE_SENTINEL_REVISION??livePolicy?.source_revision
  if(!live){
    const one=await mockNode('one'),two=await mockNode('two');gateway=one
    const bin=resolve(process.env.SENTINEL_BIN??'../rchain-sentinel/backend/target/debug/rchain-sentinel')
    producerRevision=revision(resolve(bin,'../../../..'))
    sentinelUrl='http://127.0.0.1:18182'
    sentinel=spawn(bin,[],{env:{...process.env,PORT:'18182',RCHAIN_RNODE_URL:one,RCHAIN_RNODE_URLS:`${one},${two}`,RCHAIN_ASSURANCE_FAILURE_DOMAINS:'mock-one,mock-two',RCHAIN_SENTINEL_REVISION:producerRevision},stdio:['ignore','ignore','pipe']})
    sentinel.stderr.on('data',chunk=>process.stderr.write(chunk))
    for(let i=0;i<120;i++){try{await json(`${sentinelUrl}/health`);break}catch{if(i===119)throw new Error('Sentinel did not become ready');await pause(100)}}
    pins=[one,two].map((source,i)=>({observer_id:source,source,node_identity:i?'two':'one',failure_domain:i?'mock-two':'mock-one'}))
  }
  const rchainUrl=moduleUrl('../src/lib/rchain.ts',{},source=>source.replace("export const RCHAIN_API = 'https://testnet.rhobot.net'",`export const RCHAIN_API = ${JSON.stringify(gateway)}`))
  const rchain=await import(rchainUrl)
  const status=await rchain.getJson('/api/status')
  if(live&&(status.networkId!=='testnet'||status.devMode!==true))throw new Error('Live transfer is restricted to the authorized dev testnet')
  const {createWallet}=await import(moduleUrl('../src/lib/wallet.ts'))
  const sender=resumeAction?null:createWallet(),recipient=resumeAction?null:createWallet();mockRecipient=recipient?.revAddress
  if(live && !resumeAction){
    const funded=await rchain.requestFaucet(sender.revAddress);console.log(`LIVE faucet deploy: ${funded.deployId}`)
    for(let i=0;i<30;i++){if(await rchain.readBalance(sender.revAddress)>1000000)break;if(i===29)throw new Error('EXTERNAL LIVE BLOCKER: testnet faucet funding did not become available');await pause(1000)}
    pins=livePolicy?.observers??[{observer_id:gateway,source:gateway,node_identity:status.node?.id??status.address,failure_domain:'public-testnet-gateway'}]
  }
  if(live) pins=livePolicy?.observers??[{observer_id:gateway,source:gateway,node_identity:status.node?.id??status.address,failure_domain:'public-testnet-gateway'}]
  let action=resumeAction,receipt,transferError
  const {sendRev}=await import(moduleUrl('../src/lib/transfer.ts',{'./rchain':rchainUrl}))
  try{if(!resumeAction)receipt=await sendRev(sender,recipient.revAddress,'0.000001',next=>{action=next;console.log(`${live?'LIVE':'SYNTHETIC'} ${next.submittedAt?'SUBMITTED':'SIGNED'} ${next.deployId}`)})}catch(error){transferError=error.message;if(!action)throw error;console.log(`Action retained: ${transferError}`)}
  if(!action)throw new Error('No signed deploy identity retained')
  const pkg=await json(`${sentinelUrl}/api/assurance/action/${action.deployId}`)
  const policy={verifier:'rchain-rev-transfer-assurance/v1',action_id:action.deployId,deploy_id:action.deployId,claim_id:`rev-transfer:${action.deployId}`,network_id:live?'testnet':'synthetic-testnet',shard_id:live?'/root':'root',signer:action.signer,term:action.signed.data.term,recipient:action.to,amount_drops:action.amountDrops,recipient_balance_before:action.recipientBalanceBefore,now_ms:Date.now(),max_age_ms:60000,max_future_skew_ms:5000,min_observers:2,min_failure_domains:2,observers:pins,producer:'rchain-sentinel',source_revision:producerRevision??'',expected_payload_digest:await assurancePayloadDigest(pkg)}
  const verdict=await verifyRevTransferAssurance(pkg,policy)
  if(!live)assert.equal(verdict.status,process.env.ASSURANCE_MOCK_EMPTY_RESULT?'BLOCKED':'PASS',JSON.stringify(verdict))
  const assuranceUrl=moduleUrl('../src/lib/assurance.ts',{'./rchain':rchainUrl})
  const {AssuranceEvidence}=await import(moduleUrl('../src/AssurancePanel.tsx',{'./lib/assurance':assuranceUrl}))
  const observation={state:verdict.status==='FAIL'?'REJECTED':'OBSERVED',package:pkg,verdict,policy,reason:verdict.reasons.join(' ')||'All bounded checks reproduced.'}
  const html=renderToStaticMarkup(createElement(AssuranceEvidence,{deployId:action.deployId,action,observation}))
  assert.ok(html.includes('WHY THIS ACTION?'));assert.ok(html.includes('WHAT WAS SIGNED?'));assert.ok(html.includes(verdict.status))
  const tampered=structuredClone(pkg)
  tampered.observers[0].evidence.status.body='{}'
  const negative=await verifyRevTransferAssurance(tampered,policy)
  assert.equal(negative.status,'FAIL')
  const vendor=JSON.parse(readFileSync(new URL('../vendor/rchain-assurance-v1/SOURCE.json',import.meta.url),'utf8'))
  const missing=[]
  if(live&&pins.length<2)missing.push('no operator-approved second independently addressable observer endpoint/identity pin')
  if(live&&pkg.execution.status!=='OBSERVED')missing.push('node deploy-status omits a successful contract result (deployResult is empty or unknown)')
  if(live&&pkg.finalized_state.status!=='OBSERVED')missing.push('required finalized transfer read-back is unavailable')
  const blocker=live&&verdict.status!=='PASS'?`EXTERNAL LIVE BLOCKER: authorized testnet evidence is incomplete: ${missing.join('; ') || verdict.reasons.join('; ')}.`:null
  const report={mode:live?'LIVE_TESTNET':process.env.ASSURANCE_MOCK_EMPTY_RESULT?'SYNTHETIC_EMPTY_RESULT':'SYNTHETIC_INTEGRATION',revisions:{Rholox:revision(),Sentinel:producerRevision,Compiler:vendor.revision},deploy_id:action.deployId,submission_observed_at:action.submittedAt??null,inclusion:pkg.inclusion,execution:pkg.execution,finalized_state:pkg.finalized_state,observers:pkg.observers.map(o=>({observer_id:o.observer_id,node_identity:o.node_identity,finalized_height:o.finalized_height,finalized_hash:o.finalized_hash,observation_digest:o.observation_digest,status:o.status})),assurance_package_digest:pkg.provenance.payload_digest,rendered_html_digest:await rawAssuranceDigest(html),verdict:verdict.status,negative_control:negative.status==='FAIL'?'PASS':'FAIL',transfer_error:transferError??null,client_receipt:receipt??null,blocker}
  mkdirSync(output,{recursive:true})
  for(const [name,value] of Object.entries({package:pkg,policy,verdict,report,'signed-action':action,'negative-verdict':negative}))writeFileSync(resolve(output,`${name}.json`),JSON.stringify(value,null,2)+'\n')
  writeFileSync(resolve(output,'rendered.html'),html)
  console.log(JSON.stringify(report,null,2))
} finally {if(sentinel)sentinel.kill('SIGTERM');for(const server of servers)await new Promise(resolve=>server.close(resolve))}
