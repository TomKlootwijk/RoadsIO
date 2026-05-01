# Implemented vs Not Yet Implemented

## Implemented

### Game loop

- Three-minute rounds.
- Territory scoring.
- Neutral paint claiming.
- Enemy paint conversion with resistance.
- Round winner and auto-restart.
- Fast respawn after splat.

### Movement and controls

- Desktop keyboard controls.
- Desktop click/drag steering fallback.
- Mobile joystick.
- Mobile boost button.
- Fullscreen button.
- Sound toggle.

### Juice and polish

- Jello/blob player rendering with springy perimeter motion.
- Squash/stretch based on speed and impact.
- Wet-look paint field shading with sheen and stronger edge definition.
- Paint particles with droplet streaks.
- Richer splat bursts and layered shockwaves.
- Floating combo/winner text.
- Screen shake and flash on impact.
- Mini-map.
- Glassy responsive UI.
- Animated menu background.
- Boost meter and leaderboard.

### Bots

- Solo mode bots.
- Host can add bots mid-game.
- Bots seek neutral/enemy paint.
- Bots occasionally hunt weaker players.
- Bots avoid nearby larger threats.

### Performance

- Low-resolution paint grid.
- Offscreen paint canvas.
- Dirty-cell rendering updates.
- Auto quality mode with pixel-ratio cap.
- No external game engine.
- No bundled third-party assets.

### Multiplayer

- Room-code hosting.
- Existing signaling URL configured.
- Render wake-up notification/modal.
- RuneVale HTTP long-poll signaling support.
- Conservative signaling hardening: no-store responses and long-poll waiter cleanup.
- WebRTC DataChannel setup.
- Host-authoritative simulation.
- Client input packets.
- Host snapshots and paint deltas.
- Host match and bots wait until signaling succeeds.

## Not yet implemented

### Product/game design

- Persistent player progression.
- Cosmetics/unlocks.
- Multiple arenas.
- Party lobby chat.
- Ready check before round start.
- Spectator mode.
- Team mode.
- Power-ups.

### Networking

- TURN server configuration.
- Host migration.
- Rejoin/resume after disconnect.
- Binary network packets.
- Latency compensation for local client prediction.
- Server-side room listing.
- Anti-cheat; this is for friends, not public matchmaking.

### Mobile polish

- Orientation-specific HUD variants.
- Haptic vibration hooks.
- Safe-area testing on many actual devices.
- Accessibility pass for color-blind palettes.

### Audio

- Real sound assets/music.
- Per-event mix balancing.
- Mobile haptic + audio unlock flow tuning.

### QA

- Browser matrix testing.
- Two-device multiplayer testing against the live signaling service.
- Load testing for many rooms.
- Automated tests.
