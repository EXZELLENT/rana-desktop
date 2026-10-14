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
(`exzi-character.js`, a build of the main site repo's `src/shared/exzi-character/`). The vendored build
predates `RANA_SPEC` (the mouse species is being added on the site's `feat/exzi-dashboard-buddy` branch),
so until it is refreshed Rana is drawn as a grey, tuskless elephant from a fallback spec; both apps switch
to `ExziCharacter.RANA_SPEC` by themselves once the bundle has it.

## Install

Builds are **not code-signed** (no Apple Developer ID, no Windows certificate yet), so each OS warns
once. The download URLs are

```
https://github.com/EXZELLENT/rana-desktop/releases/latest/download/Rana-<version>-win.exe
https://github.com/EXZELLENT/rana-desktop/releases/latest/download/Rana-<version>-mac.dmg
https://github.com/EXZELLENT/rana-desktop/releases/latest/download/rana-extension-<version>.zip
```

for example `Rana-0.1.0-win.exe`, `Rana-0.1.0-mac.dmg`, `rana-extension-0.1.0.zip` (the version is in
`desktop/package.json` and `extension/manifest.json`, and the release tag is `v<version>`).

**Windows.** Run `Rana-<version>-win.exe`. SmartScreen says "Windows protected your PC": click
*More info*, then *Run anyway*. The installer is a one-click NSIS setup for the current user; Rana
starts afterwards and sits in the tray.

**macOS.** Open `Rana-<version>-mac.dmg` and drag Rana to Applications. The first launch is blocked
("cannot be opened because the developer cannot be verified"): right-click (or Control-click) Rana in
Applications and choose *Open*, then *Open* again in the dialog; or allow it under *System Settings →
Privacy & Security → Open Anyway*. To read window titles macOS needs **Screen Recording** permission
(*Privacy & Security → Screen Recording*): until it is granted Rana simply senses nothing. The dmg is a
**universal** build (one download, native on both Intel and Apple Silicon Macs, no Rosetta).

**Chrome.** Until the extension is on the Web Store: download `rana-extension-<version>.zip`, unzip it,
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
npm run pack         # at the root: zips extension/ to dist/rana-extension-<version>.zip (no dependency)
npm run icons        # re-renders the icons with the character bundle in headless Chrome (see below)
```

The extension is plain JavaScript with no build step: load `extension/` unpacked and reload it after
a change (`chrome://extensions` → ↻). The service worker's log is under *Inspect views → service worker*.

**The character bundle** `exzi-character.js` is a build of the main site repo's
`src/shared/exzi-character/` (the site publishes it as `public/site-assets/exzi/exzi-character.js`),
copied unchanged into `desktop/renderer/vendor/` and `extension/vendor/` (the two copies must stay
identical: `cmp` them). The vendored build is the one the site's feature worktrees shared on
2026-10-13 (exzi-phase3, exzi-phase4, ai-archive, buddy-pages, podcast-voice, revert), sha256
`d9b51794f0adbda34509402ebbb8bed79c80132d2deb2505f5532c9f82415910` (57345 bytes, `SPECIES` = elephant
only, no `RANA_SPEC`); it is not on `main` (whose published copy is an older, 57332-byte build) and the
site's `feat/hero-player-v4` branch does not carry the published file at all. To refresh: copy the
site's new build over both vendor copies, run
`npm run icons` at the root (the extension icons, `desktop/build/icon.png` and `src/icon-fallback.json`
then show the current species), delete a cached `rana-icon-256.png` from the app's user data folder
while testing, and update the hash and source commit here. The API used is `createCharacter(host,
{ spec, view, interactive, bubble, sound })`, `setMood`, `play`, `start`/`pause`, `destroy`, and
`RANA_SPEC` when the bundle has it.

**Icons.** `desktop/renderer/icon.html` renders Rana with the bundle and returns PNG data URLs.
The desktop app runs it once in a hidden window at first start and caches the 256 px result in
its user data folder (`rana-icon-256.png`; tray and app icon), falling back to the small PNG in
`desktop/src/icon-fallback.json` until then. `scripts/make-icons.mjs` runs the same page in headless
Chrome (its own throw-away profile under the temp folder) to write `extension/icons/icon-{16,32,48,128}.png`,
`desktop/build/icon.png` (512 px, from which electron-builder makes the `.ico` and `.icns`) and the
fallback JSON. Without Chrome it writes plain grey discs.

### Verifying

- `desktop`: `npm test` green; `npm run smoke` prints `rana: smoke ok (…)` and exits 0.
- `node --check` on every `.js`/`.mjs`/`.cjs`; `node -e "JSON.parse(fs.readFileSync('extension/manifest.json'))"`.
- The extension: load it unpacked, open `https://www.exzellent.co/student-dashboard`, minimize the
  dashboard buddy and Rana appears bottom-right.

## Release

1. Bump the version in `desktop/package.json` and `extension/manifest.json` (keep them equal).
2. Commit, tag `v<version>`, push the tag.
3. `.github/workflows/release.yml` builds on `windows-latest` and `macos-latest` (`npm ci`, `npm test`,
   `npm run dist -- --publish always` with `GH_TOKEN`), which creates the GitHub Release for the tag and
   uploads `Rana-<version>-win.exe` (x64 NSIS) and `Rana-<version>-mac.dmg` (a universal dmg: the
   `mac.target` arch is `universal`, so the arm64 runner builds x64 and arm64 and merges them with
   `@electron/universal`; a bare `dmg` target would silently build the runner's own arm64 only); a third
   job zips the extension and attaches `rana-extension-<version>.zip`. The release is published (not a
   draft), so the `releases/latest/download/…` URLs above work as soon as the jobs finish.

`active-win` ships prebuilt binaries for every target (a universal Swift helper for macOS, napi `.node`
files for darwin x64/arm64 and win32 x64), so `npmRebuild` is off (nothing to compile, and both
architectures' trees stay identical for the universal merge) and `node_modules/active-win/**` is
`asarUnpack`ed so the macOS helper can be executed from `app.asar.unpacked`.

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
