import { z } from 'zod';
import type { AirportConfig } from './types.js';

export class ConfigError extends Error {
  constructor(message: string, public readonly field: string) {
    super(`Config error [${field}]: ${message}`);
    this.name = 'ConfigError';
  }
}

const positiveInt = (min = 1) => z.coerce.number().int().min(min);
const nonNegInt = () => z.coerce.number().int().min(0);

const envSchema = z.object({
  RUNWAY_COUNT: positiveInt(1).default(2),
  RUNWAY_LENGTHS_M: z.string().optional(),
  GATE_COUNT: positiveInt(1).default(5),
  GROUND_CREW_COUNT: positiveInt(1).default(3),
  RUNWAY_SEPARATION_TAKEOFF: nonNegInt().default(90),
  RUNWAY_SEPARATION_LANDING: nonNegInt().default(90),
  RUNWAY_SEPARATION_MIXED: nonNegInt().default(60),
  GATE_TURNAROUND_TIME: positiveInt(1).default(1800),
  DEPENDENCY_BUFFER_TIME: nonNegInt().default(900),
  ARRIVAL_DURATION: positiveInt(1).default(900),
  DEPARTURE_DURATION: positiveInt(1).default(600),
  MAX_SCHEDULING_HORIZON: positiveInt(60).default(28800),
});

export function loadConfig(): AirportConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path.join('.') || 'unknown';
    throw new ConfigError(issue.message, field);
  }

  const env = parsed.data;

  let runwayLengthsM: number[];

  if (env.RUNWAY_LENGTHS_M) {
    const parts = env.RUNWAY_LENGTHS_M.split(',').map((s) => s.trim());
    if (parts.length !== env.RUNWAY_COUNT) {
      throw new ConfigError(
        `RUNWAY_LENGTHS_M has ${parts.length} values but RUNWAY_COUNT is ${env.RUNWAY_COUNT}`,
        'RUNWAY_LENGTHS_M'
      );
    }
    runwayLengthsM = parts.map((p, i) => {
      const n = parseInt(p, 10);
      if (isNaN(n) || n < 500) {
        throw new ConfigError(
          `Value at index ${i} ("${p}") must be an integer >= 500`,
          'RUNWAY_LENGTHS_M'
        );
      }
      return n;
    });
  } else {
    runwayLengthsM = Array(env.RUNWAY_COUNT).fill(3000);
  }

  return {
    runwayCount: env.RUNWAY_COUNT,
    runwayLengthsM,
    gateCount: env.GATE_COUNT,
    groundCrewCount: env.GROUND_CREW_COUNT,
    runwaySeparationTakeoff: env.RUNWAY_SEPARATION_TAKEOFF,
    runwaySeparationLanding: env.RUNWAY_SEPARATION_LANDING,
    runwaySeparationMixed: env.RUNWAY_SEPARATION_MIXED,
    gateTurnaroundTime: env.GATE_TURNAROUND_TIME,
    dependencyBufferTime: env.DEPENDENCY_BUFFER_TIME,
    arrivalDuration: env.ARRIVAL_DURATION,
    departureDuration: env.DEPARTURE_DURATION,
    maxSchedulingHorizon: env.MAX_SCHEDULING_HORIZON,
  };
}
