// Per-game performance score (0-10), as close as possible to OP.GG's OP Score.
// The score comes from a model fitted to OP.GG's real scores (src/opscore.js, calibration/).
// Places rank all 10 players; MVP = best on the winning team, ACE = best on the losing team,
// Mochila = the weakest player of each team.
import { opScores } from './opscore.js';

export function isRemake(match) {
  const info = match.info;
  return info.gameDuration < 300 || info.participants.some((p) => p.gameEndedInEarlySurrender);
}

// Returns Map<puuid, { score, place, mvp, ace }>
export function scoreMatch(match) {
  const ps = match.info.participants;

  // OP Score from the model fitted to OP.GG's own scores (src/opscore.js).
  const fitted = opScores(match);
  const rawScores = ps.map((p) => fitted.get(p.puuid));

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

  const remake = isRemake(match);

  // MVP: mejor desempeño del equipo ganador (no aplica en remakes)
  const bestOf = (win) => order.find((i) => ps[i].win === win);
  const mvp = remake ? null : bestOf(true);

  // ACE: mejor desempeño del equipo perdedor (no aplica en remakes)
  const ace = remake ? null : bestOf(false);

  // Identificación de la Mochila de cada equipo (jugador con menor aporte/rendimiento; nunca aplica en remakes)
  const isEligibleMochila = (idx) => !remake && idx !== mvp && idx !== ace;

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

  const mochila100 = remake ? null : pickMochila(team100);
  const mochila200 = remake ? null : pickMochila(team200);

  const result = new Map();
  order.forEach((i, place) => {
    result.set(ps[i].puuid, {
      score: scores[i],
      place: place + 1,
      mvp: !remake && i === mvp,
      ace: !remake && i === ace,
      mochila: !remake && (i === mochila100 || i === mochila200),
    });
  });
  return result;
}
