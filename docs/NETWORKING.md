# Networking Architecture

## Goal

Keep hosting free:

- Static game page on GitHub Pages.
- Render free web service used only for signaling.
- Real gameplay runs over browser-to-browser WebRTC DataChannels.
- Bots and simulation are host-authoritative.

## Why Host-Authoritative

The paint grid changes constantly. If every browser simulated independently, tiny timing differences would desync the map. This prototype uses one host as the source of truth:

- Host simulates players, bots, collisions, paint, round timer.
- Clients send input only.
- Host sends snapshots and paint deltas.
- Clients render snapshots.

This is simpler, cheaper, and good enough for casual friend rooms.

## Data Flow

```text
Host browser      HTTP signaling       Client browser
     |                 server               |
     | POST /rooms       |                  |
     |------------------>|                  |
     | room code         |                  |
     |<------------------|                  |
     |                   | POST /join       |
     |                   |<-----------------|
     | long-poll join    |                  |
     |<------------------|                  |
     | POST offer        |                  |
     |------------------>| long-poll offer  |
     |                   |----------------->|
     |                   | POST answer      |
     | long-poll answer  |<-----------------|
     |<------------------|                  |
     | ICE via /signals  | ICE via /signals |
     |<----------------->|<---------------->|
     |========== WebRTC DataChannel =======>|
```

After the DataChannel opens, the signaling server is no longer in the gameplay path.

## RuneVale HTTP Signaling Protocol

The client uses the HTTP-only RuneValeSignaling service. It is a temporary mailbox for WebRTC negotiation, not a gameplay relay.

Host creates a room:

```json
POST /rooms
{
  "hostPeerId": "host-id",
  "maxPeers": 8,
  "gameVersion": "0.1.0-prototype",
  "contentHash": "roads-splash-io-v1"
}
```

Client joins a room:

```json
POST /rooms/ABC123/join
{
  "peerId": "client-id",
  "displayName": "Painter",
  "gameVersion": "0.1.0-prototype",
  "contentHash": "roads-splash-io-v1"
}
```

Peers publish SDP/ICE messages:

```json
POST /rooms/ABC123/signals
{
  "from": "host-id",
  "to": "client-id",
  "kind": "offer",
  "payload": { "type": "offer", "sdp": "..." }
}
```

Peers long-poll for messages:

```text
GET /rooms/ABC123/signals?peerId=client-id&since=12&timeoutMs=25000
```

Signal kinds used by RoadsSplash.io:

- `join`
- `offer`
- `answer`
- `ice`
- `bye`

## Configuration

The client defaults to:

```js
SIGNALING_URL: 'https://runevalesignaling.onrender.com'
SIGNALING_MODE: 'http'
SIGNALING_CONTENT_HASH: 'roads-splash-io-v1'
```

The server lives at `C:\Users\Tom\Documents\CODEX Projects\RuneValeSignaling` during local development and exposes `/healthz`, `/rooms`, `/rooms/:roomCode/join`, `/rooms/:roomCode/signals`, and `/rooms/:roomCode/heartbeat`.

## Known Networking Limitations

- No TURN server is included. Some strict NAT/mobile networks may fail peer-to-peer WebRTC. Add a TURN provider for reliability.
- Signaling mailbox responses now explicitly disable caching, and long-poll waiters are cleaned up if a polling client disconnects mid-request.
- Hosts and clients send a lightweight heartbeat while in a room so one delayed long-poll does not make the server strand that browser's peer id.
- The host is authoritative, so if the host leaves, the room ends. Host migration is not implemented.
- Snapshots are JSON for readability. For larger rooms, switch paint deltas to binary packets.
- The signaling mailbox is intentionally not a gameplay relay. If WebRTC cannot connect on a strict network, add TURN rather than sending gameplay through signaling.
