import test from 'node:test';
import assert from 'node:assert/strict';
import { gameLp, recordHistory, attachGameLp, flexKey } from '../src/tracker.js';

const game = (endTs, win, o = {}) => ({ matchId: `m${endTs}`, queueId: 420, endTs, win, isRemake: false, ...o });

test('one game between two rank snapshots gets their LP difference', () => {
  const g = game(150, true);
  const snaps = [{ t: 100, value: 1800, g: 10 }, { t: 200, value: 1821, g: 11 }];
  assert.equal(gameLp(g, snaps, [g]), 21);
  const l = game(150, false);
  assert.equal(gameLp(l, [{ t: 100, value: 1821, g: 11 }, { t: 200, value: 1802, g: 12 }], [l]), -19);
});

test('two games between snapshots: no LP for either', () => {
  const a = game(140, true), b = game(160, true);
  const snaps = [{ t: 100, value: 1800, g: 10 }, { t: 200, value: 1840, g: 12 }];
  assert.equal(gameLp(a, snaps, [a, b]), null);
  assert.equal(gameLp(b, snaps, [a, b]), null);
});

test('a snapshot taken before Riot updated the rank is skipped', () => {
  const g = game(150, true);
  const snaps = [{ t: 100, value: 1800, g: 10 }, { t: 151, value: 1800, g: 10 }, { t: 200, value: 1820, g: 11 }];
  assert.equal(gameLp(g, snaps, [g]), 20);
});

test('promotions count through the tier change; a sign that does not match is ignored', () => {
  const g = game(150, true);
  assert.equal(gameLp(g, [{ t: 100, value: 1890, g: 10 }, { t: 200, value: 1910, g: 11 }], [g]), 20);
  assert.equal(gameLp(g, [{ t: 100, value: 1890, g: 10 }, { t: 200, value: 1870, g: 11 }], [g]), null);
});

test('remakes, other queues and games before tracking get nothing', () => {
  const snaps = [{ t: 100, value: 1800, g: 10 }, { t: 200, value: 1820, g: 11 }];
  assert.equal(gameLp(game(150, true, { isRemake: true }), snaps, []), null);
  assert.equal(gameLp(game(50, true), snaps, [game(50, true)]), null);
  const flex = game(150, true, { queueId: 440 });
  const solo = game(150, true);
  assert.equal(gameLp(solo, snaps, [solo, flex]), 20, 'a Flex game in between does not block a Solo/Duo one');
});

test('Flex LP is recorded separately and given to Flex games', () => {
  const history = {};
  const p = (wins, value) => ({ puuid: 'p', solo: null, flex: { wins, losses: 5, value, label: 'x' }, games: [] });
  recordHistory(history, [p(5, 1500)], 100);
  recordHistory(history, [p(6, 1522)], 200);
  assert.equal(history.p, undefined);
  assert.equal(history[flexKey('p')].length, 2);
  const player = { puuid: 'p', games: [game(150, true, { queueId: 440 })] };
  attachGameLp([player], history);
  assert.equal(player.games[0].lp, 22);
});
