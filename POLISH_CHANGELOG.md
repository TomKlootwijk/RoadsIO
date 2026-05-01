# Ultra Juice Polish Change Log

Build: `0.5.0-ultra-juice-polish`

Scope: presentation-only polish. Gameplay mechanics, scoring, movement constants, bot logic, round timing, room flow, and signaling compatibility were intentionally left unchanged.

## Added polish

- Procedural spark bursts for wall taps, paint combo pops, splats, and winner reveals.
- Boost speed streaks and motion-smear afterimages for a faster-feeling player without changing actual velocity.
- Winner confetti and a stronger round-end celebration.
- Leader crown above the current score leader when multiple players are present.
- Minimap viewport outline so players can read where the camera sits in the world.
- More dimensional wet-ink arena shading, soft glints, subtle world texture, and stronger vignette.
- More polished center banner with animated progress treatment.
- More expressive procedural audio cues for combo pops, wall bumps, round start, splats, and round end.
- CSS polish for menu glass, HUD readability, buttons, boost meter, touch controls, focus states, and reduced-motion mode.

## Verification

- `node --check RoadsIO/src/game.js`
- `node --check RuneValeSignaling/server.js`
- Final ZIP integrity test with `zip -T`

# Optimized Juice Pass

Build: `0.5.1-optimized-juice-polish`

Scope: performance and presentation polish only. Gameplay mechanics, scoring, movement constants, bot logic, round timing, room flow, and signaling compatibility remain unchanged.

## Optimization changes

- Cached the static arena backdrop and screen vignette instead of rebuilding full-canvas gradients every frame.
- Throttled leaderboard DOM updates and minimap refreshes.
- Added viewport culling for particles, ripples, shockwaves, floaters, and off-screen players.
- Added adaptive auto-DPR checks and lighter auto/medium FX budgets to recover FPS during busy scenes.
- Replaced per-frame FX array reallocations with in-place compaction.
- Removed expensive gameplay HUD backdrop blur while preserving the glass-panel look.

## Feel changes

- Reduced splat camera shake substantially while keeping the flash, audio, particles, and shockwave impact.
- Kept boost trails juicier with fewer but longer streaks for better readability and lower draw cost.


# Ultra-Optimized Juice Pass

Build: `0.6.0-ultra-juice-optimized`

Scope: responsiveness, feedback, and rendering efficiency. Core movement constants, scoring rules, room flow, and signaling compatibility key remain unchanged.

## Optimization changes

- Replaced costly dirty-grid queue slicing with cursor-based consumption for render and network deltas.
- Cached paint-cell world coordinates, grain values, sparkle masks, wet/deep/gloss lookup tables, and paint falloff lookup values.
- Reduced per-paint-cell math inside hot loops while preserving wet ink readability.
- Added Save-Data and reduced-motion awareness to lower DPR and skip expensive cosmetic layers when appropriate.

## Juice changes

- Added RUSH streak feedback with HUD badge, escalating float text, shockwaves, spark bursts, flash, and procedural audio stingers.
- Added lead-change drama with center banner, toast, shockwave, sparkle burst, and owner-sensitive audio.
- Added final-seconds countdown treatment with low-time timer pulse, banner, flash, shake, and audio ticks.
- Added screen-space speed/rush streaks and off-screen threat arrows for stronger moment-to-moment readability.
- Added network-safe round-start and splat event payloads so clients see matching GO and splat-streak celebrations.

## Verification

- `node --check RoadsIO/src/game.js`
- `node --check RuneValeSignaling/server.js`
- Node DOM/canvas smoke harness: local game starts, spawns players, runs 120 frames, updates HUD, and reports build `0.6.0-ultra-juice-optimized`.

# Feedback Polish Pass

Build: `0.6.2-feedback-polish`

Scope: addressed recent playtest feedback while preserving the core paint/boost/splat loop.

## Changes

- Removed the Paint Storm tier/label and capped the streak presentation at Mega Splash.
- Removed center-screen lead-change popups; lead changes now use a small world-space cue, a shorter toast, and lighter audio/shake.
- Removed final countdown center banners and final-second shake; the HUD timer is the only countdown treatment.
- Fixed the round-over restart bug by decrementing the intermission timer before the inactive-round early return, and broadcasting fresh round state/paint to clients.
- Hid the online lobby overlay during automatic intermission restarts so it no longer blocks round-end visuals.
- Reworked bot brains back toward calmer territory-first movement with much less direct hunting and less boost spam.
- Replaced the old rigid screen-space rush stripes with subtle world-space player trails that follow the player path.
- Reduced boost speed-line width/spawn rate and kept high-speed feedback out of the center of the screen.
- Replaced the overhead crown with a smaller lead badge and retained the softer leader halo.
- Improved splat collision fairness with contact padding, closing-speed checks, overlap separation, light bounce, and immediate client-side splat event feedback.
- Anchored player body highlights instead of rotating the glare with movement.

## Verification

- `node --check RoadsIO/src/game.js`
- Browser smoke test was attempted, but this execution environment blocks Chromium navigation to both local HTTP and file URLs (`ERR_BLOCKED_BY_ADMINISTRATOR`).

# Regression Recovery Pass

Build: `0.6.3-regression-recovery`

Scope: recover the stable pre-juice feel while preserving a cheap world-space player trail.

## Changes

- Fixed the mobile boost button cascade so the button stays bottom-right and the joystick remains untouched.
- Removed visible Rush/Splash streak presentation and audio while keeping normal paint scoring, boost, splats, and round flow.
- Restored the pre-juice bot brain values for more active hunting, painting, avoidance, and boost use.
- Removed feedback-build collision push/bounce and restored the previous splat impact threshold.
- Cut default mobile/auto cosmetic budgets, disabled screen rush/speed-line effects by default, and kept an optimized low-cost player trail.
