# AltF1 Racing

Arcade pixel-style F1 racing game for the browser.

Repository: https://github.com/EneaFerri/altf1-racing

```
npm install
npm run dev
```

Then open the URL printed by Vite. Project docs start at [CLAUDE.md](CLAUDE.md).

To play online (multiplayer), also start the server in a second terminal:

```
npm run server
```

Then choose **Multiplayer** on the start screen, a nickname and a circuit. Other machines (LAN, Tailscale) open the same Vite
URL. Details: [01_docs/multiplayer.md](01_docs/multiplayer.md).

## Play together on your Macs

One of you **hosts** (runs the server); everyone plays with the **macOS app** (or in a browser).
Send the whole project folder to your friends.

**Network.** Either all on the same Wi-Fi, or (anywhere in the world) install
[Tailscale](https://tailscale.com) on every Mac and share the host's machine with the others. The
host's address is its Tailscale IP (`tailscale ip -4`, e.g. `100.64.0.7`) or its Wi-Fi IP.

**The host** (once: [Node.js](https://nodejs.org) 22 or newer, then `npm ci` in the project folder):

```
npm run server
```

Leave it running. If macOS asks whether `node` may accept incoming connections, allow it.

**Everyone, the macOS app** (needs macOS 26 and Xcode 26 from the App Store):

1. Open `04_macos/AltF1.xcodeproj` in Xcode, scheme **AltF1**, destination **My Mac**, then
   **Product → Run** (⌘R). No Apple account needed: it is signed to run locally.
2. In the game: **Multiplayer** → **Server**: the host's IP (the host leaves it empty) → a
   nickname → **Free practice** or **Grand Prix** → a circuit. The first one in a Grand Prix is
   its manager (Enter starts it, 1–3 choose the race distance).
3. Keys: WASD drive, Space brake, R reset, V camera, Z look back; in the pit box 1 soft / 2
   medium tyres; Esc leaves.

**Or in a browser** (no Xcode): the host also runs `npm run dev` in a second terminal, and the
others open `http://<host IP>:5173`.

Everyone must run the same version of the project (the server refuses an older one).
