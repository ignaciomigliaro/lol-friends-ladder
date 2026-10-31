// Spanish nicknames that roast each player's most glaring weakness in their recent ranked games.
// Every rule measures how far past a threshold the player is (its "severity"); each player gets the
// nickname of their worst flaw, and no two players share one. Jokes stay about the gameplay.

const DAY = 24 * 60 * 60 * 1000;
const avg = (list, fn) => list.reduce((acc, x) => acc + fn(x), 0) / list.length;
const sum = (list, fn) => list.reduce((acc, x) => acc + fn(x), 0);
const fmt = (n, d = 1) => Number(n.toFixed(d)).toString();
// Nicknames are about current form: only the games the leaderboard stats use.
const recent = (p) => p.games.slice(0, p.stats.games);
// Recent games with a lane opponent to compare against.
const laned = (p) => recent(p).filter((g) => g.opp);

function mainRole(games) {
  const counts = {};
  for (const g of games) counts[g.position] = (counts[g.position] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
}

// worse: whether a higher or lower value is the bad direction.
// threshold may depend on the player's main role; a null threshold or value skips the rule.
// value(p, now, group) gets every eligible player, for rules that compare within the group.
const RULES = [
  // --- dying ---
  {
    title: 'El Feeder Oficial', emoji: '💀', worse: 'high', threshold: 6.5, scale: 2,
    value: (p) => p.stats.avgDeaths,
    reason: (v) => `${fmt(v)} muertes por partida. El equipo rival ya lo tiene agendado como cajero automático`,
  },
  {
    title: 'Fan de la Pantalla Gris', emoji: '🪦', worse: 'high', threshold: 12, scale: 5,
    value: (p) => 100 * avg(recent(p), (g) => g.deadPct ?? 0),
    reason: (v) => `pasa el ${fmt(v, 0)}% de la partida muerto. Ve más gris que la tele de la abuela`,
  },
  {
    title: 'El Kamikaze', emoji: '💣', worse: 'high', scale: 0.8,
    threshold: (role) => (role === 'UTILITY' ? null : 1.6),
    value: (p) => sum(recent(p), (g) => g.deaths) / Math.max(1, sum(recent(p), (g) => g.kills)),
    reason: (v) => `muere ${fmt(v)} veces por cada kill que hace. Se tira de cabeza sin mirar el minimapa`,
  },

  // --- laning against their direct rival ---
  {
    title: 'Sparring del Rival', emoji: '🥊', worse: 'high', threshold: 60, scale: 15,
    value: (p) => (laned(p).length < 5 ? null : (100 * laned(p).filter((g) => g.opp.score > g.score).length) / laned(p).length),
    reason: (v) => `su rival de línea le gana en el ${fmt(v, 0)}% de las partidas. Le deberían cobrar la clase`,
  },
  {
    title: 'Donador de Oro', emoji: '🎁', worse: 'high', threshold: 700, scale: 700,
    value: (p) => (laned(p).length < 5 ? null : avg(laned(p), (g) => g.opp.gold - g.gold)),
    reason: (v) => `le regala ${Math.round(v)} de oro por partida a su rival de línea. Un alma caritativa`,
  },
  {
    title: 'Alérgico a las Torres', emoji: '🗼', worse: 'low', threshold: 0.7, scale: 0.2,
    value: (p) => (laned(p).length < 5 ? null : avg(laned(p), (g) => g.objectives) / Math.max(1, avg(laned(p), (g) => g.opp.objectives))),
    reason: (v) => `hace un ${fmt(100 * (1 - v), 0)}% menos de daño a objetivos que su rival. Las torres no muerden`,
  },

  // --- farming, vision, fighting ---
  {
    title: 'El Ciego de la Grieta', emoji: '🦯', worse: 'low', scale: 0.3,
    threshold: (role) => ({ UTILITY: 1.6, JUNGLE: 0.9 })[role] ?? 0.6,
    value: (p) => avg(recent(p), (g) => (g.vision ?? 0) / Math.max(1, g.minutes)),
    reason: (v) => `${fmt(v, 2)} de visión por minuto. Los wards no se ponen solos, maestro`,
  },
  {
    title: 'El Vegano', emoji: '🥗', worse: 'low', scale: 1.5,
    threshold: (role) => (role === 'UTILITY' ? null : role === 'JUNGLE' ? 5 : 6),
    value: (p) => avg(recent(p), (g) => g.cs / Math.max(1, g.minutes)),
    reason: (v) => `${fmt(v)} CS/min. Los súbditos le dan pena y los deja vivir`,
  },
  {
    title: 'El Turista', emoji: '🧳', worse: 'low', threshold: 42, scale: 10,
    value: (p) => 100 * avg(recent(p), (g) => g.kp ?? 0.5),
    reason: (v) => `aparece en el ${fmt(v, 0)}% de las kills del equipo. Vino a la Grieta a sacar fotos`,
  },
  {
    title: 'El Granjero', emoji: '🌾', worse: 'high', threshold: 0, scale: 10,
    value: (p) => {
      const cs = avg(recent(p), (g) => g.cs / Math.max(1, g.minutes));
      const kp = 100 * avg(recent(p), (g) => g.kp ?? 0.5);
      return cs >= 7 ? 45 - kp : null;
    },
    reason: (v, p) => `${fmt(avg(recent(p), (g) => g.cs / Math.max(1, g.minutes)))} CS/min mientras su equipo pelea 4 contra 5. Farmea hasta el apocalipsis`,
  },
  {
    title: 'Daño de Algodón', emoji: '☁️', worse: 'low', scale: 5,
    threshold: (role) => (role === 'UTILITY' ? null : 18),
    value: (p) => 100 * avg(recent(p), (g) => g.dmgShare ?? 0.2),
    reason: (v) => `hace el ${fmt(v, 0)}% del daño del equipo. Pega con almohada`,
  },
  {
    title: 'Robakills', emoji: '🦹', worse: 'high', scale: 0.15,
    threshold: (role) => (role === 'UTILITY' ? null : 0.55),
    value: (p) => sum(recent(p), (g) => g.kills) / Math.max(1, sum(recent(p), (g) => g.kills + g.assists)),
    reason: (v) => `el ${fmt(100 * v, 0)}% de lo que hace son kills y casi nunca asiste. El último golpe es suyo y punto`,
  },

  // --- results ---
  {
    title: 'El Ancla', emoji: '⚓', worse: 'low', threshold: 45, scale: 10,
    value: (p) => p.stats.winrate,
    reason: (v) => `${fmt(v, 0)}% de victorias. Hunde cualquier equipo que lo lleve`,
  },
  {
    title: 'La Mochila', emoji: '🎒', worse: 'low', threshold: 5, scale: 1,
    value: (p) => p.stats.avgScore,
    reason: (v) => `score promedio ${fmt(v)}. Lo cargan más que a un celular viejo`,
  },
  {
    title: 'Manco Certificado', emoji: '🖐️', worse: 'high', threshold: 6.8, scale: 1,
    value: (p) => avg(recent(p), (g) => g.place ?? 5.5),
    reason: (v) => `termina ${fmt(v)}° de 10 en promedio. Hay bots con mejor ranking`,
  },
  {
    title: 'Pecho Frío', emoji: '🥶', worse: 'low', threshold: 3.8, scale: 1,
    value: (p) => {
      const losses = recent(p).filter((g) => !g.win);
      return losses.length < 4 ? null : avg(losses, (g) => g.score);
    },
    reason: (v) => `cuando el equipo va perdiendo desaparece: ${fmt(v)} de score en las derrotas`,
  },
  {
    title: 'Héroe de las Derrotas', emoji: '🫠', worse: 'high', threshold: 2, scale: 2,
    value: (p) => (p.stats.ace >= 3 && p.stats.ace >= 2 * p.stats.mvp ? p.stats.ace : 0),
    reason: (v, p) => `${p.stats.ace} ACE y ${p.stats.mvp} MVP. Brilla solo cuando ya perdieron`,
  },
  {
    title: 'El Incomprendido', emoji: '😭', worse: 'high', threshold: 0, scale: 1,
    value: (p) => (p.stats.avgScore >= 6.3 && p.stats.winrate < 48 ? 0.5 : 0),
    reason: (v, p) => `juega bien (${fmt(p.stats.avgScore)}) y pierde igual. El matchmaking lo tiene de punto`,
  },

  // --- habits ---
  {
    title: 'El Tilteado', emoji: '🤬', worse: 'high', threshold: 2, scale: 2,
    value: (p) => -p.stats.streak,
    reason: (v) => `${v} derrotas seguidas y sigue dándole a "Buscar partida". Que alguien le desenchufe la compu`,
  },
  {
    title: 'Ludópata del Ranked', emoji: '🎰', worse: 'high', threshold: 19, scale: 10,
    value: (p, now) => {
      const week = p.games.filter((g) => now - g.endTs < 7 * DAY);
      return week.length >= 20 && (100 * sum(week, (g) => g.win)) / week.length < 45 ? week.length : null;
    },
    reason: (v, p, now) => {
      const week = p.games.filter((g) => now - g.endTs < 7 * DAY);
      return `${v} rankeds en 7 días con ${fmt((100 * sum(week, (g) => g.win)) / week.length, 0)}% de victorias. El problema no es la cantidad`;
    },
  },
  {
    title: 'Main de Cartón', emoji: '📦', worse: 'high', threshold: 0, scale: 15,
    value: (p) => {
      const c = mainChampion(p);
      return c && c.games >= 5 && c.wr <= 35 ? 40 - c.wr : null;
    },
    reason: (v, p) => {
      const c = mainChampion(p);
      return `${c.games} partidas con ${c.champion} y ${fmt(c.wr, 0)}% de victorias. Lo mainea, pero el campeón no lo quiere`;
    },
  },
  {
    title: 'Casado con', emoji: '💍', worse: 'high', threshold: 0.5, scale: 1,
    value: (p) => (recent(p).length >= 6 ? (p.topChampions[0]?.games ?? 0) / recent(p).length : 0),
    reason: (v, p) => `${p.topChampions[0].games} de ${recent(p).length} partidas con el mismo campeón. Ni el divorcio los separa`,
    titleFor: (p) => `Casado con ${p.topChampions[0].champion}`,
  },
  {
    title: 'Refugiado en Flex', emoji: '🫣', worse: 'high', threshold: 0.6, scale: 0.2,
    value: (p) => {
      const flex = p.flex ? p.flex.wins + p.flex.losses : 0;
      const solo = p.solo ? p.solo.wins + p.solo.losses : 0;
      return flex >= 20 ? flex / (flex + solo) : null;
    },
    reason: (v) => `el ${fmt(100 * v, 0)}% de sus rankeds de la season son Flex. A la Solo/Duo no se anima`,
  },
  {
    title: 'Bolsa en Picada', emoji: '📉', worse: 'high', threshold: 30, scale: 40,
    value: (p) => (p.lpDelta?.week == null ? null : -p.lpDelta.week),
    reason: (v) => `perdió ${v} LP esta semana. Ni las cripto caen tan rápido`,
  },
  {
    title: 'El Jubilado', emoji: '👴', worse: 'high', threshold: 7, scale: 7,
    value: (p, now) => (now - recent(p)[0].endTs) / DAY,
    reason: (v) => `no juega ranked hace ${fmt(v, 0)} días. Ya cobra la jubilación`,
  },
  {
    title: 'El Último Orejón del Tarro', emoji: '🥄', worse: 'high', threshold: 99, scale: 300,
    value: (p, now, group) => {
      const ranked = group.filter((x) => x.solo).sort((a, b) => a.solo.value - b.solo.value);
      if (ranked.length < 3 || ranked[0] !== p) return null;
      return ranked[1].solo.value - p.solo.value; // gap to the next-lowest friend
    },
    reason: (v, p) => `el rango más bajo del grupo: ${p.solo.label}. Alguien tenía que serlo`,
  },
];

function mainChampion(p) {
  const by = {};
  for (const g of p.games) {
    const c = (by[g.champion] ??= { champion: g.champion, games: 0, wins: 0 });
    c.games++;
    c.wins += g.win;
  }
  const top = Object.values(by).sort((a, b) => b.games - a.games)[0];
  return top && { ...top, wr: (100 * top.wins) / top.games };
}

const FALLBACKS = [
  { title: 'Ni Fu Ni Fa', emoji: '😐', reason: 'ningún defecto claro... y ninguna virtud tampoco' },
  { title: 'El Sospechosamente Normal', emoji: '🤨', reason: 'demasiado limpio para ser verdad. Lo estamos vigilando' },
  { title: 'Perfil Bajo', emoji: '🫥', reason: 'ni carrea ni feedea. Es parte del decorado' },
];

export function assignNicknames(players, now = Date.now()) {
  const eligible = players.filter((p) => p.stats && p.games?.length);
  const candidates = [];

  for (const rule of RULES) {
    const rows = eligible
      .map((p) => {
        const role = mainRole(recent(p));
        const threshold = typeof rule.threshold === 'function' ? rule.threshold(role) : rule.threshold;
        const v = threshold == null ? null : rule.value(p, now, eligible);
        return v == null || Number.isNaN(v) ? null : { p, v, threshold };
      })
      .filter(Boolean);
    if (!rows.length) continue;

    // Whoever is worst in the group at this gets a small bonus, so the nickname feels earned.
    const worstV = rule.worse === 'high' ? Math.max(...rows.map((r) => r.v)) : Math.min(...rows.map((r) => r.v));
    for (const { p, v, threshold } of rows) {
      const over = rule.worse === 'high' ? v - threshold : threshold - v;
      if (over <= 0) continue;
      const severity = over / rule.scale + (v === worstV ? 0.3 : 0);
      candidates.push({ p, rule, v, severity });
    }
  }

  candidates.sort((a, b) => b.severity - a.severity);
  const usedTitles = new Set();
  for (const { p, rule, v } of candidates) {
    if (p.nickname || usedTitles.has(rule.title)) continue;
    usedTitles.add(rule.title);
    p.nickname = { title: rule.titleFor?.(p) ?? rule.title, emoji: rule.emoji, reason: rule.reason(v, p, now) };
  }

  // Players without an obvious flaw: the best one is carrying everyone, the rest are just "there".
  const clean = eligible.filter((p) => !p.nickname).sort((a, b) => b.stats.avgScore - a.stats.avgScore);
  if (clean.length && clean[0].stats.avgScore >= 6.5) {
    clean.shift().nickname = { title: 'El Carry Cansado', emoji: '🏋️', reason: 'carga al grupo entero en la espalda. Que alguien le pague el kinesiólogo' };
  }
  clean.forEach((p, i) => (p.nickname = { ...FALLBACKS[i % FALLBACKS.length] }));

  for (const p of players) p.nickname ??= null;
}
