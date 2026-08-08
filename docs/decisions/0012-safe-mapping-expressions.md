# ADR 0012: Safe Declarative Mapping Expressions

Date: 2026-08-08

Status: accepted

## Context

The future Extension Workbench needs a public, shareable format for mapping imported or captured data into normalized contracts. The initial mapping example represented calculated fields as JavaScript-like strings, including `[primary_type, secondary_type].filter(Boolean)`.

Executing contributor-authored JavaScript would cross a major trust boundary. It could access host globals, files, network APIs, credentials, or runtime state unless isolated by a separately designed sandbox. It would also make mappings difficult to validate, inspect, migrate, and reproduce across browser, CLI, and hosted runtimes.

The platform may eventually map to snapshot state, domain events, or other contract types. The mapping format therefore cannot assume a Pokemon payload or a single target category.

## Decision

Use a versioned, JSON-serializable mapping-project contract in `src/schemas/mapping.schema.json`.

Each project identifies named and versioned source and target contracts with opaque `id`, `type`, and `version` descriptors. Contract types are not a fixed platform enum. Paths use RFC 6901 JSON Pointer.

Calculated fields use a structural expression AST evaluated by `src/expressions/evaluate.js`. The evaluator has no string parser and does not use `eval`, `Function`, dynamic imports, arbitrary property invocation, or host API lookup.

The initial expression operations are:

- Values: `literal`, `field`, `array`, and `compact`.
- Arithmetic: `add`, `subtract`, `multiply`, `divide`, and `modulo`.
- Comparisons: `equal`, `notEqual`, `greaterThan`, `greaterThanOrEqual`, `lessThan`, and `lessThanOrEqual`.
- Boolean logic: `and`, `or`, and `not`.
- Selection and fallback: `if`, `coalesce`, and `default`.

Field expressions can read only explicitly supplied `source`, `target`, or `context` roots. Resolution uses own properties and blocks prototype-sensitive path segments.

`src/mapping/apply.js` executes direct field mappings, value mappings, and calculated fields in that order. It enforces declared required paths and supports a caller-provided final target validator selected from the target contract metadata.

## Extensibility

New expression operations require coordinated schema, evaluator, tests, and documentation changes. Operations must remain deterministic, pure, bounded, JSON-compatible, and explicitly whitelisted. Mapping `schemaVersion` changes should be used when semantics are incompatible.

Domain-specific calculations that cannot be expressed safely with the small AST belong in reviewed mechanics, calculator, ruleset, or analysis extensions. They do not justify arbitrary code inside mapping files.

## Consequences

- Mapping projects are human-readable, Git-reviewable, portable, and suitable for future GUI authoring.
- Untrusted mapping data does not become executable JavaScript.
- The same format can describe targets for state, events, or other future named contracts without redesigning field mappings.
- Expression authors cannot call methods, define functions, loop, access host globals, or dynamically load code.
- `compact` is the only initial array-filter helper and uses JSON-equivalent `filter(Boolean)` behavior.
- Final schema validation depends on a runtime contract registry or caller-provided validator; this slice provides the hook but does not implement a registry.
- Executable extension and panel entrypoints remain a separate trust and sandboxing problem.
