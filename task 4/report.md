# Report: ATC MCP Server

## Scheduling Approach

### Overview

The scheduler is a pure function: given a list of flights and a config, it returns a `ScheduleResult` with no side effects and no dependency on wall-clock time. This makes it deterministic — identical inputs always produce identical output — and easy to test in isolation.

The core pipeline has three stages: structural validation, priority-aware topological sort, and greedy slot assignment.

### Stage 1 — Structural Validation

Before touching time slots, the scheduler identifies flights that cannot be scheduled for graph-level reasons: self-dependencies, references to non-existent or cancelled flights, and dependency cycles. Cycle detection uses a 3-color DFS (white = unvisited, gray = in current stack, black = done), which correctly identifies all members of a cycle in one pass. After finding directly invalid flights, a propagation loop marks any flight whose dependency is itself unschedulable — so a flight blocked by a cancelled dependency transitively blocks all its own dependents.

Doing this up front avoids wasting time on slot search for flights that can never be placed.

### Stage 2 — Priority-Aware Topological Sort

The scheduling order must satisfy two competing constraints: dependency order (a flight must come after all its dependencies) and priority order (high-priority flights should get earlier slots). A simple priority sort would violate dependency order; a plain topological sort ignores priority.

The solution is Kahn's algorithm augmented with a priority queue. When a flight's in-degree (number of unprocessed dependencies) reaches zero, it is inserted into the queue in priority order. The queue always yields the highest-priority flight that is currently "ready" — all dependencies have been processed. Within equal priority, submission time is the tiebreaker, with flight number lexicographic order as the final fallback. This ensures the output is fully deterministic regardless of Map iteration order.

### Stage 3 — Greedy Slot Assignment

Flights are placed in the order produced by Stage 2. For each flight:

1. **Earliest start** is computed as the maximum of `dependency.endTime + DEPENDENCY_BUFFER_TIME` across all dependencies.

2. **Runway feasibility** is checked before any time search — if no runway meets `minRunwayLengthM`, the flight is immediately marked unschedulable. This avoids an unnecessary O(N) candidate scan.

3. **Candidate start times** are generated rather than scanning second-by-second. The candidates are: `earliestStart`, plus every point in time where an existing runway slot ends (plus the required separation), every point where a gate slot frees up, and every point where a ground crew member becomes available. Sorting these candidates keeps the search to O(k log k) where k is the number of existing slots — far cheaper than scanning 28,800 time points.

4. For each candidate time and each eligible runway, three conflict checks are run:
   - **Runway separation**: the new slot must be `RUNWAY_SEPARATION_*` seconds away from every existing slot on that runway. The separation value depends on the operation types involved (takeoff–takeoff, landing–landing, or mixed).
   - **Gate availability**: gates are occupied from a flight's `startTime` to `startTime + GATE_TURNAROUND_TIME`. The first free gate ID is selected.
   - **Ground crew concurrency**: a sweep-line over delta events (`+1` at start, `−1` at end) checks that adding the new flight never pushes concurrent usage above `GROUND_CREW_COUNT`.

5. The first combination that passes all three checks is committed. If no combination is found across all candidates within the horizon, the flight is marked unscheduled with the most informative reason available (checked in precedence order: horizon exceeded → no crew → no gate).

### Bottleneck Analysis

The bottleneck is the longest path through the scheduled dependency DAG, weighted by actual scheduled times rather than nominal durations. The DP tracks `{ span, earlyStart, chain }` for each flight, where `span = lastFlight.endTime − chain.firstFlight.startTime`. This captures the real wall-clock cost of the chain including resource contention delays, not just the sum of operation durations and buffers.

### Key Design Decisions

**Virtual time.** All scheduled times are seconds from t=0 where t=0 is the moment `generate_schedule` is called. The wall-clock anchor (`scheduleGeneratedAt`) is stored separately. This separates scheduling logic from real time, making the algorithm fully reproducible and testable with static inputs.

**Stateless scheduler.** `computeSchedule` receives its inputs and returns a result; it never touches the `AirportState` object directly. State mutations happen only in `applyScheduleResultWithConfig`. This means the scheduler can be unit-tested without any server infrastructure.

**Full reschedule on cancel.** Rather than trying to surgically repair the existing schedule after a cancellation, the server discards all slot assignments and recomputes from scratch. This avoids partial-repair bugs where freed slots are not fully reclaimed, and it ensures the post-cancel schedule is as good as it would have been if the cancelled flight had never been submitted.

**Separation as a symmetric constraint.** Two operations on the same runway require separation from *both* directions: the new slot must not start too close to any existing slot *and* must not end too close to any future existing slot. The implementation uses `max(separation(existing, new), separation(new, existing))` as the effective gap, which handles asymmetric separation values correctly.

---

## Tools and Techniques

**TypeScript with NodeNext modules.** The `@modelcontextprotocol/sdk` distributes an ESM build with `.js` extensions on all imports. This requires `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` in `tsconfig.json`. Using CommonJS or `"module": "ESNext"` with Bundler resolution both fail silently in different ways.

**`@modelcontextprotocol/sdk` high-level API.** The SDK provides two layers: a low-level `Server` class that handles raw JSON-RPC, and a high-level `McpServer` class with typed `tool()` and `resource()` registration methods. The high-level API was used throughout — it handles input validation, error formatting, and capability negotiation automatically.

**Zod for config validation.** Environment variables are strings; `z.coerce.number()` handles the string-to-number conversion before validation rules are applied. Cross-field validation (runway length count matching runway count) runs after the zod parse succeeds, using a custom `ConfigError` class that includes the field name.

**Sweep-line for concurrency.** Ground crew usage is tracked as a sorted list of `(time, ±1)` delta events rather than a time-indexed array. Checking whether a new slot fits is O(k log k) where k is the number of existing events, and adding a slot is O(1) append + re-sort. This avoids allocating an array sized to the full scheduling horizon.

**Test client using `StdioClientTransport`.** The validation test suite spawns a real server process and connects to it using the MCP SDK's client API. Each scenario gets a fresh server process with a clean state. This tests the full stack — config loading, MCP serialization, tool dispatch, scheduling, and resource reading — without mocking anything.

---

## What Worked

**The candidate time generation approach** proved correct and efficient. In early design sketches a second-by-second scan was considered, but generating only the "interesting" times (slot boundaries + separations) gives exactly the same result with far fewer iterations. Since resources only become available at specific moments, there is no gap between candidates that could contain a valid slot that the algorithm would miss.

**Separating validation from scheduling.** Running the cycle detection and dependency checks as a pre-pass, before any time search, made the failure reasons much cleaner. A flight blocked by a cycle gets `dependency_cycle` rather than a confusing `exceeds_scheduling_horizon` that would result if the scheduler just tried and failed to find a slot whose dependency never resolved.

**Priority-aware Kahn's sort** handles the interaction between dependency order and priority correctly in a single pass. Alternative approaches — such as sorting by priority and then fixing dependency violations — produce incorrect orderings when a low-priority flight is a dependency of a high-priority one.

**Full reschedule on cancel** turned out to be simpler than incremental repair and produces better schedules. When a dependency is cancelled, its time slot frees up, and dependents can often be scheduled earlier than they were. An incremental approach would keep them in their old slots.

## What Did Not Work / Tradeoffs

**Gate conflict detection across runways.** The initial implementation broke out of the runway loop when a gate conflict was found, assuming no other runway would help. This is correct because gates are a shared resource — changing the runway does not free a gate — but it meant the outer candidate-time loop advanced unnecessarily. In practice, the same gate slots that cause a conflict at time `t` on runway 0 also cause the same conflict at time `t` on runway 1. The fix was to break out to the next candidate time when a gate conflict is found, rather than trying the next runway.

**Reporting the "right" unscheduled reason** is inherently lossy. A flight might fail because the runway is busy at time t but a gate is available, and fail because the gate is busy at time t+90 when the runway is free. The implementation tracks the "most specific" constraint seen across all failed attempts and reports that. This gives useful information in typical cases but can be misleading in corner cases where multiple constraints interact.

**No persistence.** State is entirely in-memory and lost when the server process exits. For a real deployment this would need a serialization layer. For the purposes of this task, in-memory state keeps the implementation focused on the scheduling logic itself.

**Single-runway scheduling order.** When multiple eligible runways are available, the algorithm always tries them in ascending runway ID order. A smarter approach would pick the least-utilized runway first to spread load. The current approach is correct (no conflicts, priority respected) but can produce suboptimal utilization distributions. Changing it would require a more sophisticated runway selection heuristic and would complicate determinism guarantees.
