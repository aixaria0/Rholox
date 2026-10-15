import React, { useEffect } from 'react'
import rholoxLogo from './assets/rholox-logo.svg'
import './assurance-site.css'

const prs = [
  ['Rholox #15', 'https://github.com/aixaria0/Rholox/pull/15'],
  ['Sentinel #8', 'https://github.com/aixaria0/rchain-sentinel/pull/8'],
  ['RCHAIN-COMPLIER #42', 'https://github.com/aixaria0/RCHAIN-COMPLIER/pull/42'],
]

const evidence = [
  ['Signed + submitted', 'Observed', 'ok'],
  ['Included in block #765', 'Observed', 'ok'],
  ['Finalized chain observed through #771', 'Observed', 'ok'],
  ['Typed execution receipt', 'Missing', 'warn'],
  ['Second independent observer', 'Missing', 'warn'],
  ['Independent snapshot pin', 'Missing', 'warn'],
]

function openRholox() {
  history.pushState(null, '', `${window.location.pathname}${window.location.search}`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

export default function AssuranceSite() {
  useEffect(() => {
    const previous = document.title
    document.title = 'RChain Assurance'
    return () => { document.title = previous }
  }, [])

  return (
    <main className="simple-assurance">
      <header className="simple-header">
        <button onClick={openRholox} className="simple-brand" type="button">
          <img src={rholoxLogo} alt="" />
          <span>RHOLOX</span>
        </button>
        <span className="simple-status">PUBLIC TESTNET</span>
      </header>

      <section className="simple-hero">
        <p className="simple-label">RCHAIN ASSURANCE</p>
        <h1>Show the evidence before asking people to trust the result.</h1>
        <p className="simple-intro">
          Rholox shows the action. Sentinel observes the network. RCHAIN-COMPLIER checks what the evidence actually supports.
        </p>
      </section>

      <section className="simple-verdict" aria-label="Current verdict">
        <div>
          <span>CURRENT LIVE VERDICT</span>
          <strong>BLOCKED</strong>
        </div>
        <p>
          The transfer was signed, submitted, included, and observed on the finalized chain. We still do not have enough independent evidence to call the stronger assurance claim PASS.
        </p>
      </section>

      <section className="simple-section">
        <h2>How it works</h2>
        <div className="simple-flow" aria-label="RChain Assurance architecture">
          <div><strong>Rholox</strong><span>action + user view</span></div>
          <b>→</b>
          <div><strong>Sentinel</strong><span>network observation</span></div>
          <b>→</b>
          <div><strong>RCHAIN-COMPLIER</strong><span>independent verification</span></div>
        </div>
      </section>

      <section className="simple-section">
        <h2>What the live run proved</h2>
        <div className="simple-evidence">
          {evidence.map(([label, state, tone]) => (
            <div className="simple-evidence-row" key={label}>
              <span>{label}</span>
              <strong className={tone}>{state}</strong>
            </div>
          ))}
        </div>
        <p className="simple-note">
          The current RNode path returns a successful native REV result as Nil, which the API exposes as an empty result. We keep execution evidence incomplete instead of turning that into a synthetic PASS.
        </p>
      </section>

      <section className="simple-section simple-prs">
        <h2>Review the implementation</h2>
        <div>
          {prs.map(([label, href]) => (
            <a href={href} target="_blank" rel="noreferrer" key={label}>{label} ↗</a>
          ))}
        </div>
      </section>

      <footer className="simple-footer">
        <p>Missing evidence does not become truth.</p>
        <button onClick={openRholox} type="button">Back to Rholox</button>
      </footer>
    </main>
  )
}
