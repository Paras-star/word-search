---
name: Ad placement and evidence constraints
description: Preserve interruption safeguards and distinguish Android device evidence from mocked ad tests.
---

Do not relax interstitial frequency or timing safeguards to force impressions. Interstitials must not interrupt active puzzles or the dumpling reward sequence.

**Why:** The user explicitly requires optional advertising that preserves the existing game experience and consent/privacy behavior.

**How to apply:** Keep showing confined to safe post-puzzle navigation. Loading/retry callbacks may prepare an ad, but must not independently present it.

The normal-success interstitial opportunity is only the collected reward screen's Continue button. View Collection Room must navigate immediately without an interstitial, and Results navigation must not duplicate the opportunity.

**Why:** The user explicitly approved this placement while requiring the existing frequency, consent, loading-wait, and presentation-timeout safeguards to remain unchanged.

**How to apply:** Count validated eligible completions before either reward-screen destination, retaining distinct-puzzle deduplication. Cancel pending presentation when its originating screen is left.

Do not assume the reported zero-impression problem was caused by bypassing Results. The user reported completing at least three puzzles in one uninterrupted session lasting over two minutes, tapping Continue to reach normal Results, and then Next Level or Play Again without an interstitial.

**Why:** That Android-device reproduction specifically excludes the earlier routing-bypass explanation for the user's test.

**How to apply:** Treat this as a reported reproduction, not proof of runtime readiness or consent. Require native load/show/skip diagnostics to identify the actual blocker; passing mocked tests or web previews does not prove Android impressions occurred.
