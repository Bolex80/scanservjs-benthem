import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const deployScript = new URL('./deploy-229.sh', import.meta.url).pathname;
const rollbackScript = new URL('./rollback-229.sh', import.meta.url).pathname;

function run(script, args) {
  return spawnSync('/bin/bash', [script, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SSH_BIN: '/nonexistent/ssh-must-not-run-in-dry-run',
      SCP_BIN: '/nonexistent/scp-must-not-run-in-dry-run'
    }
  });
}

test('deploy --dry-run prints the ownership, backup and transfer plan without SSH', async t => {
  const distDir = await mkdtemp(join(tmpdir(), 'scanservjs-deploy-test-'));
  await writeFile(join(distDir, 'index.html'), 'test');
  t.after(() => rm(distDir, { recursive: true, force: true }));

  const result = run(deployScript, ['--dry-run', distDir]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY RUN/);
  assert.match(result.stdout, /stat .*client/);
  assert.match(result.stdout, /client\.bak-\$\{STAMP\}/);
  assert.match(result.stdout, /pct push 229/);
  assert.match(result.stdout, /No service restart/);
});

test('rollback --dry-run prints the restore plan without SSH', () => {
  const result = run(rollbackScript, ['--dry-run', 'client.bak-20261107-1234']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DRY RUN/);
  assert.match(result.stdout, /client\.bak-20261107-1234/);
  assert.match(result.stdout, /restore/i);
  assert.match(result.stdout, /No service restart/);
});

test('rollback rejects anything other than a dated client backup name', () => {
  const result = run(rollbackScript, ['--dry-run', '../../etc']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /client\.bak-YYYYMMDD-HHMM/);
});
