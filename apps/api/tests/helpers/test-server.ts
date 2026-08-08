import type { Express } from 'express';
import { createApp } from '../../src/app';

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

/** Boot the real Express app on an ephemeral port for integration tests. */
export async function startTestServer(app: Express = createApp()): Promise<TestServer> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('unable to determine test server address');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
