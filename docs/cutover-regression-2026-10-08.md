# Cut-over regression check — run 2026-10-05 (for Fri 9 Oct swap)

**Verdict: GO WITH WARNINGS.** No FAILs. Warnings: A-record TTL still 900s, payment-function logs could not be queried, and 5 items need you.

Note: the system clock said Mon 5 Oct when this ran, not Thu 8 Oct. Re-run on Thursday if you want a final pass (the blog freeze and TTL checks matter most then).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Legacy URL redirects | PASS (1 note) | 143 unique paths tested; 139 end in 200 (all 88 `/wopecar-blog/*` redirect to `/blog/<slug>` and load, all 4 legacy `/book-a-car/*` cars, all `/location/*`, `/page/*`). Missing blog posts: none (90 posts in DB, 88 old-site slugs all present) |
| 2 | Blog images | PASS | Only 1 post still references `wopecar.com/uploads`: `teamwork-at-emy-africa-expo-2025-…` (the known one). 5 sampled `blog-images` storage URLs: all 200 |
| 3 | Core pages | PASS | All 25 URLs 200 with sensible titles. `/who-we-are` links to `/careers`. robots disallows `/payment/`; sitemap `<loc>`s use `https://wopecar.com` (200 of 200) |
| 4a | paystack-webhook unsigned | PASS | 401 |
| 4b | confirm-booking-payment, no auth | PASS | 401 |
| 4c | payment/callback | PASS | `wopecar://` redirect target returns 200; `https://evil.com` returns 400 |
| 4d | Edge-function logs, last 3 days | WARN | Could not query: the Supabase log tool rejected the table names I tried (`function_edge_logs`, `edge_logs`, `function_logs` all "does not exist"). Not checked, so no "amount mismatch" findings either way |
| 4e | Suspicious bookings, last 3 days | PASS | 0 rows for unpaid-with-ref or paid-without-ref. Only 1 booking was created in 3 days (unpaid, no ref) |
| 5 | DNS / Vercel | WARN | A = 209.182.202.254, **TTL still 900** (not lowered). MX = Google ASPMX (5 records), SPF intact, www CNAME = wopecar.com, admin CNAME = cname.vercel-dns.com, NS = inmotionhosting. Latest production deploy Ready (~1h old). `wopecar.com` + `www.wopecar.com` attached to wopecar-website. Website repo clean and pushed |
| 6 | Dry run via 76.76.21.21 | PASS | Apex: new homepage title. `www…/book-a-car?x=1` → 308 to `https://wopecar.com/book-a-car?x=1`. `/location/accra` → 308 to `/regions/greater-accra` |

## Details for non-PASS items

- **#1 note:** the 4 paths that returned 404 are not real pages: `//fonts.gstatic.com` (scrape artifact), `/custom-css`, `/social-login/google`, `/social-login/facebook`. The social-login ones are OAuth links on the old site's login page; the new site has no equivalent (Google/Facebook sign-in isn't offered on the website). Nobody should be landing on them from search.
- **#4d (RESOLVED by Yusif: no errors in any of the 3 functions' logs):** was a manual look in Supabase Dashboard → Edge Functions → `confirm-booking-payment` / `paystack-webhook` / `paystack-initialize` → Logs, filtered to the last 3 days, for any 4xx/5xx or "amount mismatch / does not cover". Given only 1 booking was created in 3 days (unpaid, no payment ref), the real risk is very low.
- **#5 TTL:** in the InMotion DNS zone editor, set the A record for `wopecar.com` to TTL 300. Do it at least 15 minutes before the swap. Rollback record: `A wopecar.com 209.182.202.254 TTL 900`.

## Needs the user (can't be verified from here)

1. **Supabase Auth URLs** (production `tndkuzxaddrwrunhbrap`): Site URL = `https://wopecar.com`; Redirect URLs include `https://wopecar.com/**` and `https://www.wopecar.com/**`.
2. ~~**Paystack LIVE webhook URL**~~ — DONE (confirmed by Yusif, not independently verifiable). URL: `https://tndkuzxaddrwrunhbrap.supabase.co/functions/v1/paystack-webhook`.
3. **Blog publishing frozen on the old site.** Re-check Thursday: if `sitemap-news.xml` gains a post, tell me and I'll import it.
4. ~~Lower the A-record TTL to 300~~ — DONE (confirmed via `dig`: 300s, same IP).
5. ~~Decide on live payments Friday~~ — DECIDED: live payments confirmed from Friday (Yusif). Still to do: verify Search Console for `wopecar.com`.
