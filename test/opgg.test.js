import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpggMatches, applyOpggScores } from '../src/opgg.js';
import { summarizePlayer } from '../src/tracker.js';

const SAMPLE = 'Games([GameHistory("abc","2026-11-05T10:00:00+09:00",1820,[Participant("Kai\'Sa",Stats(12,3,7,"WIN",8.42,1))]),'
  + 'GameHistory("def","2026-11-05T11:00:00+09:00",1500,[Participant("Leona",Stats(1,9,6,"LOSE",2.1,10))]),'
  + 'GameHistory("ghi","2026-11-05T12:00:00+09:00",200,[Participant("Ahri",Stats(0,0,0,"LOSE",None,None))])])';

const game = (o) => ({ matchId: 'm', champion: 'KaiSa', kills: 12, deaths: 3, assists: 7, minutes: 30, win: true,
  isRemake: false, score: 6.5, place: 3, mvp: false, ace: false, mochila: false, ...o });

test('reads OP.GG games, including ones it did not score', () => {
  const m = parseOpggMatches(SAMPLE);
  assert.equal(m.length, 3);
  assert.deepEqual(m[0], { createdAt: '2026-11-05T10:00:00+09:00', duration: 1820, champion: "Kai'Sa", kills: 12, deaths: 3, assists: 7, result: 'WIN', opScore: 8.42, opScoreRank: 1 });
  assert.equal(m[2].opScore, null);
  assert.deepEqual(parseOpggMatches(''), []);
});

test('OP.GG score replaces the estimate; rank 1 on the winning team is MVP', () => {
  const g = game();
  assert.equal(applyOpggScores([g], parseOpggMatches(SAMPLE)), 1);
  assert.equal(g.score, 8.4);
  assert.equal(g.place, 1);
  assert.equal(g.mvp, true);
  assert.equal(g.scoreSource, 'opgg');
});

test('a game that differs in K/D/A, champion or length keeps the estimate', () => {
  const games = [game({ kills: 11 }), game({ champion: 'Ahri' }), game({ minutes: 25 }), game({ isRemake: true })];
  assert.equal(applyOpggScores(games, parseOpggMatches(SAMPLE)), 0);
  for (const g of games) assert.equal(g.score, 6.5);
});

test('ACE is kept from the site unless OP.GG ranks the loser first overall', () => {
  const loser = game({ champion: 'Leona', kills: 1, deaths: 9, assists: 6, minutes: 25, win: false, ace: false, mochila: true });
  applyOpggScores([loser], parseOpggMatches(SAMPLE));
  assert.equal(loser.place, 10);
  assert.equal(loser.ace, false);
  assert.equal(loser.mochila, true);

  const best = game({ win: false, ace: false });
  applyOpggScores([best], [{ champion: "Kai'Sa", kills: 12, deaths: 3, assists: 7, duration: 1800, opScore: 9.1, opScoreRank: 1 }]);
  assert.equal(best.ace, true);
  assert.equal(best.mvp, false);
});

test('player averages use OP.GG scores when they are available', () => {
  const participant = (puuid, teamId, win, extra = {}) => ({
    puuid, teamId, win, championName: 'Ahri', teamPosition: 'MIDDLE', kills: 5, deaths: 5, assists: 5,
    totalMinionsKilled: 150, neutralMinionsKilled: 0, goldEarned: 10000, totalDamageDealtToChampions: 15000,
    totalDamageTaken: 15000, visionScore: 20, champLevel: 14, champExperience: 12000, ...extra,
  });
  const ps = [participant('me', 100, true, { kills: 9, deaths: 2, assists: 8 })];
  for (let i = 1; i < 5; i++) ps.push(participant(`a${i}`, 100, true, { teamPosition: ['TOP', 'JUNGLE', 'BOTTOM', 'UTILITY'][i - 1] }));
  for (let i = 0; i < 5; i++) ps.push(participant(`e${i}`, 200, false, { teamPosition: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'][i] }));
  const match = { metadata: { matchId: 'LA1_1' }, info: { queueId: 420, gameDuration: 1800, gameEndTimestamp: Date.now(), participants: ps, teams: [] } };
  const base = { friend: { riotId: 'Me#1' }, account: { puuid: 'me', gameName: 'Me', tagLine: '1' }, summoner: null, entries: [], matches: [match] };

  const estimate = summarizePlayer(base);
  const exact = summarizePlayer({ ...base, opgg: [{ champion: 'Ahri', kills: 9, deaths: 2, assists: 8, duration: 1800, opScore: 9.73, opScoreRank: 1 }] });
  assert.notEqual(estimate.stats.avgScore, 9.7);
  assert.equal(exact.stats.avgScore, 9.7);
  assert.equal(exact.stats.mvp, 1);
  assert.equal(exact.games[0].scoreSource, 'opgg');

  const kept = summarizePlayer({ ...base, exact: new Map([['LA1_1', { score: 7.7, place: 2 }]]) });
  assert.equal(kept.stats.avgScore, 7.7);
});
