import test from 'node:test';
import assert from 'node:assert/strict';
import { computeGroupMeta } from '../src/meta.js';

test('computeGroupMeta calculates godTier, cursedTier, and roleMeta correctly', () => {
  const mockPlayers = [
    {
      name: 'Panda',
      games: [
        { champion: 'Ahri', win: true, kills: 10, deaths: 2, assists: 8, damage: 25000, position: 'MIDDLE' },
        { champion: 'Ahri', win: true, kills: 8, deaths: 1, assists: 11, damage: 22000, position: 'MIDDLE' },
        { champion: 'Ahri', win: true, kills: 12, deaths: 3, assists: 6, damage: 30000, position: 'MIDDLE' },
        { champion: 'Yasuo', win: false, kills: 2, deaths: 11, assists: 1, damage: 12000, position: 'MIDDLE' },
        { champion: 'Yasuo', win: false, kills: 1, deaths: 9, assists: 2, damage: 10000, position: 'MIDDLE' },
        { champion: 'Yasuo', win: false, kills: 3, deaths: 12, assists: 0, damage: 14000, position: 'MIDDLE' },
      ],
    },
    {
      name: 'ChubbyKop',
      games: [
        { champion: 'Ahri', win: false, kills: 4, deaths: 4, assists: 5, damage: 18000, position: 'MIDDLE' },
        { champion: 'Malphite', win: true, kills: 5, deaths: 2, assists: 10, damage: 19000, position: 'TOP' },
      ],
    },
  ];

  const meta = computeGroupMeta(mockPlayers);

  assert.equal(meta.totalUniqueChampions, 3);

  // Ahri: 4 games, 3 wins = 75% WR (God tier)
  const ahri = meta.champions.find((c) => c.champion === 'Ahri');
  assert.ok(ahri);
  assert.equal(ahri.games, 4);
  assert.equal(ahri.wins, 3);
  assert.equal(ahri.winrate, 75);
  assert.equal(ahri.topPlayer, 'Panda');
  assert.equal(ahri.topPlayerGames, 3);

  // Yasuo: 3 games, 0 wins = 0% WR (Cursed tier)
  const yasuo = meta.champions.find((c) => c.champion === 'Yasuo');
  assert.ok(yasuo);
  assert.equal(yasuo.games, 3);
  assert.equal(yasuo.winrate, 0);

  // Check God Tier and Cursed Tier inclusions
  assert.ok(meta.godTier.some((c) => c.champion === 'Ahri'));
  assert.ok(meta.cursedTier.some((c) => c.champion === 'Yasuo'));

  // Role Meta
  assert.ok(meta.roleMeta.MIDDLE);
  assert.equal(meta.roleMeta.MIDDLE.specialist, 'Panda');
  assert.ok(meta.roleMeta.TOP);
  assert.equal(meta.roleMeta.TOP.specialist, 'ChubbyKop');
});
