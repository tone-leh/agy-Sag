import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const radar = require('../packages/core/session-radar.js');

test('SessionRadar: default-off gating and running -> awaiting_decision / completed transitions', () => {
  const events = [];
  const ctl = radar.createSessionRadarController({
    enabled: false,
    onTransition: (ev) => events.push(ev),
  });

  // Disabled by default -> 0 events
  assert.deepEqual(ctl.sync([{ id: 's1', status: 'running', title: 'Build' }]), []);
  assert.equal(events.length, 0);

  ctl.setEnabled(true);
  ctl.sync([
    { id: 's1', status: 'running', title: 'Deploy' },
    { id: 's2', status: 'running', title: 'Refactor' },
  ]);
  assert.equal(events.length, 0, 'Initial baseline snapshot must not emit spurious transition events');

  ctl.sync([
    { id: 's1', status: 'awaiting_decision', title: 'Deploy' },
    { id: 's2', status: 'completed', title: 'Refactor' },
  ]);
  assert.equal(events.length, 2);
  assert.deepEqual(events[0], { type: 'awaiting_decision', id: 's1', title: 'Deploy' });
  assert.deepEqual(events[1], { type: 'completed', id: 's2', title: 'Refactor' });

  ctl.destroy();
  assert.equal(ctl.getDebugState().destroyed, true);
  assert.equal(ctl.getDebugState().trackedCount, 0);
});
