// OP.GG-style per-game performance score (0-10).
//
// OP.GG's real "OP Score" formula is not public, so this is an approximation built
// on the same idea: every player is rated *relative to the other 9 players in that
// same match*, with role-aware weights (a support isn't punished for low CS, a
// jungler gets credit for objectives, etc.). The best player in the game gets 10,
// MVP = best on the winning team, ACE = best on the losing team.

const WEIGHTS = {
  TOP:     { kda: 0.20, kp: 0.12, dmg: 0.18, gold: 0.10, cs: 0.12, vision: 0.05, tank: 0.13, obj: 0.10 },
  JUNGLE:  { kda: 0.20, kp: 0.20, dmg: 0.14, gold: 0.09, cs: 0.07, vision: 0.10, tank: 0.08, obj: 0.12 },
  MIDDLE:  { kda: 0.22, kp: 0.15, dmg: 0.22, gold: 0.11, cs: 0.12, vision: 0.05, tank: 0.05, obj: 0.08 },
  BOTTOM:  { kda: 0.22, kp: 0.14, dmg: 0.24, gold: 0.12, cs: 0.13, vision: 0.04, tank: 0.03, obj: 0.08 },
  UTILITY: { kda: 0.22, kp: 0.25, dmg: 0.10, gold: 0.04, cs: 0.00, vision: 0.24, tank: 0.10, obj: 0.05 },
  DEFAULT: { kda: 0.22, kp: 0.15, dmg: 0.20, gold: 0.10, cs: 0.10, vision: 0.06, tank: 0.07, obj: 0.10 },
};
const WIN_BONUS = 0.06;
const KDA_CAP = 12;

export function isRemake(match) {
  const info = match.info;
  return info.gameDuration < 300 || info.participants.some((p) => p.gameEndedInEarlySurrender);
}

function sumBy(list, fn) {
  return list.reduce((acc, x) => acc + fn(x), 0);
}

// Returns Map<puuid, { score, place, mvp, ace }>
export function scoreMatch(match) {
  const ps = match.info.participants;
  const minutes = Math.max(1, match.info.gameDuration / 60);

  const team = {};
  for (const teamId of new Set(ps.map((p) => p.teamId))) {
    const mates = ps.filter((p) => p.teamId === teamId);
    team[teamId] = {
      kills: Math.max(1, sumBy(mates, (p) => p.kills)),
      dmg: Math.max(1, sumBy(mates, (p) => p.totalDamageDealtToChampions)),
      tank: Math.max(1, sumBy(mates, (p) => p.totalDamageTaken + p.damageSelfMitigated)),
      obj: Math.max(1, sumBy(mates, (p) => p.damageDealtToObjectives)),
    };
  }

  const metrics = ps.map((p) => {
    const t = team[p.teamId];
    return {
      kda: Math.min(KDA_CAP, (p.kills + p.assists) / Math.max(1, p.deaths)),
      kp: (p.kills + p.assists) / t.kills,
      dmg: p.totalDamageDealtToChampions / t.dmg,
      gold: p.goldEarned / minutes,
      cs: (p.totalMinionsKilled + p.neutralMinionsKilled) / minutes,
      vision: p.visionScore / minutes,
      tank: (p.totalDamageTaken + p.damageSelfMitigated) / t.tank,
      obj: p.damageDealtToObjectives / t.obj,
    };
  });

  const keys = Object.keys(WEIGHTS.DEFAULT);
  const max = Object.fromEntries(keys.map((k) => [k, Math.max(1e-9, ...metrics.map((m) => m[k]))]));

  const raw = ps.map((p, i) => {
    const w = WEIGHTS[p.teamPosition] ?? WEIGHTS.DEFAULT;
    let r = keys.reduce((acc, k) => acc + w[k] * (metrics[i][k] / max[k]), 0);
    if (p.win) r += WIN_BONUS;
    return r;
  });

  // Blend "share of the best performance" with a min-max spread so scores use the
  // whole 0-10 range like OP.GG instead of bunching up between 6 and 10.
  const hi = Math.max(...raw);
  const lo = Math.min(...raw);
  const scores = raw.map((r) => 10 * (0.5 * (r / hi) + 0.5 * ((r - lo) / (hi - lo || 1))));

  const order = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]);
  const bestOf = (win) => order.find((i) => ps[i].win === win);
  const mvp = bestOf(true);
  const ace = bestOf(false);

  const result = new Map();
  order.forEach((i, place) => {
    result.set(ps[i].puuid, {
      score: Math.round(scores[i] * 10) / 10,
      place: place + 1,
      mvp: i === mvp,
      ace: i === ace,
    });
  });
  return result;
}
