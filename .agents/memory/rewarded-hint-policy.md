---
name: Rewarded hint balance policy
description: One shared hint balance: rewarded ads add three; the top-right control spends one on a manual highlight.
---

Each confirmed rewarded ad adds three to the existing hint balance, without consuming, resetting, or overwriting it: 3 → 6 → 9 → 12, and 0 → 3. Do not automatically highlight words.

**Why:** The user explicitly chose accumulating hints rather than automatically applying three highlights when the free-hint controls were removed.

The top-right lightning/count control spends exactly one hint to highlight one valid unfound word. Do not spend a hint when no action is possible; rapid duplicate taps must not consume twice.

**Why:** The user subsequently explicitly requested restoring manual use through the top-right control, sharing the same balance as rewarded additions rather than leaving hints as a passive display.

**How to apply:** Keep reward paths separate, use an additive update only after the earned callback, and retain stale-puzzle and duplicate-callback guards. Highlight only on a manual hint tap, never automatically because an ad was watched. Preserve the existing session scope rather than introducing a second hint balance.
