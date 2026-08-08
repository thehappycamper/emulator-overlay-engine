# Roadmap

## Phase 0 - Static MVP

Status: complete.

- Normalized state schema.
- Static browser overlay.
- Basic damage and capture calculators.
- Tests and CI.

## Phase 1 - Live Gen 3 Export

Goal:

- Export party, active opponent, seed/frame, bag balls/TMs, and map ID from mGBA Lua into normalized JSON.

Deliverables:

- `adapters/gen3-mgba` Lua exporter.
- Overlay option for `live-state.json`.
- Documentation for emulator setup.
- Tests for exported sample fixtures.

## Phase 2 - Better Battle Assistant

Goal:

- Make switching and battle decisions easier.

Deliverables:

- Projected incoming damage for each party member from each opponent move.
- Best/worst case highlights.
- Status, weather, item, ability, and stat stage modifiers.

## Phase 3 - Route And Capture Assistant

Goal:

- Surface route encounters and catch odds live.

Deliverables:

- Map ID to encounter table data.
- Encounter method filtering.
- Ball odds from live bag.
- Shiny/PID/seed/frame display.

## Phase 4 - Challenge Systems

Goal:

- Support Nuzlocke and custom score-based challenge rules.

Deliverables:

- Ruleset config.
- Event tracker.
- Per-run and per-Pokemon score breakdown.
- Projection of score impact for current choices.

## Phase 5 - Battle Factory And AI Prediction

Goal:

- Identify likely opponent sets and rank likely next moves.

Deliverables:

- Battle Factory rental set data adapter.
- Opponent team/set matcher.
- Move prediction scoring model.

## Phase 6 - ROM Hack Adapter Support

Goal:

- Make hack support data-driven.

Deliverables:

- Adapter template.
- Data extraction/import docs.
- At least one ROM hack mapping proof of concept.

