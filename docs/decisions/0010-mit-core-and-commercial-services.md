# ADR 0010: MIT Core And Commercial Services

Date: 2026-08-08

Status: accepted

## Context

The project should be easy for the public to use, contribute to, and share. Restricting commercial use would make the project source-available rather than open source and would reduce adoption by streamers, YouTubers, tool makers, and contributors.

The project may still need sustainable revenue later.

## Decision

Keep the repository under the MIT License.

The open source repository should include:

- Shared platform code.
- Domain packages that are intended for community use.
- Public extension and template examples.
- Community-contributed extensions and templates when licensing and source review are acceptable.

Potential commercial offerings should live around the open source project, not by restricting normal repository use:

- Hosted sync or template sharing services.
- Premium template packs.
- Marketplace features.
- Setup help, support, and consulting.
- Sponsored development.

## Consequences

- Public usage remains low-friction.
- Commercial use is allowed under MIT.
- YouTubers and streamers can use the project freely.
- Revenue options remain available through services and premium assets.
- Premium marketplace/template policy will need a future ADR before implementation.

