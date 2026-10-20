# Rana — the Exzellent companion on your screen

Rana is the small companion that lives **outside the dashboard**: on the desktop (an Electron app,
`desktop/`) and in the browser (a Chrome extension, `extension/`). Exzi, the learning buddy, stays inside
the dashboard; Rana is the one who taps you on the shoulder when you are elsewhere.

- **Guidance when the dashboard buddy is minimized.** Once you connect Rana to your Exzellent
  account, she asks the dashboard every few minutes (`GET /api/companion/guidance`) and shows a
  tip in her bubble, only when the buddy on the dashboard is minimized or you have been away from
  it for ten minutes, never more than one per eight minutes. *Okay*, *Later* (30 minutes of quiet)
  and *Not this* (that kind of tip is held for a day) go back as feedback.
- **Consent-first local sensing (desktop).** Nothing is sensed until you accept the consent screen.
  With consent, the desktop app reads the active window's app name and title and the idle time, on
  this machine, to notice a focus streak, a document you have been grinding for 40 minutes, rapid
  switching, a social drift during work hours or a late night, and says something about it in
  the persona and tone you chose. Titles are classified in memory and never stored or sent.
- **What is never sent.** No window titles, no page contents, no screenshots, no keystrokes, no
  list of the sites you visit. The only requests Rana makes are the sign-in, the guidance poll, the
  feedback and the sign-out, all to the Exzellent backend, and only after you connected her.

The desktop app and the extension are drawn by the same character engine as the dashboard's buddy
(`exzi-character.js`, a build of the main site repo's `src/shared/exzi-character/`), as the bundle's
`RANA_SPEC`: the mouse. Should an older bundle without that spec ever be vendored, both apps fall back
to a grey, tuskless elephant spec of their own rather than fail.

## Install

Builds are **not code-signed** (no Apple Developer ID, no Windows certificate yet), so each OS warns
once. The download URLs are

```
https://github.com/EXZELLENT/rana-desktop/releases/latest/download/Rana-win.exe
https://github.com/EXZELLENT/rana-desktop/releases/latest/download/Rana-mac.dmg
https://github.com/EXZELLENT/rana-desktop/releases/latest/download/rana-extension.zip
```

the same links the student dashboard offers. The names carry no version, so they always reach the newest
release (the version is in `desktop/package.json` and `extension/manifest.json`, and the release tag is
`v<version>`); keep them unchanged, or the dashboard's download buttons break. Every release is listed at
https://github.com/EXZELLENT/rana-desktop/releases.

**Windows.** Run `Rana-win.exe`. SmartScreen says "Windows protected your PC": click
*More info*, then *Run anyway*. The installer is a one-click NSIS setup for the current user; Rana
starts afterwards and sits in the tray.

**macOS.** Open `Rana-mac.dmg` and drag Rana to Applications. The first launch is blocked
("cannot be opened because the developer cannot be verified"): right-click (or Control-click) Rana in
Applications and choose *Open*, then *Open* again in the dialog; or allow it under *System Settings →
Privacy & Security → Open Anyway*. To read window titles macOS needs **Screen Recording** permission
(*Privacy & Security → Screen Recording*): until it is granted Rana simply senses nothing. The dmg is a
**universal** build (one download, native on both Intel and Apple Silicon Macs, no Rosetta).

**Chrome.** Until the extension is on the Web Store: download `rana-extension.zip`, unzip it,
open `chrome://extensions`, switch on *Developer mode*, click *Load unpacked* and pick the unzipped
folder (or pick `extension/` from a checkout of this repo). Pin Rana to the toolbar to see her badge.

## Sign in

Rana uses the device-code flow, like a TV app, so the apps never see your password.

1. Desktop: tray → *Settings, consent & account* → **Connect to Exzellent**. Extension: toolbar
   icon → *Settings* → **Connect to Exzellent**.
2. Rana shows an 8-character code such as `KX7M-3RQB` and a button **Open exzellent.co to approve**,
   which opens `https://www.exzellent.co/student-dashboard/rana?code=…` in your browser. Sign in
   there if you have to; the code is approved on the dashboard's Rana page (you can also type it
   there). Teachers approve on their dashboard the same way.
3. Rana polls every few seconds and switches to **Connected as <your name>**; the first tip is a
   welcome. The code expires after ten minutes; just connect again.

**Disconnect** revokes this device on the backend (`DELETE /api/auth/device`) and forgets the tokens.
The dashboard lists connected devices under *Connected devices* and can remove them too.

Tokens: the desktop app keeps the access and refresh tokens in its settings file encrypted with the
OS keychain (Electron `safeStorage`: DPAPI on Windows, Keychain on macOS); when the OS cannot encrypt
for it, it keeps them in memory for the current run only (the settings page says so, and the sign-in
lasts until Rana quits) rather than write them plain. A stored token that no longer decrypts (another
user or machine, a reset keychain) is forgotten and Rana shows as not connected. The extension keeps
its tokens in `chrome.storage.local`, which Chrome protects per profile. The access token lives 12 hours
and is refreshed on a 401; the refresh token (90 days) rotates on every refresh.

## Settings

**Desktop** (tray → *Settings, consent & account*):

| Section | What it does |
| --- | --- |
| Account | Connect / the code / Connected as … / Disconnect. *Show tips from my dashboard* turns the guidance poll off without disconnecting. *Start Rana when I sign in to my computer* registers the installed app as a login item (`app.setLoginItemSettings`); a dev run only remembers the choice. *Advanced: server* changes the backend origin (also `RANA_API_BASE` in the environment). |
| What may Rana see? | Active window (app + title) and idle time, each its own switch. Screen content (OCR / vision) is not in this version. |
| Voice | What Rana calls you; persona (Study Buddy, Mentor, Clone of my tutor, Gentle Support); tone from gentle to direct. |
| Quiet hours | No proactive prompts or tips between 23:45 and 07:00 (except the wind-down nudge). |

On Rana herself: hover for the toolbar (💤 pause / resume, ⚙️ settings, ✕ hide; the tray icon brings
her back), drag her to move the window (she is carried), click and hold to pet her, tap an ear, the
trunk, the tail. Outside Rana the window is click-through. The tray menu has *Pause / Resume*,
*Open my dashboard* (`https://www.exzellent.co/student-dashboard`), *Settings* and *Quit*.

**Extension** (toolbar icon → *Settings*, or `chrome://extensions` → Rana → *Details → Extension
options*):

| Section | What it does |
| --- | --- |
| Account | As above, plus *Show tips from my dashboard* and the server. |
| Where Rana appears | Off (default): only on `*.exzellent.co`. **Rana everywhere**: Chrome asks for access to all sites and Rana's content script is registered at runtime for them (`chrome.scripting.registerContentScripts`); she then sits in the corner of every page so tips reach you while you study elsewhere. She only draws herself and never reads the page. |
| Quiet hours | No tips between the two times (default 23:45–07:00). |

On the dashboard Rana reads the signals the page sets (`data-exzi-dock` on `<html>` and the
`exz:exzi-state` event): she hides while the dashboard's buddy is open or fullscreen and shows tips when
it is minimized. The popup shows the connection status and the waiting tip (the badge shows `1` while
one waits) with the same three answers, plus *Open my dashboard* and *Check now*.

## Development

```
cd desktop
npm install          # Electron (~100 MB) and electron-builder are devDependencies
npm start            # run the app
npm test             # node --test: the signal engine, messages, account (device flow against an in-process backend), guidance
npm run smoke        # electron . --smoke: opens the window, waits for the renderer's "rana:ready", prints "rana: smoke ok", exits 0 (1 on any error)
npm run dist         # unsigned installers into desktop/dist (electron-builder)
```

```
npm test             # at the root: node --test "test/*.test.mjs" — the extension's service worker against a stand-in chrome.* and fetch
npm run pack         # at the root: zips extension/ to dist/rana-extension.zip (no dependency)
npm run icons        # re-renders the icons with the character bundle in headless Chrome (see below)
```

The extension is plain JavaScript with no build step: load `extension/` unpacked and reload it after
a change (`chrome://extensions` → ↻). The service worker's log is under *Inspect views → service worker*.

**The character bundle** `exzi-character.js` is a build of the main site repo's
`src/shared/exzi-character/` (the site publishes it as `public/site-assets/exzi/exzi-character.js`),
copied unchanged into `desktop/renderer/vendor/` and `extension/vendor/` (the two copies must stay
identical: `cmp` them). The vendored build is the one committed on the site's `feat/exzi-dashboard-buddy`
branch at `a0915b725977f4c02a64cd47126408c77a708c1a` (2026-10-20, "Exzi redrawn from the owner's art: the
blue elephant, with volume"), sha256 `3d1a740d7cf8d55a0e3eaa62c44dbc760cbcf19cd89f3d160bfd4c2830057cf8`
(73324 bytes, `SPECIES` = elephant and mouse, with `RANA_SPEC` the mouse, and Exzi the
elephant redrawn from the owner's art). The copy published on the site's `main`
is an older build without `RANA_SPEC` until that branch merges, so take the bundle from the branch (or
from `main` afterwards). To refresh: copy the site's new build over both vendor copies, run `npm run icons`
at the root (the extension icons, `desktop/build/icon.png` and `src/icon-fallback.json` then show the
current build) and update the hash and source commit here; the desktop app re-renders its cached tray icon
by itself, because the cache file's name carries the bundle's hash. The API used is `createCharacter(host,
{ spec, view, interactive, bubble, sound })`, `setMood`, `play`, `start`/`pause`, `destroy`, and
`RANA_SPEC` (the fallback spec stands in only when a bundle lacks it).

**Icons.** `desktop/renderer/icon.html` renders Rana with the bundle and returns PNG data URLs.
The desktop app runs it once in a hidden window at first start and caches the 256 px result in
its user data folder (`rana-icon-256-<bundle sha256, 12 hex>.png`; tray and app icon; a refreshed
bundle gets a new file and the other cached faces are removed), falling back to the small PNG in
`desktop/src/icon-fallback.json` until then. `scripts/make-icons.mjs` runs the same page in headless
Chrome (its own throw-away profile under the temp folder) to write `extension/icons/icon-{16,32,48,128}.png`,
`desktop/build/icon.png` (512 px, from which electron-builder makes the `.ico` and `.icns`) and the
fallback JSON. Without Chrome it writes plain grey discs.

### Verifying

- `desktop`: `npm test` green; `npm run smoke` prints `rana: smoke ok (…)` and exits 0.
- The root: `npm test` green (the service worker: device poll, 429 slow-down, guidance arming, quiet hours).
- `node --check` on every `.js`/`.mjs`/`.cjs`; `node -e "JSON.parse(fs.readFileSync('extension/manifest.json'))"`.
- The extension: load it unpacked, open `https://www.exzellent.co/student-dashboard`, minimize the
  dashboard buddy and Rana appears bottom-right.

## Release

1. Bump the version in `desktop/package.json` and `extension/manifest.json` (keep them equal).
2. Commit, tag `v<version>`, push the tag.
3. `.github/workflows/release.yml` first checks that the tag matches both versions and creates the
   GitHub Release for the tag as a draft. Then, in parallel, it builds on `windows-latest` and
   `macos-latest` (`npm ci`, `npm test`, `npm run dist -- --publish never`) and uploads with `gh release
   upload`: `Rana-win.exe` (x64 NSIS; `win.artifactName`) with `Rana-win.exe.blockmap` and `latest.yml`,
   and `Rana-mac.dmg` (`mac.artifactName`; a universal dmg: the `mac.target` arch is `universal`, so the
   arm64 runner builds x64 and arm64 and merges them with `@electron/universal`; a bare `dmg` target
   would silently build the runner's own arm64 only) with `Rana-mac.dmg.blockmap` and `latest-mac.yml`.
   A third job checks and tests the extension (`node --check`, the root's `npm test`), zips it and
   attaches `rana-extension.zip`. The last job checks that all seven files are there and publishes the
   release as the latest (not a draft), so the `releases/latest/download/…` URLs above switch to the new
   version only once every file is up. `latest.yml` and `latest-mac.yml` name the same files, so
   electron-updater can read them should the app ever update itself (on macOS that would also need a
   `zip` target: Squirrel.Mac installs from a zip, not a dmg).

`active-win` ships prebuilt binaries for every target (a universal Swift helper for macOS, napi `.node`
files for darwin x64/arm64 and win32 x64), so `npmRebuild` is off (nothing to compile, and both
architectures' trees stay identical for the universal merge) and `node_modules/active-win/**` is
`asarUnpack`ed so the macOS helper can be executed from `app.asar.unpacked`. Those Mach-O files are
the same in the x64 and the arm64 tree (the helper is already universal, and each `.node` is for one
architecture by name), so `mac.x64ArchFiles` lets `@electron/universal` copy them instead of failing
on them.

No code signing: `CSC_IDENTITY_AUTO_DISCOVERY=false` on macOS and no certificate on Windows. When
Exzellent has an Apple Developer ID and a Windows certificate, add them as the usual electron-builder
secrets (`CSC_LINK`, `CSC_KEY_PASSWORD`, and notarization with `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD`
/ `APPLE_TEAM_ID`) and the warnings above go away. The Chrome Web Store listing comes later; until then
the zip is the way in.

## Architecture

```
desktop/
  src/main.js        Electron main: transparent always-on-top click-through window, tray, consent-first
                     flow, the 3 s sense loop (active-win + powerMonitor) → engine → IPC, the account,
                     the guidance poll, autostart, the icon, the --smoke mode. IPC channels "rana:*".
  src/engine.js      PURE signal engine (unchanged from the prototype): classify() + SignalEngine
                     (streaks, drift, switching, idle, quiet hours, per-type cooldowns)
  src/messages.js    PURE persona/tone message builder (unchanged)
  src/store.js       local JSON settings (unchanged; the file is rana-settings.json in userData)
  src/account.js     device-code sign-in: start → poll → tokens through safeStorage into the store,
                     fetch() with Bearer and one refresh on 401, disconnect() revokes. Main process only.
  src/guidance.js    GET /api/companion/guidance on the backend's `next` (30..600 s, backoff on errors,
                     idle when signed out, paused or tips off); TipGate (quiet hours, one per kind per
                     8 min, Later/Never); POST /api/companion/feedback
  src/icon.js        Rana's face from the bundle in a hidden window, cached in userData, inline fallback
  src/preload.cjs    contextBridge: window.rana — the renderer never touches Node or a token
  renderer/buddy.*   the character (bundle, view "full", interactive), moods mapped from the prompt
                     types, the one bubble (local prompts and tips; a tip wins), hover toolbar, drag
  renderer/settings.html  consent, persona/tone, quiet hours, Account, autostart, tips
  renderer/icon.html the icon page (also used by scripts/make-icons.mjs)
  test/              node --test: engine + messages, account (in-process backend), guidance
extension/
  manifest.json      MV3: storage + alarms + scripting; host permission: the backend only (the
                     content script's matches cover *.exzellent.co); optional <all_urls> for "everywhere";
                     no web_accessible_resources (the bundle is injected as a content script)
  background.js      service worker: account (device flow, tokens in chrome.storage.local, refresh,
                     revoke), guidance on chrome.alarms, the waiting tip + badge, feedback, relays
  content.js         the overlay in a shadow root: the character, the tip bubble, data-exzi-dock /
                     exz:exzi-state handling, drag, hide for today
  options.*          sign-in, everywhere, quiet hours, tips, server
  popup.*            status + the latest tip
  lib/common.js      shared constants and pure helpers (quiet hours, the gate, safe URLs)
scripts/
  make-icons.mjs     icons from the bundle via headless Chrome; pack-extension.mjs: the zip
test/
  extension-background.test.mjs  node --test at the root: background.js in a vm context with a stand-in
                     chrome.* and fetch (device poll and 429, guidance arming, quiet hours, backoff)
.github/workflows/release.yml
```

The bubble rule on the desktop: the SignalEngine's local prompts and the backend's tips share one
bubble; a backend tip replaces a local prompt, and while a tip is showing local prompts are dropped.
Both pass the same quiet hours; tips also pass the TipGate's cooldown, snooze and "never" holds.

### The contract

`companion-api.md` (shared with the dashboard and the backend) is what Rana implements:

| Route | Used by | For |
| --- | --- | --- |
| `POST /api/auth/device/start` `{ client, name }` | both | a `deviceCode`, `userCode`, `verifyUrl`, `interval`, `expiresIn` |
| `POST /api/auth/device/poll` `{ deviceCode }` | both | `pending` / `approved` (tokens + user) / `expired` (410) / `denied` (403) |
| `POST /api/auth/device/refresh` `{ refreshToken }` | both | rotated `{ token, refreshToken }` on a 401 |
| `DELETE /api/auth/device` (Bearer) | both | Disconnect |
| `GET /api/companion/guidance?since=` (Bearer) | both | `{ state, tip, next }`; `tip.kind` ∈ nudge, lesson, streak, homework, break, welcome |
| `POST /api/companion/feedback` `{ tipId, verdict }` | both | Okay = `ok`, Later = `later`, Not this = `never` |
| `data-exzi-dock`, `exz:exzi-state` | extension | the dashboard's own buddy state, read from the page |

`client` is `rana-desktop` or `rana-extension`; `name` is the machine's host name or "Chrome on
<platform>", shown in the dashboard's device list.

## Privacy

- Nothing is sensed before consent, and each sense (active window, idle time) has its own switch.
  Window titles are classified into a category in memory (code, docs, study, social, …) and then
  forgotten; the category and minutes are what the prompts are built from.
- The extension reads nothing from the pages it is on. On the dashboard it reads one attribute and one
  event that the dashboard sets for it. In "everywhere" mode it draws itself on other sites and
  still reads nothing; the broad permission is Chrome's price for showing an overlay anywhere.
- What leaves the machine, and only when you are connected: the device name at sign-in; the Bearer
  token with each guidance poll and feedback; the tip id and your verdict. No telemetry, no crash
  reporting, no analytics.
- Everything Rana keeps is in one place: the desktop's `rana-settings.json` (consent, profile, quiet
  hours, window position, encrypted tokens) and the cached icon under the app's user data folder;
  the extension's `chrome.storage.local`. Disconnect clears the tokens; uninstalling removes the
  rest.
