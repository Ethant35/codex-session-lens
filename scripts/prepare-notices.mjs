// Author: Ethan
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const output = 'build/notices';
await mkdir(output, { recursive: true });
let notices = 'Session Lens third-party notices\nCompiled by Ethan. Upstream notices follow unchanged.\n';
for (const name of ['react', 'react-dom', 'scheduler', 'electron']) {
  const root = join('node_modules', name);
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  notices += `\n\n${name} ${pkg.version} (${pkg.license})\n${await readFile(join(root, 'LICENSE'), 'utf8')}`;
}
await writeFile(join(output, 'THIRD-PARTY-NOTICES.txt'), notices);
// The official Electron distribution carries Chromium and embedded library notices.
// prepare:electron installs this exact locked distribution without starting the GUI.
await copyFile('node_modules/electron/dist/LICENSES.chromium.html', join(output, 'LICENSES.chromium.html'));
console.log('Runtime license notices prepared.');
