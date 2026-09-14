'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { planContinuous, collectorArguments } = require('./sustained-ranks');

const minute = 60000;

test('the schedule fills the window and always leaves a full sample and reserve', () => {
  const plan = planContinuous(0, 300 * minute, 25 * minute, 18 * minute, 45 * minute);
  assert.equal(plan.length, 10);
  assert.equal(plan.at(-1), 225 * minute);
  assert.ok(plan.at(-1) + 18 * minute + 45 * minute <= 300 * minute);
});

test('a window too small for one guarded sample yields no slot', () => {
  assert.deepEqual(planContinuous(0, 50 * minute, 25 * minute, 18 * minute, 45 * minute), []);
});

test('an explicit maximum caps an otherwise longer schedule', () => {
  assert.deepEqual(planContinuous(0, 300 * minute, 25 * minute, 18 * minute, 45 * minute, 3),
    [0, 25 * minute, 50 * minute]);
});

test('omitting countries collects every supported country instead of a filtered subset', () => {
  const all = collectorArguments({ concurrency: 5, countries: null }, '/tmp/out');
  assert.ok(!all.includes('--only'));
  assert.deepEqual(all.slice(1), ['--concurrency', '5', '--out', '/tmp/out']);
  const some = collectorArguments({ concurrency: 2, countries: ['KR', 'JP'] }, '/tmp/out');
  assert.deepEqual(some.slice(-2), ['--only', 'KR,JP']);
});
