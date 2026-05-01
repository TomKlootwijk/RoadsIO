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

## 0.5.0 ultra-juice polish pass

### Scope boundary
- This pass is intentionally cosmetic-only.
- No movement constants, paint/scoring rules, splat thresholds, bot behavior, round timing, room flow, signaling protocol, or compatibility key were changed.

### New visual juice
- Added boost speed streaks and subtle blob afterimages.
- Added spark bursts for combo pops, wall taps, splats, and winner celebrations.
- Added winner confetti and a score-leader crown.
- Added a minimap viewport outline.
- Added stronger arena depth: background texture, wet-ink shimmer, glints, and vignette.
- Added a richer round/winner banner treatment.

### Interface polish
- Improved menu glass, logo shine, button sweeps, HUD legibility, boost meter sheen, touch-control glass, and keyboard focus visibility.
- Added reduced-motion CSS guardrails for users who prefer less animation.

### Audio polish
- Added round-start, wall-bump, combo-pop, and celebration layers to the existing procedural audio system.

### Performance guardrails
- New cosmetic effects are reduced or skipped by Low quality and by Auto quality when FPS falls.

## 0.5.1 optimized-juice polish pass

Presentation/performance pass only; gameplay mechanics remain unchanged.

- Cached static canvas backdrop/vignette work to reduce full-screen per-frame gradient cost.
- Throttled HUD leaderboard rebuilds and minimap refreshes.
- Added off-screen FX culling and in-place FX list compaction.
- Reduced splat screen shake while preserving impact through softer flash, particles, and shockwaves.
- Replaced gameplay HUD backdrop blur with a cheaper glass treatment.


## 0.6.0 ultra-optimized juice pass

This pass keeps the existing rules intact while making the game feel faster, clearer, and more responsive.

### New feedback loops
- RUSH streaks reward continuous painting with an escalating HUD badge, pop text, shockwaves, spark bursts, flash, and procedural audio.
- Lead changes now announce themselves with a short banner, toast, sparkle burst, and screen feedback.
- The last 10 seconds now create an endgame pulse with timer styling, countdown banners, audio ticks, and urgency flashes.
- High-speed play gains screen-space rush streaks, while nearby off-screen threats get edge arrows.

### Performance improvements
- Paint rendering now caches falloff, world-coordinate, wet/deep/gloss, grain, and sparkle data.
- Dirty paint/network delta queues use cursor consumption rather than repeated array slicing.
- Save-Data and reduced-motion preferences automatically trim DPR and expensive cosmetic layers.

### Compatibility boundaries
- No changes to the stable signaling compatibility key.
- No changes to movement constants, win condition, scoring rules, or round length.

## 0.6.0 merge retention note

- Merged the ultra-juice optimized pass onto the local deep-polish work rather than replacing it wholesale.
- Retained deep wet-ripple depth/highlight rendering, directional paint rims, conversion flecks, impact-biased jello visuals, camera pulses, music ducking, and current-player HUD glow.
- Kept the incoming RUSH streaks, lead-change feedback, final-countdown urgency, speed streaks, threat arrows, cached paint hot paths, and optimized FX budgets.
- Signaling compatibility remains `roads-splash-io-v1`.
