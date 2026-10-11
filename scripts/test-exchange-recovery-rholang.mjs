import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'

const API = (process.env.RHOLOX_RCHAIN_API || 'https://testnet.rhobot.net').replace(/\/$/, '')
const source = readFileSync(new URL('../src/lib/exchange.ts', import.meta.url), 'utf8')

function extractByMarker(marker) {
  const start = source.indexOf(marker)
  assert.ok(start >= 0, `missing ${marker}`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error(`unterminated ${marker}`)
}

function extractContract(name) {
  return extractByMarker(`contract ${name}(`)
}

function decode(expr) {
  if (!expr || typeof expr !== 'object') return undefined
  for (const [key, value] of Object.entries(expr)) {
    if (key === 'ExprTuple') return value.data.map(decode)
    if (key === 'ExprString' || key === 'ExprInt' || key === 'ExprBool') return value.data
  }
  return undefined
}

async function explore(term) {
  const response = await fetch(`${API}/api/explore-deploy`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(term),
  })
  const text = await response.text()
  assert.equal(response.status, 200, text)
  const body = JSON.parse(text)
  assert.ok(body.expr?.[0], 'explore-deploy returned no expression')
  return { value: decode(body.expr[0]), block: body.block }
}

function addHarness({ rollback }) {
  return `new return, stateCh, custodyACh, custodyBCh, assetAService, assetBService, purseA, purseB, addCore, actor, opRet in {
    stateCh!((10,20,30,{"holder":30})) | custodyACh!(10) | custodyBCh!(20) |
    contract assetAService(_id, @"depositInto", destinationPurse, @amount, ret) = { for (@v <- custodyACh) { custodyACh!(v + amount) | ret!(true) } } |
    contract assetAService(@"withdrawFrom", sourcePurse, @to, @amount, ret) = { for (@v <- custodyACh) { ${rollback ? 'custodyACh!(v - amount) | ret!(true)' : 'custodyACh!(v) | ret!(false)'} } } |
    contract assetBService(_id, @"depositInto", destinationPurse, @amount, ret) = { ret!(false) } |
    ${extractContract('addCore')} |
    addCore!(*actor, "holder", 1, 2, 3, 10, 20, 30, 30, {"holder":30}, *opRet) |
    for (@receipt <- opRet) { for (@(ra,rb,ts,_p) <<- stateCh & @ca <<- custodyACh & @cb <<- custodyBCh) { return!((receipt,ra,rb,ts,ca,cb)) } }
  }`
}

function removeHarness({ rollback }) {
  return `new return, stateCh, custodyACh, custodyBCh, assetAService, assetBService, purseA, purseB, removeCore, actor, opRet in {
    stateCh!((10,20,30,{"holder":30})) | custodyACh!(10) | custodyBCh!(20) |
    contract assetAService(@"withdrawFrom", sourcePurse, @to, @amount, ret) = { for (@v <- custodyACh) { custodyACh!(v - amount) | ret!(true) } } |
    contract assetAService(_id, @"depositInto", destinationPurse, @amount, ret) = { for (@v <- custodyACh) { ${rollback ? 'custodyACh!(v + amount) | ret!(true)' : 'custodyACh!(v) | ret!(false)'} } } |
    contract assetBService(@"withdrawFrom", sourcePurse, @to, @amount, ret) = { ret!(false) } |
    ${extractContract('removeCore')} |
    removeCore!(*actor, "holder", 3, 1, 2, 10, 20, 30, 30, {"holder":30}, *opRet) |
    for (@receipt <- opRet) { for (@(ra,rb,ts,_p) <<- stateCh & @ca <<- custodyACh & @cb <<- custodyBCh) { return!((receipt,ra,rb,ts,ca,cb)) } }
  }`
}

function swapHarness(direction, { rollback }) {
  const aToB = direction === 'A_TO_B'
  const coreName = aToB ? 'swapAtoB' : 'swapBtoA'
  const aService = aToB
    ? `contract assetAService(_id, @"depositInto", destinationPurse, @amount, ret) = { for (@v <- custodyACh) { custodyACh!(v + amount) | ret!(true) } } |
       contract assetAService(@"withdrawFrom", sourcePurse, @to, @amount, ret) = { for (@v <- custodyACh) { ${rollback ? 'custodyACh!(v - amount) | ret!(true)' : 'custodyACh!(v) | ret!(false)'} } } |`
    : `contract assetAService(@"withdrawFrom", sourcePurse, @to, @amount, ret) = { ret!(false) } |`
  const bService = aToB
    ? `contract assetBService(@"withdrawFrom", sourcePurse, @to, @amount, ret) = { ret!(false) } |`
    : `contract assetBService(_id, @"depositInto", destinationPurse, @amount, ret) = { for (@v <- custodyBCh) { custodyBCh!(v + amount) | ret!(true) } } |
       contract assetBService(@"withdrawFrom", sourcePurse, @to, @amount, ret) = { for (@v <- custodyBCh) { ${rollback ? 'custodyBCh!(v - amount) | ret!(true)' : 'custodyBCh!(v) | ret!(false)'} } } |`
  return `new return, stateCh, custodyACh, custodyBCh, assetAService, assetBService, purseA, purseB, ${coreName}, actor, opRet in {
    stateCh!((10,20,30,{"holder":30})) | custodyACh!(10) | custodyBCh!(20) |
    ${aService} ${bService}
    ${extractContract(coreName)} |
    ${coreName}!(*actor, "holder", 1, 1, 10, 20, 30, {"holder":30}, *opRet) |
    for (@receipt <- opRet) { for (@(ra,rb,ts,_p) <<- stateCh & @ca <<- custodyACh & @cb <<- custodyBCh) { return!((receipt,ra,rb,ts,ca,cb)) } }
  }`
}

function guardHarness(verb) {
  const signatures = {
    addLiquidity: 'contract poolService(_id, @"addLiquidity"',
    removeLiquidity: 'contract poolService(_id, @"removeLiquidity"',
    swap: 'contract poolService(_id, @"swap"',
  }
  const contract = extractByMarker(signatures[verb]).replaceAll('${POOL_MAX_RESERVE_UNITS}', '10000000')
  const call = verb === 'addLiquidity'
    ? 'poolService!(*actor, "addLiquidity", 1, 2, 0, 10, 20, 30, *opRet)'
    : verb === 'removeLiquidity'
      ? 'poolService!(*actor, "removeLiquidity", 1, 0, 0, 10, 20, 30, *opRet)'
      : 'poolService!(*actor, "swap", "A_TO_B", 1, 0, 10, 20, 30, *opRet)'
  return `new return, stateCh, purseA, purseB, revAddr, assetAService, assetBService, addCore, removeCore, swapAtoB, swapBtoA, poolService, actor, opRet in {
    stateCh!((10,20,30,{"holder":30})) |
    contract purseA(@"getBalance", ret) = { ret!(11) } |
    contract purseB(@"getBalance", ret) = { ret!(20) } |
    contract revAddr(@"fromDeployerId", _id, ret) = { ret!("holder") } |
    contract assetAService(@"balanceOf", @holder, ret) = { ret!(100) } |
    contract assetBService(@"balanceOf", @holder, ret) = { ret!(100) } |
    ${contract} |
    ${call} |
    for (@receipt <- opRet) { for (@(ra,rb,ts,_p) <<- stateCh) { return!((receipt,ra,rb,ts)) } }
  }`
}

const scenarios = [
  ['add-compensated', addHarness({ rollback: true }), 'pool-error', [10,20,30,10,20]],
  ['add-fatal', addHarness({ rollback: false }), 'pool-fatal', [10,20,30,11,20]],
  ['remove-compensated', removeHarness({ rollback: true }), 'pool-error', [10,20,30,10,20]],
  ['remove-fatal', removeHarness({ rollback: false }), 'pool-fatal', [10,20,30,9,20]],
  ['swap-a-b-compensated', swapHarness('A_TO_B', { rollback: true }), 'pool-error', [10,20,30,10,20]],
  ['swap-a-b-fatal', swapHarness('A_TO_B', { rollback: false }), 'pool-fatal', [10,20,30,11,20]],
  ['swap-b-a-compensated', swapHarness('B_TO_A', { rollback: true }), 'pool-error', [10,20,30,10,20]],
  ['swap-b-a-fatal', swapHarness('B_TO_A', { rollback: false }), 'pool-fatal', [10,20,30,10,21]],
]

const evidence = { generatedAt: new Date().toISOString(), api: API, mode: 'explore-deploy (non-persistent)', scenarios: [] }
for (const [name, term, tag, expectedState] of scenarios) {
  const { value, block } = await explore(term)
  assert.ok(Array.isArray(value) && Array.isArray(value[0]), `${name}: unexpected result`)
  assert.equal(value[0][0], tag, `${name}: wrong receipt tag`)
  assert.deepEqual(value.slice(1), expectedState, `${name}: recorded/custody state mismatch`)
  const custodyMatches = value[1] === value[4] && value[2] === value[5]
  assert.equal(custodyMatches, tag !== 'pool-fatal', `${name}: fail-closed custody expectation wrong`)
  evidence.scenarios.push({ name, receipt: value[0], recorded: value.slice(1,4), actualCustody: value.slice(4,6), custodyMatches, blockNumber: block?.blockNumber, blockHash: block?.blockHash })
  console.log(`PASS ${name} @ finalized context #${block?.blockNumber}: ${tag}, custody=${custodyMatches ? 'match' : 'MISMATCH'}`)
}

for (const verb of ['addLiquidity', 'removeLiquidity', 'swap']) {
  const { value, block } = await explore(guardHarness(verb))
  assert.deepEqual(value, [['pool-error', 'custody balance mismatch'], 10, 20, 30], `${verb}: fail-closed entrypoint guard failed`)
  evidence.scenarios.push({ name: `${verb}-custody-guard`, receipt: value[0], recorded: value.slice(1), actualCustody: [11, 20], custodyMatches: false, blockNumber: block?.blockNumber, blockHash: block?.blockHash })
  console.log(`PASS ${verb}-custody-guard @ finalized context #${block?.blockNumber}: pool-error, custody=MISMATCH`)
}

const forgedIdentityProbe = `new return, RevAddress(\`rho:rev:address\`), fake, resultCh in {
  RevAddress!("fromDeployerId", *fake, *resultCh) |
  for (@result <- resultCh) {
    match result {
      Nil => { return!(true) }
      _ => { return!(false) }
    }
  }
}`
const forged = await explore(forgedIdentityProbe)
assert.equal(forged.value, true, 'fresh private name must not be accepted as a deployerId')
evidence.scenarios.push({ name: 'fresh-private-name-rejected-as-deployerId', result: true, blockNumber: forged.block?.blockNumber, blockHash: forged.block?.blockHash })
console.log(`PASS fresh-private-name-rejected-as-deployerId @ finalized context #${forged.block?.blockNumber}`)

if (process.argv.includes('--write-evidence')) {
  writeFileSync(new URL('../docs/evidence/phase07-rholang-recovery-explore-2026-10-11.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n')
}
console.log(`Rholang recovery explore PASS (${scenarios.length + 4} scenarios; non-persistent exploratory execution).`)
