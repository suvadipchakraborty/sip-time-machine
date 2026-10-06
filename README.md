# SIP Time Machine

Travel back in time to see the real compounding power of your investments.

Pick a mutual fund, a monthly SIP and a time frame. The app pulls NAV history from the free [MFAPI](https://www.mfapi.in/) (no API key), simulates the SIP on both the **Direct** and **Regular** plan, and benchmarks it against a **7% Recurring Deposit** (quarterly compounding).

## Stack
Vanilla HTML, CSS and ES6+ JavaScript. No build step. Installable PWA (`manifest.json`, `sw.js`).

## Deploy (GitHub + Cloudflare Pages)
1. Drag all files in this folder into a GitHub repository.
2. In Cloudflare Pages, connect the repo. Build command: none. Output directory: `/`.
3. Update the URLs in `index.html` (Open Graph tags) and `SITE` in `app.js` if your domain differs.

## Files
`index.html` · `styles.css` · `app.js` · `manifest.json` · `sw.js` · `icon.svg` · `preview.png` (social image)

## Notes
- Instalments are bought on the 1st of each month, or the next trading day within 7 days. Both plans use the same instalment dates so the comparison is fair.
- If a fund is younger than the chosen period, the shorter available history is used.

Mutual fund investments are subject to market risks. Past performance is not indicative of future returns. Built for educational purposes.
