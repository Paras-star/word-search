---
name: Expo web background preloading
description: Why browser puzzle backgrounds must share retained prepared image references instead of relying on URL prefetch caching.
---

Do not assume browser image prefetching and a later displayed image will reuse one download, even within one document.

**Why:** The development asset server returned no-store responses. Same-URL image preloading coalesced overlapping requests, but Calendar could download the PNG again when navigation happened after preloading finished. This was reproduced with a settled Calendar screen, not inferred from source code.

**How to apply:** For browser night backgrounds, share the retained prepared image result between preload and display. Check both immediate and delayed navigation, count transfers before the navigation click too, and test failed preparation with original-source fallback. Keep native image dimensions and cache policy separate from this browser coordination fix.

Do not equate a web image loader's resolved promise with explicit decode or
native first-display readiness.

**Why:** The installed Expo Image web loader retains a blob URL and waits for
image load, whereas native ImageRefs have different decoded-bitmap semantics.
Scenery preparation exposed this distinction even though both platforms use
the same public API.

**How to apply:** When decoded web readiness matters, verify the installed
loader's behavior, explicitly await decode on the retained result, and keep
load, decode, display and paint-opportunity measurements separate. Retaining
one logical image does not establish measured browser/GPU memory consumption.
