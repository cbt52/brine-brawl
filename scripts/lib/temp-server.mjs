import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function startServer(port, env = {}) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ALLOW_DEBUG: '1', ...env },
    stdio: 'ignore',
  });
  const stop = () => new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 3000).unref();
  });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (r.ok) return stop;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  await stop();
  throw new Error(`server on ${port} did not become healthy`);
}
