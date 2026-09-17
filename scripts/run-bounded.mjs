import { spawn } from 'node:child_process';

const [duration, grace, command, ...args] = process.argv.slice(2);
function milliseconds(value) {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m)?$/.exec(value ?? '');
  if (!match || Number(match[1]) <= 0) throw new Error('Expected a positive duration');
  return Number(match[1]) * ({ ms: 1, s: 1000, m: 60000 }[match[2] ?? 's']);
}
const limit = milliseconds(duration), killAfter = milliseconds(grace);
if (!command) throw new Error('Missing command');
const child = spawn(command, args, { stdio: 'inherit', detached: process.platform !== 'win32' });
let expired = false, forced;
function signal(value) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') child.kill(value);
    else process.kill(-child.pid, value);
  } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
const timer = setTimeout(() => {
  expired = true; signal('SIGTERM');
  forced = setTimeout(() => signal('SIGKILL'), killAfter);
}, limit);
for (const name of ['SIGINT', 'SIGTERM']) process.on(name, () => signal(name));
child.on('error', error => { clearTimeout(timer); clearTimeout(forced); console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, exitSignal) => {
  clearTimeout(timer); clearTimeout(forced);
  process.exitCode = expired ? 124 : code ?? (exitSignal === 'SIGINT' ? 130 : 1);
});
