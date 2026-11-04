// The Worker answers the site's live-game check on GitHub Pages (there is no /api there).
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { liveGames } from '../worker/index.js';

const SITE = 'https://site.example/ladder';
const env = { SITE_URL: SITE, RIOT_API_KEY: 'test-key', ALLOWED_ORIGIN: 'https://site.example', REPO: 'me/repo' };
const board = {
  platform: 'la1',
  players: [
    { puuid: 'p1', name: 'Panda', riotId: 'Panda#JK23', platform: 'la1' },
    { puuid: 'p2', name: 'Gojo', riotId: 'Satoru Gojo#JK23', platform: 'la1' },
    { puuid: 'p3', name: 'Toji', riotId: 'Toji Fushiguro#JK23', platform: 'la1' },
  ],
};
const participant = (puuid, teamId, championId) => ({ puuid, teamId, championId, spell1Id: 4, spell2Id: 14, riotId: `${puuid}#X` });
const game = {
  gameId: 77, gameQueueConfigId: 420, gameMode: 'CLASSIC', gameStartTime: Date.now() - 12 * 60_000,
  participants: [participant('p1', 100, 62), participant('p2', 100, 103), participant('x1', 200, 238)],
  bannedChampions: [{ teamId: 200, championId: 157 }],
};

function fakeFetch(calls) {
  return async (url, init) => {
    const u = String(url);
    calls.push({ u, key: init?.headers?.['X-Riot-Token'] });
    const ok = (body) => new Response(JSON.stringify(body), { status: 200 });
    if (u.startsWith(`${SITE}/leaderboard.json`)) return ok(board);
    if (u.endsWith('versions.json')) return ok(['15.1.1']);
    if (u.endsWith('champion.json')) return ok({ data: { MonkeyKing: { id: 'MonkeyKing', key: '62' }, Ahri: { id: 'Ahri', key: '103' }, Zed: { id: 'Zed', key: '238' }, Yasuo: { id: 'Yasuo', key: '157' } } });
    if (u.includes('/spectator/v5/active-games/by-summoner/p3')) return new Response('', { status: 404 });
    if (u.includes('/spectator/v5/')) return ok(game);
    return new Response('', { status: 500 });
  };
}

test('live check groups friends in the same game and names the champions', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', fakeFetch(calls));
  const data = await liveGames(env, Date.now() + 10 * 60_000); // skip any cached answer
  assert.equal(data.inGame, true);
  assert.equal(data.activeCount, 2);
  assert.equal(data.games.length, 1);
  const g = data.games[0];
  assert.equal(g.queue, 'Ranked Solo/Duo');
  assert.equal(g.isDuo, true);
  assert.deepEqual(g.friends.map((f) => f.champion).sort(), ['Ahri', 'MonkeyKing']);
  assert.equal(g.teams.red[0].champion, 'Zed');
  assert.equal(g.teams.red[0].isFriend, false);
  assert.equal(g.bans.red[0].champion, 'Yasuo');
  assert.ok(calls.filter((c) => c.u.includes('spectator')).every((c) => c.key === 'test-key'), 'Riot key is sent');
});

test('GET /live answers with CORS for the site, and explains a missing key', async (t) => {
  t.mock.method(globalThis, 'fetch', fakeFetch([]));
  const res = await worker.fetch(new Request('https://w.example/live'), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://site.example');
  assert.equal(typeof (await res.json()).inGame, 'boolean');

  const noKey = await worker.fetch(new Request('https://w.example/live'), { ...env, RIOT_API_KEY: '' });
  assert.equal(noKey.status, 503);
});
