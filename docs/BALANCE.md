# Balance Model

The current tuning aims for casual friendliness rather than esports precision.

## Main values

| System | Current value | Why |
|---|---:|---|
| Round length | 180 seconds | Short enough for repeat play, long enough for comebacks. |
| Paint grid | 96 × 60 cells | Cheap to render and sync; still detailed enough to feel smooth. |
| Base radius | 20 world units | Readable on mobile. |
| Max radius bonus | +20 world units | Big players are noticeable but not absurd. |
| Base speed | 218 world units/sec | Responsive on keyboard and joystick. |
| Area speed bonus | up to +72 | Winners feel momentum, but not unstoppable. |
| Boost multiplier | 1.55× | Strong enough to create moments. |
| Boost drain | 0.44/sec | Full boost lasts about 2.3 seconds. |
| Boost regen | 0.18/sec | Recharges in about 5.5 seconds. |
| Convert power | lower than neutral paint | Enemy territory resists briefly, creating border fights. |

## Growth formula

Owned cells affect radius and speed:

```js
radius = BASE_RADIUS + min(MAX_RADIUS_BONUS, sqrt(ownedCells) * 0.29)
speed = BASE_SPEED + min(MAX_AREA_SPEED_BONUS, ownedCells * 0.055) - radiusPenalty
```

The intent: territory gives momentum, but the bigger hitbox creates risk.

## Splat rules

A collision can splat a player if:

- impact speed is high enough, and
- the attacker is either meaningfully larger or boosting.

Splatting gives the attacker boost and converts a burst of paint around the victim, but the victim respawns quickly.

## Bot behavior

Bots sample random paint cells and prefer:

- neutral cells,
- enemy cells,
- nearby opportunities,
- occasional hunting if their personality is aggressive.

They avoid bigger nearby threats.

## Recommended next tuning passes

1. **First 10 seconds:** make sure players do not feel too slow before territory grows.
2. **Final 30 seconds:** boost and splats should allow comebacks without making scores random.
3. **Two-player rooms:** bots should fill the map but not decide the winner too often.
4. **Mobile:** joystick turning should feel slightly forgiving; raise acceleration before raising top speed.
5. **Rage prevention:** keep respawn below 2.5 seconds.
