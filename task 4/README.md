# ATC MCP Server

An Air Traffic Control scheduling system exposed as a Model Context Protocol (MCP) server. An AI client can submit flights, generate conflict-free schedules, inspect airport state, cancel flights, and identify the critical scheduling bottleneck.

---

## Installation and Build

**Requirements:** Node.js 18+

```bash
cd "task 4"
npm install
npm run build
```

This produces `dist/index.js` — the compiled server entry point.

For development (no build step, hot reload):

```bash
npm run dev
```

---

## Environment Variables

All airport limits are loaded from environment variables at startup. Any invalid value causes the server to exit with a clear error message before accepting any connections.

| Variable | Default | Accepted values | Description |
|---|---|---|---|
| `RUNWAY_COUNT` | `2` | Integer ≥ 1 | Number of runways |
| `RUNWAY_LENGTHS_M` | `3000` × `RUNWAY_COUNT` | Comma-separated integers, each ≥ 500; count must equal `RUNWAY_COUNT` | Length of each runway in meters (e.g. `3500,2800,2000`) |
| `GATE_COUNT` | `5` | Integer ≥ 1 | Number of gates |
| `GROUND_CREW_COUNT` | `3` | Integer ≥ 1 | Maximum simultaneous ground crew assignments |
| `RUNWAY_SEPARATION_TAKEOFF` | `90` | Integer ≥ 0 (seconds) | Minimum gap between consecutive takeoffs on the same runway |
| `RUNWAY_SEPARATION_LANDING` | `90` | Integer ≥ 0 (seconds) | Minimum gap between consecutive landings on the same runway |
| `RUNWAY_SEPARATION_MIXED` | `60` | Integer ≥ 0 (seconds) | Minimum gap between a takeoff and a landing (or vice versa) on the same runway |
| `GATE_TURNAROUND_TIME` | `1800` | Integer ≥ 1 (seconds) | How long a gate is occupied per flight (covers the operation plus turnaround) |
| `DEPENDENCY_BUFFER_TIME` | `900` | Integer ≥ 0 (seconds) | Minimum gap between a dependency flight completing and its dependent starting |
| `ARRIVAL_DURATION` | `900` | Integer ≥ 1 (seconds) | Duration of an arrival operation |
| `DEPARTURE_DURATION` | `600` | Integer ≥ 1 (seconds) | Duration of a departure operation |
| `MAX_SCHEDULING_HORIZON` | `28800` | Integer ≥ 60 (seconds) | Scheduling window from t=0; flights that cannot fit are marked unscheduled (default = 8 hours) |

Copy `.env.example` for a ready-to-edit template.

---

## Running the Server

The server uses **stdio transport** — it reads JSON-RPC messages from stdin and writes responses to stdout. All diagnostic output goes to stderr.

```bash
RUNWAY_COUNT=2 RUNWAY_LENGTHS_M=3500,2000 GATE_COUNT=5 GROUND_CREW_COUNT=3 node dist/index.js
```

On successful startup, stderr will print:

```
[ATC] Server running. Config: 2 runway(s) [3500,2000m], 5 gates, 3 crew, horizon 28800s
```

---

## Connecting from an MCP-Compatible Client

### Claude CLI

```bash
claude mcp add atc node "/absolute/path/to/task 4/dist/index.js" \
  -e RUNWAY_COUNT=2 \
  -e RUNWAY_LENGTHS_M=3500,2000 \
  -e GATE_COUNT=5 \
  -e GROUND_CREW_COUNT=3
```

Verify it was registered:

```bash
claude mcp list
```

The tools and resources are then available in any `claude` session. To remove:

```bash
claude mcp remove atc
```

### MCP Inspector (browser UI)

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Opens an interactive browser UI for calling tools and reading resources manually. Set environment variables in the Inspector's env panel.

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "atc": {
      "command": "node",
      "args": ["/absolute/path/to/task 4/dist/index.js"],
      "env": {
        "RUNWAY_COUNT": "3",
        "RUNWAY_LENGTHS_M": "3500,2800,2000",
        "GATE_COUNT": "10",
        "GROUND_CREW_COUNT": "5"
      }
    }
  }
}
```

Restart Claude Desktop after editing the file.

---

## Tools Reference

### `submit_flight`

Submit a new flight to the queue. The flight remains `pending` until `generate_schedule` is called.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `flightNumber` | string | yes | Unique flight identifier — uppercase alphanumeric, max 10 chars (e.g. `AA101`) |
| `operationType` | `"arrival"` \| `"departure"` | yes | Type of operation |
| `priority` | `"high"` \| `"medium"` \| `"low"` | yes | Scheduling priority; higher-priority flights are assigned earlier slots when resources are contested |
| `dependencies` | string[] | no | Flight numbers that must complete before this flight can be scheduled |
| `minRunwayLengthM` | integer ≥ 500 | no | Minimum runway length in meters required; omit if any runway is acceptable |

Returns an error if the flight number already exists in any status.

---

### `generate_schedule`

Compute and replace the current airport schedule. Processes all active flights (pending and previously-scheduled) and assigns runway, gate, and time slots based on priority, dependencies, and resource constraints.

**No input parameters.**

Returns a summary of scheduled and unscheduled flights. Flights that cannot be placed remain `pending` and receive an `unscheduledReason` explaining why.

---

### `get_airport_status`

Returns a structured operational snapshot of the airport.

**No input parameters.**

Response includes:
- Flight counts broken down by status (`pending`, `scheduled`, `cancelled`) and operation type
- Runway, gate, and ground crew peak concurrent usage vs. configured limits
- Constraint indicators — counts of flights blocked by specific reasons (runway length, horizon, cycles, crew, gates)
- List of all currently blocked flights with their reasons
- Schedule completion time in virtual seconds (the `endTime` of the last scheduled flight)

---

### `cancel_flight`

Cancel a flight and automatically recompute the schedule. Any flights that depended on the cancelled flight are reverted to `pending`. The schedule is rebuilt for all remaining active flights.

| Parameter | Type | Description |
|---|---|---|
| `flightNumber` | string | Flight number to cancel |

Returns the list of affected dependent flights and an updated schedule summary.

---

### `analyze_bottleneck`

Identify the longest active dependency chain in the current schedule — the sequence of flights that drives the total schedule duration. Requires `generate_schedule` to have been called first.

**No input parameters.**

Returns:
- `criticalChain` — ordered list of flight numbers from root to tip
- `totalDurationSeconds` — elapsed time from the first flight's start to the last flight's end
- `interpretation` — plain-language description of the chain and its impact

---

## Resources Reference

Resources are read-only and always reflect the current server state. They can be read at any time.

### `atc://flights/queue`

All flights grouped by status: `pending`, `scheduled`, and `cancelled`.

- Pending flights include their `unscheduledReason` when a schedule has been generated.
- Scheduled flights include `startTime`, `endTime`, `runwayId`, and `gateId`.
- Cancelled flights include the ISO timestamp of cancellation.

```json
{
  "generatedAt": "2026-05-18T10:00:00.000Z",
  "counts": { "pending": 1, "scheduled": 3, "cancelled": 0 },
  "pending": [
    {
      "flightNumber": "HH001", "operationType": "departure", "priority": "high",
      "dependencies": [], "minRunwayLengthM": 5000,
      "unscheduledReason": "no_runway_meets_length_requirement"
    }
  ],
  "scheduled": [
    {
      "flightNumber": "AA100", "operationType": "arrival", "priority": "high",
      "startTime": 0, "endTime": 900, "runwayId": 0, "gateId": 0, "dependencies": []
    }
  ],
  "cancelled": []
}
```

---

### `atc://runways/availability`

Per-runway slot occupancy and utilization within the scheduling horizon.

- `utilizationPct` — percentage of `MAX_SCHEDULING_HORIZON` occupied by scheduled slots on that runway.
- `slots` — list of assigned operations in start-time order.

```json
{
  "horizonSeconds": 28800,
  "generatedAt": "2026-05-18T10:00:00.000Z",
  "runways": [
    {
      "runwayId": 0, "lengthM": 3500, "slotCount": 1, "utilizationPct": 3.1,
      "slots": [
        { "flightNumber": "AA100", "operationType": "arrival", "startTime": 0, "endTime": 900 }
      ]
    },
    {
      "runwayId": 1, "lengthM": 2000, "slotCount": 0, "utilizationPct": 0.0,
      "slots": []
    }
  ]
}
```

---

### `atc://schedule/timeline`

All scheduled operations in chronological order by start time. Time values are **virtual seconds from t=0**, where t=0 is the moment `generate_schedule` was last called.

```json
{
  "scheduleHorizonSeconds": 28800,
  "generatedAt": "2026-05-18T10:00:00.000Z",
  "operationCount": 2,
  "operations": [
    {
      "startTime": 0, "endTime": 900,
      "flightNumber": "AA100", "operationType": "arrival", "priority": "high",
      "runwayId": 0, "gateId": 0, "dependencies": []
    },
    {
      "startTime": 1800, "endTime": 2400,
      "flightNumber": "AA200", "operationType": "departure", "priority": "high",
      "runwayId": 1, "gateId": 1, "dependencies": ["AA100"]
    }
  ]
}
```

---

## Unscheduled Reasons

When a flight cannot be placed, it remains `pending` with one of these reasons:

| Reason | Meaning |
|---|---|
| `no_runway_meets_length_requirement` | All configured runways are shorter than the flight's `minRunwayLengthM` |
| `exceeds_scheduling_horizon` | No valid slot exists within `MAX_SCHEDULING_HORIZON` |
| `dependency_cycle` | The flight is part of a circular dependency chain |
| `self_dependency` | The flight lists its own flight number as a dependency |
| `dependency_not_found` | A listed dependency flight number does not exist in the queue |
| `dependency_cancelled` | A listed dependency flight was cancelled |
| `dependency_unschedulable` | A listed dependency could not itself be scheduled |
| `no_gate_available` | All gates are occupied during every candidate slot |
| `no_ground_crew_available` | Assigning this flight would exceed `GROUND_CREW_COUNT` at some point |

---

## Running the Validation Test Suite

```bash
node test-scenarios.mjs 2>/dev/null
```

Covers all three required scenarios and additional edge cases:

- **Scenario 1 (Morning Rush):** 4 mixed-priority flights; verifies priority ordering and no runway/gate conflicts.
- **Scenario 2 (Heavy Hauler):** Flight requiring 5000 m runway when none is available; verifies `no_runway_meets_length_requirement`.
- **Scenario 3 (Connecting Flight):** Departure depends on arrival; verifies dependency buffer is respected and bottleneck chain is correct.
- **Edge cases:** Cancellation cascade, duplicate submission rejection, bottleneck before schedule, dependency cycles.
