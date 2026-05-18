import type {
  AirportConfig,
  AirportState,
  Flight,
  ScheduledFlight,
  OperationType,
  UnscheduledReason,
  ScheduleResult,
  BottleneckResult,
  GroundCrewEvent,
  RunwaySlot,
  GateSlot,
} from './types.js';
import { getScheduledFlights } from './state.js';

// ─── Priority helpers ────────────────────────────────────────────────────────

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

function comparePriority(a: Flight | ScheduledFlight, b: Flight | ScheduledFlight): number {
  const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (pd !== 0) return pd;
  const td = a.submittedAt - b.submittedAt;
  if (td !== 0) return td;
  return a.flightNumber < b.flightNumber ? -1 : 1;
}

// ─── Cycle / structural validation ──────────────────────────────────────────

function detectStructuralProblems(
  flights: Array<Flight | ScheduledFlight>,
  flightNumbers: Set<string>,
  cancelledNumbers: Set<string>
): Map<string, UnscheduledReason> {
  const problems = new Map<string, UnscheduledReason>();

  // Pass 1: self-deps and missing/cancelled deps
  for (const f of flights) {
    if (f.dependencies.includes(f.flightNumber)) {
      problems.set(f.flightNumber, 'self_dependency');
      continue;
    }
    for (const dep of f.dependencies) {
      if (cancelledNumbers.has(dep)) {
        problems.set(f.flightNumber, 'dependency_cancelled');
        break;
      }
      if (!flightNumbers.has(dep)) {
        problems.set(f.flightNumber, 'dependency_not_found');
        break;
      }
    }
  }

  // Pass 2: cycle detection via 3-color DFS
  type Color = 'white' | 'gray' | 'black';
  const color = new Map<string, Color>();
  const onCycle = new Set<string>();

  for (const f of flights) {
    if (!color.has(f.flightNumber)) color.set(f.flightNumber, 'white');
  }

  const dfs = (fn: string, stack: Set<string>): boolean => {
    color.set(fn, 'gray');
    stack.add(fn);

    const flight = flights.find((f) => f.flightNumber === fn);
    if (!flight) {
      color.set(fn, 'black');
      stack.delete(fn);
      return false;
    }

    for (const dep of flight.dependencies) {
      if (!flightNumbers.has(dep) || cancelledNumbers.has(dep)) continue;
      const depColor = color.get(dep) ?? 'white';
      if (depColor === 'gray') {
        // Found cycle — mark entire stack
        for (const s of stack) onCycle.add(s);
        onCycle.add(dep);
        color.set(fn, 'black');
        stack.delete(fn);
        return true;
      }
      if (depColor === 'white') {
        dfs(dep, stack);
      }
    }

    color.set(fn, 'black');
    stack.delete(fn);
    return false;
  };

  for (const f of flights) {
    if ((color.get(f.flightNumber) ?? 'white') === 'white') {
      dfs(f.flightNumber, new Set());
    }
  }

  for (const fn of onCycle) {
    if (!problems.has(fn)) problems.set(fn, 'dependency_cycle');
  }

  // Pass 3: propagate — any flight depending on a problem flight is also blocked
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of flights) {
      if (problems.has(f.flightNumber)) continue;
      for (const dep of f.dependencies) {
        if (problems.has(dep)) {
          problems.set(f.flightNumber, 'dependency_unschedulable');
          changed = true;
          break;
        }
      }
    }
  }

  return problems;
}

// ─── Priority-aware topological sort (Kahn's with priority queue) ────────────

function priorityTopoSort(
  flights: Array<Flight | ScheduledFlight>,
  invalid: Set<string>
): Array<Flight | ScheduledFlight> {
  const valid = flights.filter((f) => !invalid.has(f.flightNumber));
  const validSet = new Set(valid.map((f) => f.flightNumber));

  // In-degree: number of valid, non-invalid dependencies
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // dep -> list of flights that depend on dep

  for (const f of valid) {
    const activeDeps = f.dependencies.filter((d) => validSet.has(d));
    inDegree.set(f.flightNumber, activeDeps.length);
    for (const d of activeDeps) {
      if (!dependents.has(d)) dependents.set(d, []);
      dependents.get(d)!.push(f.flightNumber);
    }
  }

  const flightMap = new Map(valid.map((f) => [f.flightNumber, f]));

  // Simple priority queue (small N, so array-based is fine)
  const ready: Array<Flight | ScheduledFlight> = [];
  for (const f of valid) {
    if (inDegree.get(f.flightNumber) === 0) ready.push(f);
  }
  ready.sort(comparePriority);

  const result: Array<Flight | ScheduledFlight> = [];
  while (ready.length > 0) {
    const f = ready.shift()!;
    result.push(f);

    for (const depFn of dependents.get(f.flightNumber) ?? []) {
      const newDeg = (inDegree.get(depFn) ?? 0) - 1;
      inDegree.set(depFn, newDeg);
      if (newDeg === 0) {
        const depFlight = flightMap.get(depFn)!;
        // Insert in priority order
        const insertIdx = ready.findIndex((r) => comparePriority(depFlight, r) < 0);
        if (insertIdx === -1) ready.push(depFlight);
        else ready.splice(insertIdx, 0, depFlight);
      }
    }
  }

  return result;
}

// ─── Resource conflict helpers ───────────────────────────────────────────────

function getSeparation(
  existingOp: OperationType,
  newOp: OperationType,
  config: AirportConfig
): number {
  if (existingOp === 'departure' && newOp === 'departure') return config.runwaySeparationTakeoff;
  if (existingOp === 'arrival' && newOp === 'arrival') return config.runwaySeparationLanding;
  return config.runwaySeparationMixed;
}

function runwayIsFree(
  slots: RunwaySlot[],
  tStart: number,
  tEnd: number,
  opType: OperationType,
  config: AirportConfig
): boolean {
  for (const s of slots) {
    const sep = Math.max(getSeparation(s.operationType, opType, config), getSeparation(opType, s.operationType, config));
    // The new op at [tStart, tEnd] must be sep seconds away from existing [s.startTime, s.endTime]
    if (tStart < s.endTime + sep && tEnd + sep > s.startTime) return false;
  }
  return true;
}

function findFreeGate(
  gateSlots: GateSlot[],
  tStart: number,
  gateTurnaroundTime: number,
  gateCount: number
): number {
  const gateOccupiedTo = tStart + gateTurnaroundTime;
  for (let gateId = 0; gateId < gateCount; gateId++) {
    const slotsForGate = gateSlots.filter((s) => s.gateId === gateId);
    const free = slotsForGate.every(
      (s) => gateOccupiedTo <= s.occupiedFrom || tStart >= s.occupiedTo
    );
    if (free) return gateId;
  }
  return -1;
}

function crewIsAvailable(
  events: GroundCrewEvent[],
  tStart: number,
  tEnd: number,
  maxCrew: number
): boolean {
  const allEvents = [
    ...events,
    { time: tStart, delta: 1 },
    { time: tEnd, delta: -1 },
  ].sort((a, b) => a.time - b.time || a.delta - b.delta);

  let count = 0;
  for (const e of allEvents) {
    count += e.delta;
    if (count > maxCrew) return false;
  }
  return true;
}

// ─── Candidate time generation ───────────────────────────────────────────────

function getCandidateTimes(
  earliestStart: number,
  eligibleRunwayIds: number[],
  runwaySlots: RunwaySlot[],
  gateSlots: GateSlot[],
  crewEvents: GroundCrewEvent[],
  opType: OperationType,
  config: AirportConfig
): number[] {
  const candidates = new Set<number>();
  candidates.add(earliestStart);

  for (const rId of eligibleRunwayIds) {
    const rSlots = runwaySlots.filter((s) => s.runwayId === rId);
    for (const s of rSlots) {
      const sep = Math.max(
        getSeparation(s.operationType, opType, config),
        getSeparation(opType, s.operationType, config)
      );
      const t = s.endTime + sep;
      if (t >= earliestStart) candidates.add(t);
    }
  }

  for (const gs of gateSlots) {
    if (gs.occupiedTo >= earliestStart) candidates.add(gs.occupiedTo);
  }

  for (const e of crewEvents) {
    if (e.delta === -1 && e.time >= earliestStart) candidates.add(e.time);
  }

  return Array.from(candidates).sort((a, b) => a - b);
}

// ─── Main scheduling function ────────────────────────────────────────────────

export function computeSchedule(
  flights: Array<Flight | ScheduledFlight>,
  config: AirportConfig
): ScheduleResult {
  const flightNumbers = new Set(flights.map((f) => f.flightNumber));
  const cancelledNumbers = new Set<string>(); // active flights only passed here

  const problems = detectStructuralProblems(flights, flightNumbers, cancelledNumbers);
  const invalidSet = new Set(problems.keys());

  const orderedFlights = priorityTopoSort(flights, invalidSet);
  const unscheduledSet = new Map<string, UnscheduledReason>();

  // Add pre-detected problems to unscheduled list
  for (const [fn, reason] of problems) {
    unscheduledSet.set(fn, reason);
  }

  const result: ScheduleResult = { scheduled: [], unscheduled: [] };
  const scheduledMap = new Map<string, ScheduledFlight>();

  // Mutable resource tracking for this scheduling run
  const runwaySlotsLocal: RunwaySlot[] = [];
  const gateSlotsLocal: GateSlot[] = [];
  const crewEventsLocal: GroundCrewEvent[] = [];

  for (const flight of orderedFlights) {
    // Check if any dep became unschedulable during this run
    for (const dep of flight.dependencies) {
      if (unscheduledSet.has(dep)) {
        unscheduledSet.set(flight.flightNumber, 'dependency_unschedulable');
        break;
      }
    }
    if (unscheduledSet.has(flight.flightNumber)) continue;

    // Compute earliest start from dependencies
    let earliestStart = 0;
    for (const dep of flight.dependencies) {
      const sf = scheduledMap.get(dep);
      if (sf) {
        earliestStart = Math.max(earliestStart, sf.endTime + config.dependencyBufferTime);
      }
    }

    const duration =
      flight.operationType === 'arrival' ? config.arrivalDuration : config.departureDuration;

    // Check runway length feasibility (fast fail before time search)
    const eligibleRunwayIds = config.runwayLengthsM
      .map((len, id) => ({ id, len }))
      .filter(({ len }) => flight.minRunwayLengthM === null || len >= flight.minRunwayLengthM)
      .map(({ id }) => id);

    if (eligibleRunwayIds.length === 0) {
      unscheduledSet.set(flight.flightNumber, 'no_runway_meets_length_requirement');
      continue;
    }

    const candidates = getCandidateTimes(
      earliestStart,
      eligibleRunwayIds,
      runwaySlotsLocal,
      gateSlotsLocal,
      crewEventsLocal,
      flight.operationType,
      config
    );

    let assigned: ScheduledFlight | null = null;
    let horizonExceeded = false;
    let noGateEver = false;
    let noCrewEver = false;

    outer: for (const t of candidates) {
      if (t + duration > config.maxSchedulingHorizon) {
        horizonExceeded = true;
        break;
      }

      for (const rId of eligibleRunwayIds) {
        const rSlots = runwaySlotsLocal.filter((s) => s.runwayId === rId);
        if (!runwayIsFree(rSlots, t, t + duration, flight.operationType, config)) continue;

        const gateId = findFreeGate(gateSlotsLocal, t, config.gateTurnaroundTime, config.gateCount);
        if (gateId === -1) {
          noGateEver = true;
          // Gates are shared across runways; no point trying other runways at this time
          break;
        }

        if (!crewIsAvailable(crewEventsLocal, t, t + duration, config.groundCrewCount)) {
          noCrewEver = true;
          // More crew may free up later; try next candidate time
          break;
        }

        // All resources available — commit
        assigned = {
          flightNumber: flight.flightNumber,
          operationType: flight.operationType,
          priority: flight.priority,
          dependencies: flight.dependencies,
          minRunwayLengthM: flight.minRunwayLengthM,
          submittedAt: flight.submittedAt,
          status: 'scheduled',
          startTime: t,
          endTime: t + duration,
          runwayId: rId,
          gateId,
        };
        break outer;
      }
    }

    if (assigned) {
      result.scheduled.push(assigned);
      scheduledMap.set(assigned.flightNumber, assigned);
      runwaySlotsLocal.push({
        runwayId: assigned.runwayId,
        flightNumber: assigned.flightNumber,
        operationType: assigned.operationType,
        startTime: assigned.startTime,
        endTime: assigned.endTime,
      });
      gateSlotsLocal.push({
        gateId: assigned.gateId,
        flightNumber: assigned.flightNumber,
        occupiedFrom: assigned.startTime,
        occupiedTo: assigned.startTime + config.gateTurnaroundTime,
      });
      crewEventsLocal.push(
        { time: assigned.startTime, delta: 1 },
        { time: assigned.endTime, delta: -1 }
      );
    } else {
      let reason: UnscheduledReason;
      if (horizonExceeded) reason = 'exceeds_scheduling_horizon';
      else if (noCrewEver) reason = 'no_ground_crew_available';
      else if (noGateEver) reason = 'no_gate_available';
      else reason = 'exceeds_scheduling_horizon';
      unscheduledSet.set(flight.flightNumber, reason);
    }
  }

  // Build final unscheduled list from all flights not in scheduled
  const scheduledNums = new Set(result.scheduled.map((f) => f.flightNumber));
  for (const f of flights) {
    if (!scheduledNums.has(f.flightNumber)) {
      const reason = unscheduledSet.get(f.flightNumber) ?? 'exceeds_scheduling_horizon';
      result.unscheduled.push({ flight: f as Flight, reason });
    }
  }

  return result;
}

// ─── Bottleneck analysis ─────────────────────────────────────────────────────

export function computeBottleneck(state: AirportState, config: AirportConfig): BottleneckResult {
  const scheduled = getScheduledFlights(state);

  if (scheduled.length === 0) {
    return { chain: [], totalDurationSeconds: 0, interpretation: 'No scheduled flights.' };
  }

  const sfMap = new Map(scheduled.map((f) => [f.flightNumber, f]));
  const scheduledNums = new Set(sfMap.keys());

  // dp[fn] = { span: number, earlyStart: number, chain: string[] }
  // span = last.endTime - earlyStart
  const dp = new Map<string, { span: number; earlyStart: number; chain: string[] }>();

  function longestFrom(fn: string): { span: number; earlyStart: number; chain: string[] } {
    if (dp.has(fn)) return dp.get(fn)!;

    const f = sfMap.get(fn)!;
    const scheduledDeps = f.dependencies.filter((d) => scheduledNums.has(d));

    let best: { span: number; earlyStart: number; chain: string[] } | null = null;

    for (const dep of scheduledDeps) {
      const sub = longestFrom(dep);
      const span = f.endTime - sub.earlyStart;
      if (best === null || span > best.span) {
        best = { span, earlyStart: sub.earlyStart, chain: [...sub.chain, fn] };
      }
    }

    const result =
      best ?? {
        span: f.endTime - f.startTime,
        earlyStart: f.startTime,
        chain: [fn],
      };
    dp.set(fn, result);
    return result;
  }

  let globalBest: { span: number; earlyStart: number; chain: string[] } | null = null;

  for (const f of scheduled) {
    const candidate = longestFrom(f.flightNumber);
    if (globalBest === null || candidate.span > globalBest.span) {
      globalBest = candidate;
    }
  }

  if (!globalBest || globalBest.chain.length <= 1) {
    return {
      chain: globalBest?.chain ?? [],
      totalDurationSeconds: globalBest?.span ?? 0,
      interpretation:
        'No multi-flight dependency chains in the current schedule. Each flight is independent.',
    };
  }

  const chain = globalBest.chain;
  const chainStr = chain.join(' → ');
  return {
    chain,
    totalDurationSeconds: globalBest.span,
    interpretation: `Critical dependency chain: ${chainStr} (${globalBest.span}s total). Delaying any flight in this chain delays the entire sequence.`,
  };
}
