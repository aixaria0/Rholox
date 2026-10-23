# Legacy REV lookup utility

The application and endpoint are public source. Historical reference records are provisioned separately and never participate in a source checkout, CI test, application build or deployment artifact. The browser receives metadata and one requested address result; it does not download the reference file or expose a spreadsheet link.

## Requirements and private import

Use Node.js 22 for the importer and PHP 8.2+ with Sodium for the endpoint. The input CSV must contain the exact header `address,balance_drops`, followed by one case-sensitive, checksum-valid REV address and canonical unsigned integer amount per row. Duplicate addresses, decimals, exponential notation and values above unsigned 64-bit range are rejected. One REV is 100,000,000 integer units.

```bash
npm ci
node scripts/prepare-rev-snapshot.mjs /secure/reference.csv /srv/rholox-private-next YYYY-MM-DD
```

Replace the date placeholder with the date established by the source title. The importer validates every address checksum and amount, sorts addresses deterministically, and creates `balances.json` and `manifest.json` with private file permissions. The manifest pins byte length, SHA-256, count, date and units. It refuses to overwrite existing files; use a fresh private output directory. Review provenance separately: successful validation is not authentication of the historical chain state. Do not put the input file into this repository.

The output must stay outside the repository and web root. The importer rejects the repository and conventional public web directory names, including their resolved paths. Operators remain responsible for deployment-specific aliases and mounts. Keep the directory mode `0700` and files `0600`, readable by the PHP account.

## Deployment

1. Run the full verification and build. Publish `dist/`, including hidden hosting policy files and `api/legacy-rev.php`. The build requires no historical data.
2. Put the validated reference directory outside the public root. By default, for `PUBLIC_ROOT/api/legacy-rev.php`, the endpoint reads `rholox-private` alongside `PUBLIC_ROOT`. Alternatively set the server-side `RHOLOX_REV_DATA_DIR` environment variable to an absolute private directory. No browser configuration contains that path.
3. The endpoint rejects a resolved reference directory under the configured document root. A missing, corrupt or inconsistent reference produces HTTP 503. Static-only hosts cannot run this utility.
4. Stage the complete new reference directory and switch it as one unit during updates. Retain the preceding directory privately for rollback. Do not independently update the active data and manifest in place.
5. Verify metadata, a known record, a recorded zero, a valid absent address, invalid input, and all old bulk-download URLs. Remove superseded public dataset files and old application assets containing spreadsheet links; an index replacement alone does not remove them.

For a local production-build check:

```bash
npm run build
RHOLOX_REV_DATA_DIR=/srv/rholox-private php -S 127.0.0.1:8082 -t dist
```

Open the loopback URL printed by PHP. Vite development/preview serves the frontend only and does not execute the endpoint.

## Public contract

`GET /api/legacy-rev.php` returns schema version, historical reference date/basis, decimal scale, record count and a revision identifier. It returns no addresses or balances.

`POST /api/legacy-rev.php` accepts `Content-Type: application/json` and exactly one string field, `address`. The body is limited to 256 bytes. The server checks Base58 payload shape and BLAKE2b checksum independently of the browser, checks the private file's digest and structural controls, and returns the metadata plus `address`, `found` and `balance_drops`.

`balance_drops` is a canonical decimal integer string when `found` is true, including the string `"0"`. It is `null` only when the address has no entry. The browser binds the returned address to its request, rejects inconsistent/extra result fields and formats amounts with BigInt. A request or service failure never becomes a zero or absent result.

| Response | Meaning |
| --- | --- |
| 200 | Valid metadata or one validated address result |
| 400 | Invalid address/JSON, query parameters or cross-site browser request |
| 405 | Unsupported method |
| 413 | Request body exceeds the limit |
| 415 | POST is not JSON |
| 503 | Private reference unavailable or invalid |

Responses declare JSON, `Cache-Control: no-store, private` and `nosniff`; CORS access is not granted. Browser transport omits credentials/referrers, refuses redirects, and has a 12-second deadline that covers response-body consumption. Requests use POST bodies rather than address-bearing URL parameters. The endpoint does not write addresses or request bodies to application logs; web-server, proxy and infrastructure logging policies are separate operator responsibilities.

This is a public address lookup, not an authenticated confidential database. Someone who already knows addresses can query them individually. There is no list/export endpoint; operators should apply traffic controls appropriate to their host. The private reference is read and validated for each request, bounded to 50,000 records and 8 MiB. Do not interpret the file digest as a signature or independent proof of historical balances.

## Verification

`npm run test:rev-snapshot` generates synthetic REV addresses and tests client contracts, exact precision and private-import guards. `npm run test:rev-endpoint` tests the PHP contract and integrity failures using temporary synthetic reference files. `npm run check:public-package` rejects reference directories, spreadsheet artifacts and spreadsheet links in the public package. The full `npm run verify` includes these checks; no test requires production records.
