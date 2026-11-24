---
name: Published artwork verification
description: Evidence needed to distinguish browser artwork layout defects from production asset-serving failures.
---

For published-browser artwork reports, verify actual production image requests
separately from component bounds and Expo development-preview loading.

**Why:** The introductory completion screen rendered correct nonzero boxes and
loaded every image in development while the published server returned 404 for the
supplied filenames containing spaces. A browser-only inspection initially suggested
an incomplete upload, but a handler regression established URL decoding as the cause.

**How to apply:** Preserve supplied artwork and route logic until measurements
demonstrate a defect there. Exercise the published serving path with the exact
browser-requested URLs, including encoding, rather than treating mock component
tests or a working Metro preview as proof of publication correctness. Do not infer
missing exported files solely from a 404.
