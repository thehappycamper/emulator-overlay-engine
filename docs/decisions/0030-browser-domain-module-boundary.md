# ADR 0030: Keep Browser Domain Descriptors Free of Node-Only Validation Imports

- **Status:** accepted
- **Date:** 2026-08-16

## Context

The native browser app shell loads EOE source modules directly through the development server. Its domain composition imported Pokemon semantic-event detectors, which import the Node-side event validator. That validator uses `node:fs` and the npm bare specifier `ajv/dist/2020.js`. Node resolves and executes this path, but native browser ESM does not resolve npm package names or CommonJS Ajv entrypoints.

## Decision

The browser-facing Pokemon domain descriptor contains only browser-safe state-contract metadata, calculators, and presentation capabilities. Semantic-event detectors remain in `src/domains/pokemon/events.js` and are imported explicitly by Node-side live orchestration. The browser composition uses `src/domains/browser.js` and `pokemon/presentation-descriptor.js`; the full Node domain composition remains in `pokemon/index.js`, including its event capability.

The existing source-module dev server remains in place. We do not add a bundler, browser-specific duplicate validator, import-map workaround, or weaker browser validation for this focused fix.

## Consequences

The real `public/index.html` path can load the dashboard and independent notification polling without a Node-only dependency. Node event detection and Ajv validation retain their existing behavior and tests. The browser descriptor intentionally omits the optional event capability; consumers that need event detection use the full Node domain composition or import the explicit Pokemon event module.

This is a focused module-boundary correction, not a general browser packaging solution. If future browser features need shared validation or additional npm packages, dependency packaging should be addressed as a separate architecture task.