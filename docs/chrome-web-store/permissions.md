# Privacy practices: permissions, remote code and data use

The answers for the Developer Dashboard's **Privacy** tab, one paragraph per field, as the form asks
for them. They match `extension/manifest.json`:

```json
"permissions": ["storage", "alarms", "scripting"],
"host_permissions": ["https://exzellent-backend-1.onrender.com/*"],
"optional_host_permissions": ["<all_urls>"],
"content_scripts": [{ "matches": ["https://*.exzellent.co/*"], … }]
```

If a permission is added to or taken out of the manifest, the form shows a field more or less; change
this file with it.

## Single purpose description

```
Rana shows the signed-in person's own tips from their Exzellent learning dashboard (next lesson, homework due, streak, breaks) as a small on-screen companion in the browser while the dashboard's own buddy is minimized, and sends back only which tip was answered and how.
```

## storage justification

```
Rana keeps her state in chrome.storage.local, on this computer only (nothing in chrome.storage.sync): the access and refresh tokens of the person's Exzellent sign-in, the sign-in code while it waits for approval, the one tip waiting in her bubble, the per-kind cooldowns and the "Later" / "Not this" holds, when she last asked for a tip, the person's settings (tips on or off, quiet hours, "Rana everywhere" on or off, the server address), where the person dragged her on the screen and "hide for today". The service worker of a Manifest V3 extension is stopped when idle, so this has to be stored to survive it. Disconnect deletes the tokens and the tip; uninstalling deletes everything.
```

## alarms justification

```
Rana asks the Exzellent backend for the next tip on a timer the backend sets (between 30 seconds and 10 minutes, backing off towards 10 minutes after errors), and while a sign-in code is waiting for approval she checks every 30 seconds whether it was approved, for at most the code's ten minutes. A Manifest V3 service worker does not stay awake for setTimeout, so both timers are chrome.alarms. While the person is signed out or has tips switched off, the tip alarm fires once after Chrome starts, finds nothing to do and is not set again.
```

## scripting justification

```
Used only for the opt-in "Rana everywhere" mode. When the person turns it on in Rana's settings and allows access to all sites in Chrome's own prompt, the service worker calls chrome.scripting.registerContentScripts once to register Rana's overlay (the packaged files vendor/exzi-character.js, lib/common.js and content.js, the same ones the manifest runs on exzellent.co) for the sites the person opens; when they turn it off, or remove the site access in Chrome, it calls unregisterContentScripts. getRegisteredContentScripts tells which state it is in. The extension never calls executeScript or insertCSS and never injects code given as a string: only these packaged files are registered.
```

## Host permission justification

The form has one field for all host access: the backend host permission, the content script's matches
and the optional `<all_urls>`.

```
https://exzellent-backend-1.onrender.com/* is the Exzellent backend, the only server the extension talks to. The service worker calls it to sign in with a device code (POST /api/auth/device/start, /poll, /refresh), to ask for the next tip (GET /api/companion/guidance), to send the answer to a tip (POST /api/companion/feedback) and to sign out (DELETE /api/auth/device). The host permission lets the service worker make these requests with the person's token without opening the API to other origins.

https://*.exzellent.co/* (content script) is Exzellent's own site, where the person's dashboard is. There the content script draws Rana in the corner, in a closed shadow root, and reads exactly one thing from the page: the data-exzi-dock attribute and the exz:exzi-state event that the Exzellent dashboard sets for her, which say whether the dashboard's own buddy is open, minimized or full screen. She hides while that buddy is open and shows tips while it is minimized. Nothing from the page is sent anywhere.

<all_urls> is optional and not granted at install. It is requested from Rana's settings page with chrome.permissions.request only when the person turns on "Rana everywhere", so that dashboard tips can reach them while they study on other sites. With it, the same overlay is drawn in the corner of the pages they open; it does not read the page's content, its address beyond telling exzellent.co apart from other sites, or anything typed, and sends nothing about any site. Turning the switch off removes the permission again (chrome.permissions.remove) and unregisters the script.
```

## Are you using remote code?

**No, I am not using remote code.**

```
All JavaScript is in the package: background.js, content.js, popup.js, options.js, lib/common.js and vendor/exzi-character.js (the character drawing engine, a build of Exzellent's own website code, copied into the package and loaded as a content script, never fetched). No file loads a script from a server; there is no eval, no new Function and no injection of code as strings. The backend answers with JSON only, and the tip's text is put on screen as text (textContent), never as HTML.
```

## Data usage

**What user data do you plan to collect from users now or in the future?** Tick:

| Category | Tick | Why |
| --- | --- | --- |
| Personally identifiable information | **Yes** | At sign-in the backend returns the account's name, which the popup and the settings show ("Connected as Alex"); the device name "Chrome on <platform>" is sent so the person recognises the device on the dashboard. |
| Health information | No | |
| Financial and payment information | No | |
| Authentication information | **Yes** | The access and refresh tokens from the device-code sign-in, kept in `chrome.storage.local`. No password is ever seen. |
| Personal communications | No | |
| Location | No | |
| Web history | No | No list of pages, no addresses. |
| User activity | **Yes** | The answer to a tip (Okay, Later, Not this) with the tip's id is sent to Exzellent. Nothing else about clicks, scrolling or typing. |
| Website content | No | On exzellent.co only the dashboard's own buddy state is read (one attribute and one event the dashboard sets for the extension); no page content anywhere. |

Then tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL**: the address where `privacy-policy.md` is published (suggested:
`https://www.exzellent.co/rana/privacy`).

## Things a reviewer may ask, and the answers

- **Why does a tips extension ask for all sites?** It does not, until the person turns on "Rana
  everywhere": the install prompt names only the exzellent.co sites and the Exzellent backend. The settings
  page tells the person beforehand that Chrome will say "read and change all your data on all websites"
  and that Rana only draws herself.
- **How can the reviewer try it?** The extension needs an Exzellent account. Give the reviewer a test
  student account in *Distribution → Test instructions* (the Developer Dashboard has a field for it):
  sign in on www.exzellent.co, open the dashboard's Rana page, then in the extension *Settings → Connect
  to Exzellent* and approve the code there. Without an account the popup shows "not connected" and Rana
  stands on exzellent.co without tips.
