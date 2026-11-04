import test from 'node:test';
import assert from 'node:assert/strict';
import { getChampionIdMap, getDemoLiveMatch } from '../src/live.js';

test('getChampionIdMap maps numeric champion keys to champion names', async () => {
  const map = await getChampionIdMap();
  assert.equal(typeof map, 'object');
  // Check common champions
  assert.equal(map['238'], 'Zed');
  assert.equal(map['222'], 'Jinx');
  assert.equal(map['103'], 'Ahri');
  assert.equal(map['89'], 'Leona');
});

test('getDemoLiveMatch generates enriched 5v5 match with prediction and participant stats', () => {
  const demo = getDemoLiveMatch();
  assert.equal(demo.inGame, true);
  assert.equal(demo.games.length, 1);
  const match = demo.games[0];
  assert.equal(match.teams.blue.length, 5);
  assert.equal(match.teams.red.length, 5);
  assert.ok(match.prediction);
  assert.equal(typeof match.prediction.blue.probability, 'number');
  assert.equal(typeof match.prediction.red.probability, 'number');
  assert.equal(match.prediction.blue.probability + match.prediction.red.probability, 100);
  assert.ok(match.prediction.reasons.length > 0);

  // Check stats enrichment
  const panda = match.teams.blue.find((p) => p.summonerName === 'Panda');
  assert.ok(panda);
  assert.equal(panda.stats.rankLabel, 'Emerald II');
  assert.equal(panda.stats.mastery.isMain, true);
  assert.equal(panda.stats.hotStreak, true);
});
