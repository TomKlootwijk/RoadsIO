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
