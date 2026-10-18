import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { chromium, webkit, devices } from '@playwright/test';
import { startServer } from './lib/temp-server.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '']);
    return acc;
  }, []),
);
const name = args.name ?? 'shot';
const clients = Number(args.clients ?? 1);
const query = args.query ?? 'room=shot';
const device = args.device ?? 'desktop';
const wait = Number(args.wait ?? 1500);
const pagePath = args.path ?? '/';

execSync('npm run build', { stdio: 'ignore', env: { ...process.env, OUT_DIR: 'dist/test-client' } });
fs.mkdirSync('.loop/shots', { recursive: true });
const stop = await startServer(8722, { CLIENT_DIR: 'dist/test-client' });
let browser;
try {
  const mobile = device !== 'desktop';
  browser = await (mobile ? webkit : chromium).launch();
  const ctxOpts = mobile ? { ...devices[device] } : { viewport: { width: 1280, height: 720 } };
  for (let i = 0; i < clients; i++) {
    const ctx = await browser.newContext(ctxOpts);
    // the first-visit tutorial card covers the match; `--tips` keeps it
    if (!('tips' in args)) await ctx.addInitScript(() => localStorage.setItem('brawl.tutorial', 'seen'));
    const page = await ctx.newPage();
    const q = query ? `?${query}${clients > 1 ? `&name=P${i}` : ''}` : '';
    await page.goto(`http://127.0.0.1:8722${pagePath}${q}`);
    await page.waitForTimeout(wait);
    const file = `.loop/shots/${name}-${i}.png`;
    await page.screenshot({ path: file });
    console.log(file);
  }
} finally {
  await browser?.close();
  await stop();
}
