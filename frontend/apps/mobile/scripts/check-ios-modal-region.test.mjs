import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('actual native modal-region helper handles divisions and a keyboard-clipped preferred pane', { skip: process.platform !== 'darwin' }, () => {
  const directory = mkdtempSync(join(tmpdir(), 'ripsy-modal-geometry-'));
  const binary = join(directory, 'geometry-test');
  try {
    const fixture = fileURLToPath(new URL('./fixtures/modal-region-geometry.c', import.meta.url));
    const build = spawnSync('xcrun', ['clang', '-framework', 'CoreGraphics', fixture, '-o', binary], { encoding: 'utf8', timeout: 60_000 });
    assert.equal(build.status, 0, build.stderr || build.error?.message);
    const run = spawnSync(binary, [], { encoding: 'utf8', timeout: 5000 });
    assert.equal(run.status, 0, run.stderr || run.error?.message);
    assert.match(run.stdout, /13 modal-region geometry assertions PASS/);
  } finally {
    // Only the exact test-owned mkdtemp directory is removed, never a user path.
    assert.ok(directory.startsWith(join(tmpdir(), 'ripsy-modal-geometry-')));
    rmSync(directory, { recursive: true });
  }
});
