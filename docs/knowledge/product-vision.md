# Product Vision

Emulator Overlay Engine is an extensible game telemetry and interaction platform that turns game, emulator, and external-source data into structured state and, in the future, semantic events. Those contracts can power overlays, calculations, rulesets, automations, multiplayer experiences, and optional hosted gaming services.

> **EOE turns game state into events, and events into experiences.**

Overlay rendering is the first visible product surface, not the architectural boundary of the platform. Pokemon is the first domain and proving ground.

## Product Pipeline

The intended long-term pipeline is:

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
      Event Detection
            |
     Normalized Events
            |
 Rules / Analysis / Subscriptions
            |
         Actions
            |
Overlays / Automations / Sessions
```

The implemented foundation currently stops at normalized state and state-driven calculations/overlay rendering. It includes a Pokemon-oriented MVP state contract and the domain-neutral safe mapping runtime.

The following are architectural direction only and are not implemented:

- Domain-neutral event contracts and semantic event detection.
- An event bus or subscription runtime.
- Actions, action providers, or automation authoring.
- Multiplayer sessions, session rules, or matchmaking.
- Accounts, profiles, hosted synchronization, or cloud persistence.
- Spectator services, leagues, or tournaments.

## Source-Agnostic Input

**EOE is source-agnostic. Emulator memory is one gameplay data source, not a platform assumption.**

EOE Core should consume gameplay information through source-provider and adapter contracts regardless of how that information was acquired:

```text
Source Provider -> Source Contract -> Mapping -> Normalized State
```

Potential source classes include:

- Emulator memory or debugger APIs.
- Emulator scripts or plugins.
- Native PC game APIs or plugins.
- Browser and web-game integrations.
- WebSocket, HTTP, or UDP telemetry.
- Log files and save files.
- Publisher or companion APIs.
- Existing gaming platforms and protocols.
- Capture-card and computer-vision adapters.
- Audio-recognition adapters.
- External hardware and sensor adapters.

These are architectural examples, not commitments to support every source class. The downstream platform should not need to know whether normalized state came from emulator memory, a web game, a native game API, a console capture-card vision adapter, or another supported provider.

Sources may eventually differ in fidelity, provenance, and confidence. Direct memory may provide exact values while computer vision or audio recognition may provide inferred observations. Future state or event contracts may need metadata describing those characteristics, but no such schema is defined by this product direction. That requires a separate architecture decision.

## State, Events, And Actions

State describes what is true now:

```text
player.badges = 8
```

An event describes what happened:

```text
pokemon.badge_earned
pokemon.gym_leader_defeated
```

An action describes what should happen because an event or rule fired:

```text
overlay.show
audio.play
obs.trigger
http.webhook
mqtt.publish
```

These identifiers are conceptual examples, not public naming conventions or schemas.

The intended event-detection pattern is:

```text
Previous State + Current State
             |
        Event Detector
             |
       Semantic Event
             |
     Rules / Subscribers
             |
           Action
```

Semantic events sit above emulator memory and domain interpretation. A consumer should eventually subscribe to `pokemon.gym_leader_defeated`, not know which address, bit, or source-specific field changed. Defining event or action schemas requires separate future architecture and implementation decisions.

## Automation Direction

Future EOE actions may drive overlay animations, audio, OBS or other streaming software, HTTP/webhooks, MQTT, local IPC, hardware bridges, lighting/LED systems, smart-home integrations, and community action providers.

EOE should not natively implement every hardware ecosystem. The preferred direction is an extensible action-provider model:

```text
pokemon.badge_earned
        |
      EOE Rule
        |
   MQTT Action Provider
        |
Home Assistant / Node-RED / ESP32 / lighting
```

This describes a future integration boundary only. No action-provider contract or automation runtime exists today.

## Workbench Direction

The Workbench should grow from mapping authoring into a visual authoring environment for the broader pipeline:

```text
SOURCE -> MAP -> STATE -> DETECT -> EVENT -> RULE -> ACTION
```

A future user might configure:

```text
WHEN
Pokemon -> Gym Leader Defeated

WHERE
Gym Number = 8

DO
Audio -> Play victory sound

AND
Lights -> Flash

AND
Overlay -> Show celebration
```

This behavior is not implemented. The Workbench should continue to produce human-readable, machine-readable, versioned, and reviewable contracts rather than hiding logic in an opaque GUI-only format. Data-driven mappings and templates must not become an arbitrary code-execution path.

## Multiplayer And Sessions

Multiplayer is a future use of the same semantic event architecture. It is not emulator netplay. Each local EOE client would observe its own game and share only the minimum normalized state or events required by the selected ruleset.

```text
Player A Game
   |
EOE Client
   |
Normalized Events
   \
    +--> Session / Rules Engine
   /
Normalized Events
   |
EOE Client
   |
Player B Game
```

Future session concepts may include participants, teams, objectives, scoring, penalties, win conditions, cooperative modes, competitive races, asynchronous challenges, tournaments, spectator views, and session history/replay. No session model or schema is defined yet.

## Session Referee And Verified Environments

Multiplayer is not merely observing multiple players' normalized events side by side (see Multiplayer And Sessions above). A session should eventually be able to declare, negotiate, verify, and — where the source/provider safely supports it — enforce the environment all participants are playing under.

> **Rules should be explicit, reproducible, and verifiable rather than merely socially implied.**

A Nuzlocke session, for example, should eventually be able to declare its actual ruleset ID and version and its required environment, rather than depending on every participant independently interpreting the same informal house rules.

This whole section is architectural direction only. No session, referee, modification-registry, capability, or verification schema exists yet, and none is designed by this document — see ADR 0014.

### Session Referee Pipeline

```text
Session Definition
        |
Compatibility Negotiation
        |
Environment Verification
        |
Ready Check
        |
Semantic Event Stream
        |
Rule Enforcement
        |
Scoring / Objectives / Outcomes
        |
Auditable Session Record
```

The referee should operate on semantic domain events wherever possible (`pokemon.badge_earned`, `pokemon.fainted`, `pokemon.encounter_started`, `pokemon.caught`), not raw emulator addresses or source-specific fields — the same boundary State, Events, And Actions already establishes above.

### Session Environment Definition

A future session definition may need to identify requirements such as: game identity; game version/revision/region; content or ROM hash where applicable; randomizer seed; randomizer/tool version; ruleset ID and version; required game modifications; allowed game modifications; forbidden game modifications; required source/provider capabilities; and a verification policy. These are conceptual requirements a future schema would need to cover, not identifiers to implement now.

Conceptual example (illustrative only, not a schema):

```text
Pokemon Emerald
USA revision 1.0
Randomizer version X
Seed 9814421
Ruleset nuzlocke-race@3.1
Required modifications:
  - trade-evolution-helper@1
Allowed:
  - fast-text@2
Forbidden:
  - encounter-selector
```

The purpose is to let participants enter a session already knowing they're playing compatible configurations, instead of discovering a mismatch mid-session.

### Reviewed Game Modification Registry

A future reviewed registry/library of game modifications — a broader concept than, but inclusive of, historical GameShark/Action-Replay-style codes. Prefer broad terminology (game modification, patch, code module, mutation action, game helper) over framing this as a cheat-code library; the registry's purpose is reviewed, documented, compatibility-scoped changes, not encouraging arbitrary cheating.

A future reviewed module should be able to describe: identity/version; supported game(s)/revisions; purpose; provenance/source; review status; modification mechanism; required provider capability; reversible vs. non-reversible behavior; save-affecting risk; compatibility; allowed competitive use; and hash/integrity information where appropriate. None of this is a schema yet.

### User-Facing Modification Library

When the platform identifies a game/version, it may eventually offer only compatible reviewed modifications, rather than requiring users to search the web for codes manually. Conceptual illustration only:

```text
Compatible helpers

[ ] Fast text
[ ] Solo trade evolution helper
[ ] Event item helper
[ ] Cosmetic modification

Gameplay-altering

[ ] Encounter override
[ ] Inventory modification
```

Mutating gameplay must require explicit user authorization. A downloaded template must never silently enable arbitrary memory mutation — this is the same non-negotiable trust boundary ADR 0012 already establishes for calculated fields, extended to modification activation.

### Rule Enforcement Spectrum

Rules may be enforced at different strengths. This is an architectural distinction to preserve, not a set of public enum names to freeze yet:

- **Observed** — the platform detects whether a rule condition occurred, without acting on it. Example: a Pokemon fainted.
- **Session-enforced** — the session/referee interprets events and applies score/status/eligibility consequences itself. Example: that Pokemon is marked dead under a Nuzlocke ruleset.
- **Game-enforced** — where a provider safely supports mutation/control, a reviewed modification may make the rule explicit inside the game itself. Example: prevent selecting a dead Pokemon in a rules-enforced challenge mode.

### Seed And Version Verification

Deterministic/randomized challenge sessions may eventually require all participants to prove matching game revision, seed, patch/mod set, randomizer version, and ruleset version before a session is considered ready. This matters for races, tournaments, co-op challenges, and reproducible competitive formats — without it, "same seed" is just a claim.

### Trust And Verification Levels

Not every source provides equal evidence. Direct game/emulator telemetry, a game API, computer vision, and manual confirmation may carry different fidelity or verifiability (the same distinction Source-Agnostic Input already raises for state generally). A future session may require a minimum verification capability from participants. The trust/confidence/attestation schema itself is not designed here and needs its own future ADR.

### Anti-Cheat Language

Be precise about what verified sessions actually guarantee. The platform must not claim that cheating is made impossible merely because a client verifies its configuration — a hostile participant controls their own machine, and no amount of client-side declaration changes that. Describe the intended capability as **reproducible, verifiable session configuration and rule enforcement**, not absolute anti-cheat. Stronger attestation or competitive-integrity mechanisms are a research direction, not a current claim.

### Actions And Gameplay-Affecting Capabilities

Automation Direction above already covers actions targeting external systems (overlay, audio, OBS, webhook, MQTT). Where a source/provider explicitly supports it, a future action may also affect the gameplay source itself: input, pause/control, save snapshot, link connection, or reviewed game-modification/code activation. These are a fundamentally different risk category from external-system actions and must never be assumed available.

Source providers should eventually advertise capabilities rather than every action assuming every source is writable. Conceptual capability examples, not a schema: `state.read`, `input.send`, `save.snapshot`, `instance.launch`, `link.connect`, `modification.apply`. The capability schema itself is future work.

### Solo Multiplayer Mechanics

Some mechanics that traditionally require another player may eventually be orchestrated locally when the source/provider supports it — for example, Pokemon trade evolution through a disposable second emulator/game instance and a real link trade, a reviewed game modification, or another game-specific supported mechanism. Which approach to use is not chosen here; the goal is only to preserve this use case for future capability/action design.

## Optional Hosted Services

A future optional hosted layer may be referred to as **EOE Cloud**. EOE Core must remain useful locally without an account or hosted dependency.

EOE Cloud may eventually provide accounts/profiles, friends, groups and communities, matchmaking, lobbies, hosted session orchestration, synchronization, standings/rankings, leagues, tournaments, spectator views, session history, extension/template discovery, and optional hosted persistence.

Hosted services should generally consume derived normalized telemetry and events, not ROMs, BIOS files, save files, or unrestricted memory dumps.

Matchmaking and session rules are separate concerns. Matchmaking finds compatible participants. A session/rules engine controls how the shared experience behaves. Compatibility might eventually consider domain, game or ROM-hack version, ruleset/version, cooperative or competitive style, estimated duration, skill, region/latency, and social preferences. These are product examples, not committed APIs.

## Open Source And Hosted Boundary

EOE Core remains MIT-licensed, local-first, and open source. Its current and future local scope is intended to include adapters, mappings, domains, state and event foundations, calculators, rules, overlays, local automation, and Workbench contracts. This statement does not imply that the future event, rule, or automation runtimes exist today.

Optional hosted services may provide identity, matchmaking, persistent multiplayer sessions, communities, tournaments, hosted history/storage/synchronization, and other commercial services.

Local functionality should not become cloud-dependent merely to create subscription value.

## Ecosystem Strategy

> **Own the abstraction; reuse the infrastructure.**

EOE should own its contracts, mapping model, domain model, future state/event/action abstractions, Workbench, rules/session abstractions, template model, and hosted EOE services.

EOE should integrate with mature projects and protocols where appropriate instead of rebuilding infrastructure such as emulator cores. Potential interoperability research may include Archipelago, RetroAchievements, BizHawk, mGBA, and libretro.

These are research directions, not implemented integrations or licensing claims. Third-party source code must not be copied into EOE without explicit source, provenance, and license review.
