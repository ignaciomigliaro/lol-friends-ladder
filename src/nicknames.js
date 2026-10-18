// Funny Spanish nicknames based on each player's most glaring weakness in their recent ranked games.
// Every rule measures how far past a threshold the player is (its "severity"); each player gets the
// nickname of their worst flaw, and no two players share one.

const DAY = 24 * 60 * 60 * 1000;
const avg = (list, fn) => list.reduce((acc, x) => acc + fn(x), 0) / list.length;
const fmt = (n, d = 1) => Number(n.toFixed(d)).toString();

function mainRole(games) {
  const counts = {};
  for (const g of games) counts[g.position] = (counts[g.position] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
}

// worse: whether a higher or lower value is the bad direction.
// threshold/scale may depend on the player's main role; returning null skips the rule.
const RULES = [
  {
    title: 'El Feeder Oficial', emoji: '💀', worse: 'high', threshold: 6.5, scale: 2,
    value: (p) => p.stats.avgDeaths,
    reason: (v) => `${fmt(v)} muertes por partida`,
  },
  {
    title: 'Fan de la Pantalla Gris', emoji: '🪦', worse: 'high', threshold: 12, scale: 5,
    value: (p) => 100 * avg(p.games, (g) => g.deadPct ?? 0),
    reason: (v) => `pasa el ${fmt(v, 0)}% de la partida muerto`,
  },
  {
    title: 'El Ciego de la Grieta', emoji: '🦯', worse: 'low', scale: 0.3,
    threshold: (role) => ({ UTILITY: 1.6, JUNGLE: 0.9 })[role] ?? 0.6,
    value: (p) => avg(p.games, (g) => (g.vision ?? 0) / Math.max(1, g.minutes)),
    reason: (v) => `${fmt(v, 2)} de visión por minuto, ni un ward`,
  },
  {
    title: 'El Vegano', emoji: '🥗', worse: 'low', scale: 1.5,
    threshold: (role) => (role === 'UTILITY' ? null : role === 'JUNGLE' ? 5 : 6),
    value: (p) => avg(p.games, (g) => g.cs / Math.max(1, g.minutes)),
    reason: (v) => `no come súbditos: ${fmt(v)} CS/min`,
  },
  {
    title: 'El Turista', emoji: '🧳', worse: 'low', threshold: 42, scale: 10,
    value: (p) => 100 * avg(p.games, (g) => g.kp ?? 0.5),
    reason: (v) => `solo aparece en el ${fmt(v, 0)}% de las kills de su equipo`,
  },
  {
    title: 'Daño de Algodón', emoji: '☁️', worse: 'low', scale: 5,
    threshold: (role) => (role === 'UTILITY' ? null : 18),
    value: (p) => 100 * avg(p.games, (g) => g.dmgShare ?? 0.2),
    reason: (v) => `hace apenas el ${fmt(v, 0)}% del daño de su equipo`,
  },
  {
    title: 'El Ancla', emoji: '⚓', worse: 'low', threshold: 45, scale: 10,
    value: (p) => p.stats.winrate,
    reason: (v) => `${fmt(v, 0)}% de victorias, hunde al equipo`,
  },
  {
    title: 'La Mochila', emoji: '🎒', worse: 'low', threshold: 5, scale: 1,
    value: (p) => p.stats.avgScore,
    reason: (v) => `score promedio ${fmt(v)}, lo tienen que cargar`,
  },
  {
    title: 'El Tilteado', emoji: '🤬', worse: 'high', threshold: 2, scale: 2,
    value: (p) => -p.stats.streak,
    reason: (v) => `${v} derrotas seguidas y sigue dándole a "Buscar partida"`,
  },
  {
    title: 'Bolsa en Picada', emoji: '📉', worse: 'high', threshold: 30, scale: 40,
    value: (p) => (p.lpDelta?.week == null ? null : -p.lpDelta.week),
    reason: (v) => `perdió ${v} LP esta semana`,
  },
  {
    title: 'El Jubilado', emoji: '👴', worse: 'high', threshold: 7, scale: 7,
    value: (p, now) => (now - p.games[0].endTs) / DAY,
    reason: (v) => `no juega ranked hace ${fmt(v, 0)} días`,
  },
  {
    title: 'El Incomprendido', emoji: '😭', worse: 'high', threshold: 0, scale: 1,
    value: (p) => (p.stats.avgScore >= 6.3 && p.stats.winrate < 48 ? 0.5 : 0),
    reason: (v, p) => `juega bien (${fmt(p.stats.avgScore)}) y pierde igual`,
  },
  {
    title: 'Casado con', emoji: '💍', worse: 'high', threshold: 0.5, scale: 1,
    value: (p) => (p.games.length >= 6 ? (p.topChampions[0]?.games ?? 0) / p.games.length : 0),
    reason: (v, p) => `${p.topChampions[0].games} de ${p.games.length} partidas con el mismo campeón`,
    titleFor: (p) => `Casado con ${p.topChampions[0].champion}`,
  },
];

const FALLBACKS = [
  { title: 'Ni Fu Ni Fa', emoji: '😐', reason: 'ningún defecto claro... sospechoso' },
  { title: 'El Sospechosamente Normal', emoji: '🤨', reason: 'demasiado limpio para ser verdad' },
  { title: 'Perfil Bajo', emoji: '🫥', reason: 'ni carrea ni feedea, solo existe' },
];

export function assignNicknames(players, now = Date.now()) {
  const eligible = players.filter((p) => p.stats && p.games?.length);
  const candidates = [];

  for (const rule of RULES) {
    const rows = eligible
      .map((p) => {
        const role = mainRole(p.games);
        const threshold = typeof rule.threshold === 'function' ? rule.threshold(role) : rule.threshold;
        const v = threshold == null ? null : rule.value(p, now);
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
    p.nickname = { title: rule.titleFor?.(p) ?? rule.title, emoji: rule.emoji, reason: rule.reason(v, p) };
  }

  // Players without an obvious flaw: the best one is carrying everyone, the rest are just "there".
  const clean = eligible.filter((p) => !p.nickname).sort((a, b) => b.stats.avgScore - a.stats.avgScore);
  if (clean.length && clean[0].stats.avgScore >= 6.5) {
    clean.shift().nickname = { title: 'El Carry Cansado', emoji: '🏋️', reason: 'carga a todo el grupo en la espalda' };
  }
  clean.forEach((p, i) => (p.nickname = { ...FALLBACKS[i % FALLBACKS.length] }));

  for (const p of players) p.nickname ??= null;
}
