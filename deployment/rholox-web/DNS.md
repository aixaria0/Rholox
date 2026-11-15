# Namecheap Advanced DNS — rholox.com

Do not configure DNS until the NEW GitHub Pages repository exists, has deployed successfully, and rholox.com has been saved as the custom domain in Settings > Pages.

| Type | Host | Target | TTL |
|---|---|---|---|
| A | @ | 185.199.108.153 | Automatic |
| A | @ | 185.199.109.153 | Automatic |
| A | @ | 185.199.110.153 | Automatic |
| A | @ | 185.199.111.153 | Automatic |
| CNAME | www | aixaria0.github.io | Automatic |

Keep Namecheap BasicDNS nameservers. Avoid wildcard DNS. Preserve any existing TXT/MX records. DNS propagation can take 24 hours. Then enable Enforce HTTPS after GitHub provisions the certificate.

When publishing via GitHub Actions, the Pages custom-domain setting is authoritative; a CNAME file is not necessary.

Official docs: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
