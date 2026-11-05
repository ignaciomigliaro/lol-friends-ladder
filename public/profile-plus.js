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

const CHAMP_SPLASH_MAP = {
  'Wukong': 'MonkeyKing',
  'MonkeyKing': 'MonkeyKing',
  "Kai'Sa": 'Kaisa',
  'Kaisa': 'Kaisa',
  "Cho'Gath": 'Chogath',
  'Chogath': 'Chogath',
  "Bel'Veth": 'Belveth',
  'Belveth': 'Belveth',
  "Kha'Zix": 'Khazix',
  'Khazix': 'Khazix',
  "Kog'Maw": 'KogMaw',
  'KogMaw': 'KogMaw',
  "K'Sante": 'KSante',
  'KSante': 'KSante',
  'LeBlanc': 'Leblanc',
  'Leblanc': 'Leblanc',
  'Nunu & Willump': 'Nunu',
  'Nunu': 'Nunu',
  'Renata Glasc': 'Renata',
  'Renata': 'Renata',
  "Vel'Koz": 'Velkoz',
  'Velkoz': 'Velkoz',
  'FiddleSticks': 'FiddleSticks',
  'Fiddlesticks': 'FiddleSticks',
};

function getChampSplashUrl(name) {
  if (ctx?.getChampSplashUrl) return ctx.getChampSplashUrl(name);
  if (!name) return 'assets/banner.jpg';
  const raw = String(name).trim();
  const id = board()?.champIds?.[raw] || CHAMP_SPLASH_MAP[raw] || CHAMP_SPLASH_MAP[raw.replace(/[^a-zA-Z0-9]/g, '')] || raw.replace(/[^a-zA-Z0-9]/g, '');
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${id}_0.jpg`;
}
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
    li.innerHTML = '<a class="nav-link" data-view="players" href="#players"><span class="nav-icon"><svg class="nav-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span><span>Jugadores</span></a>';
    lb.after(li);
  }
  // Mobile bottom bar: before "Gestionar".
  const mobileManage = $('#mobile-manage-btn');
  if (mobileManage) {
    const btn = document.createElement('button');
    btn.className = 'mobile-nav-item';
    btn.dataset.view = 'players';
    btn.innerHTML = '<span class="mobile-nav-icon"><svg class="nav-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span><span>Jugadores</span>';
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

let playersSortMode = 'rank';

function showPlayers(attempt = 0) {
  const b = board();
  const section = $('#view-players');
  if (!section) return;
  // Opened straight from a #players link: the data may still be loading.
  if (!b) return attempt < 50 && setTimeout(() => showPlayers(attempt + 1), 200);
  ctx.switchView('players');
  const title = $('#page-title');
  if (title) title.textContent = 'Jugadores del Grupo';

  const by = {
    rank: (p) => p.solo?.value ?? -1,
    flex: (p) => p.flex?.value ?? -1,
    winrate: (p) => p.stats?.winrate ?? -1,
    season: (p) => p.lpDelta?.season ?? p.lpDelta?.week ?? -9999,
    score: (p) => p.stats?.avgScore ?? -1,
  }[playersSortMode] ?? ((p) => p.solo?.value ?? -1);

  const players = [...b.players].sort((x, y) => by(y) - by(x));

  section.innerHTML = `
    <div class="players-heading-bar">
      <div class="heading-left">
        <h2 class="heading-title">Jugadores del Grupo</h2>
        <p class="muted heading-subtitle">
          Expediente competitivo detallado de cada invocador: líneas, campeones insignia, análisis táctico y carrilla semanal.
        </p>
      </div>
      <div class="pill-group players-sort-pills" id="players-sort-pills">
        <button class="pill-btn ${playersSortMode === 'rank' ? 'active' : ''}" data-psort="rank">Rank Duo</button>
        <button class="pill-btn ${playersSortMode === 'flex' ? 'active' : ''}" data-psort="flex">Flex</button>
        <button class="pill-btn ${playersSortMode === 'winrate' ? 'active' : ''}" data-psort="winrate">Victorias</button>
        <button class="pill-btn ${playersSortMode === 'season' ? 'active' : ''}" data-psort="season">Temporada</button>
        <button class="pill-btn ${playersSortMode === 'score' ? 'active' : ''}" data-psort="score">OP Score</button>
      </div>
    </div>

    <div class="px-pgrid">${players.map((p) => {
      const topChamp = p.topChampions?.[0]?.champion || (p.games?.[0] ? p.games[0].champion : 'Kai\'Sa');
      const splashUrl = getChampSplashUrl(topChamp);
      const soloTier = p.solo?.tier ? p.solo.tier.toLowerCase() : 'unranked';
      const flexTier = p.flex?.tier ? p.flex.tier.toLowerCase() : 'unranked';
      const soloLabel = p.solo?.label ?? 'Unranked';
      const flexLabel = p.flex?.label ?? 'Unranked';
      const wr = p.stats ? p.stats.winrate : 50;
      const wins = p.stats?.wins ?? 0;
      const losses = (p.stats?.games ?? 0) - wins;
      const kda = p.stats?.kda ?? '—';
      const dSeason = p.lpDelta?.season ?? p.lpDelta?.week ?? 0;
      const lpSeasonText = dSeason > 0 ? `+${dSeason} LP ▲` : dSeason < 0 ? `${dSeason} LP ▼` : '0 LP';
      const score = p.stats ? p.stats.avgScore.toFixed(1) : '—';
      const focus = eloAnalysis(p.games ?? [])?.workOn[0];
      const focusText = focus ? `Por mejorar: ${focus.metric.short}` : 'Rendimiento equilibrado';

      return `<button class="px-pcard" data-puuid="${ctx.esc(p.puuid)}">
        <div class="px-pcard-splash" style="background-image: linear-gradient(180deg, rgba(11, 19, 34, 0.35) 0%, rgba(11, 19, 34, 0.9) 55%, #0B1322 98%), url('${splashUrl}'), url('assets/banner.jpg');"></div>
        
        <div class="px-pcard-top">
          <div class="px-pcard-avatar-wrap">
            <img class="px-pcard-avatar tier-${soloTier}" src="${ctx.iconImg(p.profileIconId)}" alt="${ctx.esc(p.name)}" onerror="this.src='logo.jpg'">
            ${p.level ? `<span class="px-pcard-level">NVL ${p.level}</span>` : ''}
          </div>
          <div class="px-pcard-score-box" title="Calificación Oficial OP.GG">
            <span class="px-pcard-score-brand">OP.GG</span>
            <span class="px-pcard-score-val">${score}</span>
            <span class="px-pcard-score-lbl">SCORE</span>
          </div>
        </div>

        <div class="px-pcard-identity">
          <div class="px-pcard-name-row">
            <strong class="px-pcard-name">${ctx.esc(p.name)}</strong>
            ${p.nickname ? `<span class="px-pcard-nick">“${ctx.esc(p.nickname.title)}”</span>` : ''}
          </div>
          <span class="px-pcard-riotid">${ctx.esc(p.riotId || p.name)}</span>
        </div>

        <div class="px-pcard-main-champ" title="Campeón insignia más jugado">
          <img class="px-pcard-champ-icon" src="${ctx.champImg(topChamp)}" alt="${ctx.esc(topChamp)}" onerror="this.style.display='none'">
          <span class="px-pcard-champ-txt">Campeón Principal: <strong class="px-pcard-champ-name">${ctx.esc(topChamp)}</strong></span>
          ${p.topChampions?.[0]?.games ? `<span class="px-pcard-champ-count">(${p.topChampions[0].games}p · ${p.topChampions[0].wins}V)</span>` : ''}
        </div>

        <div class="px-pcard-ranks">
          <span class="px-rank-pill solo tier-${soloTier}" title="Clasificatoria Solo/Duo">
            <strong class="q-tag">Solo:</strong> ${ctx.esc(soloLabel)}
          </span>
          <span class="px-rank-pill flex tier-${flexTier}" title="Clasificatoria Flex">
            <strong class="q-tag">Flex:</strong> ${ctx.esc(flexLabel)}
          </span>
        </div>

        <div class="px-pcard-stats-grid">
          <div class="px-pstat" title="Porcentaje de Victorias">
            <span class="px-pstat-lbl">WR</span>
            <strong class="px-pstat-val">${wr}%</strong>
            <span class="px-pstat-sub">${wins}V-${losses}D</span>
          </div>
          <div class="px-pstat" title="Ratio KDA = (Kills + Asistencias) ÷ Muertes">
            <span class="px-pstat-lbl">KDA</span>
            <strong class="px-pstat-val">${kda}</strong>
            <span class="px-pstat-sub">Ratio</span>
          </div>
          <div class="px-pstat" title="Puntos de Liga en la temporada">
            <span class="px-pstat-lbl">Temporada</span>
            <strong class="px-pstat-val ${dSeason >= 0 ? 'pos' : 'neg'}">${lpSeasonText}</strong>
            <span class="px-pstat-sub">LP Netos</span>
          </div>
        </div>

        <div class="px-pcard-footer">
          <span class="px-pcard-focus-tag" title="${focus ? ctx.esc(focus.metric.tip?.(focus) || '') : ''}">
            <span class="focus-dot"></span>
            <span>${focusText}</span>
          </span>
          <span class="px-pcard-arrow">Ver perfil →</span>
        </div>
      </button>`;
    }).join('')}</div>`;

  section.querySelectorAll('.px-pcard').forEach((el) => el.addEventListener('click', () => {
    location.hash = `player:${el.dataset.puuid}`;
  }));

  section.querySelectorAll('[data-psort]').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    playersSortMode = btn.dataset.psort;
    showPlayers();
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
  let switcher = $('.px-switcher', content);
  if (!switcher) {
    const options = [...board().players].sort((a, b) => a.name.localeCompare(b.name))
      .map((x) => `<option value="${ctx.esc(x.puuid)}" ${x.puuid === p.puuid ? 'selected' : ''}>${ctx.esc(x.name)} (${ctx.esc(x.solo?.label || 'Unranked')})</option>`).join('');
    content.insertAdjacentHTML('afterbegin', `
      <div class="px-switcher">
        <label class="px-switcher-label">
          <span class="px-switcher-text">Invocador:</span>
          <select class="px-player-select">${options}</select>
        </label>
      </div>`);
    switcher = $('.px-switcher', content);
    switcher.querySelector('select')?.addEventListener('change', (e) => { location.hash = `player:${e.target.value}`; });
  } else {
    const sel = switcher.querySelector('select');
    if (sel && sel.value !== p.puuid) sel.value = p.puuid;
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
    .map(([q, label]) => `<button class="pill-btn ${state.queue === q ? 'active' : ''}" data-queue="${q}">${label}</button>`).join('');
  const head = `
    <div class="px-queue-toolbar">
      <div class="pill-group px-queue-pills">${chips}</div>
      <span class="px-sub px-queue-count">${a ? `Muestra: Últimas ${a.n} partidas ranked` : ''}</span>
    </div>`;
  if (!a) return `${head}<p class="px-sub">No hay partidas de esta cola en el historial reciente.</p>`;

  return `${head}
    <div class="px-headline">
      <div class="px-hl">
        <span class="px-sub">Score promedio</span>
        ${scorePill(a.score)}
        <span class="px-sub">en ${a.n} partidas</span>
      </div>
      <div class="px-hl">
        <span class="px-sub">Puesto promedio en partida</span>
        <strong class="px-big">${a.place.toFixed(1)}<small> / 10</small></strong>
        <span class="px-sub">${a.mvp} MVP · ${a.ace} ACE</span>
      </div>
      <div class="px-hl">
        <span class="px-sub">Ratio de Victorias</span>
        <strong class="px-big ${a.winrate >= 50 ? 'px-up' : 'px-down'}">${Math.round(a.winrate)}%</strong>
        <span class="px-sub">${a.wins}V ${a.losses}D</span>
      </div>
    </div>
    ${roastHtml(p)}
    <h3 class="px-h3">Tendencia de Score</h3>${scoreChartHtml(games)}
    <h3 class="px-h3">Vs jugadores de su elo</h3>${eloHtml(p, games)}
    <h3 class="px-h3">Por partida vs el grupo</h3>${tilesHtml(p, a)}
    <h3 class="px-h3">Carriles</h3>${lanesHtml(games)}
    <h3 class="px-h3">Campeones</h3>${champsHtml(games)}`;
}

// ---------------------------------------------------------------- roast

export function roastCard(p, { compact = false } = {}) {
  const r = p.roast;
  if (!r) return '';
  const date = new Date(r.endTs).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  const oppChamp = r.opponent;

  return `<div class="px-roast">
    <div class="px-roast-head">
      <div class="px-roast-matchup-icons">
        <img class="px-roast-champ-icon" src="${ctx.champImg(r.champion)}" alt="${ctx.esc(r.champion)}" title="${ctx.esc(r.champion)}" onerror="this.style.visibility='hidden'">
        ${oppChamp ? `
          <span class="px-roast-vs-divider">vs</span>
          <img class="px-roast-rival-icon" src="${ctx.champImg(oppChamp)}" alt="${ctx.esc(oppChamp)}" title="${ctx.esc(oppChamp)}" onerror="this.style.visibility='hidden'">
        ` : ''}
      </div>
      <div style="flex:1; min-width:0;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <strong class="px-roast-title">Peor partida registrada</strong>
          <span class="px-roast-outcome ${r.win ? 'win' : 'loss'}">${r.win ? 'Victoria milagrosa' : 'Derrota humillante'}</span>
        </div>
        <div class="px-sub">
          ${ctx.esc(r.champion)}${oppChamp ? ` vs ${ctx.esc(oppChamp)}` : ''} · KDA: <strong>${r.kda}</strong> · ${ordinal(r.place)} de 10 · ${date}
        </div>
      </div>
      ${scorePill(r.score)}
    </div>
    <p>${ctx.esc(r.text)}</p>
    <button class="px-link px-roast-action-btn" type="button" data-roast-match="${ctx.esc(r.matchId)}">⚔️ Ver Repetición de la Vergüenza 5v5 →</button>
  </div>`;
}

function roastHtml(p) {
  return p.roast ? `<h3 class="px-h3">Carrilla de la Semana</h3>${p.nickname ? `<p class="px-roast-nick"><strong>“${ctx.esc(p.nickname.title)}”</strong> — ${ctx.esc(p.nickname.reason)}</p>` : ''}${roastCard(p, { compact: true })}` : '';
}

// Full roasts on the existing Apodos page.
export function renderRoasts() {
  const grid = $('#apodos-grid');
  const b = board();
  if (!grid || !b) return;
  const players = b.players.filter((p) => p.nickname || p.roast);

  const toxicTags = [
    { key: 'Feeder', tag: '💀 CASO PERDIDO' },
    { key: 'Oro', tag: '💸 PATROCINADOR VIP' },
    { key: 'Vegano', tag: '🥗 PACIFISTA DE FARM' },
    { key: 'Algodón', tag: '☁️ BALAS DE SALVA' },
    { key: 'Orejón', tag: '📉 SOPORTE DEL FONDO' },
    { key: 'Ni Fu', tag: '😐 ESPECTADOR DE LUJO' },
  ];

  grid.innerHTML = players.map((p) => {
    const nickTitle = p.nickname?.title || '';
    const matchTag = toxicTags.find((t) => nickTitle.includes(t.key))?.tag || '🚨 ALERTA DE TOXICIDAD';
    const tier = p.soloTier || p.solo?.tier?.toLowerCase() || 'unranked';
    const rankLabel = p.solo?.label || 'Unranked';

    return `<article class="px-apodo">
      <div class="px-apodo-top-bar">
        <div class="px-apodo-player-info">
          <img class="px-apodo-avatar tier-${tier}" src="${p ? ctx.iconImg(p.profileIconId) : 'logo.jpg'}" alt="${ctx.esc(p.name)}" onerror="this.src='logo.jpg'">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <strong class="px-apodo-name">${ctx.esc(p.name)}</strong>
              <span class="px-apodo-rank-pill">${ctx.esc(rankLabel)}</span>
            </div>
            ${p.nickname ? `<div class="px-nick">“${ctx.esc(p.nickname.title)}”</div>` : ''}
          </div>
        </div>
        <span class="px-apodo-danger-tag">${matchTag}</span>
      </div>

      ${p.nickname ? `<p class="px-sub">${ctx.esc(p.nickname.reason)}</p>` : ''}

      <!-- Quick Flaw Stats Pills -->
      <div class="px-apodo-stats-row">
        <span class="px-apodo-stat-chip">💀 ${p.stats?.avgDeaths ?? 0} Muertes/g</span>
        <span class="px-apodo-stat-chip">🎯 ${p.stats?.avgScore?.toFixed(1) ?? 0} OP.GG</span>
        <span class="px-apodo-stat-chip">📉 ${p.stats?.winrate ?? 0}% WR</span>
        <span class="px-apodo-stat-chip">⚔️ ${p.stats?.games ?? 0} Partidas</span>
      </div>

      ${roastCard(p, { compact: true })}
    </article>`;
  }).join('');
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
    tip: (d) => `Hace un ${d.relPct}% menos de daño a objetivos. Después de ganar una pelea o teamfight, pegarle a torres, dragones y larvas en vez de regresar a farmear.` },
  { key: 'gold', short: 'Oro', label: 'Oro', fmt: (v) => kNum(v),
    tip: (d) => `Gana ${kNum(d.absDiff)} menos de oro por partida. Casi todo viene del CS y las kills: seguir farmeando entre peleas.` },
];
const GAP = 0.08;

const COACHING_PLANS = {
  vision: {
    category: 'Control de Visión y Mapa',
    title: 'Dominio de Visión y Prevención de Emboscadas',
    priority: (idx) => (idx === 0 ? 'Prioridad #1 · Impacto Crítico' : idx === 1 ? 'Prioridad #2 · Alto Impacto' : 'Prioridad #3 · Impacto Medio'),
    diagnosis: (d, tier) => `Tu puntuación media de visión es de <strong>${d.metric.fmt(d.you)}</strong> frente a <strong>${d.metric.fmt(d.them)}</strong> de tus rivales en ${tier} (un déficit de <strong>${d.absDiff.toFixed(1)} puntos</strong>). Estás jugando a ciegas en momentos clave o acumulando las 2 cargas del tótem sin colocar, lo que te expone a gankeos letales y te deja sin información en objetivos.`,
    earlyGame: 'Coloca tu primer centinela defensivo en el río o entrada de la jungla rival entre el minuto 2:45 y 3:15 (tiempo pico del primer gank enemigo). Cada vez que vuelvas a base con 75g sobrantes, sal obligatoriamente con un Guardián de Control (Pink).',
    midLateGame: 'Llega 45 segundos antes de que aparezca un Dragón o Barón para disputar la visión del río. Si juegas soporte o jungla, cambia al Lente del Oráculo al minuto 14 y barre los arbustos de pixel antes de iniciar peleas.',
    goldenRule: 'Nunca pases más de 30 segundos con las 2 cargas del Tótem de Visión disponibles. Centinela en inventario es visión y seguridad desperdiciada.',
    drill: 'Monitorea el minimapa cada 4 segundos. Si el mapa está oscuro en tu lado del río, no des ni un paso más allá de la mitad de tu carril.'
  },
  cs: {
    category: 'Economía y Control de Oleadas',
    title: 'Eficiencia de Farmeo y Recolección de Oleadas',
    priority: (idx) => (idx === 0 ? 'Prioridad #1 · Impacto Crítico' : idx === 1 ? 'Prioridad #2 · Alto Impacto' : 'Prioridad #3 · Impacto Medio'),
    diagnosis: (d, tier) => `Farmeas un promedio de <strong>${Math.round(d.you)} súbditos</strong> frente a <strong>${Math.round(d.them)}</strong> de tus rivales en ${tier} (pierdes <strong>${Math.round(d.absDiff)} súbditos</strong> por partida, unas ${Math.max(1, Math.round(d.absDiff / 20))} oleadas completas). Esto regala ~${Math.round(d.absDiff * 21)} de oro a tu oponente directo en cada juego, retrasando tus objetos cruciales.`,
    earlyGame: 'Perfecciona el último golpe bajo torre: los súbditos cuerpo a cuerpo aguantan 2 impactos de torre + 1 autoataque; los magos requieren 1 autoataque + 1 impacto de torre + 1 autoataque. Evita usar habilidades para farmear a menos que busques empujar rápido para volver a base.',
    midLateGame: 'No caigas en la trampa del ARAM en mid: entre los minutos 15 y 25, recoge las oleadas que se acumulan en las líneas laterales antes de agruparte para dragones o peleas. El 60% de tu déficit de CS ocurre en esta fase.',
    goldenRule: 'Mantén una meta mínima de 7.5 CS por minuto. Si caes por debajo de 6.0 CS/min, prioriza recoger una oleada lateral antes de cualquier rotación sin objetivo asegurado.',
    drill: 'Dedica 10 minutos en la herramienta de práctica sin objetos ni runas de daño de ataque, intentando alcanzar al menos 80 CS sin perder súbditos cañón.'
  },
  deaths: {
    category: 'Supervivencia y Posicionamiento',
    title: 'Disciplina de Supervivencia y Mitigación de Muertes',
    priority: (idx) => (idx === 0 ? 'Prioridad #1 · Impacto Crítico' : idx === 1 ? 'Prioridad #2 · Alto Impacto' : 'Prioridad #3 · Impacto Medio'),
    diagnosis: (d, tier) => `Mueres <strong>${d.metric.fmt(d.you)} veces</strong> por partida frente a <strong>${d.metric.fmt(d.them)}</strong> de tus rivales en ${tier} (+${d.absDiff.toFixed(1)} muertes por partida). Cada muerte innecesaria entrega 300+ de oro, apaga tu presencia en el mapa por 30-50 segundos y deja a tus aliados en desventaja 4v5 en objetivos.`,
    earlyGame: 'Si el jungla o el mid enemigo desaparece de la niebla de guerra, retrocede automáticamente al tercio seguro de tu línea. No te quedes bajo torre con menos del 35% de vida si sospechas un dive 2v1 o 3v1.',
    midLateGame: 'En peleas grupales (teamfights), respeta la zona de amenaza enemiga: espera a que el equipo rival gaste sus definitivas o habilidades clave de iniciación (Stuns, Hooks, Flashes) antes de lanzarte al combate.',
    goldenRule: 'Si vas 0/2 en línea, tu fase de juego cambia: renuncia a pelear el 1v1. Tu prioridad absoluta es aguantar la torre, absorber presión y dejarte carrear por tus líneas ganadoras.',
    drill: 'Proponte terminar tus siguientes 3 partidas ranked con un máximo de 4 muertes, priorizando la toma de decisiones conservadora y el tempo sobre kills dudosas.'
  },
  damage: {
    category: 'Presión Ofensiva y Daño en Peleas',
    title: 'Optimización de DPS y Presión en Combate',
    priority: (idx) => (idx === 0 ? 'Prioridad #1 · Impacto Crítico' : idx === 1 ? 'Prioridad #2 · Alto Impacto' : 'Prioridad #3 · Impacto Medio'),
    diagnosis: (d, tier) => `Generas <strong>${kNum(d.you)}</strong> de daño a campeones por partida, un <strong>${d.relPct}% menos</strong> que los rivales de ${tier} (${kNum(d.them)}). Refleja pasividad durante la fase de líneas o posicionamiento excesivamente temeroso durante las batallas en equipo.`,
    earlyGame: 'Aprovecha las ventanas de enfriamiento rival: si tu oponente usa su habilidad clave para limpiar súbditos, castígalo con un intercambio de daño inmediato. Ataca con autoataque cada vez que intente dar el último golpe a un súbdito cañón.',
    midLateGame: 'No reserves tus habilidades para el carry enemigo si está fuera de alcance: en peleas de equipo aplica tu daño al objetivo enemigo más cercano que puedas golpear sin morir (Front-to-Back), maximizando tu salida continua de DPS.',
    goldenRule: 'Al completar tu primer objeto clave o pico de nivel 6/11, fuerza de inmediato escaramuzas con ventaja de estadísticas antes de que el enemigo iguale tu economía.',
    drill: 'Revisa la repetición de tus peleas de equipo y analiza si estabas en rango efectivo de golpeo o si pasaste más de 4 segundos corriendo sin lanzar habilidades.'
  },
  kp: {
    category: 'Impacto Global y Rotaciones',
    title: 'Participación en Asesinatos y Presencia de Equipo',
    priority: (idx) => (idx === 0 ? 'Prioridad #1 · Impacto Crítico' : idx === 1 ? 'Prioridad #2 · Alto Impacto' : 'Prioridad #3 · Impacto Medio'),
    diagnosis: (d, tier) => `Tu participación en asesinatos es del <strong>${pct(d.you)}</strong>, quedando <strong>${Math.round(100 * d.absDiff)} puntos</strong> por debajo de tus rivales en ${tier} (${pct(d.them)}). Indica que juegas en una isla, desconectado de las peleas y escaramuzas donde se decide la partida.`,
    earlyGame: 'Empuja la oleada hasta la torre rival antes de rotar para asistir a tu jungla en el río, larvas del vacío o emboscadas a líneas vecinas. No rotes con oleadas muriendo bajo tu torre a menos que la pelea sea definitiva.',
    midLateGame: 'Sincroniza tus vueltas a base con los cronómetros de Dragón y Barón. Estar comprando en base cuando el objetivo aparece te quita toda la participación y deja a tu equipo en inferioridad numérica.',
    goldenRule: 'Si ves a tu jungla invadiendo o peleando el cangrejo en tu lado del río y tienes prioridad de línea, muévete de inmediato. Una llegada 3 segundos antes asegura la victoria de la escaramuza.',
    drill: 'En pantalla de carga, identifica la línea aliada con mayor facilidad para preparar asesinatos (hard CC) y planifica una rotación hacia ellos antes del minuto 12.'
  },
  objectives: {
    category: 'Macrogame y Cierre de Partidas',
    title: 'Conversión de Ventajas y Presión de Estructuras',
    priority: (idx) => (idx === 0 ? 'Prioridad #1 · Impacto Crítico' : idx === 1 ? 'Prioridad #2 · Alto Impacto' : 'Prioridad #3 · Impacto Medio'),
    diagnosis: (d, tier) => `Infliges <strong>${kNum(d.you)}</strong> de daño a objetivos frente a <strong>${kNum(d.them)}</strong> de tus rivales en ${tier} (un <strong>${d.relPct}% por debajo</strong>). Tiendes a eliminar rivales pero sin traducir esas bajas en torres destruidas, dragones o control de Barón.`,
    earlyGame: 'Cuando mates al rival de línea o lo fuerces a volver a base, golpea las placas de torre (125g c/u) antes del minuto 14, o rota a ayudar a tu jungla a asegurar las Larvas del Vacío.',
    midLateGame: 'Tras ganar una pelea grupal en mid/late game, la orden es demoler: tira torres, inhibidores o inicia el Barón de inmediato en lugar de volver a base a comprar con la barra de vida llena.',
    goldenRule: 'Toda muerte enemiga debe cobrarse con un objetivo en el mapa. Una kill sin torre, dragón o campamento enemigo robado es una oportunidad desperdiciada.',
    drill: 'Revisa tus partidas al finalizar y compara el daño a estructuras: busca ser siempre top 3 del equipo en demolición de torres.'
  },
  gold: {
    category: 'Aceleración Económica e Ingresos',
    title: 'Generación de Oro y Optimización de Compras',
    priority: (idx) => (idx === 0 ? 'Prioridad #1 · Impacto Crítico' : idx === 1 ? 'Prioridad #2 · Alto Impacto' : 'Prioridad #3 · Impacto Medio'),
    diagnosis: (d, tier) => `Generas <strong>${kNum(d.you)}</strong> de oro por partida frente a <strong>${kNum(d.them)}</strong> de tus rivales en ${tier} (déficit de <strong>${kNum(d.absDiff)}</strong> de oro). Este retraso aplaza tus picos de objetos en 2-4 minutos, dejándote en desventaja de poder en las peleas clave.`,
    earlyGame: 'Prioriza raspar placas de torre y asegura cada oleada de súbditos cañón. Evita volver a base con compras truncas (ej. comprar dagas sueltas) y planea recalls con oro suficiente para componentes principales.',
    midLateGame: 'Invade la jungla enemiga y roba campamentos cuando tu equipo tenga la visión y presión de líneas. No dejes oleadas muriendo solas en las torres de segundo nivel.',
    goldenRule: 'Programa tus recalls exactamente al alcanzar el oro de tu objeto principal (o su componente fuerte) y después de haber empujado la oleada.',
    drill: 'Fíjate como meta personal completar tu primer objeto mítico/legendario antes del minuto 12:30 a través de farm limpio y placas.'
  }
};

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
    ? `<div class="px-coaching-list">
        ${e.workOn.map((r, i) => {
          const plan = COACHING_PLANS[r.metric.key] || {
            category: 'Rendimiento en Partida',
            title: `Optimización de ${r.metric.short}`,
            priority: () => `Prioridad #${i + 1}`,
            diagnosis: () => r.metric.tip(r),
            earlyGame: 'Concéntrate en mantener tu posición segura y castigar errores del oponente durante los primeros 14 minutos.',
            midLateGame: 'Sigue a tu equipo en las peleas por objetivos y no te aísles en zonas no controladas.',
            goldenRule: 'Prioriza objetivos del mapa y consistencia sobre jugadas arriesgadas.',
            drill: 'Analiza tus estadísticas al terminar cada partida para verificar tu progreso.'
          };
          const pClass = i === 0 ? 'priority-1' : i === 1 ? 'priority-2' : 'priority-3';
          return `
            <article class="px-advice px-coaching-card ${pClass}">
              <div class="px-coaching-head">
                <div class="px-coaching-badges">
                  <span class="px-coaching-prio-tag ${pClass}">${plan.priority(i)}</span>
                  <span class="px-coaching-cat-tag">${plan.category}</span>
                </div>
                <div class="px-coaching-stats-row">
                  <span class="px-coaching-stat you" title="Tu promedio en este parámetro">
                    <span class="stat-k">Tú:</span>
                    <strong>${r.metric.fmt(r.you)}</strong>
                  </span>
                  <span class="px-coaching-stat vs" title="Promedio de los rivales de tu mismo rango">
                    <span class="stat-k">Rival (${ctx.esc(tier)}):</span>
                    <strong>${r.metric.fmt(r.them)}</strong>
                  </span>
                  <span class="px-coaching-stat gap ${verdict(r)[0]}" title="Diferencia comparativa">
                    <span class="stat-k">Déficit:</span>
                    <strong>${diffText(r)}</strong>
                  </span>
                </div>
              </div>

              <h5 class="px-coaching-card-title">${plan.title}</h5>

              <div class="px-coaching-section-box diagnosis">
                <div class="px-coaching-box-title">
                  <span class="px-dot red"></span>
                  <strong>Diagnóstico Táctico:</strong>
                </div>
                <p class="px-coaching-text">${plan.diagnosis(r, tier)}</p>
              </div>

              <div class="px-coaching-steps-grid">
                <div class="px-coaching-step early">
                  <div class="px-step-header">
                    <span class="px-step-badge">Paso 1</span>
                    <strong>Fase de Líneas (Minutos 0 - 14)</strong>
                  </div>
                  <p class="px-step-desc">${plan.earlyGame}</p>
                </div>
                <div class="px-coaching-step mid">
                  <div class="px-step-header">
                    <span class="px-step-badge">Paso 2</span>
                    <strong>Mid & Late Game (Minuto 14+)</strong>
                  </div>
                  <p class="px-step-desc">${plan.midLateGame}</p>
                </div>
              </div>

              <div class="px-coaching-golden-box">
                <div class="px-golden-header">
                  <span class="px-golden-badge">REGLA DE ORO INMEDIATA</span>
                </div>
                <p class="px-golden-text">${plan.goldenRule}</p>
              </div>

              <div class="px-coaching-drill-box">
                <span class="px-drill-label">Práctica recomendada:</span>
                <span class="px-drill-desc">${plan.drill}</span>
              </div>
            </article>
          `;
        }).join('')}
      </div>`
    : `
      <article class="px-advice good px-coaching-card balanced">
        <div class="px-coaching-head">
          <div class="px-coaching-badges">
            <span class="px-coaching-prio-tag good">Rendimiento Destacado</span>
            <span class="px-coaching-cat-tag">Consistencia de Alto Nivel</span>
          </div>
        </div>
        <h5 class="px-coaching-card-title">Sin Fugas Críticas: Dominio Equilibrado de tu Rango</h5>
        <div class="px-coaching-section-box diagnosis">
          <p class="px-coaching-text">Igualas o superas a los rivales de tu elo (${ctx.esc(tier)}) en todas las métricas fundamentales (Visión, CS, Daño, Objetivos y Supervivencia). Tienes las bases sólidas para ascender de división.</p>
        </div>
        <div class="px-coaching-steps-grid">
          <div class="px-coaching-step early">
            <div class="px-step-header">
              <span class="px-step-badge">Paso 1</span>
              <strong>Acelera el Snowball Temprano</strong>
            </div>
            <p class="px-step-desc">Al no tener desventaja en línea, traslada tu prioridad hacia las líneas vecinas o asiste a tu jungla en invasiones para abrir el mapa antes del minuto 15.</p>
          </div>
          <div class="px-coaching-step mid">
            <div class="px-step-header">
              <span class="px-step-badge">Paso 2</span>
              <strong>Shotcalling y Cierre Rápido</strong>
            </div>
            <p class="px-step-desc">Toma la iniciativa de pingear objetivos mayores (Dragón del Alma y Barón Nashor). Las partidas en SoloQ se pierden por no cerrarlas cuando se va por delante.</p>
          </div>
        </div>
        <div class="px-coaching-golden-box">
          <div class="px-golden-header">
            <span class="px-golden-badge">REGLA DE ORO INMEDIATA</span>
          </div>
          <p class="px-golden-text">Evita regalar shutdowns de 700g-1000g forzando jugadas en solitario 1v3. Tu consistencia y supervivencia es la garantía de victoria de tu equipo.</p>
        </div>
      </article>
    `;

  return `<p class="px-sub">Comparado con el rival de su misma línea en cada una de estas ${e.n} partidas. El matchmaking de ranked empareja jugadores del mismo rango, así que son sus pares reales (${ctx.esc(tier)}).</p>
    <div class="px-headline compact"><div class="px-hl"><span class="px-sub">Le ganó al rival de línea</span><strong class="px-big ${e.outscored * 2 >= e.n ? 'px-up' : 'px-down'}">${Math.round((100 * e.outscored) / e.n)}%</strong><span class="px-sub">${e.outscored} de ${e.n} partidas, por score</span></div></div>
    <div class="px-coaching-section">
      <h4 class="px-h4 px-coaching-main-title">Puntos a mejorar: Plan de Acción Personalizado</h4>
      <p class="px-sub" style="margin-top: -4px; margin-bottom: 14px;">Diagnóstico táctico con pasos concretos de entrenamiento para subir de rango frente a tus rivales directos de ${ctx.esc(tier)}.</p>
      ${workOn}
    </div>
    ${e.strengths.length ? `<h4 class="px-h4">Fortalezas</h4><div class="px-chips">${e.strengths.map((r) => `<span class="px-chip static px-up">${r.metric.short} ${diffText(r)}</span>`).join('')}</div>` : ''}
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
  return `${best ? `<p class="px-callout"><span class="px-tag-best">Mejor carril:</span> <strong>${name(best)}</strong> · <span class="px-tag-worst">Menor rendimiento:</span> <strong>${name(worst)}</strong></p>` : '<p class="px-sub">No hay suficientes partidas en distintos carriles para comparar.</p>'}
    <div class="px-table-wrap"><table class="px-table">
      <thead><tr><th>Carril</th><th>Partidas</th><th>Win rate</th><th>Score</th><th>Puesto</th><th>KDA</th><th>Daño</th><th>CS</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.tag ?? ''}">
        <td><strong>${name(r)}</strong> ${r.tag === 'best' ? '<span class="px-role-badge best">Top</span>' : r.tag === 'worst' ? '<span class="px-role-badge worst">Bajo</span>' : ''}</td>
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
  return `<p class="px-sub">Selecciona un campeón para ver sus enfrentamientos directos y partidas registradas.</p>
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
      ${stat('% Victorias', `${Math.round(a.winrate)}%`, `${a.wins}V ${a.losses}D`)}
      ${stat('Score promedio', scorePill(a.score))}
      ${stat('Puesto promedio', `${a.place.toFixed(1)} / 10`, `${a.mvp} MVP · ${a.ace} ACE`)}
      ${stat('KDA', a.kda.toFixed(2), `${a.kills.toFixed(1)} / ${a.deaths.toFixed(1)} / ${a.assists.toFixed(1)}`)}
      ${stat('CS / min', a.csMin.toFixed(1), `${Math.round(a.cs)} por partida`)}
      ${stat('Daño / partida', kNum(a.damage), `${pct(a.dmgShare)} del equipo`)}
      ${laned.length ? stat('Le ganó al rival', `${Math.round((100 * outscored) / laned.length)}%`, `${outscored} de ${laned.length} por score`) : ''}
    </div>
    <h4 class="px-h4">Enfrentamientos directos con ${ctx.esc(champ)}</h4>
    ${matchups.length ? `
      ${best ? `<p class="px-callout"><span class="px-tag-best">Mejor enfrentamiento:</span> <strong>${ctx.esc(best.opp)}</strong> (${best.wins}V ${best.n - best.wins}D) · <span class="px-tag-worst">Peor:</span> <strong>${ctx.esc(worst.opp)}</strong> (${worst.wins}V ${worst.n - worst.wins}D)</p>` : ''}
      <div class="px-table-wrap"><table class="px-table">
        <thead><tr><th>Contra</th><th>Partidas</th><th>% Victorias</th><th>Su score</th><th>Score rival</th><th>Dif. oro</th><th>Dif. CS</th></tr></thead>
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
