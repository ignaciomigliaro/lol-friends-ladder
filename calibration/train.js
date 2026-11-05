// Step 3: fit the OP Score model to OP.GG's scores and write src/opscore-model.json.
//
// Training uses every minute of every game (OP.GG's per-minute ratings) plus the final scores,
// which count 8x. Accuracy is first measured on games held out of training (every 5th game);
// then the model is refitted on all games and saved.
//
//   node calibration/make-fixture.js && node calibration/train.js
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CAL_DIR, RIOT_DIR, readJson } from './common.js';
import { minuteStates } from './timeline.js';
import { summaryState, features, runNet } from '../src/opscore.js';

const HIDDEN = 32;
const EPOCHS = 60;
const SEEDS = [1, 2, 3, 4, 5];
const FINAL_WEIGHT = 8;
const isRemake = (m) => m.info.gameDuration < 300 || m.info.participants.some((p) => p.gameEndedInEarlySurrender);

// ---------- data ----------
const opgg = new Map(readJson(path.join(CAL_DIR, 'opgg-games.json'), []).map((g) => [g.opggId, g]));
const games = [];
for (const { matchId, opggId } of readJson(path.join(CAL_DIR, 'linked.json'), [])) {
  const match = readJson(path.join(RIOT_DIR, `${matchId}.json`));
  const timeline = readJson(path.join(RIOT_DIR, `${matchId}.timeline.json`));
  const label = opgg.get(opggId);
  if (!match || !timeline || !label || isRemake(match)) continue;
  // OP.GG player <-> Riot player by champion + K/D/A.
  const byPuuid = new Map();
  for (const p of match.info.participants) {
    const o = label.players.find((x) => x.champ === p.championId && x.k === p.kills && x.d === p.deaths && x.a === p.assists);
    if (o) byPuuid.set(p.puuid, o);
  }
  if (byPuuid.size !== 10) continue;
  const rows = [];
  const minutes = minuteStates(match, timeline).slice(1, -1); // minute 0 is empty; the end comes from the summary
  for (const { second, states } of minutes) {
    for (const [puuid, x] of features(states, second / 60)) {
      const y = byPuuid.get(puuid).tl.find((q) => q[0] === second)?.[1];
      if (y !== undefined) rows.push({ x, y, final: false });
    }
  }
  for (const [puuid, x] of features(summaryState(match), match.info.gameDuration / 60)) {
    rows.push({ x, y: byPuuid.get(puuid).score, final: true });
  }
  games.push({ matchId, rows });
}
if (games.length < 20) throw new Error(`Only ${games.length} usable games; save more OP.GG history first.`);

// ---------- model ----------
function trainNet(rows, seed) {
  let r = seed;
  const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  const keys = Object.keys(rows[0].x);
  const D = keys.length;
  const mean = keys.map((k) => rows.reduce((s, row) => s + row.x[k], 0) / rows.length);
  const sd = keys.map((k, j) => Math.sqrt(rows.reduce((s, row) => s + (row.x[k] - mean[j]) ** 2, 0) / rows.length) || 1);
  const X = rows.map((row) => keys.map((k, j) => (row.x[k] - mean[j]) / sd[j]));
  const W1 = Array.from({ length: HIDDEN }, () => Array.from({ length: D }, () => ((rand() - 0.5) * 2) / Math.sqrt(D)));
  const b1 = new Array(HIDDEN).fill(0);
  const W2 = Array.from({ length: HIDDEN }, () => ((rand() - 0.5) * 2) / Math.sqrt(HIDDEN));
  let b2 = 5;
  // Adam optimizer with a little weight decay.
  const st = () => ({ m: 0, v: 0 });
  const sW1 = W1.map((row) => row.map(st)), sb1 = b1.map(st), sW2 = W2.map(st), sb2 = st();
  let t = 0;
  const step = (s, g, lr) => {
    s.m = 0.9 * s.m + 0.1 * g;
    s.v = 0.999 * s.v + 0.001 * g * g;
    return (lr * (s.m / (1 - 0.9 ** t))) / (Math.sqrt(s.v / (1 - 0.999 ** t)) + 1e-8);
  };
  const order = [...X.keys()];
  for (let ep = 0; ep < EPOCHS; ep++) {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const lr = ep < EPOCHS * 0.7 ? 0.003 : 0.0006;
    for (let s = 0; s < order.length; s += 64) {
      const gW1 = W1.map((row) => row.map(() => 0)), gb1 = new Array(HIDDEN).fill(0), gW2 = new Array(HIDDEN).fill(0);
      let gb2 = 0, wsum = 0;
      for (const n of order.slice(s, s + 64)) {
        const v = X[n];
        const h = W1.map((w, i) => Math.max(0, w.reduce((acc, wj, j) => acc + wj * v[j], b1[i])));
        const y = h.reduce((acc, hi, i) => acc + hi * W2[i], b2);
        const w = rows[n].final ? FINAL_WEIGHT : 1;
        const e = w * (y - rows[n].y);
        wsum += w;
        gb2 += e;
        for (let i = 0; i < HIDDEN; i++) {
          gW2[i] += e * h[i];
          if (h[i] > 0) { const g = e * W2[i]; gb1[i] += g; for (let j = 0; j < D; j++) gW1[i][j] += g * v[j]; }
        }
      }
      t++;
      for (let i = 0; i < HIDDEN; i++) {
        W2[i] -= step(sW2[i], gW2[i] / wsum + 1e-4 * W2[i], lr);
        b1[i] -= step(sb1[i], gb1[i] / wsum, lr);
        for (let j = 0; j < D; j++) W1[i][j] -= step(sW1[i][j], gW1[i][j] / wsum + 1e-4 * W1[i][j], lr);
      }
      b2 -= step(sb2, gb2 / wsum, lr);
    }
  }
  const r5 = (n) => Number(n.toPrecision(5));
  return { keys, mean: mean.map(r5), sd: sd.map(r5), W1: W1.map((row) => row.map(r5)), b1: b1.map(r5), W2: W2.map(r5), b2: r5(b2) };
}

const predict = (nets, x) => Math.max(0, Math.min(10, nets.reduce((s, net) => s + runNet(net, x), 0) / nets.length));
function errors(nets, gs) {
  const e = gs.flatMap((g) => g.rows.filter((r) => r.final).map((r) => Math.abs(Math.round(predict(nets, r.x) * 10) - Math.round(r.y * 10)) / 10));
  e.sort((a, b) => a - b);
  const pct = (lim) => Math.round((100 * e.filter((v) => v <= lim + 1e-9).length) / e.length);
  return {
    players: e.length,
    avg: Number((e.reduce((a, b) => a + b, 0) / e.length).toFixed(2)),
    median: e[e.length >> 1],
    p90: e[Math.floor(e.length * 0.9)],
    worst: e.at(-1),
    within01: pct(0.1),
    within03: pct(0.3),
    within05: pct(0.5),
  };
}
const show = (name, r) => console.log(`${name}: ${r.players} players | avg error ${r.avg} | median ${r.median} | 90% within ${r.p90} | worst ${r.worst} | within 0.1: ${r.within01}% | within 0.3: ${r.within03}% | within 0.5: ${r.within05}%`);

const test = games.filter((_, i) => i % 5 === 4);
const train = games.filter((_, i) => i % 5 !== 4);
console.log(`${games.length} games (${train.length} to learn from, ${test.length} held out).`);
const heldOut = errors(SEEDS.map((s) => trainNet(train.flatMap((g) => g.rows), s)), test);
show('Held-out games', heldOut);

// Final model: every game except the test fixture's (test/opscore.test.js checks those stay unseen).
const fixture = new Set(readJson(path.join(CAL_DIR, 'fixture-ids.json'), []));
const learn = games.filter((g) => !fixture.has(g.matchId));
const nets = SEEDS.map((s) => trainNet(learn.flatMap((g) => g.rows), s));
show(`Final model, ${learn.length} games it learned from`, errors(nets, learn));
if (fixture.size) show('Final model, test fixture games (unseen)', errors(nets, games.filter((g) => fixture.has(g.matchId))));
const model = { trainedOn: { games: learn.length, at: new Date().toISOString().slice(0, 10) }, heldOutError: heldOut, nets };
fs.writeFileSync(path.join(ROOT, 'src', 'opscore-model.json'), JSON.stringify(model));
console.log('Wrote src/opscore-model.json');
