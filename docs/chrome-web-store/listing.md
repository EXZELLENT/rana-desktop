# Store listing: Rana by Exzellent

Paste these into the Chrome Web Store Developer Dashboard, item → **Store listing** (and the single
purpose into **Privacy**). Every claim here is what the code in `extension/` does at the commit this file
was written with; if the extension changes, check this file again.

## Name

```
Rana by Exzellent
```

The store takes the name from `extension/manifest.json` (`name`), so it is not typed in the dashboard.

## Summary (132 characters at most)

```
Rana, the Exzellent companion: tips from your own dashboard (next lesson, homework, streak) while the buddy there is minimized.
```

127 characters. The store takes the summary from the manifest's `description`, which is this same
sentence; the store refuses a package whose description is longer than 132 characters, so keep the two
equal and short.

## Description

```
Rana is the small companion from Exzellent that sits in the corner of your browser. When the learning buddy on your Exzellent dashboard is minimized, Rana takes over and taps you on the shoulder with one tip at a time from your own dashboard: your lesson starts in 15 minutes, a homework is due tomorrow, ten minutes today keeps your streak going, time for a short break.

CONSENT FIRST
• Rana does nothing until you connect her to your Exzellent account, and you can disconnect her at any time.
• You connect with a code, like a TV app: Rana shows a short code, you approve it on your dashboard's Rana page, where you see which device is asking. The extension never sees your password.
• Every tip asks you: Okay, Later (quiet for 30 minutes) or Not this (that kind of tip is held for a day).
• Quiet hours: no tips at night (23:45 to 07:00 unless you change it). Tips can be switched off without disconnecting.
• "Hide for today" puts Rana away until tomorrow.

WHAT RANA READS
• On exzellent.co, Rana reads only the signal the Exzellent dashboard sets for her: whether its own buddy is open, minimized or full screen. She hides while that buddy is open and shows tips while it is minimized.
• Everywhere else, nothing. Rana appears on other sites only if you turn on "Rana everywhere" in her settings and allow it in Chrome's prompt. Even then she only draws herself in the corner; she never reads the pages, their addresses or what you type, and never sends anything about them.

WHAT IS SENT, AND ONLY TO EXZELLENT
• Sign-in: the code request with the device name "Chrome on <your platform>", so you recognise it on your dashboard.
• Guidance: every few minutes while you are connected, Rana asks the Exzellent backend for the next tip.
• Tip feedback: which tip you answered and whether you chose Okay, Later or Not this.
• Disconnect: the request that signs this browser out.
No analytics, no tracking, no ads, no browsing history, no page content. Nothing is sold or shared.

HOW TO USE
1. Install Rana and pin her to the toolbar.
2. Click the icon → Settings → Connect to Exzellent, and approve the code on your dashboard.
3. Minimize the buddy on your dashboard: Rana appears with your first tip. The toolbar badge shows 1 while a tip waits.

Rana needs an Exzellent account (students and teachers). There is also a desktop app for Windows and macOS on the dashboard's Rana page.

Privacy policy: https://www.exzellent.co/rana/privacy
Help: info@exzellent.co
```

Before publishing, replace the privacy policy address with the one where `privacy-policy.md` is actually
published (see `submit.md`, step 4), and paste the same address into **Privacy → Privacy policy**.

## Category

**Education** (Productivity → Education in the dashboard's list).

## Language

**English**. The extension's own text is in English. (Tips can arrive in German when the person's
dashboard language is German; the listing itself is English only. A German listing can be added later
under *Store listing → Add a language*.)

## Single purpose

The Privacy tab's **Single purpose description**:

```
Rana shows the signed-in person's own tips from their Exzellent learning dashboard (next lesson, homework due, streak, breaks) as a small on-screen companion in the browser while the dashboard's own buddy is minimized, and sends back only which tip was answered and how.
```

## Graphics

| Field | File | Size |
| --- | --- | --- |
| Store icon | `images/store-icon-128.png` | 128 x 128 PNG, artwork 96 x 96 with 16 px transparent padding |
| Screenshot 1 | `images/screenshot-1-dashboard.png` | 1280 x 800, 24-bit PNG: Rana with a tip on the dashboard, its buddy minimized |
| Screenshot 2 | `images/screenshot-2-popup-options.png` | 1280 x 800, 24-bit PNG: the popup with a waiting tip, the settings connected |
| Screenshot 3 | `images/screenshot-3-connect.png` | 1280 x 800, 24-bit PNG: connecting with a code |
| Small promo tile | `images/promo-small-440x280.png` | 440 x 280, 24-bit PNG |

The marquee promo tile (1400 x 560) is optional and not made. The images are drawn by
`source/make-images.mjs` (headless Chrome over the DevTools protocol) from the pages in `source/`, which
run the extension's own `popup.html`, `options.html` and `content.js` and the vendored character bundle;
the dashboard behind Rana in screenshot 1 is a stand-in page, and the names in it (Alex, Lena) are made
up. After a change to the look, run `node docs/chrome-web-store/source/make-images.mjs` and upload the
new files.

## Other fields

- **Official URL**: `https://www.exzellent.co` (once the domain is verified in Google Search Console
  under the same Google account; optional).
- **Homepage URL**: `https://www.exzellent.co/app.html`, or the dashboard's Rana page.
- **Support URL**: `mailto:info@exzellent.co` is not accepted as a URL by every form; if it is refused,
  use `https://www.exzellent.co` and put the address in the description (done above).
- **Mature content**: no.
