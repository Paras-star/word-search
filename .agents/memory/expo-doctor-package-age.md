---
name: Expo Doctor package age
description: Compatibility patch recommendations may be temporarily unavailable through the package firewall.
---

When Expo Doctor recommends newly released compatible patch versions, the package firewall may reject them as too recent even when the registry lists them and Expo's installer selects them. Do not bypass the firewall or suppress the health check to manufacture a pass.

**Why:** A compatible patch update failed the package firewall's maturity check during an Expo Doctor remediation attempt; the app still typechecked, exported for web, and ran.

**How to apply:** Report the Doctor check separately from app validation, leave the dependency manifest unchanged on a blocked install, and retry compatible updates only when the firewall permits them.