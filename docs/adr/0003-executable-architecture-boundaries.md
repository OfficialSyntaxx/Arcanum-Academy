# ADR-0003: Architecture boundaries are executable

**Status:** Accepted · Phase 1

## Context

The master prompt asks for modules with well-defined interfaces and no circular
dependencies, across a codebase expected to grow for years. Layering that lives only
in a document decays: the first deadline produces one shortcut import, and within a
month the render layer is reading network state.

## Decision

Layering is a program. `tools/scripts/check-boundaries.mjs` parses every source file,
extracts its imports, and fails the build when a module reaches across a boundary. It
runs in CI ahead of the typecheck. Two rule sets: package-level (which workspace
packages and third-party runtimes each package may use) and layer-level (which
directories inside a package may import which).

ESLint carries the companion rule: `packages/sim` may not use `Math.random` or
`Date.now`, because determinism is a property that must be enforced rather than
remembered.

## Consequences

**Good**

- The architecture cannot quietly erode; a violation is a red build with a specific
  message naming the file and the rule.
- New contributors learn the layering from failures at the moment they cross a line,
  not from a document they have not read.
- Keeping `sim` free of DOM and Node dependencies is checked, not hoped for.

**Costs**

- The rules need updating when a layer is legitimately added; the script is the
  single place to do it.
- The import parser is regex-based rather than AST-based. It is deliberately strict
  and can be fooled by exotic dynamic imports; if that ever matters, it graduates to
  the TypeScript compiler API.
- Occasional friction when a shortcut would be genuinely fine — which is the point.
