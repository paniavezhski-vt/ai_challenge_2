import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AirportState, AirportConfig } from '../types.js';
import { getFlight, getActiveFlights, cancelFlight, applyScheduleResultWithConfig } from '../state.js';
import { computeSchedule } from '../scheduler.js';

export function registerCancelTool(
  server: McpServer,
  state: AirportState,
  config: AirportConfig
): void {
  server.tool(
    'cancel_flight',
    'Cancel a flight and automatically re-evaluate dependent flights. Any flights that depended on the cancelled flight are reverted to pending and the schedule is recomputed. Returns the list of affected dependent flights and the updated schedule summary.',
    {
      flightNumber: z
        .string()
        .min(1)
        .describe('The flight number to cancel'),
    },
    async ({ flightNumber }) => {
      const flight = getFlight(state, flightNumber);

      if (!flight) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: `Flight ${flightNumber} not found.`,
              }),
            },
          ],
          isError: true,
        };
      }

      if (flight.status === 'cancelled') {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: `Flight ${flightNumber} is already cancelled.`,
              }),
            },
          ],
          isError: true,
        };
      }

      const affectedDependents = cancelFlight(state, flightNumber);

      // Recompute schedule with remaining active flights
      const activeFlights = getActiveFlights(state);
      const result = computeSchedule(activeFlights, config);
      applyScheduleResultWithConfig(state, result, config.gateTurnaroundTime);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              cancelledFlight: flightNumber,
              affectedDependents,
              updatedSchedule: {
                scheduledCount: result.scheduled.length,
                unscheduledCount: result.unscheduled.length,
                unscheduled: result.unscheduled.map(({ flight: f, reason }) => ({
                  flightNumber: f.flightNumber,
                  reason,
                })),
              },
              message:
                affectedDependents.length > 0
                  ? `Flight ${flightNumber} cancelled. ${affectedDependents.length} dependent flight(s) reverted to pending and rescheduled: ${affectedDependents.join(', ')}.`
                  : `Flight ${flightNumber} cancelled. No dependent flights affected.`,
            }),
          },
        ],
      };
    }
  );
}
