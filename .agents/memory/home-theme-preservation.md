---
name: Home theme preservation
description: Preserve the Home screen's exact rendered appearance while applying its palette to other Word Hunt screens.
---

Keep the Home screen's existing shared-component colors when changing the game's semantic theme, unless the user explicitly asks to restyle Home. Compare before/after screenshots rather than assuming unchanged layout or source means unchanged appearance.

**Why:** Home already mixed a local warm palette with a few older shared-component colors. Normalizing semantic tokens to the warm palette also changes the Home coin pill and Collection button text/icon, despite leaving the Home layout untouched. The user specifically requested that Home remain unchanged while other screens adopt its palette.

**How to apply:** Treat Home's rendered appearance as the baseline. Preserve the root-route color exception for shared components when changing common tokens, and check Home visually after future theme edits.