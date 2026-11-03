// Player pages, champion matchups, roasts and the website's Update button.
// Kept in its own module so the main app.js only has to call install(); it adds a
// "Jugadores" view, extends the player profile, and works inside the existing design.

let ctx;
const $ = (s, root = document) => root.querySelector(s);
const board = () => ctx.getBoard();

const QUEUE = { 420: 'Solo/Duo', 440: 'Flex' };
const kNum = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);
const pct = (x) => `${Math.round(100 * x)}%`;
const scoreClass = (s) => (s >= 8 ? 'px-s-great' : s >= 6.5 ? 'px-s-good' : s >= 5 ? 'px-s-ok' : 'px-s-low');
const scorePill = (s) => `<span class="px-score ${scoreClass(s)}">${s.toFixed(1)}</span>`;
const ordinal = (n) => `${n}°`;
const timeAgo = (ts) => {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 60) return `hace ${m} min`;
  if (m < 1440) return `hace ${Math.round(m / 60)} h`;
  return `hace ${Math.round(m / 1440)} d`;
};

// Profile state (reset when switching players).
const state = { puuid: null, queue: 'all', champ: null, allChamps: false };

export function install(context) {
  ctx = context;
  injectStyles();
  installPlayersView();
  wrapProfile();
  installRemoteUpdate();
}

function injectStyles() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL(`profile-plus.css${new URL(import.meta.url).search}`, import.meta.url).href;
  document.head.append(link);
}

// ---------------------------------------------------------------- stats helpers

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
    place: avg((g) => g.place ?? 5.5),
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
    mvp: total((g) => g.mvp), ace: total((g) => g.ace),
  };
}

const queueGames = (p) => (p.games ?? []).filter((g) => state.queue === 'all' || String(g.queueId) === state.queue);

function gameRow(g) {
  const kda = ((g.kills + g.assists) / Math.max(1, g.deaths)).toFixed(2);
  return `<div class="px-game ${g.win ? 'w' : 'l'}" data-match-id="${ctx.esc(g.matchId)}" title="Ver detalle de la partida">
    <b></b>
    <img src="${ctx.champImg(g.champion)}" alt="" onerror="this.style.visibility='hidden'">
    <div><strong>${g.kills} / ${g.deaths} / ${g.assists}</strong><div class="px-sub">${kda} KDA · ${g.cs} CS</div></div>
    <div class="px-sub px-hide-sm">${ctx.esc(g.champion)}${g.opp ? ` vs ${ctx.esc(g.opp.champion)}` : ''} · ${ctx.ROLE[g.position] ?? '—'} · ${QUEUE[g.queueId] ?? 'Ranked'}<br>${g.win ? 'Victoria' : 'Derrota'} · ${g.minutes}m · ${timeAgo(g.endTs)}</div>
    <div class="px-place">${g.mvp ? '<span class="px-badge mvp">MVP</span>' : g.ace ? '<span class="px-badge ace">ACE</span>' : ''}<span class="px-badge">${ordinal(g.place)} / 10</span></div>
    ${scorePill(g.score)}
  </div>`;
}

// ---------------------------------------------------------------- "Jugadores" view

function installPlayersView() {
  const main = $('.content-body');
  if (!main || $('#view-players')) return;
  const section = document.createElement('section');
  section.id = 'view-players';
  section.className = 'view-section';
  main.append(section);

  // Sidebar: right after "Leaderboard".
  const lb = $('.sidebar-nav [data-view="leaderboard"]')?.closest('li');
  if (lb) {
    const li = document.createElement('li');
    li.innerHTML = '<a class="nav-link" data-view="players" href="#players"><span class="nav-icon">👤</span><span>Jugadores</span></a>';
    lb.after(li);
  }
  // Mobile bottom bar: before "Gestionar".
  const mobileManage = $('#mobile-manage-btn');
  if (mobileManage) {
    const btn = document.createElement('button');
    btn.className = 'mobile-nav-item';
    btn.dataset.view = 'players';
    btn.innerHTML = '<span class="mobile-nav-icon">👤</span><span>Jugadores</span>';
    mobileManage.before(btn);
  }
  document.querySelectorAll('[data-view="players"]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    location.hash = 'players';
    showPlayers();
  }));
  window.addEventListener('hashchange', () => { if (location.hash === '#players') showPlayers(); });
  if (location.hash === '#players') setTimeout(showPlayers, 0);
}

function showPlayers() {
  const b = board();
  const section = $('#view-players');
  if (!b || !section) return;
  ctx.switchView('players');
  const title = $('#page-title');
  if (title) title.textContent = 'Jugadores';
  const players = [...b.players].sort((x, y) => (y.solo?.value ?? -1) - (x.solo?.value ?? -1));
  section.innerHTML = `
    <div class="px-intro">
      <h2>👤 Jugadores</h2>
      <p class="px-sub">Elegí un jugador para ver sus stats, carriles, campeones con matchups, qué tiene que mejorar y su roast.</p>
    </div>
    <div class="px-pgrid">${players.map((p) => {
      const focus = eloAnalysis(p.games ?? [])?.workOn[0];
      return `<button class="px-pcard" data-puuid="${ctx.esc(p.puuid)}">
        <img src="${ctx.iconImg(p.profileIconId)}" alt="" style="border-color:${ctx.tierColor(p)}">
        <span class="px-pcard-main">
          <strong>${ctx.esc(p.name)}</strong>
          ${p.nickname ? `<span class="px-nick">“${ctx.esc(p.nickname.title)}” ${p.nickname.emoji}</span>` : ''}
          <span style="color:${ctx.tierColor(p)}; font-weight:600;">${ctx.esc(p.solo?.label ?? 'Unranked')}</span>
          ${focus ? `<span class="px-sub">🎯 A mejorar: ${focus.metric.short}</span>` : ''}
        </span>
        ${p.stats ? scorePill(p.stats.avgScore) : ''}
      </button>`;
    }).join('')}</div>`;
  section.querySelectorAll('.px-pcard').forEach((el) => el.addEventListener('click', () => {
    location.hash = `player:${el.dataset.puuid}`;
  }));
}

// ---------------------------------------------------------------- profile extension

function wrapProfile() {
  const base = window.viewPlayerProfile;
  if (!base) return;
  window.viewPlayerProfile = function (puuid) {
    base(puuid);
    if (state.puuid !== puuid) Object.assign(state, { puuid, queue: 'all', champ: null, allChamps: false });
    extendProfile(puuid);
  };
  // The back button returns to the players grid instead of the leaderboard.
  const back = $('#back-from-player-btn');
  if (back) {
    back.textContent = '← Volver a Jugadores';
    back.addEventListener('click', (e) => {
      e.stopImmediatePropagation();
      location.hash = 'players';
      showPlayers();
    }, true);
  }
}

function extendProfile(puuid) {
  const p = board()?.players.find((x) => x.puuid === puuid);
  const content = $('#player-profile-content');
  if (!p || !content) return;

  // Player switcher at the top.
  if (!$('.px-switcher', content)) {
    const options = [...board().players].sort((a, b) => a.name.localeCompare(b.name))
      .map((x) => `<option value="${ctx.esc(x.puuid)}" ${x === p ? 'selected' : ''}>${ctx.esc(x.name)}</option>`).join('');
    content.insertAdjacentHTML('afterbegin', `<div class="px-switcher"><label class="px-sub">Ver jugador <select>${options}</select></label></div>`);
    $('.px-switcher select', content).addEventListener('change', (e) => { location.hash = `player:${e.target.value}`; });
  }

  // Replace the old "most played" cards with the full champion section below.
  [...content.querySelectorAll('h3')].filter((h) => /Campeones Más Jugados/i.test(h.textContent)).forEach((h) => {
    h.nextElementSibling?.remove();
    h.remove();
  });

  let extras = $('#px-extras', content);
  if (!extras) {
    extras = document.createElement('div');
    extras.id = 'px-extras';
    const anchor = $('.lp-history-card', content);
    anchor ? anchor.after(extras) : content.append(extras);
    extras.addEventListener('click', onExtrasClick);
    extras.addEventListener('keydown', (e) => {
      const row = e.target.closest?.('.px-champ-row');
      if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); row.click(); }
    });
  }
  extras.innerHTML = profileExtrasHtml(p);
  charts.bind(extras);
}

function onExtrasClick(e) {
  const chip = e.target.closest('[data-queue]');
  if (chip) { state.queue = chip.dataset.queue; state.champ = null; return extendProfile(state.puuid); }
  if (e.target.closest('.px-show-all')) { state.allChamps = true; return extendProfile(state.puuid); }
  if (e.target.closest('.px-close-champ')) { state.champ = null; return extendProfile(state.puuid); }
  const row = e.target.closest('.px-champ-row');
  if (row) {
    state.champ = state.champ === row.dataset.champ ? null : row.dataset.champ;
    extendProfile(state.puuid);
    $('#px-champ-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const game = e.target.closest('.px-game[data-match-id]');
  if (game) ctx.openMatchModal?.(game.dataset.matchId);
}

function profileExtrasHtml(p) {
  const games = queueGames(p);
  const a = aggregate(games);
  const chips = [['all', 'Todas las ranked'], ['420', 'Solo/Duo'], ['440', 'Flex']]
    .map(([q, label]) => `<button class="px-chip ${state.queue === q ? 'active' : ''}" data-queue="${q}">${label}</button>`).join('');
  const head = `<div class="px-chips">${chips}<span class="px-sub">${a ? `Últimas ${a.n} partidas ranked` : ''}</span></div>`;
  if (!a) return `${head}<p class="px-sub">No hay partidas de esta cola en el historial reciente.</p>`;

  return `${head}
    <div class="px-headline">
      <div class="px-hl"><span class="px-sub">Score promedio</span>${scorePill(a.score)}<span class="px-sub">en ${a.n} partidas</span></div>
      <div class="px-hl"><span class="px-sub">Puesto promedio en la partida</span><strong class="px-big">${a.place.toFixed(1)}<small> / 10</small></strong><span class="px-sub">${a.mvp} MVP · ${a.ace} ACE</span></div>
      <div class="px-hl"><span class="px-sub">Win rate</span><strong class="px-big ${a.winrate >= 50 ? 'px-up' : 'px-down'}">${Math.round(a.winrate)}%</strong><span class="px-sub">${a.wins}V ${a.losses}D</span></div>
    </div>
    ${roastHtml(p)}
    <h3 class="px-h3">📊 Tendencia de Score</h3>${scoreChartHtml(games)}
    <h3 class="px-h3">⚖️ Vs jugadores de su elo</h3>${eloHtml(p, games)}
    <h3 class="px-h3">📋 Por partida vs el grupo</h3>${tilesHtml(p, a)}
    <h3 class="px-h3">🧭 Carriles</h3>${lanesHtml(games)}
    <h3 class="px-h3">🛡️ Campeones</h3>${champsHtml(games)}`;
}

// ---------------------------------------------------------------- roast

export function roastCard(p, { compact = false } = {}) {
  const r = p.roast;
  if (!r) return '';
  const date = new Date(r.endTs).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  return `<div class="px-roast">
    <div class="px-roast-head">
      <img src="${ctx.champImg(r.champion)}" alt="" onerror="this.style.visibility='hidden'">
      <div>
        <strong>🔥 Su peor partida</strong>
        <div class="px-sub">${ctx.esc(r.champion)}${r.opponent ? ` vs ${ctx.esc(r.opponent)}` : ''} · ${r.kda} · ${ordinal(r.place)} de 10 · ${r.win ? 'Victoria' : 'Derrota'} · ${date}</div>
      </div>
      ${scorePill(r.score)}
    </div>
    <p>${ctx.esc(r.text)}</p>
    <button class="px-link" data-roast-match="${ctx.esc(r.matchId)}">🔍 Ver la partida</button>
  </div>`;
}

function roastHtml(p) {
  return p.roast ? `<h3 class="px-h3">🎭 Roast</h3>${p.nickname ? `<p class="px-roast-nick"><span>${p.nickname.emoji}</span> <strong>“${ctx.esc(p.nickname.title)}”</strong> — ${ctx.esc(p.nickname.reason)}</p>` : ''}${roastCard(p, { compact: true })}` : '';
}

// Full roasts on the existing Apodos page.
export function renderRoasts() {
  const grid = $('#apodos-grid');
  const b = board();
  if (!grid || !b) return;
  const players = b.players.filter((p) => p.nickname || p.roast);
  grid.innerHTML = players.map((p) => `<article class="px-apodo">
    <div class="px-apodo-head">
      <span class="px-apodo-emoji">${p.nickname?.emoji ?? '🎭'}</span>
      <div>
        <strong>${ctx.esc(p.name)}</strong>
        ${p.nickname ? `<div class="px-nick">“${ctx.esc(p.nickname.title)}”</div>` : ''}
      </div>
    </div>
    ${p.nickname ? `<p class="px-sub">${ctx.esc(p.nickname.reason)}</p>` : ''}
    ${roastCard(p, { compact: true })}
  </article>`).join('');
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-roast-match]');
  if (btn) ctx?.openMatchModal?.(btn.dataset.roastMatch);
});

// ---------------------------------------------------------------- vs players at the same elo

const ELO_METRICS = [
  { key: 'damage', short: 'Daño', label: 'Daño a campeones', fmt: (v) => kNum(v),
    tip: (d) => `Hace un ${d.relPct}% menos de daño a campeones que sus rivales de línea. Buscar más tradeos en línea y quedarse en rango en las peleas.` },
  { key: 'deaths', short: 'Muertes', label: 'Muertes', lowerIsBetter: true, fmt: (v) => v.toFixed(1),
    tip: (d) => `Muere ${d.absDiff.toFixed(1)} veces más por partida que sus rivales. Wardear antes de cruzar el río y retroceder cuando el jungla enemigo no se ve en el mapa.` },
  { key: 'cs', short: 'CS', label: 'Súbditos (CS)', skipRole: 'UTILITY', fmt: (v) => Math.round(v),
    tip: (d) => `Farmea ${Math.round(d.absDiff)} súbditos menos por partida (unas ${Math.max(1, Math.round(d.absDiff / 20))} oleadas). Agarrar las oleadas laterales entre peleas y practicar last hit bajo torre.` },
  { key: 'kp', short: 'Participación', label: 'Participación en kills', fmt: (v) => pct(v), points: true,
    tip: (d) => `Está en ${Math.round(100 * d.absDiff)} puntos menos de las kills del equipo. Agruparse para dragones, heraldos y barones, y seguir los gankeos del jungla.` },
  { key: 'vision', short: 'Visión', label: 'Puntaje de visión', fmt: (v) => v.toFixed(1),
    tip: (d) => `Tiene ${d.absDiff.toFixed(1)} menos de visión por partida. Comprar un ward de control en cada vuelta a base y usar el trinket apenas esté disponible.` },
  { key: 'objectives', short: 'Objetivos', label: 'Daño a objetivos', fmt: (v) => kNum(v),
    tip: (d) => `Hace un ${d.relPct}% menos de daño a objetivos. Después de ganar una pelea, pegarle a torres, dragones y larvas en vez de volver a farmear.` },
  { key: 'gold', short: 'Oro', label: 'Oro', fmt: (v) => kNum(v),
    tip: (d) => `Gana ${kNum(d.absDiff)} menos de oro por partida. Casi todo viene del CS y las kills: seguir farmeando entre peleas.` },
];
const GAP = 0.08;

function eloAnalysis(games) {
  const withOpp = games.filter((g) => g.opp);
  if (withOpp.length < 3) return null;
  const rows = ELO_METRICS.map((metric) => {
    const list = withOpp.filter((g) => g.position !== metric.skipRole && g[metric.key] != null);
    if (list.length < 3) return null;
    const you = list.reduce((acc, g) => acc + g[metric.key], 0) / list.length;
    const them = list.reduce((acc, g) => acc + (g.opp[metric.key] ?? 0), 0) / list.length;
    const rel = metric.points ? (you - them) / 0.5 : (you - them) / Math.max(1e-9, Math.abs(them));
    return {
      metric, you, them, goodness: metric.lowerIsBetter ? -rel : rel,
      absDiff: Math.abs(you - them),
      relPct: Math.round(Math.abs(100 * (you - them)) / Math.max(1e-9, Math.abs(them))),
    };
  }).filter(Boolean);
  const outscored = withOpp.filter((g) => g.opp.score != null && g.score > g.opp.score).length;
  return {
    n: withOpp.length, rows, outscored,
    workOn: rows.filter((r) => r.goodness < -GAP).sort((x, y) => x.goodness - y.goodness).slice(0, 3),
    strengths: rows.filter((r) => r.goodness > GAP).sort((x, y) => y.goodness - x.goodness).slice(0, 3),
  };
}

function eloHtml(p, games) {
  const e = eloAnalysis(games);
  if (!e) return '<p class="px-sub">Faltan partidas con rival de línea para comparar.</p>';
  const tier = p.solo?.label?.replace(/ \d+ LP$/, '') ?? 'su rango';
  const diffText = (r) => {
    if (r.metric.points ? Math.round(100 * r.absDiff) === 0 : r.relPct === 0) return '±0';
    return r.metric.points ? `${r.you >= r.them ? '+' : '−'}${Math.round(100 * r.absDiff)} pts` : `${r.you >= r.them ? '+' : '−'}${r.relPct}%`;
  };
  const verdict = (r) => (Math.abs(r.goodness) < GAP ? ['px-muted', 'parejo'] : r.goodness > 0 ? ['px-up', 'mejor'] : ['px-down', 'peor']);
  const workOn = e.workOn.length
    ? e.workOn.map((r, i) => `<div class="px-advice"><strong>${i + 1}. ${r.metric.short}</strong><p>${r.metric.tip(r)}</p></div>`).join('')
    : '<div class="px-advice good"><p>Sin puntos débiles claros: iguala o supera a sus rivales de línea en todo. 👏</p></div>';
  return `<p class="px-sub">Comparado con el rival de su misma línea en cada una de estas ${e.n} partidas. El matchmaking de ranked empareja jugadores del mismo rango, así que son sus pares reales (${ctx.esc(tier)}).</p>
    <div class="px-headline compact"><div class="px-hl"><span class="px-sub">Le ganó al rival de línea</span><strong class="px-big ${e.outscored * 2 >= e.n ? 'px-up' : 'px-down'}">${Math.round((100 * e.outscored) / e.n)}%</strong><span class="px-sub">${e.outscored} de ${e.n} partidas, por score</span></div></div>
    <h4 class="px-h4">🎯 Qué tiene que mejorar</h4>${workOn}
    ${e.strengths.length ? `<h4 class="px-h4">💪 Fortalezas</h4><div class="px-chips">${e.strengths.map((r) => `<span class="px-chip static px-up">✅ ${r.metric.short} ${diffText(r)}</span>`).join('')}</div>` : ''}
    <h4 class="px-h4">Cara a cara</h4>
    <div class="px-table-wrap"><table class="px-table">
      <thead><tr><th>Por partida</th><th>${ctx.esc(p.name)}</th><th>Rivales de línea</th><th>Diferencia</th></tr></thead>
      <tbody>${e.rows.map((r) => {
        const [cls, word] = verdict(r);
        return `<tr><td>${r.metric.label}</td><td><strong>${r.metric.fmt(r.you)}</strong></td><td>${r.metric.fmt(r.them)}</td><td class="${cls}"><strong>${diffText(r)}</strong> · ${word}</td></tr>`;
      }).join('')}</tbody>
    </table></div>`;
}

// ---------------------------------------------------------------- per game vs the group

const TILES = [
  { key: 'damage', label: 'Daño / partida', fmt: (a) => kNum(a.damage), sub: (a) => `${pct(a.dmgShare)} del daño del equipo` },
  { key: 'cs', label: 'Súbditos / partida', fmt: (a) => Math.round(a.cs), sub: (a) => `${a.csMin.toFixed(1)} CS/min` },
  { key: 'deaths', label: 'Muertes / partida', fmt: (a) => a.deaths.toFixed(1), sub: (a) => `${a.kills.toFixed(1)} / ${a.deaths.toFixed(1)} / ${a.assists.toFixed(1)}`, lowerIsBetter: true },
  { key: 'kp', label: 'Participación en kills', fmt: (a) => pct(a.kp), sub: () => 'de las kills del equipo' },
  { key: 'objectives', label: 'Daño a objetivos', fmt: (a) => kNum(a.objectives), sub: () => 'torres, dragones, barones' },
  { key: 'vision', label: 'Visión / partida', fmt: (a) => a.vision.toFixed(1), sub: () => 'wards puestos y limpiados' },
  { key: 'gold', label: 'Oro / partida', fmt: (a) => kNum(a.gold), sub: () => '' },
  { key: 'kda', label: 'KDA', fmt: (a) => a.kda.toFixed(2), sub: () => '(kills + asistencias) / muertes' },
];

function tilesHtml(p, a) {
  const others = board().players.filter((x) => x !== p).map((x) => aggregate(queueGames(x))).filter(Boolean);
  return `<div class="px-tiles">${TILES.map((t) => {
    const v = a[t.key];
    const all = [v, ...others.map((o) => o[t.key])];
    const rank = all.filter((x) => (t.lowerIsBetter ? x < v : x > v)).length + 1;
    const groupAvg = others.length ? others.reduce((acc, o) => acc + o[t.key], 0) / others.length : null;
    const better = groupAvg == null ? null : t.lowerIsBetter ? v < groupAvg : v > groupAvg;
    return `<div class="px-tile">
      <span class="px-sub">${t.label}</span>
      <strong class="px-tile-num">${t.fmt(a)}</strong>
      <span class="px-sub">${t.sub(a)}</span>
      ${groupAvg == null ? '' : `<span class="px-tile-cmp ${better ? 'px-up' : 'px-down'}">${better ? '▲' : '▼'} prom. grupo ${t.fmt({ ...a, [t.key]: groupAvg })} · #${rank} de ${all.length}</span>`}
    </div>`;
  }).join('')}</div>`;
}

// ---------------------------------------------------------------- lanes

function lanesHtml(games) {
  const by = {};
  for (const g of games) (by[g.position || 'NONE'] ??= []).push(g);
  const rows = Object.entries(by).map(([role, list]) => {
    const a = aggregate(list);
    // Smoothed win rate (so 1-0 isn't "100%") blended with average score.
    return { role, a, strength: 0.5 * ((100 * (a.wins + 1)) / (a.n + 2)) + 0.5 * a.score * 10 };
  }).sort((x, y) => y.a.n - x.a.n);
  for (const min of [3, 2]) {
    const eligible = rows.filter((r) => r.a.n >= min);
    if (eligible.length >= 2) {
      const sorted = [...eligible].sort((x, y) => y.strength - x.strength);
      sorted[0].tag = 'best';
      sorted.at(-1).tag = 'worst';
      break;
    }
  }
  const best = rows.find((r) => r.tag === 'best');
  const worst = rows.find((r) => r.tag === 'worst');
  const name = (r) => ctx.ROLE[r.role] ?? 'Otro';
  return `${best ? `<p class="px-callout">💪 Mejor carril: <strong>${name(best)}</strong> · 🥀 Peor carril: <strong>${name(worst)}</strong></p>` : '<p class="px-sub">No hay suficientes partidas en distintos carriles para comparar.</p>'}
    <div class="px-table-wrap"><table class="px-table">
      <thead><tr><th>Carril</th><th>Partidas</th><th>Win rate</th><th>Score</th><th>Puesto</th><th>KDA</th><th>Daño</th><th>CS</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.tag ?? ''}">
        <td><strong>${name(r)}</strong> ${r.tag === 'best' ? '💪' : r.tag === 'worst' ? '🥀' : ''}</td>
        <td>${r.a.n}</td>
        <td class="${r.a.winrate >= 50 ? 'px-up' : 'px-down'}">${Math.round(r.a.winrate)}% <span class="px-sub">${r.a.wins}V ${r.a.losses}D</span></td>
        <td>${scorePill(r.a.score)}</td>
        <td>${r.a.place.toFixed(1)}</td>
        <td>${r.a.kda.toFixed(2)}</td>
        <td>${kNum(r.a.damage)}</td>
        <td>${Math.round(r.a.cs)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
}

// ---------------------------------------------------------------- champions + matchups

function champsHtml(games) {
  const champs = {};
  for (const g of games) (champs[g.champion] ??= []).push(g);
  const rows = Object.entries(champs).map(([c, list]) => ({ c, list, a: aggregate(list) }))
    .sort((x, y) => y.a.n - x.a.n || y.a.score - x.a.score);
  const shown = state.allChamps ? rows : rows.slice(0, 8);
  const sel = rows.find((r) => r.c === state.champ);
  return `<p class="px-sub">Tocá un campeón para ver sus matchups y partidas.</p>
    <div class="px-table-wrap"><table class="px-table">
      <thead><tr><th>Campeón</th><th>Partidas</th><th>Win rate</th><th>Score</th><th>Puesto</th><th>MVP</th><th>KDA</th><th></th></tr></thead>
      <tbody>${shown.map(({ c, a }) => `<tr class="px-champ-row${state.champ === c ? ' open' : ''}" data-champ="${ctx.esc(c)}" tabindex="0" aria-expanded="${state.champ === c}">
        <td class="px-champ-cell"><img src="${ctx.champImg(c)}" alt="" onerror="this.style.visibility='hidden'"> ${ctx.esc(c)}</td>
        <td>${a.n}</td>
        <td class="${a.winrate >= 50 ? 'px-up' : 'px-down'}">${Math.round(a.winrate)}% <span class="px-sub">${a.wins}V ${a.losses}D</span></td>
        <td>${scorePill(a.score)}</td>
        <td>${a.place.toFixed(1)}</td>
        <td>${a.mvp || '–'}</td>
        <td>${a.kda.toFixed(2)}</td>
        <td class="px-sub">${state.champ === c ? '▾' : '▸'}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    ${rows.length > 8 && !state.allChamps ? `<button class="px-show-all">Ver los ${rows.length} campeones</button>` : ''}
    ${sel ? `<section class="px-champ-detail" id="px-champ-detail">
      <div class="px-champ-detail-head">
        <img src="${ctx.champImg(sel.c)}" alt="" onerror="this.style.visibility='hidden'">
        <h4>${ctx.esc(sel.c)}</h4>
        <button class="px-close-champ" aria-label="Cerrar">✕</button>
      </div>
      ${champDetailHtml(sel.c, sel.list)}
    </section>` : ''}`;
}

function champDetailHtml(champ, list) {
  const a = aggregate(list);
  const laned = list.filter((g) => g.opp);
  const outscored = laned.filter((g) => g.score > (g.opp.score ?? 0)).length;
  const stat = (label, value, sub = '') => `<div class="px-cstat"><span class="px-sub">${label}</span><strong>${value}</strong>${sub ? `<span class="px-sub">${sub}</span>` : ''}</div>`;

  const byOpp = {};
  for (const g of laned) (byOpp[g.opp.champion] ??= []).push(g);
  const matchups = Object.entries(byOpp).map(([opp, gs]) => {
    const n = gs.length;
    const wins = gs.filter((g) => g.win).length;
    const mean = (fn) => gs.reduce((acc, g) => acc + fn(g), 0) / n;
    return {
      opp, n, wins, wr: (100 * wins) / n,
      you: mean((g) => g.score), them: mean((g) => g.opp.score ?? 0),
      gold: mean((g) => (g.gold ?? 0) - (g.opp.gold ?? 0)),
      cs: mean((g) => g.cs - (g.opp.cs ?? 0)),
    };
  }).sort((x, y) => y.n - x.n || y.wr - x.wr);
  // Best/worst only among matchups played twice or more, so one game can't decide it.
  const repeat = matchups.filter((m) => m.n >= 2);
  const strength = (m) => m.wr + 10 * (m.you - m.them);
  const best = repeat.length >= 2 ? [...repeat].sort((x, y) => strength(y) - strength(x))[0] : null;
  const worst = repeat.length >= 2 ? [...repeat].sort((x, y) => strength(x) - strength(y))[0] : null;
  const diff = (v) => `<span class="${v > 0 ? 'px-up' : v < 0 ? 'px-down' : 'px-muted'}">${v > 0 ? '+' : ''}${Math.round(v)}</span>`;

  return `<div class="px-cstats">
      ${stat('Win rate', `${Math.round(a.winrate)}%`, `${a.wins}V ${a.losses}D`)}
      ${stat('Score promedio', scorePill(a.score))}
      ${stat('Puesto promedio', `${a.place.toFixed(1)} / 10`, `${a.mvp} MVP · ${a.ace} ACE`)}
      ${stat('KDA', a.kda.toFixed(2), `${a.kills.toFixed(1)} / ${a.deaths.toFixed(1)} / ${a.assists.toFixed(1)}`)}
      ${stat('CS / min', a.csMin.toFixed(1), `${Math.round(a.cs)} por partida`)}
      ${stat('Daño / partida', kNum(a.damage), `${pct(a.dmgShare)} del equipo`)}
      ${laned.length ? stat('Le ganó al rival', `${Math.round((100 * outscored) / laned.length)}%`, `${outscored} de ${laned.length} por score`) : ''}
    </div>
    <h4 class="px-h4">Matchups con ${ctx.esc(champ)}</h4>
    ${matchups.length ? `
      ${best ? `<p class="px-callout">👍 Mejor matchup: <strong>${ctx.esc(best.opp)}</strong> (${best.wins}V ${best.n - best.wins}D) · 👎 Peor: <strong>${ctx.esc(worst.opp)}</strong> (${worst.wins}V ${worst.n - worst.wins}D)</p>` : ''}
      <div class="px-table-wrap"><table class="px-table">
        <thead><tr><th>Contra</th><th>Partidas</th><th>Win rate</th><th>Su score</th><th>Score rival</th><th>Dif. oro</th><th>Dif. CS</th></tr></thead>
        <tbody>${matchups.map((m) => `<tr class="${m === best ? 'best' : m === worst ? 'worst' : ''}">
          <td class="px-champ-cell"><img src="${ctx.champImg(m.opp)}" alt="" onerror="this.style.visibility='hidden'"> ${ctx.esc(m.opp)}</td>
          <td>${m.n}</td>
          <td class="${m.wr >= 50 ? 'px-up' : 'px-down'}">${Math.round(m.wr)}% <span class="px-sub">${m.wins}V ${m.n - m.wins}D</span></td>
          <td>${scorePill(m.you)}</td>
          <td>${scorePill(m.them)}</td>
          <td>${diff(m.gold)}</td>
          <td>${diff(m.cs)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <p class="px-sub">Rival = el enemigo en el mismo rol. Dif. de oro y CS por partida; + es a favor. Un matchup jugado una sola vez es solo una pista.</p>`
    : '<p class="px-sub">No hay rivales de línea registrados con este campeón.</p>'}
    <h4 class="px-h4">Partidas con ${ctx.esc(champ)}</h4>
    <div class="px-games">${list.map(gameRow).join('')}</div>`;
}

// ---------------------------------------------------------------- score trend chart

const CHART_W = 480, CHART_H = 210, LINE = '#c98500';
const charts = {
  data: new Map(),
  bind(root) {
    root.querySelectorAll('.px-chart').forEach((el) => {
      const pts = this.data.get(el.dataset.chart);
      if (!pts) return;
      const show = (i) => showPoint(el, pts, i);
      el.addEventListener('pointermove', (e) => {
        const r = el.querySelector('svg').getBoundingClientRect();
        const vx = ((e.clientX - r.left) / r.width) * CHART_W;
        let best = 0;
        pts.forEach((p, i) => { if (Math.abs(p.x - vx) < Math.abs(pts[best].x - vx)) best = i; });
        show(best);
      });
      el.addEventListener('pointerleave', () => hidePoint(el));
      el.addEventListener('focus', () => show(pts.length - 1));
      el.addEventListener('blur', () => hidePoint(el));
      el.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        e.preventDefault();
        show(Number(el.dataset.index ?? pts.length - 1) + (e.key === 'ArrowRight' ? 1 : -1));
      });
    });
  },
};

function showPoint(el, pts, index) {
  const i = Math.max(0, Math.min(pts.length - 1, index));
  const p = pts[i];
  el.dataset.index = i;
  const xh = el.querySelector('.px-xhair');
  xh.setAttribute('x1', p.x); xh.setAttribute('x2', p.x); xh.setAttribute('visibility', 'visible');
  const hd = el.querySelector('.px-hdot');
  hd.setAttribute('cx', p.x); hd.setAttribute('cy', p.y); hd.setAttribute('visibility', 'visible');
  // Values lead, labels follow; built with textContent because champion names come from the API.
  const tip = el.querySelector('.px-tip');
  tip.replaceChildren(...p.rows.map(([value, label]) => {
    const row = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = value;
    const span = document.createElement('span');
    span.textContent = ` ${label}`;
    row.append(strong, span);
    return row;
  }));
  tip.hidden = false;
  const w = el.clientWidth;
  tip.style.left = `${Math.min(Math.max((p.x / CHART_W) * w - tip.offsetWidth / 2, 0), w - tip.offsetWidth)}px`;
}

function hidePoint(el) {
  el.querySelector('.px-xhair')?.setAttribute('visibility', 'hidden');
  el.querySelector('.px-hdot')?.setAttribute('visibility', 'hidden');
  el.querySelector('.px-tip').hidden = true;
}

function scoreChartHtml(games) {
  const chrono = [...games].sort((a, b) => a.endTs - b.endTs);
  if (chrono.length < 3) return '<p class="px-sub">Todavía no hay suficientes partidas.</p>';
  const L = 40, R = 14, T = 16, B = 30;
  const sx = (i) => L + (i / (chrono.length - 1)) * (CHART_W - L - R);
  const sy = (v) => T + (1 - v / 10) * (CHART_H - T - B);
  const date = (ts) => new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  const pts = chrono.map((g, i) => {
    const win = chrono.slice(Math.max(0, i - 4), i + 1);
    const avg = win.reduce((acc, x) => acc + x.score, 0) / win.length;
    return { i, g, avg, x: sx(i), y: sy(avg), rows: [[avg.toFixed(1), `promedio de ${win.length} partidas`], [g.score.toFixed(1), `${g.champion} · ${g.win ? 'Victoria' : 'Derrota'} · ${date(g.endTs)}`]] };
  });
  const id = `px-chart-${Math.random().toString(36).slice(2)}`;
  charts.data.set(id, pts);
  const ticks = [...new Set([0, 1, 2, 3].map((k) => Math.round((k * (chrono.length - 1)) / 3)))];
  const last = pts.at(-1);
  return `<div class="px-chart-card">
    <div class="px-legend"><span class="px-key-line"></span>Promedio de 5 partidas <span class="px-key-dot"></span>Partida individual</div>
    <div class="px-chart" data-chart="${id}" tabindex="0" aria-label="Score de las últimas ${chrono.length} partidas. Flechas para recorrer.">
      <svg viewBox="0 0 ${CHART_W} ${CHART_H}" role="img" aria-label="Tendencia de score">
        ${[0, 2, 4, 6, 8, 10].map((v) => `<line class="px-grid" x1="${L}" x2="${CHART_W - R}" y1="${sy(v)}" y2="${sy(v)}"/><text class="px-axis" x="${L - 8}" y="${sy(v) + 4}" text-anchor="end">${v}</text>`).join('')}
        ${ticks.map((i, k) => `<text class="px-axis" x="${sx(i)}" y="${CHART_H - 8}" text-anchor="${k === 0 ? 'start' : k === ticks.length - 1 ? 'end' : 'middle'}">${date(chrono[i].endTs)}</text>`).join('')}
        ${pts.map((p) => `<circle class="px-gdot" cx="${p.x}" cy="${sy(p.g.score)}" r="3"/>`).join('')}
        <path d="${pts.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')}" fill="none" stroke="${LINE}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <circle class="px-ring" cx="${last.x}" cy="${last.y}" r="5" fill="${LINE}"/>
        <text class="px-end" x="${last.x - 8}" y="${last.y - 10}" text-anchor="end">${last.avg.toFixed(1)}</text>
        <line class="px-xhair" x1="0" x2="0" y1="${T}" y2="${CHART_H - B}" visibility="hidden"/>
        <circle class="px-hdot px-ring" r="5" fill="${LINE}" visibility="hidden"/>
      </svg>
      <div class="px-tip" hidden></div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- Update button on the website

// GitHub Pages has no server, so the button asks the Cloudflare Worker to start the GitHub
// update, then waits for the new data. On a local server the original handler keeps working.
function installRemoteUpdate() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('#header-refresh-btn');
    if (!btn) return;
    const local = await fetch('api/status').then((r) => r.ok).catch(() => false);
    if (local) return; // let app.js handle it
    e.stopPropagation();
    e.preventDefault();
    remoteUpdate(btn);
  }, true);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function remoteUpdate(btn) {
  const b = board();
  const banner = $('#sync-banner');
  const text = $('#sync-text');
  const fill = $('#sync-progress-fill');
  const status = (msg, pctDone) => {
    if (banner) banner.hidden = false;
    if (text) text.textContent = msg;
    if (fill && pctDone != null) fill.style.width = `${pctDone}%`;
  };
  const done = (msg) => {
    if (banner) banner.hidden = true;
    btn.disabled = false;
    if (msg) ctx.toast(msg);
  };
  if (!b?.updateUrl) return done('La actualización automática no está configurada.');

  btn.disabled = true;
  status('Iniciando la actualización…', 5);
  let r;
  try {
    r = await (await fetch(b.updateUrl, { method: 'POST' })).json();
  } catch {
    return done('No se pudo contactar al servicio de actualización. Probá de nuevo en un rato.');
  }
  if (r.error) return done(`No se pudo iniciar la actualización: ${r.error}`);
  if (r.result === 'cooldown') {
    const min = Math.ceil(r.retryInSec / 60);
    return done(`Se actualizó hace menos de 5 minutos. Podés volver a actualizar en ${min} min.`);
  }

  const before = b.updatedAt;
  const started = Date.now();
  for (let i = 0; Date.now() - started < 6 * 60_000; i++) {
    const secs = Math.round((Date.now() - started) / 1000);
    status(`${r.result === 'running' ? 'Ya hay una actualización en curso' : 'Actualización iniciada'}. Buscando partidas nuevas… (${secs}s, suele tardar 1–2 min)`, Math.min(95, 5 + secs / 1.3));
    await sleep(8000);
    const fresh = await fetch(`leaderboard.json?t=${Date.now()}`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
    if (fresh?.updatedAt > before) {
      status('¡Listo!', 100);
      await ctx.reload();
      return done('¡Actualizado con las últimas partidas!');
    }
    if (i % 3 === 2) {
      const st = await fetch(b.updateUrl).then((x) => x.json()).catch(() => null);
      if (st?.last?.status === 'completed' && st.last.conclusion !== 'success' && Date.parse(st.last.createdAt) >= started - 60_000) {
        return done('La actualización falló (quizás venció la API key de Riot). Se muestran los datos de la última actualización.');
      }
    }
  }
  done('La actualización está tardando más de lo normal. Recargá la página en unos minutos.');
}
