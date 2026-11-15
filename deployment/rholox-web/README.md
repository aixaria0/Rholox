# Rholox Free Hosting — standalone GitHub Pages kit

This directory is a template for the independent public repository aixaria0/rholox-web. Its files must be copied to the root of that new repository. The original Rholox source, history and sunaria.si/Rholox deployment are left unchanged.

## Required steps
1. Create public aixaria0/rholox-web; copy the .github, scripts, README.md and DNS.md files from this directory to its repository root.
2. Set repository Settings > Pages > Source to GitHub Actions.
3. Trigger the Rholox | Free Static Deployment workflow. It retrieves aixaria0/Rholox main, runs npm ci and npm run verify, sanitizes the static build and publishes it.
4. In the new repository Settings > Pages, save the Custom domain rholox.com BEFORE changing DNS. Verify domain ownership if offered.
5. Add Namecheap BasicDNS records listed in DNS.md.
6. Wait for certificate issuance, enable Enforce HTTPS and check rholox.com, www.rholox.com and upstream-commit.txt.

The build is refreshed on main-branch updates of the hosting repository, daily on a schedule, or manually. Failed verification blocks deployment. The workflow does not modify DNS, upstream Rholox, sunaria.si, or validator nodes.

## Limitations
GitHub Pages does not execute PHP. The legacy REV PHP backend and any private server-side records will be unavailable. The public sanitizer removes PHP and .htaccess from published assets. Do not treat this as a full backend migration.

The UI may contact public testnet APIs. A Rho Observer HTTP agreement snapshot is not an independent Casper finality certificate or authorization to merge/deploy.

## Rollback
To roll back, pin the upstream source ref to a known-passing commit and redeploy. Remove Namecheap DNS before removing the GitHub Pages domain binding if the site is retired, to avoid dangling DNS records. Domain renewal remains required, but Stellar hosting renewal is not required for the static frontend.
