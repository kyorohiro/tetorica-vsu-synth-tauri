// SPDX-License-Identifier: BSD-3-Clause
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const python = process.platform === 'win32' ? 'python' : 'python3';
const importer = join(__dirname, 'import_release.py');
const child = spawnSync(python, [importer, ...process.argv.slice(2)], { stdio: 'inherit' });

if (child.error) console.error(child.error.message);
process.exitCode = child.status ?? 1;
