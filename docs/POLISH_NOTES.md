# 0.3.0 Polish / Juiciness Pass

## Goals
- Improve perceived quality without changing the rules of play.
- Keep the simulation and networking model intact.
- Stay efficient on low and mid-tier phones.

## Visual changes
- Players now render as more convincing jello/blob shapes using a lightweight spring-deformed perimeter.
- Paint uses richer per-cell shading so claimed territory feels wetter, glossier, and more readable.
- The arena now adds a subtle shadow, sheen pass, and moving glint for stronger “fresh ink” feedback.
- Particles now support droplet-style streaks for paint movement and splat bursts.
- Shockwaves are layered for better impact readability.
- HUD/menu glass treatment and button polish were improved.

## Networking changes
These are intentionally conservative. The round flow and host-authoritative architecture remain unchanged.
- Signaling server now sets explicit no-store/no-cache headers.
- Long-poll waiters are cleaned up when clients disconnect during a pending request, reducing leak/stale waiter risk.

## What was intentionally not changed
- No new gameplay features.
- No new win conditions, abilities, or modes.
- No changes to the stable room/join/round flow model.


## 0.4.0 extra polish pass

### Audio
- Replaced the rough beeps with a fuller procedural audio layer using a compressor, filtered noise, and better envelopes.
- Paint now has short wet swishes instead of only pitched pings.
- Boost has a quieter controlled engine/air layer instead of a harsh tone.
- Splat and bump sounds now combine low thump, filtered noise, and short transient tones.
- Music is now a softer generative arcade loop with bass, pads, light percussion, and plucks.
- Added conservative mobile vibration hooks for bumps/splats/round-end where supported.

### Visual feel
- Added cosmetic wet ink ripples during painting on medium/high quality.
- Added subtle camera lead based on player velocity for snappier feel without changing gameplay.
- Added internal blob caustic highlights for a more convincing jello look.

### Stability boundaries
- The gameplay model, scoring, bots, networking protocol, round flow, and controls were not changed.

### Performance guardrails
- Cosmetic ripples, caustic blob highlights, extra particle density, and high-detail blob meshes are disabled or reduced in Low quality and automatically throttled when Auto quality detects low FPS.
