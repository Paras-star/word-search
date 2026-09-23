---
name: Expo build port collision
description: Local production-build testing can collide with the mockup preview service.
---

When running a local production build of this Expo app, do not assume Metro's default port is free: the mockup preview service may already occupy it. In that case Expo's non-interactive port-change prompt stops Metro before native bundles are generated. An isolated build port lets the build run without stopping the preview or changing the Android development workflow.

**Why:** The first local combined native-and-web smoke build hit an occupied default port even though the same native builder had succeeded in a separate production environment.

**How to apply:** For local build verification, check for competing services and choose an isolated build port when necessary. Treat the port collision as a workspace-local test issue, not evidence that the production deployment will fail.