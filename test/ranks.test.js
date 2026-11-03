import test from 'node:test';
import assert from 'node:assert/strict';
import { rankValue, rankLabel } from '../src/ranks.js';

test('rankValue correctly calculates comparable LP across tiers and divisions', () => {
  const iron4 = rankValue({ tier: 'IRON', rank: 'IV', leaguePoints: 0 });
  const iron1 = rankValue({ tier: 'IRON', rank: 'I', leaguePoints: 50 });
  const gold4 = rankValue({ tier: 'GOLD', rank: 'IV', leaguePoints: 20 });
  const emerald2 = rankValue({ tier: 'EMERALD', rank: 'II', leaguePoints: 84 });
  const master = rankValue({ tier: 'MASTER', rank: 'I', leaguePoints: 120 });
  const challenger = rankValue({ tier: 'CHALLENGER', rank: 'I', leaguePoints: 800 });

  assert.ok(iron1 > iron4);
  assert.ok(gold4 > iron1);
  assert.ok(emerald2 > gold4);
  assert.ok(master > emerald2);
  assert.ok(challenger > master);
});

test('rankLabel formats label properly', () => {
  assert.equal(rankLabel({ tier: 'EMERALD', rank: 'II', leaguePoints: 84 }), 'Emerald II 84 LP');
  assert.equal(rankLabel({ tier: 'CHALLENGER', rank: 'I', leaguePoints: 540 }), 'Challenger 540 LP');
  assert.equal(rankLabel(null), 'Unranked');
});
