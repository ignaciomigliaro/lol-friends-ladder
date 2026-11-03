import test from 'node:test';
import assert from 'node:assert/strict';
import { getChampionIdMap } from '../src/live.js';

test('getChampionIdMap maps numeric champion keys to champion names', async () => {
  const map = await getChampionIdMap();
  assert.equal(typeof map, 'object');
  // Check common champions
  assert.equal(map['238'], 'Zed');
  assert.equal(map['222'], 'Jinx');
  assert.equal(map['103'], 'Ahri');
  assert.equal(map['89'], 'Leona');
});
