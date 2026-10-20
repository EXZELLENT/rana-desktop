# Putting Rana on the Chrome Web Store

The owner's steps, in order. Everything to paste is in this folder:

| File | For |
| --- | --- |
| `listing.md` | the Store listing tab: name, summary, description, category, language, single purpose, which image goes where |
| `permissions.md` | the Privacy tab: one justification per permission, the remote-code answer, the data-use boxes |
| `privacy-policy.md` | the privacy policy to publish on exzellent.co (step 4) |
| `images/` | the store icon, three screenshots, the small promo tile |
| `source/` | the pages and the script that drew the images (`node docs/chrome-web-store/source/make-images.mjs`) |

## 1. A developer account (once)

1. Go to the Chrome Web Store Developer Dashboard, https://chrome.google.com/webstore/devconsole, and
   sign in with the Google account that should own Rana. Use an account of Exzellent's (not a personal
   one) with 2-Step Verification on; the dashboard requires it to publish.
2. Accept the developer agreement and pay the **one-time registration fee of US$5** (by card; it is not
   charged again for later items or updates).
3. **Account** tab: publisher name `Exzellent`, contact email `info@exzellent.co` (Google sends a
   verification mail; click it, or the item cannot be published).
4. **Trader status** (EU Digital Services Act): Exzellent offers Rana as a business, so declare
   *trader* and fill in the business address, phone and email. The store shows them on the listing to EU
   users.
5. Optional: verify `exzellent.co` in Google Search Console with the same Google account, then pick it
   as the item's **Official URL**; the listing then shows the site as verified.

## 2. The package

Upload `rana-extension.zip` from the latest release:

```
https://github.com/EXZELLENT/rana-desktop/releases/latest/download/rana-extension.zip
```

It must be **v0.1.2 or later**. The manifests of v0.1.0 and v0.1.1 have a 142-character description,
and the store refuses one over 132; the shorter one is on `main` since the commit that added this
folder, so the next release (bump both versions to 0.1.2, tag `v0.1.2`, see the README's *Release*)
carries it. To check a zip before uploading, look at its `manifest.json`: `description` starts with
"Rana, the Exzellent companion: tips from your own dashboard". Until v0.1.2 is out, a zip built from
`main` with `npm run pack` (it lands in `dist/rana-extension.zip`) is just as good: the store does not
mind which GitHub release a package came from, only that each upload's version is higher than the last.

The zip has `manifest.json` at its root, as the store wants. Do not unzip and re-zip it.

## 3. A new item

Developer Dashboard → **Add new item** → choose the zip. The dashboard reads the name, version, summary
and icons from the manifest and opens the item's draft.

## 4. Publish the privacy policy

The store needs a public address for the policy, and so does the Privacy tab.

1. Publish `privacy-policy.md` on the site, for example at **`https://www.exzellent.co/rana/privacy`**.
   The site's own policy is the React route `/privacy` (`src/features/legal/Privacy.jsx` in the
   exzellent11 repo); the Rana policy fits beside it as a route `/rana/privacy` with a component in
   `src/features/legal/`, in the same `exz-legal` layout, and a link to it from section 1 of the main
   policy. That is a normal site PR (the owner merges it).
2. Check the page loads signed out, in a private window.
3. If you pick another address, change it in `listing.md` (the description's last lines) before
   pasting.

## 5. Store listing tab

From `listing.md`:

- **Description**: paste the block under *Description* (with the policy address from step 4).
- **Category**: Education. **Language**: English.
- **Graphic assets**: the store icon `images/store-icon-128.png`; screenshots
  `images/screenshot-1-dashboard.png`, `images/screenshot-2-popup-options.png`,
  `images/screenshot-3-connect.png` (in that order); small promo tile `images/promo-small-440x280.png`.
  The marquee tile is optional; leave it empty.
- **Additional fields**: Official URL (if verified), Homepage `https://www.exzellent.co/app.html`, Support
  `https://www.exzellent.co`. Mature content: no.

## 6. Privacy tab

From `permissions.md`: the single purpose; the justifications for `storage`, `alarms`, `scripting` and
the host permissions; **"No, I am not using remote code"** with its justification; the data-use boxes
(personally identifiable information, authentication information, user activity: yes; the rest: no);
the three certifications; the privacy policy address from step 4.

## 7. Distribution tab

- **Visibility**: Public (or *Unlisted* first, to try the listing with a link before anyone can find it).
- **Regions**: all regions, unless Exzellent wants fewer.
- **Payments**: free.
- **Test instructions**: Rana needs an Exzellent account, so give the reviewer one: a test student
  account's email and password, and the steps "Sign in on www.exzellent.co. In the extension: toolbar
  icon → Settings → Connect to Exzellent, then approve the code on the dashboard's Rana page
  (www.exzellent.co/student-dashboard/rana). Minimize the dashboard's buddy and Rana shows a tip." Use a
  test account made for this, never a real student's.

## 8. Submit for review

**Submit for review**. Choose whether it publishes itself when approved, or waits for you to press
*Publish* (it must then be published within 30 days).

- Review usually takes **a few days**; a new developer account, or an item that asks for access to all
  sites (Rana's optional `<all_urls>`), can take **up to a few weeks**. The dashboard shows the status,
  and Google mails the account's address when it is approved or rejected.
- A rejection names the policy and the reason; fix it (usually a justification or the listing's wording)
  and submit again. Answers to a reviewer go through the dashboard's *Support* link on the item.

## 9. When the listing is live

The item gets a permanent 32-letter **item id** and a listing address,
`https://chromewebstore.google.com/detail/<item id>` (the dashboard's *View in store* link; a name slug
before the id is optional). Then:

### The dashboard's Rana page (exzellent11)

`src/features/exzi/RanaPanel.jsx`, the `DOWNLOADS` entry `id: "ext"` (the extension card):

| Field | Now | Then |
| --- | --- | --- |
| `text` | "Rana in the browser, beside the dashboard. Until the Web Store listing is live, load it yourself:" | "Rana in the browser, beside the dashboard. Add her from the Chrome Web Store and pin her in the toolbar." |
| `href` | `` `${RELEASES}/rana-extension.zip` `` | `"https://chromewebstore.google.com/detail/<item id>"` |
| `cta` | "Download the extension" | "Add to Chrome" |
| `file` | `"rana-extension.zip"` (the link's `title`) | `"Chrome Web Store"` |
| `steps` | the four "Load unpacked" steps | remove them (or keep one: "Pin Rana in the toolbar. She shows a code to connect below.") |

Also in that change:

- The card's link opens another site: give it `target="_blank"` and `rel="noopener noreferrer"` for the
  store link (the download links stay as they are), and use an external-link icon instead of `Download`
  for this card if the design wants it.
- Update the comment at the top of `RanaPanel.jsx` ("the 'load unpacked' steps until the Web Store
  listing is up") and the test `src/features/dashboard/student/pages/aexi-plus/AexiRana.test.jsx`, which
  expects the link "Download the extension" to point at the zip and the text "Load unpacked": it should
  expect "Add to Chrome" with the store address, and no "Load unpacked".
- Keep a small line for people who cannot use the store (a school-managed Chrome, another Chromium
  browser): "Or load it yourself from the zip" linking `${RELEASES}/rana-extension.zip`, if wanted.

### This repo

- `README.md`, *Install → Chrome*: lead with the store link; keep "Load unpacked" from the zip as the
  developer path. Its last paragraph under *Release* ("The Chrome Web Store listing comes later") goes.
- Each later release: bump the version in `desktop/package.json` and `extension/manifest.json`, tag, and
  once the release is published upload its `rana-extension.zip` to the same item (*Package → Upload new
  package*) and submit it. Chrome updates installed copies by itself within a few hours of approval. A
  change to a permission makes Chrome disable the extension until each person accepts the new prompt, so
  add permissions only when they are needed (and update `permissions.md`).

### People who loaded the zip unpacked

An unpacked copy does not update and has another id. Tell them (a note on the Rana page for a while is
enough) to remove it in `chrome://extensions` and add Rana from the store; then connect her again with a
code. Their old device can be removed on the dashboard under *Connected devices*. Nothing on the backend
depends on the extension's id.
