import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AirportState, AirportConfig } from '../types.js';
import { getActiveFlights, applyScheduleResultWithConfig } from '../state.js';
import { computeSchedule } from '../scheduler.js';

export function registerScheduleTool(
  server: McpServer,
  state: AirportState,
  config: AirportConfig
): void {
  server.tool(
    'generate_schedule',
    'Compute and replace the current airport schedule. Processes all pending and previously-scheduled flights and assigns runway, gate, and time slots. Replaces any existing schedule. Returns a summary of scheduled and unscheduled flights.',
    async () => {
      const flights = getActiveFlights(state);

      if (flights.length === 0) {
        applyScheduleResultWithConfig(state, { scheduled: [], unscheduled: [] }, config.gateTurnaroundTime);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                scheduledCount: 0,
                unscheduledCount: 0,
                scheduled: [],
                unscheduled: [],
                message: 'Schedule generated. No flights in queue.',
              }),
            },
          ],
        };
      }

      const result = computeSchedule(flights, config);
      applyScheduleResultWithConfig(state, result, config.gateTurnaroundTime);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              scheduledCount: result.scheduled.length,
              unscheduledCount: result.unscheduled.length,
              scheduled: result.scheduled.map((f) => ({
                flightNumber: f.flightNumber,
                operationType: f.operationType,
                priority: f.priority,
                startTime: f.startTime,
                endTime: f.endTime,
                runwayId: f.runwayId,
                gateId: f.gateId,
                dependencies: f.dependencies,
              })),
              unscheduled: result.unscheduled.map(({ flight, reason }) => ({
                flightNumber: flight.flightNumber,
                operationType: flight.operationType,
                priority: flight.priority,
                reason,
              })),
            }),
          },
        ],
      };
    }
  );
}
