import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AirportState, AirportConfig } from '../types.js';
import { computeBottleneck } from '../scheduler.js';

export function registerBottleneckTool(
  server: McpServer,
  state: AirportState,
  config: AirportConfig
): void {
  server.tool(
    'analyze_bottleneck',
    'Identify the critical dependency chain that drives the total schedule duration. Returns the ordered sequence of flights forming the longest active dependency chain, the total elapsed time from first to last operation, and a plain-language interpretation. Requires generate_schedule to have been called first.',
    async () => {
      if (!state.scheduleGeneratedAt) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: 'No schedule has been generated yet. Call generate_schedule first.',
              }),
            },
          ],
          isError: true,
        };
      }

      const result = computeBottleneck(state, config);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              criticalChain: result.chain,
              chainLength: result.chain.length,
              totalDurationSeconds: result.totalDurationSeconds,
              interpretation: result.interpretation,
            }),
          },
        ],
      };
    }
  );
}
