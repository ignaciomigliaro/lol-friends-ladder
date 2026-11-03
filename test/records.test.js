import test from 'node:test';
import assert from 'node:assert/strict';
import { computeGroupRecords } from '../src/records.js';

test('computeGroupRecords calculates max records and totals correctly', () => {
  const mockPlayers = [
    {
      name: 'PoroKing',
      puuid: 'puuid-1',
      riotId: 'PoroKing#LAN',
      stats: { mvp: 4, winrate: 60, avgScore: 7.5, games: 10 },
      lpDelta: { week: 45 },
      games: [
        {
          matchId: 'M1',
          champion: 'Ahri',
          damage: 35000,
          kills: 12,
          deaths: 2,
          assists: 8,
          vision: 25,
          gold: 15000,
          cs: 220,
          soloKills: 3,
          minutes: 32,
          win: true,
          position: 'MIDDLE',
          endTs: 1000,
        },
        {
          matchId: 'M2',
          champion: 'Jinx',
          damage: 50000,
          kills: 18,
          deaths: 14,
          assists: 5,
          vision: 15,
          gold: 19000,
          cs: 310,
          soloKills: 2,
          minutes: 40,
          win: false,
          position: 'BOTTOM',
          endTs: 2000,
        },
      ],
    },
    {
      name: 'BraumGod',
      puuid: 'puuid-2',
      riotId: 'BraumGod#LAN',
      stats: { mvp: 1, winrate: 70, avgScore: 8.0, games: 8 },
      lpDelta: { week: 60 },
      games: [
        {
          matchId: 'M3',
          champion: 'Braum',
          damage: 8000,
          kills: 1,
          deaths: 3,
          assists: 26,
          vision: 85,
          gold: 11000,
          cs: 45,
          soloKills: 0,
          minutes: 35,
          win: true,
          position: 'UTILITY',
          endTs: 3000,
        },
      ],
    },
  ];

  const records = computeGroupRecords(mockPlayers);

  assert.equal(records.maxDamage.value, 50000);
  assert.equal(records.maxDamage.player, 'PoroKing');
  assert.equal(records.maxDamage.champion, 'Jinx');

  assert.equal(records.maxKills.value, 18);
  assert.equal(records.maxDeaths.value, 14);
  assert.equal(records.maxDeaths.player, 'PoroKing');

  assert.equal(records.maxAssists.value, 26);
  assert.equal(records.maxAssists.player, 'BraumGod');
  assert.equal(records.maxAssists.champion, 'Braum');

  assert.equal(records.maxVision.value, 85);
  assert.equal(records.maxVision.player, 'BraumGod');

  assert.equal(records.maxCs.value, 310);
  assert.equal(records.maxGold.value, 19000);
  assert.equal(records.longestGame.value, 40);

  assert.equal(records.mostMvp.player, 'PoroKing');
  assert.equal(records.mostMvp.value, 4);

  assert.equal(records.highestWinrate.player, 'BraumGod');
  assert.equal(records.highestWinrate.value, 70);

  assert.equal(records.highestWeeklyLp.player, 'BraumGod');
  assert.equal(records.highestWeeklyLp.value, 60);

  assert.equal(records.totals.totalGames, 3);
  assert.equal(records.totals.totalWins, 2);
  assert.equal(records.totals.winrate, 67);
  assert.equal(records.totals.totalKills, 31);
  assert.equal(records.totals.totalDeaths, 19);
  assert.equal(records.totals.totalAssists, 39);
  assert.equal(records.totals.totalDamage, 93000);
});
