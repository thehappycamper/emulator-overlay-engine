# Example Mapping Project

This directory contains the first executable mapping-project example for the future Extension Workbench.

`mapping.example.json` validates against `src/schemas/mapping.schema.json`. It declares named and versioned source and target contracts, maps direct fields, and calculates derived fields with the safe JSON expression AST.

## Example Flow

```text
source data -> field mappings -> calculated fields -> normalized fixtures -> extension export
```

Paths are RFC 6901 JSON Pointers. Calculated fields are data structures, not JavaScript strings. The fusion `types` field uses an `array` expression wrapped by the whitelisted `compact` operation, which structurally reproduces the previous `[primary_type, secondary_type].filter(Boolean)` intent.

The executor applies direct field mappings, then ID/value mappings, then calculated fields. It checks declared required paths and can delegate final target-contract validation to a caller-provided validator.

## Public Safety

Mapping projects should not include ROMs, BIOS files, personal saves, secrets, or local absolute paths.
