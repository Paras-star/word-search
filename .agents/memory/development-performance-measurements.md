---
name: Development performance measurements
description: Avoid Fast Refresh contamination and stale descendant fiber flags in before/after render comparisons.
---

Pin the application source throughout each before/after measurement. An intercepted
older Metro entry bundle alone is not sufficient: Fast Refresh can replace it with
current workspace modules immediately after initialization.

**Why:** An attempted baseline executed the new grid components even though the
intercepted entry bundle contained only the old screen. The initial diagnostic
snapshot stopped updating while live selection continued through refreshed code;
that run was discarded.

**How to apply:** Disable development update connections in disposable measurement
contexts only, verify that actual handler/path observations come from the intended
snapshot, and retain unwrapped controls. Never disable Fast Refresh in app code
to run a benchmark.

Count child component invocations directly when evaluating memoization, rather
than treating every descendant's retained React performed-work flag as a fresh
render in every ancestor commit.

**Why:** Bailouts can retain descendant fiber flags from earlier work. Walking
the whole current tree can falsely attribute unchanged descendants to a new commit.

**How to apply:** Use disposable function-entry counters for child render counts;
describe subtree `actualDuration` as render work, not DOM commit time or native
frame loss. Keep all such instrumentation out of shipped source.

Separate handler-state checkpoints from rendered-state snapshots, and keep
measurement runs free of concurrent validation workloads.

**Why:** React can defer a render after an input handler has already updated its
live selection. Reading the previous render's closure can falsely suggest missed
input. A CDP command acknowledgement can also precede trusted DOM input delivery.
Concurrent test/typecheck work changes the scheduling load between
comparison arms.

**How to apply:** Read the live gesture state for delivered-input checkpoints,
acknowledge browser event delivery before interpreting a checkpoint, use rendered
snapshots only to describe presentation, and finish CPU-heavy verification before
collecting performance evidence. Discard exploratory samples
that violate either condition rather than combining them with accepted results.
