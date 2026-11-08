import test from 'node:test';
import assert from 'node:assert/strict';
import { journalDestinationForMetric } from './journalAdventureNavigation.ts';

const destination = journalDestinationForMetric;
test('inventory metric links to personal award records, not completed rune history', () => {
  assert.deepEqual(destination('inventoryRecords'),
    { section: 'rewards', headingId: 'refuge-journal-rewards-title' });
});
test('available portals links to the currently available portals section', () => {
  assert.deepEqual(destination('availablePortals'),
    { section: 'portals', headingId: 'refuge-journal-portals-title' });
});
test('rune metric selects completed server audit history', () => {
  assert.deepEqual(destination('runeCompletions'),
    { section: 'history', headingId: 'refuge-journal-completed-title', mode: 'completed', filter: 'all' });
});
test('first mistakes require all outcomes and the mistake filter', () => {
  assert.deepEqual(destination('firstMistakes'),
    { section: 'history', headingId: 'refuge-journal-completed-title', mode: 'outcomes', filter: 'mistakes' });
});
test('Guardian victories and retreats never conflate their distinct event families', () => {
  assert.deepEqual(destination('guardianVictories'),
    { section: 'history', headingId: 'refuge-journal-completed-title', mode: 'outcomes', filter: 'victories' });
  assert.deepEqual(destination('guardianRetreats'),
    { section: 'history', headingId: 'refuge-journal-completed-title', mode: 'outcomes', filter: 'retreats' });
});
test('linked reward navigates only to verified completion-reward provenance', () => {
  assert.deepEqual(destination('linkedRewards'),
    { section: 'history', headingId: 'refuge-journal-completed-title', mode: 'completed', filter: 'rewards' });
});
test('every metric resolves to a focusable known section and no external URL', () => {
  for (const metric of ['inventoryRecords', 'availablePortals', 'runeCompletions',
    'firstMistakes', 'guardianVictories', 'guardianRetreats', 'linkedRewards']) {
    const item = destination(metric);
    assert.ok(item.headingId.startsWith('refuge-journal-'));
    assert.ok(['rewards', 'portals', 'history'].includes(item.section));
    assert.equal('href' in item, false);
  }
});
test('destinations are stable and cannot depend on another owner session', () => {
  const first = destination('guardianVictories');
  const second = destination('guardianVictories');
  assert.deepEqual(first, second);
  assert.equal('owner' in first, false);
});
