// The OP Score should stay close to OP.GG's real scores. The fixture holds 10 ranked games that were
// held out of training (calibration/make-fixture.js), stored the way the site saves them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scoreMatch } from '../src/score.js';
import { modelInfo } from '../src/opscore.js';

const games = JSON.parse(fs.readFileSync(new URL('./fixtures/opgg-games.json', import.meta.url), 'utf8'));

function errors() {
  const e = [];
  for (const { match, opgg } of games) {
    const scores = scoreMatch(match);
    for (const [puuid, real] of Object.entries(opgg)) e.push(Math.abs(scores.get(puuid).score - Math.round(real * 10) / 10));
  }
  return e.sort((a, b) => a - b);
}

test('OP Score matches OP.GG on games the model never saw', () => {
  const e = errors();
  const avg = e.reduce((a, b) => a + b, 0) / e.length;
  const within05 = e.filter((x) => x <= 0.5 + 1e-9).length / e.length;
  assert.equal(e.length, 100);
  assert.ok(avg <= 0.45, `average error ${avg.toFixed(2)} (OP.GG points)`);
  assert.ok(within05 >= 0.7, `${Math.round(within05 * 100)}% of players within 0.5`);
  assert.ok(e.at(-1) <= 2, `worst error ${e.at(-1)}`);
});

test('OP Score keeps OP.GG\'s shape: 0-10, winners above losers, the best player gets MVP', () => {
  for (const { match, opgg } of games) {
    const scores = scoreMatch(match);
    const ps = match.info.participants;
    for (const s of scores.values()) assert.ok(s.score >= 0 && s.score <= 10);
    const avg = (win) => ps.filter((p) => p.win === win).reduce((t, p) => t + scores.get(p.puuid).score, 0) / 5;
    assert.ok(avg(true) > avg(false), 'winning team scores higher on average');
    const mvp = ps.find((p) => scores.get(p.puuid).mvp);
    const best = ps.filter((p) => p.win).sort((a, b) => opgg[b.puuid] - opgg[a.puuid])[0];
    assert.ok(Math.abs(opgg[mvp.puuid] - opgg[best.puuid]) <= 1.5, 'our MVP was among the best on OP.GG too');
  }
});

test('the model records how it was trained and how accurate it is', () => {
  const info = modelInfo();
  assert.ok(info.trainedOn.games >= 100);
  assert.ok(info.heldOutError.avg <= 0.45);
});
