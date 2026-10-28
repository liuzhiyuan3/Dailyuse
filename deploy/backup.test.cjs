const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { gunzipSync } = require('node:zlib');

function backup(fail = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dailyuse-backup-test-'));
  const output = path.join(dir, 'backup');
  fs.writeFileSync(path.join(dir, 'docker'), `#!/bin/sh
shift 2
if [ "$1" = sh ]; then
  POSTGRES_USER=custom_user POSTGRES_DB=custom_db "$@"
else
  "$@"
fi
`, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, 'pg_dump'), `#!/bin/sh
[ "$1" = -U ] && [ "$2" = custom_user ] && [ "$3" = custom_db ] || exit 2
${fail ? 'exit 3' : "printf 'test database dump'"}
`, { mode: 0o755 });
  const result = spawnSync('bash', [path.join(__dirname, 'backup.sh')], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, BACKUP_DIR: output, POSTGRES_USER: '', POSTGRES_DB: '' },
    encoding: 'utf8',
  });
  return { dir, output, result };
}

test('cron backup reads database identity from the running database container', () => {
  const run = backup();
  try {
    assert.equal(run.result.status, 0, run.result.stderr);
    const files = fs.readdirSync(run.output);
    assert.equal(files.length, 1);
    assert.equal(gunzipSync(fs.readFileSync(path.join(run.output, files[0]))).toString(), 'test database dump');
  } finally { fs.rmSync(run.dir, { recursive: true, force: true }); }
});

test('failed dump leaves no completed backup file', () => {
  const run = backup(true);
  try {
    assert.notEqual(run.result.status, 0);
    assert.equal(fs.readdirSync(run.output).length, 0);
  } finally { fs.rmSync(run.dir, { recursive: true, force: true }); }
});
