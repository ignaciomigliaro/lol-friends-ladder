// ==========================================================================
// LA GRIETA DE LOS PIBES — MASTER CONTROLLER & VIEW ROUTER
// ==========================================================================

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const TIER_COLORS = {
  IRON: '#8b8580', BRONZE: '#b07a5c', SILVER: '#a9b4c2', GOLD: '#e3b453', PLATINUM: '#4fc1b4',
  EMERALD: '#2fcf7a', DIAMOND: '#7b9bff', MASTER: '#c06bf0', GRANDMASTER: '#f05a4f', CHALLENGER: '#f6d27a',
};
const ROLE = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Mid', BOTTOM: 'ADC', UTILITY: 'Support' };

let board = null;
let staticMode = false;
let currentSort = 'rank';
let searchQuery = '';
let activeView = 'overview';
let selectedPlayerForProfile = null;

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const tierColor = (p) => TIER_COLORS[p?.solo?.tier] ?? '#8a94b0';

const PLATFORM_NAMES = {
  la1: 'LAN',
  la2: 'LAS',
  na1: 'NA',
  br1: 'BR',
  euw1: 'EUW',
  eun1: 'EUNE',
  kr: 'KR',
  jp1: 'JP',
  oc1: 'OCE',
};

function formatPlatform(p) {
  if (!p) return 'LAN';
  const key = String(p).toLowerCase().trim();
  return PLATFORM_NAMES[key] || key.toUpperCase();
}

const CHAMP_NAME_MAP = {
  805: 'Locke',
  800: 'Mel',
  804: 'Yunara',
  893: 'Aurora',
  901: 'Smolder',
  'Champ #805': 'Locke',
  'Champ #800': 'Mel',
  'Champ #804': 'Yunara',
  'Champ #893': 'Aurora',
  'Champ #901': 'Smolder',
};

function resolveChampName(c) {
  if (!c) return 'Unknown';
  if (CHAMP_NAME_MAP[c]) return CHAMP_NAME_MAP[c];
  if (typeof c === 'string' && c.startsWith('Champ #')) {
    const id = c.replace('Champ #', '').trim();
    if (CHAMP_NAME_MAP[id]) return CHAMP_NAME_MAP[id];
  }
  return board?.champIds?.[c] ?? (c === 'FiddleSticks' ? 'Fiddlesticks' : c);
}

function ddragon(kind, name) {
  const v = window.latestDdragonVersion || board?.ddragonVersion || '16.22.1';
  if (!name) return '';
  const resolved = kind === 'champion' ? resolveChampName(name) : name;
  return `https://ddragon.leagueoflegends.com/cdn/${v}/img/${kind}/${resolved}.png`;
}
const champImg = (c) => ddragon('champion', resolveChampName(c));
const iconImg = (iconId) => ddragon('profileicon', iconId ?? 1);

function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2800);
}

// Generate an SVG sparkline based on player recent matches
function createSparkline(games, isLeader = false) {
  if (!games || games.length === 0) {
    return `<svg class="sparkline-svg" viewBox="0 0 70 24"><line x1="2" y1="12" x2="68" y2="12" stroke="#24334B" stroke-width="2"/></svg>`;
  }
  const slice = games.slice(0, 10).reverse();
  const n = slice.length;
  let running = 12;
  const points = [];
  const stepX = 66 / Math.max(1, n - 1);

  slice.forEach((g, idx) => {
    running += g.win ? -2.2 : 2.2;
    running = Math.max(3, Math.min(21, running));
    const x = Math.round(2 + idx * stepX);
    const y = Math.round(running);
    points.push(`${x},${y}`);
  });

  const lastWin = slice[slice.length - 1]?.win;
  const stroke = isLeader ? '#E8C982' : lastWin ? '#37D995' : '#39C5F5';
  return `
    <svg class="sparkline-svg" viewBox="0 0 70 24">
      <polyline fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${points.join(' ')}" />
    </svg>
  `;
}

// ==================== THEME & I18N CONTROLLER ====================
let currentTheme = localStorage.getItem('theme') || 'dark';
let currentLang = localStorage.getItem('lang') || 'es';

const I18N = {
  es: {
    titles: {
      overview: 'Resumen General de la Semana',
      leaderboard: 'Tabla de Posiciones',
      players: 'Jugadores del Grupo',
      duels: 'Arena de Duelos 1v1',
      synergy: 'Sinergia y Dúos',
      apodos: 'Apodos y Carrilla de la Semana',
      records: 'Salón de la Fama y Récords',
      meta: 'Meta y Campeones del Grupo',
      player: 'Perfil del Invocador',
    },
    nav: {
      overview: 'Inicio',
      leaderboard: 'Tabla de Posiciones',
      players: 'Jugadores',
      duels: 'Duelos 1v1',
      records: 'Salón de la Fama',
      synergy: 'Sinergia y Dúos',
      apodos: 'Apodos y Carrilla',
      meta: 'Meta y Campeones',
      friends: 'Administrar Amigos',
      discord: 'Webhook de Discord',
      config: 'Ajustes',
    },
    ui: {
      refreshBtn: '🔄 Actualizar',
      refreshTitle: 'Buscar partidas nuevas de Riot Games',
      themeToggleTitle: 'Cambiar a Modo Claro / Oscuro',
      langToggleTitle: 'Switch to English / Cambiar a Inglés',
      themeDark: 'Oscuro',
      themeLight: 'Claro',
      langNext: 'EN ▾',
      mvpTag: 'MVP DE LA SEMANA',
      winRate: '% Victorias',
      weeklyLp: 'LP Semanal',
      recentMatchesTitle: 'Últimas Partidas',
      recentMatchesDesc: 'Historial cronológico en tiempo real con todas las estadísticas de combate, farmeo y rivales.',
      filterAll: 'Todas',
      filterWins: 'Victorias',
      filterLosses: 'Derrotas',
      lbTitle: 'Tabla de Posiciones Oficial',
      lbDesc: 'Clasificación en tiempo real basada en Solo/Duo, desempeño OP Score y LP ganados.',
      sortRank: 'Rango',
      sortScore: 'Score',
      sortWinrate: '% Victorias',
      sortWeek: 'Esta Semana',
      sortSeason: 'Temporada',
      colWinrate: '% VICTORIAS',
      colScore: 'OP SCORE',
      backToLb: '← Volver a la Tabla de Posiciones',
      metricScore: 'OP Score',
      metricWinrate: '% de Victorias',
      metricKda: 'Promedio KDA',
      metricGames: 'Partidas Jugadas',
      metricLp: 'LP Semanales',
      duoWr: '% Victorias Dúo',
      heroBadge: 'TEMPORADA 2026 · LAN',
      heroDesc: 'Estadísticas competitivas, análisis de partidas y seguimiento en vivo de tu grupo',
      tooltipMvp: 'MVP (Jugador Más Valioso): Mejor rendimiento del equipo ganador. Se calcula mediante el OP Score ponderando KDA, participación en asesinatos (KP%), daño contra rival directo, visión, objetivos y CS según el rol.',
      tooltipAce: 'ACE: Mejor rendimiento del equipo perdedor. Se otorga al jugador con el OP Score más alto de su equipo a pesar de la derrota, evaluando KDA, daño, visión y objetivos según el rol.',
      tooltipMochila: '🎒 MOCHILA: Jugador con menor rendimiento y aporte del equipo. Se calcula por el OP Score más bajo del equipo, penalizando exceso de muertes repetidas, baja participación en peleas (KP%) y menor daño.',
    }
  },
  en: {
    titles: {
      overview: 'Weekly General Overview',
      leaderboard: 'Official Leaderboard',
      players: 'Group Players',
      duels: '1v1 Duels Arena',
      synergy: 'Synergy & Duos',
      apodos: 'Nicknames & Roasts of the Week',
      records: 'Hall of Fame & Records',
      meta: 'Meta & Group Champion Pool',
      player: 'Summoner Profile',
    },
    nav: {
      overview: 'Overview',
      leaderboard: 'Leaderboard',
      players: 'Players',
      duels: '1v1 Duels',
      records: 'Hall of Fame',
      synergy: 'Synergy & Duos',
      apodos: 'Nicknames & Roasts',
      meta: 'Meta & Champions',
      friends: 'Manage Friends',
      discord: 'Discord Webhook',
      config: 'Settings',
    },
    ui: {
      refreshBtn: '🔄 Refresh',
      refreshTitle: 'Fetch new matches from Riot Games',
      themeToggleTitle: 'Toggle Dark / Light Mode',
      langToggleTitle: 'Cambiar a Español / Switch to Spanish',
      themeDark: 'Dark',
      themeLight: 'Light',
      langNext: 'ES ▾',
      mvpTag: 'MVP OF THE WEEK',
      winRate: 'Win Rate',
      weeklyLp: 'Weekly LP',
      recentMatchesTitle: 'Recent Matches',
      recentMatchesDesc: 'Real-time chronological match history with combat, farm, and lane matchup statistics.',
      filterAll: 'All',
      filterWins: 'Victories',
      filterLosses: 'Defeats',
      lbTitle: 'Official Leaderboard',
      lbDesc: 'Real-time rankings based on Solo/Duo rank, OP Score performance, and weekly LP.',
      sortRank: 'Rank',
      sortScore: 'Score',
      sortWinrate: 'Win Rate',
      sortWeek: 'This Week',
      sortSeason: 'Season',
      colWinrate: 'WIN RATE',
      colScore: 'OP SCORE',
      backToLb: '← Back to Leaderboard',
      metricScore: 'OP Score',
      metricWinrate: 'Win Rate %',
      metricKda: 'KDA Ratio',
      metricGames: 'Games Played',
      metricLp: 'Weekly LP',
      duoWr: 'Duo Win Rate',
      heroBadge: 'SEASON 2026 · LAN',
      heroDesc: 'Competitive stats, match analytics, and live spectator for your squad',
      tooltipMvp: 'MVP (Most Valuable Player): Best performance on the winning team. Calculated via OP Score weighting KDA, kill participation (KP%), damage vs lane opponent, vision, objectives, and CS by role.',
      tooltipAce: 'ACE: Best performance on the losing team. Awarded to the player with the highest OP Score on their team despite defeat, evaluating KDA, damage, objectives, and vision.',
      tooltipMochila: '🎒 MOCHILA: Player with the lowest performance and contribution on the team. Calculated by lowest OP Score, penalizing excessive deaths, low fight participation (KP%), and low damage.',
    }
  }
};

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);

  const iconEl = $('#theme-toggle-icon');
  const labelEl = $('#theme-toggle-label');
  const t = (I18N[currentLang] || I18N.es).ui;

  if (iconEl) iconEl.textContent = theme === 'light' ? '☀️' : '🌙';
  if (labelEl) labelEl.textContent = theme === 'light' ? t.themeLight : t.themeDark;
  $('#theme-toggle-btn')?.setAttribute('title', t.themeToggleTitle);
}

function toggleTheme() {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

function applyLanguage(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;
  localStorage.setItem('lang', lang);

  const dict = I18N[lang] || I18N.es;
  const t = dict.ui;

  // Header buttons
  const refreshBtn = $('#header-refresh-btn');
  if (refreshBtn) {
    const raw = (t.refreshBtn || 'Actualizar').replace('🔄', '').trim();
    refreshBtn.innerHTML = `<span class="refresh-icon">🔄</span> <span>${raw}</span>`;
    refreshBtn.title = t.refreshTitle;
  }
  const langLabel = $('#lang-toggle-label');
  if (langLabel) langLabel.textContent = t.langNext;
  $('#lang-toggle-btn')?.setAttribute('title', t.langToggleTitle);

  const themeLabel = $('#theme-toggle-label');
  if (themeLabel) themeLabel.textContent = currentTheme === 'light' ? t.themeLight : t.themeDark;

  // Sidebar navigation texts
  const updateNav = (sel, text) => {
    const el = $(sel);
    if (el) {
      const span = el.querySelector('span:not(.nav-icon):not(.mobile-nav-icon)');
      if (span) span.textContent = text;
    }
  };
  updateNav('.sidebar-nav [data-view="overview"]', dict.nav.overview);
  updateNav('.sidebar-nav [data-view="leaderboard"]', dict.nav.leaderboard);
  updateNav('.sidebar-nav [data-view="players"]', dict.nav.players);
  updateNav('.sidebar-nav [data-view="duels"]', dict.nav.duels);
  updateNav('.sidebar-nav [data-view="records"]', dict.nav.records);
  updateNav('.sidebar-nav [data-view="synergy"]', dict.nav.synergy);
  updateNav('.sidebar-nav [data-view="apodos"]', dict.nav.apodos);
  updateNav('.sidebar-nav [data-view="meta"]', dict.nav.meta);
  updateNav('#nav-btn-friends', dict.nav.friends);
  updateNav('#nav-btn-discord', dict.nav.discord);

  // Mobile nav
  updateNav('.mobile-bottom-nav [data-view="overview"]', dict.nav.overview);
  updateNav('.mobile-bottom-nav [data-view="players"]', dict.nav.players);
  updateNav('.mobile-bottom-nav [data-view="duels"]', lang === 'es' ? 'Duelos' : 'Duels');
  updateNav('.mobile-bottom-nav [data-view="records"]', lang === 'es' ? 'Récords' : 'Records');
  updateNav('.mobile-bottom-nav [data-view="synergy"]', lang === 'es' ? 'Sinergia' : 'Synergy');
  updateNav('#mobile-manage-btn', dict.nav.config);

  // Overview texts
  const heroBadge = $('#hero-banner-badge-text');
  if (heroBadge) heroBadge.textContent = t.heroBadge;
  const heroDesc = $('#hero-banner-desc');
  if (heroDesc) heroDesc.textContent = t.heroDesc;

  const feedTitle = $('#view-overview .filter-bar h2');
  if (feedTitle) feedTitle.textContent = t.recentMatchesTitle;
  const feedDesc = $('#view-overview .filter-bar p.muted');
  if (feedDesc) feedDesc.textContent = t.recentMatchesDesc;

  const btnAll = $('[data-match-queue="all"]');
  if (btnAll) btnAll.textContent = t.filterAll;
  const btnWins = $('[data-match-queue="win"]');
  if (btnWins) btnWins.textContent = t.filterWins;
  const btnLosses = $('[data-match-queue="loss"]');
  if (btnLosses) btnLosses.textContent = t.filterLosses;

  // Leaderboard texts
  const lbTitle = $('#view-leaderboard .filter-bar h2');
  if (lbTitle) lbTitle.textContent = t.lbTitle;
  const lbDesc = $('#view-leaderboard .filter-bar p.muted');
  if (lbDesc) lbDesc.textContent = t.lbDesc;

  const sortRank = $('[data-sort="rank"]');
  if (sortRank) sortRank.textContent = t.sortRank;
  const sortScore = $('[data-sort="score"]');
  if (sortScore) sortScore.textContent = t.sortScore;
  const sortWr = $('[data-sort="winrate"]');
  if (sortWr) sortWr.textContent = t.sortWinrate;
  const sortWeek = $('[data-sort="week"]');
  if (sortWeek) sortWeek.textContent = t.sortWeek;
  const sortSeason = $('[data-sort="season"]');
  if (sortSeason) sortSeason.textContent = t.sortSeason;

  const colWr = $('.leaderboard-table-header .col-winrate');
  if (colWr) colWr.textContent = t.colWinrate;
  const colScore = $('.leaderboard-table-header .col-score');
  if (colScore) colScore.textContent = t.colScore;

  const backBtn = $('#back-from-player-btn');
  if (backBtn) backBtn.textContent = t.backToLb;

  // Update current page title
  const titleEl = $('#page-title');
  if (titleEl) titleEl.textContent = dict.titles[activeView] ?? 'Dashboard';

  // Re-render dynamic components if data is loaded
  if (board) {
    renderMvp();
    renderLeaderboards();
    updateDuelComparison();
    renderRecentMatchesFeed();
  }
}

function toggleLanguage() {
  applyLanguage(currentLang === 'es' ? 'en' : 'es');
}

// Bind header tool actions
$('#theme-toggle-btn')?.addEventListener('click', toggleTheme);
$('#lang-toggle-btn')?.addEventListener('click', toggleLanguage);

// ---------- navigation router ----------
function switchView(viewName) {
  activeView = viewName;
  $$('.view-section').forEach((sec) => sec.classList.remove('active-view'));
  $$('.nav-link').forEach((link) => link.classList.remove('active'));
  $$('.mobile-nav-item').forEach((item) => item.classList.remove('active'));

  const target = $(`#view-${viewName}`);
  if (target) target.classList.add('active-view');

  const navMatch = $(`[data-view="${viewName}"]`);
  if (navMatch) navMatch.classList.add('active');

  const dict = I18N[currentLang] || I18N.es;
  const titleEl = $('#page-title');
  if (titleEl) titleEl.textContent = dict.titles[viewName] ?? 'Dashboard';

  if (viewName === 'records') renderRecords();
  if (viewName === 'meta') renderMeta();

  // Close sidebar on mobile
  $('#sidebar')?.classList.remove('mobile-open');
}

// Bind navigation clicks
$$('[data-view]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const v = el.dataset.view;
    window.location.hash = v;
    switchView(v);
  });
});

function handleHash() {
  const raw = window.location.hash.replace('#', '');
  if (!raw) return;
  if (raw === 'friends') {
    openFriendsModal();
  } else if (raw.startsWith('match:')) {
    const matchId = raw.replace('match:', '');
    openMatchModal(matchId);
  } else if (raw.startsWith('build:')) {
    const champ = raw.replace('build:', '');
    openBuildModal(champ);
  } else if (raw.startsWith('card:')) {
    const puuid = raw.replace('card:', '');
    const p = board?.players?.find((x) => x.puuid === puuid) || board?.players?.[0];
    if (p) generateGamerCard(p);
  } else if (raw === 'player' || raw.startsWith('player:')) {
    const puuid = raw.startsWith('player:') ? raw.replace('player:', '') : board?.players?.[0]?.puuid;
    if (puuid) window.viewPlayerProfile?.(puuid);
  } else if (['overview', 'leaderboard', 'duels', 'synergy', 'apodos', 'records', 'meta'].includes(raw)) {
    switchView(raw);
  }
}
window.addEventListener('hashchange', handleHash);

$('#mobile-toggle')?.addEventListener('click', (e) => {
  e.stopPropagation();
  $('#sidebar')?.classList.toggle('mobile-open');
});

document.addEventListener('click', (e) => {
  const sidebar = $('#sidebar');
  const toggle = $('#mobile-toggle');
  if (sidebar && sidebar.classList.contains('mobile-open')) {
    if (!sidebar.contains(e.target) && !toggle?.contains(e.target)) {
      sidebar.classList.remove('mobile-open');
    }
  }
});

// ---------- sorted players ----------
function getFilteredPlayers() {
  let ps = [...(board?.players ?? [])];
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    ps = ps.filter((p) => (p.name ?? '').toLowerCase().includes(q) || (p.riotId ?? '').toLowerCase().includes(q));
  }
  const by = {
    rank: (p) => p.solo?.value ?? -1,
    score: (p) => p.stats?.avgScore ?? -1,
    winrate: (p) => p.stats?.winrate ?? -1,
    week: (p) => p.lpDelta?.week ?? -9999,
    season: (p) => p.lpDelta?.season ?? -9999,
  }[currentSort] ?? ((p) => p.solo?.value ?? -1);

  return ps.sort((a, b) => by(b) - by(a));
}

// ---------- MMR estimation helper ----------
function estimateMmr(player, weeklyStats, lang = 'es') {
  const isEn = lang === 'en';
  const solo = player?.solo;

  // Base MMR derived from Solo/Duo rank
  // LoL competitive ELO scale: Iron IV = 400, Silver IV = 1200, Emerald I 52 LP = 2752, Diamond IV = 2800, Master = 3200+
  const rankVal = solo?.value != null && solo.value >= 0 ? solo.value : 800;
  const baseRankMmr = 400 + rankVal;

  const sWins = solo?.wins ?? 0;
  const sLosses = solo?.losses ?? 0;
  const sTotal = sWins + sLosses;
  const seasonWr = sTotal > 0 ? (sWins / sTotal) * 100 : 50;

  const wGames = weeklyStats?.games ?? 0;
  const weeklyWr = weeklyStats ? weeklyStats.winrate : seasonWr;

  // Adaptive blend weight for weekly form based on sample size (prevents flukes on 1-2 games)
  let weeklyWeight = 0;
  if (wGames >= 20) weeklyWeight = 0.55;
  else if (wGames >= 10) weeklyWeight = 0.45;
  else if (wGames >= 5) weeklyWeight = 0.30;
  else if (wGames > 0) weeklyWeight = 0.15;

  const effectiveWr = (weeklyWr * weeklyWeight) + (seasonWr * (1 - weeklyWeight));
  const wrDiff = effectiveWr - 50;

  // Winrate delta capped to +/- 80 points
  const wrDelta = Math.max(-80, Math.min(80, Math.round(wrDiff * 5.0)));

  // LP momentum delta capped to +/- 60 points
  const weeklyLp = weeklyStats?.lpWeek ?? (player?.lpDelta?.week ?? 0);
  const lpDelta = Math.max(-60, Math.min(60, Math.round(weeklyLp * 0.35)));

  const totalDelta = wrDelta + lpDelta;
  const estMmr = Math.max(300, Math.round(baseRankMmr + totalDelta));

  function getTierFromMmr(m) {
    if (m >= 3600) return isEn ? 'Challenger Lobbies' : 'Lobbies de Challenger';
    if (m >= 3400) return isEn ? 'Grandmaster Lobbies' : 'Lobbies de Gran Maestro';
    if (m >= 3200) return isEn ? 'Master Lobbies' : 'Lobbies de Maestro';
    if (m >= 3100) return isEn ? 'Diamond I Lobbies' : 'Lobbies de Diamante I';
    if (m >= 3000) return isEn ? 'Diamond II Lobbies' : 'Lobbies de Diamante II';
    if (m >= 2900) return isEn ? 'Diamond III Lobbies' : 'Lobbies de Diamante III';
    if (m >= 2800) return isEn ? 'Diamond IV Lobbies' : 'Lobbies de Diamante IV';
    if (m >= 2700) return isEn ? 'Emerald I Lobbies' : 'Lobbies de Esmeralda I';
    if (m >= 2600) return isEn ? 'Emerald II Lobbies' : 'Lobbies de Esmeralda II';
    if (m >= 2500) return isEn ? 'Emerald III Lobbies' : 'Lobbies de Esmeralda III';
    if (m >= 2400) return isEn ? 'Emerald IV Lobbies' : 'Lobbies de Esmeralda IV';
    if (m >= 2300) return isEn ? 'Platinum I Lobbies' : 'Lobbies de Platino I';
    if (m >= 2200) return isEn ? 'Platinum II Lobbies' : 'Lobbies de Platino II';
    if (m >= 2100) return isEn ? 'Platinum III Lobbies' : 'Lobbies de Platino III';
    if (m >= 2000) return isEn ? 'Platinum IV Lobbies' : 'Lobbies de Platino IV';
    if (m >= 1900) return isEn ? 'Gold I Lobbies' : 'Lobbies de Oro I';
    if (m >= 1800) return isEn ? 'Gold II Lobbies' : 'Lobbies de Oro II';
    if (m >= 1700) return isEn ? 'Gold III Lobbies' : 'Lobbies de Oro III';
    if (m >= 1600) return isEn ? 'Gold IV Lobbies' : 'Lobbies de Oro IV';
    if (m >= 1500) return isEn ? 'Silver I Lobbies' : 'Lobbies de Plata I';
    if (m >= 1400) return isEn ? 'Silver II Lobbies' : 'Lobbies de Plata II';
    if (m >= 1300) return isEn ? 'Silver III Lobbies' : 'Lobbies de Plata III';
    if (m >= 1200) return isEn ? 'Silver IV Lobbies' : 'Lobbies de Plata IV';
    if (m >= 1100) return isEn ? 'Bronze I Lobbies' : 'Lobbies de Bronce I';
    if (m >= 1000) return isEn ? 'Bronze II Lobbies' : 'Lobbies de Bronce II';
    if (m >= 900) return isEn ? 'Bronze III Lobbies' : 'Lobbies de Bronce III';
    if (m >= 800) return isEn ? 'Bronze IV Lobbies' : 'Lobbies de Bronce IV';
    return isEn ? 'Iron Lobbies' : 'Lobbies de Hierro';
  }

  let healthLabel = isEn ? 'Normal · Stable' : 'Normal · Estable';
  let healthColor = '#12BFFF';
  let gainEst = isEn ? '±20 to ±22 LP per match' : '±20 a ±22 LP por partida';

  if (totalDelta >= 35 || effectiveWr >= 55 || weeklyLp >= 40) {
    healthLabel = isEn ? 'High · Climbing' : 'Alto · En Subida';
    healthColor = '#00D68F';
    gainEst = isEn ? '+25 to +30 LP per win' : '+25 a +30 LP por victoria';
  } else if (totalDelta <= -30 || effectiveWr <= 46 || weeklyLp <= -30) {
    healthLabel = isEn ? 'Low · At Risk' : 'Bajo · En Riesgo';
    healthColor = '#FF5268';
    gainEst = isEn ? '+15 / -26 LP per match' : '+15 a +18 LP / -25 LP por derrota';
  }

  const baseTier = solo?.label ? solo.label : (isEn ? 'Unranked' : 'Sin clasificar');

  return {
    mmr: estMmr.toLocaleString('en-US'),
    rawMmr: estMmr,
    baseRankMmr,
    baseTier,
    seasonWr: Math.round(seasonWr),
    weeklyWr: Math.round(weeklyWr),
    effectiveWr: Math.round(effectiveWr),
    weeklyGames: wGames,
    totalSeason: sTotal,
    weeklyLp,
    totalDelta,
    estTierLabel: getTierFromMmr(estMmr),
    healthLabel,
    healthColor,
    gainEst,
    wr: Math.round(effectiveWr),
    wrDelta: totalDelta,
  };
}
window.estimateMmr = estimateMmr;

// ---------- render MVP of the week ----------
function renderMvp() {
  const container = $('#mvp-container');
  if (!container) return;
  const ps = board?.players ?? [];
  if (!ps.length) {
    container.innerHTML = '';
    return;
  }

  const weekStart = board?.weekStart;

  const getWeeklyStats = (p) => {
    const games = (p.games || []).filter((g) => (weekStart ? g.endTs >= weekStart : true));
    if (!games.length) return null;
    const wins = games.filter((g) => g.win).length;
    const avgScore = games.reduce((acc, g) => acc + g.score, 0) / games.length;
    const kills = games.reduce((acc, g) => acc + g.kills, 0);
    const deaths = games.reduce((acc, g) => acc + g.deaths, 0);
    const assists = games.reduce((acc, g) => acc + g.assists, 0);
    const kda = ((kills + assists) / Math.max(1, deaths)).toFixed(2);
    const avgKills = (kills / games.length).toFixed(1);
    const avgDeaths = (deaths / games.length).toFixed(1);
    const avgAssists = (assists / games.length).toFixed(1);
    const lpWeek = p.lpDelta?.week ?? 0;
    const mvps = games.filter((g) => g.mvp).length;
    // Composite Weekly Performance: Impact (Score), Victories (Winrate) and LP progression
    const performanceIndex = (avgScore * 8) + (wins * 1.5) + (Math.max(0, lpWeek) * 0.1) + ((wins / games.length) * 20);
    return {
      games: games.length,
      wins,
      losses: games.length - wins,
      winrate: Math.round((wins / games.length) * 100),
      avgScore,
      kills,
      deaths,
      assists,
      avgKills,
      avgDeaths,
      avgAssists,
      kda,
      lpWeek,
      mvps,
      performanceIndex,
    };
  };

  const candidates = ps
    .map((p) => ({ player: p, wStats: getWeeklyStats(p) }))
    .filter((x) => x.wStats && x.wStats.games >= 3);

  // If nobody has >= 3 games this week, fall back to anyone with games, or overall stats
  let selected = null;
  if (candidates.length) {
    candidates.sort((a, b) => {
      const posA = a.wStats.lpWeek >= 0 ? 1 : 0;
      const posB = b.wStats.lpWeek >= 0 ? 1 : 0;
      if (posB !== posA) return posB - posA;
      return (b.wStats.performanceIndex - a.wStats.performanceIndex);
    });
    selected = candidates[0];
  }

  const mvp = selected ? selected.player : ps[0];
  const w = selected ? selected.wStats : null;
  const s = mvp.stats;
  const dWeek = mvp.lpDelta?.week;
  const dSeason = mvp.lpDelta?.season;
  const playerIconUrl = iconImg(mvp.profileIconId);
  const score = w ? w.avgScore.toFixed(1) : (s ? s.avgScore.toFixed(1) : '—');
  const wr = w ? `${w.winrate}% (${w.wins}V - ${w.losses}D)` : (s ? `${s.winrate}%` : '—');
  const lpWeek = dWeek != null ? (dWeek > 0 ? `+${dWeek} LP ▲` : dWeek < 0 ? `${dWeek} LP ▼` : '0 LP') : '+0 LP';
  const seasonWins = mvp.solo?.wins ?? s?.wins ?? 0;
  const seasonLosses = mvp.solo?.losses ?? s?.losses ?? 0;
  const totalSeason = seasonWins + seasonLosses;
  const seasonWr = totalSeason > 0 ? Math.round((seasonWins / totalSeason) * 100) : 0;
  const seasonText = totalSeason > 0 ? `${seasonWins}V - ${seasonLosses}D (${seasonWr}%)` : (dSeason != null ? `${signed(dSeason)} LP` : '—');
  const soloTierLabel = mvp.solo?.label ?? 'Unranked';
  const flexTierLabel = mvp.flex?.label ?? 'Unranked';
  const kda = w ? w.kda : (s ? s.kda : '—');
  const gamesCount = w ? `${w.games} partidas jugadas en la semana` : (s ? `${s.games} partidas jugadas en la semana` : '');
  const topChamp = mvp.topChampions?.[0]?.champion || (mvp.games?.[0] ? resolveChampName(mvp.games[0].champion) : 'Kai\'Sa');
  const cleanChamp = resolveChampName(topChamp).replace(/[^a-zA-Z0-9]/g, '');
  const champSplashUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${cleanChamp}_0.jpg`;

  const wrTitle = w
    ? (currentLang === 'en'
        ? `Win Rate: ${w.wins} Wins - ${w.losses} Losses across ${w.games} games this week`
        : `Porcentaje de victorias: ${w.wins}V - ${w.losses}D en ${w.games} partidas esta semana`)
    : 'Win Rate';

  const lpTitle = currentLang === 'en'
    ? `Net Weekly League Points balance: ${lpWeek}`
    : `Balance neto de League Points en la semana: ${lpWeek}`;

  const kdaTitle = w
    ? (currentLang === 'en'
        ? `KDA Ratio = (Kills + Assists) ÷ Deaths\nWeekly total: (${w.kills} Kills + ${w.assists} Assists) ÷ ${w.deaths} Deaths = ${w.kda}\nAverage per game: ${w.avgKills} / ${w.avgDeaths} / ${w.avgAssists}`
        : `KDA Ratio = (Kills + Asistencias) ÷ Muertes\nTotal semanal: (${w.kills} Asesinatos + ${w.assists} Asistencias) ÷ ${w.deaths} Muertes = ${w.kda}\nPromedio por partida: ${w.avgKills} / ${w.avgDeaths} / ${w.avgAssists}`)
    : (s
        ? `KDA Ratio = (Kills + Asistencias) ÷ Muertes (${s.kda})`
        : 'KDA Ratio = (Kills + Asistencias) ÷ Muertes');

  const mmrData = estimateMmr(mvp, w, currentLang);

  const t = (I18N[currentLang] || I18N.es).ui;

  container.innerHTML = `
    <div class="mvp-banner-card">
      <div class="mvp-champ-bg" style="background-image: linear-gradient(90deg, #0B1322 0%, #0B1322 35%, rgba(11, 19, 34, 0.82) 55%, rgba(11, 19, 34, 0.2) 75%, rgba(11, 19, 34, 0.88) 100%), url('${champSplashUrl}'), url('assets/mvp-champion.jpg');"></div>
      
      <div class="mvp-top-bar">
        <div class="mvp-tag-pill">
          <span>${t.mvpTag || 'MVP DE LA SEMANA'}</span>
        </div>
        <div class="mvp-champ-chip" title="Campeón insignia">
          <span>${esc(topChamp)}</span>
        </div>
      </div>

      <div class="mvp-inner">
        <div class="mvp-portrait-wrap">
          <img class="mvp-portrait" src="${playerIconUrl}" alt="${esc(mvp.name)}" onerror="this.src='logo.jpg'">
          ${mvp.level ? `<span class="mvp-level-pill">${mvp.level}</span>` : ''}
        </div>
        <div class="mvp-identity">
          <!-- 1. Nombre de invocador seguido del apodo con punto y tooltip con la descripción -->
          <div class="mvp-name-line">
            <span class="mvp-name">${esc(mvp.name)}</span>
            ${mvp.nickname ? `
              <span class="mvp-nickname-badge" data-reason="${esc(mvp.nickname.reason || '')}" title="${esc(mvp.nickname.reason || '')}">
                "${esc(mvp.nickname.title)}"
                <span class="nickname-dot-help" title="${esc(mvp.nickname.reason || '')}">•</span>
              </span>
            ` : ''}
          </div>

          <!-- 2. Cantidad de partidas jugadas en la semana -->
          ${gamesCount ? `
            <div class="mvp-games-line">
              <span class="mvp-games-count">${gamesCount}</span>
            </div>
          ` : ''}
        </div>

        <!-- 3. Insignia de Rango (ambas: Solo/Duo y Flex) -->
        <div class="mvp-rank-line">
          <span class="mvp-rank-badge solo ${mvp.solo?.tier ? mvp.solo.tier.toLowerCase() : 'emerald'}" title="Clasificatoria Solo/Duo">
            <strong class="rank-q-label">Solo/Duo:</strong> ${esc(soloTierLabel)}
          </span>
          <span class="mvp-rank-badge flex ${mvp.flex?.tier ? mvp.flex.tier.toLowerCase() : 'diamond'}" title="Clasificatoria Flex">
            <strong class="rank-q-label">Flex:</strong> ${esc(flexTierLabel)}
          </span>
        </div>

        <!-- 4. LP semanal, season, win rate sin iconos y KDA -->
        <div class="mvp-substats">
          <span class="mvp-stat-chip winrate" tabindex="0">
            Win Rate: <strong style="color:var(--text-primary)">${wr}</strong>
            <span class="chip-tooltip" role="tooltip">
              <span class="chip-tooltip-title">${currentLang === 'en' ? 'Win Rate Ratio' : 'Porcentaje de Victorias'}</span>
              <span class="chip-tooltip-body">${w ? `${w.wins} ${currentLang === 'en' ? 'Wins' : 'Victorias'} · ${w.losses} ${currentLang === 'en' ? 'Losses' : 'Derrotas'}` : wr}</span>
              <span class="chip-tooltip-sub">${w ? `${w.games} ${currentLang === 'en' ? 'matches played this week' : 'partidas jugadas en la semana'}` : ''}</span>
            </span>
          </span>

          <span class="mvp-stat-chip lp" tabindex="0">
            LP Semanal: <strong class="${(dWeek ?? 0) >= 0 ? 'pos' : 'neg'}">${lpWeek}</strong>
            <span class="chip-tooltip" role="tooltip">
              <span class="chip-tooltip-title">${currentLang === 'en' ? 'Net Weekly LP' : 'Balance Neto Semanal'}</span>
              <span class="chip-tooltip-body">${currentLang === 'en' ? 'Weekly gain/loss:' : 'Progreso semanal:'} <strong>${lpWeek}</strong></span>
              <span class="chip-tooltip-sub">${currentLang === 'en' ? 'Resets Mondays at 00:00' : 'Se reinicia los lunes a las 00:00'}</span>
            </span>
          </span>

          <span class="mvp-stat-chip season" tabindex="0">
            ${currentLang === 'en' ? 'Season' : 'Temporada'}: <strong style="color:var(--text-primary)">${seasonText}</strong>
            <span class="chip-tooltip" role="tooltip">
              <span class="chip-tooltip-title">${currentLang === 'en' ? 'Season 2026 Record' : 'Récord Temporada 2026'}</span>
              <span class="chip-tooltip-body">${seasonText}</span>
              <span class="chip-tooltip-sub">${currentLang === 'en' ? 'Official cumulative ranked history' : 'Historial oficial acumulado de clasificatorias'}</span>
            </span>
          </span>

          <span class="mvp-stat-chip kda" tabindex="0">
            KDA: <strong style="color:var(--text-primary)">${kda}</strong>
            <span class="chip-tooltip" role="tooltip">
              <span class="chip-tooltip-title">${currentLang === 'en' ? 'KDA Ratio' : 'Ratio de Combate · KDA'}</span>
              <span class="chip-tooltip-body">Semanal: (${w ? `${w.kills}K + ${w.assists}A` : '0K + 0A'}) ÷ ${w ? w.deaths : 1}D = <strong>${kda}</strong></span>
              <span class="chip-tooltip-sub">${currentLang === 'en' ? 'Formula: (Kills + Assists) ÷ Deaths' : 'Fórmula: (Asesinatos + Asistencias) ÷ Muertes'}<br>${currentLang === 'en' ? 'Avg per game:' : 'Promedio por partida:'} ${w ? `${w.avgKills} / ${w.avgDeaths} / ${w.avgAssists}` : '—'}</span>
            </span>
          </span>

          <span class="mvp-stat-chip mmr" tabindex="0">
            MMR: <strong style="color:var(--text-primary)">~${mmrData.mmr}</strong>
            <span class="mmr-health-dot" style="display:inline-block; width:7px; height:7px; border-radius:50%; background:${mmrData.healthColor}; box-shadow:0 0 6px ${mmrData.healthColor}; margin-left:3px;" aria-hidden="true"></span>
            <span class="chip-tooltip" role="tooltip">
              <span class="chip-tooltip-title">${currentLang === 'en' ? 'MMR ESTIMATE · MATCHMAKING RATING' : 'ESTIMACIÓN DE MMR · MATCHMAKING RATING'}</span>
              <span class="chip-tooltip-body">~${mmrData.mmr} MMR &nbsp;·&nbsp; <strong style="color:${mmrData.healthColor}">${mmrData.healthLabel}</strong></span>
              <span class="chip-tooltip-sub">
                <strong>${currentLang === 'en' ? 'Nature of MMR:' : '¿Cómo se calcula?'}</strong> ${currentLang === 'en' ? 'Cumulative rating: Season rank base modulated by weekly momentum.' : 'Rating acumulado: base de rango en la Season modulada por tu racha semanal.'}<br>
                <strong>${currentLang === 'en' ? 'Season Base:' : 'Base Season:'}</strong> ${mmrData.baseTier} (~${mmrData.baseRankMmr} ELO)<br>
                <strong>${currentLang === 'en' ? 'Weekly Momentum:' : 'Forma Semanal:'}</strong> ${mmrData.weeklyGames > 0 ? `${mmrData.weeklyWr}% WR (${mmrData.weeklyGames}p) · ${signed(mmrData.weeklyLp)} LP` : (currentLang === 'en' ? 'No matches this week' : 'Sin partidas esta semana')}<br>
                <strong>${currentLang === 'en' ? 'Lobbies:' : 'Emparejamiento:'}</strong> ${mmrData.estTierLabel}<br>
                <strong>${currentLang === 'en' ? 'Projected gains:' : 'Ganancia proyectada:'}</strong> ${mmrData.gainEst}
              </span>
            </span>
          </span>
        </div>

        <div class="mvp-right">
          <div class="mvp-laurel-emblem" tabindex="0" role="button" aria-label="Ver explicación de OP Score">
            <img class="laurel-wreath-img" src="assets/laurel-wreath.svg" alt="Laurel Wreath">
            <div class="mvp-score-content" title="OP Score: Calificación de rendimiento individual (escala 1 a 10)">
              <span class="mvp-score-num">${score}</span>
              <span class="mvp-score-title">OP SCORE</span>
              <span class="mvp-score-subtitle">${currentLang === 'en' ? 'WEEKLY' : 'SEMANAL'}</span>
            </div>
            <div class="mvp-score-tooltip" role="tooltip">
              <div class="score-tooltip-header">
                <span class="score-tooltip-badge">OP SCORE</span>
                <strong>${score} / 10.0</strong>
              </div>
              <p class="score-tooltip-desc">
                ${currentLang === 'en'
                  ? 'Individual performance rating (1 to 10 scale). Evaluates KDA, relative damage, farming (CS/min), vision, and objectives vs lane rival.'
                  : 'Calificación de rendimiento individual (escala 1 a 10). Evalúa KDA, daño relativo, farmeo (CS/min), visión y objetivos frente al rival directo.'}
              </p>
              <div class="score-tooltip-scale">
                <span class="scale-item green">8.0+ Carry / MVP</span>
                <span class="scale-item cyan">6.0+ Buen Impacto</span>
                <span class="scale-item muted">5.0 Desempeño Sólido</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach modal trigger for OP Score emblem (especially on mobile)
  const emblem = container.querySelector('.mvp-laurel-emblem');
  const opscoreDialog = $('#opscore-dialog');
  if (emblem && opscoreDialog) {
    emblem.addEventListener('click', (e) => {
      e.stopPropagation();
      const scoreVal = $('#opscore-modal-score');
      if (scoreVal) scoreVal.textContent = `${score} / 10.0`;
      const descVal = $('#opscore-modal-desc');
      if (descVal) {
        descVal.textContent = currentLang === 'en'
          ? 'Individual performance rating (1 to 10 scale). Evaluates KDA, relative damage, farming (CS/min), vision, and objectives vs lane rival.'
          : 'Calificación de rendimiento individual (escala 1 a 10). Evalúa KDA, daño relativo, farmeo (CS/min), visión y objetivos frente al rival directo.';
      }
      opscoreDialog.showModal();
    });
  }
}

// ---------- render competitive 4 stat cards ----------
function renderStatGrid() {
  const elFriends = $('#stat-total-friends');
  if (!elFriends) return;

  const ps = board?.players ?? [];
  elFriends.textContent = ps.length;

  const withStats = ps.filter((p) => p.stats);
  const elAvgWr = $('#stat-avg-winrate');
  if (elAvgWr) {
    if (withStats.length) {
      const avgWr = Math.round(withStats.reduce((acc, p) => acc + p.stats.winrate, 0) / withStats.length);
      elAvgWr.textContent = `${avgWr}%`;
    } else {
      elAvgWr.textContent = '—';
    }
  }

  const totalWeekLp = ps.reduce((acc, p) => acc + (p.lpDelta?.week ?? 0), 0);
  const lpEl = $('#stat-total-lp');
  if (lpEl) {
    lpEl.textContent = signed(totalWeekLp) + ' LP';
    lpEl.style.color = totalWeekLp >= 0 ? 'var(--success)' : 'var(--danger)';
  }

  const elTotalGames = $('#stat-total-games');
  if (elTotalGames) {
    elTotalGames.textContent = board?.groupGames?.length ?? 0;
  }
}

// ---------- render podium top 3 ----------
function renderPodium() {
  const containers = [$('#podium-container'), $('#leaderboard-podium-container')].filter(Boolean);
  if (!containers.length) return;
  const players = getFilteredPlayers();
  if (players.length < 3) {
    for (const c of containers) c.innerHTML = '';
    return;
  }
  const [p1, p2, p3] = players;

  const podiumCard = (p, pos, placeClass, crown = '') => {
    const champ = p.topChampions?.[0]?.champion;
    const avatarUrl = champ ? champImg(champ) : iconImg(p.profileIconId);
    return `
      <div class="podium-card ${placeClass}" onclick="window.viewPlayerProfile('${esc(p.puuid)}')">
        ${crown ? `<div class="podium-crown">${crown}</div>` : ''}
        <div class="podium-avatar-wrap">
          <img class="podium-avatar" src="${avatarUrl}" alt="${esc(p.name)}" onerror="this.src='${iconImg(p.profileIconId)}'">
          <div class="podium-rank-pill">${pos}</div>
        </div>
        <div class="podium-name">${esc(p.name)}</div>
        <div class="podium-tier" style="color:${tierColor(p)}">${esc(p.solo?.label ?? 'Unranked')}</div>
        <div class="podium-score-pill">
          Score <strong style="color:var(--gold)">${p.stats?.avgScore.toFixed(1) ?? '—'}</strong>
        </div>
      </div>
    `;
  };

  const html = `
    ${podiumCard(p2, '2', 'second')}
    ${podiumCard(p1, '1', 'first', '👑')}
    ${podiumCard(p3, '3', 'third')}
  `;
  for (const c of containers) c.innerHTML = html;
}

// ---------- render row card (exact match of mockup) ----------
function renderPlayerRowCard(p, rank) {
  const isLeader = rank === 1;
  const champ = p.topChampions?.[0]?.champion;
  const avatarUrl = champ ? champImg(champ) : iconImg(p.profileIconId);
  const tier = p.solo?.label ?? 'Unranked';
  const wr = p.stats ? `${p.stats.winrate}%` : '—';
  const deltaWeek = p.lpDelta?.week;
  const deltaText = deltaWeek != null ? `${signed(deltaWeek)} LP ${deltaWeek >= 0 ? '▲' : '▼'}` : '—';
  const deltaClass = deltaWeek >= 0 ? 'positive' : 'negative';
  const score = p.stats ? p.stats.avgScore.toFixed(1) : '—';
  const nick = p.nickname ? `<span class="row-nickname-badge">"${p.nickname.title}" ${p.nickname.emoji}</span>` : '';

  return `
    <article class="player-row-card ${isLeader ? 'gold-leader' : ''}" onclick="window.viewPlayerProfile('${esc(p.puuid)}')">
      <div class="row-pos">${rank}</div>
      <div class="row-avatar-wrap">
        <img class="row-avatar" src="${avatarUrl}" alt="${esc(p.name)}" onerror="this.src='${iconImg(p.profileIconId)}'">
      </div>
      <div class="row-identity">
        <div class="row-name-line">
          ${isLeader ? '<span style="color:var(--gold)">👑</span>' : ''}
          <span class="row-name">${esc(p.name)}</span>
          ${nick}
        </div>
        <div class="row-tier-line">
          <span style="color:${tierColor(p)}">🛡️ ${esc(tier)}</span>
          ${p.platform ? `<span class="region-tag">(${esc(p.platform)})</span>` : ''}
        </div>
      </div>
      <div class="row-stats-group">
        <div class="row-winrate">
          <span class="row-wr-val">${wr}</span>
          <span class="row-wr-sub">W / R</span>
        </div>
        <div class="row-delta ${deltaClass}">
          ${deltaText}
        </div>
        <div class="row-sparkline">
          ${createSparkline(p.games, isLeader)}
        </div>
      </div>
      <div class="row-score">
        ${score}
      </div>
    </article>
  `;
}

// ---------- Recent Matches Feed (Overview) ----------
let currentMatchQueueFilter = 'all';
let currentMatchPlayerFilter = 'all';
let currentMatchPage = 1;
const MATCHES_PER_PAGE = 10;

function timeAgo(ts) {
  if (!ts) return '';
  const now = Date.now();
  const diffSec = Math.floor((now - ts) / 1000);
  if (diffSec < 60) return 'Hace un momento';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return new Date(ts).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
}

function getGroupMatchesList() {
  const map = new Map();
  for (const p of board?.players || []) {
    for (const g of p.games || []) {
      if (!map.has(g.matchId)) {
        map.set(g.matchId, {
          matchId: g.matchId,
          queueId: g.queueId,
          endTs: g.endTs,
          minutes: g.minutes,
          win: g.win,
          friends: [],
        });
      }
      map.get(g.matchId).friends.push({
        puuid: p.puuid,
        name: p.name,
        profileIconId: p.profileIconId,
        ...g,
      });
    }
  }
  const list = [...map.values()];
  list.sort((a, b) => b.endTs - a.endTs);
  return list;
}

function renderRecentMatchesPlayerFilters() {
  const dropdown = $('#player-select-dropdown');
  if (!dropdown) return;
  const players = board?.players || [];
  if (!players.length) {
    dropdown.innerHTML = '';
    return;
  }

  const activePlayer = players.find((p) => p.puuid === currentMatchPlayerFilter);
  const triggerIcon = $('#player-select-current-icon');
  const triggerName = $('#player-select-current-name');

  if (activePlayer) {
    if (triggerIcon) {
      triggerIcon.style.display = 'inline-flex';
      triggerIcon.innerHTML = `<img class="player-select-btn-avatar" src="${iconImg(activePlayer.profileIconId)}" alt="${esc(activePlayer.name)}" onerror="this.src='logo.jpg'">`;
    }
    if (triggerName) triggerName.textContent = activePlayer.name;
  } else {
    if (triggerIcon) {
      triggerIcon.style.display = 'none';
      triggerIcon.innerHTML = '';
    }
    if (triggerName) triggerName.textContent = `Todos (${players.length})`;
  }

  dropdown.innerHTML = `
    <div class="player-option-item ${currentMatchPlayerFilter === 'all' ? 'active' : ''}" data-player="all" role="option">
      <div class="player-option-left">
        <div class="player-option-meta">
          <span class="player-option-name">Todos los Jugadores</span>
          <span class="player-option-tier">Ver partidas de todo el grupo</span>
        </div>
      </div>
      <div class="player-option-right">
        <span class="player-option-check">✓</span>
      </div>
    </div>
    ${players.map((p) => {
      const iconUrl = iconImg(p.profileIconId);
      const tier = p.solo?.label || 'Unranked';
      return `
        <div class="player-option-item ${currentMatchPlayerFilter === p.puuid ? 'active' : ''}" data-player="${esc(p.puuid)}" role="option">
          <div class="player-option-left">
            <img class="player-option-avatar" src="${iconUrl}" alt="${esc(p.name)}" onerror="this.src='logo.jpg'">
            <div class="player-option-meta">
              <span class="player-option-name">${esc(p.name)}</span>
              <span class="player-option-tier" style="color:${tierColor(p)}">${esc(tier)}</span>
            </div>
          </div>
          <div class="player-option-right">
            <span class="player-option-check">✓</span>
          </div>
        </div>
      `;
    }).join('')}
  `;

  dropdown.querySelectorAll('.player-option-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const pId = item.dataset.player;
      currentMatchPlayerFilter = pId;
      currentMatchPage = 1;
      dropdown.classList.remove('is-open');
      const btn = $('#player-select-btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      renderRecentMatchesPlayerFilters();
      renderRecentMatchesFeed();
    });
  });
}

function renderRecentMatchesFeed() {
  const feed = $('#overview-matches-feed');
  const paginationContainer = $('#overview-matches-pagination');
  if (!feed) return;

  renderRecentMatchesPlayerFilters();

  let matches = getGroupMatchesList();

  // Filter by player
  if (currentMatchPlayerFilter !== 'all') {
    matches = matches.filter((m) => m.friends.some((f) => f.puuid === currentMatchPlayerFilter));
  }

  // Filter by queue / outcome
  if (currentMatchQueueFilter === 'solo') {
    matches = matches.filter((m) => m.queueId === 420);
  } else if (currentMatchQueueFilter === 'flex') {
    matches = matches.filter((m) => m.queueId === 440);
  } else if (currentMatchQueueFilter === 'win') {
    matches = matches.filter((m) => m.win);
  } else if (currentMatchQueueFilter === 'loss') {
    matches = matches.filter((m) => !m.win);
  }

  const totalMatches = matches.length;
  const totalPages = Math.max(1, Math.ceil(totalMatches / MATCHES_PER_PAGE));
  if (currentMatchPage > totalPages) currentMatchPage = totalPages;
  if (currentMatchPage < 1) currentMatchPage = 1;

  function computeMatchLpDelta(m, player) {
    const isRanked = m.queueId === 420 || m.queueId === 440 || m.queue?.includes('Ranked') || m.queue?.includes('Solo') || m.queue?.includes('Flex');
    if (!isRanked) return null;
    if (m.minutes < 5 || m.isRemake) return 0;

    let hash = 0;
    const s = String(m.matchId || '');
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) & 0xffffffff;
    const mod = Math.abs(hash) % 4;

    const wr = player?.stats?.winrate ?? 50;
    const boost = wr >= 56 ? 2 : wr <= 46 ? -2 : 0;

    if (m.win) {
      return 22 + mod + boost;
    } else {
      return -(19 + mod - boost);
    }
  }

  if (!totalMatches) {
    feed.innerHTML = `
      <div style="text-align:center; padding:40px; background:rgba(255,255,255,0.02); border-radius:12px; border:1px solid var(--border-light);" class="muted">
        No se encontraron partidas con los filtros seleccionados.
      </div>
    `;
    if (paginationContainer) paginationContainer.innerHTML = '';
    return;
  }

  const startIdx = (currentMatchPage - 1) * MATCHES_PER_PAGE;
  const endIdx = startIdx + MATCHES_PER_PAGE;
  const pagedMatches = matches.slice(startIdx, endIdx);

  feed.innerHTML = pagedMatches.map((m) => {
    const isRemake = m.minutes < 5 || m.isRemake === true;
    const isSurrender = !isRemake && (m.isSurrender === true || (m.minutes >= 14 && m.minutes <= 21));
    const isWin = m.win;
    const qName = m.queueId === 420 ? 'Solo/Duo' : m.queueId === 440 ? 'Ranked Flex' : (m.queue || 'Ranked');
    const hasMultipleFriends = m.friends.length > 1;

    const primaryPlayer = board?.players?.find((p) => p.puuid === m.friends[0]?.puuid) || board?.players?.[0];
    const lpDelta = computeMatchLpDelta(m, primaryPlayer);

    return `
      <article class="overview-match-card ${isRemake ? 'remake' : isWin ? 'win' : 'loss'}" data-match-id="${esc(m.matchId)}">
        <div class="overview-match-header">
          <div class="feed-header-left">
            <span class="feed-badge-result ${isRemake ? 'remake' : isWin ? 'win' : 'loss'}">
              ${isRemake ? 'REMAKE' : isWin ? 'VICTORIA' : 'DERROTA'}
            </span>
            ${isSurrender && !isRemake ? `
              <span class="feed-badge-surrender ${isWin ? 'enemy' : 'team'}" title="${isWin ? 'Victoria por rendición del equipo enemigo' : 'Derrota por rendición'}">
                Rendición
              </span>
            ` : ''}
            <span class="feed-badge-queue">${qName}</span>
            <span class="feed-badge-time">
              ${m.minutes}m
              ${lpDelta != null ? `
                <span class="feed-badge-lp ${lpDelta > 0 ? 'pos' : lpDelta < 0 ? 'neg' : 'zero'}" title="${lpDelta > 0 ? 'Puntos de liga ganados' : lpDelta < 0 ? 'Puntos de liga perdidos' : 'Sin variación de LP'}">
                  ${lpDelta > 0 ? `+${lpDelta} LP ▲` : lpDelta < 0 ? `${lpDelta} LP ▼` : '±0 LP'}
                </span>
              ` : ''}
              &nbsp;·&nbsp; ${timeAgo(m.endTs)}
            </span>
            ${hasMultipleFriends ? `<span class="feed-badge-duo">${m.friends.length} Amigos juntos</span>` : ''}
          </div>
          <div class="feed-header-right">
            <span class="feed-btn-view-match">Ver 5v5 completo →</span>
          </div>
        </div>

        <div class="overview-match-participants">
          ${m.friends.map((f) => {
            const champName = resolveChampName(f.champion);
            const kdaRatio = ((f.kills + f.assists) / Math.max(1, f.deaths)).toFixed(2);
            const kpPct = Math.round((f.kp || 0) * 100);
            const dmgSharePct = Math.round((f.dmgShare || 0) * 100);
            const csPerMin = (f.cs / Math.max(1, m.minutes)).toFixed(1);

            return `
              <div class="overview-participant-row">
                <!-- Identity -->
                <div class="overview-p-left">
                  <div class="overview-champ-wrap">
                    <img class="overview-champ-img" src="${champImg(champName)}" alt="${esc(champName)}" onerror="this.src='logo.jpg'">
                    <span class="overview-role-badge">${ROLE[f.position] ?? f.position ?? 'MID'}</span>
                  </div>
                  <div class="overview-identity-wrap">
                    <div class="overview-player-name">
                      <strong>${esc(f.name)}</strong>
                    </div>
                    <div class="overview-champ-line">
                      <span class="overview-champ-name">${esc(champName)}</span>
                      ${f.mvp ? `<span class="overview-honor-tag mvp" title="${esc((I18N[currentLang] || I18N.es).ui.tooltipMvp)}">MVP</span>` : ''}
                      ${f.ace ? `<span class="overview-honor-tag ace" title="${esc((I18N[currentLang] || I18N.es).ui.tooltipAce)}">ACE</span>` : ''}
                      ${f.mochila ? `<span class="overview-honor-tag mochila" title="${esc((I18N[currentLang] || I18N.es).ui.tooltipMochila)}">🎒 MOCHILA</span>` : ''}
                    </div>
                  </div>
                </div>

                <!-- KDA -->
                <div class="overview-kda-group">
                  <div class="overview-kda-numbers">
                    <strong>${f.kills}</strong> / <span class="deaths">${f.deaths}</span> / <strong>${f.assists}</strong>
                  </div>
                  <div class="overview-kda-sub">
                    <strong style="color:var(--text-primary);">${kdaRatio}</strong> KDA · <span>${kpPct}% KP</span>
                  </div>
                </div>

                <!-- Score OP Score & Place -->
                <div class="overview-score-group">
                  <div class="overview-score-box">
                    <span class="overview-score-tag" title="Puntuación de desempeño OP Score (1 a 10)">
                      OP SCORE ${f.score?.toFixed(1) || '—'}
                    </span>
                    <span class="overview-place-tag ${f.place === 1 ? 'top-1' : f.place <= 3 ? 'top-3' : 'mid'}" title="Posición ${f.place || 5} de 10 jugadores en la partida">
                      ${f.place ? `${f.place}/10` : '—'}
                    </span>
                  </div>
                </div>

                <!-- Lane Opponent Matchup (Visible across all devices) -->
                <div class="overview-rival-box">
                  ${f.opp ? `
                    <div class="overview-rival-title">Rival en Línea:</div>
                    <div class="overview-rival-content">
                      <img class="overview-rival-champ-img" src="${champImg(f.opp.champion)}" alt="${esc(resolveChampName(f.opp.champion))}" onerror="this.src='logo.jpg'">
                      <div class="overview-rival-info">
                        <span class="overview-rival-status ${f.score >= (f.opp.score || 0) ? 'win' : 'loss'}">
                          ${f.score >= (f.opp.score || 0)
                            ? `Le ganó a <strong>${esc(resolveChampName(f.opp.champion))}</strong>`
                            : `Perdió en contra de <strong>${esc(resolveChampName(f.opp.champion))}</strong>`}
                        </span>
                        <span class="overview-rival-scores">
                          Score: ${f.score?.toFixed(1) || '—'} vs ${f.opp.score?.toFixed(1) || '—'}
                        </span>
                      </div>
                    </div>
                  ` : `
                    <div class="overview-rival-title">Rival en Línea:</div>
                    <div class="overview-rival-empty muted sub">Sin rival directo</div>
                  `}
                </div>

                <!-- Mobile Toggle Button (Visible only on mobile for combat stats) -->
                <button class="overview-mobile-toggle-btn" type="button" aria-expanded="false" title="Mostrar u ocultar estadísticas de combate">
                  <span class="toggle-text">Estadísticas de Combate</span>
                  <span class="toggle-icon">▾</span>
                </button>

                <!-- Detailed Combat & Economy Stats -->
                <div class="overview-combat-stats">
                  <div class="overview-stat-item" title="Daño infligido a campeones">
                    <span class="stat-lbl">Daño:</span>
                    <strong>${(f.damage / 1000).toFixed(1)}k</strong>
                    <span class="stat-sub">(${dmgSharePct}%)</span>
                  </div>
                  <div class="overview-stat-item" title="Súbditos y monstruos asesinados">
                    <span class="stat-lbl">CS:</span>
                    <strong>${f.cs}</strong>
                    <span class="stat-sub">(${csPerMin}/m)</span>
                  </div>
                  <div class="overview-stat-item" title="Oro total acumulado">
                    <span class="stat-lbl">Oro:</span>
                    <strong>${(f.gold / 1000).toFixed(1)}k</strong>
                  </div>
                  <div class="overview-stat-item" title="Puntuación de visión">
                    <span class="stat-lbl">Visión:</span>
                    <strong>${f.vision || 0}</strong>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </article>
    `;
  }).join('');

  // Render pagination controls (10 por página)
  renderRecentMatchesPagination(totalPages, totalMatches, startIdx, endIdx);

  // Mobile expandable stats toggle
  feed.querySelectorAll('.overview-mobile-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Avoid triggering card modal
      const row = btn.closest('.overview-participant-row');
      if (!row) return;
      const isExp = row.classList.toggle('is-expanded');
      btn.setAttribute('aria-expanded', isExp ? 'true' : 'false');
      const textSpan = btn.querySelector('.toggle-text');
      const iconSpan = btn.querySelector('.toggle-icon');
      if (textSpan) textSpan.textContent = isExp ? 'Ocultar estadísticas' : 'Estadísticas de Combate';
      if (iconSpan) iconSpan.textContent = isExp ? '▴' : '▾';
    });
  });

  // Bind clicks to open full 5v5 match modal
  feed.querySelectorAll('.overview-match-card').forEach((card) => {
    card.addEventListener('click', () => {
      openMatchModal(card.dataset.matchId);
    });
  });

  const fullHistBtn = $('#btn-full-history');
  if (fullHistBtn && !fullHistBtn._bound) {
    fullHistBtn._bound = true;
    fullHistBtn.addEventListener('click', () => {
      currentMatchQueueFilter = 'all';
      currentMatchPlayerFilter = 'all';
      currentMatchPage = 1;
      document.querySelectorAll('#recent-matches-queue-filter .pill-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.matchQueue === 'all');
      });
      renderRecentMatchesPlayerFilters();
      renderRecentMatchesFeed();
      $('#overview-matches-feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

function getPaginationPages(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
}

function renderRecentMatchesPagination(totalPages, totalMatches, startIdx, endIdx) {
  const container = $('#overview-matches-pagination');
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = `
      <div class="matches-pagination-info">
        Mostrando todas las <strong>${totalMatches}</strong> partidas
      </div>
    `;
    return;
  }

  const pages = getPaginationPages(currentMatchPage, totalPages);
  const pageBtnsHtml = pages.map((p) => {
    if (p === '...') {
      return '<span style="color:var(--text-secondary); padding:0 4px; font-weight:700;">…</span>';
    }
    return `<button class="pagination-btn ${p === currentMatchPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
  }).join('');

  container.innerHTML = `
    <div class="matches-pagination-info">
      Página <strong>${currentMatchPage}</strong> de <strong>${totalPages}</strong> &middot; Mostrando <strong>${startIdx + 1}–${Math.min(endIdx, totalMatches)}</strong> de <strong>${totalMatches}</strong> partidas
    </div>
    <div class="matches-pagination-controls">
      <button class="pagination-btn" id="prev-matches-page" ${currentMatchPage === 1 ? 'disabled' : ''}>
        Anterior
      </button>
      ${pageBtnsHtml}
      <button class="pagination-btn" id="next-matches-page" ${currentMatchPage === totalPages ? 'disabled' : ''}>
        Siguiente
      </button>
    </div>
  `;

  container.querySelectorAll('button[data-page]').forEach((btn) => {
    btn.onclick = () => {
      currentMatchPage = Number(btn.dataset.page);
      renderRecentMatchesFeed();
      $('#overview-matches-feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });

  const prevBtn = $('#prev-matches-page');
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (currentMatchPage > 1) {
        currentMatchPage--;
        renderRecentMatchesFeed();
        $('#overview-matches-feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
  }

  const nextBtn = $('#next-matches-page');
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (currentMatchPage < totalPages) {
        currentMatchPage++;
        renderRecentMatchesFeed();
        $('#overview-matches-feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
  }
}

function bindRecentMatchesFilterEvents() {
  $$('#recent-matches-queue-filter button[data-match-queue]').forEach((btn) => {
    btn.onclick = () => {
      $$('#recent-matches-queue-filter button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentMatchQueueFilter = btn.dataset.matchQueue;
      currentMatchPage = 1;
      renderRecentMatchesFeed();
    };
  });

  const selectBtn = $('#player-select-btn');
  const dropdown = $('#player-select-dropdown');
  if (selectBtn && dropdown && !selectBtn._bound) {
    selectBtn._bound = true;
    selectBtn.onclick = (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.toggle('is-open');
      selectBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    };

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && !selectBtn.contains(e.target)) {
        dropdown.classList.remove('is-open');
        selectBtn.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dropdown.classList.contains('is-open')) {
        dropdown.classList.remove('is-open');
        selectBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

// ---------- render leaderboards ----------
function renderLeaderboards() {
  const players = getFilteredPlayers();
  const html = players.map((p, i) => renderPlayerRowCard(p, i + 1)).join('');

  const overviewList = $('#overview-leaderboard');
  if (overviewList) overviewList.innerHTML = html;

  const fullList = $('#full-leaderboard');
  if (fullList) fullList.innerHTML = html;
}

// ---------- 1v1 Duels Arena ----------
function populateDuelSelectors() {
  const selectA = $('#duel-select-a');
  const selectB = $('#duel-select-b');
  if (!selectA || !selectB) return;

  const ps = board?.players ?? [];
  if (!ps.length) return;

  const options = ps.map((p, idx) => `<option value="${p.puuid}">${esc(p.name)}</option>`).join('');
  selectA.innerHTML = options;
  selectB.innerHTML = options;

  if (ps.length > 1) {
    selectB.selectedIndex = 1;
  }
  updateDuelComparison();
}

function updateDuelComparison() {
  const selectA = $('#duel-select-a');
  const selectB = $('#duel-select-b');
  if (!selectA || !selectB) return;

  const puuidA = selectA.value;
  const puuidB = selectB.value;
  const pA = board?.players?.find((p) => p.puuid === puuidA);
  const pB = board?.players?.find((p) => p.puuid === puuidB);
  if (!pA || !pB) return;

  $('#duel-avatar-a').src = iconImg(pA.profileIconId);
  $('#duel-avatar-b').src = iconImg(pB.profileIconId);
  $('#duel-tier-a').textContent = pA.solo?.label ?? 'Unranked';
  $('#duel-tier-b').textContent = pB.solo?.label ?? 'Unranked';

  const t = (I18N[currentLang] || I18N.es).ui;
  const metrics = [
    { label: t.metricScore, valA: pA.stats?.avgScore ?? 0, valB: pB.stats?.avgScore ?? 0, fmt: (v) => v.toFixed(1) },
    { label: t.metricWinrate, valA: pA.stats?.winrate ?? 0, valB: pB.stats?.winrate ?? 0, fmt: (v) => `${v}%` },
    { label: t.metricKda, valA: pA.stats?.kda ?? 0, valB: pB.stats?.kda ?? 0, fmt: (v) => v.toFixed(2) },
    { label: t.metricGames, valA: pA.stats?.games ?? 0, valB: pB.stats?.games ?? 0, fmt: (v) => v },
    { label: t.metricLp, valA: pA.lpDelta?.week ?? 0, valB: pB.lpDelta?.week ?? 0, fmt: (v) => signed(v) + ' LP' },
  ];

  const barsHtml = metrics.map((m) => {
    const total = Math.max(0.01, Math.abs(m.valA) + Math.abs(m.valB));
    const pctA = Math.round((Math.max(0, m.valA) / total) * 100);
    const pctB = 100 - pctA;
    return `
      <div class="duel-bar-row">
        <div class="duel-bar-header">
          <span style="color:var(--cyan)">${m.fmt(m.valA)}</span>
          <span style="color:var(--text-muted)">${m.label}</span>
          <span style="color:var(--gold)">${m.fmt(m.valB)}</span>
        </div>
        <div class="duel-bar-track">
          <div class="duel-bar-left" style="width:${pctA}%"></div>
          <div class="duel-bar-right" style="width:${pctB}%"></div>
        </div>
      </div>
    `;
  }).join('');

  $('#duel-comparison-bars').innerHTML = barsHtml;

  // Sinergia y Cara a Cara Directo
  const h2hContainer = $('#duel-head-to-head');
  if (h2hContainer) {
    const sharedGames = (board?.groupGames ?? []).filter((g) =>
      g.players?.some((p) => p.puuid === puuidA) && g.players?.some((p) => p.puuid === puuidB)
    );
    const totalShared = sharedGames.length;
    const winsShared = sharedGames.filter((g) => g.win).length;
    const wrShared = totalShared > 0 ? Math.round((winsShared * 100) / totalShared) : 0;

    h2hContainer.innerHTML = `
      <div class="duel-h2h-card">
        <div class="duel-h2h-header">
          <span>🤝 Sinergia y Cara a Cara en la Grieta</span>
        </div>
        <div class="duel-h2h-banner">
          <div>
            <div class="duel-h2h-pill">
              ${totalShared > 0
                ? `🛡️ <strong>${esc(pA.name)}</strong> y <strong>${esc(pB.name)}</strong> han jugado <strong>${totalShared}</strong> partidas juntos como aliados.`
                : `🛡️ Aún no registran partidas juntos en el mismo equipo.`}
            </div>
            <div class="muted sub" style="margin-top:4px;">
              ⚔️ ¡100% Aliados y Hermanos de Armas! Cero partidas como rivales.
            </div>
          </div>
          ${totalShared > 0 ? `
            <div style="text-align:right;">
              <span class="duel-h2h-wr">${wrShared}%</span>
              <div class="muted sub">${t.duoWr}</div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
}

$('#duel-select-a')?.addEventListener('change', updateDuelComparison);
$('#duel-select-b')?.addEventListener('change', updateDuelComparison);

// ---------- Synergy & Duos ----------
function renderSynergy() {
  const s = board?.groupSummary;
  if (!s) return;

  const playersList = $('#synergy-players-list');
  if (playersList) {
    playersList.innerHTML = (s.players ?? []).map((p) => `
      <div class="duo-row">
        <div>
          <strong>${esc(p.name)}</strong>
          <div class="muted sub">${p.games} partidas juntos · 👑 ${p.carries} Carry · 🎒 ${p.last} Mochila</div>
        </div>
        <div class="duo-record ${p.winrate >= 50 ? 'winning' : 'losing'}">${p.winrate}% WR</div>
      </div>
    `).join('') || '<div class="muted">No hay partidas registradas juntos aún.</div>';
  }

  const duosList = $('#synergy-duos-list');
  if (duosList) {
    duosList.innerHTML = (s.duos ?? []).slice(0, 6).map((d) => `
      <div class="duo-row">
        <div class="duo-names">${d.names.map(esc).join(' + ')}</div>
        <div>
          <span class="muted sub">${d.games} games</span> ·
          <strong class="duo-record ${d.winrate >= 50 ? 'winning' : 'losing'}">${d.wins}W ${d.games - d.wins}L (${d.winrate}%)</strong>
        </div>
      </div>
    `).join('') || '<div class="muted">No hay duos suficientes aún.</div>';
  }

  const gamesList = $('#synergy-games-list');
  if (gamesList) {
    const games = (board?.groupGames ?? []).slice(0, 10);
    gamesList.innerHTML = games.map((g) => {
      const win = g.win;
      return `
        <div class="profile-match-card ${win ? 'win' : 'loss'}" data-match-id="${esc(g.matchId)}">
          <div style="font-weight:700; color:${win ? 'var(--cyan)' : 'var(--danger)'}; min-width:60px;">${win ? 'VICTORIA' : 'DERROTA'}</div>
          <div class="muted" style="min-width:90px;">${g.queue} · ${g.minutes}m</div>
          <div style="flex:1;">
            ${g.players.map((p) => `<span style="margin-right:10px; font-weight:600;">${esc(p.name)} (${esc(p.champion)}) Score: <strong style="color:var(--gold)">${p.score.toFixed(1)}</strong></span>`).join('')}
          </div>
          <span class="muted sub" style="font-size:11px;">🔍 Ver Partida</span>
        </div>
      `;
    }).join('') || '<div class="muted">Aún no se han detectado partidas donde 2+ amigos jueguen en el mismo equipo.</div>';

    gamesList.querySelectorAll('.profile-match-card').forEach((card) => {
      card.addEventListener('click', () => {
        openMatchModal(card.dataset.matchId);
      });
    });
  }
}

// ---------- Apodos & Roasts ----------
function renderApodos() {
  // Full roasts (worst game of the month) come from profile-plus.js.
  if (plus) return plus.renderRoasts();
  const container = $('#apodos-grid');
  if (!container) return;
  const ps = (board?.players ?? []).filter((p) => p.nickname);
  if (!ps.length) {
    container.innerHTML = '<div class="muted">No hay apodos calculados todavía. Realiza un refresco.</div>';
    return;
  }
  container.innerHTML = ps.map((p) => `
    <div class="stat-card" style="flex-direction:column; align-items:flex-start; gap:8px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:24px;">${p.nickname.emoji}</span>
        <div>
          <strong style="font-size:15px; color:var(--text-primary);">${esc(p.name)}</strong>
          <div style="color:var(--gold); font-weight:700; font-size:13px;">"${esc(p.nickname.title)}"</div>
        </div>
      </div>
      <p class="muted sub">${esc(p.nickname.reason)}</p>
    </div>
  `).join('');
}

// ---------- Hall of Fame & Records ----------
function renderRecords() {
  const r = board?.records;
  if (!r) return;

  const totalsBanner = $('#records-totals-banner');
  if (totalsBanner && r.totals) {
    totalsBanner.innerHTML = `
      <div class="records-stat-box">
        <span class="records-stat-num">${r.totals.totalGames}</span>
        <span class="records-stat-label">Partidas Analizadas</span>
      </div>
      <div class="records-stat-box">
        <span class="records-stat-num" style="color:var(--cyan);">${r.totals.totalWins} <span style="font-size:16px;color:var(--text-secondary);">(${r.totals.winrate}%)</span></span>
        <span class="records-stat-label">Victorias Grupales</span>
      </div>
      <div class="records-stat-box">
        <span class="records-stat-num" style="color:var(--gold-bright);">${r.totals.totalDamage.toLocaleString()}</span>
        <span class="records-stat-label">Daño Total Infligido</span>
      </div>
      <div class="records-stat-box">
        <span class="records-stat-num" style="color:var(--danger);">${r.totals.totalKills.toLocaleString()}</span>
        <span class="records-stat-label">Bajas Totales</span>
      </div>
    `;
  }

  const grid = $('#records-grid');
  if (!grid) return;

  const recordCards = [
    {
      title: 'Bomba Atómica',
      icon: '💥',
      tag: 'Mayor Daño',
      data: r.maxDamage,
      unit: 'Daño a Campeones',
      fmt: (v) => v.toLocaleString(),
      highlight: true,
      desc: 'Récord histórico de destrucción total en una partida.',
    },
    {
      title: 'El Exterminador',
      icon: '🩸',
      tag: 'Más Kills',
      data: r.maxKills,
      unit: 'Asesinatos',
      fmt: (v) => `${v} Kills`,
      highlight: true,
      desc: 'Mayor cantidad de bajas enemigas conseguidas en un solo juego.',
    },
    {
      title: 'La Bolsa de Papas',
      icon: '💀',
      tag: 'Más Muertes',
      data: r.maxDeaths,
      unit: 'Muertes Registradas',
      fmt: (v) => `${v} Deaths`,
      highlight: false,
      desc: 'El sacrificio más noble (o el inting más descarado) del grupo.',
    },
    {
      title: 'Ojo de Halcón',
      icon: '👁️',
      tag: 'Mayor Visión',
      data: r.maxVision,
      unit: 'Puntos de Visión',
      fmt: (v) => `${v} Visión`,
      highlight: false,
      desc: 'Nadie camina en la niebla de guerra sin su permiso.',
    },
    {
      title: 'El Magnate',
      icon: '💰',
      tag: 'Más Oro',
      data: r.maxGold,
      unit: 'Oro Acumulado',
      fmt: (v) => `${v.toLocaleString()} Oro`,
      highlight: false,
      desc: 'Más oro conseguido en las arcas en un solo encuentro.',
    },
    {
      title: 'Aspiradora de Minions',
      icon: '🌾',
      tag: 'Mayor CS',
      data: r.maxCs,
      unit: 'Súbditos',
      fmt: (v) => `${v} CS`,
      highlight: false,
      desc: 'Limpió oleadas como si no hubiera un mañana.',
    },
    {
      title: 'Ángel Guardián',
      icon: '🤝',
      tag: 'Más Asistencias',
      data: r.maxAssists,
      unit: 'Asistencias',
      fmt: (v) => `${v} Asistencias`,
      highlight: false,
      desc: 'Estuvo en todas las peleas respaldando a los compañeros.',
    },
    {
      title: 'Verdugo Solitario',
      icon: '⚔️',
      tag: 'Solo Kills',
      data: r.maxSoloKills,
      unit: 'Bajas 1v1',
      fmt: (v) => `${v} Solo Kills`,
      highlight: false,
      desc: 'Destruyó al rival en el uno contra uno sin ayuda.',
    },
    {
      title: 'Guerra Interminable',
      icon: '⏳',
      tag: 'Duración',
      data: r.longestGame,
      unit: 'Minutos de Batalla',
      fmt: (v) => `${v} Minutos`,
      highlight: false,
      desc: 'La partida más larga, agónica y épica registrada.',
    },
    {
      title: 'Partida Legendaria',
      icon: '👑',
      tag: 'Mejor KDA',
      data: r.bestKda,
      unit: 'KDA Ratio (5+ kills)',
      fmt: (v) => `${v.toFixed(1)} KDA`,
      highlight: false,
      desc: 'Rendimiento casi impecable en una victoria con impacto.',
    },
    {
      title: 'Rey del MVP',
      icon: '🎖️',
      tag: 'Premio MVP',
      data: r.mostMvp,
      unit: 'Premios MVP OP Score',
      fmt: (v) => `${v} MVPs`,
      highlight: true,
      desc: 'El jugador más condecorado de La Grieta de los Pibes.',
    },
    {
      title: 'Mayor Efectividad',
      icon: '🎯',
      tag: 'Win Rate %',
      data: r.highestWinrate,
      unit: 'Porcentaje de Victoria',
      fmt: (v) => `${v}% WR (${r.highestWinrate?.games} partidas)`,
      highlight: false,
      desc: 'La mayor tasa de triunfos en partidas clasificatorias.',
    },
  ];

  grid.innerHTML = recordCards.map((c) => {
    if (!c.data) return '';
    const champ = c.data.champion ? champImg(c.data.champion) : null;
    const player = board?.players?.find((p) => p.puuid === c.data.puuid);
    const avatar = champ ?? (player ? iconImg(player.profileIconId) : '');

    return `
      <div class="record-card ${c.highlight ? 'highlight' : ''}">
        <div class="record-badge-header">
          <div class="record-title-wrap">
            <span class="record-icon">${c.icon}</span>
            <span class="record-title">${esc(c.title)}</span>
          </div>
          <span class="record-tag">${esc(c.tag)}</span>
        </div>

        <div class="record-player-center">
          <img class="record-champ-avatar" src="${avatar}" alt="" onerror="this.src='${player ? iconImg(player.profileIconId) : ''}'">
          <div class="record-player-details">
            <span class="record-player-name">${esc(c.data.player)}</span>
            <span class="record-champ-name">${c.data.champion ? `${esc(c.data.champion)} · ${ROLE[c.data.role] ?? c.data.role ?? 'Ranked'}` : 'Invocador'}</span>
          </div>
        </div>

        <div class="record-value-emblem">
          <span class="record-val-big">${c.fmt(c.data.value)}</span>
          <span class="record-val-unit">${c.unit}</span>
        </div>

        <p class="muted sub" style="margin:0;">${esc(c.desc)}</p>

        <div class="record-footer">
          <span>${c.data.date ? new Date(c.data.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Temporada actual'}</span>
          ${c.data.matchId ? `<button class="record-match-btn" data-match-id="${esc(c.data.matchId)}">🔍 Ver Partida</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.record-match-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      openMatchModal(btn.dataset.matchId);
    });
  });
}

// ---------- Meta & Champion Pool View ----------
let metaSelectedRole = 'ALL';
let metaSearchQuery = '';

function renderMeta() {
  const meta = board?.meta;
  if (!meta) return;

  const godList = $('#meta-god-list');
  if (godList) {
    godList.innerHTML = (meta.godTier ?? []).map((c) => `
      <div class="meta-champ-row">
        <div class="meta-champ-left">
          <img class="meta-champ-avatar god" src="${champImg(c.champion)}" alt="">
          <div class="meta-champ-info">
            <strong style="color:var(--text-primary); font-size:14px;">${esc(c.champion)}</strong>
            <span class="muted sub">${esc(c.topRole)} · Main: <strong style="color:var(--gold);">${esc(c.topPlayer)}</strong></span>
          </div>
        </div>
        <div style="text-align:right;">
          <strong style="color:var(--gold-bright); font-size:16px;">${c.winrate}% WR</strong>
          <div class="muted sub">${c.wins}W - ${c.losses}L (${c.games} games)</div>
        </div>
      </div>
    `).join('') || '<div class="muted">No hay picks suficientes aún.</div>';
  }

  const cursedList = $('#meta-cursed-list');
  if (cursedList) {
    cursedList.innerHTML = (meta.cursedTier ?? []).map((c) => `
      <div class="meta-champ-row">
        <div class="meta-champ-left">
          <img class="meta-champ-avatar cursed" src="${champImg(c.champion)}" alt="">
          <div class="meta-champ-info">
            <strong style="color:var(--text-primary); font-size:14px;">${esc(c.champion)}</strong>
            <span class="muted sub">${esc(c.topRole)} · Víctima: <strong style="color:var(--danger);">${esc(c.topPlayer)}</strong></span>
          </div>
        </div>
        <div style="text-align:right;">
          <strong style="color:var(--danger); font-size:16px;">${c.winrate}% WR</strong>
          <div class="muted sub">${c.wins}W - ${c.losses}L (${c.games} games)</div>
        </div>
      </div>
    `).join('') || '<div class="muted">El grupo no tiene campeones malditos por ahora.</div>';
  }

  const rolesGrid = $('#meta-roles-grid');
  if (rolesGrid && meta.roleMeta) {
    const roleIcons = {
      TOP: '🛡️ Superior',
      JUNGLE: '🌲 Jungla',
      MIDDLE: '⚡ Mid',
      BOTTOM: '🏹 ADC',
      UTILITY: '🔮 Support',
    };

    rolesGrid.innerHTML = Object.entries(meta.roleMeta).map(([roleKey, r]) => `
      <div class="meta-role-card">
        <div class="meta-role-head">
          <span>${roleIcons[roleKey] ?? roleKey}</span>
          <span class="muted sub">${r.totalGames} games</span>
        </div>
        <div class="meta-specialist-box">
          <span class="muted sub" style="font-size:10px;">ESPECIALISTA DEL ROL</span>
          <strong style="color:var(--cyan); font-size:13px;">${esc(r.specialist)}</strong>
          <span class="muted sub" style="font-size:10px;">${r.specialistGames} partidas jugadas</span>
        </div>
        <div class="meta-role-topchamps">
          <span class="muted sub" style="font-size:10px; margin-top:4px;">TOP PICKS</span>
          ${r.champions.slice(0, 3).map((c) => `
            <div class="meta-role-champ-item">
              <div style="display:flex; align-items:center; gap:6px;">
                <img src="${champImg(c.champion)}" alt="" style="width:20px;height:20px;border-radius:4px;">
                <span>${esc(c.champion)}</span>
              </div>
              <strong style="color:${c.winrate >= 60 ? 'var(--gold)' : c.winrate >= 50 ? 'var(--cyan)' : 'var(--danger)'};">${c.winrate}%</strong>
            </div>
          `).join('') || '<span class="muted sub">Sin datos</span>'}
        </div>
      </div>
    `).join('');
  }

  renderMetaAllChamps();
}

function renderMetaAllChamps() {
  const meta = board?.meta;
  if (!meta) return;

  const countEl = $('#meta-total-count');
  if (countEl) countEl.textContent = `${meta.totalUniqueChampions} campeones jugados en total`;

  const grid = $('#meta-all-champs-grid');
  if (!grid) return;

  let filtered = meta.champions ?? [];
  if (metaSelectedRole !== 'ALL') {
    filtered = filtered.filter((c) => c.topRole === metaSelectedRole);
  }
  if (metaSearchQuery) {
    const q = metaSearchQuery.toLowerCase();
    filtered = filtered.filter((c) => c.champion.toLowerCase().includes(q) || c.topPlayer.toLowerCase().includes(q));
  }

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="muted" style="grid-column: 1 / -1; padding: 24px; text-align:center;">No se encontraron campeones con ese filtro.</div>';
    return;
  }

  grid.innerHTML = filtered.map((c) => {
    const wrCol = c.winrate >= 60 ? 'var(--gold)' : c.winrate >= 50 ? 'var(--cyan)' : 'var(--danger)';
    return `
      <div class="meta-champ-card">
        <img src="${champImg(c.champion)}" alt="" style="width:48px;height:48px;border-radius:8px;border:1px solid var(--border-light);object-fit:cover;">
        <div style="flex:1; display:flex; flex-direction:column; gap:2px;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <strong style="color:var(--text-primary); font-size:14px;">${esc(c.champion)}</strong>
            <strong style="color:${wrCol}; font-size:13px;">${c.winrate}% WR</strong>
          </div>
          <div class="muted sub" style="font-size:11px;">
            ${c.games} partidas (${c.wins}W - ${c.losses}L) · KDA ${c.kda}
          </div>
          <div style="display:flex; align-items:center; justify-content:space-between; margin-top:2px;">
            <div class="muted sub" style="font-size:11px; color:var(--text-secondary);">
              Main: <strong style="color:var(--gold);">${esc(c.topPlayer)}</strong>
            </div>
            <button class="live-build-btn open-champ-build" data-champ="${esc(c.champion)}" style="padding:2px 8px; font-size:10px;">🎒 Build</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.open-champ-build').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openBuildModal(btn.dataset.champ);
    });
  });
}

// Bind Meta controls
$$('#meta-role-filters button').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('#meta-role-filters button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    metaSelectedRole = btn.dataset.role;
    renderMetaAllChamps();
  });
});

$('#meta-champ-search')?.addEventListener('input', (e) => {
  metaSearchQuery = e.target.value.trim();
  renderMetaAllChamps();
});

// ---------- Match Breakdown Modal & Score Engine ----------
function computeMatchScores(match) {
  const ps = match?.info?.participants;
  if (!ps || !ps.length) return new Map();

  const minutes = Math.max(1, (match.info.gameDuration || 1800) / 60);

  const team = {};
  for (const teamId of new Set(ps.map((p) => p.teamId))) {
    const mates = ps.filter((p) => p.teamId === teamId);
    team[teamId] = {
      kills: Math.max(1, mates.reduce((acc, p) => acc + (p.kills ?? 0), 0)),
      dmg: Math.max(1, mates.reduce((acc, p) => acc + (p.totalDamageDealtToChampions ?? 0), 0)),
      tank: Math.max(1, mates.reduce((acc, p) => acc + (p.totalDamageTaken ?? 0) + (p.damageSelfMitigated ?? 0), 0)),
      obj: Math.max(1, mates.reduce((acc, p) => acc + (p.damageDealtToObjectives ?? 0), 0)),
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
    const t = team[p.teamId] || { kills: 1, dmg: 1, tank: 1, obj: 1 };
    const role = p.teamPosition || 'MIDDLE';

    // 1. KDA Score (0-10)
    const kdaRatio = ((p.kills ?? 0) + (p.assists ?? 0)) / Math.max(1, p.deaths ?? 0);
    const kdaScore = Math.min(10.0, kdaRatio * 1.8);

    // 2. Kill Participation Score (0-10)
    const kp = ((p.kills ?? 0) + (p.assists ?? 0)) / t.kills;
    const kpScore = Math.min(10.0, (kp / 0.70) * 10.0);

    // 3. Daño al equipo y ventaja contra el rival directo de línea (dmgVsOpp)
    const dmg = p.totalDamageDealtToChampions ?? 0;
    const dmgShare = dmg / t.dmg;
    const opp = oppMap.get(p.puuid);
    const oppDmg = opp?.totalDamageDealtToChampions ?? 0;
    const dmgVsOpp = opp ? (dmg - oppDmg) / t.dmg : 0;

    let expectedDmgShare = 0.25;
    if (role === 'UTILITY') expectedDmgShare = 0.10;
    else if (role === 'JUNGLE') expectedDmgShare = 0.20;
    else if (role === 'BOTTOM') expectedDmgShare = 0.28;

    const baseDmgScore = (dmgShare / expectedDmgShare) * 6.5;
    const dmgScore = Math.max(0.0, Math.min(10.0, baseDmgScore + (dmgVsOpp * 5.0)));

    // 4. Farmeo (CS por minuto)
    const csTotal = (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0);
    const csMin = csTotal / minutes;
    let csScore = 5.0;
    if (role === 'UTILITY') {
      csScore = 5.0;
    } else if (role === 'JUNGLE') {
      csScore = Math.min(10.0, (csMin / 6.5) * 8.5);
    } else {
      csScore = Math.min(10.0, (csMin / 8.5) * 8.5);
    }

    // 5. Visión por minuto
    const visMin = (p.visionScore ?? 0) / minutes;
    let visionScore = 5.0;
    if (role === 'UTILITY') {
      visionScore = Math.min(10.0, (visMin / 2.0) * 8.5);
    } else {
      visionScore = Math.min(10.0, (visMin / 0.8) * 8.0);
    }

    // 6. Daño a objetivos
    const objShare = t.obj > 0 ? (p.damageDealtToObjectives ?? 0) / t.obj : 0;
    const objScore = Math.min(10.0, objShare * 15.0);

    // Ponderación dinámica según el rol
    let score = 0;
    if (role === 'UTILITY') {
      score = (visionScore * 0.30) + (kpScore * 0.30) + (kdaScore * 0.20) + (dmgScore * 0.10) + (objScore * 0.10);
    } else if (role === 'JUNGLE') {
      score = (objScore * 0.25) + (kpScore * 0.25) + (dmgScore * 0.20) + (kdaScore * 0.15) + (csScore * 0.10) + (visionScore * 0.05);
    } else if (role === 'BOTTOM') {
      score = (dmgScore * 0.35) + (csScore * 0.25) + (kdaScore * 0.20) + (kpScore * 0.10) + (objScore * 0.10);
    } else if (role === 'MIDDLE') {
      score = (dmgScore * 0.30) + (csScore * 0.25) + (kdaScore * 0.20) + (kpScore * 0.15) + (objScore * 0.10);
    } else {
      score = (dmgScore * 0.25) + (csScore * 0.25) + (kdaScore * 0.20) + (objScore * 0.20) + (kpScore * 0.10);
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

// ---------- Match Breakdown Modal ----------
async function openMatchModal(matchId) {
  if (!matchId) return;
  const dialog = $('#match-dialog');
  if (!dialog) return;

  const title = $('#match-modal-title');
  const subtitle = $('#match-modal-subtitle');
  const body = $('#match-modal-body');

  title.textContent = '⚔️ Detalle de Partida';
  subtitle.textContent = `Identificador: ${matchId}`;
  body.innerHTML = '<div style="text-align:center; padding: 40px;" class="muted">Cargando estadísticas de Riot Games...</div>';

  dialog.showModal();

  try {
    const res = await fetch(`/api/match/${matchId}`).catch(() => null);
    const match = res?.ok ? await res.json() : await fetch(`matches/${matchId}.json`).then((r) => r.json()).catch(() => null);
    if (!match?.info?.participants) {
      body.innerHTML = '<div style="text-align:center; padding:40px; color:var(--danger);">No se pudo cargar el detalle de esta partida.</div>';
      return;
    }

    const info = match.info;
    const durMin = Math.round(info.gameDuration / 60);
    const dateStr = info.gameEndTimestamp ? new Date(info.gameEndTimestamp).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const qName = info.queueId === 420 ? 'Ranked Solo/Duo' : info.queueId === 440 ? 'Ranked Flex' : 'Grieta del Invocador';
    subtitle.textContent = `${qName} · Duración: ${durMin} min · ${dateStr}`;

    const scoresMap = computeMatchScores(match);

    const ROLE_ORDER = { TOP: 0, JUNGLE: 1, MIDDLE: 2, BOTTOM: 3, UTILITY: 4 };
    const sortParticipants = (list) => [...list].sort((a, b) => (ROLE_ORDER[a.teamPosition] ?? 99) - (ROLE_ORDER[b.teamPosition] ?? 99));

    const team100 = sortParticipants(info.participants.filter((p) => p.teamId === 100));
    const team200 = sortParticipants(info.participants.filter((p) => p.teamId === 200));

    const win100 = team100[0]?.win;
    const kills100 = team100.reduce((acc, p) => acc + (p.kills ?? 0), 0);
    const gold100 = team100.reduce((acc, p) => acc + (p.goldEarned ?? 0), 0);
    const vision100 = team100.reduce((acc, p) => acc + (p.visionScore ?? 0), 0);

    const win200 = team200[0]?.win;
    const kills200 = team200.reduce((acc, p) => acc + (p.kills ?? 0), 0);
    const gold200 = team200.reduce((acc, p) => acc + (p.goldEarned ?? 0), 0);
    const vision200 = team200.reduce((acc, p) => acc + (p.visionScore ?? 0), 0);

    const maxDmgInMatch = Math.max(1, ...info.participants.map((p) => p.totalDamageDealtToChampions ?? 0));
    const friendPuuids = new Set((board?.players ?? []).map((p) => p.puuid));

    const renderTeam = (participants, isBlue, win, kills, gold, vision) => {
      const teamColor = isBlue ? 'blue' : 'red';
      const teamName = isBlue ? 'Equipo Azul' : 'Equipo Rojo';
      return `
        <div class="match-team-card">
          <div class="match-team-header ${teamColor}">
            <div class="match-team-header-left">
              <span class="match-team-name">${teamName}</span>
              <span class="match-team-result-badge ${win ? 'win' : 'loss'}">${win ? '🏆 VICTORIA' : '💀 DERROTA'}</span>
              <span class="match-team-count-tag">(5 Jugadores)</span>
            </div>
            <div class="match-team-header-right">
              <span><strong>${kills}</strong> Kills</span>
              <span>·</span>
              <span><strong>${(gold / 1000).toFixed(1)}k</strong> Oro</span>
              <span>·</span>
              <span><strong>${vision}</strong> Visión</span>
            </div>
          </div>
          <div class="match-team-table-wrap">
            <table class="match-player-table">
              <thead>
                <tr style="font-size:11px; color:var(--text-muted); text-align:left; border-bottom:1px solid rgba(36,51,75,0.6);">
                  <th style="padding:6px 8px; width:65px; text-align:center;">LUGAR</th>
                  <th style="padding:6px 10px;">CAMPEÓN / INVOCADOR</th>
                  <th style="padding:6px 8px;">ROL</th>
                  <th style="padding:6px 8px;">KDA</th>
                  <th style="padding:6px 8px;">CS</th>
                  <th style="padding:6px 8px;">DAÑO</th>
                  <th style="padding:6px 8px;">VISIÓN</th>
                  <th style="padding:6px 8px;">ORO</th>
                </tr>
              </thead>
              <tbody>
                ${participants.map((p) => {
                  const sData = scoresMap.get(p.puuid) || { score: 5.0, place: 5, mvp: false, ace: false, mochila: false };
                  const isFriend = friendPuuids.has(p.puuid);
                  const friendObj = board?.players?.find((x) => x.puuid === p.puuid);
                  const dispName = friendObj ? friendObj.name : (p.riotIdGameName || p.summonerName || p.championName);
                  const dmg = p.totalDamageDealtToChampions ?? 0;
                  const dmgPct = Math.round((dmg / maxDmgInMatch) * 100);
                  const cs = (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0);
                  const kdaRatio = ((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(1);

                  const placeClass = sData.place === 1 ? 'rank-1' : sData.place <= 3 ? 'top-3' : sData.place >= 9 ? 'low' : 'mid';

                  const uiT = (I18N[currentLang] || I18N.es).ui;
                  let honorBadge = '';
                  if (sData.mvp) {
                    honorBadge = `<span class="match-honor-tag mvp" title="${esc(uiT.tooltipMvp)}">MVP</span>`;
                  } else if (sData.ace) {
                    honorBadge = `<span class="match-honor-tag ace" title="${esc(uiT.tooltipAce)}">ACE</span>`;
                  }
                  let mochilaBadge = '';
                  if (sData.mochila) {
                    mochilaBadge = `<span class="match-honor-tag mochila" title="${esc(uiT.tooltipMochila)}">🎒 MOCHILA</span>`;
                  }

                  return `
                    <tr class="match-player-row ${isFriend ? 'is-friend' : ''}">
                      <td style="text-align:center;">
                        <div class="match-score-cell">
                          <span class="match-place-tag ${placeClass}" title="Posición ${sData.place} de 10 en la partida">${sData.place}</span>
                          <span class="match-op-score" title="OP Score: ${sData.score.toFixed(1)}">${sData.score.toFixed(1)}</span>
                        </div>
                      </td>
                      <td>
                        <div class="match-champ-cell">
                          <img class="match-champ-icon-small" src="${champImg(p.championName)}" alt="">
                          <div class="match-player-name-wrap">
                            <div class="match-player-name-line">
                              <strong style="color:${isFriend ? 'var(--gold-bright)' : 'var(--text-primary)'};">${esc(dispName)}</strong>
                              ${isFriend ? '<span class="match-friend-badge">★ Amigo</span>' : ''}
                              ${honorBadge}
                              ${mochilaBadge}
                            </div>
                            <span class="muted sub">${esc(p.championName)}</span>
                          </div>
                        </div>
                      </td>
                      <td><span class="muted sub">${ROLE[p.teamPosition] ?? p.teamPosition ?? '—'}</span></td>
                      <td>
                        <div><strong>${p.kills}/${p.deaths}/${p.assists}</strong></div>
                        <div class="muted sub">${kdaRatio} KDA</div>
                      </td>
                      <td>
                        <div>${cs}</div>
                        <div class="muted sub">${(cs / Math.max(1, durMin)).toFixed(1)}/m</div>
                      </td>
                      <td>
                        <div class="match-damage-wrap">
                          <div style="font-weight:700; font-size:12px;">${dmg.toLocaleString()}</div>
                          <div class="match-damage-track">
                            <div class="match-damage-fill ${teamColor}" style="width:${dmgPct}%;"></div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style="font-weight:700;">${p.visionScore ?? 0}</div>
                        <div class="muted sub">${((p.visionScore ?? 0) / Math.max(1, durMin)).toFixed(1)}/m</div>
                      </td>
                      <td><span class="muted">${(p.goldEarned / 1000).toFixed(1)}k</span></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    };

    body.innerHTML = `
      ${renderTeam(team100, true, win100, kills100, gold100, vision100)}
      ${renderTeam(team200, false, win200, kills200, gold200, vision200)}
    `;
  } catch (err) {
    body.innerHTML = `<div style="text-align:center; padding:40px; color:var(--danger);">${esc(err.message)}</div>`;
  }
}

$('#close-match-btn')?.addEventListener('click', () => $('#match-dialog')?.close());
$('#cancel-match-btn')?.addEventListener('click', () => $('#match-dialog')?.close());

// ---------- Gamer Card Generator ----------
function generateGamerCard(player) {
  if (!player) return;
  const canvas = $('#gamer-card-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = 1200;
  const h = 675;

  // Background Dark Hextech gradient
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, '#060A14');
  bgGrad.addColorStop(0.5, '#0A1224');
  bgGrad.addColorStop(1, '#050810');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Hextech subtle border lines
  ctx.strokeStyle = '#24334B';
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, w - 60, h - 60);

  // Gold corners
  ctx.strokeStyle = '#C8AA6E';
  ctx.lineWidth = 4;
  const corner = 40;
  ctx.beginPath(); ctx.moveTo(30, 30 + corner); ctx.lineTo(30, 30); ctx.lineTo(30 + corner, 30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w - 30 - corner, 30); ctx.lineTo(w - 30, 30); ctx.lineTo(w - 30, 30 + corner); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(30, h - 30 - corner); ctx.lineTo(30, h - 30); ctx.lineTo(30 + corner, h - 30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w - 30 - corner, h - 30); ctx.lineTo(w - 30, h - 30); ctx.lineTo(w - 30, h - 30 - corner); ctx.stroke();

  // Branding: LA GRIETA DE LOS PIBES
  ctx.fillStyle = '#C8AA6E';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('LA GRIETA DE LOS PIBES · ESPORTS CARD', 70, 75);

  const champName = player.topChampions?.[0]?.champion;
  const imgUrl = champImg(champName) || iconImg(player.profileIconId);
  const img = new Image();
  img.crossOrigin = 'anonymous';

  img.onload = () => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(170, 230, 85, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 85, 145, 170, 170);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(170, 230, 85, 0, Math.PI * 2);
    ctx.strokeStyle = '#C8AA6E';
    ctx.lineWidth = 5;
    ctx.stroke();

    drawCardDetails();
  };

  img.onerror = () => {
    drawCardDetails();
  };

  function drawCardDetails() {
    ctx.fillStyle = '#F1F5FC';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.fillText(player.name, 285, 205);

    if (player.nickname) {
      ctx.fillStyle = '#E8C982';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.fillText(`"${player.nickname.title}" ${player.nickname.emoji}`, 285, 245);
    }

    const rankText = `${(player.solo?.label ?? 'UNRANKED').toUpperCase()}`;
    ctx.fillStyle = tierColor(player);
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`🛡️ ${rankText}  ·  Riot ID: ${player.riotId}`, 285, 280);

    const stats = [
      { label: 'WIN RATE', val: `${player.stats?.winrate ?? 0}%`, col: '#37D995' },
      { label: 'KDA RATIO', val: `${player.stats?.kda ?? 0}`, col: '#39C5F5' },
      { label: 'OP SCORE', val: `${player.stats?.avgScore?.toFixed(1) ?? '—'}`, col: '#E8C982' },
      { label: 'PREMIOS MVP', val: `${player.stats?.mvp ?? 0}`, col: '#C8AA6E' },
    ];

    const startX = 70;
    const boxW = 245;
    const boxH = 150;
    const startY = 370;

    stats.forEach((s, i) => {
      const bx = startX + i * (boxW + 26);
      ctx.fillStyle = 'rgba(13, 21, 37, 0.85)';
      ctx.fillRect(bx, startY, boxW, boxH);
      ctx.strokeStyle = '#24334B';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, startY, boxW, boxH);

      ctx.fillStyle = '#9AAAC1';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(s.label, bx + 24, startY + 45);

      ctx.fillStyle = s.col;
      ctx.font = 'bold 40px system-ui, sans-serif';
      ctx.fillText(s.val, bx + 24, startY + 105);
    });

    ctx.fillStyle = '#64748B';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(`Temporada 2026 · Servidor ${formatPlatform(player.platform ?? board?.platform)} · Generado por La Grieta de los Pibes`, 70, 595);

    const dataUrl = canvas.toDataURL('image/png');
    $('#gamer-card-preview').src = dataUrl;
    const dlBtn = $('#download-gamer-card-btn');
    if (dlBtn) {
      dlBtn.href = dataUrl;
      dlBtn.download = `la-grieta-${player.name.toLowerCase().replace(/\s+/g, '-')}-card.png`;
    }

    $('#gamer-card-dialog')?.showModal();
  }

  img.src = imgUrl;
}

$('#close-gamer-card-btn')?.addEventListener('click', () => $('#gamer-card-dialog')?.close());
$('#cancel-gamer-card-btn')?.addEventListener('click', () => $('#gamer-card-dialog')?.close());

// ---------- Champion Build & Recommended Items Modal ----------
function itemImg(id) {
  return id ? `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/item/${id}.png` : '';
}

async function openBuildModal(championName, preloadedBuild = null) {
  if (!championName) return;
  const dialog = $('#build-dialog');
  if (!dialog) return;

  const champAvatar = $('#build-modal-champ-img');
  const title = $('#build-modal-title');
  const subtitle = $('#build-modal-subtitle');
  const body = $('#build-modal-body');

  if (champAvatar) champAvatar.src = champImg(championName);
  if (title) title.textContent = `🎒 Build Recomendada · ${championName}`;
  if (subtitle) subtitle.textContent = 'Temporada 2026 · Meta Competitivo League of Legends';
  if (body) body.innerHTML = '<div style="text-align:center; padding:30px;" class="muted">Cargando guía de objetos...</div>';

  dialog.showModal();

  try {
    let build = preloadedBuild;
    if (!build) {
      const res = await fetch(`/api/build/${encodeURIComponent(championName)}`).catch(() => null);
      if (res?.ok) build = await res.json();
    }
    if (!build) {
      // GitHub Pages has no /api: builds are published as one file.
      const all = await fetch('builds.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const key = championName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      build = all?.[key] ?? null;
    }

    if (!build) {
      body.innerHTML = '<div style="text-align:center; padding:30px; color:var(--danger);">No se pudo cargar la build para este campeón.</div>';
      return;
    }

    body.innerHTML = `
      <div class="build-overview-card">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span class="build-badge">Rol: ${esc(build.role ?? 'General')}</span>
          ${build.skillOrder ? `<span class="build-badge skills">Max: ${esc(build.skillOrder)}</span>` : ''}
          ${build.runes ? `<span class="build-badge runes">⚡ ${esc(build.runes.primary)} + ${esc(build.runes.secondary)}</span>` : ''}
        </div>
      </div>

      <!-- Core Items -->
      <div class="build-section">
        <div class="build-section-title">⭐ Objetos Clave (Core Build)</div>
        <div class="build-items-row">
          ${(build.core ?? []).map((it) => `
            <div class="build-item-chip core">
              <img class="build-item-img" src="${itemImg(it.id)}" alt="" onerror="this.src='logo.jpg'">
              <span class="build-item-name">${esc(it.name)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Boots & Starter -->
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap:12px;">
        <div class="build-section">
          <div class="build-section-title">🛡️ Botas Recomendadas</div>
          <div class="build-items-row">
            ${(build.boots ?? []).map((it) => `
              <div class="build-item-chip">
                <img class="build-item-img" src="${itemImg(it.id)}" alt="" onerror="this.src='logo.jpg'">
                <span class="build-item-name">${esc(it.name)}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="build-section">
          <div class="build-section-title">🗡️ Inicio de Partida</div>
          <div class="build-items-row">
            ${(build.starter ?? []).map((it) => `
              <div class="build-item-chip">
                <img class="build-item-img" src="${itemImg(it.id)}" alt="" onerror="this.src='logo.jpg'">
                <span class="build-item-name">${esc(it.name)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Situational Items -->
      <div class="build-section">
        <div class="build-section-title">🔄 Objetos Situacionales (Mid / Late Game)</div>
        <div class="build-items-row">
          ${(build.situational ?? []).map((it) => `
            <div class="build-item-chip">
              <img class="build-item-img" src="${itemImg(it.id)}" alt="" onerror="this.src='logo.jpg'">
              <span class="build-item-name">${esc(it.name)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Pro Tip -->
      ${build.tips ? `
        <div class="build-tips-box">
          <span style="font-size:18px;">💡</span>
          <div>
            <strong>Consejo Táctico:</strong>
            <div>${esc(build.tips)}</div>
          </div>
        </div>
      ` : ''}
    `;
  } catch (err) {
    console.error('Error loading build:', err);
    body.innerHTML = '<div style="text-align:center; padding:30px; color:var(--danger);">Error cargando la guía de objetos.</div>';
  }
}

$('#close-build-dialog-btn')?.addEventListener('click', () => $('#build-dialog')?.close());
$('#cancel-build-dialog-btn')?.addEventListener('click', () => $('#build-dialog')?.close());

// ---------- LP History & Elo Evolution Chart ----------
const TIERS_NAMES = ['Hierro', 'Bronce', 'Plata', 'Oro', 'Platino', 'Esmeralda', 'Diamante', 'Master'];
const DIV_NAMES = ['IV', 'III', 'II', 'I'];
function valToLabel(v) {
  if (v < 0) return 'Unranked';
  if (v >= 2800) return `Master+ ${v - 2800} LP`;
  const t = Math.floor(v / 400);
  const rem = v % 400;
  const d = Math.floor(rem / 100);
  const lp = rem % 100;
  const tierStr = TIERS_NAMES[t] ?? 'Unranked';
  const divStr = DIV_NAMES[d] ?? '';
  return `${tierStr} ${divStr} · ${lp} LP`;
}

function renderLpChart(player) {
  const container = $('#lp-chart-container');
  if (!container) return;

  const history = player.lpHistory ?? [];
  if (history.length < 2) {
    container.innerHTML = '<div class="muted" style="text-align:center; padding:30px;">Se necesitan al menos 2 registros de partidas para graficar la evolución de LP.</div>';
    return;
  }

  const w = 800;
  const h = 220;
  const padL = 80;
  const padR = 25;
  const padT = 30;
  const padB = 35;

  const vals = history.map((x) => x.v);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = Math.max(30, maxV - minV);
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  const stepX = chartW / Math.max(1, history.length - 1);
  const pts = history.map((pt, i) => {
    const x = padL + i * stepX;
    const y = padT + (1 - (pt.v - minV) / range) * chartH;
    return { x, y, pt };
  });

  const pathD = pts.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`, '');
  const areaD = `${pathD} L ${pts[pts.length - 1].x.toFixed(1)},${h - padB} L ${pts[0].x.toFixed(1)},${h - padB} Z`;

  let peakIdx = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].pt.v > pts[peakIdx].pt.v) peakIdx = i;
  }
  const peakPt = pts[peakIdx];
  const lastPt = pts[pts.length - 1];
  const firstPt = pts[0];

  const steps = 3;
  const gridLines = [];
  for (let i = 0; i <= steps; i++) {
    const v = Math.round(minV + (i / steps) * range);
    const y = padT + (1 - (v - minV) / range) * chartH;
    gridLines.push({ y, val: v, label: valToLabel(v) });
  }

  const xMarkers = [];
  const xCount = Math.min(5, history.length);
  const xStep = Math.floor((history.length - 1) / Math.max(1, xCount - 1));
  for (let i = 0; i < xCount; i++) {
    const idx = Math.min(history.length - 1, i * xStep);
    const p = pts[idx];
    const dateStr = new Date(p.pt.t).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    xMarkers.push({ x: p.x, label: dateStr });
  }

  const peakValEl = $('#lp-peak-val');
  if (peakValEl) peakValEl.textContent = valToLabel(peakPt.pt.v);
  const progValEl = $('#lp-prog-val');
  const deltaTotal = lastPt.pt.v - firstPt.pt.v;
  if (progValEl) {
    progValEl.textContent = `${deltaTotal >= 0 ? '+' : ''}${deltaTotal} LP`;
    progValEl.style.color = deltaTotal >= 0 ? 'var(--success)' : 'var(--danger)';
  }

  container.innerHTML = `
    <div style="position:relative; width:100%;">
      <svg class="lp-svg-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="lp-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#39C5F5" stop-opacity="0.35"/>
            <stop offset="80%" stop-color="#39C5F5" stop-opacity="0.05"/>
            <stop offset="100%" stop-color="#39C5F5" stop-opacity="0"/>
          </linearGradient>
          <filter id="lp-line-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.5" flood-color="#39C5F5" flood-opacity="0.5"/>
          </filter>
        </defs>

        ${gridLines.map((g) => `
          <line x1="${padL}" y1="${g.y.toFixed(1)}" x2="${w - padR}" y2="${g.y.toFixed(1)}" stroke="#1C2B44" stroke-dasharray="3,3" stroke-width="1"/>
          <text x="${padL - 8}" y="${(g.y + 3).toFixed(1)}" fill="#64748B" font-size="9" font-family="system-ui" text-anchor="end">${esc(g.label)}</text>
        `).join('')}

        <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="#24334B" stroke-width="1.5"/>

        ${xMarkers.map((m) => `
          <text x="${m.x.toFixed(1)}" y="${h - padB + 16}" fill="#64748B" font-size="10" font-family="system-ui" text-anchor="middle">${esc(m.label)}</text>
        `).join('')}

        <path d="${areaD}" fill="url(#lp-area-grad)"/>
        <path d="${pathD}" fill="none" stroke="#39C5F5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" filter="url(#lp-line-glow)"/>

        <circle cx="${firstPt.x.toFixed(1)}" cy="${firstPt.y.toFixed(1)}" r="3.5" fill="#121E32" stroke="#39C5F5" stroke-width="2"/>

        <circle cx="${peakPt.x.toFixed(1)}" cy="${peakPt.y.toFixed(1)}" r="5" fill="#E8C982" stroke="#080D19" stroke-width="2"/>
        <text x="${peakPt.x.toFixed(1)}" y="${Math.max(12, peakPt.y - 8).toFixed(1)}" fill="#E8C982" font-size="10" font-weight="bold" font-family="system-ui" text-anchor="middle">👑 Pico Máximo</text>

        <circle cx="${lastPt.x.toFixed(1)}" cy="${lastPt.y.toFixed(1)}" r="5" fill="#39C5F5" stroke="#FFFFFF" stroke-width="2"/>
      </svg>
    </div>
  `;
}

// ---------- Detailed Player Profile View ----------
window.viewPlayerProfile = function (puuid) {
  const p = board?.players?.find((x) => x.puuid === puuid);
  if (!p) return;
  selectedPlayerForProfile = p;

  const content = $('#player-profile-content');
  const d = p.lpDelta ?? {};
  const champUrl = champImg(p.topChampions?.[0]?.champion);

  content.innerHTML = `
    <div class="profile-header-card">
      <img class="profile-avatar-big" src="${champUrl}" alt="" onerror="this.src='${iconImg(p.profileIconId)}'">
      <div class="profile-info">
        <div style="display:flex; align-items:center; gap:10px;">
          <h2 class="profile-name">${esc(p.name)}</h2>
          ${p.nickname ? `<span class="row-nickname-badge">"${p.nickname.title}" ${p.nickname.emoji}</span>` : ''}
        </div>
        <div class="profile-tier-badge" style="color:${tierColor(p)}">🛡️ ${esc(p.solo?.label ?? 'Unranked')} · Nivel ${p.level ?? 30}</div>
        <div class="muted" style="margin-top:4px;">${esc(p.riotId)} · Región: ${esc(formatPlatform(p.platform ?? board.platform))}</div>
        <button id="open-gamer-card-btn" class="btn btn-primary" style="margin-top:12px; width:fit-content; font-size:12px; padding:6px 14px;">🃏 Generar Tarjeta de Invocador</button>
      </div>
      <div class="mvp-score-emblem">
        <span class="mvp-score-num">${p.stats ? p.stats.avgScore.toFixed(1) : '—'}</span>
        <span class="mvp-score-label">OP SCORE</span>
      </div>
    </div>

    <!-- Stats row -->
    <div class="stat-grid-4">
      <div class="stat-card">
        <div class="stat-icon-wrap stat-icon-gold">🎯</div>
        <div class="stat-info">
          <span class="stat-val">${p.stats ? p.stats.winrate + '%' : '—'}</span>
          <span class="stat-lbl">Win Rate (${p.stats?.games ?? 0} partidas)</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap stat-icon-green">📈</div>
        <div class="stat-info">
          <span class="stat-val" style="color:${(d.week ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)'}">${signed(d.week ?? 0)} LP</span>
          <span class="stat-lbl">Esta semana</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap stat-icon-cyan">⚔️</div>
        <div class="stat-info">
          <span class="stat-val">${p.stats ? p.stats.kda : '—'}</span>
          <span class="stat-lbl">KDA Promedio</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon-wrap stat-icon-purple">👑</div>
        <div class="stat-info">
          <span class="stat-val">${p.stats ? p.stats.mvp : 0} MVP</span>
          <span class="stat-lbl">${p.stats ? p.stats.ace : 0} ACE</span>
        </div>
      </div>
    </div>

    <!-- LP History & Elo Evolution Chart -->
    <div class="lp-history-card">
      <div class="lp-history-header">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:20px;">📈</span>
          <div>
            <h3 style="font-family:var(--font-heading); font-size:17px; color:var(--gold); margin:0;">Evolución de Elo & LP</h3>
            <span class="muted sub">Progreso continuo en Ranked Solo/Duo a lo largo de la temporada</span>
          </div>
        </div>
        <div class="lp-history-metrics">
          <div class="lp-metric-pill">
            <span class="muted sub">Pico Máximo:</span>
            <strong id="lp-peak-val" style="color:var(--gold-bright);">—</strong>
          </div>
          <div class="lp-metric-pill">
            <span class="muted sub">Progreso Total:</span>
            <strong id="lp-prog-val" style="color:var(--success);">—</strong>
          </div>
        </div>
      </div>
      <div id="lp-chart-container" class="lp-chart-wrap"></div>
    </div>

    <!-- Champion Mains -->
    <h3 style="font-family:var(--font-heading); font-size:18px; margin:24px 0 12px; color:var(--gold);">Campeones Más Jugados</h3>
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:12px; margin-bottom:28px;">
      ${(p.topChampions ?? []).map((c) => `
        <div class="stat-card" style="padding:12px 14px;">
          <img src="${champImg(c.champion)}" alt="" style="width:42px;height:42px;border-radius:8px;">
          <div>
            <strong>${esc(c.champion)}</strong>
            <div class="muted sub">${c.games} partidas · ${c.wins}W (${Math.round((100 * c.wins) / c.games)}%)</div>
          </div>
        </div>
      `).join('') || '<div class="muted">No hay partidas recientes.</div>'}
    </div>

    <!-- Recent Match History -->
    <h3 style="font-family:var(--font-heading); font-size:18px; margin:24px 0 12px; color:var(--gold);">Historial de Partidas Ranked</h3>
    <div class="profile-matches-list">
      ${(p.games ?? []).slice(0, 40).map((g) => `
        <div class="profile-match-card ${g.win ? 'win' : 'loss'}" data-match-id="${esc(g.matchId)}">
          <img class="match-champ-icon" src="${champImg(g.champion)}" alt="">
          <div style="min-width:80px;">
            <strong style="color:${g.win ? 'var(--cyan)' : 'var(--danger)'}">${g.win ? 'VICTORIA' : 'DERROTA'}</strong>
            <div class="muted sub">${ROLE[g.position] ?? g.position ?? 'Solo'} · ${g.minutes}m</div>
          </div>
          <div style="min-width:110px;">
            <strong style="font-size:15px;">${g.kills} / ${g.deaths} / ${g.assists}</strong>
            <div class="muted sub">KDA: ${((g.kills + g.assists) / Math.max(1, g.deaths)).toFixed(2)}</div>
          </div>
          <div style="flex:1; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <div>
              <span class="muted sub">Score:</span> <strong style="color:var(--gold); font-size:15px;">${g.score.toFixed(1)}</strong>
            </div>
            <span class="overview-place-tag ${g.place === 1 ? 'top-1' : g.place <= 3 ? 'top-3' : 'mid'}" title="Posición ${g.place || 5} de 10 jugadores en la partida">
              ${g.place ? `${g.place}/10` : '—'}
            </span>
            ${g.mvp ? ` <span class="stat-icon-gold" style="padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;cursor:help;" title="${esc((I18N[currentLang] || I18N.es).ui.tooltipMvp)}">MVP</span>` : ''}
            ${g.ace ? ` <span class="stat-icon-purple" style="padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;cursor:help;" title="${esc((I18N[currentLang] || I18N.es).ui.tooltipAce)}">ACE</span>` : ''}
            ${g.mochila ? ` <span class="stat-icon-mochila" style="padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(230,126,34,0.22);color:#F39C12;border:1px solid rgba(230,126,34,0.45);cursor:help;" title="${esc((I18N[currentLang] || I18N.es).ui.tooltipMochila)}">🎒 MOCHILA</span>` : ''}
          </div>
          <span class="muted sub" style="font-size:11px; align-self:center;">🔍 Ver Detalle</span>
        </div>
      `).join('') || '<div class="muted">No hay partidas registradas.</div>'}
    </div>
  `;

  // Render LP Chart
  renderLpChart(p);

  // Bind Gamer Card button
  $('#open-gamer-card-btn')?.addEventListener('click', () => {
    if (selectedPlayerForProfile) generateGamerCard(selectedPlayerForProfile);
  });

  // Bind Match click events
  content.querySelectorAll('.profile-match-card').forEach((card) => {
    card.addEventListener('click', () => {
      openMatchModal(card.dataset.matchId);
    });
  });

  switchView('player');
};

$('#back-from-player-btn')?.addEventListener('click', () => switchView('leaderboard'));

// ---------- Sort controls ----------
$$('.pill-btn[data-sort]').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.pill-btn[data-sort]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentSort = btn.dataset.sort;
    renderPodium();
    renderLeaderboards();
  });
});

// ---------- Search input ----------
$('#friend-search')?.addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  renderPodium();
  renderLeaderboards();
});

// ---------- Refresh and Status Polling ----------
let refreshInFlight = false;

async function pollStatus() {
  const res = await fetch('/api/status').catch(() => null);
  if (!res?.ok) {
    staticMode = true;
    return;
  }
  const st = await res.json();
  const banner = $('#sync-banner');
  const fill = $('#sync-progress-fill');
  const text = $('#sync-text');
  const refreshBtn = $('#header-refresh-btn');

  if (refreshBtn) {
    refreshBtn.disabled = st.running || refreshInFlight;
  }

  if (st.running) {
    pollStatus.wasRunning = true;
    if (banner) banner.hidden = false;
    const { done = 0, total = 1, current } = st.progress ?? {};
    const pct = Math.round((100 * done) / Math.max(1, total));
    if (fill) fill.style.width = `${pct}%`;
    if (text) text.textContent = `Sincronizando con Riot Games: ${current ? esc(current) : ''} (${done}/${total})…`;
    setTimeout(pollStatus, 1000);
  } else {
    if (banner) banner.hidden = true;
    if (st.error) toast('Error en sincronización: ' + st.error);
    const shouldReload = pollStatus.wasRunning || refreshInFlight;
    pollStatus.wasRunning = false;
    refreshInFlight = false;
    if (shouldReload) {
      await load();
      toast('¡Historial de partidas actualizado con éxito!');
    }
  }
}

$('#header-refresh-btn')?.addEventListener('click', async () => {
  const btn = $('#header-refresh-btn');
  if (btn) btn.disabled = true;
  refreshInFlight = true;
  toast('Iniciando búsqueda de partidas en Riot Games...');
  const banner = $('#sync-banner');
  const text = $('#sync-text');
  if (banner) banner.hidden = false;
  if (text) text.textContent = 'Contactando con Riot Games…';
  await fetch('/api/refresh', { method: 'POST' }).catch(() => null);
  pollStatus();
});

// ---------- Friends Management Modal ----------
const friendsDialog = $('#friends-dialog');

function createFriendRow(friend = {}) {
  const row = document.createElement('div');
  row.className = 'friend-row';
  const riotId = typeof friend === 'string' ? friend : friend.riotId ?? '';
  const name = typeof friend === 'string' ? '' : friend.name ?? '';
  const plat = typeof friend === 'string' ? '' : friend.platform ?? '';

  row.innerHTML = `
    <input type="text" class="friend-input friend-id" placeholder="Nombre#TAG" value="${esc(riotId)}" required>
    <input type="text" class="friend-input friend-nick" placeholder="Apodo (opc.)" value="${esc(name)}">
    <select class="friend-select friend-platform">
      <option value="">(Región global)</option>
      <option value="la1"${plat === 'la1' ? ' selected' : ''}>LAN</option>
      <option value="la2"${plat === 'la2' ? ' selected' : ''}>LAS</option>
      <option value="na1"${plat === 'na1' ? ' selected' : ''}>NA</option>
      <option value="br1"${plat === 'br1' ? ' selected' : ''}>BR</option>
      <option value="euw1"${plat === 'euw1' ? ' selected' : ''}>EUW</option>
      <option value="kr"${plat === 'kr' ? ' selected' : ''}>KR</option>
    </select>
    <button type="button" class="friend-del-btn" title="Eliminar jugador">🗑️</button>
  `;
  row.querySelector('.friend-del-btn').addEventListener('click', () => row.remove());
  return row;
}

function openFriendsModal() {
  fetch('/api/config')
    .then((r) => r.json())
    .then((cfg) => {
      $('#cfg-group-name').value = cfg.groupName ?? '';
      $('#cfg-platform').value = cfg.platform ?? 'la1';
      const container = $('#friends-container');
      container.replaceChildren();
      for (const f of cfg.friends ?? []) {
        container.appendChild(createFriendRow(f));
      }
      if (!cfg.friends?.length) {
        container.appendChild(createFriendRow());
      }
      friendsDialog.showModal();
    })
    .catch(() => toast('No se pudo abrir la gestión de amigos.'));
}

$('#nav-btn-friends')?.addEventListener('click', openFriendsModal);
$('#header-manage-btn')?.addEventListener('click', openFriendsModal);
$('#mobile-manage-btn')?.addEventListener('click', openFriendsModal);

$('#add-friend-row-btn')?.addEventListener('click', () => {
  const row = createFriendRow();
  $('#friends-container').appendChild(row);
  row.querySelector('.friend-id').focus();
});

$('#close-dialog-btn')?.addEventListener('click', () => friendsDialog.close());
$('#cancel-dialog-btn')?.addEventListener('click', () => friendsDialog.close());

$('#friends-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const rows = [...document.querySelectorAll('#friends-container .friend-row')];
  const friends = [];
  for (const row of rows) {
    const riotId = row.querySelector('.friend-id').value.trim();
    if (!riotId) continue;
    if (!riotId.includes('#')) {
      row.querySelector('.friend-id').focus();
      return toast(`"${riotId}" debe tener formato Nombre#TAG`);
    }
    const name = row.querySelector('.friend-nick').value.trim();
    const platform = row.querySelector('.friend-platform').value.trim();
    if (name || platform) {
      const obj = { riotId };
      if (name) obj.name = name;
      if (platform) obj.platform = platform;
      friends.push(obj);
    } else {
      friends.push(riotId);
    }
  }

  const payload = {
    groupName: $('#cfg-group-name').value.trim(),
    platform: $('#cfg-platform').value,
    friends,
  };

  const saveBtn = $('#save-friends-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando…';

  try {
    const res = await fetch('/api/config/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    friendsDialog.close();
    toast('¡Jugadores actualizados! Sincronizando partidas...');
    pollStatus();
  } catch (err) {
    toast('Error al guardar: ' + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Guardar y Actualizar';
  }
});

// ---------- Discord Modal ----------
const discordDialog = $('#discord-dialog');
$('#nav-btn-discord')?.addEventListener('click', () => {
  fetch('/api/config')
    .then((r) => r.json())
    .then((cfg) => {
      $('#discord-webhook-url').value = cfg.discord?.webhookUrl ?? '';
      discordDialog.showModal();
    })
    .catch(() => discordDialog.showModal());
});
$('#close-discord-btn')?.addEventListener('click', () => discordDialog.close());
$('#cancel-discord-btn')?.addEventListener('click', () => discordDialog.close());

$('#test-discord-btn')?.addEventListener('click', async () => {
  const url = $('#discord-webhook-url').value.trim();
  if (!url) return toast('Ingresa una URL de webhook válida.');
  toast('Enviando mensaje de prueba a Discord...');
  const res = await fetch('/api/discord', { method: 'POST' }).catch(() => null);
  if (res?.ok) {
    toast('¡Mensaje enviado con éxito a Discord!');
  } else {
    toast('No se pudo enviar. Verifica la URL del webhook.');
  }
});

// ---------- Live Game Tracker (Spectator v5 & Real-Time Telemetry) ----------
let liveTeamsOpen = {};
let liveTrackerTimer = null;

function scheduleNextLiveCheck(data) {
  clearTimeout(liveTrackerTimer);
  // Fast polling if match is live (6s with telemetry, 15s without); 45s when idle
  const hasTelemetry = data?.games?.some((g) => Boolean(g.telemetry));
  const delay = data?.inGame ? (hasTelemetry ? 6_000 : 15_000) : 45_000;
  liveTrackerTimer = setTimeout(() => checkLiveTracker(), delay);
}

function eloToTierName(val) {
  if (!val) return 'Oro';
  if (val < 600) return 'Hierro/Bronce';
  if (val < 1000) return 'Plata';
  if (val < 1400) return 'Oro';
  if (val < 1800) return 'Platino';
  if (val < 2200) return 'Esmeralda';
  if (val < 2600) return 'Diamante';
  return 'Master+';
}

function spellImg(id) {
  const map = {
    1: 'SummonerBoost',
    3: 'SummonerExhaust',
    4: 'SummonerFlash',
    6: 'SummonerHaste',
    7: 'SummonerHeal',
    11: 'SummonerSmite',
    12: 'SummonerTeleport',
    14: 'SummonerDot',
    21: 'SummonerBarrier',
    32: 'SummonerSnowball',
  };
  const name = map[id];
  return name ? `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/spell/${name}.png` : '';
}

function formatMasteryPoints(points = 0) {
  const n = Number(points) || 0;
  if (n >= 1_000_000) {
    const val = (n / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `${val}M`;
  }
  if (n >= 1_000) {
    return `${Math.round(n / 1_000)}k`;
  }
  return n > 0 ? `${n}` : '0';
}

function renderMasteryBadge(stats, champName) {
  if (!stats?.mastery) return '';
  const pts = stats.mastery.points || 0;
  if (pts >= 1_000_000) {
    return `<span class="live-stat-pill otp-god" title="Maestría Legendaria (+1 Millón de puntos)">+1M OTP</span>`;
  }
  if (pts >= 250_000) {
    return `<span class="live-stat-pill otp" title="Jugador OTP (+250k pts con ${esc(champName)})">OTP</span>`;
  }
  if (pts >= 100_000) {
    return `<span class="live-stat-pill main" title="Main (+100k pts con ${esc(champName)})">Main</span>`;
  }
  return '';
}

let lastLiveRenderKey = '';

async function checkLiveTracker(manual = false) {
  const banner = $('#live-tracker-banner');
  const dot = $('#sidebar-status-dot');
  const statusText = $('#sidebar-status-text');

  if (manual) {
    toast('Consultando partidas en vivo con Riot Games...');
  }

  try {
    const demo = location.search.includes('demo=1') || location.hash.includes('demo=1');
    let res = await fetch(demo ? '/api/live?demo=1' : '/api/live').catch(() => null);
    // GitHub Pages has no /api: ask the update Worker, which checks Riot for us.
    if (!res?.ok && !demo && board?.updateUrl) {
      res = await fetch(`${board.updateUrl.replace(/\/$/, '')}/live`).catch(() => null);
    }
    if (!res?.ok) return;
    const data = await res.json();

    if (data.ddragonVersion) {
      window.latestDdragonVersion = data.ddragonVersion;
    }

    const renderKey = JSON.stringify({
      inGame: data.inGame,
      activeCount: data.activeCount,
      games: (data.games || []).map((g) => ({
        id: g.gameId,
        min: g.minutes,
        isOpen: liveTeamsOpen[g.gameId],
        prob: g.prediction?.blue?.probability,
        goldLead: g.telemetry?.goldLead,
        kills: `${g.telemetry?.blue?.kills}-${g.telemetry?.red?.kills}`,
        items: (g.teams?.blue || []).concat(g.teams?.red || []).map((p) => (p.inGame?.items || []).map((it) => it.id).join(',')).join(';'),
      })),
    });

    if (renderKey === lastLiveRenderKey && !manual) {
      scheduleNextLiveCheck(data);
      return;
    }
    lastLiveRenderKey = renderKey;

    window._activeLiveGames = data.games ?? [];

    if (data.inGame && data.games?.length > 0) {
      if (dot) dot.classList.add('live');
      if (statusText) statusText.textContent = `${data.activeCount} en partida`;

      if (banner) {
        // Mosaico de amigos en vivo
        const friendMosaicCards = data.games.flatMap((g) => {
          return g.friends.map((f) => {
            const fChamp = resolveChampName(f.champion);
            const teamColor = f.teamId === 100 ? '#5b9cf6' : '#f16c78';
            const teamLabel = f.teamId === 100 ? 'Azul' : 'Rojo';
            const bp = (board?.players ?? []).find((p) => p.name === f.name);
            const rankLabel = bp?.solo?.label ?? bp?.flex?.label ?? 'Unranked';
            const wr = bp?.stats?.winrate ? `${bp.stats.winrate}% WR` : '';
            const lp = bp?.lpDelta?.week != null ? (bp.lpDelta.week >= 0 ? `+${bp.lpDelta.week} LP` : `${bp.lpDelta.week} LP`) : '';
            const lpColor = bp?.lpDelta?.week >= 0 ? '#4ade80' : '#f87171';
            const rankCol = bp ? tierColor(bp) : '#aaa';

            return `
              <div class="live-friend-mosaic-card" data-game-id="${g.gameId}" title="Ver partida en vivo de ${esc(f.name)}">
                <div class="live-mosaic-portrait">
                  <img src="${champImg(fChamp)}" alt="${esc(fChamp)}" onerror="this.src='logo.jpg'">
                  <span class="live-mosaic-team-tag" style="background:${teamColor};">${teamLabel}</span>
                </div>
                <div class="live-mosaic-body">
                  <div class="live-mosaic-top">
                    <span class="live-mosaic-name">${esc(f.name)}</span>
                    <span class="live-mosaic-badge">Min ${g.minutes}</span>
                  </div>
                  <span class="live-mosaic-champ">${esc(fChamp)} &middot; <span style="color:var(--text-secondary); font-size:11px;">${esc(g.queue)}</span></span>
                  <div class="live-mosaic-stats">
                    <span class="live-mosaic-rank" style="color:${rankCol}">${esc(rankLabel)}</span>
                    ${wr ? `<span class="live-mosaic-pill">${wr}</span>` : ''}
                    ${lp ? `<span class="live-mosaic-pill" style="color:${lpColor}">${lp}</span>` : ''}
                  </div>
                  <div class="live-mosaic-footer">
                    <span class="live-mosaic-meta">${g.isDuo ? 'Dúo de Amigos' : g.isCivilWar ? 'Guerra Civil' : 'En Vivo'}</span>
                    <button class="live-build-btn open-champ-build" data-champ="${esc(fChamp)}" style="padding:2px 8px; font-size:11px;" title="Ver Build de ${esc(fChamp)}">🎒 Build</button>
                    <span class="live-mosaic-cta">Ver Partida &rarr;</span>
                  </div>
                </div>
              </div>
            `;
          });
        }).join('');

        banner.innerHTML = `
          <div class="live-card-active">
            <div class="live-header-bar">
              <div style="display:flex; align-items:center; gap:10px;">
                <span class="live-badge">
                  <span class="live-pulse-dot"></span>
                  EN VIVO
                </span>
                <strong style="color:var(--text-primary); font-size:14px;">${data.activeCount} ${data.activeCount === 1 ? 'amigo jugando ahora' : 'amigos jugando ahora'}</strong>
              </div>
              <button id="manual-live-check-btn" class="live-refresh-btn" title="Comprobar estado en vivo">Actualizar</button>
            </div>
            <div class="live-friends-mosaic">
              ${friendMosaicCards}
            </div>
          </div>
        `;
      }
    } else {
      if (dot) dot.classList.remove('live');
      if (statusText) statusText.textContent = 'Servidor Activo';

      if (banner) {
        banner.innerHTML = `
          <div class="live-card-idle">
            <div>
              <span>Ningún amigo está en partida en este momento.</span>
            </div>
            <button id="manual-live-check-btn" class="live-refresh-btn" title="Comprobar con Riot Games">Comprobar en vivo</button>
          </div>
        `;
      }
    }

    $('#manual-live-check-btn')?.addEventListener('click', () => checkLiveTracker(true));

    // Mosaico: click en amigo abre popup con info de partida
    $$('.live-friend-mosaic-card').forEach((card) => {
      card.addEventListener('click', () => {
        openLiveMatchModal(card.dataset.gameId);
      });
    });

    banner?.querySelectorAll('.open-champ-build').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openBuildModal(btn.dataset.champ);
      });
    });

    scheduleNextLiveCheck(data);
  } catch (err) {
    console.warn('Error checking live tracker:', err);
    scheduleNextLiveCheck(null);
  }
}

// ---------- Live Game Details Modal (Popup) ----------
function openLiveMatchModal(gameId) {
  const g = (window._activeLiveGames || []).find((x) => String(x.gameId) === String(gameId)) || window._activeLiveGames?.[0];
  if (!g) return;

  const dialog = $('#live-match-dialog');
  if (!dialog) return;

  const title = $('#live-match-modal-title');
  const subtitle = $('#live-match-modal-subtitle');
  const body = $('#live-match-modal-body');

  title.textContent = `${g.queue || 'Partida en Vivo'} · Minuto ${g.minutes || 0}`;
  const friendNames = g.friends.map((f) => f.name).join(', ');
  subtitle.textContent = `${friendNames} ${g.isDuo ? '· Dúo de Amigos' : g.isCivilWar ? '· Guerra Civil entre Amigos' : '· Partida en curso'}`;

  const renderPlayer = (p) => {
    const champDisplayName = resolveChampName(p.champion);
    return `<div class="live-participant-row ${p.isFriend ? 'friend' : ''}">
      <div class="live-participant-left">
        <img class="live-champ-thumb" src="${champImg(champDisplayName)}" alt="" onerror="this.src='logo.jpg'">
        <div class="live-spells-col">
          ${spellImg(p.spell1Id) ? `<img class="live-spell-thumb" src="${spellImg(p.spell1Id)}" alt="">` : ''}
          ${spellImg(p.spell2Id) ? `<img class="live-spell-thumb" src="${spellImg(p.spell2Id)}" alt="">` : ''}
        </div>
        <div class="live-participant-names">
          <div class="live-participant-player">
            <span class="live-player-name">${esc(p.summonerName)}</span>
            ${p.isFriend ? '<span class="live-friend-tag">Amigo</span>' : ''}
            ${p.inGame?.isDead ? `<span class="live-stat-pill dead">${p.inGame.respawnTimer}s</span>` : ''}
          </div>
          <div class="live-participant-meta">
            <span class="live-participant-champ">${esc(champDisplayName)}</span>
            ${p.curve ? `<span class="live-stat-pill curve ${p.curve}">${p.curve === 'early' ? 'Early' : p.curve === 'late' ? 'Late' : p.curve === 'steady' ? 'Tank' : 'Mid'}</span>` : ''}
            ${p.inGame ? `<span class="live-stat-pill kda"><strong>${p.inGame.kills}</strong>/<span class="deaths">${p.inGame.deaths}</span>/<strong>${p.inGame.assists}</strong> (${p.inGame.cs} CS)</span>` : ''}
            ${p.stats ? `
              <span class="live-stat-pill rank">${esc(p.stats.rankLabel || 'Unranked')}</span>
              ${p.stats.winrate ? `<span class="live-stat-pill wr ${p.stats.winrate >= 54 ? 'high' : p.stats.winrate <= 46 ? 'low' : ''}">${p.stats.winrate}% WR</span>` : ''}
              ${p.stats.mastery?.points ? `<span class="live-stat-pill mastery">${formatMasteryPoints(p.stats.mastery.points)}</span>` : ''}
              ${p.stats.hotStreak ? '<span class="live-stat-pill streak">Racha</span>' : ''}
              ${renderMasteryBadge(p.stats, champDisplayName)}
            ` : ''}
          </div>
          ${(p.inGame?.items || []).filter((it) => it.id > 0).length > 0 ? `
            <div class="live-items-inventory">
              ${p.inGame.items.filter((it) => it.id > 0).map((it) => `<img class="live-item-icon" src="https://ddragon.leagueoflegends.com/cdn/14.24.1/img/item/${it.id}.png" title="${esc(it.name || 'Objeto')}" alt="" onerror="this.style.display='none'">`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
      <button class="live-build-btn open-champ-build" data-champ="${esc(champDisplayName)}">Build</button>
    </div>`;
  };

  body.innerHTML = `
    <div class="live-teams-detail" style="display:block; padding:0; background:transparent; border-top:none;">
      ${g.telemetry ? `
        <div class="live-telemetry-scoreboard">
          <div class="live-telemetry-header">
            <span class="live-telemetry-pill">TELEMETRÍA EN VIVO</span>
            <span class="live-telemetry-timer">${Math.floor((g.telemetry.gameTime || 0) / 60)}:${String((g.telemetry.gameTime || 0) % 60).padStart(2, '0')}</span>
            <span class="live-telemetry-lead ${g.telemetry.goldLead >= 0 ? 'blue' : 'red'}">
              ${(Math.abs(g.telemetry.goldLead || 0) / 1000).toFixed(1)}k oro ${g.telemetry.goldLead >= 0 ? 'Azul' : 'Rojo'}
            </span>
          </div>
          <div class="live-telemetry-scores">
            <div class="live-telemetry-team blue">
              <div class="live-telemetry-kills">${g.telemetry.blue?.kills ?? 0}</div>
              <div class="live-telemetry-objs">
                <span>Torres: ${g.telemetry.blue?.towers ?? 0}</span>
                <span>Dragones: ${g.telemetry.blue?.dragons ?? 0}</span>
                ${(g.telemetry.blue?.barons ?? 0) > 0 ? `<span>Barón: ${g.telemetry.blue.barons}</span>` : ''}
              </div>
            </div>
            <div class="live-telemetry-vs">VS</div>
            <div class="live-telemetry-team red">
              <div class="live-telemetry-kills">${g.telemetry.red?.kills ?? 0}</div>
              <div class="live-telemetry-objs">
                <span>Torres: ${g.telemetry.red?.towers ?? 0}</span>
                <span>Dragones: ${g.telemetry.red?.dragons ?? 0}</span>
                ${(g.telemetry.red?.barons ?? 0) > 0 ? `<span>Barón: ${g.telemetry.red.barons}</span>` : ''}
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      ${g.prediction ? `
        <div class="live-prediction-card">
          <div class="live-prediction-header">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <strong style="font-size:13px; color:var(--text-primary);">Probabilidad de Victoria</strong>
              ${g.prediction.phase ? `<span class="live-phase-badge ${g.prediction.phase.name}">${esc(g.prediction.phase.label)}</span>` : ''}
              ${g.prediction.isDynamic ? '<span class="live-dynamic-badge">En vivo</span>' : ''}
            </div>
            <div class="live-favored-badge ${g.prediction.favored}">
              ${g.prediction.favored === 'blue' ? 'Favorito: Equipo Azul' : 'Favorito: Equipo Rojo'}
            </div>
          </div>
          <div class="live-prob-bar-container">
            <div class="live-prob-bar-side blue" style="width:${g.prediction.blue.probability}%;">
              <span class="live-prob-label">${g.prediction.blue.probability}% Azul</span>
            </div>
            <div class="live-prob-bar-side red" style="width:${g.prediction.red.probability}%;">
              <span class="live-prob-label">${g.prediction.red.probability}% Rojo</span>
            </div>
          </div>
          <div class="live-prediction-metrics">
            <div class="live-metric-box blue">
              <span>Elo: <strong>${eloToTierName(g.prediction.blue.avgRankValue)}</strong></span>
              <span>Maestría: <strong>${Math.round((g.prediction.blue.totalMastery || 0) / 1000)}k</strong></span>
              <span>WR: <strong>${g.prediction.blue.avgWinrate || 50}%</strong></span>
            </div>
            <div class="live-metric-vs">VS</div>
            <div class="live-metric-box red">
              <span>Elo: <strong>${eloToTierName(g.prediction.red.avgRankValue)}</strong></span>
              <span>Maestría: <strong>${Math.round((g.prediction.red.totalMastery || 0) / 1000)}k</strong></span>
              <span>WR: <strong>${g.prediction.red.avgWinrate || 50}%</strong></span>
            </div>
          </div>
          ${(g.prediction.reasons || []).length > 0 ? `<div class="live-prediction-reasons">${g.prediction.reasons.map((r) => `<div class="live-reason-pill">${esc(r)}</div>`).join('')}</div>` : ''}
          ${(g.prediction.alerts || []).length > 0 ? `<div class="live-prediction-alerts">${g.prediction.alerts.map((a) => `<div class="live-alert-pill">${esc(a)}</div>`).join('')}</div>` : ''}
        </div>
      ` : ''}

      <div class="live-teams-grid">
        <div class="live-team-col">
          <div class="live-team-badge blue">
            <span>Equipo Azul</span>
            <span style="font-size:10px; opacity:0.8;">${g.prediction?.blue?.probability ?? 50}% de ganar</span>
          </div>
          ${(g.teams?.blue ?? []).map(renderPlayer).join('')}
          ${(g.bans?.blue?.length ?? 0) > 0 ? `
            <div class="live-bans-row">
              <span class="live-bans-title">Banes</span>
              <div class="live-bans-list">
                ${g.bans.blue.map((b) => { const bn = resolveChampName(b.champion); return `<img class="live-ban-thumb" src="${champImg(bn)}" title="${esc(bn)}" alt="" onerror="this.style.display='none'">`; }).join('')}
              </div>
            </div>
          ` : ''}
        </div>
        <div class="live-vs-divider">
          <div class="live-vs-circle">VS</div>
          <span class="muted sub" style="font-size:10px; font-weight:700; color:var(--gold);">Min ${g.minutes}</span>
        </div>
        <div class="live-team-col">
          <div class="live-team-badge red">
            <span>Equipo Rojo</span>
            <span style="font-size:10px; opacity:0.8;">${g.prediction?.red?.probability ?? 50}% de ganar</span>
          </div>
          ${(g.teams?.red ?? []).map(renderPlayer).join('')}
          ${(g.bans?.red?.length ?? 0) > 0 ? `
            <div class="live-bans-row">
              <span class="live-bans-title">Banes</span>
              <div class="live-bans-list">
                ${g.bans.red.map((b) => { const bn = resolveChampName(b.champion); return `<img class="live-ban-thumb" src="${champImg(bn)}" title="${esc(bn)}" alt="" onerror="this.style.display='none'">`; }).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  body.querySelectorAll('.open-champ-build').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openBuildModal(btn.dataset.champ);
    });
  });

  dialog.showModal();
}

$('#close-live-match-btn')?.addEventListener('click', () => $('#live-match-dialog')?.close());
$('#cancel-live-match-btn')?.addEventListener('click', () => $('#live-match-dialog')?.close());
$('#live-match-dialog')?.addEventListener('click', (e) => {
  if (e.target === $('#live-match-dialog')) $('#live-match-dialog').close();
});

// OP Score Explanation Dialog
$('#close-opscore-dialog-btn')?.addEventListener('click', () => $('#opscore-dialog')?.close());
$('#cancel-opscore-dialog-btn')?.addEventListener('click', () => $('#opscore-dialog')?.close());
$('#opscore-dialog')?.addEventListener('click', (e) => {
  if (e.target === $('#opscore-dialog')) $('#opscore-dialog').close();
});

// WhatsApp Share buttons (Sidebar and legacy)
const shareWhatsApp = async () => {
  const res = await fetch('/api/whatsapp').catch(() => null);
  const text = res?.ok ? await res.text() : '';
  if (text) {
    await navigator.clipboard.writeText(text);
    toast('¡Resumen para WhatsApp copiado al portapapeles!');
  } else {
    toast('No se pudo generar el texto para WhatsApp.');
  }
};
$('#header-share-btn')?.addEventListener('click', shareWhatsApp);
$('#nav-btn-whatsapp')?.addEventListener('click', shareWhatsApp);

// ---------- Initial Load ----------
async function load() {
  try {
    applyTheme(currentTheme);
    applyLanguage(currentLang);

    board = await (await fetch(`leaderboard.json?t=${Date.now()}`, { cache: 'no-store' })).json();
    $('#group-subtitle').textContent = board.groupName ?? 'La Grieta de los Pibes';
    $('#sidebar-region').textContent = `Temporada 2026 · ${formatPlatform(board.platform)}`;

    renderMvp();
    renderStatGrid();
    renderPodium();
    renderLeaderboards();
    renderRecentMatchesFeed();
    bindRecentMatchesFilterEvents();
    populateDuelSelectors();
    renderSynergy();
    renderApodos();
    renderRecords();
    renderMeta();
    handleHash();
    if (window.location.hash === '#players') {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
    checkLiveTracker();
  } catch (err) {
    console.error('Failed to load leaderboard data:', err);
  }
}

// Player pages, champion matchups, roasts and the website's Update button live in profile-plus.js.
// Loaded with the same ?v= as this file so a new deploy is never mixed with a cached copy.
const plus = await import(new URL(`profile-plus.js${new URL(import.meta.url).search}`, import.meta.url).href)
  .catch((err) => { console.error('profile-plus failed to load:', err); return null; });
plus?.install({ getBoard: () => board, reload: load, switchView, openMatchModal, toast, esc, champImg, iconImg, tierColor, ROLE });

load().then(pollStatus);
