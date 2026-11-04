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

  // Verify Mochila of each team (lowest performer on Blue and Red team)
  const blueMochilas = [];
  const redMochilas = [];
  for (let i = 0; i < 5; i++) {
    if (scores.get(`player-${i}`).mochila) blueMochilas.push(i);
  }
  for (let i = 5; i < 10; i++) {
    if (scores.get(`player-${i}`).mochila) redMochilas.push(i);
  }
  assert.equal(blueMochilas.length, 1, 'Winning team should have exactly one Mochila');
  assert.equal(redMochilas.length, 1, 'Losing team should have exactly one Mochila');
});

test('scoreMatch evaluates support fairly based on vision and assists without CS penalty', () => {
  const match = createMockMatch();
  // Modify player-4 (UTILITY / Support) to have a stellar game
  const supp = match.info.participants[4];
  supp.kills = 1;
  supp.deaths = 1;
  supp.assists = 17; // 18 / 18 KP (100% KP)
  supp.visionScore = 75; // Great vision
  supp.totalMinionsKilled = 12; // Typical support CS
  supp.neutralMinionsKilled = 0;

  const scores = scoreMatch(match);
  const suppScore = scores.get('player-4');
  assert.ok(suppScore.score >= 8.0, `Support with 100% KP and great vision should score high, got ${suppScore.score}`);
});

test('scoreMatch ensures MVP and ACE can never be tagged as Mochila', () => {
  const match = createMockMatch();
  const scores = scoreMatch(match);
  for (const [, s] of scores) {
    if (s.mvp) {
      assert.equal(s.mochila, false, 'MVP must never be Mochila');
      assert.equal(s.ace, false, 'MVP must never be ACE');
    }
    if (s.ace) {
      assert.equal(s.mochila, false, 'ACE must never be Mochila');
      assert.equal(s.mvp, false, 'ACE must never be MVP');
    }
  }
});

test('scoreMatch penalizes repeated feeding so the feeder gets Mochila instead of a lane-winning teammate', () => {
  const match = createMockMatch();
  // player-1 (JUNGLE) feeds 12 deaths and has low damage
  const feeder = match.info.participants[1];
  feeder.kills = 1;
  feeder.deaths = 12;
  feeder.assists = 2;
  feeder.totalDamageDealtToChampions = 4000;

  // player-2 (MIDDLE) played well with 6/2/5
  const solid = match.info.participants[2];
  solid.kills = 6;
  solid.deaths = 2;
  solid.assists = 5;
  solid.totalDamageDealtToChampions = 22000;

  const scores = scoreMatch(match);
  assert.equal(scores.get('player-1').mochila, true, 'Feeder with 12 deaths should be marked Mochila');
  assert.equal(scores.get('player-2').mochila, false, 'Solid player should not be Mochila');
});

test('scoreMatch avoids assigning false Mochila to clean top-half winners in a dominant sweep', () => {
  const match = createMockMatch();
  // Make all 5 winning players have exceptional stats
  for (let i = 0; i < 5; i++) {
    const p = match.info.participants[i];
    p.kills = 8;
    p.deaths = 1;
    p.assists = 12;
    p.totalDamageDealtToChampions = 25000;
    p.visionScore = 40;
  }
  // Losing team has poor stats
  for (let i = 5; i < 10; i++) {
    const p = match.info.participants[i];
    p.kills = 1;
    p.deaths = 8;
    p.assists = 2;
    p.totalDamageDealtToChampions = 6000;
  }

  const scores = scoreMatch(match);
  const blueMochilas = [];
  for (let i = 0; i < 5; i++) {
    if (scores.get(`player-${i}`).mochila) blueMochilas.push(i);
  }
  assert.equal(blueMochilas.length, 0, 'No winning team player should be tagged Mochila when all 5 dominated cleanly');
});
