/**
 * Validation test for the ATC MCP server.
 * Runs Scenarios 1-3 and extra edge cases directly against the scheduler.
 * Uses the dist/ build.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  PASS: ${message}`);
  }
}

async function makeClient(env = {}) {
  const serverEnv = {
    RUNWAY_COUNT: '2',
    RUNWAY_LENGTHS_M: '3500,2000',
    GATE_COUNT: '5',
    GROUND_CREW_COUNT: '3',
    ARRIVAL_DURATION: '900',
    DEPARTURE_DURATION: '600',
    DEPENDENCY_BUFFER_TIME: '900',
    GATE_TURNAROUND_TIME: '1800',
    RUNWAY_SEPARATION_TAKEOFF: '90',
    RUNWAY_SEPARATION_LANDING: '90',
    RUNWAY_SEPARATION_MIXED: '60',
    MAX_SCHEDULING_HORIZON: '28800',
    ...env,
  };

  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(__dirname, 'dist/index.js')],
    env: { ...process.env, ...serverEnv },
  });

  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content[0].text;
  return JSON.parse(text);
}

async function readResource(client, uri) {
  const result = await client.readResource({ uri });
  return JSON.parse(result.contents[0].text);
}

// ─── Scenario 1: Morning Rush ─────────────────────────────────────────────────
async function scenario1() {
  console.log('\n=== Scenario 1: Morning Rush ===');
  const client = await makeClient();

  try {
    await callTool(client, 'submit_flight', { flightNumber: 'AA100', operationType: 'arrival', priority: 'high' });
    await callTool(client, 'submit_flight', { flightNumber: 'BA200', operationType: 'departure', priority: 'medium' });
    await callTool(client, 'submit_flight', { flightNumber: 'UA300', operationType: 'arrival', priority: 'low' });
    await callTool(client, 'submit_flight', { flightNumber: 'DL400', operationType: 'departure', priority: 'low' });

    const sched = await callTool(client, 'generate_schedule');
    assert(sched.scheduledCount === 4, `All 4 flights scheduled (got ${sched.scheduledCount})`);
    assert(sched.unscheduledCount === 0, `No unscheduled flights`);

    const timeline = await readResource(client, 'atc://schedule/timeline');
    const ops = timeline.operations;
    assert(ops.length === 4, `Timeline has 4 operations`);

    // AA100 (high) should start before or at same time as BA200 (medium)
    const aa100 = ops.find(o => o.flightNumber === 'AA100');
    const ba200 = ops.find(o => o.flightNumber === 'BA200');
    assert(aa100.startTime <= ba200.startTime, `High-priority AA100 starts before/at medium BA200`);

    // No runway overlap check: for each runway, no two slots overlap (with separation)
    const runways = await readResource(client, 'atc://runways/availability');
    for (const rw of runways.runways) {
      const slots = rw.slots.sort((a, b) => a.startTime - b.startTime);
      for (let i = 1; i < slots.length; i++) {
        assert(slots[i].startTime >= slots[i-1].endTime, `Runway ${rw.runwayId}: slot ${i} starts after slot ${i-1} ends`);
      }
    }

    const queue = await readResource(client, 'atc://flights/queue');
    assert(queue.scheduled.length === 4, `Queue shows 4 scheduled flights`);
    assert(queue.pending.length === 0, `Queue has no pending flights`);
  } finally {
    await client.close();
  }
}

// ─── Scenario 2: Heavy Hauler ─────────────────────────────────────────────────
async function scenario2() {
  console.log('\n=== Scenario 2: Heavy Hauler ===');
  const client = await makeClient(); // runways: 3500m and 2000m

  try {
    // Submit a flight requiring 5000m runway (both runways < 5000m)
    await callTool(client, 'submit_flight', {
      flightNumber: 'HH001',
      operationType: 'departure',
      priority: 'high',
      minRunwayLengthM: 5000,
    });
    // Also submit a normal flight
    await callTool(client, 'submit_flight', {
      flightNumber: 'NM001',
      operationType: 'arrival',
      priority: 'medium',
    });

    const sched = await callTool(client, 'generate_schedule');
    assert(sched.scheduledCount === 1, `1 flight scheduled (NM001), HH001 unscheduled`);
    assert(sched.unscheduledCount === 1, `1 flight unscheduled`);

    const unscheduled = sched.unscheduled.find(u => u.flightNumber === 'HH001');
    assert(unscheduled !== undefined, `HH001 appears in unscheduled list`);
    assert(unscheduled.reason === 'no_runway_meets_length_requirement', `HH001 reason is no_runway_meets_length_requirement (got: ${unscheduled?.reason})`);

    const queue = await readResource(client, 'atc://flights/queue');
    const pendingHH = queue.pending.find(p => p.flightNumber === 'HH001');
    assert(pendingHH !== undefined, `HH001 visible in flight queue as pending`);
    assert(pendingHH.unscheduledReason === 'no_runway_meets_length_requirement', `HH001 queue entry has correct reason`);

    const status = await callTool(client, 'get_airport_status');
    assert(status.constraintIndicators.runwayLengthConflicts === 1, `Status shows 1 runway length conflict`);
    assert(status.flightCounts.scheduled === 1, `Status shows 1 scheduled flight`);
  } finally {
    await client.close();
  }
}

// ─── Scenario 3: Connecting Flight ───────────────────────────────────────────
async function scenario3() {
  console.log('\n=== Scenario 3: Connecting Flight ===');
  const client = await makeClient();

  try {
    await callTool(client, 'submit_flight', {
      flightNumber: 'AA100',
      operationType: 'arrival',
      priority: 'high',
    });
    await callTool(client, 'submit_flight', {
      flightNumber: 'AA200',
      operationType: 'departure',
      priority: 'high',
      dependencies: ['AA100'],
    });

    const sched = await callTool(client, 'generate_schedule');
    assert(sched.scheduledCount === 2, `Both flights scheduled`);
    assert(sched.unscheduledCount === 0, `No unscheduled flights`);

    const aa100 = sched.scheduled.find(f => f.flightNumber === 'AA100');
    const aa200 = sched.scheduled.find(f => f.flightNumber === 'AA200');
    // AA200 must start >= AA100.endTime + DEPENDENCY_BUFFER_TIME (900s)
    assert(
      aa200.startTime >= aa100.endTime + 900,
      `AA200 starts at ${aa200.startTime}, AA100 ends at ${aa100.endTime}, buffer 900s → should be >= ${aa100.endTime + 900}`
    );

    const bottleneck = await callTool(client, 'analyze_bottleneck');
    assert(bottleneck.criticalChain.length === 2, `Bottleneck chain has 2 flights`);
    assert(
      bottleneck.criticalChain[0] === 'AA100' && bottleneck.criticalChain[1] === 'AA200',
      `Bottleneck chain is AA100 → AA200`
    );
    assert(bottleneck.totalDurationSeconds > 0, `Bottleneck has positive duration`);
  } finally {
    await client.close();
  }
}

// ─── Edge case: cancel + reschedule ──────────────────────────────────────────
async function scenarioCancel() {
  console.log('\n=== Edge case: Cancel and reschedule ===');
  const client = await makeClient();

  try {
    await callTool(client, 'submit_flight', { flightNumber: 'A1', operationType: 'arrival', priority: 'high' });
    await callTool(client, 'submit_flight', { flightNumber: 'D1', operationType: 'departure', priority: 'medium', dependencies: ['A1'] });
    await callTool(client, 'generate_schedule');

    const cancel = await callTool(client, 'cancel_flight', { flightNumber: 'A1' });
    assert(cancel.success === true, `Cancel succeeded`);
    assert(cancel.affectedDependents.includes('D1'), `D1 listed as affected dependent`);

    const queue = await readResource(client, 'atc://flights/queue');
    const cancelledA1 = queue.cancelled.find(f => f.flightNumber === 'A1');
    assert(cancelledA1 !== undefined, `A1 is in cancelled list`);

    // D1 should be pending with dependency_cancelled reason (since A1 is cancelled)
    const pendingD1 = queue.pending.find(f => f.flightNumber === 'D1');
    assert(pendingD1 !== undefined, `D1 reverted to pending`);
  } finally {
    await client.close();
  }
}

// ─── Edge case: duplicate submission ─────────────────────────────────────────
async function scenarioDuplicate() {
  console.log('\n=== Edge case: Duplicate flight submission ===');
  const client = await makeClient();

  try {
    const r1 = await callTool(client, 'submit_flight', { flightNumber: 'XX1', operationType: 'arrival', priority: 'low' });
    assert(r1.success === true, `First submission succeeds`);

    const r2 = await callTool(client, 'submit_flight', { flightNumber: 'XX1', operationType: 'departure', priority: 'high' });
    assert(r2.success === false, `Duplicate submission rejected`);
  } finally {
    await client.close();
  }
}

// ─── Edge case: bottleneck before schedule ────────────────────────────────────
async function scenarioBottleneckBeforeSchedule() {
  console.log('\n=== Edge case: Bottleneck before generate_schedule ===');
  const client = await makeClient();

  try {
    const r = await callTool(client, 'analyze_bottleneck');
    assert(r.success === false, `Bottleneck returns error when no schedule exists`);
  } finally {
    await client.close();
  }
}

// ─── Edge case: dependency cycle ─────────────────────────────────────────────
async function scenarioCycle() {
  console.log('\n=== Edge case: Dependency cycle ===');
  const client = await makeClient();

  try {
    await callTool(client, 'submit_flight', { flightNumber: 'CY1', operationType: 'arrival', priority: 'high', dependencies: ['CY2'] });
    await callTool(client, 'submit_flight', { flightNumber: 'CY2', operationType: 'departure', priority: 'high', dependencies: ['CY1'] });

    const sched = await callTool(client, 'generate_schedule');
    assert(sched.scheduledCount === 0, `No flights scheduled due to cycle`);
    assert(sched.unscheduledCount === 2, `Both cycle flights unscheduled`);
    const reasons = sched.unscheduled.map(u => u.reason);
    assert(reasons.every(r => r === 'dependency_cycle'), `Both flights have dependency_cycle reason (got ${reasons})`);
  } finally {
    await client.close();
  }
}

// ─── Run all ──────────────────────────────────────────────────────────────────
(async () => {
  try {
    await scenario1();
    await scenario2();
    await scenario3();
    await scenarioCancel();
    await scenarioDuplicate();
    await scenarioBottleneckBeforeSchedule();
    await scenarioCycle();
    console.log('\n=== All tests completed ===');
    if (process.exitCode === 1) {
      console.error('Some tests FAILED.');
    } else {
      console.log('All tests PASSED.');
    }
  } catch (err) {
    console.error('Test runner error:', err);
    process.exit(1);
  }
})();
