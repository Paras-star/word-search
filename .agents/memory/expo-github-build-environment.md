---
name: Expo GitHub build environment
description: Connected GitHub builds can use a legacy fallback image rather than the uploaded-source workflow's automatic image selection.
---

Do not assume an omitted EAS image selects a modern SDK-compatible environment through the connected GitHub build service.

**Why:** The service accepted an unchanged production profile but selected a legacy Android image with Node 18, pnpm 8, and Java 11. pnpm ignored the newer repository lockfile as incompatible, then misleadingly reported that the lockfile was absent during frozen installation.

**How to apply:** Inspect the cloud build's actual environment and dependency-install logs. Distinguish an incompatible lockfile from an excluded or missing file. Do not regenerate the lockfile, disable frozen installs, or change build images without authorization; compare the previous successful build environment before proposing a narrowly scoped correction.
