import { createServer, type Server } from 'node:http';

export interface WorkerHealthServerOptions {
  port: number;
  workerId: string;
  isShuttingDown(): boolean;
  readinessCheck(): Promise<boolean>;
}

function writeJson(
  response: import('node:http').ServerResponse,
  statusCode: number,
  body: Readonly<Record<string, unknown>>
): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(body));
}

export interface RunningHealthServer {
  port: number;
  close(): Promise<void>;
}

export async function startWorkerHealthServer(
  options: WorkerHealthServerOptions
): Promise<RunningHealthServer> {
  const server: Server = createServer(async (request, response) => {
    const path = request.url?.split('?', 1)[0] ?? '/';

    if (request.method === 'GET' && path === '/healthz') {
      writeJson(response, 200, {
        status: 'ok',
        workerId: options.workerId,
        shuttingDown: options.isShuttingDown()
      });
      return;
    }

    if (request.method === 'GET' && path === '/readyz') {
      if (options.isShuttingDown()) {
        writeJson(response, 503, {
          status: 'not_ready',
          workerId: options.workerId,
          reason: 'shutting_down'
        });
        return;
      }

      try {
        const ready = await options.readinessCheck();
        writeJson(response, ready ? 200 : 503, {
          status: ready ? 'ready' : 'not_ready',
          workerId: options.workerId
        });
      } catch {
        // Do not expose database/provider details through a public health endpoint.
        writeJson(response, 503, {
          status: 'not_ready',
          workerId: options.workerId
        });
      }
      return;
    }

    writeJson(response, 404, { status: 'not_found' });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : options.port;

  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}
