import { defineConfig } from 'vite';
import path from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = __dirname;

function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'nogit';
  }
}

const build = `${gitSha()}-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`;

export default defineConfig({
  root: path.resolve(repoRoot, 'client'),
  publicDir: path.resolve(repoRoot, 'client/public'),
  define: { __BUILD_ID__: JSON.stringify(build) },
  build: {
    outDir: path.resolve(repoRoot, process.env.OUT_DIR ?? 'dist/client'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(repoRoot, 'client/index.html'),
        gallery: path.resolve(repoRoot, 'client/gallery.html'),
      },
    },
  },
  plugins: [
    {
      name: 'emit-build-json',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'build.json', source: JSON.stringify({ build }) });
      },
    },
  ],
});
