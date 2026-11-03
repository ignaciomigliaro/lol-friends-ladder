import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreMatch, isRemake } from '../src/score.js';

function createMockMatch({ duration = 1800, earlySurrender = false } = {}) {
  const participants = [];
  for (let i = 0; i < 10; i++) {
    const isBlue = i < 5;
    participants.push({
      puuid: `player-${i}`,
      teamId: isBlue ? 100 : 200,
      teamPosition: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'][i % 5],
      championName: 'Champion',
      win: isBlue,
      gameEndedInEarlySurrender: earlySurrender,
      kills: i === 0 ? 10 : 2,
      deaths: i === 0 ? 1 : 5,
      assists: 5,
      totalDamageDealtToChampions: i === 0 ? 30000 : 10000,
      totalDamageTaken: 15000,
      damageSelfMitigated: 5000,
      damageDealtToObjectives: i === 0 ? 8000 : 2000,
      goldEarned: i === 0 ? 15000 : 9000,
      totalMinionsKilled: 150,
      neutralMinionsKilled: 20,
      visionScore: 25,
    });
  }
  return {
    metadata: { matchId: 'TEST_001' },
    info: {
      queueId: 420,
      gameDuration: duration,
      participants,
    },
  };
}

test('isRemake correctly identifies remakes and early surrenders', () => {
  assert.equal(isRemake(createMockMatch({ duration: 200 })), true, 'Short game should be a remake');
  assert.equal(isRemake(createMockMatch({ earlySurrender: true })), true, 'Early surrender should be a remake');
  assert.equal(isRemake(createMockMatch({ duration: 1800 })), false, 'Normal game should not be a remake');
});

test('scoreMatch assigns scores, MVP to winner and ACE to loser', () => {
  const match = createMockMatch();
  const scores = scoreMatch(match);

  assert.equal(scores.size, 10);
  const p0 = scores.get('player-0');
  assert.ok(p0);
  assert.equal(p0.mvp, true, 'Top performer on winning team should be MVP');
  assert.equal(p0.ace, false);
  assert.equal(p0.place, 1);
  assert.ok(p0.score >= 8.0, `MVP score should be high, got ${p0.score}`);

  // Find ACE on the losing team (team 200: players 5-9)
  let foundAce = false;
  for (let i = 5; i < 10; i++) {
    const s = scores.get(`player-${i}`);
    if (s.ace) foundAce = true;
  }
  assert.equal(foundAce, true, 'One losing player should be ACE');
});
