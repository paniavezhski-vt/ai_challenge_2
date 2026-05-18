import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AirportState, AirportConfig, Flight } from '../types.js';
import { getFlight, addFlight } from '../state.js';

export function registerSubmitTool(
  server: McpServer,
  state: AirportState,
  _config: AirportConfig
): void {
  server.tool(
    'submit_flight',
    'Submit a new flight to the queue. The flight will remain pending until generate_schedule is called. Returns an error if the flight number already exists (cancel it first to resubmit).',
    {
      flightNumber: z
        .string()
        .min(1)
        .max(10)
        .regex(/^[A-Z0-9]+$/, 'Must be uppercase alphanumeric, e.g. AA101')
        .describe('Unique flight identifier (uppercase alphanumeric, max 10 chars)'),
      operationType: z
        .enum(['arrival', 'departure'])
        .describe('Whether this is an arriving or departing flight'),
      priority: z
        .enum(['high', 'medium', 'low'])
        .describe('Scheduling priority; high-priority flights are scheduled earlier when resources are contested'),
      dependencies: z
        .array(z.string())
        .optional()
        .describe('Flight numbers that must complete before this flight can be scheduled'),
      minRunwayLengthM: z
        .number()
        .int()
        .min(500)
        .optional()
        .describe('Minimum runway length in meters required by this flight; omit if any runway is acceptable'),
    },
    async ({ flightNumber, operationType, priority, dependencies, minRunwayLengthM }) => {
      const existing = getFlight(state, flightNumber);
      if (existing) {
        const statusMsg =
          existing.status === 'cancelled'
            ? 'already exists as cancelled'
            : `already exists with status "${existing.status}"`;
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: `Flight ${flightNumber} ${statusMsg}. Use a different flight number or cancel the existing flight first.`,
              }),
            },
          ],
          isError: true,
        };
      }

      const flight: Flight = {
        flightNumber,
        operationType,
        priority,
        dependencies: dependencies ?? [],
        minRunwayLengthM: minRunwayLengthM ?? null,
        submittedAt: Date.now(),
        status: 'pending',
      };

      addFlight(state, flight);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              flightNumber,
              operationType,
              priority,
              dependencies: flight.dependencies,
              minRunwayLengthM: flight.minRunwayLengthM,
              message: `Flight ${flightNumber} queued as ${operationType} (${priority} priority). Call generate_schedule to compute a slot.`,
            }),
          },
        ],
      };
    }
  );
}
