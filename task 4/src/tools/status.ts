import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AirportState, AirportConfig, UnscheduledReason } from '../types.js';
import {
  countByStatus,
  getPeakRunwayUsage,
  getPeakGateUsage,
  getPeakGroundCrew,
  getAllFlights,
} from '../state.js';

function countUnscheduledByReason(state: AirportState, reason: UnscheduledReason): number {
  let count = 0;
  for (const f of getAllFlights(state)) {
    if (f.status === 'pending' && (f as any).unscheduledReason === reason) count++;
  }
  return count;
}

function getBlockedFlights(state: AirportState): Array<{ flightNumber: string; reason: string }> {
  const blocked: Array<{ flightNumber: string; reason: string }> = [];
  for (const f of getAllFlights(state)) {
    if (f.status === 'pending' && (f as any).unscheduledReason) {
      blocked.push({
        flightNumber: f.flightNumber,
        reason: (f as any).unscheduledReason,
      });
    }
  }
  return blocked;
}

function getScheduleCompletionTime(state: AirportState): number | null {
  let max: number | null = null;
  for (const f of getAllFlights(state)) {
    if (f.status === 'scheduled') {
      const end = (f as any).endTime as number;
      if (max === null || end > max) max = end;
    }
  }
  return max;
}

export function registerStatusTool(
  server: McpServer,
  state: AirportState,
  config: AirportConfig
): void {
  server.tool(
    'get_airport_status',
    'Returns a structured operational status snapshot: flight counts by state and type, runway and gate usage, ground crew utilization, constraint indicators, unscheduled flights with reasons, and the current schedule completion time.',
    async () => {
      const pendingCount = countByStatus(state, 'pending');
      const scheduledCount = countByStatus(state, 'scheduled');
      const cancelledCount = countByStatus(state, 'cancelled');

      // Counts by operation type
      let pendingArrivals = 0, pendingDepartures = 0;
      let scheduledArrivals = 0, scheduledDepartures = 0;
      for (const f of getAllFlights(state)) {
        if (f.status === 'pending') {
          if (f.operationType === 'arrival') pendingArrivals++;
          else pendingDepartures++;
        } else if (f.status === 'scheduled') {
          if (f.operationType === 'arrival') scheduledArrivals++;
          else scheduledDepartures++;
        }
      }

      const peakRunway = getPeakRunwayUsage(state);
      const peakGate = getPeakGateUsage(state);
      const peakCrew = getPeakGroundCrew(state);
      const completionTime = getScheduleCompletionTime(state);
      const blocked = getBlockedFlights(state);

      const status = {
        generatedAt: state.scheduleGeneratedAt
          ? new Date(state.scheduleGeneratedAt).toISOString()
          : null,
        flightCounts: {
          total: pendingCount + scheduledCount + cancelledCount,
          pending: pendingCount,
          scheduled: scheduledCount,
          cancelled: cancelledCount,
          byOperation: {
            pendingArrivals,
            pendingDepartures,
            scheduledArrivals,
            scheduledDepartures,
          },
        },
        resourceUsage: {
          runways: {
            total: config.runwayCount,
            lengths: config.runwayLengthsM,
            peakConcurrentUsage: peakRunway,
          },
          gates: {
            total: config.gateCount,
            peakConcurrentUsage: peakGate,
          },
          groundCrew: {
            total: config.groundCrewCount,
            peakConcurrentUsage: peakCrew,
            atCapacity: peakCrew >= config.groundCrewCount,
          },
        },
        constraintIndicators: {
          runwayLengthConflicts: countUnscheduledByReason(state, 'no_runway_meets_length_requirement'),
          horizonExceedances: countUnscheduledByReason(state, 'exceeds_scheduling_horizon'),
          dependencyCycles: countUnscheduledByReason(state, 'dependency_cycle'),
          crewShortfalls: countUnscheduledByReason(state, 'no_ground_crew_available'),
          gateShortfalls: countUnscheduledByReason(state, 'no_gate_available'),
          dependencyCancelled: countUnscheduledByReason(state, 'dependency_cancelled'),
        },
        blockedFlights: blocked,
        scheduleCompletionTimeSeconds: completionTime,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }
  );
}
