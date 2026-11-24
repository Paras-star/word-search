---
name: Expo web background preloading
description: Why browser puzzle backgrounds must share retained prepared image references instead of relying on URL prefetch caching.
---

Do not assume browser image prefetching and a later displayed image will reuse one download, even within one document.

**Why:** The development asset server returned no-store responses. Same-URL image preloading coalesced overlapping requests, but Calendar could download the PNG again when navigation happened after preloading finished. This was reproduced with a settled Calendar screen, not inferred from source code.

**How to apply:** For browser night backgrounds, share the retained prepared image result between preload and display. Check both immediate and delayed navigation, count transfers before the navigation click too, and test failed preparation with original-source fallback. Keep native image dimensions and cache policy separate from this browser coordination fix.
