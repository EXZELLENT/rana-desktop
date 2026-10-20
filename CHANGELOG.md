# Changelog

Each release is the tag `v<version>` and the GitHub Release of that tag, with `Rana-win.exe`,
`Rana-mac.dmg` and `rana-extension.zip` (https://github.com/EXZELLENT/rana-desktop/releases).

## 0.1.1 (2026-10-20)

- **Rana and Exzi as the site draws them now.** The character bundle is the one published on the
  site's `main` at `c6dc3fd` (the merge of PR #223, after PR #222): the review round redrew Exzi's body
  and face and tidied Rana's tail. sha256 `cd60cdab64b467e405f3750df85adf3a45480345ee3008dfe236f7fec1c5eb42`,
  77741 bytes, in both `desktop/renderer/vendor/` and `extension/vendor/`.
- **Icons re-rendered** from that bundle: the extension icons (16, 32, 48, 128 px), the 512 px app icon
  that the Windows `.ico` and macOS `.icns` are made from, and the tray's inline fallback. The desktop app
  draws a fresh cached tray face by itself, because the cache file carries the bundle's hash.
- **Release build on current runners.** `actions/checkout@v7` and `actions/setup-node@v7`, which run on
  Node 24 (v4 targeted the deprecated Node 20), and the Linux jobs on `ubuntu-26.04` ahead of the
  `ubuntu-latest` move.
- The version is 0.1.1 in `desktop/package.json`, `extension/manifest.json` and the root `package.json`.

## 0.1.0 (2026-10-20)

The first release: Rana, the Exzellent companion, on the desktop and in the browser.

- **Desktop app** (Electron; Windows x64 installer, universal macOS dmg, both unsigned): a transparent,
  always-on-top, click-through window with Rana, a tray, a consent-first local signal engine (focus
  streaks, drift, switching, idle) with quiet hours and cooldowns, sign-in with the Exzellent account by
  device code, guidance from the dashboard when the buddy there is minimized, feedback, autostart.
- **Chrome extension** (Manifest V3): Rana as an overlay on exzellent.co (everywhere only by opt-in), the
  same sign-in and tips, a popup with the latest tip, options for quiet hours and tips.
- **Rana's own face**: drawn from the character bundle's `RANA_SPEC` (the mouse), from the site's
  `feat/exzi-dashboard-buddy` build at `a0915b7` (sha256 `3d1a740d…`, 73324 bytes); the icons are
  rendered from it.
- **Fixed download names** for the dashboard's links: `releases/latest/download/Rana-win.exe`,
  `Rana-mac.dmg` and `rana-extension.zip`. The release workflow drafts the release, attaches every file
  and publishes it as the latest only once all of them are there.
