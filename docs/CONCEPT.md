# RoadsSplash.io Concept

## One-sentence pitch

**RoadsSplash.io** is a fast casual territory game where rolling paint balls race to cover the arena, steal enemy paint, and splat rivals before the timer ends.

## Design pillars

1. **Instant readability**  
   Every action changes the map color immediately. Players can understand who is winning without reading UI.

2. **One-button depth**  
   Movement is the main skill. Boost is the only extra action, used for stealing, escaping, and splatting.

3. **Friendly chaos**  
   Respawns are quick, rounds are short, bots keep empty rooms alive, and losing one fight does not delete your whole game.

4. **Potato-phone first**  
   The paint map is a small grid, not a giant physics world. The juice comes from clever rendering, particles, bounce, squash, and UI feedback rather than heavy assets.

## Core loop

1. Spawn on a small patch of your own paint.
2. Roll over neutral cells to claim them.
3. Roll over enemy cells to gradually convert them.
4. Gain score from owned cells.
5. More owned cells make your ball larger and slightly faster.
6. Larger balls are easier targets but better at body-blocking and splatting.
7. Hold boost to steal territory or ram someone.
8. At 3:00, most painted area wins.

## Why it should feel addictive

- **Constant micro-rewards:** every tile conversion changes the arena.
- **Visible comeback routes:** enemy territory is always stealable.
- **Risk/reward growth:** being big feels powerful but dangerous.
- **Short commitment:** three-minute rounds encourage “one more game”.
- **Social chaos:** friends can gang up, steal borders, and ram at the last second.

## MVP round structure

- Match length: 180 seconds.
- Win condition: most grid cells owned.
- Death: temporary splat/respawn, not full elimination.
- Bots: host-authoritative and present in solo play.
- Multiplayer: room code, WebRTC peer connection, host simulation.

## Theme and visual language

The current style is neon paint on a dark arena. It is intentionally toy-like:

- Glossy paint balls.
- Squash/stretch while moving.
- Paint particles behind the ball.
- Mini-map showing territory at a glance.
- Glassy HUD and colorful buttons.

No external art is needed for the MVP.
