---
name: Google Play update policy
description: Word Hunt relies exclusively on normal Google Play Store update availability.
---

Rely exclusively on normal Google Play Store update availability. Do not implement a separate in-app update system or push-notification update system.

**Why:** The user explicitly retired the custom update implementation and chose normal Play Store updates instead.

**How to apply:** Do not add update prompts, startup gates, download/install flows, priority-based enforcement, or update-notification handlers. Preserve gameplay and normal app lifecycle behavior.
