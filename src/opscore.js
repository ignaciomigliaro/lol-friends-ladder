// OP Score: a small neural network fitted to OP.GG's real scores (see calibration/README.md).
//
// OP.GG re-rates every player each minute from the state of the game so far; the final score is
// the last of those ratings. Each player's state is described relative to their team, their lane
// opponent and the lobby, and the model turns that into a 0-10 score.
// The same features are built from a match's per-minute timeline (for training) and from the
// end-of-game summary (what the site downloads), so both produce the same numbers.

import fs from 'node:fs';

let cached = null;
const model = () => (cached ??= JSON.parse(fs.readFileSync(new URL('./opscore-model.json', import.meta.url), 'utf8')));

// End-of-game state of every player, from Riot's match summary. Map<puuid, state>
export function summaryState(match) {
  const teams = match.info.teams ?? [];
  const team = (id) => teams.find((t) => t.teamId === id)?.objectives ?? {};
  const states = new Map();
  for (const p of match.info.participants) {
    const o = team(p.teamId);
    states.set(p.puuid, {
      teamId: p.teamId,
      pos: p.teamPosition || 'MIDDLE',
      k: p.kills ?? 0,
      d: p.deaths ?? 0,
      a: p.assists ?? 0,
      gold: p.goldEarned ?? 0,
      xp: p.champExperience ?? 0,
      level: p.champLevel ?? 1,
      cs: (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0),
      dmg: p.totalDamageDealtToChampions ?? 0,
      taken: p.totalDamageTaken ?? 0,
      wards: p.wardsPlaced ?? 0,
      wardKills: p.wardsKilled ?? 0,
      towers: p.turretTakedowns ?? 0,
      plates: p.challenges?.turretPlatesTaken ?? 0,
      obj: (p.dragonKills ?? 0) + 2 * (p.baronKills ?? 0),
      tTowers: o.tower?.kills ?? 0,
      tObj: (o.dragon?.kills ?? 0) + 2 * (o.baron?.kills ?? 0) + (o.riftHerald?.kills ?? 0),
      win: p.win ? 1 : 0,
    });
  }
  return states;
}

// Model inputs for every player. states: Map<id, state>; minutes: game time so far.
export function features(states, minutes) {
  const list = [...states.values()];
  const sum = (arr, k) => arr.reduce((s, v) => s + v[k], 0);
  const m = Math.max(1, minutes);
  const out = new Map();
  for (const [id, v] of states) {
    const mates = list.filter((x) => x.teamId === v.teamId);
    const foes = list.filter((x) => x.teamId !== v.teamId);
    const opp = foes.find((x) => x.pos === v.pos) ?? v;
    const tk = Math.max(1, sum(mates, 'k'));
    const ek = sum(foes, 'k');
    const lobby = (k) => Math.max(1, sum(list, k) / list.length);
    const sup = v.pos === 'UTILITY' ? 1 : 0;
    out.set(id, {
      kda: Math.log((v.k + v.a + 1) / (v.d + 1)),
      k: (v.k / m) * 10,
      d: (v.d / m) * 10,
      a: (v.a / m) * 10,
      kp: (v.k + v.a) / tk,
      deathShare: v.d / Math.max(1, ek),
      gold: v.gold / lobby('gold'),
      xp: v.xp / lobby('xp'),
      cs: sup ? 0 : v.cs / lobby('cs'),
      dmg: v.dmg / lobby('dmg'),
      taken: v.taken / lobby('taken'),
      goldOpp: (v.gold - opp.gold) / 1000 / Math.sqrt(m),
      xpOpp: (v.xp - opp.xp) / 1000 / Math.sqrt(m),
      csOpp: sup ? 0 : (v.cs - opp.cs) / 10 / Math.sqrt(m),
      dmgOpp: (v.dmg - opp.dmg) / 1000 / Math.sqrt(m),
      wards: v.wards / m,
      wardKills: v.wardKills / m,
      towers: v.towers,
      plates: v.plates,
      obj: v.obj,
      teamGold: (sum(mates, 'gold') - sum(foes, 'gold')) / 1000 / Math.sqrt(m),
      teamKills: (tk - ek) / 5,
      teamTowers: v.tTowers,
      oppKda: Math.log((opp.k + opp.a + 1) / (opp.d + 1)),
      oppD: (opp.d / m) * 10,
      teamDeaths: sum(mates, 'd') / m,
      foeDeaths: sum(foes, 'd') / m,
      goldTeamShare: v.gold / Math.max(1, sum(mates, 'gold')),
      dmgTeamShare: v.dmg / Math.max(1, sum(mates, 'dmg')),
      takenTeamShare: v.taken / Math.max(1, sum(mates, 'taken')),
      levelOpp: v.level - opp.level,
      teamGoldRaw: (sum(mates, 'gold') - sum(foes, 'gold')) / 10000,
      towerDiff: v.tTowers - (foes[0]?.tTowers ?? 0),
      objDiff: v.tObj - (foes[0]?.tObj ?? 0),
      kRel: v.k / Math.max(1, sum(list, 'k') / list.length),
      dRel: v.d / Math.max(1, sum(list, 'd') / list.length),
      aRel: v.a / Math.max(1, sum(list, 'a') / list.length),
      sup,
      jg: v.pos === 'JUNGLE' ? 1 : 0,
      top: v.pos === 'TOP' ? 1 : 0,
      adc: v.pos === 'BOTTOM' ? 1 : 0,
      minutes: m / 30,
      win: v.win ?? 0.5, // mid-game minutes don't know the result yet
      end: v.win === undefined ? 0 : 1,
    });
  }
  return out;
}

// One network: inputs are standardized, one hidden ReLU layer, linear output.
export function runNet(net, x) {
  const v = net.keys.map((k, j) => (x[k] - net.mean[j]) / net.sd[j]);
  let y = net.b2;
  for (let i = 0; i < net.W1.length; i++) {
    let h = net.b1[i];
    const w = net.W1[i];
    for (let j = 0; j < v.length; j++) h += w[j] * v[j];
    if (h > 0) y += h * net.W2[i];
  }
  return y;
}

// Average of the ensemble, clamped to OP.GG's 0-10 range.
export function opScore(x, { nets } = model()) {
  const y = nets.reduce((s, net) => s + runNet(net, x), 0) / nets.length;
  return Math.max(0, Math.min(10, y));
}

// Map<puuid, unrounded score> for a finished match.
export function opScores(match) {
  const x = features(summaryState(match), match.info.gameDuration / 60);
  return new Map([...x].map(([puuid, f]) => [puuid, opScore(f)]));
}

export const modelInfo = () => ({ trainedOn: model().trainedOn, heldOutError: model().heldOutError });
