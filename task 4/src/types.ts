export type OperationType = 'arrival' | 'departure';
export type Priority = 'high' | 'medium' | 'low';
export type FlightStatus = 'pending' | 'scheduled' | 'cancelled';

export type UnscheduledReason =
  | 'no_runway_meets_length_requirement'
  | 'exceeds_scheduling_horizon'
  | 'dependency_cycle'
  | 'self_dependency'
  | 'dependency_not_found'
  | 'no_gate_available'
  | 'no_ground_crew_available'
  | 'dependency_cancelled'
  | 'dependency_unschedulable';

export interface Flight {
  flightNumber: string;
  operationType: OperationType;
  priority: Priority;
  dependencies: string[];
  minRunwayLengthM: number | null;
  submittedAt: number;
  status: 'pending';
  unscheduledReason?: UnscheduledReason;
}

export interface ScheduledFlight {
  flightNumber: string;
  operationType: OperationType;
  priority: Priority;
  dependencies: string[];
  minRunwayLengthM: number | null;
  submittedAt: number;
  status: 'scheduled';
  startTime: number;
  endTime: number;
  runwayId: number;
  gateId: number;
}

export interface CancelledFlight {
  flightNumber: string;
  operationType: OperationType;
  priority: Priority;
  dependencies: string[];
  minRunwayLengthM: number | null;
  submittedAt: number;
  status: 'cancelled';
  cancelledAt: number;
}

export type AnyFlight = Flight | ScheduledFlight | CancelledFlight;

export interface RunwaySlot {
  runwayId: number;
  flightNumber: string;
  operationType: OperationType;
  startTime: number;
  endTime: number;
}

export interface GateSlot {
  gateId: number;
  flightNumber: string;
  occupiedFrom: number;
  occupiedTo: number;
}

export interface GroundCrewEvent {
  time: number;
  delta: number;
}

export interface AirportState {
  flights: Map<string, AnyFlight>;
  runwaySlots: RunwaySlot[];
  gateSlots: GateSlot[];
  groundCrewEvents: GroundCrewEvent[];
  scheduleGeneratedAt: number | null;
}

export interface AirportConfig {
  runwayCount: number;
  runwayLengthsM: number[];
  gateCount: number;
  groundCrewCount: number;
  runwaySeparationTakeoff: number;
  runwaySeparationLanding: number;
  runwaySeparationMixed: number;
  gateTurnaroundTime: number;
  dependencyBufferTime: number;
  arrivalDuration: number;
  departureDuration: number;
  maxSchedulingHorizon: number;
}

export interface ScheduleResult {
  scheduled: ScheduledFlight[];
  unscheduled: Array<{ flight: Flight; reason: UnscheduledReason }>;
}

export interface BottleneckResult {
  chain: string[];
  totalDurationSeconds: number;
  interpretation: string;
}
