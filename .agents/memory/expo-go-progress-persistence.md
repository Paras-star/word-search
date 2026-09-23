---
name: Expo Go progress persistence
description: Physical Android observations about local progress surviving reopen and QR re-scan.
---

On September 23, 2026, the user tested the current Word Hunt build on a physical Android phone. Coins, completed levels, and collected dumplings all remained unchanged after closing and reopening the same Expo Go project without a QR scan, and again after scanning the current project's QR code. This is an observed result for that device and project, not a guarantee about every new Expo development storage scope.

**Why:** A general warning about temporary Expo previews had been interpreted too broadly as predicting that a QR re-scan would lose progress. The user's direct test showed otherwise in the current setup.

**How to apply:** Treat ordinary reopening and a re-scan of this project's QR as observed to preserve local progress. If a future session loses it, investigate what changed about the Expo experience or storage scope before proposing accounts, recovery codes, or server-backed storage.