# Architecture Knowledge

Emulator Overlay Engine separates source-specific data collection from normalized telemetry, domain meaning, and consumer experiences. The canonical product direction is in `product-vision.md`.

## Intended Pipeline

```text
Game / Emulator / External Source
            |
         Adapter
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

## Layers

1. Emulator Adapter

Reads data from a concrete emulator such as mGBA or VBA-RR. This layer may use Lua, emulator APIs, file export, sockets, or other emulator-supported mechanisms.

2. Game Adapter

Maps generation and ROM-specific addresses, structs, tables, and IDs into normalized concepts. This includes ROM hacks.

3. Data Adapter

Provides static or extracted data: species, moves, items, abilities, type chart, learnsets, TM compatibility, encounters, trainers, Battle Factory sets, and mechanics differences.

4. Mapping Runtime

Transforms source JSON into a named and versioned target contract through direct fields, ID/value mappings, and safe calculated expressions. The runtime does not execute mapping-provided code.

5. Domain Engine

Calculates domain-specific outputs. For Pokemon, this includes damage, capture odds, legality, route summaries, score changes, set matching, and move predictions from normalized state and data.

6. Semantic Event Detection (Future)

Interprets changes between previous and current normalized domain state and emits meaningful domain events. Consumers should not need emulator addresses or source-specific bit semantics. No event contract or detector runtime exists yet.

7. Rules, Subscriptions, And Actions (Future)

Rules and subscribers consume semantic events. Actions represent requested outcomes through future providers such as overlay, audio, streaming, webhook, MQTT, IPC, or hardware bridges. No action-provider contract exists yet.

8. Experiences

The current browser overlay renders state and engine outputs. Future experiences may include automations and local or hosted sessions. Hosted services are optional consumers, not dependencies of local EOE Core.

## Design Constraints

- Normalized state APIs are integration boundaries.
- Mapping source and target descriptors identify contracts without assuming a domain or payload category.
- Mapping calculations use the whitelisted JSON expression AST, never arbitrary JavaScript.
- Domain engine functions should be deterministic and testable.
- Future semantic events should sit above normalized state and domain interpretation.
- Event consumers should not depend on raw memory addresses, bits, or source field names.
- Automation and multiplayer should reuse the semantic event foundation where practical, without forcing either concern into the current mapping/state runtime.
- Local core must remain useful without cloud accounts or hosted infrastructure.
- ROM hacks should be handled by adapter/data mappings, not generic engine forks.
- Overlay rendering should degrade gracefully when optional data is unavailable.
- Any long-term API change should have an ADR.
