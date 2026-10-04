---
name: Expo preview audio codec differences
description: Valid extracted AAC failed in the browser preview; lossless float WAV resolved playback.
---

Do not treat browser-preview AAC loading failures as proof that the native audio asset is invalid. The chest clip's valid, unmodified AAC timed out in the automated browser, while its lossless IEEE-float WAV played successfully.

**Why:** The browser verification observed no AAC playback; the focused recheck confirmed one successful WAV playback, no loading timeout, and the final source frame near the clip's end. Source, AAC, and WAV decoded samples were hash-identical.

**How to apply:** For exact-source effects, retain original AAC for native playback and use a browser-compatible lossless version when needed. Verify decoded samples rather than introducing a lossy transcode or changing unrelated audio/settings.