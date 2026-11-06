const $ = (s) => document.querySelector(s);

const TIER_COLORS = {
  IRON: '#8b8580', BRONZE: '#b07a5c', SILVER: '#a9b4c2', GOLD: '#e3b453', PLATINUM: '#4fc1b4',
  EMERALD: '#2fcf7a', DIAMOND: '#7b9bff', MASTER: '#c06bf0', GRANDMASTER: '#f05a4f', CHALLENGER: '#f6d27a',
};
const ROLE = { TOP: 'Top', JUNGLE: 'Jungla', MIDDLE: 'Mid', BOTTOM: 'ADC', UTILITY: 'Support' };

let board = null;
let staticMode = false;
const SORTS = ['rank', 'score', 'winrate', 'week', 'season'];
let sortBy = SORTS.includes(new URLSearchParams(location.search).get('sort')) ? new URLSearchParams(location.search).get('sort') : 'rank';
const open = new Set();

// ---------- helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const scoreClass = (s) => (s >= 8 ? 's-great' : s >= 6.5 ? 's-good' : s >= 5 ? 's-ok' : 's-low');
const tierColor = (p) => TIER_COLORS[p.solo?.tier] ?? '#6b7390';

function ddragon(kind, name) {
  const v = board?.ddragonVersion;
  if (!v || name == null) return '';
  return `https://ddragon.leagueoflegends.com/cdn/${v}/img/${kind}/${name}.png`;
}
// Names are display names (Wukong); images are keyed by Riot's id (MonkeyKing).
const champImg = (c) => ddragon('champion', board?.champIds?.[c] ?? (c === 'FiddleSticks' ? 'Fiddlesticks' : c));

function timeAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 60) return `hace ${m} min`;
  if (m < 60 * 24) return `hace ${Math.round(m / 60)} h`;
  return `hace ${Math.round(m / 1440)} d`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2500);
}

function sortedPlayers() {
  const ps = [...(board?.players ?? [])];
  const by = {
    rank: (p) => p.solo?.value ?? -1,
    score: (p) => p.stats?.avgScore ?? -1,
    winrate: (p) => p.stats?.winrate ?? -1,
    week: (p) => p.lpDelta?.week ?? -9999,
    season: (p) => p.lpDelta?.season ?? -9999,
  }[sortBy];
  return ps.sort((a, b) => by(b) - by(a));
}

// ---------- rendering ----------

const sinceText = (ts) => new Date(ts).toLocaleDateString('es', { month: 'short', day: 'numeric' });

function deltaHtml(p) {
  const d = p.lpDelta ?? {};
  const line = (v, label, title) => (v == null || v === 0 ? '' :
    `<span class="delta ${v > 0 ? 'up' : 'down'}" title="${esc(title)}">${signed(v)} LP ${label}</span>`);
  const week = board.weekStart ? `Desde el ${new Date(board.weekStart).toLocaleString('es', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric' })}` : '';
  const season = d.seasonSince ? `Desde el ${sinceText(d.seasonSince)}. Riot no guarda el historial de LP, así que la temporada se cuenta desde que empezó el seguimiento, y se reinicia sola cuando se resetean los rangos.` : '';
  const parts = [line(d.week, 'esta semana', week), line(d.season, 'esta temporada', season)].filter(Boolean);
  return parts.length ? `<div class="deltas">${parts.join('')}</div>` : '';
}

function rankHtml(p) {
  const wl = p.solo ? `${p.solo.wins}V ${p.solo.losses}D · ${Math.round((100 * p.solo.wins) / (p.solo.wins + p.solo.losses))}%` : 'Sin partidas en Solo/Duo';
  return `<div class="tier" style="color:${tierColor(p)}">${esc(p.solo?.label ?? 'Sin rango')}</div>
    <div class="sub">${wl}</div>${deltaHtml(p)}`;
}

const QUEUE = { 420: 'Solo/Duo', 440: 'Flex' };
const ordinal = (n) => `${n}°`;

// MVP = best on the winning team, ACE = best on the losing team, Mochila = weakest of each team.
function awardBadge(g) {
  if (g.mvp) return '<span class="badge mvp" title="El mejor del equipo ganador">MVP</span>';
  if (g.ace) return '<span class="badge ace" title="El mejor del equipo perdedor">ACE</span>';
  if (g.mochila) return '<span class="badge mochila" title="El más flojo de su equipo">🎒 Mochila</span>';
  return '';
}

function gameHtml(g) {
  const kda = ((g.kills + g.assists) / Math.max(1, g.deaths)).toFixed(2);
  if (g.isRemake) {
    return `<div class="game">
      <b></b>
      <img loading="lazy" decoding="async" src="${champImg(g.champion)}" alt="${esc(g.champion)}" onerror="this.style.visibility='hidden'">
      <div><strong>${g.kills} / ${g.deaths} / ${g.assists}</strong><div class="sub">Remake · ${g.minutes} min</div></div>
      <div class="hide-sm sub">${esc(g.champion)} · ${QUEUE[g.queueId] ?? 'Ranked'}<br>${timeAgo(g.endTs)}</div>
      <div class="game-place"><span class="badge place">Remake</span></div>
      <span class="score s-low">–</span>
    </div>`;
  }
  return `<div class="game ${g.win ? 'w' : ''}">
    <b></b>
    <img loading="lazy" decoding="async" src="${champImg(g.champion)}" alt="${esc(g.champion)}" onerror="this.style.visibility='hidden'">
    <div><strong>${g.kills} / ${g.deaths} / ${g.assists}</strong><div class="sub">${kda} KDA · ${g.cs} CS</div></div>
    <div class="hide-sm sub">${esc(g.champion)}${g.opp ? ` vs ${esc(g.opp.champion)}` : ''} · ${ROLE[g.position] ?? '—'} · ${QUEUE[g.queueId] ?? 'Ranked'}<br>${g.win ? 'Victoria' : 'Derrota'} · ${g.minutes} min · ${timeAgo(g.endTs)}</div>
    <div class="game-place" title="Terminó ${ordinal(g.place)} de los 10 jugadores por score">${awardBadge(g)}<span class="badge place">${ordinal(g.place)} / 10</span></div>
    <span class="score ${scoreClass(g.score)}">${g.score.toFixed(1)}</span>
  </div>`;
}

// Remakes are shown in game lists but never count toward averages.
const playedGames = (p) => (p.games ?? []).filter((g) => !g.isRemake);

function playerHtml(p, i) {
  const s = p.stats;
  const played = playedGames(p);
  const mochilas = played.filter((g) => g.mochila).length;
  const form = played.slice(0, 10).reverse().map((g) => `<i class="${g.win ? 'w' : ''}" title="${esc(g.champion)} ${g.score}"></i>`).join('');
  const champs = (p.topChampions ?? []).map((c) => `<img loading="lazy" decoding="async" src="${champImg(c.champion)}" title="${esc(c.champion)} · ${c.games} partidas · ${c.score} prom." alt="${esc(c.champion)}" onerror="this.remove()">`).join('');
  const medal = ['🥇', '🥈', '🥉'][i] ?? i + 1;
  const isOpen = open.has(p.puuid);

  return `<article class="player">
    <div class="row" data-puuid="${esc(p.puuid)}">
      <div class="pos">${medal}</div>
      <img loading="lazy" decoding="async" class="avatar" style="border-color:${tierColor(p)}" src="${ddragon('profileicon', p.profileIconId)}" alt="" onerror="this.style.visibility='hidden'">
      <div>
        <div class="name">${esc(p.name)}</div>
        ${p.nickname ? `<div class="nick" title="${esc(p.nickname.reason)}">“${esc(p.nickname.title)}” ${p.nickname.emoji}</div>` : ''}
        <div class="sub">${esc(p.riotId)}${p.level ? ` · Nv ${p.level}` : ''}</div>
        <div class="sm-only">${rankHtml(p)}</div>
      </div>
      <div class="hide-sm">${rankHtml(p)}</div>
      <div title="Score promedio de las últimas ${s?.games ?? 0} partidas ranked">
        <span class="score ${s ? scoreClass(s.avgScore) : ''}">${s ? s.avgScore.toFixed(1) : '–'}</span>
        <div class="sub">${s ? `${s.mvp} MVP · ${s.ace} ACE · ${mochilas} 🎒` : 'sin partidas'}</div>
      </div>
      <div class="hide-sm">
        <div class="form">${form}</div>
        <div class="sub">${s ? `${s.winrate}% WR · ${s.kda} KDA · ${s.games} partidas` : ''}</div>
      </div>
      <div class="hide-sm"><div class="champs">${champs}</div>
        <div class="sub">${s?.streak >= 3 ? `🔥 racha de ${s.streak} victorias` : s?.streak <= -3 ? `🧊 racha de ${-s.streak} derrotas` : ''}</div></div>
    </div>
    ${isOpen && p.nickname ? `<div class="games nick-reason">${p.nickname.emoji} <strong>“${esc(p.nickname.title)}”</strong>: ${esc(p.nickname.reason)}</div>` : ''}
    ${isOpen ? `<div class="games">${(p.games ?? []).slice(0, 20).map(gameHtml).join('') || '<p class="muted">Sin partidas ranked recientes.</p>'}
      <a class="profile-link" href="#p/${slug(p)}">Ver el perfil de ${esc(p.name)} →</a></div>` : ''}
  </article>`;
}

// ---------- personal tabs ----------

const slug = (p) => encodeURIComponent(p.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-'));
let profileQueue = 'all';

// #            -> leaderboard
// #players     -> grid of all players
// #p/<slug>    -> one player's page
// #duelos, #records, #meta -> the other tabs
function route() {
  const m = location.hash.match(/^#p\/(.+)$/);
  const player = m ? board?.players.find((p) => slug(p) === m[1]) ?? null : null;
  if (player) return { view: 'player', player };
  if (location.hash === '#players' || m) return { view: 'players' };
  if (['#duelos', '#records', '#meta'].includes(location.hash)) return { view: location.hash.slice(1) };
  return { view: 'board' };
}

function renderTabs(view) {
  const tab = (href, label, active) => `<a href="${href}" class="${active ? 'active' : ''}">${label}</a>`;
  $('#tabs').innerHTML = [
    tab('#', '🏆 Clasificación', view === 'board'),
    tab('#players', `👤 Jugadores <span class="count">${board.players?.length ?? 0}</span>`, view === 'players' || view === 'player'),
    tab('#duelos', '⚔️ Duelos', view === 'duelos'),
    tab('#records', '🎖️ Récords', view === 'records'),
    tab('#meta', '🛡️ Meta', view === 'meta'),
  ].join('');
}

function playersGridHtml() {
  const cards = sortedPlayers().map((p) => {
    const elo = eloAnalysis(p.games ?? []);
    const focus = elo?.workOn[0];
    return `<a class="pcard" href="#p/${slug(p)}">
      <img loading="lazy" decoding="async" class="avatar" style="border-color:${tierColor(p)}" src="${ddragon('profileicon', p.profileIconId)}" alt="" onerror="this.style.visibility='hidden'">
      <div class="pcard-main">
        <div class="name">${esc(p.name)}</div>
        ${p.nickname ? `<div class="nick">“${esc(p.nickname.title)}” ${p.nickname.emoji}</div>` : ''}
        <div class="tier" style="color:${tierColor(p)}">${esc(p.solo?.label ?? 'Sin rango')}</div>
        ${focus ? `<div class="sub">🎯 A mejorar: ${focus.metric.short}</div>` : ''}
      </div>
      <span class="score ${p.stats ? scoreClass(p.stats.avgScore) : ''}">${p.stats ? p.stats.avgScore.toFixed(1) : '–'}</span>
    </a>`;
  }).join('');
  return `<p class="muted">Elige a un amigo para ver sus stats, líneas, campeones y qué tiene que mejorar.</p><div class="pgrid">${cards}</div>`;
}

function playerSwitcherHtml(current) {
  const options = [...board.players].sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => `<option value="${slug(p)}" ${p === current ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  return `<div class="switcher"><a href="#players">← Todos los jugadores</a>
    <label class="sub">Jugador <select id="player-select">${options}</select></label></div>`;
}

// ---------- compared with players at the same elo ----------
// Benchmark = each game's lane opponent: same role, same game, so matched to the same rank/MMR.

const ELO_METRICS = [
  { key: 'damage', short: 'Daño', label: 'Daño a campeones', fmt: (v) => kNum(v),
    tip: (d) => `Haces ${d.relPct}% menos daño a campeones que tus rivales de línea. Busca más tradeos en línea y quédate en rango durante las peleas en vez de esperar el momento perfecto.` },
  { key: 'deaths', short: 'Muertes', label: 'Muertes', lowerIsBetter: true, fmt: (v) => v.toFixed(1),
    tip: (d) => `Mueres ${d.absDiff.toFixed(1)} veces más por partida que tus rivales de línea. Wardea antes de pasar por el río y retrocede cuando el jungla enemigo no está en el mapa.` },
  { key: 'cs', short: 'CS', label: 'Súbditos (CS)', skipRole: 'UTILITY', fmt: (v) => Math.round(v),
    tip: (d) => `Farmeas ${Math.round(d.absDiff)} súbditos menos por partida (unas ${Math.max(1, Math.round(d.absDiff / 20))} oleada${Math.round(d.absDiff / 20) === 1 ? '' : 's'}). Recoge las oleadas laterales entre peleas y practica el último golpe bajo torre.` },
  { key: 'kp', short: 'Participación en kills', label: 'Participación en kills', fmt: (v) => pct(v), points: true,
    tip: (d) => `Participas en ${Math.round(100 * d.absDiff)} puntos porcentuales menos de las kills de tu equipo. Agrúpate para dragones, heraldos y barones, y acompaña los ganks de tu jungla.` },
  { key: 'vision', short: 'Visión', label: 'Puntaje de visión', fmt: (v) => v.toFixed(1),
    tip: (d) => `Tu puntaje de visión es ${d.absDiff.toFixed(1)} más bajo por partida. Compra un control ward cada vez que vuelves a base y usa el trinket cuando esté disponible.` },
  { key: 'objectives', short: 'Objetivos', label: 'Daño a objetivos', fmt: (v) => kNum(v),
    tip: (d) => `Haces ${d.relPct}% menos daño a objetivos. Después de ganar una pelea o un tradeo, pégale a torres, dragones y larvas en vez de volver a farmear.` },
  { key: 'gold', short: 'Oro', label: 'Oro ganado', fmt: (v) => kNum(v),
    tip: (d) => `Ganas ${kNum(d.absDiff)} menos de oro por partida. La mayor parte viene del CS y las kills, así que sigue farmeando entre peleas.` },
];
const GAP = 0.08; // ignore differences under 8%

function eloAnalysis(games) {
  const withOpp = games.filter((g) => g.opp);
  if (withOpp.length < 3) return null;
  const rows = ELO_METRICS.map((metric) => {
    const list = withOpp.filter((g) => g.position !== metric.skipRole && g[metric.key] != null);
    if (list.length < 3) return null;
    const you = list.reduce((acc, g) => acc + g[metric.key], 0) / list.length;
    const them = list.reduce((acc, g) => acc + g.opp[metric.key], 0) / list.length;
    const rel = metric.points ? (you - them) / 0.5 : (you - them) / Math.max(1e-9, Math.abs(them));
    const goodness = metric.lowerIsBetter ? -rel : rel;
    return {
      metric, you, them, n: list.length, goodness,
      absDiff: Math.abs(you - them),
      relPct: Math.round(Math.abs(100 * (you - them)) / Math.max(1e-9, Math.abs(them))),
    };
  }).filter(Boolean);

  const outscored = withOpp.filter((g) => g.opp.score != null && g.score > g.opp.score).length;
  return {
    n: withOpp.length,
    rows,
    outscored,
    workOn: rows.filter((r) => r.goodness < -GAP).sort((a, b) => a.goodness - b.goodness).slice(0, 3),
    strengths: rows.filter((r) => r.goodness > GAP).sort((a, b) => b.goodness - a.goodness).slice(0, 3),
  };
}

function eloHtml(p, games) {
  const e = eloAnalysis(games);
  if (!e) return '<p class="muted">No hay suficientes partidas con rival de línea para comparar.</p>';
  const tier = p.solo?.label?.replace(/ \d+ LP$/, '') ?? 'su rango';
  const diffText = (r) => {
    if (r.metric.points ? Math.round(100 * r.absDiff) === 0 : r.relPct === 0) return '±0';
    if (r.metric.points) return `${r.you >= r.them ? '+' : '−'}${Math.round(100 * r.absDiff)} pts`;
    return `${r.you >= r.them ? '+' : '−'}${r.relPct}%`;
  };
  const table = `<div class="table-wrap"><table class="stats">
    <thead><tr><th>Por partida</th><th>${esc(p.name)}</th><th>Rivales de línea</th><th>Diferencia</th></tr></thead>
    <tbody>${e.rows.map((r) => `<tr>
      <td>${r.metric.label}</td>
      <td><strong>${r.metric.fmt(r.you)}</strong></td>
      <td>${r.metric.fmt(r.them)}</td>
      <td class="${Math.abs(r.goodness) < GAP ? 'muted' : r.goodness > 0 ? 'up' : 'down'}"><strong>${diffText(r)}</strong>${Math.abs(r.goodness) < GAP ? ' · parejo' : r.goodness > 0 ? ' · mejor' : ' · peor'}</td>
    </tr>`).join('')}</tbody></table></div>`;

  const workOn = e.workOn.length
    ? e.workOn.map((r, i) => `<div class="advice work"><div class="advice-title">${i + 1}. ${r.metric.short}</div><p>${r.metric.tip(r)}</p></div>`).join('')
    : '<div class="advice good"><p>Sin puntos débiles claros: igualas o superas a tus rivales de línea en todas las stats. 👏</p></div>';
  const strengths = e.strengths.map((r) => `<span class="chip up">✅ ${r.metric.short} ${diffText(r)}</span>`).join('');

  return `<p class="muted">Comparado con el enemigo de la misma línea en cada una de estas ${e.n} partidas. El matchmaking de ranked empareja jugadores del mismo rango y MMR, así que son los verdaderos pares de ${esc(p.name)} (${esc(tier)}). La API de Riot no publica promedios por rango.</p>
    <div class="headline compact">
      <div class="hl"><span class="sub">Le ganó en score a su rival de línea</span><strong class="hl-num ${e.outscored * 2 >= e.n ? 'up' : 'down'}">${Math.round((100 * e.outscored) / e.n)}%</strong><span class="sub">${e.outscored} de ${e.n} partidas, por score 0–10</span></div>
    </div>
    <h4>🎯 Qué mejorar</h4>${workOn}
    ${strengths ? `<h4>💪 Fortalezas</h4><div class="chips">${strengths}</div>` : ''}
    <h4>Cara a cara</h4>${table}`;
}

const queueGames = (p) => playedGames(p).filter((g) => profileQueue === 'all' || String(g.queueId) === profileQueue);

function aggregate(games) {
  const n = games.length;
  if (!n) return null;
  const avg = (fn) => games.reduce((acc, g) => acc + fn(g), 0) / n;
  const total = (fn) => games.reduce((acc, g) => acc + fn(g), 0);
  const wins = total((g) => g.win);
  return {
    n, wins, losses: n - wins,
    winrate: (100 * wins) / n,
    score: avg((g) => g.score),
    place: avg((g) => g.place),
    kda: total((g) => g.kills + g.assists) / Math.max(1, total((g) => g.deaths)),
    kills: avg((g) => g.kills), deaths: avg((g) => g.deaths), assists: avg((g) => g.assists),
    damage: avg((g) => g.damage ?? 0),
    dmgShare: avg((g) => g.dmgShare ?? 0),
    cs: avg((g) => g.cs),
    csMin: avg((g) => g.cs / Math.max(1, g.minutes)),
    kp: avg((g) => g.kp ?? 0),
    objectives: avg((g) => g.objectives ?? 0),
    vision: avg((g) => g.vision ?? 0),
    gold: avg((g) => g.gold ?? 0),
    mvp: total((g) => g.mvp), ace: total((g) => g.ace), mochila: total((g) => g.mochila),
  };
}

// Per-game stat tiles, each compared with the rest of the group.
const TILES = [
  { key: 'damage', label: 'Daño / partida', fmt: (a) => kNum(a.damage), sub: (a) => `${pct(a.dmgShare)} del daño del equipo` },
  { key: 'cs', label: 'Súbditos / partida', fmt: (a) => Math.round(a.cs), sub: (a) => `${a.csMin.toFixed(1)} CS/min` },
  { key: 'deaths', label: 'Muertes / partida', fmt: (a) => a.deaths.toFixed(1), sub: (a) => `${a.kills.toFixed(1)} / ${a.deaths.toFixed(1)} / ${a.assists.toFixed(1)}`, lowerIsBetter: true },
  { key: 'kp', label: 'Participación en kills', fmt: (a) => pct(a.kp), sub: () => 'de las kills del equipo' },
  { key: 'objectives', label: 'Daño a objetivos / partida', fmt: (a) => kNum(a.objectives), sub: () => 'torres, dragones, barones…' },
  { key: 'vision', label: 'Visión / partida', fmt: (a) => a.vision.toFixed(1), sub: () => 'wards puestos + destruidos' },
  { key: 'gold', label: 'Oro / partida', fmt: (a) => kNum(a.gold), sub: () => '' },
  { key: 'kda', label: 'KDA', fmt: (a) => a.kda.toFixed(2), sub: () => '(kills + asistencias) / muertes' },
];

function roleRows(games) {
  const by = {};
  for (const g of games) (by[g.position || 'NONE'] ??= []).push(g);
  const rows = Object.entries(by).map(([role, list]) => {
    const a = aggregate(list);
    // Blend win rate (smoothed, so 1-0 isn't "100%") with average score.
    const strength = 0.5 * (100 * (a.wins + 1)) / (a.n + 2) + 0.5 * a.score * 10;
    return { role, a, strength };
  }).sort((x, y) => y.a.n - x.a.n);

  for (const minGames of [3, 2]) {
    const eligible = rows.filter((r) => r.a.n >= minGames);
    if (eligible.length >= 2) {
      const sorted = [...eligible].sort((x, y) => y.strength - x.strength);
      sorted[0].tag = 'best';
      sorted.at(-1).tag = 'worst';
      break;
    }
  }
  return rows;
}

// ---------- trend charts (SVG line chart with hover crosshair) ----------

const charts = new Map(); // chart id -> points in SVG coordinates, for the hover layer
let chartSeq = 0;
// A compact viewBox keeps axis text readable when the chart scales down to phone width.
const CHART_W = 480, CHART_H = 210;
const TIER_NAMES = ['Hierro', 'Bronce', 'Plata', 'Oro', 'Platino', 'Esmeralda', 'Diamante'];
const shortDate = (ts) => new Date(ts).toLocaleDateString('es', { month: 'short', day: 'numeric' });

// Inverse of ranks.js rankValue(): 1 point = 1 LP, Iron IV 0 LP = 0.
function lpLabel(v, withLp = true) {
  if (v >= 2800) return `Master+ ${v - 2800} LP`;
  const tier = TIER_NAMES[Math.floor(v / 400)];
  const div = ['IV', 'III', 'II', 'I'][Math.floor((v % 400) / 100)];
  return withLp ? `${tier} ${div} ${v % 100} LP` : `${tier} ${div}`;
}

// points: [{ xv, line, dot?, rows: [[value, label], ...] }] in drawing order (oldest first).
function lineChart({ points, xTicks, yDomain, yTicks, color, endLabel, ariaLabel }) {
  const id = `chart-${++chartSeq}`;
  const L = 70, R = 14, T = 16, B = 30;
  const x0 = points[0].xv, x1 = points.at(-1).xv;
  const sx = (v) => L + (x1 === x0 ? (CHART_W - L - R) / 2 : ((v - x0) / (x1 - x0)) * (CHART_W - L - R));
  const [y0, y1] = yDomain;
  const sy = (v) => T + (1 - (v - y0) / (y1 - y0)) * (CHART_H - T - B);

  const grid = yTicks.map((t) => `<line class="grid" x1="${L}" x2="${CHART_W - R}" y1="${sy(t.v)}" y2="${sy(t.v)}"/>
    <text class="axis" x="${L - 8}" y="${sy(t.v) + 4}" text-anchor="end">${esc(t.label)}</text>`).join('');
  const xs = xTicks.map((t, i) => `<text class="axis" x="${sx(t.v)}" y="${CHART_H - 8}" text-anchor="${i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}">${esc(t.label)}</text>`).join('');
  const dots = points.filter((p) => p.dot != null).map((p) => `<circle class="gdot" cx="${sx(p.xv)}" cy="${sy(p.dot)}" r="3"/>`).join('');
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.xv).toFixed(1)},${sy(p.line).toFixed(1)}`).join('');
  const last = points.at(-1);
  const ex = sx(last.xv), ey = sy(last.line);

  charts.set(id, points.map((p) => ({ x: sx(p.xv), y: sy(p.line), rows: p.rows })));
  return `<div class="chart" data-chart="${id}" tabindex="0" aria-label="${esc(ariaLabel)}. Usa las flechas izquierda y derecha para leer los valores.">
    <svg viewBox="0 0 ${CHART_W} ${CHART_H}" role="img" aria-label="${esc(ariaLabel)}">
      ${grid}${xs}${dots}
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle class="ring" cx="${ex}" cy="${ey}" r="5" fill="${color}"/>
      <text class="end-label" x="${ex - 8}" y="${ey - 10}" text-anchor="end">${esc(endLabel)}</text>
      <line class="xhair" x1="0" x2="0" y1="${T}" y2="${CHART_H - B}" visibility="hidden"/>
      <circle class="hdot ring" r="5" fill="${color}" visibility="hidden"/>
    </svg>
    <div class="chart-tip" hidden></div>
  </div>`;
}

function showChartPoint(el, index) {
  const pts = charts.get(el.dataset.chart);
  if (!pts) return;
  const i = Math.max(0, Math.min(pts.length - 1, index));
  const p = pts[i];
  el.dataset.index = i;
  const svg = el.querySelector('svg');
  const xh = svg.querySelector('.xhair');
  xh.setAttribute('x1', p.x); xh.setAttribute('x2', p.x); xh.setAttribute('visibility', 'visible');
  const hd = svg.querySelector('.hdot');
  hd.setAttribute('cx', p.x); hd.setAttribute('cy', p.y); hd.setAttribute('visibility', 'visible');

  // Values lead, labels follow. Built with textContent: champion names come from the API.
  const tip = el.querySelector('.chart-tip');
  tip.replaceChildren(...p.rows.map(([value, label]) => {
    const row = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = value;
    const sub = document.createElement('span');
    sub.textContent = label;
    row.append(strong, ' ', sub);
    return row;
  }));
  tip.hidden = false;
  const w = el.clientWidth;
  const px = (p.x / CHART_W) * w;
  tip.style.left = `${Math.min(Math.max(px - tip.offsetWidth / 2, 0), w - tip.offsetWidth)}px`;
}

function hideChartPoint(el) {
  el.querySelector('.xhair')?.setAttribute('visibility', 'hidden');
  el.querySelector('.hdot')?.setAttribute('visibility', 'hidden');
  el.querySelector('.chart-tip').hidden = true;
}

function evenTicks(n, count) {
  if (n <= 1) return [0];
  const k = Math.min(count, n);
  return [...new Set(Array.from({ length: k }, (_, i) => Math.round((i * (n - 1)) / (k - 1))))];
}

function scoreChartHtml(games) {
  const chrono = [...games].sort((a, b) => a.endTs - b.endTs);
  if (chrono.length < 3) return '<div class="chart-card"><div class="chart-title">Score en el tiempo</div><p class="muted">Todavía no hay suficientes partidas.</p></div>';
  const points = chrono.map((g, i) => {
    const win = chrono.slice(Math.max(0, i - 4), i + 1);
    const avg = win.reduce((acc, x) => acc + x.score, 0) / win.length;
    return {
      xv: i, line: avg, dot: g.score,
      rows: [
        [avg.toFixed(1), `promedio de ${win.length} partidas`],
        [g.score.toFixed(1), `${g.champion} · ${g.win ? 'Victoria' : 'Derrota'} · ${shortDate(g.endTs)}`],
      ],
    };
  });
  const chart = lineChart({
    points,
    xTicks: evenTicks(chrono.length, 4).map((i) => ({ v: i, label: shortDate(chrono[i].endTs) })),
    yDomain: [0, 10],
    yTicks: [0, 2, 4, 6, 8, 10].map((v) => ({ v, label: String(v) })),
    color: '#c98500',
    endLabel: points.at(-1).line.toFixed(1),
    ariaLabel: `Score de las últimas ${chrono.length} partidas, promedio de 5`,
  });
  return `<div class="chart-card">
    <div class="chart-title">Score en el tiempo</div>
    <div class="chart-legend"><span class="key-line" style="background:#c98500"></span>Promedio de 5 partidas <span class="key-dot"></span>Partida</div>
    ${chart}
  </div>`;
}

function lpChartHtml(p) {
  const hist = p.lpHistory ?? [];
  const head = '<div class="chart-title">LP de Solo/Duo en el tiempo</div>';
  if (!p.solo) return `<div class="chart-card">${head}<p class="muted">Sin rango en Solo/Duo.</p></div>`;
  if (hist.length < 2 || hist.every((s) => s.v === hist[0].v)) {
    const since = hist[0] ? shortDate(hist[0].t) : 'hoy';
    return `<div class="chart-card">${head}<p class="muted">Riot no guarda el historial de LP, así que se registra en cada actualización desde el ${since}. La línea aparece cuando cambien los LP de ${esc(p.name)}.</p>
      <p><strong>${esc(p.solo.label)}</strong></p></div>`;
  }
  const vs = hist.map((s) => s.v);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const span = Math.max(hi - lo, 40);
  const step = span > 400 ? 100 : span > 150 ? 50 : 25;
  const y0 = Math.floor((lo - span * 0.15) / step) * step;
  const y1 = Math.ceil((hi + span * 0.15) / step) * step;
  const yTicks = [];
  for (let v = y0; v <= y1; v += step) yTicks.push({ v, label: v % 100 === 0 ? lpLabel(v, false) : `${v % 100} LP` });
  const points = hist.map((s) => ({ xv: s.t, line: s.v, rows: [[lpLabel(s.v), new Date(s.t).toLocaleString('es', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })]] }));
  const chart = lineChart({
    points,
    // Under two days of history every date is the same, so label times instead.
    xTicks: evenTicks(hist.length, 3).map((i) => ({
      v: hist[i].t,
      label: hist.at(-1).t - hist[0].t < 2 * 864e5 ? new Date(hist[i].t).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit' }) : shortDate(hist[i].t),
    })),
    yDomain: [y0, y1],
    yTicks,
    color: '#3987e5',
    endLabel: lpLabel(vs.at(-1)),
    ariaLabel: `LP de Solo/Duo desde el ${shortDate(hist[0].t)} hasta hoy`,
  });
  return `<div class="chart-card">${head}<div class="chart-legend">Registrado en cada actualización desde el ${shortDate(hist[0].t)}</div>${chart}
    <details><summary class="sub">Ver datos</summary><table class="stats">${[...hist].reverse().map((s) => `<tr><td>${new Date(s.t).toLocaleString('es')}</td><td>${lpLabel(s.v)}</td></tr>`).join('')}</table></details></div>`;
}

let selectedChamp = null;
let showAllChamps = false;

function champDetailHtml(champ, list) {
  const a = aggregate(list);
  const laned = list.filter((g) => g.opp);
  const outscored = laned.filter((g) => g.score > (g.opp.score ?? 0)).length;
  const stat = (label, value, sub = '') => `<div class="cstat"><span class="sub">${label}</span><strong>${value}</strong>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
  const summary = `<div class="cstats">
    ${stat('Win rate', `${Math.round(a.winrate)}%`, `${a.wins}V ${a.losses}D`)}
    ${stat('Score promedio', `<span class="score ${scoreClass(a.score)}">${a.score.toFixed(1)}</span>`)}
    ${stat('Puesto promedio', `${a.place.toFixed(1)} / 10`, `${a.mvp} MVP · ${a.ace} ACE · ${a.mochila} 🎒`)}
    ${stat('KDA', a.kda.toFixed(2), `${a.kills.toFixed(1)} / ${a.deaths.toFixed(1)} / ${a.assists.toFixed(1)}`)}
    ${stat('CS / min', a.csMin.toFixed(1), `${Math.round(a.cs)} por partida`)}
    ${stat('Daño / partida', kNum(a.damage), `${pct(a.dmgShare)} del equipo`)}
    ${laned.length ? stat('Le ganó al rival de línea', `${Math.round((100 * outscored) / laned.length)}%`, `${outscored} de ${laned.length} por score`) : ''}
  </div>`;

  // Matchups: the enemy champion in the same role, grouped.
  const byOpp = {};
  for (const g of laned) (byOpp[g.opp.champion] ??= []).push(g);
  const matchups = Object.entries(byOpp).map(([opp, gs]) => {
    const n = gs.length;
    const wins = gs.filter((g) => g.win).length;
    const mean = (fn) => gs.reduce((acc, g) => acc + fn(g), 0) / n;
    return {
      opp, n, wins, wr: (100 * wins) / n,
      you: mean((g) => g.score), them: mean((g) => g.opp.score ?? 0),
      gold: mean((g) => (g.gold ?? 0) - g.opp.gold),
      cs: mean((g) => g.cs - g.opp.cs),
    };
  }).sort((x, y) => y.n - x.n || y.wr - x.wr);

  // Best and worst only count matchups played at least twice, so a single game can't decide it.
  const repeat = matchups.filter((m) => m.n >= 2);
  const strength = (m) => m.wr + 10 * (m.you - m.them);
  const best = repeat.length >= 2 ? [...repeat].sort((x, y) => strength(y) - strength(x))[0] : null;
  const worst = repeat.length >= 2 ? [...repeat].sort((x, y) => strength(x) - strength(y))[0] : null;
  const diff = (v) => `<span class="${v > 0 ? 'up' : v < 0 ? 'down' : 'muted'}">${v > 0 ? '+' : ''}${Math.round(v)}</span>`;

  const matchupTable = matchups.length ? `
    ${best ? `<p class="matchup-callout">👍 Mejor matchup: <strong>${esc(best.opp)}</strong> (${best.wins}V ${best.n - best.wins}D) · 👎 Peor: <strong>${esc(worst.opp)}</strong> (${worst.wins}V ${worst.n - worst.wins}D)</p>` : ''}
    <div class="table-wrap"><table class="stats matchups">
      <thead><tr><th>Contra</th><th>Partidas</th><th>Win rate</th><th>Su score</th><th>Score rival</th><th>Dif. oro</th><th>Dif. CS</th></tr></thead>
      <tbody>${matchups.map((m) => `<tr class="${m === best ? 'best' : m === worst ? 'worst' : ''}">
        <td class="champ-cell"><img loading="lazy" decoding="async" src="${champImg(m.opp)}" alt="" onerror="this.style.visibility='hidden'"> ${esc(m.opp)}</td>
        <td>${m.n}</td>
        <td class="${m.wr >= 50 ? 'up' : 'down'}">${Math.round(m.wr)}% <span class="sub">${m.wins}V ${m.n - m.wins}D</span></td>
        <td><span class="score ${scoreClass(m.you)}">${m.you.toFixed(1)}</span></td>
        <td><span class="score ${scoreClass(m.them)}">${m.them.toFixed(1)}</span></td>
        <td>${diff(m.gold)}</td>
        <td>${diff(m.cs)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="sub">Rival = el enemigo del mismo rol. La diferencia de oro y CS es por partida; + significa ventaja. Un matchup jugado una sola vez es solo una pista.</p>`
    : '<p class="muted">No hay rivales de línea registrados con este campeón.</p>';

  return `<div class="champ-panel">
    ${summary}
    <h4>Matchups con ${esc(champ)}</h4>${matchupTable}
    <h4>Partidas con ${esc(champ)}</h4><div class="games profile-games">${list.map(gameHtml).join('')}</div>
  </div>`;
}

function playerProfileHtml(p) {
  const games = queueGames(p);
  const a = aggregate(games);
  const others = board.players.filter((x) => x !== p).map((x) => aggregate(queueGames(x))).filter(Boolean);
  const queueChips = [['all', 'Todas las ranked'], ['420', 'Solo/Duo'], ['440', 'Flex']]
    .map(([q, label]) => `<button data-queue="${q}" class="${profileQueue === q ? 'active' : ''}">${label}</button>`).join('');

  const header = `<section class="profile-head">
    <img loading="lazy" decoding="async" class="avatar big" style="border-color:${tierColor(p)}" src="${ddragon('profileicon', p.profileIconId)}" alt="" onerror="this.style.visibility='hidden'">
    <div class="ph-main">
      <h2>${esc(p.name)}</h2>
      ${p.nickname ? `<div class="nick">“${esc(p.nickname.title)}” ${p.nickname.emoji} <span class="sub">${esc(p.nickname.reason)}</span></div>` : ''}
      <div class="sub">${esc(p.riotId)}${p.level ? ` · Nivel ${p.level}` : ''}</div>
    </div>
    <div class="ph-ranks">
      <div><span class="sub">Solo/Duo</span> ${rankHtml(p)}</div>
      ${p.flex ? `<div><span class="sub">Flex</span> <div class="tier" style="color:${TIER_COLORS[p.flex.tier]}">${esc(p.flex.label)}</div><div class="sub">${p.flex.wins}V ${p.flex.losses}D</div></div>` : ''}
    </div>
  </section>`;

  const roast = p.roast ? `<h3>🔥 Roast de la semana</h3>${roastHtml(p)}` : '';

  if (!a) return `${header}<nav class="sort">${queueChips}</nav><p class="muted">Sin partidas ${profileQueue === '440' ? 'de Flex' : profileQueue === '420' ? 'de Solo/Duo' : 'ranked'} recientes.</p>${roast}`;

  const headline = `<div class="headline">
    <div class="hl"><span class="sub">Score promedio</span><span class="score big ${scoreClass(a.score)}">${a.score.toFixed(1)}</span><span class="sub">en ${a.n} partidas</span></div>
    <div class="hl"><span class="sub">Puesto promedio en la partida</span><strong class="hl-num">${a.place.toFixed(1)}<small> / 10</small></strong><span class="sub">${a.mvp} MVP · ${a.ace} ACE · ${a.mochila} 🎒 Mochila</span></div>
    <div class="hl"><span class="sub">Win rate</span><strong class="hl-num ${a.winrate >= 50 ? 'up' : 'down'}">${Math.round(a.winrate)}%</strong><span class="sub">${a.wins}V ${a.losses}D</span></div>
  </div>`;

  const tiles = TILES.map((t) => {
    const v = a[t.key];
    const all = [v, ...others.map((o) => o[t.key])];
    const rank = all.filter((x) => (t.lowerIsBetter ? x < v : x > v)).length + 1;
    const groupAvg = others.length ? others.reduce((acc, o) => acc + o[t.key], 0) / others.length : null;
    const better = groupAvg == null ? null : t.lowerIsBetter ? v < groupAvg : v > groupAvg;
    return `<div class="tile">
      <div class="sub">${t.label}</div>
      <div class="tile-num">${t.fmt(a)}</div>
      <div class="sub">${t.sub(a)}</div>
      ${groupAvg == null ? '' : `<div class="tile-cmp ${better ? 'up' : 'down'}">${better ? '▲' : '▼'} prom. del grupo ${t.fmt({ ...a, [t.key]: groupAvg })} · #${rank} de ${all.length}</div>`}
    </div>`;
  }).join('');

  const roles = roleRows(games);
  const best = roles.find((r) => r.tag === 'best');
  const worst = roles.find((r) => r.tag === 'worst');
  const roleSummary = best
    ? `<p class="role-summary">💪 Mejor línea: <strong>${ROLE[best.role] ?? best.role}</strong> · 🥀 Peor línea: <strong>${ROLE[worst.role] ?? worst.role}</strong></p>`
    : `<p class="role-summary muted">No hay suficientes partidas en distintas líneas para comparar (hacen falta 2+ líneas con 2+ partidas cada una).</p>`;
  const roleTable = `<div class="table-wrap"><table class="stats">
    <thead><tr><th>Línea</th><th>Partidas</th><th>Win rate</th><th>Score prom.</th><th>Puesto prom.</th><th>KDA</th><th>Daño / partida</th><th>CS / partida</th></tr></thead>
    <tbody>${roles.map((r) => `<tr class="${r.tag ?? ''}">
      <td><strong>${ROLE[r.role] ?? 'Otra'}</strong> ${r.tag === 'best' ? '💪' : r.tag === 'worst' ? '🥀' : ''}</td>
      <td>${r.a.n}</td>
      <td><div class="wr"><span class="bar-track"><i style="width:${r.a.winrate}%;background:${r.a.winrate >= 50 ? 'var(--win)' : 'var(--loss)'}"></i></span>${Math.round(r.a.winrate)}% <span class="sub">${r.a.wins}V ${r.a.losses}D</span></div></td>
      <td><span class="score ${scoreClass(r.a.score)}">${r.a.score.toFixed(1)}</span></td>
      <td>${r.a.place.toFixed(1)}</td>
      <td>${r.a.kda.toFixed(2)}</td>
      <td>${kNum(r.a.damage)}</td>
      <td>${Math.round(r.a.cs)}</td>
    </tr>`).join('')}</tbody></table></div>`;

  const champs = {};
  for (const g of games) (champs[g.champion] ??= []).push(g);
  const champRows = Object.entries(champs).map(([c, list]) => ({ c, list, a: aggregate(list) }))
    .sort((x, y) => y.a.n - x.a.n || y.a.score - x.a.score);
  const shownChamps = showAllChamps ? champRows : champRows.slice(0, 8);
  const champTable = `<p class="sub">Haz clic en un campeón para ver sus matchups y partidas.</p>
    <div class="table-wrap"><table class="stats champs-table">
    <thead><tr><th>Campeón</th><th>Partidas</th><th>Win rate</th><th>Score prom.</th><th>Puesto prom.</th><th>MVP</th><th>KDA</th><th></th></tr></thead>
    <tbody>${shownChamps.map(({ c, list, a: ca }) => {
      const isOpen = selectedChamp === c;
      return `<tr class="champ-row${isOpen ? ' open' : ''}" data-champ="${esc(c)}" tabindex="0" aria-expanded="${isOpen}">
        <td class="champ-cell"><img loading="lazy" decoding="async" src="${champImg(c)}" alt="" onerror="this.style.visibility='hidden'"> ${esc(c)}</td>
        <td>${ca.n}</td>
        <td class="${ca.winrate >= 50 ? 'up' : 'down'}">${Math.round(ca.winrate)}% <span class="sub">${ca.wins}V ${ca.losses}D</span></td>
        <td><span class="score ${scoreClass(ca.score)}">${ca.score.toFixed(1)}</span></td>
        <td>${ca.place.toFixed(1)}</td>
        <td>${ca.mvp || '–'}</td>
        <td>${ca.kda.toFixed(2)}</td>
        <td class="sub">${isOpen ? '▾' : '▸'}</td>
      </tr>`;
    }).join('')}</tbody></table></div>
    ${champRows.length > 8 && !showAllChamps ? `<button class="show-all-champs">Ver los ${champRows.length} campeones</button>` : ''}
    ${(() => {
      const sel = champRows.find((r) => r.c === selectedChamp);
      return sel ? `<section class="champ-detail-card" id="champ-detail">
        <div class="champ-detail-head">
          <img loading="lazy" decoding="async" src="${champImg(sel.c)}" alt="" onerror="this.style.visibility='hidden'">
          <h4>${esc(sel.c)}</h4>
          <button class="close-champ" aria-label="Cerrar">✕</button>
        </div>${champDetailHtml(sel.c, sel.list)}</section>` : '';
    })()}`;

  return `${header}
    <nav class="sort">${queueChips}<span class="sub">Últimas ${a.n} partidas ranked</span></nav>
    ${headline}
    ${roast}
    <h3>Tendencias</h3><div class="charts">${scoreChartHtml(games)}${lpChartHtml(p)}</div>
    <h3>Contra jugadores de tu elo</h3>${eloHtml(p, games)}
    <h3>Por partida contra el grupo</h3><div class="tiles">${tiles}</div>
    <h3>Líneas</h3>${roleSummary}${roleTable}
    <h3>Campeones</h3>${champTable}
    <h3>Partidas</h3><div class="games profile-games">${games.map(gameHtml).join('')}</div>`;
}

// ---------- roasts ----------

function roastHtml(p) {
  const r = p.roast;
  return `<div class="roast">
    <img loading="lazy" decoding="async" src="${champImg(r.champion)}" alt="${esc(r.champion)}" onerror="this.style.visibility='hidden'">
    <div>
      <strong>${esc(p.name)}</strong> <span class="sub">${esc(r.champion)}${r.opponent ? ` vs ${esc(r.opponent)}` : ''} · ${esc(r.kda)} · ${r.win ? 'Victoria' : 'Derrota'} · ${r.minutes} min · ${ordinal(r.place)} / 10</span>
      <p>${esc(r.text)}</p>
    </div>
    <span class="score ${scoreClass(r.score)}">${r.score.toFixed(1)}</span>
  </div>`;
}

function renderRoasts() {
  const list = (board.players ?? []).filter((p) => p.roast).sort((a, b) => a.roast.score - b.roast.score);
  $('#roasts').hidden = list.length === 0;
  $('#roast-list').innerHTML = list.map(roastHtml).join('');
}

// ---------- 1v1 duels ----------

let duelA = null, duelB = null;

const DUEL_METRICS = [
  { label: 'Score promedio', get: (a) => a.score, fmt: (v) => v.toFixed(1) },
  { label: 'Win rate', get: (a) => a.winrate, fmt: (v) => `${Math.round(v)}%` },
  { label: 'KDA', get: (a) => a.kda, fmt: (v) => v.toFixed(2) },
  { label: 'Kills / partida', get: (a) => a.kills, fmt: (v) => v.toFixed(1) },
  { label: 'Muertes / partida', get: (a) => a.deaths, fmt: (v) => v.toFixed(1), lowerIsBetter: true },
  { label: 'Daño / partida', get: (a) => a.damage, fmt: (v) => kNum(v) },
  { label: 'CS / min', get: (a) => a.csMin, fmt: (v) => v.toFixed(1) },
  { label: 'Participación en kills', get: (a) => a.kp, fmt: (v) => pct(v) },
  { label: 'Visión / partida', get: (a) => a.vision, fmt: (v) => v.toFixed(1) },
  { label: 'Oro / partida', get: (a) => a.gold, fmt: (v) => kNum(v) },
  { label: 'MVP', get: (a) => a.mvp, fmt: (v) => v },
  { label: 'Mochilas', get: (a) => a.mochila, fmt: (v) => v, lowerIsBetter: true },
];

function duelSideHtml(p, side) {
  return `<div class="duel-side ${side}">
    <img loading="lazy" decoding="async" class="avatar" style="border-color:${tierColor(p)}" src="${ddragon('profileicon', p.profileIconId)}" alt="" onerror="this.style.visibility='hidden'">
    <div>
      <div class="name">${esc(p.name)}</div>
      <div class="tier" style="color:${tierColor(p)}">${esc(p.solo?.label ?? 'Sin rango')}</div>
      ${p.lpDelta?.week ? `<div class="sub ${p.lpDelta.week > 0 ? 'up' : 'down'}">${signed(p.lpDelta.week)} LP esta semana</div>` : ''}
    </div>
  </div>`;
}

function duelsHtml() {
  const ps = board.players ?? [];
  if (ps.length < 2) return '<p class="muted">Hacen falta al menos 2 jugadores.</p>';
  const pA = ps.find((p) => p.puuid === duelA) ?? ps[0];
  const pB = ps.find((p) => p.puuid === duelB && p !== pA) ?? ps.find((p) => p !== pA);
  const select = (id, cur) => `<select id="${id}">${ps.map((p) => `<option value="${esc(p.puuid)}" ${p === cur ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;
  const a = aggregate(playedGames(pA)), b = aggregate(playedGames(pB));

  let winsA = 0, winsB = 0;
  const rows = a && b ? DUEL_METRICS.map((m) => {
    const va = m.get(a), vb = m.get(b);
    const aWins = m.lowerIsBetter ? va < vb : va > vb;
    const bWins = m.lowerIsBetter ? vb < va : vb > va;
    winsA += aWins; winsB += bWins;
    return `<div class="duel-row">
      <span class="a ${aWins ? 'win' : ''}">${m.fmt(va)}</span>
      <span class="label">${m.label}</span>
      <span class="b ${bWins ? 'win' : ''}">${m.fmt(vb)}</span>
    </div>`;
  }).join('') : '<p class="muted">Uno de los dos no tiene partidas recientes.</p>';

  // Games where both were on the same team (Riot only tracks the group's games together).
  const together = (board.groupGames ?? []).filter((g) => g.players.some((x) => x.puuid === pA.puuid) && g.players.some((x) => x.puuid === pB.puuid));
  const tWins = together.filter((g) => g.win).length;
  const higher = together.reduce((acc, g) => {
    const sa = g.players.find((x) => x.puuid === pA.puuid).score, sb = g.players.find((x) => x.puuid === pB.puuid).score;
    return { a: acc.a + (sa > sb), b: acc.b + (sb > sa) };
  }, { a: 0, b: 0 });

  return `<p class="muted section-intro">Compara a dos jugadores con sus partidas ranked recientes. En verde, quién gana cada stat.</p>
    <div class="duel-pick">${select('duel-a', pA)} <span class="duel-vs">vs</span> ${select('duel-b', pB)}</div>
    <div class="duel-head">
      ${duelSideHtml(pA, 'a')}
      <div><div class="duel-vs">${winsA} – ${winsB}</div><div class="duel-tally">stats ganadas</div></div>
      ${duelSideHtml(pB, 'b')}
    </div>
    <div class="tcard">${rows}</div>
    <h3>Jugando juntos</h3>
    <div class="tcard">${together.length
      ? `<div class="trow"><span>Partidas en el mismo equipo</span><span class="sub">${together.length} partidas</span><strong class="${tWins * 2 >= together.length ? 'up' : 'down'}">${tWins}V ${together.length - tWins}D</strong></div>
         <div class="trow"><span>Quién tuvo mejor score</span><span class="sub">${esc(pA.name)} ${higher.a} · ${esc(pB.name)} ${higher.b}</span><span></span></div>`
      : '<p class="muted">Todavía no jugaron juntos en el mismo equipo.</p>'}</div>`;
}

// ---------- records ----------

const GAME_RECORDS = [
  ['maxKills', '⚔️', 'Más kills en una partida', (v) => `${v} kills`],
  ['maxAssists', '🤝', 'Más asistencias', (v) => `${v} asistencias`],
  ['maxDeaths', '💀', 'Más muertes', (v) => `${v} muertes`],
  ['maxDamage', '💥', 'Más daño a campeones', (v) => kNum(v)],
  ['maxGold', '💰', 'Más oro', (v) => kNum(v)],
  ['maxCs', '🌾', 'Más CS', (v) => `${v} CS`],
  ['maxVision', '👁️', 'Más visión', (v) => `${v} de visión`],
  ['maxSoloKills', '🗡️', 'Más solo kills', (v) => `${v} solo kills`],
  ['bestKda', '⭐', 'Mejor KDA', (v) => `${v} KDA`],
  ['longestGame', '⏳', 'Partida más larga', (v) => `${v} min`],
];
const PLAYER_RECORDS = [
  ['highestAvgScore', '🏅', 'Mejor score promedio', (r) => `${r.value.toFixed(1)}`, (r) => `${r.games} partidas`],
  ['highestWinrate', '📈', 'Mejor win rate', (r) => `${r.value}%`, (r) => `${r.games} partidas`],
  ['mostMvp', '👑', 'Más MVPs', (r) => `${r.value} MVP`, () => ''],
  ['highestWeeklyLp', '🚀', 'Más LP esta semana', (r) => `${signed(r.value)} LP`, () => ''],
];

function recordsHtml() {
  const r = board.records;
  if (!r) return '<p class="muted">Todavía no hay récords.</p>';
  const t = r.totals;
  const totals = t ? `<div class="headline">
    <div class="hl"><span class="sub">Partidas del grupo</span><strong class="hl-num">${t.totalGames}</strong><span class="sub">${t.totalWins}V ${t.totalGames - t.totalWins}D · ${t.winrate}% WR</span></div>
    <div class="hl"><span class="sub">Kills / muertes / asistencias</span><strong class="hl-num">${t.totalKills}</strong><span class="sub">${t.totalDeaths} muertes · ${t.totalAssists} asistencias</span></div>
    <div class="hl"><span class="sub">Daño total a campeones</span><strong class="hl-num">${kNum(t.totalDamage)}</strong><span class="sub">entre todos</span></div>
  </div>` : '';
  const game = GAME_RECORDS.filter(([k]) => r[k]).map(([k, emoji, label, fmt]) => {
    const x = r[k];
    return `<div class="rcard">
      <img loading="lazy" decoding="async" src="${champImg(x.champion)}" alt="${esc(x.champion)}" onerror="this.style.visibility='hidden'">
      <div><div class="sub">${emoji} ${label}</div><div class="rnum">${fmt(x.value)}</div>
        <div><strong>${esc(x.player)}</strong> <span class="sub">${esc(x.champion)} · ${x.kills}/${x.deaths}/${x.assists} · ${x.win ? 'Victoria' : 'Derrota'} · ${sinceText(x.date)}</span></div></div>
    </div>`;
  }).join('');
  const players = PLAYER_RECORDS.filter(([k]) => r[k]).map(([k, emoji, label, fmt, sub]) => `<div class="rcard">
      <div class="remoji">${emoji}</div>
      <div><div class="sub">${label}</div><div class="rnum">${fmt(r[k])}</div><div><strong>${esc(r[k].player)}</strong> <span class="sub">${sub(r[k])}</span></div></div>
    </div>`).join('');
  return `<p class="muted section-intro">Lo mejor (y lo peor) del grupo en las partidas ranked guardadas.</p>
    ${totals}
    <h3>Jugadores</h3><div class="rgrid">${players}</div>
    <h3>En una sola partida</h3><div class="rgrid">${game}</div>`;
}

// ---------- meta ----------

function champTableHtml(list, withRole = true) {
  if (!list?.length) return '<p class="muted">Sin datos.</p>';
  return `<div class="table-wrap"><table class="stats">
    <thead><tr><th>Campeón</th><th>Partidas</th><th>Win rate</th><th>KDA</th><th>Daño</th><th>Quién más lo juega</th></tr></thead>
    <tbody>${list.map((c) => `<tr>
      <td class="champ-cell"><img loading="lazy" decoding="async" src="${champImg(c.champion)}" alt="" onerror="this.style.visibility='hidden'"> ${esc(c.champion)}</td>
      <td>${c.games}</td>
      <td class="${c.winrate >= 50 ? 'up' : 'down'}">${c.winrate}% <span class="sub">${c.wins}V ${c.losses}D</span></td>
      <td>${c.kda}</td>
      <td>${kNum(c.avgDamage)}</td>
      <td>${esc(c.topPlayer)} <span class="sub">${c.topPlayerGames} partidas${withRole && c.topRole ? ` · ${ROLE[c.topRole] ?? ''}` : ''}</span></td>
    </tr>`).join('')}</tbody></table></div>`;
}

function metaHtml() {
  const m = board.meta;
  if (!m) return '<p class="muted">Todavía no hay datos del meta.</p>';
  const roles = Object.values(m.roleMeta ?? {}).filter((r) => r.champions?.length).map((r) => `<div class="tcard">
      <div class="metric-title">${ROLE[r.role] ?? esc(r.roleName)}</div>
      ${r.champions.slice(0, 3).map((c) => `<div class="trow">
        <span class="champ-cell"><img loading="lazy" decoding="async" src="${champImg(c.champion)}" alt="" onerror="this.style.visibility='hidden'"> ${esc(c.champion)}</span>
        <span class="sub">${c.games} partidas · ${esc(c.topPlayer)}</span>
        <strong class="${c.winrate >= 50 ? 'up' : 'down'}">${c.winrate}%</strong>
      </div>`).join('')}
    </div>`).join('');
  return `<p class="muted section-intro">Los campeones del grupo: ${m.totalUniqueChampions} distintos en las partidas ranked guardadas.</p>
    <div class="tier-list">
      <div><h3>✨ Los que funcionan</h3>${champTableHtml(m.godTier)}</div>
      <div><h3>☠️ Los malditos</h3>${champTableHtml(m.cursedTier)}</div>
    </div>
    <h3>Por línea</h3><div class="together-grid">${roles}</div>
    <h3>Los más jugados</h3>${champTableHtml(m.champions?.slice(0, 15))}`;
}

function render() {
  if (!board) return;
  $('#group').textContent = board.groupName ?? 'La Grieta de los Pibes';
  document.title = board.groupName ?? 'La Grieta de los Pibes';
  $('#updated').textContent = board.updatedAt ? `Actualizado ${new Date(board.updatedAt).toLocaleString('es')} · ${board.platform?.toUpperCase() ?? ''}` : 'Sin datos todavía';

  const { view, player } = route();
  renderTabs(view);
  $('#view-board').hidden = view !== 'board';
  $('#view-player').hidden = view === 'board';
  const pages = { players: playersGridHtml, duelos: duelsHtml, records: recordsHtml, meta: metaHtml };
  if (pages[view]) {
    $('#view-player').innerHTML = pages[view]();
    return;
  }
  if (view === 'player') {
    charts.clear();
    $('#view-player').innerHTML = playerSwitcherHtml(player) + playerProfileHtml(player);
    return;
  }
  $('#board').innerHTML = sortedPlayers().map(playerHtml).join('') || '<p class="muted">Todavía no hay jugadores.</p>';

  const errs = board.errors ?? [];
  $('#errors').hidden = errs.length === 0;
  $('#errors').innerHTML = errs.map((e) => `<div>⚠ ${esc(e.riotId)}: ${esc(e.error)}</div>`).join('');
  renderRoasts();
  renderTogether();
}

// ---------- games played together ----------

const FRIEND_COLORS = ['#c8aa6e', '#60a5fa', '#f472b6', '#34d399', '#a78bfa', '#fb923c', '#f87171', '#22d3ee'];
const openGames = new Set();
let showAllGames = false;

const kNum = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);
const pct = (x) => `${Math.round(100 * x)}%`;

const METRICS = [
  { key: 'damage', label: 'Daño a campeones', fmt: (m) => `${kNum(m.damage)} · ${pct(m.damageShare)}` },
  { key: 'kp', label: 'Participación en kills', fmt: (m) => pct(m.kp) },
  { key: 'objectives', label: 'Daño a objetivos', fmt: (m) => `${kNum(m.objectives)} · ${pct(m.objectivesShare)}` },
  { key: 'towers', label: 'Daño a torres', fmt: (m) => `${kNum(m.towers)} · ${m.turrets} 🗼` },
  { key: 'epic', label: 'Monstruos épicos', hint: 'dragones, barones, heraldos, larvas', fmt: (m) => `${m.epic}` },
  { key: 'vision', label: 'Visión', fmt: (m) => `${m.vision} · ${m.visionPerMin.toFixed(1)}/min` },
  { key: 'tanking', label: 'Daño absorbido', fmt: (m) => `${kNum(m.tanking)} · ${pct(m.tankingShare)}` },
  { key: 'gold', label: 'Oro', fmt: (m) => `${kNum(m.gold)} · ${pct(m.goldShare)}` },
];

function friendColor(puuid) {
  const i = (board.players ?? []).findIndex((p) => p.puuid === puuid);
  return FRIEND_COLORS[(i < 0 ? 0 : i) % FRIEND_COLORS.length];
}

function groupGameHtml(g) {
  const isOpen = openGames.has(g.matchId);
  const n = g.players.length;
  const header = `<div class="gg-head" data-match="${esc(g.matchId)}">
    <b class="gg-result ${g.win ? 'w' : ''}">${g.win ? 'VICTORIA' : 'DERROTA'}</b>
    <div class="gg-champs">${g.players.map((p) => `<img loading="lazy" decoding="async" src="${champImg(p.champion)}" alt="" title="${esc(p.name)} · ${esc(p.champion)}" style="border-color:${friendColor(p.puuid)}" onerror="this.style.visibility='hidden'">`).join('')}</div>
    <div class="gg-names"><strong>${g.players.map((p) => esc(p.name)).join(' + ')}</strong>
      <div class="sub">${esc(g.queue)} · ${g.minutes}m · ${g.teamKills}–${g.enemyKills} kills · ${timeAgo(g.endTs)}</div></div>
    <span class="gg-toggle">${isOpen ? '▾' : '▸'}</span>
  </div>`;
  if (!isOpen) return `<article class="gg">${header}</article>`;

  const ranking = g.players.map((p, i) => {
    const tag = i === 0 ? '<span class="badge mvp">👑 Carry del grupo</span>' : i === n - 1 ? '<span class="badge place">🎒 Mochila del grupo</span>' : '';
    const lobby = awardBadge(p) || `<span class="badge place">${ordinal(p.place)} de 10</span>`;
    return `<div class="gg-rank">
      <span class="pos">${i + 1}</span>
      <img loading="lazy" decoding="async" src="${champImg(p.champion)}" alt="" style="border-color:${friendColor(p.puuid)}" onerror="this.style.visibility='hidden'">
      <div><strong>${esc(p.name)}</strong> <span class="sub">${esc(p.champion)}${ROLE[p.position] ? ` · ${ROLE[p.position]}` : ''}</span>
        <div class="sub">${p.kills} / ${p.deaths} / ${p.assists} · ${((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2)} KDA</div></div>
      <div class="gg-badges">${lobby}${tag}</div>
      <span class="score ${scoreClass(p.score)}">${p.score.toFixed(1)}</span>
    </div>`;
  }).join('');

  const bars = METRICS.map((metric) => {
    const best = Math.max(...g.players.map((p) => p.m[metric.key]));
    const rows = g.players.map((p) => {
      const v = p.m[metric.key];
      const w = Math.max(2, Math.min(100, (100 * v) / (g.lobbyMax[metric.key] || 1)));
      return `<div class="bar-row${v === best && v > 0 ? ' best' : ''}">
        <span class="bar-name">${esc(p.name)}</span>
        <span class="bar-track"><i style="width:${w}%;background:${friendColor(p.puuid)}"></i></span>
        <span class="bar-val">${metric.fmt(p.m)}</span>
      </div>`;
    }).join('');
    return `<div class="metric"><div class="metric-title">${metric.label}${metric.hint ? ` <span class="sub">(${metric.hint})</span>` : ''}</div>${rows}</div>`;
  }).join('');

  return `<article class="gg open">${header}
    <div class="gg-body">
      <div class="gg-ranking">${ranking}</div>
      <div class="metrics">${bars}</div>
      <p class="sub">Barra llena = el mejor de los 10 jugadores de la partida. El orden usa el score de 0 a 10.</p>
    </div>
  </article>`;
}

function renderTogether() {
  const games = board.groupGames ?? [];
  const sec = $('#together');
  sec.hidden = games.length === 0;
  if (!games.length) return;
  if (openGames.size === 0 && !renderTogether.init) openGames.add(games[0].matchId);
  renderTogether.init = true;

  const s = board.groupSummary;
  const wr = Math.round((100 * s.wins) / Math.max(1, s.games));
  $('#together-summary').innerHTML = `
    <p class="muted">${s.games} partidas con 2 o más de ustedes en el mismo equipo · <strong class="${wr >= 50 ? 'up' : 'down'}">${s.wins}V ${s.games - s.wins}D (${wr}%)</strong></p>
    <div class="together-grid">
      <div class="tcard"><div class="metric-title">Cuando juegan juntos</div>
        ${s.players.map((p) => `<div class="trow"><span>${esc(p.name)}</span><span class="sub">${p.games} partidas · ${p.winrate}% WR · 👑${p.carries} 🎒${p.last}</span><span class="score ${scoreClass(p.score)}">${p.score.toFixed(1)}</span></div>`).join('')}
      </div>
      <div class="tcard"><div class="metric-title">Dúos</div>
        ${s.duos.slice(0, 6).map((d) => `<div class="trow"><span>${d.names.map(esc).join(' + ')}</span><span class="sub">${d.games} partidas</span><strong class="${d.winrate >= 50 ? 'up' : 'down'}">${d.wins}V ${d.games - d.wins}D</strong></div>`).join('')}
      </div>
    </div>`;

  const list = showAllGames ? games : games.slice(0, 8);
  $('#together-games').innerHTML = list.map(groupGameHtml).join('') +
    (games.length > list.length ? `<button id="more-games">Ver las ${games.length} partidas</button>` : '');
}

async function load() {
  board = await (await fetch(`leaderboard.json?t=${Date.now()}`, { cache: 'no-store' })).json();
  render();
}

// ---------- refresh ----------

async function pollStatus() {
  // GitHub Pages never has the local server's api/, so don't ask.
  const res = location.hostname.endsWith('github.io') ? null : await fetch('api/status').catch(() => null);
  if (!res?.ok) {
    // Static site (GitHub Pages): no server here. Updates run on GitHub, started on a schedule
    // or through the update Worker if one is configured.
    staticMode = true;
    $('#refresh').hidden = !board?.updateUrl;
    $('#refresh').textContent = '⟳ Actualizar ahora';
    $('#refresh').title = 'Busca partidas nuevas en Riot (tarda 1–2 minutos)';
    return;
  }
  const st = await res.json();
  const box = $('#status');
  $('#refresh').disabled = st.running;
  if (st.running) {
    const { done = 0, total = 1, current } = st.progress ?? {};
    box.className = 'status';
    box.hidden = false;
    box.innerHTML = `Actualizando ${current ? esc(current) : ''} (${done}/${total})… la primera vez puede tardar unos minutos por los límites de la API de Riot.
      <div class="bar"><i style="width:${(100 * done) / total}%"></i></div>`;
    setTimeout(pollStatus, 1500);
  } else {
    box.hidden = !st.error;
    box.className = 'status error';
    box.textContent = st.error ?? '';
    if (pollStatus.wasRunning) load();
  }
  pollStatus.wasRunning = st.running;
}

// ---------- wiring ----------

$('#board').addEventListener('click', (e) => {
  const row = e.target.closest('.row');
  if (!row) return;
  const id = row.dataset.puuid;
  open.has(id) ? open.delete(id) : open.add(id);
  render();
});

window.addEventListener('hashchange', () => {
  selectedChamp = null;
  showAllChamps = false;
  render();
  window.scrollTo(0, 0);
});

// Chart hover: the crosshair snaps to the nearest point, so readers aim at a date, not a 2px line.
$('#view-player').addEventListener('pointermove', (e) => {
  const el = e.target.closest('.chart');
  if (!el) return;
  const pts = charts.get(el.dataset.chart);
  const r = el.querySelector('svg').getBoundingClientRect();
  const vx = ((e.clientX - r.left) / r.width) * CHART_W;
  let best = 0;
  pts.forEach((p, i) => { if (Math.abs(p.x - vx) < Math.abs(pts[best].x - vx)) best = i; });
  showChartPoint(el, best);
});
$('#view-player').addEventListener('pointerleave', (e) => {
  if (e.target.classList?.contains('chart')) hideChartPoint(e.target);
}, true);
$('#view-player').addEventListener('focusin', (e) => {
  if (e.target.classList?.contains('chart')) showChartPoint(e.target, charts.get(e.target.dataset.chart).length - 1);
});
$('#view-player').addEventListener('focusout', (e) => {
  if (e.target.classList?.contains('chart')) hideChartPoint(e.target);
});
$('#view-player').addEventListener('keydown', (e) => {
  const champRow = e.target.closest?.('.champ-row');
  if (champRow && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    return champRow.click();
  }
  const el = e.target.closest?.('.chart');
  if (!el || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  showChartPoint(el, Number(el.dataset.index ?? 0) + (e.key === 'ArrowRight' ? 1 : -1));
});

$('#view-player').addEventListener('change', (e) => {
  if (e.target.id === 'player-select') location.hash = `#p/${e.target.value}`;
  if (e.target.id === 'duel-a' || e.target.id === 'duel-b') {
    duelA = $('#duel-a').value;
    duelB = $('#duel-b').value;
    render();
  }
});

$('#view-player').addEventListener('click', (e) => {
  if (e.target.closest('.show-all-champs')) {
    showAllChamps = true;
    return render();
  }
  if (e.target.closest('.close-champ')) {
    selectedChamp = null;
    return render();
  }
  const row = e.target.closest('.champ-row');
  if (row) {
    selectedChamp = selectedChamp === row.dataset.champ ? null : row.dataset.champ;
    render();
    // Bring the panel into view (it sits under the table, which can be long).
    $('#champ-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const chip = e.target.closest('[data-queue]');
  if (!chip) return;
  profileQueue = chip.dataset.queue;
  render();
});

$('#together-games').addEventListener('click', (e) => {
  if (e.target.id === 'more-games') {
    showAllGames = true;
    return renderTogether();
  }
  const head = e.target.closest('.gg-head');
  if (!head) return;
  const id = head.dataset.match;
  openGames.has(id) ? openGames.delete(id) : openGames.add(id);
  renderTogether();
});

document.querySelectorAll('#sort-nav button').forEach((b) =>
  b.addEventListener('click', () => {
    sortBy = b.dataset.sort;
    document.querySelectorAll('#sort-nav button').forEach((x) => x.classList.toggle('active', x === b));
    render();
  }),
);

$('#refresh').addEventListener('click', async () => {
  if (staticMode) return remoteUpdate();
  await fetch('api/refresh', { method: 'POST' });
  pollStatus();
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function showStatus(html, kind = '') {
  const box = $('#status');
  box.className = `status ${kind}`;
  box.hidden = false;
  box.innerHTML = html;
}

// Static site: ask the Worker to start the GitHub update, then wait for the new data to land.
async function remoteUpdate() {
  const btn = $('#refresh');
  btn.disabled = true;
  try {
    showStatus('Iniciando la actualización…');
    let r;
    try {
      r = await (await fetch(board.updateUrl, { method: 'POST' })).json();
    } catch {
      return showStatus('No se pudo contactar al servicio de actualización. Inténtalo de nuevo en un rato.', 'error');
    }
    if (r.error) return showStatus(`La actualización no pudo empezar: ${esc(r.error)}`, 'error');
    if (r.result === 'cooldown') {
      const min = Math.ceil(r.retryInSec / 60);
      return showStatus(`Se actualizó hace menos de 5 minutos. Puedes actualizar de nuevo en ${min} minuto${min === 1 ? '' : 's'}.`);
    }

    const before = board.updatedAt;
    const started = Date.now();
    for (let i = 0; Date.now() - started < 6 * 60_000; i++) {
      const secs = Math.round((Date.now() - started) / 1000);
      showStatus(`${r.result === 'running' ? 'Ya hay una actualización en curso' : 'Actualización iniciada'}. Buscando partidas nuevas… (${secs} s, suele tardar 1–2 minutos)
        <div class="bar indeterminate"><i></i></div>`);
      await sleep(8000);
      const fresh = await fetch(`leaderboard.json?t=${Date.now()}`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
      if (fresh?.updatedAt > before) {
        board = fresh;
        render();
        $('#status').hidden = true;
        return toast('¡Actualizado con las últimas partidas!');
      }
      if (i % 3 === 2) {
        const st = await fetch(board.updateUrl).then((x) => x.json()).catch(() => null);
        if (st?.last?.status === 'completed' && st.last.conclusion !== 'success' && Date.parse(st.last.createdAt) >= started - 60_000) {
          return showStatus('La actualización falló (quizás venció la clave de la API de Riot). Los datos son de la última actualización buena.', 'error');
        }
      }
    }
    showStatus('La actualización está tardando más de lo normal. Recarga la página en unos minutos.');
  } finally {
    btn.disabled = false;
  }
}

document.querySelectorAll('#sort-nav button').forEach((x) => x.classList.toggle('active', x.dataset.sort === sortBy));
// pollStatus needs the board to know whether an update button is available.
load().then(pollStatus);
