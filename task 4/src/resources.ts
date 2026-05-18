import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AirportState, AirportConfig, ScheduledFlight, CancelledFlight } from './types.js';
import { getAllFlights, getScheduledFlights } from './state.js';

export function registerResources(
  server: McpServer,
  state: AirportState,
  config: AirportConfig
): void {
  // ── Resource 1: Flight queue ───────────────────────────────────────────────
  server.resource(
    'flight-queue',
    'atc://flights/queue',
    {
      description:
        'All flights grouped by status: pending (unscheduled), scheduled, and cancelled. Pending flights include their unscheduled reason when available.',
      mimeType: 'application/json',
    },
    async () => {
      const pending: object[] = [];
      const scheduled: object[] = [];
      const cancelled: object[] = [];

      for (const f of getAllFlights(state)) {
        if (f.status === 'pending') {
          pending.push({
            flightNumber: f.flightNumber,
            operationType: f.operationType,
            priority: f.priority,
            dependencies: f.dependencies,
            minRunwayLengthM: f.minRunwayLengthM,
            unscheduledReason: (f as any).unscheduledReason ?? null,
          });
        } else if (f.status === 'scheduled') {
          const sf = f as ScheduledFlight;
          scheduled.push({
            flightNumber: sf.flightNumber,
            operationType: sf.operationType,
            priority: sf.priority,
            dependencies: sf.dependencies,
            minRunwayLengthM: sf.minRunwayLengthM,
            startTime: sf.startTime,
            endTime: sf.endTime,
            runwayId: sf.runwayId,
            gateId: sf.gateId,
          });
        } else if (f.status === 'cancelled') {
          const cf = f as CancelledFlight;
          cancelled.push({
            flightNumber: cf.flightNumber,
            operationType: cf.operationType,
            priority: cf.priority,
            dependencies: cf.dependencies,
            cancelledAt: new Date(cf.cancelledAt).toISOString(),
          });
        }
      }

      const payload = {
        generatedAt: state.scheduleGeneratedAt
          ? new Date(state.scheduleGeneratedAt).toISOString()
          : null,
        counts: {
          pending: pending.length,
          scheduled: scheduled.length,
          cancelled: cancelled.length,
        },
        pending,
        scheduled,
        cancelled,
      };

      return {
        contents: [
          {
            uri: 'atc://flights/queue',
            mimeType: 'application/json',
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );

  // ── Resource 2: Runway availability ───────────────────────────────────────
  server.resource(
    'runway-availability',
    'atc://runways/availability',
    {
      description:
        'Per-runway slot occupancy, length, and utilization percentage within the scheduling horizon.',
      mimeType: 'application/json',
    },
    async () => {
      const runways = config.runwayLengthsM.map((lengthM, runwayId) => {
        const slots = state.runwaySlots
          .filter((s) => s.runwayId === runwayId)
          .sort((a, b) => a.startTime - b.startTime)
          .map((s) => ({
            flightNumber: s.flightNumber,
            operationType: s.operationType,
            startTime: s.startTime,
            endTime: s.endTime,
          }));

        const totalOccupied = slots.reduce((sum, s) => sum + (s.endTime - s.startTime), 0);
        const utilizationPct =
          config.maxSchedulingHorizon > 0
            ? Math.round((totalOccupied / config.maxSchedulingHorizon) * 1000) / 10
            : 0;

        return {
          runwayId,
          lengthM,
          slotCount: slots.length,
          utilizationPct,
          slots,
        };
      });

      const payload = {
        horizonSeconds: config.maxSchedulingHorizon,
        generatedAt: state.scheduleGeneratedAt
          ? new Date(state.scheduleGeneratedAt).toISOString()
          : null,
        runways,
      };

      return {
        contents: [
          {
            uri: 'atc://runways/availability',
            mimeType: 'application/json',
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );

  // ── Resource 3: Operation timeline ────────────────────────────────────────
  server.resource(
    'operation-timeline',
    'atc://schedule/timeline',
    {
      description:
        'All scheduled operations in chronological order by start time. Time values are virtual seconds from t=0 (the moment generate_schedule was called).',
      mimeType: 'application/json',
    },
    async () => {
      const operations = getScheduledFlights(state)
        .sort((a, b) => a.startTime - b.startTime || a.flightNumber.localeCompare(b.flightNumber))
        .map((f) => ({
          startTime: f.startTime,
          endTime: f.endTime,
          flightNumber: f.flightNumber,
          operationType: f.operationType,
          priority: f.priority,
          runwayId: f.runwayId,
          gateId: f.gateId,
          dependencies: f.dependencies,
        }));

      const payload = {
        scheduleHorizonSeconds: config.maxSchedulingHorizon,
        generatedAt: state.scheduleGeneratedAt
          ? new Date(state.scheduleGeneratedAt).toISOString()
          : null,
        operationCount: operations.length,
        operations,
      };

      return {
        contents: [
          {
            uri: 'atc://schedule/timeline',
            mimeType: 'application/json',
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    }
  );
}
