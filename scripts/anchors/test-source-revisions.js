'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { applySourceRevisions } = require('./build-anchor-ledger');

test('page revision dates cover every same-URL citation without rewriting first publication', () => {
  const sources = {
    A: { url: 'https://example.test/july/', published_on: '2026-08-19', provider: 'AppMagic' },
    B: { url: 'https://example.test/july/', published_on: '2026-08-20', evidence: 'Original excerpt' },
    C: { url: 'https://example.test/other/', published_on: '2026-08-10' },
  };
  const result = applySourceRevisions(sources, [
    ['https://example.test/july/', '2026-09-02'],
    ['https://example.test/july/', '2026-08-25'],
  ]);
  assert.deepEqual(result, {
    A: { ...sources.A, page_modified_on: '2026-09-02' },
    B: { ...sources.B, page_modified_on: '2026-09-02' },
    C: sources.C,
  });
  assert.equal(sources.A.page_modified_on, undefined);
});

test('unregistered URLs cannot manufacture source identities', () => {
  assert.throws(() => applySourceRevisions({}, [
    ['https://example.test/missing/', '2026-09-02'],
  ]), /not registered/);
});

test('a rollover date is rejected rather than silently moved to another month', () => {
  assert.throws(() => applySourceRevisions({ A: { url: 'https://example.test/' } }, [
    ['https://example.test/', '2026-02-30'],
  ]), /Invalid source revision date/);
});
