---
name: TypeScript isolated-file checks
description: Selected-file compiler checks and default-import mock interop in the TypeScript test harnesses.
---

Use the target package's `pnpm exec tsc` for isolated validation. TypeScript 6 requires `--ignoreConfig` when source files are passed directly and `--ignoreDeprecations 6.0` with legacy Node module resolution. Copy files to `/tmp` and replace path aliases with relative imports when compiling a small subset.

**Why:** The root workspace compiler differs from the app compiler, and direct selected-file compilation otherwise fails on config loading, deprecation gates, or unresolved aliases before testing any app behavior.

**How to apply:** Use this only for temporary focused harnesses. Continue using the package's normal typecheck script for authoritative project validation.

## Test-harness default imports

Do not assume standalone transpilation and the Node test runner use identical import interoperability. Default-import dependency mocks should identify themselves as ES modules and expose a default export.

**Why:** A preferences harness passed in standalone execution but failed under the test runner with the same explicit transpilation options. Explicit ES-module-shaped mocks worked in both contexts.

**How to apply:** When adding transpile-based tests, follow the existing default-import mock convention rather than inferring the mock shape from one standalone compiler result.