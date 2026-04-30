# Networking Architecture

## Goal

Keep hosting free:

- Static game page on GitHub Pages.
- Render free web service used only for signaling.
- Real gameplay runs over browser-to-browser WebRTC DataChannels.
- Bots and simulation are host-authoritative.

## Why host-authoritative

The paint grid changes constantly. If every browser simulated independently, tiny timing differences would desync the map. This prototype uses one host as the source of truth:

- Host simulates players, bots, collisions, paint, round timer.
- Clients send input only.
- Host sends snapshots and paint deltas.
- Clients render snapshots.

This is simpler, cheaper, and good enough for casual friend rooms.

## Data flow

```text
Host browser      Signaling server      Client browser
     |                   |                    |
     | join ROOM         |                    |
     |------------------>|                    |
     |                   |       join ROOM    |
     |                   |<-------------------|
     | peer-joined       |                    |
     |<------------------|                    |
     | WebRTC offer      |                    |
     |------------------>| WebRTC offer       |
     |                   |------------------->|
     |                   | WebRTC answer      |
     | WebRTC answer     |<-------------------|
     |<------------------|                    |
     | ICE candidates    | ICE candidates     |
     |<----------------->|<------------------>| 
     |========== WebRTC DataChannel ==========>|
```

After the DataChannel opens, the signaling server is no longer in the gameplay path.

## Expected raw WebSocket signaling protocol

Client → server:

```json
{ "type": "join", "room": "ABCDE", "id": "player-id", "name": "Painter" }
```

Server → joining client:

```json
{ "type": "welcome", "room": "ABCDE", "id": "player-id", "peers": [{ "id": "host-id", "name": "Host" }] }
```

Server → existing peers:

```json
{ "type": "peer-joined", "room": "ABCDE", "id": "new-player-id", "name": "Painter" }
```

Client → server signal forwarding:

```json
{
  "type": "signal",
  "room": "ABCDE",
  "from": "host-id",
  "to": "client-id",
  "signal": { "type": "offer", "data": { "type": "offer", "sdp": "..." } }
}
```

Server → target peer:

```json
{
  "type": "signal",
  "room": "ABCDE",
  "from": "host-id",
  "to": "client-id",
  "signal": { "type": "offer", "data": { "type": "offer", "sdp": "..." } }
}
```

Signal types are:

- `offer`
- `answer`
- `ice`

## Compatibility with your existing Render server

The client defaults to:

```js
SIGNALING_URL: 'https://runevalesignaling.onrender.com'
SIGNALING_MODE: 'auto'
```

`auto` tries:

1. raw WebSocket at `/`, `/ws`, and `/signaling`, then
2. Socket.IO fallback loaded from CDN.

The client listens to several common event names:

- `welcome`
- `peers`
- `peer-joined`
- `user-joined`
- `user-connected`
- `signal`
- `offer`
- `answer`
- `candidate`
- `ice-candidate`

If your existing signaling server uses a very different schema, deploy the included compatible server or adjust `FlexibleSignal` in `src/game.js`.

## Included fallback signaling server

The folder `signaling-server/` contains a compatible Node server using the `ws` package.

Local test:

```bash
cd signaling-server
npm install
npm start
```

Then set in `src/game.js`:

```js
SIGNALING_URL: 'http://localhost:3000'
SIGNALING_MODE: 'websocket'
```

Render deploy:

- Use `signaling-server` as the service root.
- Build command: `npm install`.
- Start command: `npm start`.
- Health check path: `/health`.

A `render.yaml` is included.

## Known networking limitations

- No TURN server is included. Some strict NAT/mobile networks may fail peer-to-peer WebRTC. Add a TURN provider for reliability.
- The host is authoritative, so if the host leaves, the room ends. Host migration is not implemented.
- Snapshots are JSON for readability. For larger rooms, switch paint deltas to binary packets.
- The Socket.IO fallback is best-effort because signaling servers often use custom event names.
