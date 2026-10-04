---
name: Native chest performance acceptance
description: Android performance is authoritative; preparation must not alter source timing or transaction safety.
---

Judge chest performance on Android separately from the browser. Do not call physical-device latency or memory usage verified on the strength of mocked native tests or a successful native bundle.

**Why:** Browser verification passed, but the user subsequently reported noticeable loading, opening, mid-animation, and reward-appearance delays on the actual Android app.

**How to apply:** Distinguish code-path/bundling checks from device measurements in reports. Keep performance work scoped to preparation and playback; do not redesign the supplied-video sequence or accelerate it to hide loading.

Keep a bounded, decoded cache across chest visits rather than releasing all images on route exit. Prepare all possible winners without choosing or granting a reward before the paid transaction commits.

**Why:** The user requires instant entry and an already-ready dumpling, while forbidding changes to rarity weighting or transaction safety. Route-local file prefetch does not guarantee native bitmap readiness; retaining full-resolution collectibles unnecessarily increases Android memory pressure.

**How to apply:** Preserve the source assets and timeline, separate paid/free logic, and budget retained decoded images. Cold-start preparation is deliberate; route exit should cancel playback, not discard the reusable preparation.