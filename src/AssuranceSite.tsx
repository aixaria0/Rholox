import React, { useEffect, useMemo, useState } from 'react'
import rholoxLogo from './assets/rholox-logo.svg'
import './assurance-site.css'

const DEPLOY_ID = '304402203a7a87b2fe2fdb23d583f7f98871979636bd171cf4cb1238d58e0c26ba4f2ae50220592d5a704d5c3bab32b2ed4231b7d8a42ca0efcae31769f2468ebd0cf2023385'
const PACKAGE_DIGEST = 'e005467ee4cc863e9d36d26e700afb91764332e807b1bff653482fc9f2048cf2'

const prs = [
  { name: 'Rholox', number: 15, state: 'GREEN', href: 'https://github.com/aixaria0/Rholox/pull/15', role: 'Product surface' },
  { name: 'Sentinel', number: 8, state: 'GREEN', href: 'https://github.com/aixaria0/rchain-sentinel/pull/8', role: 'Observation plane' },
  { name: 'RCHAIN-COMPLIER', number: 42, state: 'GREEN', href: 'https://github.com/aixaria0/RCHAIN-COMPLIER/pull/42', role: 'Assurance engine' },
]

const stages = [
  { label: 'SIGNED', state: 'OBSERVED', tone: 'good', detail: 'Local session key' },
  { label: 'SUBMITTED', state: 'OBSERVED', tone: 'good', detail: 'Public testnet' },
  { label: 'INCLUDED', state: 'OBSERVED', tone: 'good', detail: 'Block #765' },
  { label: 'FINALIZED CHAIN', state: 'OBSERVED', tone: 'good', detail: 'Observed through #771' },
  { label: 'TYPED EXECUTION RECEIPT', state: 'MISSING', tone: 'blocked', detail: 'Native Nil → API []' },
  { label: 'INDEPENDENT OBSERVER', state: 'MISSING', tone: 'blocked', detail: 'Second approved pin' },
  { label: 'EXTERNAL SNAPSHOT PIN', state: 'MISSING', tone: 'blocked', detail: 'Reviewer/operator commitment' },
]

const verdicts = [
  { key: 'PASS', title: 'PASS', copy: 'Every required bounded check reproduces under external trust pins.', className: 'pass' },
  { key: 'BLOCKED', title: 'BLOCKED', copy: 'No contradiction is proven, but required evidence is incomplete or unavailable.', className: 'blocked' },
  { key: 'FAIL', title: 'FAIL', copy: 'The claim, binding, canonical evidence, integrity, or replay invariant is contradicted.', className: 'fail' },
]

function short(value: string, left = 12, right = 10) {
  return value.length <= left + right + 1 ? value : `${value.slice(0, left)}…${value.slice(-right)}`
}

function openRholox() {
  history.pushState(null, '', `${window.location.pathname}${window.location.search}`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export default function AssuranceSite() {
  const [copied, setCopied] = useState(false)
  const [selectedVerdict, setSelectedVerdict] = useState('BLOCKED')
  const selected = useMemo(() => verdicts.find((item) => item.key === selectedVerdict)!, [selectedVerdict])

  useEffect(() => {
    const prior = document.title
    document.title = 'RChain Assurance · Evidence before trust'
    return () => { document.title = prior }
  }, [])

  async function copyDeploy() {
    await navigator.clipboard.writeText(DEPLOY_ID)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <main className="assurance-site">
      <div className="assurance-noise" aria-hidden="true" />
      <div className="assurance-grid" aria-hidden="true" />

      <header className="assurance-topbar">
        <button className="assurance-brand" type="button" onClick={openRholox} aria-label="Back to Rholox">
          <img src={rholoxLogo} alt="" />
          <span>RHOLOX</span>
          <i />
          <strong>ASSURANCE</strong>
        </button>
        <nav aria-label="Assurance navigation">
          <a href="#assurance-model">MODEL</a>
          <a href="#assurance-live">LIVE RC</a>
          <a href="#assurance-evidence">EVIDENCE</a>
        </nav>
        <div className="assurance-top-actions">
          <span className="assurance-network"><i /> PUBLIC TESTNET</span>
          <button type="button" onClick={openRholox}>OPEN RHOLOX</button>
        </div>
      </header>

      <section className="assurance-hero">
        <div className="assurance-hero-copy">
          <div className="assurance-kicker"><span>RCHAIN ASSURANCE</span><b>RELEASE CANDIDATE</b></div>
          <h1>Evidence<br />before <em>trust.</em></h1>
          <p className="assurance-lede">A bounded assurance layer for critical RChain state transitions. It exposes what the network actually supports—and refuses to silently promote missing evidence into truth.</p>
          <div className="assurance-hero-actions">
            <a className="assurance-primary" href="#assurance-live">INSPECT LIVE RC <span>↓</span></a>
            <a className="assurance-secondary" href="https://github.com/aixaria0/Rholox/pull/15" target="_blank" rel="noreferrer">VIEW DRAFT PR ↗</a>
          </div>
          <div className="assurance-meta-row">
            <span><b>03</b> COMPONENTS</span>
            <span><b>03</b> GREEN PRs</span>
            <span><b>01</b> BOUNDED VERDICT</span>
          </div>
        </div>

        <aside className="assurance-console" aria-label="Current assurance verdict">
          <div className="console-head"><span>LIVE ASSURANCE / REV TRANSFER</span><i>RC.01</i></div>
          <div className="console-verdict">
            <span>CURRENT VERDICT</span>
            <strong>BLOCKED</strong>
            <p>Evidence boundary held.</p>
          </div>
          <div className="console-stages">
            {stages.map((stage) => (
              <div className={`console-stage console-stage--${stage.tone}`} key={stage.label}>
                <i />
                <span>{stage.label}</span>
                <strong>{stage.state}</strong>
                <small>{stage.detail}</small>
              </div>
            ))}
          </div>
          <div className="console-foot"><span>NO SYNTHETIC PASS</span><span>NO WEAKENED GATE</span></div>
        </aside>
      </section>

      <section className="assurance-thesis" aria-label="RChain Assurance principle">
        <span>THE RULE</span>
        <p>Actions create claims. Claims require evidence. Evidence must survive independent checks. <strong>Missing evidence never silently becomes truth.</strong></p>
      </section>

      <section className="assurance-section" id="assurance-model">
        <div className="assurance-section-head">
          <div><span className="assurance-index">01 / MODEL</span><h2>One path. Three trust boundaries.</h2></div>
          <p>Product UX, network observation, and deterministic verification stay separate by design.</p>
        </div>
        <div className="assurance-architecture">
          <article><span>01</span><div className="architecture-glyph architecture-glyph--surface" /><h3>Rholox</h3><p>Action lifecycle + evidence-backed explanation.</p><b>PRODUCT SURFACE</b></article>
          <div className="architecture-link"><i /><span>deploy / action identity</span></div>
          <article><span>02</span><div className="architecture-glyph architecture-glyph--observe" /><h3>Sentinel</h3><p>Read-only canonical and cross-node observations.</p><b>OBSERVATION PLANE</b></article>
          <div className="architecture-link"><i /><span>rchain-assurance/v1</span></div>
          <article><span>03</span><div className="architecture-glyph architecture-glyph--verify" /><h3>RCHAIN-COMPLIER</h3><p>Externally pinned deterministic verification.</p><b>ASSURANCE ENGINE</b></article>
        </div>

        <div className="assurance-verdict-model">
          <div className="verdict-tabs" role="tablist" aria-label="Verdict semantics">
            {verdicts.map((item) => <button type="button" role="tab" aria-selected={selectedVerdict === item.key} className={selectedVerdict === item.key ? `active ${item.className}` : ''} onClick={() => setSelectedVerdict(item.key)} key={item.key}>{item.title}</button>)}
          </div>
          <div className={`verdict-explainer verdict-explainer--${selected.className}`}>
            <span>{selected.title} SEMANTICS</span>
            <p>{selected.copy}</p>
          </div>
        </div>
      </section>

      <section className="assurance-section assurance-live" id="assurance-live">
        <div className="assurance-section-head">
          <div><span className="assurance-index">02 / LIVE RC</span><h2>The useful result was not PASS.</h2></div>
          <p>A real REV transfer happened. The evidence was still insufficient for the stronger assurance claim, so the system stopped at BLOCKED.</p>
        </div>

        <div className="live-grid">
          <article className="live-story">
            <div className="live-story-head"><span>AUTHORIZED TESTNET RUN</span><b>BLOCKED</b></div>
            <div className="live-fact"><span>TRANSFER</span><strong>100 drops</strong><small>Observed recipient balance change</small></div>
            <div className="live-fact"><span>INCLUSION</span><strong>#765</strong><small>Canonical deploy observed</small></div>
            <div className="live-fact"><span>FINALIZED OBSERVATION</span><strong>#771</strong><small>Read-only resume snapshot</small></div>
            <div className="live-fact live-fact--blocked"><span>EXECUTION RECEIPT</span><strong>UNKNOWN</strong><small>Classic native REV success returns Nil; API exposes []</small></div>
          </article>

          <article className="why-blocked">
            <span className="why-label">WHY BLOCKED?</span>
            <h3>Three missing proofs. Zero guessed facts.</h3>
            <ol>
              <li><b>01</b><div><strong>Typed positive receipt</strong><p>Current native/API path exposes successful REV return as Nil → []. Balance change alone is not promoted into execution proof.</p></div></li>
              <li><b>02</b><div><strong>Second independent observer</strong><p>One approved endpoint cannot satisfy the configured independent observer boundary.</p></div></li>
              <li><b>03</b><div><strong>Independent snapshot pin</strong><p>Received-package integrity is bookkeeping; only a separately supplied reviewer/operator commitment establishes external pinning.</p></div></li>
            </ol>
          </article>
        </div>
      </section>

      <section className="assurance-section" id="assurance-evidence">
        <div className="assurance-section-head">
          <div><span className="assurance-index">03 / EVIDENCE</span><h2>Review the claim, not the marketing.</h2></div>
          <p>The RC remains Draft. Source revisions, tests, evidence snapshots, and negative controls are reviewable in the three implementation PRs.</p>
        </div>

        <div className="evidence-ledger">
          <div className="ledger-id">
            <span>LIVE DEPLOY ID</span>
            <code title={DEPLOY_ID}>{short(DEPLOY_ID, 20, 16)}</code>
            <button type="button" onClick={copyDeploy}>{copied ? 'COPIED' : 'COPY'}</button>
          </div>
          <div className="ledger-id">
            <span>RC PACKAGE DIGEST</span>
            <code title={PACKAGE_DIGEST}>{short(PACKAGE_DIGEST, 20, 16)}</code>
            <b>UNPINNED LIVE</b>
          </div>
        </div>

        <div className="pr-grid">
          {prs.map((pr) => (
            <a href={pr.href} target="_blank" rel="noreferrer" className="pr-card" key={pr.name}>
              <div><span>{pr.role}</span><b>{pr.state}</b></div>
              <h3>{pr.name}</h3>
              <p>Draft PR #{pr.number}</p>
              <footer><span>OPEN ON GITHUB</span><strong>↗</strong></footer>
            </a>
          ))}
        </div>

        <div className="assurance-boundary">
          <span>PRODUCT BOUNDARY</span>
          <p>RChain Assurance does not replace Casper, claim stake-weighted finality from observer counts, or make governance autonomous. It makes the evidence boundary explicit before a critical state transition is trusted.</p>
        </div>
      </section>

      <footer className="assurance-footer">
        <div><img src={rholoxLogo} alt="" /><span>RCHAIN ASSURANCE / RHOLOX</span></div>
        <p>Failure visible before failure becomes trust.</p>
        <button type="button" onClick={openRholox}>RETURN TO RHOLOX ↑</button>
      </footer>
    </main>
  )
}
