// Guards the data the site depends on: lane opponents, ranked-only games, nicknames + roasts,
// weekly/season LP and real champion names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePlayer, attachDeltas, weekStart, renameChampions } from '../src/tracker.js';
import { assignNicknames } from '../src/nicknames.js';
import { match, account, soloEntry } from './helpers/fixtures.js';

const day = 24 * 60 * 60 * 1000;
const base = Date.parse('2026-10-20T20:00:00Z');

function player(puuid, name, games, statsGames = 15) {
  return summarizePlayer({
    friend: { name },
    account: account(puuid, name),
    summoner: { summonerLevel: 100, profileIconId: 1 },
    entries: [soloEntry()],
    matches: games,
    statsGames,
  });
}

test('summarizePlayer records the lane opponent of every game', () => {
  const p = player('me', 'Tester', [match({ id: 'm1', oppChamp: 'Zed', opp: { goldEarned: 14000, totalMinionsKilled: 220 } })]);
  const g = p.games[0];
  assert.equal(g.opp.champion, 'Zed');
  assert.equal(g.opp.gold, 14000);
  assert.equal(typeof g.opp.score, 'number');
  assert.ok(g.place >= 1 && g.place <= 10);
});

test('only Solo/Duo and Flex count; ARAM is ignored and remakes are tagged', () => {
  const p = player('me', 'Tester', [
    match({ id: 'solo', queueId: 420, win: true, endTs: base }),
    match({ id: 'remake', queueId: 420, minutes: 3, win: false, endTs: base - day }),
    match({ id: 'flex', queueId: 440, win: true, endTs: base - 2 * day }),
    match({ id: 'aram', queueId: 450, endTs: base - 3 * day }),
  ]);
  assert.deepEqual(p.games.map((g) => g.matchId), ['solo', 'remake', 'flex']);
  assert.equal(p.games.find((g) => g.matchId === 'remake').isRemake, true);
  assert.equal(p.stats.games, 2);
  assert.equal(p.stats.wins, 2);
  assert.equal(p.stats.streak, 2);
});

test('leaderboard stats use the recent games, profiles keep the full history', () => {
  const games = Array.from({ length: 20 }, (_, i) => match({ id: `g${i}`, endTs: base - i * day }));
  const p = player('me', 'Tester', games, 15);
  assert.equal(p.games.length, 20);
  assert.equal(p.stats.games, 15);
});

test('every player gets a unique nickname and a roast', () => {
  const styles = [
    { deaths: 12, kills: 1 }, { visionScore: 2 }, { totalMinionsKilled: 60 },
    { totalDamageDealtToChampions: 3000 }, { deaths: 1, kills: 12 }, { assists: 0, kills: 0 },
  ];
  const players = styles.map((me, i) => player(`p${i}`, `Friend${i}`,
    Array.from({ length: 8 }, (_, k) => match({ id: `p${i}-g${k}`, puuid: `p${i}`, endTs: Date.now() - (k + 1) * day, win: k % 2 === 0, me }))));
  assignNicknames(players);
  const titles = players.map((p) => p.nickname?.title);
  assert.ok(titles.every(Boolean), 'everyone has a nickname');
  assert.equal(new Set(titles).size, titles.length, 'no two players share a nickname');
  for (const p of players) {
    assert.ok(p.nickname.reason.length > 10);
    assert.ok(p.roast?.text.length > 150, `${p.name} has a full roast`);
  }
});

test('LP this week resets on Monday; season restarts when ranks reset', () => {
  const now = Date.parse('2026-11-04T17:00:00Z'); // Wednesday
  const monday = weekStart(now, { day: 'monday', timeZone: 'America/New_York' });
  const history = {
    me: [
      { t: monday - 10 * day, value: 1200, g: 300 }, // last season
      { t: monday - 5 * day, value: 900, g: 4 },     // ranks were reset (games dropped)
      { t: monday - 1 * day, value: 1000, g: 20 },   // last snapshot before Monday
      { t: now - 1000, value: 1080, g: 30 },
    ],
  };
  const p = { puuid: 'me', solo: { value: 1080 } };
  attachDeltas([p], history, now, monday, null);
  assert.equal(p.lpDelta.week, 80);
  assert.equal(p.lpDelta.season, 180);
});

test('champion ids become the names players know', () => {
  const players = [{
    games: [{ champion: 'MonkeyKing', opp: { champion: 'FiddleSticks' } }],
    topChampions: [{ champion: 'Chogath' }],
  }];
  const groupGames = [{ players: [{ champion: 'KSante' }] }];
  const list = [
    { id: 'MonkeyKing', name: 'Wukong' }, { id: 'Fiddlesticks', name: 'Fiddlesticks' },
    { id: 'Chogath', name: "Cho'Gath" }, { id: 'KSante', name: "K'Sante" },
  ];
  const ids = renameChampions(players, groupGames, list);
  assert.equal(players[0].games[0].champion, 'Wukong');
  assert.equal(players[0].games[0].opp.champion, 'Fiddlesticks');
  assert.equal(players[0].topChampions[0].champion, "Cho'Gath");
  assert.equal(groupGames[0].players[0].champion, "K'Sante");
  assert.equal(ids.Wukong, 'MonkeyKing', 'images still use the id');
});
