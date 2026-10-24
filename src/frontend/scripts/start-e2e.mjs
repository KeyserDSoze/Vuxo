// Cross-platform Playwright webServer launcher (Windows does not support VAR=value npm ...).
import { spawn, spawnSync } from 'node:child_process';

const env = {
  ...process.env,
  VITE_E2E_REALTIME: 'true',
  VITE_E2E_AUTH: 'true',
};
const port = process.env.VUXO_E2E_PORT ?? '4173';
const npmCommand = process.platform === 'win32' ? 'cmd.exe' : 'npm';
const npmArgs = args => process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npm', ...args] : args;

const build = spawnSync(npmCommand, npmArgs(['run', 'build']), {
  env, stdio: 'inherit', windowsHide: true, shell: false,
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn(npmCommand, npmArgs([
  'run', 'preview', '--', '--host', '127.0.0.1', '--port', port, '--strictPort',
]), { env, stdio: 'inherit', windowsHide: true, shell: false });

server.once('error', error => { console.error(error); process.exitCode = 1; });
server.once('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => { if (!server.killed) server.kill('SIGTERM'); });
}
