# ADR 0017: Domain-Owned Overlay Presentation

Date: 2026-08-08

Status: accepted

Implements: ADR 0008

## Context

P02 moved Pokemon calculators and normalized-state ownership into `src/domains/pokemon/`, but the browser overlay still interpreted Pokemon party, battle, move, encounter, capture, and score fields directly in `src/overlay/app.js`. Domain-specific layout classes also lived in the shared public stylesheet.

The shared extension manifest compounded that leakage by enumerating fixed UI slots including `party`. Removing that value outright would invalidate existing manifests even though the future panel runtime and full slot-placement behavior are not implemented.

## Decision

Keep the overlay boundary minimal and static:

- `src/overlay/host.js` is a domain-neutral dispatcher. It validates a selected domain descriptor's implemented presentation capability and invokes it with normalized state.
- `src/overlay/app.js` owns browser concerns only: application configuration, state loading, domain resolution, stylesheet installation, error display, and dispatch.
- The Pokemon descriptor exposes `presentation.renderOverlay` and `presentation.stylesheets`.
- Pokemon markup, field interpretation, calculator use, and layout CSS live under `src/domains/pokemon/`.
- `public/index.html` remains the explicit application composition point for the Pokemon MVP by selecting `data-domain="pokemon"`; this is configuration, not shared runtime logic.

This descriptor shape is the smallest interface needed by the current application. It is not a generalized plugin framework, dynamic domain installer, panel runtime, or sandbox.

Replace the extension schema's fixed slot enum with a validated semantic string identifier. New domain-specific slot IDs should be qualified, such as `pokemon.party`, `pokemon.battle`, and `pokemon.location`. Existing unqualified identifiers such as `party` remain valid for compatibility. Slot placement is still a future host/template concern; this decision only removes domain vocabulary from the shared schema without breaking current manifests.

## Trust Boundary

Domain renderers are executable JavaScript statically imported through application composition and trusted through repository review. Safe mapping expressions do not sandbox renderer code. Dynamic or marketplace-loaded presentation code still requires a separate permissions and sandboxing decision.

## Consequences

- Shared overlay code no longer knows Pokemon fields or calculators.
- The Pokemon package owns the first complete state, mechanics, and presentation slice.
- Current sample-overlay content and direct Pokemon state payloads remain compatible.
- Existing extension manifests using `party` remain schema-valid.
- New domains can expose different presentation behavior and semantic slot IDs without adding their vocabulary to platform schemas.
- A future panel extension host may refine placement contracts and versioning, but must preserve or explicitly migrate legacy slot identifiers.
- Events, actions, rules, maps, progress, dynamic loading, and live source integration remain separate work.
