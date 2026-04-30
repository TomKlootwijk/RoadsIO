# Codex / Engineer Handoff

## Highest-impact next tasks

1. **Verify the real signaling server schema**  
   The client tries raw WebSocket and Socket.IO, but the exact server at `https://runevalesignaling.onrender.com` was not introspectable from this environment because it returned a cold/503 response. Open the browser console during Host/Join and confirm which events arrive.

2. **Run two-device multiplayer QA**  
   Test GitHub Pages URL on two different networks. If WebRTC fails on one network, add TURN.

3. **Add a tiny debug panel**  
   Show signaling mode, peer count, datachannel state, ping, last snapshot age, and delta size.

4. **Tune conversion speed**  
   The current values are fun-first guesses. Tune `CONVERT_POWER`, `PAINT_POWER`, and `BOOST_MULT` after five real matches.

5. **Add ready/lobby state**  
   Currently the host starts the round immediately. For friend rooms, a lobby countdown will feel more polished.

## Files to edit first

- `src/game.js`  
  All game code and config. Start at the `CONFIG` object.

- `src/styles.css`  
  HUD/menu/mobile layout.

- `signaling-server/server.js`  
  Optional compatible signaling server.

## Configuration hotspots

```js
ROUND_SECONDS
GRID_W / GRID_H
BASE_RADIUS
BASE_SPEED
BOOST_MULT
CONVERT_POWER
HOST_SNAPSHOT_HZ
FULL_GRID_SECONDS
ICE_SERVERS
SIGNALING_URL
SIGNALING_MODE
```

## Suggested deploy sequence

1. Push static client to GitHub Pages.
2. Test Solo mode on desktop and phone.
3. Test Host Room with one browser tab and Join from another tab.
4. Test on two devices on the same Wi-Fi.
5. Test on two devices on different networks.
6. If different-network WebRTC fails, add TURN credentials.
7. If existing signaling server is incompatible, deploy `signaling-server/` to Render and update `SIGNALING_URL`.

## Suggested feature roadmap

### v0.2

- Lobby screen with players and bots.
- Countdown before round start.
- Debug networking panel.
- Better bot difficulty slider.

### v0.3

- Power-ups: Speed Pad, Paint Bomb, Shield, Vacuum.
- Arena hazards: clean zones, slippery zones.
- Team mode.

### v0.4

- Cosmetic trails.
- Local persistent stats.
- Better audio pack.
- Color-blind mode.

## Design guardrails

- Keep controls one-stick + one-button.
- Do not add shooting unless it directly supports paint territory.
- Avoid permanent death.
- Keep rounds under four minutes.
- Every feature should create visible paint changes or funny social moments.
