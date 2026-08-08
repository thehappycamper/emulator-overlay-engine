# Community Extensions

Community contributions are welcome, especially for emulator adapters, generation adapters, ROM-hack mappings, encounter data, trainer sets, scoring rulesets, and overlay panels.

Users should eventually be able to share complete templates that bundle these pieces into a reusable overlay setup.

## Extension Types

| Extension | Examples | Review Focus |
| --- | --- | --- |
| Emulator adapter | mGBA, VBA-RR, BizHawk | Reliability, setup docs, no unsafe local assumptions |
| Game adapter | Gen 3 Emerald, FireRed, Gen 4 | Correct memory/data mapping |
| ROM-hack adapter | Run & Bun, Radical Red | Versioned data, documented mechanics changes |
| Data pack | Learnsets, encounters, trainers, Battle Factory sets | Source clarity, schema compatibility |
| Fusion data pack | Fusion species, components, custom learnsets | Versioned custom data, normalized final stats |
| Mechanics extension | Gen or hack-specific formula/rule changes | Deterministic fixtures, scoped overrides |
| Calculator extension | Damage, catch odds, stat projection, learnset availability | Formula docs, deterministic fixtures |
| Ruleset | Nuzlocke scoring, low-score challenges | Determinism, clear scoring events |
| Analysis extension | Move prediction, set matching, score projection | Clear assumptions, confidence scoring |
| Overlay panel | Route view, capture odds, damage panel | Uses normalized state, accessible layout |
| Transport extension | File polling, WebSocket, HTTP bridge | Keeps transport separate from domain logic |

## Contribution Rules

- Do not commit ROMs, BIOS files, copyrighted game assets, personal saves, or secrets.
- Contributed data should document its source and target version.
- ROM-hack mappings must identify the hack name and version they support.
- Extensions should map into the normalized API instead of changing the engine for one specific ROM.
- Add sample fixtures where possible.
- Add or update tests for parser, mapping, or calculator behavior.
- Update `docs/project/features.md`, `docs/project/emulators.md`, and `docs/maps/code-map.md` when relevant.

## Review Policy

Community extensions should be reviewed before merge.

Review should check:

- Public-repo safety.
- License/source acceptability.
- Schema compatibility.
- Test coverage or sample fixture coverage.
- Documentation completeness.
- Whether the change belongs in core or should remain an extension.

## Suggested Extension Layout

```text
extensions/
  extension-name/
    README.md
    extension.json
    ...

data/
  generation-or-rom/
    README.md
    ...

rulesets/
  ruleset-name/
    README.md
    ...
```

The exact layout can evolve, but each extension should have a README that explains setup, supported versions, exported fields, and limitations.

Example extension manifests and README templates live in:

```text
examples/extensions/
```
