# wopecar.com cut-over — Friday 9 October 2026

Goal: point `wopecar.com` at the new website (Vercel project `wopecar-website`).
The only DNS change is **one A record**. Everything else is verification.

## What was found and already done (no action needed)

| Item | State |
|---|---|
| DNS host | InMotion Hosting nameservers (`ns1/ns2.inmotionhosting.com`) — zone is edited there |
| Current records | `A wopecar.com → 209.182.202.254` (old Laravel server), TTL 900s (15 min). `www` is a CNAME to `wopecar.com`. No AAAA, no CAA |
| Email | Google Workspace (MX → `ASPMX.L.GOOGLE.com`). SPF includes Google + the old server IP. **The A-record change does not touch MX/SPF/DKIM/DMARC** |
| `admin.wopecar.com` | CNAME → `cname.vercel-dns.com` (wopecar-admin project). Unaffected |
| Vercel project | `wopecar.com` **and** `www.wopecar.com` are both attached to `wopecar-website`. HTTPS certificates are issued automatically once DNS points at Vercel |
| www → apex | 308 redirect built and deployed (`www.wopecar.com/x?y=1` → `wopecar.com/x?y=1`) |
| Blog images | 84 blog posts re-hosted from `wopecar.com/uploads` to Supabase storage (bucket `blog-images`); originals backed up in `blog_image_migration_backup` |
| Car photos | 115/123 listings already on Supabase storage, 0 on the old host |
| Legacy URL redirects | All 135 legacy URLs (from the old sitemaps + nav) now resolve to a 200 on the new site, incl. 17 `/location/*` pages → `/regions/*`, `/page/*` aliases, `/register`, all 88 `/wopecar-blog/*` posts |
| Dry run | Apex serves the new homepage, www redirects, legacy URLs 308 — verified against Vercel's edge (`76.76.21.21`) with Host headers (HTTPS can't be tested until DNS points at Vercel) |

## Before Friday (Wed/Thu)

- [ ] **Lower the A record TTL** to 300s (currently 900s) so a rollback is ~5 min. Do this at least 15 min (old TTL) before the change — Wednesday is plenty.
- [ ] **Note the current record** exactly (so rollback is a copy-paste): `A  wopecar.com  209.182.202.254  TTL 900`.
- [ ] **Freeze blog publishing on the OLD site.** Any post published there after today won't exist on the new site. (Ask me to import any that appear — it's a 10-minute job per post.)
- [ ] **Supabase Auth URLs** (Dashboard → Authentication → URL Configuration, production project `tndkuzxaddrwrunhbrap`): Site URL = `https://wopecar.com`; Redirect URLs include `https://wopecar.com/**` and `https://www.wopecar.com/**`. Needed for email-confirmation / password-reset links from the website. *(Not verifiable from here.)*
- [ ] **Paystack**: decide whether the website takes live payments on Friday. If yes: do one small live payment + refund after the cut-over, before announcing.
- [ ] Google Search Console: have `wopecar.com` verified (domain property is easiest — DNS TXT record, added in the same InMotion zone, doesn't affect anything else).
- [ ] Content sign-off: legal pages (Terms, Privacy, EULA, WopeCare terms), Detty December banner/dates.
- [ ] Decide on the 2 dead images in the blog post "Teamwork at EMY Africa Expo 2025…" (already broken on the old site) — re-upload or remove in admin.

## Cut-over (pick a quiet hour; allow ~30 min)

1. [ ] In the InMotion DNS zone editor, change **`A wopecar.com`** from `209.182.202.254` to **`76.76.21.21`**. Leave `www` (CNAME → wopecar.com), MX, TXT, `admin`, Resend/DKIM records alone.
2. [ ] Wait for propagation: `dig +short wopecar.com` should return `76.76.21.21` (≤ 5–15 min). Vercel shows the domain as valid and issues the certificate automatically.
3. [ ] Run the smoke tests below.
4. [ ] Submit `https://wopecar.com/sitemap.xml` in Search Console.

> Do **not** change nameservers — that would take over *all* records (including mail). Only the A record changes.

## Smoke tests (10 min)

- [ ] `https://wopecar.com` loads over HTTPS, new homepage, no certificate warning
- [ ] `https://www.wopecar.com` → redirects to `https://wopecar.com`
- [ ] A few legacy URLs redirect: `/about-us`, `/location/accra`, `/page/terms-and-condition`, `/wopecar-blog/best-car-to-rent-suv-vs-sedan`
- [ ] Homepage pickup-location search shows Google results
- [ ] A car page → add to cart → checkout reaches Paystack
- [ ] Sign up / log in; confirmation + password-reset emails arrive and their links land on `wopecar.com`
- [ ] A blog post shows its images; blog index loads
- [ ] `/sitemap.xml` and `/robots.txt` load and reference `https://wopecar.com`
- [ ] Contact / inquiry form submits (check it arrives in admin Inquiries)
- [ ] `https://admin.wopecar.com` still works
- [ ] Send a test email to/from a `@wopecar.com` address (confirms mail untouched)
- [ ] Mobile phone check of homepage, a car page, and the cart

## Rollback

**Trigger:** checkout broken, homepage down/blank, or anything that blocks bookings that can't be fixed in ~15 min.

1. In the InMotion DNS zone: set `A wopecar.com` back to **`209.182.202.254`** (TTL 300).
2. Verify: `dig +short wopecar.com` → `209.182.202.254`; the old site loads.
3. Tell me what broke; fix on the Vercel URL (`wopecar-website.vercel.app`), re-test, retry the cut-over.

Notes:
- The old server stays up untouched, so rollback needs no restore work.
- Data is **not** affected either way: the old site and the new site are separate; the app, admin and Supabase don't depend on which one `wopecar.com` shows.
- Keep the old hosting/server running for at least 2–4 weeks after cut-over (rollback safety, and any old-site file/email you may still need). Do not cancel the InMotion account — it is also the DNS host.
- Anything created during the window (e.g. an inquiry form submission) goes to Supabase and is kept regardless of rollback.

## After the cut-over (not blocking)

- Mobile app share links + universal links (`wopecar.com/book-a-car/<slug>`): needs app-store builds with associated domains — plan after the stores are live (see `app/car/[id].js` TODO).
- Raise the A record TTL back to 900s+ after a stable week.
- Watch Search Console "Pages" / "Not found (404)" for a few weeks; I can add redirects for anything real that shows up.
- Old-site cleanup (later): once confident, the 2 dead blog image links and the `wopecar.com/uploads` references are all gone, so the old server can be retired.
