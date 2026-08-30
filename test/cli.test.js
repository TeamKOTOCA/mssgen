const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const CLI_PATH = path.join(__dirname, '..', 'bin', 'cli.js');

test('cli prints help for global and command help flags', () => {
  for (const args of [['--help'], ['help'], ['dev', '--help'], ['init', '--help']]) {
    const result = spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8' });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage:/);
    assert.match(result.stdout, /mssgen dev/);
  }
});

test('cli prints help and exits non-zero for unknown commands', () => {
  const result = spawnSync(process.execPath, [CLI_PATH, 'unknown'], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown command: unknown/);
  assert.match(result.stdout, /Usage:/);
});
