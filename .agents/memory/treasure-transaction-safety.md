---
name: Treasure transaction safety
description: Why paid rewards need recoverable local commits and must remain separate from free puzzle rewards.
---

Do not assume AsyncStorage multi-key writes are an atomic transaction. A paid reward must have a single durable commit containing both the deduction and collected reward, with idempotent recovery into the existing save records. Readers must honor that commit until recovery finishes, and later coin/collection writers must recover it before making changes.

**Why:** Coins and collection data use separate legacy records, but the user explicitly forbids charges without rewards, rewards without charges, double purchases, and loss during interrupted saves. A promise queue or multiSet alone cannot guarantee those constraints across app termination.

**How to apply:** Keep the shared mutation lock and stable purchase identity when extending paid rewards. Test failure before and after commit, interrupted projection/cleanup, retry after restart, and concurrent ordinary rewards. Do not discard a pending commit or treat a projection failure as an uncommitted purchase.

The Home Treasure Chest costs 700 coins and grants one existing Rare/Epic dumpling. The level-complete chest remains free and must preserve its existing reward probabilities, coin awards, progression, and collection behavior.

**Why:** The user explicitly distinguishes these two reward systems and only requests shared visuals/animation.

**How to apply:** Share presentation, not purchase logic; never route a free puzzle reveal through the paid transaction.