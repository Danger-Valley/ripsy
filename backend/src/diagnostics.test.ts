import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackendDiagnostics } from './diagnostics.js';

test('writes structured allowlisted backend diagnostics', () => {
  const lines: string[] = [];
  const diagnose = createBackendDiagnostics(line => lines.push(line));
  diagnose({ level: 'info', event: 'command.completed', action: 'movePiece', durationMs: 42, outcome: 'success' });

  const entry = JSON.parse(lines[0]!) as Record<string, unknown>;
  assert.equal(entry.service, 'backend');
  assert.equal(entry.event, 'command.completed');
  assert.equal(entry.action, 'movePiece');
  assert.equal(entry.durationMs, 42);
  assert.equal(typeof entry.timestamp, 'string');
  assert.deepEqual(Object.keys(entry).sort(), ['action', 'durationMs', 'event', 'level', 'outcome', 'service', 'timestamp']);
});
