import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoast, worstGame } from '../src/roast.js';

const NOW = Date.parse('2026-11-03T12:00:00Z');
const day = 24 * 60 * 60 * 1000;

// A summarized game, the shape tracker.js stores in player.games.
const game = (o = {}) => ({
  matchId: 'LA1_1', queueId: 420, endTs: NOW - 2 * day, minutes: 30, champion: 'Ahri', position: 'MIDDLE',
  win: false, kills: 2, deaths: 9, assists: 3, cs: 150, vision: 10, kp: 0.3, dmgShare: 0.12,
  deadPct: 0.2, damage: 12000, objectives: 2000, gold: 8000, score: 2.4, place: 10, mvp: false, ace: false,
  opp: { champion: 'Zed', score: 9.5, kills: 10, deaths: 2, assists: 4, cs: 230, damage: 30000, objectives: 6000, vision: 20, gold: 13000, kp: 0.7 },
  ...o,
});

test('worstGame picks the lowest score, breaking ties by deaths', () => {
  const p = { games: [game({ matchId: 'a', score: 4 }), game({ matchId: 'b', score: 2, deaths: 3 }), game({ matchId: 'c', score: 2, deaths: 8 })] };
  assert.equal(worstGame(p, NOW).matchId, 'c');
});

test('worstGame prefers the last 30 days when there are enough games', () => {
  const old = game({ matchId: 'old', score: 0.5, endTs: NOW - 60 * day });
  const recent = [1, 2, 3].map((i) => game({ matchId: `r${i}`, score: 3 + i }));
  assert.equal(worstGame({ games: [old, ...recent] }, NOW).matchId, 'r1');
});

test('buildRoast is built from the facts of that game', () => {
  const r = buildRoast({ name: 'Tester', games: [game()] }, NOW);
  assert.equal(r.matchId, 'LA1_1');
  assert.equal(r.champion, 'Ahri');
  assert.equal(r.opponent, 'Zed');
  assert.equal(r.kda, '2/9/3');
  assert.match(r.text, /Ahri/);
  assert.match(r.text, /Zed/);
  assert.ok(r.text.length > 150, 'a roast is a paragraph, not a one-liner');
});

test('buildRoast is stable between refreshes (same game, same words)', () => {
  const p = { games: [game()] };
  assert.equal(buildRoast(p, NOW).text, buildRoast(p, NOW).text);
});

test('roasts in one group never repeat a phrasing', () => {
  const used = new Set();
  const champs = ['Ahri', 'Lux', 'Jinx', 'Garen', 'Vi', 'Braum'];
  const roasts = champs.map((c, i) => buildRoast({ games: [game({ matchId: `LA1_${i}`, champion: c, opp: { ...game().opp, champion: `Opp${i}` } })] }, NOW, used));
  const norm = (text, r) => text.split(r.champion).join('@').split(r.opponent).join('@')
    .replace(/[0-9]+([.,][0-9]+)?k?/g, '#').replace(/ de (octubre|noviembre)/g, '');
  const sentences = roasts.flatMap((r) => norm(r.text, r).split(/(?<=[.!]) (?=[A-ZÁÉÍÓÚ0-9@#¿¡])/))
    .filter((s) => s.length > 14 && !/^Derrota/.test(s));
  const repeated = sentences.filter((s, i) => sentences.indexOf(s) !== i);
  assert.deepEqual(repeated, []);
});

test('buildRoast handles a player without games', () => {
  assert.equal(buildRoast({ games: [] }, NOW), null);
});
