# Example Emulator Extension

This is a template for an emulator extension.

Use this for integrations such as mGBA, VBA-RR, BizHawk, or another emulator that can expose live Pokemon state through Lua, sockets, files, or an API.

## Responsibilities

- Connect to or run inside the emulator.
- Read live memory or emulator state.
- Emit a documented source contract for mapping, or use a reviewed direct export validated against `src/domains/pokemon/schemas/overlay-state.schema.json`.
- Document emulator version and setup.

## Not Responsible For

- Damage calculation.
- Capture calculation.
- Challenge scoring.
- ROM-hack data tables.
- Overlay layout.

## Expected Files

```text
extension.json
README.md
src/
fixtures/
```

Fixtures should be synthetic or public-safe.

