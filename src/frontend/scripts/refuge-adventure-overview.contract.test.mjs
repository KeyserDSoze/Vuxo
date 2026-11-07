import test from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeAdventureHistory, summarizeRefugeAdventure,
} from '../src/features/refuge/refugeAdventureOverview.ts';

const completion = { grantId: 'g1', rewardItemKey: 'item.grove_seed.v1' };
const unawarded = { grantId: 'g2', rewardItemKey: null };
const outcome = (kind, rewardItemKey = null) => ({ grantId: 'g3', kind, rewardItemKey });
const timeline = [
  outcome('sequence_completed', 'item.grove_seed.v1'),
  outcome('sequence_first_mistake'), outcome('guardian_victory'),
  outcome('guardian_retreat'), outcome('sequence_completed'),
];

test('unavailable inventory, portals and history are unknown, never zero', () => {
  assert.deepEqual(summarizeRefugeAdventure(null, null, null), {
    inventoryRecords: null, availablePortals: null, runeCompletions: null,
    firstMistakes: null, guardianVictories: null, guardianRetreats: null,
    linkedRewards: null, loadedEvents: null, hasMoreEvents: null, historyMode: null,
  });
});
test('confirmed empty owner reads show real zeroes, but completed mode cannot claim zero Guardian events', () => {
  const history = summarizeAdventureHistory([], 'completed', false);
  const overview = summarizeRefugeAdventure([], [], history);
  assert.equal(overview.inventoryRecords, 0);
  assert.equal(overview.availablePortals, 0);
  assert.equal(overview.runeCompletions, 0);
  assert.equal(overview.linkedRewards, 0);
  assert.equal(overview.guardianVictories, null);
  assert.equal(overview.firstMistakes, null);
  assert.equal(overview.hasMoreEvents, false);
});
test('completed-only audit counts receipts, not inventory item grants or guesses about Guardians', () => {
  const summary = summarizeAdventureHistory([completion, unawarded], 'completed', true);
  const view = summarizeRefugeAdventure([{}, {}, {}], [{}], summary);
  assert.equal(view.inventoryRecords, 3);
  assert.equal(view.availablePortals, 1);
  assert.equal(view.runeCompletions, 2);
  assert.equal(view.linkedRewards, 1);
  assert.equal(view.guardianVictories, null);
  assert.equal(view.hasMoreEvents, true);
});
test('outcomes count all four separate audit families without merging Guardian defeats into rune rewards', () => {
  const summary = summarizeAdventureHistory(timeline, 'outcomes', false);
  assert.equal(summary.loaded, 5);
  assert.equal(summary.runeCompletions, 2);
  assert.equal(summary.firstMistakes, 1);
  assert.equal(summary.guardianVictories, 1);
  assert.equal(summary.guardianRetreats, 1);
  assert.equal(summary.linkedRewards, 1);
});
test('a Guardian victory with an invalid reward-like value cannot be counted as a rune award', () => {
  const summary = summarizeAdventureHistory([outcome('guardian_victory', 'fake.reward')], 'outcomes', false);
  assert.equal(summary.guardianVictories, 1);
  assert.equal(summary.linkedRewards, 0);
});
test('a first rune mistake with a reward-like value is never a rewarded completion', () => {
  const summary = summarizeAdventureHistory([outcome('sequence_first_mistake', 'fake.reward')], 'outcomes', false);
  assert.equal(summary.firstMistakes, 1);
  assert.equal(summary.runeCompletions, 0);
  assert.equal(summary.linkedRewards, 0);
});
test('an outcomes snapshot distinguishes unknown owner inventories from an empty verified event stream', () => {
  const overview = summarizeRefugeAdventure(null, [], summarizeAdventureHistory([], 'outcomes', false));
  assert.equal(overview.inventoryRecords, null);
  assert.equal(overview.availablePortals, 0);
  assert.equal(overview.guardianVictories, 0);
});
test('pagination snapshot only increases through newly verified loaded rows and retains hasMore', () => {
  const first = summarizeAdventureHistory(timeline.slice(0, 2), 'outcomes', true);
  const next = summarizeAdventureHistory(timeline, 'outcomes', false);
  assert.equal(first.loaded, 2);
  assert.equal(first.hasMore, true);
  assert.equal(first.guardianVictories, 0);
  assert.equal(next.loaded, 5);
  assert.equal(next.hasMore, false);
  assert.equal(next.guardianVictories, 1);
});
test('switching from full outcomes to completions must not reuse previously known Guardian counts', () => {
  const all = summarizeAdventureHistory(timeline, 'outcomes', false);
  assert.equal(all.guardianVictories, 1);
  const completed = summarizeAdventureHistory([completion], 'completed', false);
  assert.equal(completed.guardianVictories, null);
  assert.equal(completed.firstMistakes, null);
});
test('both owners get independent snapshots, no global cache or cross-owner joining', () => {
  const ownerA = summarizeRefugeAdventure([{}], [{}], summarizeAdventureHistory([completion], 'completed', false));
  const ownerB = summarizeRefugeAdventure([], [], summarizeAdventureHistory([], 'completed', false));
  assert.equal(ownerA.runeCompletions, 1);
  assert.equal(ownerB.runeCompletions, 0);
  assert.equal(ownerB.linkedRewards, 0);
});
test('summaries preserve input arrays and do not modify server DTOs', () => {
  const frozen = Object.freeze(timeline.map(item => Object.freeze(item)));
  assert.equal(summarizeAdventureHistory(frozen, 'outcomes', true).loaded, 5);
  assert.equal(frozen.length, 5);
});
test('inventory counts award records instead of summed quantities or fabricated XP', () => {
  const overview = summarizeRefugeAdventure([{ quantity: 99 }, { quantity: 200 }], [], null);
  assert.equal(overview.inventoryRecords, 2);
  assert.equal('xp' in overview, false);
  assert.equal(overview.runeCompletions, null);
});
