# RoadsSplash.io

A polished prototype for a casual `.io` territory game: roll a paint ball, convert enemy paint, boost into fights, and win by owning the most map after a three-minute round.

This build is intentionally static and dependency-light so it can run from **GitHub Pages**. Multiplayer uses **WebRTC DataChannels** with a signaling server only for room setup. The default signaling URL is already set to:

```js
https://runevalesignaling.onrender.com
```

The game also includes bots, so it is playable solo or with only two humans.

## Quick start

### Run locally

Because the game uses normal browser APIs and relative files, the safest local test is a tiny static server:

```bash
cd RoadsIO
python3 -m http.server 8080
# open http://localhost:8080
```

Opening `index.html` directly may work in some browsers, but a local server better matches GitHub Pages.

### Deploy the page to GitHub Pages

1. Push everything in this folder to a GitHub repo.
2. In GitHub: Settings → Pages.
3. Source: `Deploy from a branch`.
4. Branch: `main`, folder: `/root`.
5. Open the GitHub Pages URL on desktop or mobile.

### Multiplayer flow

1. Player A clicks **Host room**.
2. The game connects to the signaling server. If Render is asleep, a wake-up modal appears.
3. Player A shares the room code.
4. Player B enters the code and clicks **Join**.
5. After signaling, browser-to-browser WebRTC takes over.

## Controls

Desktop:

- WASD or arrow keys to steer.
- Space or Shift to boost.
- Fullscreen button in the lower-left.

Mobile:

- Drag the joystick.
- Hold BOOST.
- Fullscreen button in the top-right cluster.

## What is in this zip

```text
index.html                    Static page shell
src/styles.css                Responsive UI and HUD styling
src/game.js                   Game, bots, rendering, WebRTC and signaling client
docs/CONCEPT.md               Game design concept
docs/BALANCE.md               Current balance model and tuning knobs
docs/NETWORKING.md            WebRTC/signaling architecture and protocol
docs/IMPLEMENTED.md           What is implemented vs not yet implemented
docs/CODEX_HANDOFF.md         Practical next tasks for Codex or another engineer
```

## Current prototype status

The local/bot game is fully playable. Multiplayer is implemented as host-authoritative WebRTC DataChannels. The signaling phase uses the existing RuneVale HTTP long-poll mailbox at `https://runevalesignaling.onrender.com` only to exchange room joins, WebRTC offers, answers, and ICE candidates.

The signaling server does not carry gameplay packets. After the DataChannel opens, gameplay traffic is peer-to-peer between browsers.

## Changing the signaling URL

Edit `src/game.js` near the top:

```js
SIGNALING_URL: 'https://runevalesignaling.onrender.com'
SIGNALING_MODE: 'http'
```

The expected server protocol is the HTTP-only RuneValeSignaling API documented in `docs/NETWORKING.md`.

## Performance notes

The game is built around a low-resolution paint grid rendered to an offscreen canvas and scaled up. That gives immediate visual feedback while staying cheap on older phones. Quality defaults to `Auto / potato friendly`, which caps device pixel ratio on small or slow devices.

## No asset licensing risk

No third-party art assets are bundled. The current look is generated using CSS and Canvas: paint blobs, shine, particles, UI glass, and logo. This keeps the repo shippable without license cleanup.
