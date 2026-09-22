---
name: TypeScript isolated-file checks
description: How to run temporary selected-file validation with this workspace's TypeScript 6 toolchain.
---

Use the target package's `pnpm exec tsc` for isolated validation. TypeScript 6 requires `--ignoreConfig` when source files are passed directly and `--ignoreDeprecations 6.0` with legacy Node module resolution. Copy files to `/tmp` and replace path aliases with relative imports when compiling a small subset.

**Why:** The root workspace compiler differs from the app compiler, and direct selected-file compilation otherwise fails on config loading, deprecation gates, or unresolved aliases before testing any app behavior.

**How to apply:** Use this only for temporary focused harnesses. Continue using the package's normal typecheck script for authoritative project validation.