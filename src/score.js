// OP.GG-calibrated per-game performance score (0-10) with role-adaptive weighting.
//
// Evaluates performance dynamically based on position:
// - UTILITY (Support): High weight on Vision, Kill Participation, KDA; low penalty for CS.
// - JUNGLE: High weight on Objectives, KP, and DPM.
// - BOTTOM (ADC): Heavy emphasis on DPM, CS/min, and KDA.
// - MIDDLE: Roam presence (KP), DPM, CS/min, and lane differential.
// - TOP: Splitpush/Objectives, lane differential vs opponent, CS/min, and survivability.
//
// Features:
// - Lane Opponent Delta (dmgVsOpp): Rewards outperforming your direct counterpart.
// - MVP awarded to the best performer on the winning team.
// - ACE awarded to the best performer on the losing team.

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

  const oppMap = new Map();
  for (const p of ps) {
    if (p.teamPosition) {
      const opp = ps.find((o) => o.teamId !== p.teamId && o.teamPosition === p.teamPosition);
      if (opp) oppMap.set(p.puuid, opp);
    }
  }

  const rawScores = ps.map((p) => {
    const t = team[p.teamId];
    const role = p.teamPosition || 'MIDDLE';

    // 1. KDA Score (0-10)
    const kdaRatio = (p.kills + p.assists) / Math.max(1, p.deaths);
    const kdaScore = Math.min(10.0, kdaRatio * 1.8);

    // 2. Kill Participation Score (0-10)
    const kp = (p.kills + p.assists) / t.kills;
    const kpScore = Math.min(10.0, (kp / 0.70) * 10.0);

    // 3. Daño al equipo y ventaja contra el rival directo de línea (dmgVsOpp)
    const dmgShare = p.totalDamageDealtToChampions / t.dmg;
    const opp = oppMap.get(p.puuid);
    const dmgVsOpp = opp ? (p.totalDamageDealtToChampions - opp.totalDamageDealtToChampions) / t.dmg : 0;

    let expectedDmgShare = 0.25;
    if (role === 'UTILITY') expectedDmgShare = 0.10;
    else if (role === 'JUNGLE') expectedDmgShare = 0.20;
    else if (role === 'BOTTOM') expectedDmgShare = 0.28;

    const baseDmgScore = (dmgShare / expectedDmgShare) * 6.5;
    const dmgScore = Math.max(0.0, Math.min(10.0, baseDmgScore + (dmgVsOpp * 5.0)));

    // 4. Farmeo (CS por minuto)
    const csTotal = p.totalMinionsKilled + p.neutralMinionsKilled;
    const csMin = csTotal / minutes;
    let csScore = 5.0;
    if (role === 'UTILITY') {
      csScore = 5.0; // Los soportes no son penalizados por no farmear
    } else if (role === 'JUNGLE') {
      csScore = Math.min(10.0, (csMin / 6.5) * 8.5);
    } else {
      csScore = Math.min(10.0, (csMin / 8.5) * 8.5);
    }

    // 5. Visión por minuto
    const visMin = p.visionScore / minutes;
    let visionScore = 5.0;
    if (role === 'UTILITY') {
      visionScore = Math.min(10.0, (visMin / 2.0) * 8.5);
    } else {
      visionScore = Math.min(10.0, (visMin / 0.8) * 8.0);
    }

    // 6. Daño a objetivos
    const objShare = t.obj > 0 ? p.damageDealtToObjectives / t.obj : 0;
    const objScore = Math.min(10.0, objShare * 15.0);

    // Ponderación dinámica según el rol
    let score = 0;
    if (role === 'UTILITY') {
      score =
        (visionScore * 0.30) +
        (kpScore * 0.30) +
        (kdaScore * 0.20) +
        (dmgScore * 0.10) +
        (objScore * 0.10);
    } else if (role === 'JUNGLE') {
      score =
        (objScore * 0.25) +
        (kpScore * 0.25) +
        (dmgScore * 0.20) +
        (kdaScore * 0.15) +
        (csScore * 0.10) +
        (visionScore * 0.05);
    } else if (role === 'BOTTOM') {
      score =
        (dmgScore * 0.35) +
        (csScore * 0.25) +
        (kdaScore * 0.20) +
        (kpScore * 0.10) +
        (objScore * 0.10);
    } else if (role === 'MIDDLE') {
      score =
        (dmgScore * 0.30) +
        (csScore * 0.25) +
        (kdaScore * 0.20) +
        (kpScore * 0.15) +
        (objScore * 0.10);
    } else {
      // TOP (o default)
      score =
        (dmgScore * 0.25) +
        (csScore * 0.25) +
        (kdaScore * 0.20) +
        (objScore * 0.20) +
        (kpScore * 0.10);
    }

    // Penalización por muertes excesivas (feeding / muertes repetitivas)
    const deaths = p.deaths ?? 0;
    const deathThreshold = role === 'UTILITY' ? 8 : 6;
    const deathPenalty = deaths > deathThreshold ? Math.min(1.5, (deaths - deathThreshold) * 0.15) : 0;
    score -= deathPenalty;

    // Modificador de victoria / derrota
    score += p.win ? 0.5 : -0.5;

    return Math.max(0.5, Math.min(10.0, score));
  });

  const scores = rawScores.map((s) => Math.round(s * 10) / 10);

  // Ordenamiento global de rendimiento (1° a 10°) con desempates competitivos deterministas
  const order = scores.map((s, i) => i).sort((a, b) => {
    // 1. Puntuación redondeada
    if (scores[b] !== scores[a]) return scores[b] - scores[a];
    // 2. Puntuación exacta sin redondear
    if (rawScores[b] !== rawScores[a]) return rawScores[b] - rawScores[a];
    // 3. Participación en asesinatos (KP)
    const kpA = (ps[a].kills ?? 0) + (ps[a].assists ?? 0);
    const kpB = (ps[b].kills ?? 0) + (ps[b].assists ?? 0);
    if (kpB !== kpA) return kpB - kpA;
    // 4. Menor cantidad de muertes
    const dA = ps[a].deaths ?? 0;
    const dB = ps[b].deaths ?? 0;
    if (dA !== dB) return dA - dB;
    // 5. Mayor daño a campeones
    const dmgA = ps[a].totalDamageDealtToChampions ?? 0;
    const dmgB = ps[b].totalDamageDealtToChampions ?? 0;
    if (dmgB !== dmgA) return dmgB - dmgA;
    return a - b;
  });

  // MVP: mejor desempeño del equipo ganador
  const bestOf = (win) => order.find((i) => ps[i].win === win);
  const mvp = bestOf(true);

  // ACE: mejor desempeño del equipo perdedor
  const ace = bestOf(false);

  // Identificación de la Mochila de cada equipo (jugador con menor aporte/rendimiento)
  const isEligibleMochila = (idx) => idx !== mvp && idx !== ace;

  const team100 = ps.map((p, i) => ({ i, teamId: p.teamId, score: scores[i], raw: rawScores[i] })).filter((x) => x.teamId === 100);
  const team200 = ps.map((p, i) => ({ i, teamId: p.teamId, score: scores[i], raw: rawScores[i] })).filter((x) => x.teamId === 200);

  const sortTeamMochila = (arr) => arr.sort((x, y) => {
    const a = x.i;
    const b = y.i;
    // 1. Menor score
    if (scores[a] !== scores[b]) return scores[a] - scores[b];
    // 2. Menor raw score
    if (rawScores[a] !== rawScores[b]) return rawScores[a] - rawScores[b];
    // 3. Mayor cantidad de muertes
    const dA = ps[a].deaths ?? 0;
    const dB = ps[b].deaths ?? 0;
    if (dB !== dA) return dB - dA;
    // 4. Menor participación en asesinatos (KP)
    const kpA = (ps[a].kills ?? 0) + (ps[a].assists ?? 0);
    const kpB = (ps[b].kills ?? 0) + (ps[b].assists ?? 0);
    if (kpA !== kpB) return kpA - kpB;
    // 5. Menor daño a campeones
    const dmgA = ps[a].totalDamageDealtToChampions ?? 0;
    const dmgB = ps[b].totalDamageDealtToChampions ?? 0;
    if (dmgA !== dmgB) return dmgA - dmgB;
    return a - b;
  });

  sortTeamMochila(team100);
  sortTeamMochila(team200);

  const pickMochila = (candidates) => {
    const eligible = candidates.filter((x) => isEligibleMochila(x.i));
    if (!eligible.length) return null;
    const worst = eligible[0];
    const worstPlace = order.indexOf(worst.i) + 1;
    // Si en un equipo ganador el menor score quedó en el top 5 global y con score sólido (>= 6.0),
    // no fue mochila sino victoria colectiva limpia.
    if (ps[worst.i].win && worstPlace <= 5 && worst.score >= 6.0) return null;
    return worst.i;
  };

  const mochila100 = pickMochila(team100);
  const mochila200 = pickMochila(team200);

  const result = new Map();
  order.forEach((i, place) => {
    result.set(ps[i].puuid, {
      score: scores[i],
      place: place + 1,
      mvp: i === mvp,
      ace: i === ace,
      mochila: i === mochila100 || i === mochila200,
    });
  });
  return result;
}
