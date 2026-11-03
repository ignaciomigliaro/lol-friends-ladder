import test from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORM_TO_REGION, RateLimiter, pruneMatch } from '../src/riot.js';

test('PLATFORM_TO_REGION maps regions accurately', () => {
  assert.equal(PLATFORM_TO_REGION.la1, 'americas');
  assert.equal(PLATFORM_TO_REGION.la2, 'americas');
  assert.equal(PLATFORM_TO_REGION.na1, 'americas');
  assert.equal(PLATFORM_TO_REGION.euw1, 'europe');
  assert.equal(PLATFORM_TO_REGION.kr, 'asia');
});

test('pruneMatch strips redundant fields while preserving essential stats', () => {
  const raw = {
    metadata: { matchId: 'LA1_123', extraHeavy: { a: 1 } },
    info: {
      queueId: 420,
      gameDuration: 1500,
      gameEndTimestamp: 1600000000,
      gameCreation: 1599998500,
      unusedField: 'xyz',
      participants: [
        {
          puuid: 'p1',
          teamId: 100,
          teamPosition: 'MIDDLE',
          championName: 'Ahri',
          win: true,
          kills: 5,
          deaths: 1,
          assists: 4,
          heavyTimelineData: [1, 2, 3],
          challenges: {
            soloKills: 2,
            dragonTakedowns: 1,
            ignoredChallenge: 999,
          },
        },
      ],
    },
  };

  const pruned = pruneMatch(raw);
  assert.equal(pruned.metadata.matchId, 'LA1_123');
  assert.equal(pruned.metadata.extraHeavy, undefined);
  assert.equal(pruned.info.unusedField, undefined);
  assert.equal(pruned.info.participants[0].heavyTimelineData, undefined);
  assert.equal(pruned.info.participants[0].challenges.soloKills, 2);
  assert.equal(pruned.info.participants[0].challenges.ignoredChallenge, undefined);
});

test('RateLimiter respects sequential turns', async () => {
  const limiter = new RateLimiter([{ count: 3, perMs: 200 }]);
  const start = Date.now();
  await limiter.acquire();
  await limiter.acquire();
  await limiter.acquire();
  const t1 = Date.now() - start;
  assert.ok(t1 < 100, 'First 3 requests should be fast');

  await limiter.acquire();
  const t2 = Date.now() - start;
  assert.ok(t2 >= 180, `4th request should wait for window slot, waited ${t2}ms`);
});
