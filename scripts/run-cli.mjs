// Author: Ethan
import './build-cli.mjs';
import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['dist/cli/lens.cjs', ...process.argv.slice(2)], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { process.stderr.write('Could not start Session Lens CLI.\n'); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143); });
