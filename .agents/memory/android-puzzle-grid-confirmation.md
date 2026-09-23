---
name: Android puzzle-grid confirmation
description: Physical-device confirmation of the primary puzzle grid's shared layout and hit-testing.
---

The user confirmed on September 23, 2026 that every puzzle level worked correctly on their physical Android device after the explicit-row layout and touch-coordinate fix. Preserve the working board geometry, generated-word placement, and hit-testing when improving selection feedback.

**Why:** A previous percent-width flex-wrap board misaligned visible letters and touched cells on Android, especially after Animals transitioned to Food. Browser screenshots and TypeScript checks did not expose the device failure.

**How to apply:** Keep gesture-feel changes separate from grid layout and coordinate calculations; never claim physical-device acceptance from web tests alone.