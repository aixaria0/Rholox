# Rholox

**Rholox is an RChain-native DApp platform and testnet gateway.**

The first vertical slice is deliberately small: observe the public RChain testnet accurately before adding wallet signing and write-capable DApps.

## v0.1 scope

- Live node status from `https://testnet.rhobot.net/api/status`
- Node capabilities from `/api/v1/capabilities`
- Latest finalized block and bonded-validator evidence from `/api/last-finalized-block`
- No private keys, no custody, no mainnet value

## Roadmap

1. Network console — live testnet observation
2. Wallet + faucet — local-only key handling and test REV
3. Rholox Proof — signed Rholang deploy, inclusion, finality receipt
4. Explorer — block/evidence detail backed by independent verification
5. `rev.exchange` — only after the deploy/read/finality primitives are proven

## Run

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Static output is written to `dist/` and can be served by the current `rholox.com` hosting.

## Boundary

Rholox is currently **testnet-only**. The public testnet can reset and test REV has no monetary value.
