# Rho Observer — independent static mirror

This repository includes an observer-only, read-only Rholox fallback at:
https://sunaria.si/Rholox/observer-console-v11/

It is separate from the primary website (https://rholox.com/) and from the Rho Observer service (https://testnet.rhobot.net/observer).

## Scope
The mirror reuses the source contract parser and existing RhoObserverPanel. It does NOT import or package wallet code, keys, signing, faucet, PHP, transfer, asset or exchange functionality.

The only external request is GET https://testnet.rhobot.net/observer/v1/observation (cached upstream). The mirror never fetches validator endpoints directly. Polling is at most once per 15 seconds for visible tabs and can be requested manually. Its CSP allows this API origin only.

## Build and test
From the source repository root:

    npm ci
    npm run test:observer
    npm run test:observer-capture
    npm run build:observer-mirror

Output is in dist-observer-mirror with a fixed /Rholox/observer-console-v11/ URL prefix.

Publish only that output into the observer-console-v11 subdirectory of the existing gh-pages branch. Never replace the root or older previews.

## Evidence export
The mirror exports a rho-witness-observer-capture/v1 JSON envelope, containing the fixed source URI, capture timestamp, validated client-serialized report, SHA-256 digest of exact UTF-8 report text, and an explicit unsigned trust boundary.

SHA-256 checks internal integrity; it does not prove the identity of the observer server, the collector or a reviewer. Captures are NOT consensus finality certificates and do not represent stake quorum.

## Rollback and hosting
The existing gh-pages baseline was commit 26f88cd (October 22, 2026). Removing the observer-console-v11 subfolder reverts this additive preview without altering the root.

The main domain rholox.com currently redirects to a cPanel account-suspension page, independent of the observer's runtime. The mirror cannot repair the hosting subscription or unsuspend a cPanel account; restore through the authorized hosting provider.

After hosting is restored, check TLS, DNS, CSP, runtime version, static file digests, public testnet APIs and the PHP-only Legacy REV route separately. Never advertise the mirror as the full primary website.
