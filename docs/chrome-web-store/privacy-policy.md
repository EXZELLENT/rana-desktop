# Rana privacy policy

*For the Rana browser extension ("Rana by Exzellent" for Chrome) and the Rana desktop app for Windows
and macOS. Last updated: 20 October 2026.*

Rana is the on-screen companion of Exzellent Language Institute ("Exzellent", "we", "us"). She shows
you tips from your own Exzellent dashboard while you are away from it. This policy says what Rana
collects, why, how long it is kept and how you stay in control. It adds to the
[Exzellent Privacy Policy](https://www.exzellent.co/privacy), which covers your Exzellent account and
the website itself.

## The short version

- Rana does nothing until you connect her to your Exzellent account, and you can disconnect her at any
  time, from Rana or from your dashboard.
- She never sees your password: you connect with a code that you approve on your dashboard.
- She does not read the web pages you visit, does not send the windows or sites you use, and does not
  collect analytics. The only things she sends go to Exzellent, and only while you are connected: the
  sign-in, the request for the next tip, your answer to a tip, and the sign-out.
- We do not sell your data and do not share it with anyone for their own purposes.

## 1. What Rana collects, and why

### When you connect (both apps)

You connect Rana with a **device code**, the way you sign in a TV app:

1. Rana asks the Exzellent backend for a code and sends a **device name**, so you can recognise the
   device on your dashboard: "Chrome on Windows" (the extension) or your computer's name (the desktop
   app). The code is valid for ten minutes.
2. You open your dashboard's Rana page while signed in to exzellent.co, see which device is asking, and
   approve the code there.
3. Exzellent gives Rana an **access token** and a **refresh token** for your account, and your **name**,
   so she can say "Connected as …". Your password never passes through Rana.

On our side this creates a **device session** on your account: its kind (desktop app or extension), the
device name, when it was created and last used, and a protected (hashed) copy of the refresh token.

### While you are connected (both apps)

- **The next tip.** Every few minutes (30 seconds to 10 minutes, as the backend says) Rana asks the
  Exzellent backend for the next tip, with her access token. The backend builds the tip from information
  your Exzellent account already holds: your next lesson or class, the homework due soonest, your streak,
  your credits, the course you last opened, and whether the dashboard's own buddy is open. Rana sends
  nothing else with the request.
- **Your answer to a tip.** When you choose Okay, Later or Not this, Rana sends the tip's id and your
  answer, so that "Later" keeps tips away for 30 minutes and "Not this" holds that kind of tip for a day.
- **The sign-out.** Disconnect sends one request that ends the device session.

### What the browser extension reads

- **On exzellent.co**, the extension reads only the signal the Exzellent dashboard sets for her: whether
  the dashboard's own buddy is open, minimized or full screen (the page's `data-exzi-dock` attribute and
  `exz:exzi-state` event). She uses it on your computer to hide while that buddy is open. It is not sent.
- **On other sites**, nothing. Rana appears on other sites only if you turn on **"Rana everywhere"** in
  her settings and allow it in Chrome's prompt ("read and change all your data on all websites", which
  Chrome needs before any extension may draw on a page). Even then she only draws herself in the corner of
  the page; she does not read the page, its address (beyond telling exzellent.co apart from other sites)
  or anything you type, and sends nothing about it. Turning the switch off takes the permission back.

### What the desktop app senses, on your computer only

The desktop app asks for your consent before it senses anything, and each sense has its own switch:

- **The active window** (the app's name and the window's title), every few seconds, to notice a long
  focus streak, a document you have been working on for a long time, rapid switching, drifting to social
  sites during work hours or a late night, and say something about it. On macOS this needs the Screen
  Recording permission; without it the app simply senses nothing.
- **Idle time**, to notice breaks.

Window titles are sorted into a category (for example code, documents, study, social) in memory and then
forgotten. **Titles, app names, screenshots, screen contents and keystrokes are never stored and never
sent.** The desktop app does not read the screen's content.

### What Rana does not collect

No browsing history, no page content, no screenshots, no keystrokes, no location, no contacts, no files,
no payment information, no advertising identifiers. Rana has no analytics, no crash reporting and no
telemetry, and shows no ads.

## 2. Where it is kept, and for how long

**On your device**

- The extension keeps its tokens, the waiting tip, your settings (tips on or off, quiet hours, "Rana
  everywhere", the server), her place on the screen and "hide for today" in Chrome's local extension
  storage for your Chrome profile. Nothing is synced to other devices.
- The desktop app keeps your consent choices, your profile for her messages (what she calls you, persona,
  tone), quiet hours, her window position and the tokens in a settings file in the app's data folder. The
  tokens are encrypted with your operating system's keychain (DPAPI on Windows, Keychain on macOS); where
  the system cannot encrypt them, they are kept in memory only, until Rana quits.
- **Disconnect** deletes the tokens and the waiting tip. **Uninstalling the extension** deletes all of
  its storage. Uninstalling the desktop app leaves its settings folder, so you keep your choices for a
  reinstall; to remove it, delete `%APPDATA%\Rana` (Windows) or `~/Library/Application Support/Rana`
  (macOS) after uninstalling.

**At Exzellent**

| What | How long |
| --- | --- |
| A sign-in code and its device name, before approval | 10 minutes, then it is deleted |
| The device session (kind, device name, created, last used, hashed refresh token) | Until you disconnect the device, from Rana or from your dashboard. An access token lasts 12 hours; the refresh token lasts 90 days and is replaced each time it is used, so a device unused for 90 days is signed out. An account keeps at most 10 sessions; opening another removes the one used longest ago. |
| The tip record (the last tip, cooldowns, your Later / Not this answers) and the buddy state | 24 hours from the last change (the tip record 25 hours), then deleted |
| Your account and its learning records | As described in the Exzellent Privacy Policy; Rana adds nothing to them |

## 3. Sharing

We do not sell Rana's data, rent it, use it for advertising or share it with anyone for their own
purposes. It is used only to give you tips and to keep your device signed in.

The Exzellent backend runs on hosting and database services that process data on our behalf, under
contract and only to run the service. When it is turned on, the backend may have one sentence of a tip
reworded by an AI language service (Groq) so that it reads naturally in your language; that sentence can
contain your first name, a teacher's name, a lesson time or a homework title, and nothing that Rana
collected on your device. We may disclose information if the law requires it.

## 4. Your choices and control

- **Disconnect** in Rana (extension: Settings → Disconnect; desktop: Settings, consent & account →
  Disconnect), or on your dashboard's Rana page under **Connected devices**, which signs that device out
  at once. The dashboard shows every device that is connected to your account.
- **Tips off** without disconnecting, **quiet hours** (23:45 to 07:00 unless you change them),
  **hide for today**, and **Later / Not this** on each tip.
- **"Rana everywhere"** is off unless you turn it on; you can also remove the site access in Chrome
  (`chrome://extensions` → Rana → Details → Site access).
- On the desktop app, each sense (active window, idle time) can be switched off, and nothing is sensed
  before you consent.
- Your rights to access, correct, delete or move your data, and to object or complain to a data
  protection authority, are described in the Exzellent Privacy Policy and apply to Rana too.

## 5. Children

Rana is part of an Exzellent account and follows the age rules of the Exzellent Privacy Policy.

## 6. Changes

If Rana starts collecting anything new, we will update this page and change the date at the top before
the new version is released, and the extension's store listing with it.

## 7. Contact

Exzellent Language Institute, [info@exzellent.co](mailto:info@exzellent.co).
