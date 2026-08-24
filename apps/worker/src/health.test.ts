import assert from 'node:assert/strict';
import test from 'node:test';
import { startWorkerHealthServer } from './health.js';

test('health endpoints expose liveness and readiness without infrastructure details', async () => {
  let shuttingDown = false;
  let ready = true;
  const server = await startWorkerHealthServer({
    port: 0,
    workerId: 'worker-health-test',
    isShuttingDown: () => shuttingDown,
    readinessCheck: async () => ready
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.port}`;
    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {
      status: 'ok',
      workerId: 'worker-health-test',
      shuttingDown: false
    });

    const readiness = await fetch(`${baseUrl}/readyz`);
    assert.equal(readiness.status, 200);
    assert.deepEqual(await readiness.json(), {
      status: 'ready',
      workerId: 'worker-health-test'
    });

    ready = false;
    const notReady = await fetch(`${baseUrl}/readyz`);
    assert.equal(notReady.status, 503);
    assert.deepEqual(await notReady.json(), {
      status: 'not_ready',
      workerId: 'worker-health-test'
    });

    shuttingDown = true;
    const draining = await fetch(`${baseUrl}/readyz`);
    assert.equal(draining.status, 503);
    assert.deepEqual(await draining.json(), {
      status: 'not_ready',
      workerId: 'worker-health-test',
      reason: 'shutting_down'
    });
  } finally {
    await server.close();
  }
});
