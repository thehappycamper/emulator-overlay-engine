# Repository Boundaries: Public Core / Private Hosted Services

This is the canonical, detailed source for the architectural boundary between this repository (`thehappycamper/emulator-overlay-engine`, public core) and its private sibling, [`thehappycamper/gameplay-interaction-hosted-services`](https://github.com/thehappycamper/gameplay-interaction-hosted-services). See also the hosted repository's own `docs/knowledge/public-core-boundary.md` (its mirror of this document) and its ADR 0001.

`gameplay-interaction-hosted-services` is a temporary infrastructure name, not a final hosted-product brand — the final brand for both the platform and any hosted tier remains undecided, per `docs/project/branding-and-renaming.md`.

## Dependency Direction

```text
PUBLIC CORE / PUBLIC PROTOCOLS   (this repository)
             ^
             | consumes
             |
PRIVATE HOSTED SERVICES          (gameplay-interaction-hosted-services)
```

This repository must never depend on the hosted repository's implementation. The hosted repository may depend on versioned public contracts this repository exposes. The direction is one-way and non-negotiable — it is what keeps this repository independently useful and keeps public contracts implementable by third parties without access to private server source.

## What This Repository (Public Core) Owns

- Gameplay source providers/adapters.
- Source contracts.
- The mapping runtime.
- Domains (Pokemon today; domain-neutral platform boundary — see `docs/knowledge/domain-extensibility.md`).
- Normalized state.
- Semantic events (future — see ADR 0013).
- Rules (future).
- Actions (future).
- Provider capabilities (future).
- Local sessions (future — not emulator netplay, not hosted multiplayer).
- Views/overlays.
- Workbench/creator contracts (future).
- Local automation (future).
- Public extension/template contracts.
- **Public client/server protocol definitions needed to interoperate with hosted services** — this repository owns these even though the hosted repository implements the server side. See Contract Ownership below.

Everything marked "future" above is direction, not implemented behavior — see `docs/project/features.md` and `docs/project/implementation-plan.md` for actual status, both maintained independently of this document.

## What The Hosted Repository Owns

Hosted/commercial service *implementation*: account identity, authentication/authorization, matchmaking, hosted session orchestration, Session Referee service orchestration (the server half of this repository's future Session Referee direction — see ADR 0014 and `docs/knowledge/product-vision.md`), persistent history/ratings/leaderboards, communities/registries, spectator hosting, and entitlements/billing. None of it is implemented as of this writing; see that repository's own `docs/knowledge/hosted-product-vision.md` for the full direction list.

## Local-First Principle

> Hosted services enhance the local platform; they do not define or gate ordinary local operation.

A user should eventually be able to use appropriate local functionality without an account, cloud connectivity, a subscription, or access to the hosted repository. Cloud-dependent features may naturally require an account/service connection — that's expected — but "local" must not quietly mean "crippled until you connect to hosted services."

Local (this repository, no hosted dependency): game telemetry, mappings, domain interpretation, semantic events, local rules/actions, overlays, local automation, compatible local sessions.

Hosted (optional, the sibling repository): matchmaking, persistent profiles, remote session coordination, ratings, history, tournaments, social/community features, hosted registries, managed spectator services.

## Account Is Not Participant

A **Participant** is a gameplay/session concept — local, ephemeral, guest-capable by default, may optionally reference a hosted account. An **Account** is a persistent hosted identity — authentication, profile, ownership, rating/history, entitlements — owned entirely by the hosted repository.

This repository's domain/rule/event/action systems must not require authentication. A participant can exist, play, trigger events, and drive local rules/actions with zero knowledge that hosted accounts exist. Private account concepts (passwords/password hashes, OAuth provider details, email verification, account recovery, subscription IDs, billing customer IDs, moderation/ban state, other private account metadata) must never appear in this repository's public game/domain contracts.

## Public/Private Protocol Boundary

Private hosted code may consume public protocols. This repository may call hosted endpoints through public client abstractions/protocols it defines itself.

This repository must not:

- Import private hosted source packages.
- Depend on private databases.
- Depend on private internal service models.
- Know billing details.
- Know private identity persistence models.
- Require hosted infrastructure for ordinary local operation.

The hosted repository's services must not require local clients to expose ROM files, BIOS files, unrestricted emulator memory, or save files — unless a future, explicitly designed and user-authorized feature genuinely requires that exchange (none does today). Prefer normalized/derived events, state, capability manifests, and environment evidence — the same shapes this repository already produces for local consumers.

## Contract Ownership Rule

Public interoperability contracts belong in this repository. For example, if future hosted sessions require message/contract shapes such as `ParticipantHello`, `SessionJoinRequest`, `EventEnvelope`, `CapabilityManifest`, `EnvironmentManifest`, or `SessionResult`, their interoperable schema/contract definitions should live here — likely under a future `protocol/` area (or equivalent), **not designed by this document**. These are conceptual examples, not a commitment to those exact names or an implementation plan. The hosted repository implements server behavior around such contracts once they exist here; it does not author them unilaterally.

A standalone protocol repository/package may be considered later, only if independent versioning or multiple non-hosted-repository consumers genuinely justify the extra indirection. No third repository is created by this document.

## Commercial Boundary

> Monetize convenience, coordination, persistence, scale, and hosted infrastructure rather than artificially crippling local core functionality.

See `docs/project/commercial-model.md` for this repository's existing MIT/commercial-services policy, and the hosted repository's `docs/knowledge/hosted-product-vision.md` for the fuller potential commercial-area list. No pricing tiers or billing are defined here.

## Cross-Repository Task Governance

Tasks spanning both repositories use distinct task IDs — this repository's existing `P<NN>-T<NNN>` scheme, and the hosted repository's `H<NN>-T<NNN>` scheme — and never share a mutable task file. Each repository's task record lives in its own `docs/tasks/`, cross-referenced by ID and repository name. Example:

```text
Public (thehappycamper/emulator-overlay-engine):
  P07-T003 — Define hosted session protocol

Hosted (thehappycamper/gameplay-interaction-hosted-services):
  H02-T004 — Implement server support for public session protocol
  Related task: thehappycamper/emulator-overlay-engine P07-T003
```

Cross-repository work still follows the full `task branch -> implementation -> tests -> review -> explicit merge approval -> main` lifecycle **independently in each repository**. A merge approval in one repository does not imply approval in the other — each repository's `main` requires its own explicit approval, per this repository's own `AGENTS.md`.

## What This Document Does Not Do

It does not design any protocol schema, identity schema, matchmaking algorithm, or rating algorithm — those require separate future decisions, made here (for public contracts) or in the hosted repository (for hosted implementation), when their owning work actually begins.
