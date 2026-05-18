import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, ConfigError } from './config.js';
import { createInitialState } from './state.js';
import { registerSubmitTool } from './tools/submit.js';
import { registerScheduleTool } from './tools/schedule.js';
import { registerStatusTool } from './tools/status.js';
import { registerCancelTool } from './tools/cancel.js';
import { registerBottleneckTool } from './tools/bottleneck.js';
import { registerResources } from './resources.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`[ATC] Configuration error: ${err.message}\n`);
    } else {
      process.stderr.write(`[ATC] Unexpected startup error: ${err}\n`);
    }
    process.exit(1);
  }

  const state = createInitialState();

  const server = new McpServer(
    { name: 'atc-mcp-server', version: '1.0.0' },
    {
      capabilities: { tools: {}, resources: {} },
      instructions: [
        'Air Traffic Control scheduling server.',
        'Tools:',
        '  submit_flight      — add a flight to the queue',
        '  generate_schedule  — compute slot assignments for all pending/scheduled flights',
        '  get_airport_status — operational overview with resource usage and constraint indicators',
        '  cancel_flight      — cancel a flight and recompute the schedule',
        '  analyze_bottleneck — find the critical dependency chain driving schedule duration',
        'Resources:',
        '  atc://flights/queue          — all flights grouped by status',
        '  atc://runways/availability   — per-runway occupancy and utilization',
        '  atc://schedule/timeline      — scheduled operations in chronological order',
      ].join('\n'),
    }
  );

  registerSubmitTool(server, state, config);
  registerScheduleTool(server, state, config);
  registerStatusTool(server, state, config);
  registerCancelTool(server, state, config);
  registerBottleneckTool(server, state, config);
  registerResources(server, state, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(
    `[ATC] Server running. Config: ${config.runwayCount} runway(s) [${config.runwayLengthsM.join(',')}m], ${config.gateCount} gates, ${config.groundCrewCount} crew, horizon ${config.maxSchedulingHorizon}s\n`
  );
}

main().catch((err) => {
  process.stderr.write(`[ATC] Fatal error: ${err}\n`);
  process.exit(1);
});
