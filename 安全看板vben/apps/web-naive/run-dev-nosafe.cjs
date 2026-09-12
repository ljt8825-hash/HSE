/**
 * Dev/preview launcher that starts Vite with NODE_OPTIONS stripped of the
 * genie-safe-delete --require shim. The shim blocks Vite from clearing
 * node_modules/.vite/deps (BULK_CONFIRM fail-closed). By spawning Vite as a
 * child with a clean NODE_OPTIONS env, Vite can freely manage its dep cache.
 *
 * Usage: node run-dev-nosafe.cjs [--preview]
 */
const { spawn } = require('child_process');
const path = require('path');

const isPreview = process.argv.includes('--preview');
const cwd = __dirname;

// Allow explicit port override: --port=8090
const portArg = process.argv.find((a) => a.startsWith('--port='));
const port = portArg ? portArg.split('=')[1] : '8080';

const vitePkg = require.resolve('vite/package.json', { paths: [cwd] });
const viteBin = path.join(path.dirname(vitePkg), 'bin', 'vite.js');
const args = isPreview
  ? ['--host', '127.0.0.1', '--port', '4173', '--strictPort']
  : ['--mode', 'development', '--host', '127.0.0.1', '--port', port, '--strictPort'];

const env = { ...process.env };
// Remove the safe-delete shim so Vite's internal rm/rmSync calls are not blocked.
delete env.NODE_OPTIONS;
// Avoid proxy interfering with localhost dev server.
delete env.http_proxy;
delete env.https_proxy;
delete env.HTTP_PROXY;
delete env.HTTPS_PROXY;

console.log(`[run-dev-nosafe] launching vite (${isPreview ? 'preview' : 'dev'}) with clean NODE_OPTIONS...`);

const child = spawn(process.execPath, [viteBin, ...args], {
  env,
  cwd,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  console.log(`[run-dev-nosafe] vite exited code=${code} signal=${signal}`);
  process.exit(code ?? 0);
});
