---
name: Rewarded hint balance policy
description: User clarification on accumulating hints without automatic highlights or free-hint controls.
---

Each confirmed rewarded ad adds three to the existing hint balance, without consuming, resetting, or overwriting it: 3 → 6 → 9 → 12, and 0 → 3. Do not automatically highlight words.

**Why:** The user explicitly chose accumulating hints rather than automatically applying three highlights when the free-hint controls were removed.

**How to apply:** Keep reward paths separate, use an additive update only after the earned callback, retain stale-puzzle and duplicate-callback guards, and show the hint count as a passive indicator. Do not reintroduce a free-hint button or automatic spending without a new user request.
