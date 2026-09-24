---
name: Scoped workspace dependencies
description: Installing an artifact-only dependency in a pnpm workspace when the package callback rejects filter flags.
---

The language-package installer callback rejects pnpm workspace filter tokens as invalid package names. For an artifact-only dependency, use a scoped pnpm add operation and verify that the package is declared in the artifact rather than the workspace root.

**Why:** Installing at the root would make a native dependency appear shared across unrelated artifacts, while passing a workspace flag to the callback fails before installation.

**How to apply:** When a dependency belongs to one artifact, verify the compatible version first, attempt the package callback only if it can express the target scope, and use the workspace package manager's scoped operation when it cannot.