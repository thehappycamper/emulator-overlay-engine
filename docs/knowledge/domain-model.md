# Domain Model

## Normalized Pokemon

A normalized Pokemon should include:

- Species ID and display name.
- Nickname.
- Level.
- Types.
- Ability.
- Held item.
- Current and max HP.
- Stats.
- IVs and EVs when available.
- Moves.
- Status.
- PID or personality value when available.
- Optional display metadata for forms or custom names.
- Optional components/source IDs for fused or composed Pokemon.

The source generation may represent these differently. Adapters are responsible for mapping them into this shape.

## Normalized Battle

A battle state should include:

- Active player Pokemon.
- Active opponent Pokemon.
- Known opponent moves.
- Weather.
- Turn number.
- Stat stages when available.
- Screens, hazards, volatile status, and field effects when available.

The MVP only models a small subset. Future work should extend the schema deliberately and document compatibility.

## Normalized Location

A location should include:

- Display name.
- Stable map identifier.
- Encounter tables by method.
- Encounter levels and rates.

Encounter data may come from ROM tables, hand-authored data, or external extraction.

## Normalized Bag

The bag should include relevant categories first:

- Balls for capture odds.
- TMs/HMs for compatibility.
- Battle items for challenge scoring.
- Healing items for challenge scoring.

Adapters may omit categories that are not yet supported.

## Score State

Challenge scoring should be ruleset-driven.

The engine should support:

- Current score.
- Score event history.
- Per-Pokemon score breakdown.
- Projected score impact for current decisions.

## Extension State

The normalized state can include a top-level `extensions` object for extension-specific runtime data.

Extension keys should use stable extension IDs:

```json
{
  "extensions": {
    "example.extension-id": {
      "customValue": true
    }
  }
}
```

This keeps custom data available to UI panels without forcing every extension-specific field into the core schema.
