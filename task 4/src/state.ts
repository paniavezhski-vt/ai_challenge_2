import type {
  AirportState,
  AnyFlight,
  Flight,
  ScheduledFlight,
  CancelledFlight,
  RunwaySlot,
  GateSlot,
  GroundCrewEvent,
  ScheduleResult,
} from './types.js';

export function createInitialState(): AirportState {
  return {
    flights: new Map(),
    runwaySlots: [],
    gateSlots: [],
    groundCrewEvents: [],
    scheduleGeneratedAt: null,
  };
}

export function getFlight(state: AirportState, flightNumber: string): AnyFlight | undefined {
  return state.flights.get(flightNumber);
}

export function getAllFlights(state: AirportState): AnyFlight[] {
  return Array.from(state.flights.values());
}

export function getActiveFlights(state: AirportState): Array<Flight | ScheduledFlight> {
  const result: Array<Flight | ScheduledFlight> = [];
  for (const f of state.flights.values()) {
    if (f.status !== 'cancelled') {
      result.push(f as Flight | ScheduledFlight);
    }
  }
  return result;
}

export function getDependents(state: AirportState, flightNumber: string): string[] {
  const deps: string[] = [];
  for (const f of state.flights.values()) {
    if (f.status !== 'cancelled' && f.dependencies.includes(flightNumber)) {
      deps.push(f.flightNumber);
    }
  }
  return deps;
}

export function addFlight(state: AirportState, flight: Flight): void {
  state.flights.set(flight.flightNumber, flight);
}


export function applyScheduleResultWithConfig(
  state: AirportState,
  result: ScheduleResult,
  gateTurnaroundTime: number
): void {
  state.runwaySlots = [];
  state.gateSlots = [];
  state.groundCrewEvents = [];

  for (const sf of result.scheduled) {
    state.flights.set(sf.flightNumber, sf);

    state.runwaySlots.push({
      runwayId: sf.runwayId,
      flightNumber: sf.flightNumber,
      operationType: sf.operationType,
      startTime: sf.startTime,
      endTime: sf.endTime,
    });

    state.gateSlots.push({
      gateId: sf.gateId,
      flightNumber: sf.flightNumber,
      occupiedFrom: sf.startTime,
      occupiedTo: sf.startTime + gateTurnaroundTime,
    });

    state.groundCrewEvents.push(
      { time: sf.startTime, delta: 1 },
      { time: sf.endTime, delta: -1 }
    );
  }

  for (const { flight, reason } of result.unscheduled) {
    const updated: Flight = {
      flightNumber: flight.flightNumber,
      operationType: flight.operationType,
      priority: flight.priority,
      dependencies: flight.dependencies,
      minRunwayLengthM: flight.minRunwayLengthM,
      submittedAt: flight.submittedAt,
      status: 'pending',
      unscheduledReason: reason,
    };
    state.flights.set(flight.flightNumber, updated);
  }

  state.scheduleGeneratedAt = Date.now();
}

export function cancelFlight(state: AirportState, flightNumber: string): string[] {
  const flight = state.flights.get(flightNumber);
  if (!flight || flight.status === 'cancelled') return [];

  const cancelled: CancelledFlight = {
    flightNumber: flight.flightNumber,
    operationType: flight.operationType,
    priority: flight.priority,
    dependencies: flight.dependencies,
    minRunwayLengthM: flight.minRunwayLengthM,
    submittedAt: flight.submittedAt,
    status: 'cancelled',
    cancelledAt: Date.now(),
  };
  state.flights.set(flightNumber, cancelled);

  // Remove this flight's resource slots
  state.runwaySlots = state.runwaySlots.filter((s) => s.flightNumber !== flightNumber);
  state.gateSlots = state.gateSlots.filter((s) => s.flightNumber !== flightNumber);
  state.groundCrewEvents = state.groundCrewEvents.filter(
    (_, i) => {
      // Remove pairs: each scheduled flight adds exactly 2 events
      // Rebuild from remaining scheduled flights instead
      return true;
    }
  );

  // Revert scheduled dependents to pending
  const affected: string[] = [];
  for (const f of state.flights.values()) {
    if (f.status === 'scheduled' && f.dependencies.includes(flightNumber)) {
      const reverted: Flight = {
        flightNumber: f.flightNumber,
        operationType: f.operationType,
        priority: f.priority,
        dependencies: f.dependencies,
        minRunwayLengthM: f.minRunwayLengthM,
        submittedAt: f.submittedAt,
        status: 'pending',
        unscheduledReason: 'dependency_cancelled',
      };
      state.flights.set(f.flightNumber, reverted);
      affected.push(f.flightNumber);

      // Remove their slots too
      state.runwaySlots = state.runwaySlots.filter((s) => s.flightNumber !== f.flightNumber);
      state.gateSlots = state.gateSlots.filter((s) => s.flightNumber !== f.flightNumber);
    }
  }

  // Rebuild ground crew events from remaining scheduled flights
  state.groundCrewEvents = [];
  for (const f of state.flights.values()) {
    if (f.status === 'scheduled') {
      state.groundCrewEvents.push(
        { time: (f as ScheduledFlight).startTime, delta: 1 },
        { time: (f as ScheduledFlight).endTime, delta: -1 }
      );
    }
  }

  return affected;
}

export function getScheduledFlights(state: AirportState): ScheduledFlight[] {
  const result: ScheduledFlight[] = [];
  for (const f of state.flights.values()) {
    if (f.status === 'scheduled') result.push(f as ScheduledFlight);
  }
  return result;
}

export function getPendingFlights(state: AirportState): Flight[] {
  const result: Flight[] = [];
  for (const f of state.flights.values()) {
    if (f.status === 'pending') result.push(f as Flight);
  }
  return result;
}

export function getCancelledFlights(state: AirportState): CancelledFlight[] {
  const result: CancelledFlight[] = [];
  for (const f of state.flights.values()) {
    if (f.status === 'cancelled') result.push(f as CancelledFlight);
  }
  return result;
}

export function countByStatus(
  state: AirportState,
  status: 'pending' | 'scheduled' | 'cancelled'
): number {
  let count = 0;
  for (const f of state.flights.values()) {
    if (f.status === status) count++;
  }
  return count;
}

export function getPeakRunwayUsage(state: AirportState): number {
  if (state.runwaySlots.length === 0) return 0;
  // Build time events for concurrent runway usage
  const events: Array<{ time: number; delta: number }> = [];
  for (const s of state.runwaySlots) {
    events.push({ time: s.startTime, delta: 1 }, { time: s.endTime, delta: -1 });
  }
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);
  let max = 0;
  let current = 0;
  for (const e of events) {
    current += e.delta;
    if (current > max) max = current;
  }
  return max;
}

export function getPeakGateUsage(state: AirportState): number {
  if (state.gateSlots.length === 0) return 0;
  const events: Array<{ time: number; delta: number }> = [];
  for (const s of state.gateSlots) {
    events.push({ time: s.occupiedFrom, delta: 1 }, { time: s.occupiedTo, delta: -1 });
  }
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);
  let max = 0;
  let current = 0;
  for (const e of events) {
    current += e.delta;
    if (current > max) max = current;
  }
  return max;
}

export function getPeakGroundCrew(state: AirportState): number {
  if (state.groundCrewEvents.length === 0) return 0;
  const sorted = [...state.groundCrewEvents].sort((a, b) => a.time - b.time || a.delta - b.delta);
  let max = 0;
  let current = 0;
  for (const e of sorted) {
    current += e.delta;
    if (current > max) max = current;
  }
  return max;
}
