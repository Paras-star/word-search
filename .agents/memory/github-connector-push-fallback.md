---
name: GitHub connector push fallback
description: Preserve an exact local commit hash when Git CLI credentials fail but a GitHub connection has repository write access.
---

When Git HTTPS authentication fails but an authorized GitHub connector has repository write access, the Git Data API can upload identical blobs, tree, and commit objects before fast-forwarding the intended branch. Include the trailing newline in the API commit message: GitHub does not append it, while a normal Git commit message contains it.

**Why:** A commit created through the API without that newline had a different SHA despite matching files, tree, parent, identity, and timestamps. The connector's authorization did not repair the separate Git CLI credential.

**How to apply:** Compare every returned object SHA with local Git, confirm the remote branch still points to the expected parent, and update only that branch with force disabled. Stop before changing the ref if any hash differs. Reconnecting the Git Providers account is still needed for ordinary CLI pushes.