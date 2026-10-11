import React, { useEffect, useState } from 'react'
import {
  createAsset,
  formatAssetUnits,
  readAssetBalance,
  readAssetInfo,
  sendAsset,
  verifyAssetBrand,
  type AssetCreateReceipt,
  type AssetInfo,
  type AssetTransferReceipt,
} from './lib/asset'
import type { RholoxWallet } from './lib/wallet'

type Props = {
  wallet: RholoxWallet | null
  revBalance: number | null
  onRevBalance?: () => Promise<void>
}

function short(value?: string, left = 12, right = 10) {
  if (!value) return '—'
  if (value.length <= left + right + 1) return value
  return `${value.slice(0, left)}…${value.slice(-right)}`
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

export default function AssetLabPanel({ wallet, revBalance, onRevBalance }: Props) {
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [decimals, setDecimals] = useState('2')
  const [initialSupply, setInitialSupply] = useState('1000')
  const [assetIdInput, setAssetIdInput] = useState('')
  const [asset, setAsset] = useState<AssetInfo | null>(null)
  const [assetObservedBlock, setAssetObservedBlock] = useState<number | null>(null)
  const [issuerBrand, setIssuerBrand] = useState<boolean | null>(null)
  const [walletAssetBalance, setWalletAssetBalance] = useState<number | null>(null)
  const [walletBrand, setWalletBrand] = useState<boolean | null>(null)
  const [createReceipt, setCreateReceipt] = useState<AssetCreateReceipt | null>(null)
  const [transferReceipt, setTransferReceipt] = useState<AssetTransferReceipt | null>(null)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('1')
  const [busy, setBusy] = useState<'create' | 'inspect' | 'transfer' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setWalletAssetBalance(null)
    setWalletBrand(null)
    setTransferReceipt(null)
  }, [wallet?.revAddress])

  async function observeAsset(targetId = assetIdInput.trim()) {
    if (!targetId) return
    setBusy('inspect')
    setError(null)
    try {
      const infoObs = await readAssetInfo(targetId)
      const next = infoObs.value
      const issuerBrandObs = await verifyAssetBrand(next.assetId, next.issuerAddress)
      setAsset(next)
      setAssetIdInput(next.assetId)
      setAssetObservedBlock(infoObs.block?.blockNumber ?? issuerBrandObs.block?.blockNumber ?? null)
      setIssuerBrand(issuerBrandObs.value)
      if (wallet) {
        const [balanceObs, brandObs] = await Promise.all([
          readAssetBalance(next.assetId, wallet.revAddress),
          verifyAssetBrand(next.assetId, wallet.revAddress),
        ])
        setWalletAssetBalance(balanceObs.value)
        setWalletBrand(brandObs.value)
      } else {
        setWalletAssetBalance(null)
        setWalletBrand(null)
      }
    } catch (cause) {
      setAssetObservedBlock(null)
      setError(cause instanceof Error ? cause.message : 'Unable to inspect asset state.')
    } finally {
      setBusy(null)
    }
  }

  async function create() {
    if (!wallet || busy) return
    if (revBalance !== null && revBalance <= 0) {
      setError('Fund this testnet wallet before creating an asset.')
      return
    }
    setBusy('create')
    setError(null)
    setCreateReceipt(null)
    setTransferReceipt(null)
    try {
      const receipt = await createAsset(wallet, {
        name,
        symbol,
        decimals: Number(decimals),
        initialSupply,
      })
      setCreateReceipt(receipt)
      setAsset(receipt.asset)
      setAssetIdInput(receipt.asset.assetId)
      setIssuerBrand(receipt.brandVerified)
      setWalletAssetBalance(receipt.issuerBalanceUnits ?? null)
      setWalletBrand(receipt.brandVerified)
      setAssetObservedBlock(receipt.finalizedBlock?.blockNumber ?? null)
      await onRevBalance?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create test asset.')
    } finally {
      setBusy(null)
    }
  }

  async function transfer() {
    if (!wallet || !asset || !assetObservedBlock || busy) return
    setBusy('transfer')
    setError(null)
    setTransferReceipt(null)
    try {
      const receipt = await sendAsset(wallet, asset, recipient, amount)
      setTransferReceipt(receipt)
      setWalletAssetBalance(receipt.senderBalanceAfter ?? null)
      setWalletBrand(true)
      if (receipt.finalizedBlock) setAssetObservedBlock(receipt.finalizedBlock.blockNumber)
      await onRevBalance?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to transfer asset.')
    } finally {
      setBusy(null)
    }
  }

  const ready = Boolean(asset && assetObservedBlock && issuerBrand)
  const walletBalanceDisplay = asset && walletAssetBalance !== null
    ? `${formatAssetUnits(walletAssetBalance, asset.decimals)} ${asset.symbol}`
    : '—'

  return (
    <section className="asset-lab-card" id="asset-lab">
      <div className="panel-head">
        <div>
          <div className="eyebrow">ASSET LAB</div>
          <h2>Issue and move a fixed-supply test asset.</h2>
        </div>
        <span className="badge">PUBLIC TESTNET</span>
      </div>

      <p className="proof-copy">
        Asset Lab uses the chain&apos;s MakeMint purse model. Creation makes one fixed initial supply;
        transfers move units between same-brand purses. No mainnet value, custody, DEX, or post-creation mint claim is made here.
      </p>

      <div className="asset-boundary" role="note">
        <span>MODEL</span><strong>MakeMint · fixed supply</strong>
        <span>IDENTITY</span><strong>256-bit public-testnet asset ID</strong>
        <span>FINALITY</span><strong>read-back required</strong>
      </div>

      <div className="asset-inspect-row">
        <input
          value={assetIdInput}
          onChange={(event) => setAssetIdInput(event.target.value.trim().toLowerCase())}
          placeholder="64-character asset ID"
          aria-label="Asset ID"
          spellCheck={false}
          autoComplete="off"
        />
        <button className="ghost" type="button" onClick={() => observeAsset()} disabled={busy !== null || !assetIdInput.trim()}>
          {busy === 'inspect' ? 'VERIFYING…' : 'INSPECT ASSET'}
        </button>
      </div>

      {asset && (
        <div className="asset-observation">
          <div className="asset-title-row">
            <div>
              <span className="asset-symbol">{asset.symbol}</span>
              <strong>{asset.name}</strong>
            </div>
            <span className={ready ? 'badge badge--verified' : 'badge'}>{ready ? 'FINALIZED · VERIFIED' : 'PENDING / UNVERIFIED'}</span>
          </div>
          <div className="asset-id-line">
            <span>ASSET ID</span><code>{asset.assetId}</code>
            <button className="mini" type="button" onClick={() => copyText(asset.assetId)}>COPY</button>
          </div>
          <dl className="asset-facts">
            <div><dt>Issuer</dt><dd title={asset.issuerAddress}>{short(asset.issuerAddress, 14, 10)}</dd></div>
            <div><dt>Initial supply</dt><dd>{formatAssetUnits(asset.supplyUnits, asset.decimals)} {asset.symbol}</dd></div>
            <div><dt>Decimals</dt><dd>{asset.decimals}</dd></div>
            <div><dt>Issuer brand</dt><dd>{issuerBrand === null ? 'UNKNOWN' : issuerBrand ? 'VERIFIED' : 'FAILED'}</dd></div>
            <div><dt>Observed block</dt><dd>{assetObservedBlock ? `#${assetObservedBlock}` : '—'}</dd></div>
            <div><dt>Your balance</dt><dd>{wallet ? walletBalanceDisplay : 'CONNECT SESSION WALLET'}</dd></div>
          </dl>
          {!ready && (
            <button className="ghost" type="button" onClick={() => observeAsset(asset.assetId)} disabled={busy !== null}>
              VERIFY FINALIZED STATE
            </button>
          )}
        </div>
      )}

      {!wallet ? (
        <div className="asset-locked" role="status">
          <strong>Creation and transfer require a session wallet.</strong>
          <span>You can still inspect a known Asset ID above. Create or import a testnet wallet to sign Asset Lab deploys.</span>
        </div>
      ) : (
        <div className="asset-work-grid">
          <article className="asset-work-panel">
            <div className="eyebrow">CREATE</div>
            <h3>Fixed-supply asset</h3>
            <div className="asset-form-grid">
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Asset name" aria-label="Asset name" maxLength={40} />
              <input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="Symbol" aria-label="Asset symbol" maxLength={8} spellCheck={false} />
              <input value={decimals} onChange={(event) => setDecimals(event.target.value)} placeholder="Decimals" aria-label="Asset decimals" inputMode="numeric" />
              <input value={initialSupply} onChange={(event) => setInitialSupply(event.target.value)} placeholder="Initial supply" aria-label="Initial asset supply" inputMode="decimal" />
            </div>
            <div className="wallet-controls">
              <button className="primary" type="button" onClick={create} disabled={busy !== null || !name.trim() || !symbol.trim() || !initialSupply.trim()}>
                {busy === 'create' ? 'SIGNING / VERIFYING…' : 'CREATE TEST ASSET'}
              </button>
              <span className="muted">Supply is fixed after this deploy.</span>
            </div>
          </article>

          <article className="asset-work-panel">
            <div className="eyebrow">TRANSFER</div>
            <h3>{asset ? `Send ${asset.symbol}` : 'Inspect an asset first'}</h3>
            <div className="asset-transfer-grid">
              <input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Recipient REV address" aria-label="Asset recipient REV address" spellCheck={false} autoComplete="off" />
              <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" aria-label="Asset transfer amount" inputMode="decimal" />
            </div>
            <div className="wallet-controls">
              <button className="primary" type="button" onClick={transfer} disabled={busy !== null || !asset || !ready || !recipient.trim() || !amount.trim()}>
                {busy === 'transfer' ? 'SIGNING / VERIFYING…' : 'SEND TEST ASSET'}
              </button>
              <span className="muted">{asset ? walletBalanceDisplay : 'No verified asset selected'}</span>
            </div>
            {asset && walletBrand !== null && <div className="asset-brand-line">YOUR PURSE BRAND · {walletBrand ? 'VERIFIED' : 'NOT VERIFIED'}</div>}
          </article>
        </div>
      )}

      {createReceipt && (
        <div className="proof-receipt asset-receipt">
          <div><span>CREATE DEPLOY</span><code>{createReceipt.deployId}</code></div>
          <div><span>INCLUSION</span><code>#{createReceipt.inclusionBlock.blockNumber} · {short(createReceipt.inclusionBlock.blockHash)}</code></div>
          <div><span>FINALITY</span><strong className={createReceipt.finalized ? 'receipt-good' : 'receipt-warn'}>{createReceipt.finalized ? `VERIFIED @ #${createReceipt.finalizedBlock?.blockNumber}` : 'PENDING — recheck Asset ID'}</strong></div>
        </div>
      )}

      {transferReceipt && (
        <div className="proof-receipt asset-receipt">
          <div><span>TRANSFER</span><strong>{transferReceipt.amountDisplay} {transferReceipt.asset.symbol}</strong></div>
          <div><span>TO</span><code>{transferReceipt.to}</code></div>
          <div><span>DEPLOY</span><code>{transferReceipt.deployId}</code></div>
          <div><span>INCLUSION</span><code>#{transferReceipt.inclusionBlock.blockNumber} · {short(transferReceipt.inclusionBlock.blockHash)}</code></div>
          <div><span>FINALITY</span><strong className={transferReceipt.finalized ? 'receipt-good' : 'receipt-warn'}>{transferReceipt.finalized ? `VERIFIED @ #${transferReceipt.finalizedBlock?.blockNumber}` : 'PENDING — inclusion verified'}</strong></div>
          <div><span>RECIPIENT BRAND</span><strong className={transferReceipt.recipientBrandVerified ? 'receipt-good' : 'receipt-warn'}>{transferReceipt.recipientBrandVerified ? 'VERIFIED' : 'PENDING'}</strong></div>
        </div>
      )}

      {error && <div className="error" role="alert">{error}</div>}
    </section>
  )
}
