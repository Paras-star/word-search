---
name: Runtime dependency validation
description: Distinguishing active Expo query parsing from legacy CommonJS decoder interoperability during narrowly scoped security updates.
---

Do not infer a new navigation regression solely from requiring the upstream React Navigation query parser in Node. Validate the Expo fork used by the app and separately disclose legacy CommonJS decoder incompatibility.

**Why:** Both the previously installed decoder and its security patch were ESM. A standalone Node harness failed because query-string expected a CommonJS function, while the active Expo query parser and the browser deep link worked. The active parser uses URLSearchParams, so the earlier audit overstated the decoder's reachability through that path.

**How to apply:** Exercise active query parsing, route serialization, and the decoder's official ESM export independently. Do not add a runtime compatibility shim or change routing architecture just to make an unused upstream Node parser pass a test.
