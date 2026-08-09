# Architecture Knowledge

Emulator Overlay Engine separates source-specific data collection from normalized telemetry, domain meaning, and consumer experiences. The canonical product direction is in `product-vision.md`.

## Intended Pipeline

```text
Game / Emulator / External Source
            |
 Source Provider / Adapter
            |
      Source Contract
            |
   Declarative Mapping
            |
      Normalized State
            |
      Event Detection       (future)
            |
     Normalized Events      (future)
            |
 Rules / Analysis / Subscriptions
            |               (future event consumption)
         Actions            (future)
            |
Overlays / Automations / Sessions
```

The implemented platform foundation currently reaches normalized state, deterministic calculations, and a static state-driven overlay. Later layers in the diagram are architecture direction, not shipped behavior.

## Source Boundary

EOE is source-agnostic. EOE Core begins with source-provider/adapter contracts and should not depend on how gameplay information was acquired.

```text
Source Provider -> Source Contract -> Mapping -> Normalized State
```

An emulator memory reader, native game plugin, browser integration, telemetry endpoint, log/save reader, existing gaming protocol, vision/audio detector, or hardware sensor can all be source providers if they emit an appropriate source contract. These are architectural source classes, not implemented integrations.

The mapping and downstream domain layers should not branch on whether state originated from emulator memory, a native API, a web game, a capture-card vision adapter, or another source. Acquisition-specific behavior remains inside the source boundary.

Different providers may eventually carry different fidelity, provenance, or confidence. Exact memory values and inferred computer-vision observations are not equivalent, but metadata for that distinction has not been designed. Adding it requires a separate contract decision.

The first implemented concrete source contract is `pokemon.emerald.us-rev0.mgba.acquisition@1.0.0`, owned by `adapters/gen3-mgba/`. Its adapter-owned mapping now proves the local path into validated Pokemon normalized state and `public/live-state.json`. A generic source-provider runtime remains future work; the current watcher is narrow Emerald integration tooling.

## Layers

1. Source Provider / Adapter

Acquires gameplay information and emits a named source contract. Emulator and game adapters are one possible composition inside this boundary: an emulator adapter can acquire bytes/state while a game adapter decodes source-specific structures. Other providers may combine acquisition and decoding in a native plugin, web integration, protocol bridge, file reader, or inferred-observation adapter.

2. Data Adapter

Provides static or extracted data: species, moves, items, abilities, type chart, learnsets, TM compatibility, encounters, trainers, Battle Factory sets, and mechanics differences.

3. Mapping Runtime

Transforms source JSON into a named and versioned target contract through direct fields, ID/value mappings, and safe calculated expressions. The runtime does not execute mapping-provided code.

4. Domain Engine

Owns domain-specific contracts, calculations, and presentation. The first implemented boundary is `src/domains/pokemon/`, which owns the current normalized-state schema, damage/capture/type-effectiveness calculations, and static overlay rendering/styles. Its descriptor publishes named state-contract metadata and a presentation capability. A small domain-neutral registry in `src/platform/domain-registry.js` resolves explicitly composed domain packages without importing Pokemon itself.

The browser bootstrap and presentation dispatcher remain domain-neutral. Source acquisition remains independent from domain interpretation: providers emit source contracts, mappings produce named domain-owned targets, and domain packages interpret and present those targets.

5. Semantic Event Detection (Future)

Interprets changes between previous and current normalized domain state and emits meaningful domain events. Consumers should not need emulator addresses or source-specific bit semantics. No event contract or detector runtime exists yet.

6. Rules, Subscriptions, And Actions (Future)

Rules and subscribers consume semantic events. The internal engine should own game semantics, routing, permissions, session policy, provider-capability checks, and native action execution. Actions represent requested outcomes through future providers such as overlay, audio, streaming, webhook, WebSocket, MQTT, IPC, or hardware bridges. External workflow systems may consume events or request authorized actions through generic integration surfaces, but do not replace the internal engine. No event router, action-provider contract, or inbound Action API exists yet.

7. Experiences

The current browser overlay host loads state and invokes the selected domain presentation. Future experiences may include automations and local or hosted sessions. Hosted services are optional consumers, not dependencies of local EOE Core.

8. Session Referee (Future, Later Product Track)

A future layer above sessions (see Multiplayer And Sessions and Session Referee And Verified Environments in `product-vision.md`) that can declare, negotiate, verify, and — where a provider explicitly supports it — enforce the environment participants play under, and consume a future reviewed game-modification registry. No referee, verification, capability, or modification-registry contract exists yet; this layer is not scheduled into `P02`–`P05` (see `docs/project/implementation-plan.md`).

## Progress, Results, And Spatial Context (Future)

Progress is intended to be a normalized ruleset/session output, not a formula embedded in platform core. Domain data and semantic events may feed a domain- or ruleset-specific progress provider; sessions and views may consume its normalized output. Common session results should likewise provide a comparison surface without imposing one scoring formula across games.

Cross-domain rulesets may translate rich domain events into shared objectives at the rules/session layer. Source providers should not perform that translation, and domain events should retain their semantic meaning.

Normalized location state and game/domain map data are separate inputs to future map views. Spatial maps describe where things are; progression graphs describe prerequisites, reachability, and completion paths. Neither requires the other, and shared platform code must not assume tile coordinates or one global coordinate system. See `product-vision.md` for the canonical direction.

## Design Constraints

- Normalized state APIs are integration boundaries.
- EOE Core consumes gameplay information through source contracts; emulator memory is one source, not a shared-platform assumption.
- Source acquisition, decoding, and source-specific fidelity remain inside source-provider/adapter boundaries.
- Do not add provenance or confidence fields without a separate contract decision.
- Mapping source and target descriptors identify contracts without assuming a domain or payload category.
- Mapping calculations use the whitelisted JSON expression AST, never arbitrary JavaScript.
- Domain engine functions should be deterministic and testable.
- Shared platform registries accept domain packages through explicit composition and do not import Pokemon implementations.
- Normalized domain-state contracts are owned by domain packages; shared schema infrastructure must not define Pokemon payload fields.
- Pokemon games should reuse a single Pokemon domain through future generation/mechanics, game-configuration, and revision/mod override composition rather than separate game domains.
- Future semantic events should sit above normalized state and domain interpretation.
- Event consumers should not depend on raw memory addresses, bits, or source field names.
- Automation and multiplayer should reuse the semantic event foundation where practical, without forcing either concern into the current mapping/state runtime.
- EOE's future rules/action engine owns gameplay semantics and execution policy; external workflow systems integrate through generic, authorized surfaces and are not core runtime dependencies.
- Progress and scoring are ruleset/session outputs. Shared platform infrastructure must not impose a universal denominator, point conversion, or game-specific scoring formula.
- Cross-domain objective translation belongs to rules/session logic, while domain events retain rich domain meaning.
- Spatial maps and progression graphs are separate optional capabilities; do not require graphical maps for progress or assume universal coordinate semantics.
- Local core must remain useful without cloud accounts or hosted infrastructure.
- Session verification claims must describe reproducible, verifiable configuration and rule enforcement — never an absolute anti-cheat guarantee (see `product-vision.md`).
- Gameplay-mutating actions (input, save/snapshot, reviewed game-modification activation) require explicit user authorization and provider-advertised capability; no action may assume a source is writable, and no template or extension may enable mutation silently.
- ROM hacks should be handled by adapter/data mappings, not generic engine forks.
- Overlay rendering should degrade gracefully when optional data is unavailable.
- Any long-term API change should have an ADR.
