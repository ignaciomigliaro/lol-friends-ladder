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
  if (!name) return 'assets/banner.jpg';
  const raw = String(name).trim();
  const id = board?.champIds?.[raw] || CHAMP_SPLASH_MAP[raw] || CHAMP_SPLASH_MAP[raw.replace(/[^a-zA-Z0-9]/g, '')] || raw.replace(/[^a-zA-Z0-9]/g, '');
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${id}_0.jpg`;
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
      lbDesc: 'Clasificación competitiva de la temporada basada en Solo/Duo, Flex, Victorias y OP Score oficial.',
      sortRank: 'Rank Duo',
      sortFlex: 'Flex',
      sortWinrate: 'Victorias',
      sortSeason: 'Temporada',
      colWinrate: 'VICTORIAS',
      colSeason: 'LP TEMPORADA',
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
      lbDesc: 'Real-time season rankings based on Solo/Duo, Flex, Victories, and official OP Score.',
      sortRank: 'Rank Duo',
      sortFlex: 'Flex',
      sortWinrate: 'Victories',
      sortSeason: 'Season',
      colWinrate: 'VICTORIES',
      colSeason: 'SEASON LP',
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
  const lbTitle = $('#view-leaderboard .heading-title') || $('#view-leaderboard .filter-bar h2');
  if (lbTitle) lbTitle.textContent = t.lbTitle;
  const lbDesc = $('#view-leaderboard .heading-subtitle') || $('#view-leaderboard .filter-bar p.muted');
  if (lbDesc) lbDesc.textContent = t.lbDesc;

  const updatePill = (sel, text) => {
    const el = $(sel);
    if (el) el.textContent = text;
  };
  updatePill('[data-sort="rank"]', t.sortRank);
  updatePill('[data-sort="flex"]', t.sortFlex);
  updatePill('[data-sort="winrate"]', t.sortWinrate);
  updatePill('[data-sort="season"]', t.sortSeason);

  const colWr = $('.leaderboard-table-header .col-winrate');
  if (colWr && colWr.childNodes[0]) colWr.childNodes[0].nodeValue = `${t.colWinrate} `;
  const colSeason = $('.leaderboard-table-header .col-delta');
  if (colSeason && colSeason.childNodes[0]) colSeason.childNodes[0].nodeValue = `${t.colSeason} `;
  const colScore = $('.leaderboard-table-header .col-score');
  if (colScore && colScore.childNodes[0]) colScore.childNodes[0].nodeValue = `${t.colScore} `;

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
  if (viewName === 'apodos') renderApodos();

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
  } else if (['overview', 'leaderboard', 'players', 'duels', 'synergy', 'apodos', 'records', 'meta'].includes(raw)) {
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

// ---------- Weekly Stats calculation helper ----------
function getWeeklyStats(p) {
  const weekStart = board?.weekStart;
  const games = (p.games || []).filter((g) => !g.isRemake && (weekStart ? g.endTs >= weekStart : true));
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
  // Composite Weekly Performance: Impact (Score x10), Winrate (x25), Net Wins (x2.5), MVPs (x1.5), LP progression (x0.15), capped activity
  const netWins = Math.max(0, wins - (games.length - wins));
  const performanceIndex = (avgScore * 10) + ((wins / games.length) * 25) + (Math.max(0, lpWeek) * 0.15) + (netWins * 2.5) + (mvps * 1.5) + (Math.min(games.length, 15) * 0.3);
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
}
window.getWeeklyStats = getWeeklyStats;

// ---------- sorted players ----------
function getFilteredPlayers() {
  let ps = [...(board?.players ?? [])];
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    ps = ps.filter((p) => (p.name ?? '').toLowerCase().includes(q) || (p.riotId ?? '').toLowerCase().includes(q));
  }
  const by = {
    rank: (p) => p.solo?.value ?? -1,
    flex: (p) => p.flex?.value ?? -1,
    winrate: (p) => p.stats?.winrate ?? -1,
    season: (p) => p.lpDelta?.season ?? p.lpDelta?.week ?? -9999,
    mmr: (p) => estimateMmr(p, getWeeklyStats(p)).mmr,
    score: (p) => p.stats?.avgScore ?? -1,
    kda: (p) => p.stats?.kda != null ? Number(p.stats.kda) : -1,
    streak: (p) => p.stats?.streak ?? -99,
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
  const champSplashUrl = getChampSplashUrl(topChamp);

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
      <div class="mvp-champ-bg" style="background-image: linear-gradient(90deg, #0B1322 0%, #0B1322 35%, rgba(11, 19, 34, 0.82) 55%, rgba(11, 19, 34, 0.2) 75%, rgba(11, 19, 34, 0.88) 100%), url('${champSplashUrl}'), url('assets/banner.jpg');"></div>
      
      <div class="mvp-top-bar">
        <div class="mvp-tag-pill clickable" id="mvp-tag-pill-btn" role="button" tabindex="0" title="Ver ranking y cálculo del MVP de la semana">
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
    const s = p.stats;
    const w = getWeeklyStats(p);
    const mmrData = estimateMmr(p, w, currentLang);
    const dSeason = p.lpDelta?.season ?? p.lpDelta?.week;
    const wr = s ? s.winrate : 50;
    const wins = s?.wins ?? 0;
    const games = s?.games ?? 0;
    const losses = games - wins;
    const kda = s?.kda ?? '—';
    const streak = s?.streak ?? 0;
    const streakText = streak > 0 ? `${streak}W 🔥` : streak < 0 ? `${Math.abs(streak)}L ❄️` : '—';
    const lpSeason = dSeason != null ? (dSeason > 0 ? `+${dSeason} LP ▲` : dSeason < 0 ? `${dSeason} LP ▼` : '0 LP') : '+0 LP';
    const soloTier = p.solo?.tier ? p.solo.tier.toLowerCase() : 'unranked';
    const flexTier = p.flex?.tier ? p.flex.tier.toLowerCase() : 'unranked';
    const soloTierLabel = p.solo?.label ?? 'Unranked';
    const flexTierLabel = p.flex?.label ?? 'Unranked';
    const score = s ? s.avgScore.toFixed(1) : '—';

    const topChamp = p.topChampions?.[0]?.champion || (p.games?.[0] ? resolveChampName(p.games[0].champion) : 'Kai\'Sa');
    const champSplashUrl = getChampSplashUrl(topChamp);
    const playerIconUrl = iconImg(p.profileIconId);

    const placeTitle = pos === '1' ? '1° LUGAR · LÍDER' : pos === '2' ? '2° LUGAR · SUBCAMPEÓN' : '3° LUGAR · TERCER LUGAR';
    const medalEmoji = pos === '1' ? '🥇' : pos === '2' ? '🥈' : '🥉';

    return `
      <div class="podium-card ${placeClass}" onclick="window.viewPlayerProfile('${esc(p.puuid)}')">
        <div class="podium-champ-bg" style="background-image: linear-gradient(180deg, rgba(11, 19, 34, 0.22) 0%, rgba(11, 19, 34, 0.75) 45%, #0B1322 96%), url('${champSplashUrl}'), url('assets/banner.jpg');"></div>

        <div class="podium-top-bar">
          <div class="podium-tag-pill ${placeClass}">
            <span>${medalEmoji} ${placeTitle}</span>
          </div>
          <div class="podium-champ-chip" title="Campeón insignia">
            <img class="podium-champ-mini-icon" src="${champImg(topChamp)}" alt="${esc(topChamp)}" onerror="this.style.display='none'">
            <span>${esc(topChamp)}</span>
          </div>
        </div>

        <div class="podium-avatar-area">
          ${crown ? `<div class="podium-crown" title="Líder de la Grieta">👑</div>` : ''}
          <div class="podium-avatar-wrap">
            <img class="podium-avatar" src="${playerIconUrl}" alt="${esc(p.name)}" onerror="this.src='logo.jpg'">
          </div>
          <div class="podium-rank-badge ${placeClass}">${pos}</div>
        </div>

        ${p.level ? `
          <div class="podium-level-pill" title="Nivel ${p.level}">
            <span class="podium-lvl-label">NVL</span> <strong class="podium-lvl-val">${p.level}</strong>
          </div>
        ` : ''}

        <div class="podium-identity">
          <div class="podium-name-line">
            <span class="podium-name">${esc(p.name)}</span>
            ${p.nickname ? `
              <span class="podium-nickname" title="${esc(p.nickname.reason || '')}">
                "${esc(p.nickname.title)}"
              </span>
            ` : ''}
          </div>
        </div>

        <!-- Rangos Solo/Duo y Flex con colores oficiales de tier -->
        <div class="podium-ranks-line">
          <span class="podium-rank-chip solo tier-${soloTier}" title="Clasificatoria Solo/Duo">
            <strong class="q-label">Solo:</strong> ${esc(soloTierLabel)}
          </span>
          <span class="podium-rank-chip flex tier-${flexTier}" title="Clasificatoria Flex">
            <strong class="q-label">Flex:</strong> ${esc(flexTierLabel)}
          </span>
        </div>

        <!-- Micro-Grid de estadísticas perfectamente alineado -->
        <div class="podium-substats">
          <span class="podium-stat-chip winrate" title="Porcentaje de Victorias (${wins}V - ${losses}D)">
            <span class="podium-stat-label">WR</span>
            <strong class="podium-stat-val">${wr}%</strong>
            <span class="podium-chip-sub">(${wins}V-${losses}D)</span>
          </span>
          <span class="podium-stat-chip lp ${(dSeason ?? 0) >= 0 ? 'pos' : 'neg'}" title="Balance de LP en la temporada">
            <span class="podium-stat-label">Temporada</span>
            <strong class="podium-stat-val">${lpSeason}</strong>
          </span>
          <span class="podium-stat-chip kda" title="Ratio KDA = (Kills + Asistencias) ÷ Muertes">
            <span class="podium-stat-label">KDA</span>
            <strong class="podium-stat-val">${kda}</strong>
          </span>
          <span class="podium-stat-chip mmr" title="MMR Estimado: ~${mmrData.mmr} (${mmrData.healthLabel})">
            <span class="podium-stat-label">MMR</span>
            <strong class="podium-stat-val">~${mmrData.mmr}</strong>
            <span class="mmr-health-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${mmrData.healthColor};box-shadow:0 0 6px ${mmrData.healthColor};margin-left:2px;" aria-hidden="true"></span>
          </span>
          <span class="podium-stat-chip streak" title="Racha actual de partidas">
            <span class="podium-stat-label">Racha</span>
            <strong class="podium-stat-val">${streakText}</strong>
          </span>
        </div>

        <!-- OP Score Badge Oficial OP.GG -->
        <div class="podium-score-wrap">
          <div class="podium-score-emblem ${placeClass}" title="Calificación Oficial de Rendimiento OP.GG">
            <span class="podium-score-brand">OP.GG</span>
            <span class="podium-score-num">${score}</span>
            <span class="podium-score-title">SCORE</span>
          </div>
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
  const placeClass = rank === 1 ? 'first' : rank === 2 ? 'second' : rank === 3 ? 'third' : 'standard';

  const s = p.stats;
  const w = getWeeklyStats(p);
  const mmrData = estimateMmr(p, w, currentLang);
  const dSeason = p.lpDelta?.season ?? p.lpDelta?.week;
  const deltaText = dSeason != null ? `${signed(dSeason)} LP ${dSeason >= 0 ? '▲' : '▼'}` : '—';
  const deltaClass = (dSeason ?? 0) >= 0 ? 'positive' : 'negative';

  const wr = s ? `${s.winrate}%` : '—';
  const wins = s?.wins ?? 0;
  const games = s?.games ?? 0;
  const losses = games - wins;
  const kda = s?.kda ?? '—';
  const streak = s?.streak ?? 0;
  const streakText = streak > 0 ? `${streak}W 🔥` : streak < 0 ? `${Math.abs(streak)}L ❄️` : '—';

  const soloTier = p.solo?.tier ? p.solo.tier.toLowerCase() : 'unranked';
  const flexTier = p.flex?.tier ? p.flex.tier.toLowerCase() : 'unranked';
  const soloTierLabel = p.solo?.label ?? 'Unranked';
  const flexTierLabel = p.flex?.label ?? 'Unranked';
  const score = s ? s.avgScore.toFixed(1) : '—';

  const avatarUrl = iconImg(p.profileIconId);
  const nick = p.nickname ? `<span class="row-nickname-badge">"${esc(p.nickname.title)}"</span>` : '';

  return `
    <article class="player-row-card ${isLeader ? 'gold-leader' : ''} ${placeClass}" onclick="window.viewPlayerProfile('${esc(p.puuid)}')">
      <div class="row-pos-col">
        <span class="row-pos-badge ${placeClass}">${rank}</span>
      </div>

      <div class="row-avatar-col">
        <div class="row-avatar-wrap">
          <img class="row-avatar" src="${avatarUrl}" alt="${esc(p.name)}" onerror="this.src='logo.jpg'">
          ${p.level ? `<span class="row-level-pill">${p.level}</span>` : ''}
        </div>
      </div>

      <div class="row-identity-col">
        <div class="row-name-line">
          ${isLeader ? '<span class="crown-icon" title="Líder de la Grieta">👑</span>' : ''}
          <span class="row-name">${esc(p.name)}</span>
          ${nick}
        </div>
        <div class="row-ranks-line">
          <span class="row-rank-badge solo tier-${soloTier}" title="Clasificatoria Solo/Duo">
            <strong class="q-label">Solo:</strong> ${esc(soloTierLabel)}
          </span>
          <span class="row-rank-badge flex tier-${flexTier}" title="Clasificatoria Flex">
            <strong class="q-label">Flex:</strong> ${esc(flexTierLabel)}
          </span>
        </div>
      </div>

      <div class="row-stats-wrapper">
        <div class="row-stat-col row-mmr" title="MMR Estimado: ~${mmrData.mmr} (${mmrData.healthLabel})">
          <span class="row-stat-val">~${mmrData.mmr} <span class="mmr-health-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${mmrData.healthColor};vertical-align:middle;margin-left:2px;"></span></span>
          <span class="row-stat-sub">${mmrData.healthLabel.split(' · ')[0]}</span>
        </div>

        <div class="row-stat-col row-kda" title="Ratio KDA = (Kills + Asistencias) ÷ Muertes">
          <span class="row-stat-val">${kda}</span>
          <span class="row-stat-sub">KDA</span>
        </div>

        <div class="row-stat-col row-winrate" title="Porcentaje de Victorias (${wins}W - ${losses}D)">
          <span class="row-stat-val ${s && s.winrate >= 55 ? 'high-wr' : ''}">${wr}</span>
          <span class="row-stat-sub">${wins}V - ${losses}D</span>
        </div>

        <div class="row-stat-col row-delta ${deltaClass}" title="Puntos de Liga ganados/perdidos en la temporada">
          <span class="row-stat-val">${deltaText}</span>
          <span class="row-stat-sub">Temporada</span>
        </div>

        <div class="row-stat-col row-streak" title="Racha consecutiva actual">
          <span class="row-streak-val ${streak > 0 ? 'win' : 'loss'}">${streakText}</span>
          <span class="row-stat-sub">Racha</span>
        </div>

        <div class="row-stat-col row-sparkline" title="Tendencia de las últimas partidas">
          ${createSparkline(p.games, isLeader)}
        </div>
      </div>

      <div class="row-stat-col row-score" title="OP Score Promedio Oficial OP.GG">
        <div class="row-score-box ${placeClass}">
          <span class="row-score-val">${score}</span>
          <span class="row-score-sub opgg-source">OP.GG</span>
        </div>
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

function formatMatchDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const day = d.getDate();
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} · ${hours}:${minutes}`;
}

function getGroupMatchesList() {
  const map = new Map();
  for (const p of board?.players || []) {
    for (const g of p.games || []) {
      const isRemake = Boolean(g.isRemake || (g.minutes && g.minutes < 5));
      const isSurrender = Boolean(!isRemake && (g.isSurrender || (g.minutes && g.minutes >= 5 && g.minutes <= 21)));
      if (!map.has(g.matchId)) {
        map.set(g.matchId, {
          matchId: g.matchId,
          queueId: g.queueId,
          endTs: g.endTs,
          minutes: g.minutes,
          win: g.win,
          isRemake,
          isSurrender,
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
    matches = matches.filter((m) => m.win && !m.isRemake);
  } else if (currentMatchQueueFilter === 'loss') {
    matches = matches.filter((m) => !m.win && !m.isRemake);
  } else if (currentMatchQueueFilter === 'surrender') {
    matches = matches.filter((m) => m.isSurrender && !m.isRemake);
  } else if (currentMatchQueueFilter === 'remake') {
    matches = matches.filter((m) => m.isRemake);
  }

  const totalMatches = matches.length;
  const totalPages = Math.max(1, Math.ceil(totalMatches / MATCHES_PER_PAGE));
  if (currentMatchPage > totalPages) currentMatchPage = totalPages;
  if (currentMatchPage < 1) currentMatchPage = 1;

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
    const isRemake = Boolean(m.isRemake || (m.minutes && m.minutes < 5));
    const isSurrender = Boolean(!isRemake && (m.isSurrender || (m.minutes && m.minutes >= 5 && m.minutes <= 21)));
    const isWin = m.win;
    const qName = m.queueId === 420 ? 'Solo/Duo' : m.queueId === 440 ? 'Ranked Flex' : (m.queue || 'Ranked');
    const hasMultipleFriends = m.friends.length > 1;
    const matchLpDelta = m.friends?.find((f) => f.lpDelta != null)?.lpDelta ?? null;

    return `
      <article class="overview-match-card ${isRemake ? 'remake' : isWin ? 'win' : 'loss'}" data-match-id="${esc(m.matchId)}">
        <div class="overview-match-header">
          <div class="feed-header-left">
            <span class="feed-badge-result ${isRemake ? 'remake' : isWin ? 'win' : 'loss'}">
              ${isRemake ? 'REMAKE' : isWin ? 'VICTORIA' : 'DERROTA'}
            </span>
            ${isSurrender && !isRemake ? `
              <span class="feed-badge-surrender ${isWin ? 'enemy' : 'team'}" title="${isWin ? 'Victoria por rendición del equipo enemigo' : 'Derrota por rendición'}">
                Surrender
              </span>
            ` : ''}
            <span class="feed-badge-queue">${qName}</span>
            <span class="feed-badge-time">
              ${m.minutes}m
              ${matchLpDelta != null ? `
                <span class="feed-badge-lp ${matchLpDelta > 0 ? 'pos' : matchLpDelta < 0 ? 'neg' : 'zero'}" title="${matchLpDelta > 0 ? `Ganó +${matchLpDelta} LP` : matchLpDelta < 0 ? `Perdió ${matchLpDelta} LP` : 'Sin variación de LP'}">
                  ${matchLpDelta > 0 ? `+${matchLpDelta} LP ▲` : matchLpDelta < 0 ? `${matchLpDelta} LP ▼` : '±0 LP'}
                </span>
              ` : ''}
            </span>
            <span class="feed-badge-date">${formatMatchDate(m.endTs)}</span>
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
                    <span class="overview-score-tag opgg-source" title="Calificación oficial de OP.GG (1 a 10)">
                      <span class="score-lbl">OP.GG</span>
                      <span class="score-val">${f.score?.toFixed(1) || '—'}</span>
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
                      <img class="overview-rival-champ-img" src="${champImg(f.opp.champion)}" alt="${esc(resolveChampName(f.opp.champion))}" title="${esc(resolveChampName(f.opp.champion))}" onerror="this.src='logo.jpg'">
                      <div class="overview-rival-info">
                        <span class="overview-rival-status ${f.score >= (f.opp.score || 0) ? 'win' : 'loss'}">
                          ${f.score >= (f.opp.score || 0) ? 'Ganó vs' : 'Perdió vs'}
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
const kNum = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);

function calculateDuelOdds(pA, pB) {
  const soloValA = pA.solo?.value ?? 800;
  const soloValB = pB.solo?.value ?? 800;
  const eloDiff = soloValA - soloValB;
  const eloProbA = 1 / (1 + Math.pow(10, -eloDiff / 600));

  const scoreA = pA.stats?.avgScore ?? 5.0;
  const scoreB = pB.stats?.avgScore ?? 5.0;
  const scoreDiff = scoreA - scoreB;
  const scoreProbA = 0.5 + (scoreDiff * 0.12);

  const wrA = (pA.stats?.winrate ?? 50) / 100;
  const wrB = (pB.stats?.winrate ?? 50) / 100;
  const wrDiff = wrA - wrB;
  const wrProbA = 0.5 + (wrDiff * 0.8);

  const kdaA = Number(pA.stats?.kda ?? 2.0);
  const kdaB = Number(pB.stats?.kda ?? 2.0);
  const kdaDiff = (kdaA - kdaB) / Math.max(1, (kdaA + kdaB) / 2);
  const kdaProbA = 0.5 + (kdaDiff * 0.15);

  const topChampA = pA.topChampions?.[0];
  const topChampB = pB.topChampions?.[0];
  const champWrA = topChampA?.games ? (topChampA.wins / topChampA.games) : 0.5;
  const champWrB = topChampB?.games ? (topChampB.wins / topChampB.games) : 0.5;
  const champProbA = 0.5 + ((champWrA - champWrB) * 0.3);

  let finalProbA = (
    eloProbA * 0.35 +
    scoreProbA * 0.25 +
    wrProbA * 0.15 +
    kdaProbA * 0.15 +
    champProbA * 0.10
  );
  finalProbA = Math.max(0.12, Math.min(0.88, finalProbA));
  const pctA = Math.round(finalProbA * 100);
  const pctB = 100 - pctA;

  const winner = pctA >= pctB ? pA : pB;
  const loser = pctA >= pctB ? pB : pA;
  const winnerPct = Math.max(pctA, pctB);
  const loserPct = Math.min(pctA, pctB);
  const margin = Math.abs(pctA - pctB);

  return {
    pctA,
    pctB,
    winner,
    loser,
    winnerPct,
    loserPct,
    margin,
    isSideAWinner: pctA >= pctB,
    factors: {
      elo: { valA: soloValA, valB: soloValB, diff: eloDiff, adv: eloDiff > 0 ? 'A' : eloDiff < 0 ? 'B' : 'EQUAL' },
      score: { valA: scoreA, valB: scoreB, diff: scoreDiff, adv: scoreDiff > 0 ? 'A' : scoreDiff < 0 ? 'B' : 'EQUAL' },
      wr: { valA: Math.round(wrA * 100), valB: Math.round(wrB * 100), diff: Math.round(wrDiff * 100), adv: wrDiff > 0 ? 'A' : wrDiff < 0 ? 'B' : 'EQUAL' },
      kda: { valA: kdaA, valB: kdaB, diff: kdaA - kdaB, adv: kdaA > kdaB ? 'A' : kdaA < kdaB ? 'B' : 'EQUAL' },
      champ: {
        champA: topChampA?.champion || 'Kai\'Sa',
        champB: topChampB?.champion || 'Kai\'Sa',
        wrA: Math.round(champWrA * 100),
        wrB: Math.round(champWrB * 100),
        adv: champWrA > champWrB ? 'A' : champWrA < champWrB ? 'B' : 'EQUAL'
      }
    }
  };
}

function generateDuelHumor(pA, pB, odds) {
  const winner = odds.winner;
  const loser = odds.loser;
  const margin = odds.margin;

  const slogans = [
    'Duelo de discapacidades motrices: a ver quién erra el Flash contra la pared primero.',
    'El choque del siglo... o al menos de los dos con peor promedio de visión de LAN.',
    'Uno juega con monitor encendido; el otro se orienta por las vibraciones del teclado.',
    'Probabilidad de que este 1v1 termine con ragequit y bloqueo mutuo en WhatsApp: 94.8%.',
    'Si este duelo fuera un streaming, Twitch lo clasificaría bajo "Contenido sensible y perturbador".',
    'El perdedor pagará las pizzas y tendrá prohibido pedir línea por las próximas 3 semanas.',
    'Uno cree que es Faker en Worlds, el otro todavía está leyendo qué hacen las habilidades de su campeón.',
    'Duelo a muerte en la Grieta: los súbditos ya compraron palomitas para ver el espectáculo.'
  ];

  let verdictTitle = '';
  let verdictText = '';

  if (margin >= 26) {
    verdictTitle = `Paliza Histórica: ${esc(winner.name)} lo manda al lobby a replantearse la vida`;
    verdictText = `No va a ser un duelo, va a ser un trámite judicial. ${esc(winner.name)} tiene un contundente ${odds.winnerPct}% de probabilidad de victoria frente a un mísero ${odds.loserPct}% de ${esc(loser.name)}. La distancia entre ambos es más grande que la fosa de las Marianas. Se recomienda tener a mano un número de asistencia psicológica para ${esc(loser.name)}, porque ni jugando con el monitor apagado pierde ${esc(winner.name)}.`;
  } else if (margin >= 14) {
    verdictTitle = `Ventaja Decisiva para ${esc(winner.name)} (${odds.winnerPct}% vs ${odds.loserPct}%)`;
    verdictText = `${esc(winner.name)} se impone con autoridad. ${esc(loser.name)} va a pelear con ganas los primeros 3 minutos, hasta que su instinto biológico de trollear y divear bajo torre sin vida se active automáticamente. ${esc(loser.name)} culpará al lag, al teclado y al jungla, pero la matemática no miente.`;
  } else {
    verdictTitle = `Victoria Apretada: Duelo de Inválidos (${odds.winnerPct}% vs ${odds.loserPct}%)`;
    verdictText = `Duelo cochino, trabado y doloroso para la vista. ${esc(winner.name)} se lleva la victoria raspando (${odds.winnerPct}%), no por mérito propio, sino porque ${esc(loser.name)} encontrará la forma más poética y ridícula de tirar la partida (inting) en el momento decisivo. El verdadero perdedor aquí es el espectador.`;
  }

  // Loser specific roasts
  const roasts = [];
  const loserDeaths = loser.stats?.avgDeaths ?? 5.5;
  if (loserDeaths >= 6.0) {
    roasts.push(`<strong>Causa de defunción:</strong> Con un promedio de ${loserDeaths.toFixed(1)} muertes por partida, ${esc(loser.name)} pasa más tiempo en pantalla gris que jugando. Debería poner un sofá en la fuente enemiga.`);
  }
  const loserScore = loser.stats?.avgScore ?? 5.0;
  if (loserScore < 5.2) {
    roasts.push(`<strong>Calificación OP.GG:</strong> Registra un humillante ${loserScore.toFixed(1)} de score promedio. Ni la inteligencia artificial de Riot puede encontrar una jugada salvable en su historial.`);
  }
  const loserMochila = (board?.groupGames || []).filter((g) =>
    g.players?.some((p) => p.puuid === loser.puuid && p.mochila)
  ).length;
  if (loserMochila > 0) {
    roasts.push(`<strong>Antecedente penal:</strong> Ha sido etiquetado como "Mochila" ${loserMochila} veces en las partidas del grupo. Sus compañeros todavía tienen dolores lumbares de tener que cargarlo.`);
  }
  if (!roasts.length) {
    roasts.push(`<strong>Factores de tilteo:</strong> Su tasa de victorias del ${loser.stats?.winrate ?? 50}% refleja que cada vez que entra a ranked, su equipo empieza jugando 4v6.`);
  }

  const sloganIdx = Math.abs((pA.name.length * 3 + pB.name.length * 7)) % slogans.length;
  const slogan = slogans[sloganIdx];

  return {
    slogan,
    verdictTitle,
    verdictText,
    loserRoast: roasts.join('<br><br>')
  };
}

let isDuelSimulating = false;

function triggerDuelSimulationAnimation() {
  if (isDuelSimulating) return;
  isDuelSimulating = true;

  const stage = $('#duel-battle-stage');
  const badge = $('#duel-vs-badge');
  const ticker = $('#duel-battle-ticker');
  const btn = $('#btn-simulate-duel');

  if (stage) stage.classList.add('duel-clashing');
  if (badge) badge.classList.add('pulse');
  if (btn) btn.disabled = true;

  const lines = [
    'Calculando fallos de Flash en pared...',
    'Analizando índice de tilteo y llanto...',
    'Consultando a la IA quién es más manco...',
    'Midiendo tradeos suicidas en el río...'
  ];

  if (ticker) {
    ticker.style.display = 'block';
    let lineIdx = 0;
    ticker.textContent = lines[0];
    const interval = setInterval(() => {
      lineIdx = (lineIdx + 1) % lines.length;
      ticker.textContent = lines[lineIdx];
    }, 180);

    setTimeout(() => {
      clearInterval(interval);
      if (stage) stage.classList.remove('duel-clashing');
      if (badge) badge.classList.remove('pulse');
      if (ticker) ticker.style.display = 'none';
      if (btn) btn.disabled = false;
      isDuelSimulating = false;
      updateDuelComparison(false);
    }, 700);
  } else {
    setTimeout(() => {
      if (stage) stage.classList.remove('duel-clashing');
      if (badge) badge.classList.remove('pulse');
      if (btn) btn.disabled = false;
      isDuelSimulating = false;
      updateDuelComparison(false);
    }, 500);
  }
}

function populateDuelSelectors() {
  const selectA = $('#duel-select-a');
  const selectB = $('#duel-select-b');
  if (!selectA || !selectB) return;

  const ps = board?.players ?? [];
  if (!ps.length) return;

  const options = ps.map((p) => `<option value="${p.puuid}">${esc(p.name)}</option>`).join('');
  selectA.innerHTML = options;
  selectB.innerHTML = options;

  if (ps.length > 1) {
    selectB.selectedIndex = 1;
  }

  // Presets handling
  $$('.duel-preset-pill').forEach((btn) => {
    btn.onclick = () => {
      $$('.duel-preset-pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const preset = btn.dataset.preset;
      const sortedBySolo = [...ps].sort((a, b) => (b.solo?.value ?? 0) - (a.solo?.value ?? 0));

      if (preset === 'classic') {
        selectA.selectedIndex = 0;
        selectB.selectedIndex = Math.min(1, ps.length - 1);
      } else if (preset === 'titans') {
        if (sortedBySolo.length >= 2) {
          selectA.value = sortedBySolo[0].puuid;
          selectB.value = sortedBySolo[1].puuid;
        }
      } else if (preset === 'relegation') {
        if (sortedBySolo.length >= 2) {
          selectA.value = sortedBySolo[sortedBySolo.length - 2].puuid;
          selectB.value = sortedBySolo[sortedBySolo.length - 1].puuid;
        }
      } else if (preset === 'random') {
        const idxA = Math.floor(Math.random() * ps.length);
        let idxB = Math.floor(Math.random() * ps.length);
        if (idxB === idxA && ps.length > 1) idxB = (idxA + 1) % ps.length;
        selectA.selectedIndex = idxA;
        selectB.selectedIndex = idxB;
      }
      triggerDuelSimulationAnimation();
    };
  });

  $('#btn-simulate-duel')?.addEventListener('click', triggerDuelSimulationAnimation);

  updateDuelComparison(false);
}

function updateDuelComparison(isAnimated = false) {
  const selectA = $('#duel-select-a');
  const selectB = $('#duel-select-b');
  if (!selectA || !selectB) return;

  let puuidA = selectA.value;
  let puuidB = selectB.value;

  const ps = board?.players ?? [];
  if (ps.length > 1 && puuidA === puuidB) {
    const nextIdx = (selectA.selectedIndex + 1) % ps.length;
    selectB.selectedIndex = nextIdx;
    puuidB = selectB.value;
  }

  const pA = ps.find((p) => p.puuid === puuidA);
  const pB = ps.find((p) => p.puuid === puuidB);
  if (!pA || !pB) return;

  // 1. Basic Player Cards Update
  $('#duel-avatar-a').src = iconImg(pA.profileIconId);
  $('#duel-avatar-b').src = iconImg(pB.profileIconId);
  $('#duel-tier-a').textContent = pA.solo?.label ?? 'Unranked';
  $('#duel-tier-b').textContent = pB.solo?.label ?? 'Unranked';

  const nickA = $('#duel-nick-a');
  if (nickA) nickA.textContent = pA.nickname?.title ? `“${pA.nickname.title}”` : '';
  const nickB = $('#duel-nick-b');
  if (nickB) nickB.textContent = pB.nickname?.title ? `“${pB.nickname.title}”` : '';

  const mainA = pA.topChampions?.[0]?.champion || (pA.games?.[0] ? resolveChampName(pA.games[0].champion) : 'Kai\'Sa');
  const mainB = pB.topChampions?.[0]?.champion || (pB.games?.[0] ? resolveChampName(pB.games[0].champion) : 'Kai\'Sa');

  const chipA = $('#duel-champ-badge-a');
  if (chipA) {
    chipA.innerHTML = `<img src="${champImg(mainA)}" alt="${esc(mainA)}" onerror="this.src='logo.jpg'"> <span>${esc(mainA)}</span>`;
  }
  const chipB = $('#duel-champ-badge-b');
  if (chipB) {
    chipB.innerHTML = `<img src="${champImg(mainB)}" alt="${esc(mainB)}" onerror="this.src='logo.jpg'"> <span>${esc(mainB)}</span>`;
  }

  // 2. Real Odds & Dark Humor Calculation
  const odds = calculateDuelOdds(pA, pB);
  const humor = generateDuelHumor(pA, pB, odds);

  const boxA = $('#duel-player-box-a');
  const boxB = $('#duel-player-box-b');
  if (boxA && boxB) {
    boxA.classList.toggle('is-winner', odds.isSideAWinner);
    boxA.classList.toggle('is-loser', !odds.isSideAWinner);
    boxB.classList.toggle('is-winner', !odds.isSideAWinner);
    boxB.classList.toggle('is-loser', odds.isSideAWinner);
  }

  // 3. Render Dynamic Verdict Container
  const verdictContainer = $('#duel-verdict-container');
  if (verdictContainer) {
    const marginClass = odds.margin >= 26 ? 'crushing' : odds.margin >= 14 ? 'clear' : 'tight';
    const marginLabel = odds.margin >= 26 ? 'Paliza Pronosticada' : odds.margin >= 14 ? 'Ventaja Clara' : 'Pelea de Inválidos (Cerrada)';

    verdictContainer.innerHTML = `
      <div class="duel-verdict-card">
        <div class="duel-slogan-banner">
          🔥 <strong>Choque de Titanes:</strong> ${humor.slogan}
        </div>

        <div class="duel-winner-callout">
          <h3 class="duel-winner-title">
            <span>👑 Favorito por Matemática:</span>
            <strong>${esc(odds.winner.name)}</strong>
          </h3>
          <span class="duel-margin-pill ${marginClass}">${marginLabel}</span>
        </div>

        <div class="duel-gauge-container">
          <div class="duel-gauge-labels">
            <span style="color:var(--cyan);">${esc(pA.name)} · ${odds.pctA}%</span>
            <span style="color:var(--gold);">${esc(pB.name)} · ${odds.pctB}%</span>
          </div>
          <div class="duel-gauge-track">
            <div class="duel-gauge-left" style="width:${odds.pctA}%">${odds.pctA}%</div>
            <div class="duel-gauge-right" style="width:${odds.pctB}%">${odds.pctB}%</div>
          </div>
        </div>

        <div class="duel-factors-grid">
          <div class="duel-factor-chip">
            <span class="duel-factor-name">📈 ELO / Rango Solo</span>
            <span class="duel-factor-val">${pA.solo?.label ?? 'Unranked'} vs ${pB.solo?.label ?? 'Unranked'}</span>
            <span class="duel-factor-desc">${odds.factors.elo.diff > 0 ? `+${odds.factors.elo.diff} pts para ${esc(pA.name)}` : odds.factors.elo.diff < 0 ? `+${Math.abs(odds.factors.elo.diff)} pts para ${esc(pB.name)}` : 'Empate técnico'}</span>
          </div>
          <div class="duel-factor-chip">
            <span class="duel-factor-name">🏆 OP.GG Score</span>
            <span class="duel-factor-val">${pA.stats?.avgScore.toFixed(1) ?? '—'} vs ${pB.stats?.avgScore.toFixed(1) ?? '—'}</span>
            <span class="duel-factor-desc">${odds.factors.score.diff > 0 ? `${esc(pA.name)} más regular` : odds.factors.score.diff < 0 ? `${esc(pB.name)} más regular` : 'Misma consistencia'}</span>
          </div>
          <div class="duel-factor-chip">
            <span class="duel-factor-name">⚔️ KDA y Muertes</span>
            <span class="duel-factor-val">${pA.stats?.kda ?? '—'} vs ${pB.stats?.kda ?? '—'}</span>
            <span class="duel-factor-desc">${(pA.stats?.avgDeaths ?? 0) <= (pB.stats?.avgDeaths ?? 0) ? `${esc(pA.name)} muere menos` : `${esc(pB.name)} muere menos`}</span>
          </div>
          <div class="duel-factor-chip">
            <span class="duel-factor-name">🎯 Main Champ WR</span>
            <span class="duel-factor-val">${odds.factors.champ.wrA}% vs ${odds.factors.champ.wrB}%</span>
            <span class="duel-factor-desc">${odds.factors.champ.wrA >= odds.factors.champ.wrB ? `Ventaja ${esc(odds.factors.champ.champA)}` : `Ventaja ${esc(odds.factors.champ.champB)}`}</span>
          </div>
        </div>

        <div class="duel-roast-box">
          <div class="duel-roast-header">
            <span>💀 Autopsia del Duelo & Veredicto Destructivo</span>
          </div>
          <p class="duel-roast-text">${humor.verdictText}</p>
          <div class="duel-roast-loser-stats">
            ${humor.loserRoast}
          </div>
        </div>
      </div>
    `;
  }

  // 4. Render VS de Campeones Insignia (Clash de Mains)
  const champsClash = $('#duel-champs-clash');
  if (champsClash) {
    const topA = pA.topChampions?.[0];
    const topB = pB.topChampions?.[0];
    const splashA = getChampSplashUrl(mainA);
    const splashB = getChampSplashUrl(mainB);
    const gamesA = topA?.games ?? 0;
    const winsA = topA?.wins ?? 0;
    const wrA = gamesA > 0 ? Math.round((winsA / gamesA) * 100) : 50;
    const scoreA = topA?.score ? topA.score.toFixed(1) : '—';

    const gamesB = topB?.games ?? 0;
    const winsB = topB?.wins ?? 0;
    const wrB = gamesB > 0 ? Math.round((winsB / gamesB) * 100) : 50;
    const scoreB = topB?.score ? topB.score.toFixed(1) : '—';

    // Top 3 champions comparison rows
    const topChampsA = pA.topChampions?.slice(0, 3) ?? [];
    const topChampsB = pB.topChampions?.slice(0, 3) ?? [];
    const maxLen = Math.max(topChampsA.length, topChampsB.length);
    let top3RowsHtml = '';
    for (let i = 0; i < maxLen; i++) {
      const cA = topChampsA[i];
      const cB = topChampsB[i];
      const nameA = cA?.champion || '—';
      const nameB = cB?.champion || '—';
      const cWrA = cA?.games ? Math.round((cA.wins / cA.games) * 100) : 0;
      const cWrB = cB?.games ? Math.round((cB.wins / cB.games) * 100) : 0;
      top3RowsHtml += `
        <tr>
          <td>
            ${cA ? `<span class="duel-top3-champ-cell"><img src="${champImg(nameA)}" alt="" onerror="this.src='logo.jpg'"> <strong>${esc(nameA)}</strong> (${cA.games}p · ${cWrA}% WR)</span>` : '—'}
          </td>
          <td style="color:var(--text-muted); font-size:12px; font-weight:700;">Pick #${i + 1}</td>
          <td>
            ${cB ? `<span class="duel-top3-champ-cell"><img src="${champImg(nameB)}" alt="" onerror="this.src='logo.jpg'"> <strong>${esc(nameB)}</strong> (${cB.games}p · ${cWrB}% WR)</span>` : '—'}
          </td>
        </tr>
      `;
    }

    champsClash.innerHTML = `
      <div class="duel-section-header">
        <h3 class="duel-section-title">⚔️ Choque de Campeones Insignia (Main vs Main)</h3>
        <p class="muted sub" style="margin:0;">Enfrentamiento directo entre el pick más jugado de cada invocador.</p>
      </div>

      <div class="duel-champs-grid">
        <!-- Champion Card A -->
        <div class="duel-champ-card side-a">
          <div class="duel-champ-splash-bg" style="background-image: linear-gradient(180deg, rgba(11, 19, 34, 0.4) 0%, rgba(11, 19, 34, 0.92) 80%), url('${splashA}'), url('assets/banner.jpg');"></div>
          <div class="duel-champ-card-content">
            <div class="duel-champ-head">
              <div class="duel-champ-icon-wrap">
                <img src="${champImg(mainA)}" alt="${esc(mainA)}" onerror="this.src='logo.jpg'">
                <span class="duel-champ-role-badge">${esc(pA.games?.[0]?.position ?? 'MID')}</span>
              </div>
              <div class="duel-champ-identity">
                <strong>${esc(mainA)}</strong>
                <span>Pick Principal de ${esc(pA.name)}</span>
              </div>
            </div>
            <div class="duel-champ-stats-row">
              <span class="duel-champ-stat-pill">Partidas: <strong>${gamesA}</strong></span>
              <span class="duel-champ-stat-pill">Winrate: <strong style="color:${wrA >= 50 ? 'var(--cyan)' : 'var(--danger)'};">${wrA}%</strong> (${winsA}V - ${gamesA - winsA}D)</span>
              <span class="duel-champ-stat-pill">Score OP: <strong>${scoreA}</strong></span>
            </div>
          </div>
        </div>

        <div class="duel-champs-mid-vs">VS</div>

        <!-- Champion Card B -->
        <div class="duel-champ-card side-b">
          <div class="duel-champ-splash-bg" style="background-image: linear-gradient(180deg, rgba(11, 19, 34, 0.4) 0%, rgba(11, 19, 34, 0.92) 80%), url('${splashB}'), url('assets/banner.jpg');"></div>
          <div class="duel-champ-card-content">
            <div class="duel-champ-head">
              <div class="duel-champ-icon-wrap">
                <img src="${champImg(mainB)}" alt="${esc(mainB)}" onerror="this.src='logo.jpg'">
                <span class="duel-champ-role-badge">${esc(pB.games?.[0]?.position ?? 'MID')}</span>
              </div>
              <div class="duel-champ-identity">
                <strong>${esc(mainB)}</strong>
                <span>Pick Principal de ${esc(pB.name)}</span>
              </div>
            </div>
            <div class="duel-champ-stats-row">
              <span class="duel-champ-stat-pill">Partidas: <strong>${gamesB}</strong></span>
              <span class="duel-champ-stat-pill">Winrate: <strong style="color:${wrB >= 50 ? 'var(--gold)' : 'var(--danger)'};">${wrB}%</strong> (${winsB}V - ${gamesB - winsB}D)</span>
              <span class="duel-champ-stat-pill">Score OP: <strong>${scoreB}</strong></span>
            </div>
          </div>
        </div>
      </div>

      ${maxLen > 0 ? `
        <div class="duel-top3-table-wrap">
          <table class="duel-top3-table">
            <thead>
              <tr>
                <th style="color:var(--cyan);">${esc(pA.name)} (Top 3 Campeones)</th>
                <th>Enfrentamiento</th>
                <th style="color:var(--gold);">${esc(pB.name)} (Top 3 Campeones)</th>
              </tr>
            </thead>
            <tbody>
              ${top3RowsHtml}
            </tbody>
          </table>
        </div>
      ` : ''}
    `;
  }

  // 5. Render Mejores Partidas Frente a Frente (Peak Performance)
  const bestGamesSection = $('#duel-best-games');
  if (bestGamesSection) {
    const gamesA = pA.games || [];
    const gamesB = pB.games || [];
    const bestA = [...gamesA].sort((x, y) => (y.score ?? 0) - (x.score ?? 0) || (y.kills ?? 0) - (x.kills ?? 0))[0];
    const bestB = [...gamesB].sort((x, y) => (y.score ?? 0) - (x.score ?? 0) || (y.kills ?? 0) - (x.kills ?? 0))[0];

    const worstA = [...gamesA].sort((x, y) => (x.score ?? 10) - (y.score ?? 10) || (y.deaths ?? 0) - (x.deaths ?? 0))[0];
    const worstB = [...gamesB].sort((x, y) => (x.score ?? 10) - (y.score ?? 10) || (y.deaths ?? 0) - (x.deaths ?? 0))[0];

    bestGamesSection.innerHTML = `
      <div class="duel-section-header">
        <h3 class="duel-section-title">🌟 Duelo de Mejores Partidas (Peak Performance)</h3>
        <p class="muted sub" style="margin:0;">El mejor juego registrado de cada jugador esta temporada. Haz clic en cualquiera para ver el 5v5 completo.</p>
      </div>

      <div class="duel-best-games-grid">
        <!-- Best A -->
        ${bestA ? `
          <div class="duel-best-card side-a" onclick="window.openMatchModal('${esc(bestA.matchId)}')">
            <div class="duel-best-tag">Mejor Partida · ${esc(pA.name)}</div>
            <div class="duel-best-body">
              <div class="duel-best-champ-wrap">
                <img src="${champImg(resolveChampName(bestA.champion))}" alt="" onerror="this.src='logo.jpg'">
              </div>
              <div class="duel-best-info">
                <div class="duel-best-info-head">
                  <span class="feed-badge-result ${bestA.win ? 'win' : 'loss'}">${bestA.win ? 'VICTORIA' : 'DERROTA'}</span>
                  <span class="px-score ${bestA.score >= 8 ? 'px-s-great' : 'px-s-good'}">Score ${bestA.score?.toFixed(1) ?? '—'}</span>
                  ${bestA.mvp ? '<span class="feed-badge-surrender enemy">MVP</span>' : ''}
                </div>
                <div class="duel-best-kda">${bestA.kills} / ${bestA.deaths} / ${bestA.assists} <small style="color:var(--text-muted); font-weight:500;">(${(((bestA.kills + bestA.assists) / Math.max(1, bestA.deaths)).toFixed(2))} KDA)</small></div>
                <div class="duel-best-sub">${resolveChampName(bestA.champion)} · ${bestA.minutes}m · Daño: ${kNum(bestA.damage || 0)} · ${formatMatchDate(bestA.endTs)}</div>
              </div>
            </div>
          </div>
        ` : '<div class="muted">Sin partidas registradas</div>'}

        <!-- Best B -->
        ${bestB ? `
          <div class="duel-best-card side-b" onclick="window.openMatchModal('${esc(bestB.matchId)}')">
            <div class="duel-best-tag" style="color:var(--gold);">Mejor Partida · ${esc(pB.name)}</div>
            <div class="duel-best-body">
              <div class="duel-best-champ-wrap">
                <img src="${champImg(resolveChampName(bestB.champion))}" alt="" onerror="this.src='logo.jpg'">
              </div>
              <div class="duel-best-info">
                <div class="duel-best-info-head">
                  <span class="feed-badge-result ${bestB.win ? 'win' : 'loss'}">${bestB.win ? 'VICTORIA' : 'DERROTA'}</span>
                  <span class="px-score ${bestB.score >= 8 ? 'px-s-great' : 'px-s-good'}">Score ${bestB.score?.toFixed(1) ?? '—'}</span>
                  ${bestB.mvp ? '<span class="feed-badge-surrender enemy">MVP</span>' : ''}
                </div>
                <div class="duel-best-kda">${bestB.kills} / ${bestB.deaths} / ${bestB.assists} <small style="color:var(--text-muted); font-weight:500;">(${(((bestB.kills + bestB.assists) / Math.max(1, bestB.deaths)).toFixed(2))} KDA)</small></div>
                <div class="duel-best-sub">${resolveChampName(bestB.champion)} · ${bestB.minutes}m · Daño: ${kNum(bestB.damage || 0)} · ${formatMatchDate(bestB.endTs)}</div>
              </div>
            </div>
          </div>
        ` : '<div class="muted">Sin partidas registradas</div>'}
      </div>

      ${worstA && worstB ? `
        <div class="duel-infamy-wall">
          <div class="duel-infamy-header">⚠️ El Muro de la Infamia (Cuando intentaron carrilear y trollearon)</div>
          <div class="duel-infamy-grid">
            <div class="duel-infamy-item">
              <strong>${esc(pA.name)}:</strong> ${resolveChampName(worstA.champion)} con KDA <strong>${worstA.kills}/${worstA.deaths}/${worstA.assists}</strong> (Score: <strong>${worstA.score?.toFixed(1) ?? '—'}</strong>). <em>${worstA.deaths >= 7 ? 'Donó más oro a los rivales que una ONG.' : 'Un performance digno de amnesia voluntaria.'}</em>
            </div>
            <div class="duel-infamy-item">
              <strong>${esc(pB.name)}:</strong> ${resolveChampName(worstB.champion)} con KDA <strong>${worstB.kills}/${worstB.deaths}/${worstB.assists}</strong> (Score: <strong>${worstB.score?.toFixed(1) ?? '—'}</strong>). <em>${worstB.deaths >= 7 ? 'El botón de revivir en fuente casi echa humo.' : 'El equipo todavía está buscando su impacto en el mapa.'}</em>
            </div>
          </div>
        </div>
      ` : ''}
    `;
  }

  // 6. Render Tale of the Tape: 8 Enhanced Metrics
  const avgDeathsA = pA.stats?.avgDeaths ?? 5;
  const avgDeathsB = pB.stats?.avgDeaths ?? 5;
  const dmgA = pA.games?.length ? Math.round(pA.games.reduce((acc, g) => acc + (g.damage || 0), 0) / pA.games.length) : 0;
  const dmgB = pB.games?.length ? Math.round(pB.games.reduce((acc, g) => acc + (g.damage || 0), 0) / pB.games.length) : 0;
  const csMinA = pA.games?.length ? (pA.games.reduce((acc, g) => acc + (g.cs || 0), 0) / Math.max(1, pA.games.reduce((acc, g) => acc + (g.minutes || 1), 0))).toFixed(1) : '—';
  const csMinB = pB.games?.length ? (pB.games.reduce((acc, g) => acc + (g.cs || 0), 0) / Math.max(1, pB.games.reduce((acc, g) => acc + (g.minutes || 1), 0))).toFixed(1) : '—';
  const visA = pA.games?.length ? Math.round(pA.games.reduce((acc, g) => acc + (g.vision || 0), 0) / pA.games.length) : 0;
  const visB = pB.games?.length ? Math.round(pB.games.reduce((acc, g) => acc + (g.vision || 0), 0) / pB.games.length) : 0;

  const metrics = [
    { label: 'Puntuación Promedio OP.GG', valA: pA.stats?.avgScore ?? 0, valB: pB.stats?.avgScore ?? 0, fmt: (v) => v.toFixed(1), higherIsBetter: true },
    { label: 'Tasa de Victorias (% Winrate)', valA: pA.stats?.winrate ?? 0, valB: pB.stats?.winrate ?? 0, fmt: (v) => `${v}%`, higherIsBetter: true },
    { label: 'Promedio KDA', valA: Number(pA.stats?.kda ?? 0), valB: Number(pB.stats?.kda ?? 0), fmt: (v) => v.toFixed(2), higherIsBetter: true },
    { label: 'Muertes por Partida', valA: avgDeathsA, valB: avgDeathsB, fmt: (v) => v.toFixed(1), higherIsBetter: false },
    { label: 'Daño Promedio a Campeones', valA: dmgA, valB: dmgB, fmt: (v) => kNum(v), higherIsBetter: true },
    { label: 'Súbditos por Minuto (CS/min)', valA: Number(csMinA) || 0, valB: Number(csMinB) || 0, fmt: (v) => `${v}/m`, higherIsBetter: true },
    { label: 'Puntuación de Visión', valA: visA, valB: visB, fmt: (v) => v, higherIsBetter: true },
    { label: 'Distinciones MVP de Partida', valA: pA.stats?.mvp ?? 0, valB: pB.stats?.mvp ?? 0, fmt: (v) => `${v} MVP`, higherIsBetter: true },
  ];

  const barsHtml = metrics.map((m) => {
    const isAdvA = m.higherIsBetter ? m.valA > m.valB : m.valA < m.valB;
    const isAdvB = m.higherIsBetter ? m.valB > m.valA : m.valB < m.valA;

    const total = Math.max(0.01, Math.abs(m.valA) + Math.abs(m.valB));
    const pctA = Math.round((Math.max(0, m.valA) / total) * 100);
    const pctB = 100 - pctA;

    return `
      <div class="duel-bar-row">
        <div class="duel-bar-header">
          <span class="val-a">
            ${isAdvA ? '<span class="duel-win-pill a">MEJOR</span>' : ''}
            <strong>${m.fmt(m.valA)}</strong>
          </span>
          <span style="color:var(--text-muted); font-size:12.5px;">${m.label}</span>
          <span class="val-b">
            <strong>${m.fmt(m.valB)}</strong>
            ${isAdvB ? '<span class="duel-win-pill b">MEJOR</span>' : ''}
          </span>
        </div>
        <div class="duel-bar-track">
          <div class="duel-bar-left" style="width:${pctA}%"></div>
          <div class="duel-bar-right" style="width:${pctB}%"></div>
        </div>
      </div>
    `;
  }).join('');

  const barsContainer = $('#duel-comparison-bars');
  if (barsContainer) barsContainer.innerHTML = barsHtml;

  // 7. Sinergia y Cara a Cara Directo en Partidas del Grupo
  const h2hContainer = $('#duel-head-to-head');
  if (h2hContainer) {
    const sharedGames = (board?.groupGames ?? []).filter((g) =>
      g.players?.some((p) => p.puuid === puuidA) && g.players?.some((p) => p.puuid === puuidB)
    );
    const totalShared = sharedGames.length;
    const winsShared = sharedGames.filter((g) => g.win).length;
    const wrShared = totalShared > 0 ? Math.round((winsShared * 100) / totalShared) : 0;

    let higherA = 0;
    let higherB = 0;
    let mvpA = 0;
    let mvpB = 0;
    let mochilaA = 0;
    let mochilaB = 0;

    for (const g of sharedGames) {
      const plA = g.players?.find((p) => p.puuid === puuidA);
      const plB = g.players?.find((p) => p.puuid === puuidB);
      if ((plA?.score ?? 0) > (plB?.score ?? 0)) higherA++;
      else if ((plB?.score ?? 0) > (plA?.score ?? 0)) higherB++;

      if (plA?.mvp) mvpA++;
      if (plB?.mvp) mvpB++;
      if (plA?.mochila) mochilaA++;
      if (plB?.mochila) mochilaB++;
    }

    const recentSharedGames = sharedGames.slice(0, 3);
    const recentSharedHtml = recentSharedGames.map((g) => {
      const plA = g.players?.find((p) => p.puuid === puuidA);
      const plB = g.players?.find((p) => p.puuid === puuidB);
      return `
        <div class="duel-shared-row" onclick="window.openMatchModal('${esc(g.matchId)}')">
          <div class="duel-shared-row-left">
            <span class="feed-badge-result ${g.win ? 'win' : 'loss'}">${g.win ? 'VICTORIA' : 'DERROTA'}</span>
            <div class="duel-shared-user">
              <img src="${champImg(resolveChampName(plA?.champion))}" alt="" onerror="this.src='logo.jpg'">
              <span><strong>${esc(pA.name)}</strong> (${plA?.kills ?? 0}/${plA?.deaths ?? 0}/${plA?.assists ?? 0})</span>
            </div>
            <span class="duel-shared-vs-tag">DÚO</span>
            <div class="duel-shared-user">
              <img src="${champImg(resolveChampName(plB?.champion))}" alt="" onerror="this.src='logo.jpg'">
              <span><strong>${esc(pB.name)}</strong> (${plB?.kills ?? 0}/${plB?.deaths ?? 0}/${plB?.assists ?? 0})</span>
            </div>
          </div>
          <span class="duel-shared-view-btn">Ver 5v5 completo →</span>
        </div>
      `;
    }).join('');

    h2hContainer.innerHTML = `
      <div class="duel-h2h-card">
        <div class="duel-h2h-header">
          <span>🤝 Sinergia y Guerra Civil: Partidas Juntos en el Grupo</span>
        </div>
        <div class="duel-h2h-banner">
          <div>
            <div class="duel-h2h-pill">
              ${totalShared > 0
                ? `🛡️ <strong>${esc(pA.name)}</strong> y <strong>${esc(pB.name)}</strong> han jugado <strong>${totalShared}</strong> partidas juntos en el equipo del grupo.`
                : `🛡️ Aún no registran partidas juntos en el mismo equipo.`}
            </div>
            ${totalShared > 0 ? `
              <div class="muted sub" style="margin-top:6px; line-height:1.5;">
                ⚔️ <strong>¿Quién carrió a quién?</strong> ${esc(pA.name)} sacó mayor score en <strong>${higherA}</strong> partidas, mientras que ${esc(pB.name)} superó en <strong>${higherB}</strong> partidas.<br>
                👑 <strong>MVPs en común:</strong> ${esc(pA.name)} (${mvpA}) · ${esc(pB.name)} (${mvpB}) | 🎒 <strong>Mochilas:</strong> ${esc(pA.name)} (${mochilaA}) · ${esc(pB.name)} (${mochilaB})
              </div>
            ` : ''}
          </div>
          ${totalShared > 0 ? `
            <div style="text-align:right;">
              <span class="duel-h2h-wr">${wrShared}%</span>
              <div class="muted sub">Winrate como Dúo</div>
            </div>
          ` : ''}
        </div>
        ${totalShared > 0 ? `
          <div style="margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.06);">
            <div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:4px;">Últimas partidas compartidas:</div>
            ${recentSharedHtml}
          </div>
        ` : ''}
      </div>
    `;
  }
}

$('#duel-select-a')?.addEventListener('change', () => updateDuelComparison(false));
$('#duel-select-b')?.addEventListener('change', () => updateDuelComparison(false));

// ---------- Synergy & Duos ----------
let currentSynergyFilter = 'all';
let currentSynergyQueueFilter = 'all';
let currentSynergyPlayerFilter = 'all';
let currentSynergyDuoFilter = null;
let currentSynergyPage = 1;
const SYNERGY_MATCHES_PER_PAGE = 10;

const DUO_PROFILES = {
  'ChubbyKop+Yúta Okkotsu': {
    title: 'El Matrimonio Tóxico',
    subtitle: 'La Pareja Más Veterana del Servidor',
    quote: '47 partidas aguantándose el tilt ajeno por puro compromiso legal. Tienen más reclamos maritales que victorias, pero el divorcio competitivo les saldría demasiado caro.',
  },
  'Panda+Yúta Okkotsu': {
    title: 'La Grúa de Carga Pesada',
    subtitle: 'Sinergia de Nivel Competitivo',
    quote: 'Panda pone las manos mecánicas y Yúta aprieta los dientes hasta reventar el nexo rival. Cuando los dos están conectados, el lobby tiembla antes del minuto 20.',
  },
  'ChubbyKop+Panda': {
    title: 'Doble Filo Psiquiátrico',
    subtitle: 'Puro Caos y Agresividad',
    quote: '65% de efectividad conseguido a base de puro desorden. O salen 15/0 entre ambos destrozando la Grieta o se insultan por llamada hasta que alguien tira surrender.',
  },
  'ChubbyKop+Ryômen Sukuna': {
    title: 'La Ruleta Rusa',
    subtitle: '50% Cara, 50% Cruz',
    quote: '50% de probabilidad de ganar, 50% de perder, y 100% de certeza de que el resto del equipo escribirá "report jungle and adc" en el chat general al minuto 15.',
  },
  'Ryômen Sukuna+Yúta Okkotsu': {
    title: 'Pacto de Silencio',
    subtitle: 'Convivencia Pacífica sin Discord',
    quote: 'Juegan como dos extraños en un ascensor averiado: cero comunicación, 50% de efectividad y un constante terror a ver quién es el primero en regalar el barón.',
  },
  'Panda+Satoru Gojo': {
    title: 'Misión Humanitaria',
    subtitle: 'El Milagro de Carrear al Pasajero',
    quote: 'Panda cargando a Gojo con una paciencia digna de un monje tibetano. Gojo presiona la R con Malzahar, sonríe a la cámara y reclama sus 20 LP como si hubiera trabajado.',
  },
  'ChubbyKop+Satoru Gojo': {
    title: 'Accidente Afortunado',
    subtitle: 'Efectividad Inexplicable',
    quote: 'Nadie en la faz del servidor, incluyendo a los dos implicados, comprende cómo ganan el 67% de sus juegos. La suerte divina compensa la falta de mecánicas.',
  },
  'Ryômen Sukuna+Satoru Gojo': {
    title: 'El Circo Maldito',
    subtitle: 'Especialistas en Desorientar al Rival',
    quote: 'El caos biomecánico que generan es tan bizarro que desorienta al rival por completo. Ganar 75% trolleando en la Grieta es su verdadera obra de arte.',
  },
  'Panda+Ryômen Sukuna': {
    title: 'La Furia Oculta',
    subtitle: 'El Dúo Más Letal por Ratio',
    quote: '83% de winrate demoledor. Panda ordena las jugadas y Sukuna entra a morder a lo que se mueva. Juegan pocas partidas juntos para no aburrirse de ganar.',
  },
  'Satoru Gojo+Yúta Okkotsu': {
    title: 'Paseo en Primera Clase',
    subtitle: 'El Chofer y el Turista',
    quote: 'Yúta maneja el autobús a 120 km/h esquivando el tráfico y Gojo va en el asiento trasero disfrutando el paisaje con un 83% de efectividad sin despeinarse.',
  },
};

function getDuoProfile(n1, n2) {
  const k1 = `${n1}+${n2}`;
  const k2 = `${n2}+${n1}`;
  return DUO_PROFILES[k1] || DUO_PROFILES[k2] || {
    title: 'Dúo Dinámico',
    subtitle: 'Química en Desarrollo',
    quote: 'Comparten la Grieta con la firme esperanza de no hacerse descender de división el uno al otro.',
  };
}

const PLAYER_SYNERGY_PROFILES = {
  'Panda': {
    role: 'El Bombero Oficial',
    quote: 'Llega al lobby a apagar los incendios que provocan sus amigos. Cuando Panda entra al equipo, todos respiran aliviados sabiendo que hay al menos un adulto responsable con manos en la partida.',
  },
  'Satoru Gojo': {
    role: 'El Pasajero VIP con Suerte',
    quote: 'Tiene 64% de winrate grupal a pesar de acumular 5 mochilas en 11 juegos. Nadie sabe cómo lo hace, pero su sola presencia en el equipo atrae victorias por combustión espontánea del rival.',
  },
  'Yúta Okkotsu': {
    role: 'La Mula de Carga Hextech',
    quote: '26 Carries en 54 partidas juntos. Su columna vertebral está completamente pulverizada de sostener al resto del grupo. Si Yúta tiltea un segundo, el equipo colapsa como castillo de naipes.',
  },
  'ChubbyKop': {
    role: 'La Montaña Rusa Emocional',
    quote: '16 Carries y 24 Mochilas en 51 partidas. Es un volado absoluto de casino: en una partida te da una clase magistral de posicionamiento y a la siguiente donará su cuerpo a la ciencia.',
  },
  'Ryômen Sukuna': {
    role: 'El Espectador Neutro',
    quote: '50% exacto de victorias. Neutralidad zen perfecta: el juego fluye a su alrededor sin alterar las leyes del universo. No estorba mucho, pero tampoco esperes que te salve la vida.',
  },
  'Toji Fushiguro': {
    role: 'El Lobo Solitario',
    quote: '0 partidas en grupo registradas. Prefiere inmolarse en SoloQ antes que escuchar los gritos histéricos en la llamada de Discord. La verdadera paz mental de un asesino a sueldo.',
  },
};

function renderSynergy() {
  const s = board?.groupSummary;
  if (!s) return;

  const allGames = board?.groupGames ?? [];
  const allPlayers = board?.players ?? [];

  // 1. KPI Totals Banner
  const totalsBanner = $('#synergy-totals-banner');
  if (totalsBanner) {
    const totalGames = s.games || 0;
    const totalWins = s.wins || 0;
    const groupWr = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0;
    
    // Top Duo by WR (min 6 games)
    const validDuos = (s.duos ?? []).filter((d) => d.games >= 6);
    const topDuo = [...validDuos].sort((a, b) => b.winrate - a.winrate || b.games - a.games)[0] || s.duos?.[0];
    
    // Most Played Duo
    const mostPlayedDuo = [...(s.duos ?? [])].sort((a, b) => b.games - a.games)[0];
    
    // Top Carry in group
    const topCarry = [...(s.players ?? [])].sort((a, b) => b.carries - a.carries)[0];

    totalsBanner.innerHTML = `
      <div class="synergy-stat-box">
        <span class="synergy-stat-num">${totalGames}</span>
        <span class="synergy-stat-label">Partidas en Grupo</span>
      </div>
      <div class="synergy-stat-box">
        <span class="synergy-stat-num" style="color:var(--cyan);">${totalWins} <span style="font-size:16px;color:var(--text-secondary);">(${groupWr}%)</span></span>
        <span class="synergy-stat-label">Victorias Grupales</span>
      </div>
      <div class="synergy-stat-box">
        <span class="synergy-stat-num" style="color:var(--gold-bright); font-size:19px;">${topDuo ? esc(topDuo.names.join(' + ')) : '—'}</span>
        <span class="synergy-stat-label">Dúo de Oro · ${topDuo ? `${topDuo.winrate}% WR` : ''}</span>
      </div>
      <div class="synergy-stat-box">
        <span class="synergy-stat-num" style="color:var(--danger); font-size:19px;">${mostPlayedDuo ? esc(mostPlayedDuo.names.join(' + ')) : '—'}</span>
        <span class="synergy-stat-label">Dúo Más Frecuente · ${mostPlayedDuo ? `${mostPlayedDuo.games} games` : ''}</span>
      </div>
      <div class="synergy-stat-box">
        <span class="synergy-stat-num" style="color:var(--gold); font-size:19px;">${topCarry ? esc(topCarry.name) : '—'}</span>
        <span class="synergy-stat-label">Máximo Carreador · ${topCarry ? `${topCarry.carries} Carries` : ''}</span>
      </div>
    `;
  }

  // 2. Duos Grid
  const duosList = $('#synergy-duos-list');
  if (duosList) {
    const duos = s.duos ?? [];
    duosList.innerHTML = duos.map((d) => {
      const [n1, n2] = d.names;
      const p1 = allPlayers.find((p) => p.name === n1);
      const p2 = allPlayers.find((p) => p.name === n2);
      const prof = getDuoProfile(n1, n2);

      // Find top champs together
      const sharedGames = allGames.filter((g) => {
        const has1 = g.players.some((p) => p.name === n1);
        const has2 = g.players.some((p) => p.name === n2);
        return has1 && has2;
      });

      const champs1 = {};
      const champs2 = {};
      let totalScore = 0;
      sharedGames.forEach((g) => {
        const pl1 = g.players.find((p) => p.name === n1);
        const pl2 = g.players.find((p) => p.name === n2);
        if (pl1) {
          champs1[pl1.champion] = (champs1[pl1.champion] || 0) + 1;
          totalScore += pl1.score;
        }
        if (pl2) {
          champs2[pl2.champion] = (champs2[pl2.champion] || 0) + 1;
          totalScore += pl2.score;
        }
      });

      const topC1 = Object.entries(champs1).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      const topC2 = Object.entries(champs2).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      const avgScore = sharedGames.length > 0 ? (totalScore / (sharedGames.length * 2)).toFixed(1) : '—';

      const wrClass = d.winrate >= 65 ? 'high' : d.winrate >= 50 ? 'mid' : 'low';
      const isHighWr = d.winrate >= 65;

      return `
        <div class="synergy-duo-card ${isHighWr ? 'high-wr' : ''}" data-duo="${esc(n1)}+${esc(n2)}">
          <div>
            <div class="duo-card-header">
              <div class="duo-card-avatars">
                <img class="duo-avatar tier-${p1?.soloTier ?? 'unranked'}" src="${p1 ? iconImg(p1.profileIconId) : 'logo.jpg'}" alt="${esc(n1)}" onerror="this.src='logo.jpg'">
                <img class="duo-avatar tier-${p2?.soloTier ?? 'unranked'}" src="${p2 ? iconImg(p2.profileIconId) : 'logo.jpg'}" alt="${esc(n2)}" onerror="this.src='logo.jpg'">
              </div>
              <div class="duo-header-info">
                <div class="duo-names-title">${esc(n1)} + ${esc(n2)}</div>
                <span class="duo-badge-tag">${esc(prof.title)}</span>
              </div>
            </div>

            <div class="duo-card-stats">
              <div class="duo-stat-row">
                <span class="muted sub" style="font-weight:600;">Efectividad Grupal</span>
                <span class="duo-winrate-pill ${wrClass}">${d.winrate}% WR</span>
              </div>
              <div class="duo-bar-track">
                <div class="duo-bar-fill ${wrClass}" style="width: ${d.winrate}%"></div>
              </div>
              <div class="duo-stat-row" style="font-size:12px;">
                <span class="muted">${d.games} partidas (${d.wins}W - ${d.games - d.wins}L)</span>
                <span style="color:var(--gold); font-weight:700;">Score prom: ${avgScore}</span>
              </div>
              ${topC1 && topC2 ? `
                <div class="duo-top-champs">
                  <span class="muted" style="font-size:11px;">Combo habitual:</span>
                  <img class="duo-champ-img" src="${champImg(topC1)}" alt="${esc(topC1)}" title="${esc(topC1)}">
                  <span style="font-size:11px; font-weight:600;">${esc(topC1)}</span>
                  <span class="muted">+</span>
                  <img class="duo-champ-img" src="${champImg(topC2)}" alt="${esc(topC2)}" title="${esc(topC2)}">
                  <span style="font-size:11px; font-weight:600;">${esc(topC2)}</span>
                </div>
              ` : ''}
            </div>

            <div class="duo-card-quote">
              "${esc(prof.quote)}"
            </div>
          </div>

          <button class="duo-card-action-btn" data-duo-action="${esc(n1)}|${esc(n2)}">
            ⚔️ Ver Partidas de este Dúo (${d.games})
          </button>
        </div>
      `;
    }).join('') || '<div class="muted">No hay duos suficientes aún.</div>';

    // Click handler for viewing duo matches
    duosList.querySelectorAll('[data-duo-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [n1, n2] = btn.dataset.duoAction.split('|');
        currentSynergyDuoFilter = [n1, n2];
        currentSynergyPlayerFilter = 'all';
        currentSynergyQueueFilter = 'all';
        currentSynergyPage = 1;
        
        // Reset queue filter buttons
        const sFilterContainer = $('#synergy-matches-queue-filter');
        if (sFilterContainer) {
          sFilterContainer.querySelectorAll('button').forEach((b) => {
            b.classList.toggle('active', b.dataset.sfilter === 'all');
          });
        }
        const filterSelect = $('#synergy-player-filter');
        if (filterSelect) filterSelect.value = 'all';

        renderSynergyGames();
        
        // Scroll to games section smoothly
        const gamesSec = $('#synergy-games-section');
        if (gamesSec) {
          gamesSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  // 3. Players Grid (Individual Impact)
  const playersList = $('#synergy-players-list');
  if (playersList) {
    const groupPlayersMap = new Map((s.players ?? []).map((p) => [p.name, p]));
    
    // Sort players: group players first by games, then non-group players
    const displayPlayers = [...allPlayers].sort((a, b) => {
      const ga = groupPlayersMap.get(a.name)?.games ?? 0;
      const gb = groupPlayersMap.get(b.name)?.games ?? 0;
      return gb - ga;
    });

    playersList.innerHTML = displayPlayers.map((p) => {
      const gp = groupPlayersMap.get(p.name);
      const prof = PLAYER_SYNERGY_PROFILES[p.name] || {
        role: 'Invocador de la Grieta',
        quote: 'Aporta su granito de arena al ambiente grupal, para bien o para mal.',
      };

      const games = gp?.games ?? 0;
      const wins = gp?.wins ?? 0;
      const winrate = gp?.winrate ?? 0;
      const carries = gp?.carries ?? 0;
      const mochilas = gp?.last ?? 0;
      const score = gp?.score ?? 0;
      const totalBadges = carries + mochilas;
      const carryRatio = totalBadges > 0 ? Math.round((carries / totalBadges) * 100) : 50;

      return `
        <div class="synergy-player-card">
          <div>
            <div class="synergy-player-header">
              <img class="synergy-player-avatar tier-${p.soloTier ?? 'unranked'}" src="${iconImg(p.profileIconId)}" alt="${esc(p.name)}" onerror="this.src='logo.jpg'">
              <div>
                <div class="synergy-player-name">${esc(p.name)}</div>
                <div class="synergy-player-role">🎭 ${esc(prof.role)}</div>
              </div>
            </div>

            <div class="synergy-player-stats-row">
              <div>
                <div class="synergy-pstat-val" style="color:var(--text-primary);">${games}</div>
                <div class="synergy-pstat-lbl">Partidas</div>
              </div>
              <div>
                <div class="synergy-pstat-val" style="color:${winrate >= 50 ? 'var(--cyan)' : 'var(--danger)'};">${winrate}%</div>
                <div class="synergy-pstat-lbl">WR Grupo</div>
              </div>
              <div>
                <div class="synergy-pstat-val" style="color:var(--gold-bright);">${score > 0 ? score.toFixed(1) : '—'}</div>
                <div class="synergy-pstat-lbl">Score Prom</div>
              </div>
            </div>

            ${games > 0 ? `
              <div class="synergy-carries-ratio-wrap">
                <div class="synergy-carries-labels">
                  <span style="color:var(--gold);">👑 ${carries} Carries</span>
                  <span style="color:var(--danger);">🎒 ${mochilas} Mochilas</span>
                </div>
                <div class="synergy-carries-bar-track" title="Ratio: ${carryRatio}% Carries vs ${100 - carryRatio}% Mochilas">
                  <div class="synergy-carries-bar-fill" style="width: ${carryRatio}%"></div>
                </div>
              </div>
            ` : ''}

            <div class="synergy-player-quote">
              "${esc(prof.quote)}"
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 4. Setup Queue Filter Buttons (Identical to Inicio)
  const sFilterContainer = $('#synergy-matches-queue-filter');
  if (sFilterContainer && !sFilterContainer._bound) {
    sFilterContainer._bound = true;
    sFilterContainer.querySelectorAll('button').forEach((btn) => {
      btn.onclick = () => {
        sFilterContainer.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentSynergyQueueFilter = btn.dataset.sfilter;
        currentSynergyDuoFilter = null;
        currentSynergyPage = 1;
        renderSynergyGames();
      };
    });
  }

  // 5. Setup Player Filter Dropdown
  const filterSelect = $('#synergy-player-filter');
  if (filterSelect && filterSelect.options.length <= 1) {
    const existing = new Set();
    allPlayers.forEach((p) => {
      if (!existing.has(p.name)) {
        existing.add(p.name);
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        filterSelect.appendChild(opt);
      }
    });

    filterSelect.addEventListener('change', () => {
      currentSynergyPlayerFilter = filterSelect.value;
      currentSynergyDuoFilter = null;
      currentSynergyPage = 1;
      renderSynergyGames();
    });
  }

  // 6. Render Group Games List
  renderSynergyGames();

  // 7. Bind Submenu Filter Pills (without icons)
  const filterBar = $('#synergy-filter-bar');
  if (filterBar) {
    const pills = filterBar.querySelectorAll('.synergy-filter-pill');
    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        pills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        const filter = pill.dataset.filter;
        currentSynergyFilter = filter;

        const duosSec = $('#synergy-duos-section');
        const playersSec = $('#synergy-players-section');
        const gamesSec = $('#synergy-games-section');

        if (filter === 'all') {
          if (duosSec) duosSec.style.display = 'block';
          if (playersSec) playersSec.style.display = 'block';
          if (gamesSec) gamesSec.style.display = 'block';
        } else if (filter === 'duos') {
          if (duosSec) duosSec.style.display = 'block';
          if (playersSec) playersSec.style.display = 'none';
          if (gamesSec) gamesSec.style.display = 'none';
        } else if (filter === 'players') {
          if (duosSec) duosSec.style.display = 'none';
          if (playersSec) playersSec.style.display = 'block';
          if (gamesSec) gamesSec.style.display = 'none';
        } else if (filter === 'games') {
          if (duosSec) duosSec.style.display = 'none';
          if (playersSec) playersSec.style.display = 'none';
          if (gamesSec) gamesSec.style.display = 'block';
        }
      });
    });
  }
}

function renderSynergyGames() {
  const feed = $('#synergy-games-list');
  if (!feed) return;

  const allGames = board?.groupGames ?? [];
  const allPlayersMap = new Map((board?.players ?? []).map((p) => [p.name, p]));
  let filtered = allGames;

  if (currentSynergyDuoFilter && currentSynergyDuoFilter.length === 2) {
    const [n1, n2] = currentSynergyDuoFilter;
    filtered = filtered.filter((g) => {
      const has1 = g.players.some((p) => p.name === n1);
      const has2 = g.players.some((p) => p.name === n2);
      return has1 && has2;
    });
  } else if (currentSynergyPlayerFilter !== 'all') {
    filtered = filtered.filter((g) => g.players.some((p) => p.name === currentSynergyPlayerFilter));
  }

  if (currentSynergyQueueFilter === 'solo') {
    filtered = filtered.filter((g) => g.queueId === 420);
  } else if (currentSynergyQueueFilter === 'flex') {
    filtered = filtered.filter((g) => g.queueId === 440);
  } else if (currentSynergyQueueFilter === 'win') {
    filtered = filtered.filter((g) => g.win);
  } else if (currentSynergyQueueFilter === 'loss') {
    filtered = filtered.filter((g) => !g.win);
  } else if (currentSynergyQueueFilter === 'squad') {
    filtered = filtered.filter((g) => g.players.length >= 5);
  }

  const totalMatches = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalMatches / SYNERGY_MATCHES_PER_PAGE));
  if (currentSynergyPage > totalPages) currentSynergyPage = totalPages;
  if (currentSynergyPage < 1) currentSynergyPage = 1;

  const startIdx = (currentSynergyPage - 1) * SYNERGY_MATCHES_PER_PAGE;
  const endIdx = startIdx + SYNERGY_MATCHES_PER_PAGE;
  const pagedMatches = filtered.slice(startIdx, endIdx);

  if (!pagedMatches.length) {
    feed.innerHTML = `
      <div class="empty-state" style="padding:40px 20px; text-align:center;">
        <span class="empty-icon" style="font-size:36px; display:block; margin-bottom:10px;">👥</span>
        <h4 style="margin:0 0 6px; font-family:var(--font-heading); color:var(--text-primary);">Sin partidas en grupo</h4>
        <p class="muted sub" style="margin:0;">No se encontraron partidas para el filtro seleccionado.</p>
      </div>
    `;
    renderSynergyPagination(0, 0, 0, 0);
    return;
  }

  feed.innerHTML = pagedMatches.map((m) => {
    const isRemake = Boolean(m.isRemake || (m.minutes && m.minutes < 5));
    const isSurrender = Boolean(!isRemake && (m.isSurrender || (m.minutes && m.minutes >= 5 && m.minutes <= 21)));
    const isWin = m.win;
    const qName = m.queueId === 420 ? 'Solo/Duo' : m.queueId === 440 ? 'Ranked Flex' : (m.queue || 'Ranked');
    const hasMultipleFriends = m.players.length > 1;
    const squadTag = m.players.length >= 5 ? '👑 Squad 5v5 Completo' : (hasMultipleFriends ? `${m.players.length} Amigos juntos` : '');

    return `
      <article class="overview-match-card ${isRemake ? 'remake' : isWin ? 'win' : 'loss'}" data-match-id="${esc(m.matchId)}">
        <div class="overview-match-header">
          <div class="feed-header-left">
            <span class="feed-badge-result ${isRemake ? 'remake' : isWin ? 'win' : 'loss'}">
              ${isRemake ? 'REMAKE' : isWin ? 'VICTORIA' : 'DERROTA'}
            </span>
            ${isSurrender && !isRemake ? `
              <span class="feed-badge-surrender ${isWin ? 'enemy' : 'team'}" title="${isWin ? 'Victoria por rendición del rival' : 'Derrota por rendición'}">
                Surrender
              </span>
            ` : ''}
            <span class="feed-badge-queue">${qName}</span>
            <span class="feed-badge-time">${m.minutes}m</span>
            <span class="feed-badge-date">${formatMatchDate(m.endTs)}</span>
            ${squadTag ? `<span class="feed-badge-duo">${esc(squadTag)}</span>` : ''}
          </div>
          <div class="feed-header-right">
            <span class="feed-btn-view-match">Ver 5v5 completo →</span>
          </div>
        </div>

        <div class="overview-match-participants">
          ${m.players.map((f) => {
            const pObj = allPlayersMap.get(f.name);
            const playerGame = pObj?.games?.find((gm) => gm.matchId === m.matchId);
            const champName = resolveChampName(f.champion);
            const kdaRatio = ((f.kills + f.assists) / Math.max(1, f.deaths)).toFixed(2);
            const kpPct = Math.round((f.m?.kp || 0) * 100);
            const dmgSharePct = Math.round((f.m?.damageShare || 0) * 100);
            const cs = playerGame && typeof playerGame.cs === 'number' ? playerGame.cs : Math.round((f.m?.csPerMin || 0) * m.minutes);
            const csPerMin = (cs / Math.max(1, m.minutes)).toFixed(1);
            const opp = playerGame?.opp;
            const dmgVal = f.m?.damage || 0;
            const goldVal = f.m?.gold || 0;
            const visionVal = f.m?.vision || 0;

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
                      ${f.mvp ? `<span class="overview-honor-tag mvp" title="MVP de la Partida">MVP</span>` : ''}
                      ${f.ace ? `<span class="overview-honor-tag ace" title="ACE de la Partida">ACE</span>` : ''}
                      ${f.mochila ? `<span class="overview-honor-tag mochila" title="Insignia Mochila">🎒 MOCHILA</span>` : ''}
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
                    <span class="overview-score-tag opgg-source" title="Calificación oficial de OP.GG (1 a 10)">
                      <span class="score-lbl">OP.GG</span>
                      <span class="score-val">${f.score?.toFixed(1) || '—'}</span>
                    </span>
                    <span class="overview-place-tag ${f.place === 1 ? 'top-1' : f.place <= 3 ? 'top-3' : 'mid'}" title="Posición ${f.place || 5} de 10 jugadores en la partida">
                      ${f.place ? `${f.place}/10` : '—'}
                    </span>
                  </div>
                </div>

                <!-- Lane Opponent Matchup -->
                <div class="overview-rival-box">
                  ${opp ? `
                    <div class="overview-rival-title">Rival en Línea:</div>
                    <div class="overview-rival-content">
                      <img class="overview-rival-champ-img" src="${champImg(opp.champion)}" alt="${esc(resolveChampName(opp.champion))}" title="${esc(resolveChampName(opp.champion))}" onerror="this.src='logo.jpg'">
                      <div class="overview-rival-info">
                        <span class="overview-rival-status ${f.score >= (opp.score || 0) ? 'win' : 'loss'}">
                          ${f.score >= (opp.score || 0) ? 'Ganó vs' : 'Perdió vs'}
                        </span>
                        <span class="overview-rival-scores">
                          Score: ${f.score?.toFixed(1) || '—'} vs ${opp.score?.toFixed(1) || '—'}
                        </span>
                      </div>
                    </div>
                  ` : `
                    <div class="overview-rival-title">Rival en Línea:</div>
                    <div class="overview-rival-empty muted sub">Sin rival directo</div>
                  `}
                </div>

                <!-- Mobile Toggle Button -->
                <button class="overview-mobile-toggle-btn" type="button" aria-expanded="false" title="Mostrar u ocultar estadísticas de combate">
                  <span class="toggle-text">Estadísticas de Combate</span>
                  <span class="toggle-icon">▾</span>
                </button>

                <!-- Detailed Combat & Economy Stats -->
                <div class="overview-combat-stats">
                  <div class="overview-stat-item" title="Daño infligido a campeones">
                    <span class="stat-lbl">Daño:</span>
                    <strong>${(dmgVal / 1000).toFixed(1)}k</strong>
                    <span class="stat-sub">(${dmgSharePct}%)</span>
                  </div>
                  <div class="overview-stat-item" title="Súbditos y monstruos asesinados">
                    <span class="stat-lbl">CS:</span>
                    <strong>${cs}</strong>
                    <span class="stat-sub">(${csPerMin}/m)</span>
                  </div>
                  <div class="overview-stat-item" title="Oro total acumulado">
                    <span class="stat-lbl">Oro:</span>
                    <strong>${(goldVal / 1000).toFixed(1)}k</strong>
                  </div>
                  <div class="overview-stat-item" title="Puntuación de visión">
                    <span class="stat-lbl">Visión:</span>
                    <strong>${visionVal || 0}</strong>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </article>
    `;
  }).join('');

  // Render Pagination
  renderSynergyPagination(totalPages, totalMatches, startIdx, endIdx);

  // Mobile expandable stats toggle
  feed.querySelectorAll('.overview-mobile-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
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
}

function renderSynergyPagination(totalPages, totalMatches, startIdx, endIdx) {
  const container = $('#synergy-pagination');
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = `
      <div class="matches-pagination-info">
        Mostrando todas las <strong>${totalMatches}</strong> partidas en grupo
      </div>
    `;
    return;
  }

  const pages = getPaginationPages(currentSynergyPage, totalPages);
  const pageBtnsHtml = pages.map((p) => {
    if (p === '...') {
      return '<span style="color:var(--text-secondary); padding:0 4px; font-weight:700;">…</span>';
    }
    return `<button class="pagination-btn ${p === currentSynergyPage ? 'active' : ''}" data-spage="${p}">${p}</button>`;
  }).join('');

  container.innerHTML = `
    <div class="matches-pagination-info">
      Página <strong>${currentSynergyPage}</strong> de <strong>${totalPages}</strong> &middot; Mostrando <strong>${startIdx + 1}–${Math.min(endIdx, totalMatches)}</strong> de <strong>${totalMatches}</strong> partidas en grupo
    </div>
    <div class="matches-pagination-controls">
      <button class="pagination-btn" id="prev-synergy-page" ${currentSynergyPage === 1 ? 'disabled' : ''}>
        Anterior
      </button>
      <div class="pagination-pages">
        ${pageBtnsHtml}
      </div>
      <button class="pagination-btn" id="next-synergy-page" ${currentSynergyPage === totalPages ? 'disabled' : ''}>
        Siguiente
      </button>
    </div>
  `;

  // Bind pagination events
  $('#prev-synergy-page')?.addEventListener('click', () => {
    if (currentSynergyPage > 1) {
      currentSynergyPage--;
      renderSynergyGames();
      $('#synergy-games-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  $('#next-synergy-page')?.addEventListener('click', () => {
    if (currentSynergyPage < totalPages) {
      currentSynergyPage++;
      renderSynergyGames();
      $('#synergy-games-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  container.querySelectorAll('button[data-spage]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pageNum = parseInt(btn.dataset.spage, 10);
      if (!isNaN(pageNum) && pageNum !== currentSynergyPage) {
        currentSynergyPage = pageNum;
        renderSynergyGames();
        $('#synergy-games-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// ---------- Apodos & Roasts & Premios del Año ----------
function renderApodos() {
  if (plus) plus.renderRoasts();
  renderApodosSummary();
  renderAwards();
  setupApodosFilterBar();
}

function renderApodosSummary() {
  const container = $('#apodos-totals-banner');
  if (!container || !board?.players) return;

  const ps = board.players;
  const totalRoasts = ps.filter((p) => p.roast || p.nickname).length;

  const allRoasts = ps.filter((p) => p.roast).map((p) => p.roast);
  const worstScore = allRoasts.length ? Math.min(...allRoasts.map((r) => r.score)) : 0.3;

  let maxDeaths = 12;
  ps.forEach((p) => {
    (p.games || []).forEach((g) => {
      if (g.deaths && g.deaths > maxDeaths) maxDeaths = g.deaths;
    });
  });

  let maxGoldDiff = 7400;
  ps.forEach((p) => {
    (p.games || []).forEach((g) => {
      if (g.opp && g.gold) {
        const diff = g.opp.gold - g.gold;
        if (diff > maxGoldDiff) maxGoldDiff = diff;
      }
    });
  });

  container.innerHTML = `
    <div class="apodos-stat-box">
      <span class="apodos-stat-num">${totalRoasts}</span>
      <span class="apodos-stat-label">Jugadores Expuestos</span>
    </div>
    <div class="apodos-stat-box">
      <span class="apodos-stat-num">${worstScore.toFixed(1)}</span>
      <span class="apodos-stat-label">Peor Score OP.GG (Histórico)</span>
    </div>
    <div class="apodos-stat-box">
      <span class="apodos-stat-num">${maxDeaths}</span>
      <span class="apodos-stat-label">Récord de Muertes en 1 Partida</span>
    </div>
    <div class="apodos-stat-box">
      <span class="apodos-stat-num">-${Math.round(maxGoldDiff / 100) / 10}k</span>
      <span class="apodos-stat-label">Mayor Donación de Oro al Rival</span>
    </div>
  `;
}

function renderAwards() {
  const container = $('#apodos-awards-grid');
  if (!container || !board?.players) return;

  const ps = board.players;
  if (!ps.length) return;

  // 1. El Ataúd de Oro (Mayor Donante de Sangre)
  const deathNominees = [...ps].sort((a, b) => b.stats.avgDeaths - a.stats.avgDeaths);
  const deathWinner = deathNominees[0];
  const deathWorst = deathWinner.roast?.deaths || 12;

  // 2. La Mochila de Titanio (El Pasajero VIP)
  const mochilaNominees = [...ps].sort((a, b) => (b.stats.mochila || 0) - (a.stats.mochila || 0) || a.stats.avgScore - b.stats.avgScore);
  const mochilaWinner = mochilaNominees[0];

  // 3. La Fundación Caritativa (Patrocinador Oficial del Rival)
  const goldNominees = [...ps].map((p) => {
    const laned = (p.games || []).filter((g) => g.opp);
    const avgDeficit = laned.length ? laned.reduce((acc, g) => acc + (g.opp.gold - g.gold), 0) / laned.length : 0;
    return { p, avgDeficit };
  }).sort((a, b) => b.avgDeficit - a.avgDeficit);
  const goldWinner = goldNominees[0];

  // 4. El Murciélago Ciego (Premio Helen Keller)
  const visNominees = [...ps].map((p) => {
    const games = p.games || [];
    const avgVis = games.length ? games.reduce((acc, g) => acc + (g.vision || 0) / Math.max(1, g.minutes), 0) / games.length : 1;
    return { p, avgVis };
  }).sort((a, b) => a.avgVis - b.avgVis);
  const visWinner = visNominees[0];

  // 5. El Granjero del Apocalipsis (El Ausente de Teamfights)
  const kpNominees = [...ps].map((p) => {
    const games = p.games || [];
    const avgKp = games.length ? games.reduce((acc, g) => acc + (g.kp || 0.5), 0) / games.length : 0.5;
    return { p, avgKp };
  }).sort((a, b) => a.avgKp - b.avgKp);
  const kpWinner = kpNominees[0];

  // 6. Caricia de Seda (El Gatillo de Peluche)
  const dmgNominees = [...ps].map((p) => {
    const games = p.games || [];
    const avgDmg = games.length ? games.reduce((acc, g) => acc + (g.dmgShare || 0.2), 0) / games.length : 0.2;
    return { p, avgDmg };
  }).sort((a, b) => a.avgDmg - b.avgDmg);
  const dmgWinner = dmgNominees[0];

  // 7. Wall Street en Ruina (El Acelerador de Derrotas)
  const streakNominees = [...ps].sort((a, b) => a.stats.streak - b.stats.streak);
  const streakWinner = streakNominees[0];

  // 8. El Payaso del Año 2026 (La Peor Partida Individual)
  const allWorstGames = ps.filter((p) => p.roast).map((p) => ({ p, r: p.roast })).sort((a, b) => a.r.score - b.r.score);
  const clownWinner = allWorstGames[0];

  const awards = [
    {
      icon: '💀',
      title: 'El Ataúd de Oro',
      tag: 'PREMIO AL MAYOR ALIMENTADOR',
      desc: 'Galardón a quien más tiempo pasó meditando frente a la pantalla gris y alimentando a los rivales como si fuera buffet libre sin costo alguno.',
      nominees: deathNominees.slice(0, 3).map((p) => ({
        name: p.name,
        avatar: iconImg(p.profileIconId),
        stat: `${p.stats.avgDeaths} m/partida`,
      })),
      winner: {
        name: deathWinner.name,
        avatar: iconImg(deathWinner.profileIconId),
        tier: deathWinner.soloTier || deathWinner.solo?.tier?.toLowerCase() || 'unranked',
        badge: '💀 GANADOR POR SANGRE DERRAMADA',
        stat: `${deathWinner.stats.avgDeaths} muertes promedio · Hasta ${deathWorst} muertes en un solo juego`,
        speech: '“Agradezco a la pantalla gris por hacerme compañía el 40% de la partida. Y gracias al jungla rival por acampar en mi carril sin pagar alquiler.”',
        matchId: deathWinner.roast?.matchId,
      },
    },
    {
      icon: '🎒',
      title: 'Mochila de Titanio 2026',
      tag: 'EL PASAJERO VIP DE LA GRIETA',
      desc: 'Otorgado a quien logró ganar partidas jugando en modo espectador de lujo mientras sus cuatro amigos sudaban sangre y se dislocaban la espalda 4v5.',
      nominees: mochilaNominees.slice(0, 3).map((p) => ({
        name: p.name,
        avatar: iconImg(p.profileIconId),
        stat: `${p.stats.mochila || 0} mochilas`,
      })),
      winner: {
        name: mochilaWinner.name,
        avatar: iconImg(mochilaWinner.profileIconId),
        tier: mochilaWinner.soloTier || mochilaWinner.solo?.tier?.toLowerCase() || 'unranked',
        badge: '🎒 CARGA PESADA INDESTRUCTIBLE',
        stat: `${mochilaWinner.stats.mochila || 0} partidas de mochila · Score promedio ${mochilaWinner.stats.avgScore.toFixed(1)}`,
        speech: '“Carrear es para gente sin amigos. El verdadero talento está en sentarse en el asiento de atrás, mirar el paisaje y reclamar 20 LP al final.”',
        matchId: mochilaWinner.roast?.matchId,
      },
    },
    {
      icon: '💸',
      title: 'La Fundación Caritativa',
      tag: 'PATROCINADOR OFICIAL DEL RIVAL',
      desc: 'Reconocimiento al alma más generosa de la Grieta que le financió la build completa a su oponente de carril con ventajas de oro astronómicas.',
      nominees: goldNominees.slice(0, 3).map((row) => ({
        name: row.p.name,
        avatar: iconImg(row.p.profileIconId),
        stat: `+${Math.round(row.avgDeficit)}g regalados`,
      })),
      winner: {
        name: goldWinner.p.name,
        avatar: iconImg(goldWinner.p.profileIconId),
        tier: goldWinner.p.soloTier || goldWinner.p.solo?.tier?.toLowerCase() || 'unranked',
        badge: '💸 MECENAS DEL ELO RIVAL',
        stat: `+${Math.round(goldWinner.avgDeficit)} oro de media al rival directo en cada línea`,
        speech: '“La caridad empieza por casa, pero preferí empezarla con el mid rival para que termine su Rabadon al minuto 15. De nada, crack.”',
        matchId: goldWinner.p.roast?.matchId,
      },
    },
    {
      icon: '🦯',
      title: 'El Murciélago Ciego',
      tag: 'PREMIO HELEN KELLER DE LA VISIÓN',
      desc: 'Al estratega que jugó con el minimapa en resolución 0x0, creyó que los centinelas costaban Riot Points y nunca compró un Guardián de Control.',
      nominees: visNominees.slice(0, 3).map((row) => ({
        name: row.p.name,
        avatar: iconImg(row.p.profileIconId),
        stat: `${row.avgVis.toFixed(2)} vis/min`,
      })),
      winner: {
        name: visWinner.p.name,
        avatar: iconImg(visWinner.p.profileIconId),
        tier: visWinner.p.soloTier || visWinner.p.solo?.tier?.toLowerCase() || 'unranked',
        badge: '🦯 JUGÓ CON EL MONITOR APAGADO',
        stat: `${visWinner.avgVis.toFixed(2)} puntos de visión por minuto · Ceguera casi total`,
        speech: '“Si no pongo centinelas, no veo los ganks. Y si no los veo, técnicamente no existen hasta que me mandan a base. Pura paz mental.”',
        matchId: visWinner.p.roast?.matchId,
      },
    },
    {
      icon: '🌾',
      title: 'El Granjero del Apocalipsis',
      tag: 'EL AUSENTE DE TEAMFIGHTS',
      desc: 'Al ermitaño que prefirió farmear súbditos pacíficamente en una esquina del mapa mientras su equipo moría en Baron Nashor y el Nexo caía.',
      nominees: kpNominees.slice(0, 3).map((row) => ({
        name: row.p.name,
        avatar: iconImg(row.p.profileIconId),
        stat: `${Math.round(row.avgKp * 100)}% KP`,
      })),
      winner: {
        name: kpWinner.p.name,
        avatar: iconImg(kpWinner.p.profileIconId),
        tier: kpWinner.p.soloTier || kpWinner.p.solo?.tier?.toLowerCase() || 'unranked',
        badge: '🌾 COSECHA PACÍFICA EN PLENO DESASTRE',
        stat: `Solo ${Math.round(kpWinner.avgKp * 100)}% de presencia en peleas · 100% de devoción al farm`,
        speech: '“El Nexo es temporal, pero 6 súbditos magos bajo la torre enemiga son para siempre. Las peleas 4v5 forjan el carácter de mis compañeros.”',
        matchId: kpWinner.p.roast?.matchId,
      },
    },
    {
      icon: '☁️',
      title: 'Caricia de Seda',
      tag: 'EL GATILLO DE PELUCHE',
      desc: 'Al carry que disparó balas de salva y pegó con un fideo hervido, logrando el porcentaje de daño a campeones más inofensivo de toda la temporada.',
      nominees: dmgNominees.slice(0, 3).map((row) => ({
        name: row.p.name,
        avatar: iconImg(row.p.profileIconId),
        stat: `${Math.round(row.avgDmg * 100)}% dmg share`,
      })),
      winner: {
        name: dmgWinner.p.name,
        avatar: iconImg(dmgWinner.p.profileIconId),
        tier: dmgWinner.p.soloTier || dmgWinner.p.solo?.tier?.toLowerCase() || 'unranked',
        badge: '☁️ PACIFISTA NOBEL DE LA GRIETA',
        stat: `Apenas ${Math.round(dmgWinner.avgDmg * 100)}% del daño total del equipo · Ataques inofensivos`,
        speech: '“La violencia genera violencia. Mis ataques eran caricias diseñadas para abrir canales de diplomacia y diálogo con el equipo enemigo.”',
        matchId: dmgWinner.p.roast?.matchId,
      },
    },
    {
      icon: '📉',
      title: 'Wall Street en Ruina',
      tag: 'EL ACELERADOR DE DERROTAS',
      desc: 'A la racha de derrotas más autodestructiva y sin frenos de la temporada. Ni las criptomonedas cayeron tan rápido al fondo del abismo.',
      nominees: streakNominees.slice(0, 3).map((p) => ({
        name: p.name,
        avatar: iconImg(p.profileIconId),
        stat: `${p.stats.streak} racha`,
      })),
      winner: {
        name: streakWinner.name,
        avatar: iconImg(streakWinner.profileIconId),
        tier: streakWinner.soloTier || streakWinner.solo?.tier?.toLowerCase() || 'unranked',
        badge: '📉 TERRORISTA DEL HISTORIAL',
        stat: `${Math.abs(streakWinner.stats.streak)} derrotas consecutivas · Récord de caída libre de ELO`,
        speech: '“Dicen que después de tocar fondo solo queda subir, pero yo descubrí que abajo todavía hay subsuelo, alcantarillas y Hierro IV.”',
        matchId: streakWinner.roast?.matchId,
      },
    },
    {
      icon: '🤡',
      title: 'El Payaso del Año 2026',
      tag: 'PEOR PARTIDA INDIVIDUAL DE LA HISTORIA',
      desc: 'La actuación individual más criminal, bochornosa y catastrófica jamás registrada en los anales de la Grieta de los Pibes.',
      nominees: allWorstGames.slice(0, 3).map((row) => ({
        name: row.p.name,
        avatar: iconImg(row.p.profileIconId),
        stat: `${row.r.champion} (${row.r.score.toFixed(1)} score)`,
      })),
      winner: {
        name: clownWinner.p.name,
        avatar: iconImg(clownWinner.p.profileIconId),
        tier: clownWinner.p.soloTier || clownWinner.p.solo?.tier?.toLowerCase() || 'unranked',
        badge: '👑 EL REY DE LA VERGÜENZA 2026',
        stat: `${clownWinner.r.champion} · Score ${clownWinner.r.score.toFixed(1)} / 10 · KDA: ${clownWinner.r.kda} · ${clownWinner.r.place}° de 10`,
        speech: '“Exijo una auditoría a Riot Games. Ese teclado estaba poseído por un demonio de LAN y el mouse tenía interferencia electromagnética.”',
        matchId: clownWinner.r.matchId,
      },
    },
  ];

  container.innerHTML = awards.map((a) => `
    <article class="award-card">
      <div class="award-card-header">
        <div class="award-category-group">
          <span class="award-trophy-icon">${a.icon}</span>
          <div>
            <h4 class="award-card-title">${esc(a.title)}</h4>
            <span class="award-card-tag">${esc(a.tag)}</span>
          </div>
        </div>
      </div>

      <p class="award-card-desc">${esc(a.desc)}</p>

      <div class="award-nominees-section">
        <span class="award-nominees-label">Nominados Oficiales:</span>
        <div class="award-nominees-list">
          ${a.nominees.map((n) => `
            <div class="award-nominee-chip" title="${esc(n.name)}: ${esc(n.stat)}">
              <img class="award-nominee-avatar" src="${n.avatar}" alt="${esc(n.name)}" onerror="this.src='logo.jpg'">
              <span>${esc(n.name)}</span>
              <span class="award-nominee-stat">(${esc(n.stat)})</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="award-winner-box">
        <div class="award-winner-badge-row">
          <span class="award-winner-badge">${esc(a.winner.badge)}</span>
        </div>
        <div class="award-winner-profile">
          <img class="award-winner-avatar tier-${a.winner.tier}" src="${a.winner.avatar}" alt="${esc(a.winner.name)}" onerror="this.src='logo.jpg'">
          <div>
            <div class="award-winner-name">${esc(a.winner.name)}</div>
            <div class="award-winner-stat">${esc(a.winner.stat)}</div>
          </div>
        </div>
        <p class="award-speech-quote">${esc(a.winner.speech)}</p>
        ${a.winner.matchId ? `
          <button class="award-match-link-btn" type="button" data-award-match="${esc(a.winner.matchId)}">
            ⚔️ Ver Partida del Crimen 5v5 →
          </button>
        ` : ''}
      </div>
    </article>
  `).join('');

  // Bind click events on award match buttons
  container.querySelectorAll('[data-award-match]').forEach((btn) => {
    btn.addEventListener('click', () => {
      openMatchModal(btn.dataset.awardMatch);
    });
  });
}

function setupApodosFilterBar() {
  const bar = $('#apodos-filter-bar');
  if (!bar || bar.dataset.bound) return;
  bar.dataset.bound = 'true';

  bar.querySelectorAll('.apodos-filter-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      bar.querySelectorAll('.apodos-filter-pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.dataset.afilter;
      const awardsSec = $('#apodos-awards-section');
      const cardsSec = $('#apodos-cards-section');

      if (filter === 'all') {
        if (awardsSec) awardsSec.style.display = 'block';
        if (cardsSec) cardsSec.style.display = 'block';
      } else if (filter === 'awards') {
        if (awardsSec) awardsSec.style.display = 'block';
        if (cardsSec) cardsSec.style.display = 'none';
      } else if (filter === 'cards') {
        if (awardsSec) awardsSec.style.display = 'none';
        if (cardsSec) cardsSec.style.display = 'block';
      }
    });
  });
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

  // 1. SALÓN DE LA GLORIA (LO MEJOR DE TODOS)
  const grid = $('#records-grid');
  if (grid) {
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
      {
        title: 'Guerra Interminable',
        icon: '⏳',
        tag: 'Duración',
        data: r.longestGame,
        unit: 'Minutos de Batalla',
        fmt: (v) => `${v} Minutos`,
        highlight: false,
        desc: 'La partida más agónica y épica registrada en el servidor.',
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
  }

  // 2. SALÓN DE LA INFAMIA (LO PEOR DE TODOS CON HUMOR NEGRO)
  const infamyGrid = $('#records-infamy-grid');
  if (infamyGrid) {
    const players = board?.players || [];
    let worstScore = null;
    let minDamage = null;
    let minVision = null;
    let minCs = null;
    const mochilaCounts = {};

    for (const p of players) {
      mochilaCounts[p.name] = { count: 0, player: p.name, puuid: p.puuid };
      for (const g of p.games || []) {
        if (g.isRemake) continue;
        if (g.mochila) mochilaCounts[p.name].count++;

        if (!worstScore || g.score < worstScore.value) {
          worstScore = { value: g.score, player: p.name, puuid: p.puuid, champion: g.champion, kills: g.kills, deaths: g.deaths, assists: g.assists, minutes: g.minutes, matchId: g.matchId, date: g.endTs, role: g.position };
        }
        if (g.minutes >= 15 && (!minDamage || g.damage < minDamage.value)) {
          minDamage = { value: g.damage, player: p.name, puuid: p.puuid, champion: g.champion, kills: g.kills, deaths: g.deaths, assists: g.assists, minutes: g.minutes, matchId: g.matchId, date: g.endTs, role: g.position };
        }
        if (g.minutes >= 20 && (!minVision || g.vision < minVision.value)) {
          minVision = { value: g.vision, player: p.name, puuid: p.puuid, champion: g.champion, minutes: g.minutes, matchId: g.matchId, date: g.endTs, role: g.position };
        }
        if (g.position !== 'UTILITY' && g.minutes >= 20 && (!minCs || g.cs < minCs.value)) {
          minCs = { value: g.cs, player: p.name, puuid: p.puuid, champion: g.champion, minutes: g.minutes, matchId: g.matchId, date: g.endTs, role: g.position };
        }
      }
    }

    const mochilaKing = Object.values(mochilaCounts).sort((a, b) => b.count - a.count)[0];

    const infamyCards = [
      {
        title: 'La Mochila de Plomo',
        icon: '🎒',
        tag: 'Más Veces Mochila',
        data: mochilaKing ? { player: mochilaKing.player, puuid: mochilaKing.puuid, value: mochilaKing.count } : null,
        unit: 'Partidas Cargado por el Equipo',
        fmt: (v) => `${v} Partidas Mochila`,
        desc: 'El saco de papas oficial del grupo. Sus compañeros todavía van a terapia lumbar por tener que cargarlo tantas partidas.',
      },
      {
        title: 'Donador de Sangre Serial',
        icon: '🩸',
        tag: 'Más Muertes en un Juego',
        data: r.maxDeaths,
        unit: 'Muertes en una Sola Partida',
        fmt: (v) => `${v} Deaths`,
        desc: 'Alimentó al rival con tanta constancia y generosidad que el equipo enemigo le mandó flores y canasta navideña.',
      },
      {
        title: 'El Vómito del Algoritmo',
        icon: '🤮',
        tag: 'Peor Score OP.GG',
        data: worstScore,
        unit: 'Puntuación Oficial OP.GG',
        fmt: (v) => `Score ${v.toFixed(1)}`,
        desc: 'La inteligencia artificial de Riot intentó llamar al 911 al presenciar semejante catástrofe biomecánica sobre el teclado.',
      },
      {
        title: 'Masaje Terapéutico',
        icon: '🪶',
        tag: 'Menor Daño a Campeones',
        data: minDamage,
        unit: 'Daño No Letal Infligido',
        fmt: (v) => `${v.toLocaleString()} Daño`,
        desc: 'Los campeones rivales pensaron que sus golpes eran una brisa fresca de verano. Daño con fines de relajación muscular.',
      },
      {
        title: 'Ceguera Selectiva',
        icon: '🦯',
        tag: 'Menor Visión en Partida',
        data: minVision,
        unit: 'Puntos de Visión en 20m+',
        fmt: (v) => `${v} Visión`,
        desc: 'Jugó con anteojeras para caballos y el brillo de la pantalla en cero. Piensa que los wards se pagan con Riot Points.',
      },
      {
        title: 'Alergia a los Súbditos',
        icon: '🚫',
        tag: 'Menor CS en Línea',
        data: minCs,
        unit: 'Súbditos en 20m+',
        fmt: (v) => `${v} CS (${(v / Math.max(1, minCs?.minutes || 1)).toFixed(1)}/m)`,
        desc: 'Le tiene pánico a pegarle a los minions; cree que los cañones muerden. Los súbditos enemigos se murieron de aburrimiento.',
      },
    ];

    infamyGrid.innerHTML = infamyCards.map((c) => {
      if (!c.data) return '';
      const champ = c.data.champion ? champImg(c.data.champion) : null;
      const player = board?.players?.find((p) => p.puuid === c.data.puuid);
      const avatar = champ ?? (player ? iconImg(player.profileIconId) : '');

      return `
        <div class="record-card infamy">
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
              <span class="record-champ-name">${c.data.champion ? `${esc(c.data.champion)} · ${ROLE[c.data.role] ?? c.data.role ?? 'Ranked'}` : 'Especialista en Inting'}</span>
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
  }

  // 3. CUADRO DE HONOR PERSONAL (AL MENOS 2 COSAS POR CADA JUGADOR)
  const personalGrid = $('#records-personal-grid');
  if (personalGrid) {
    const players = board?.players || [];

    personalGrid.innerHTML = players.map((p) => {
      const games = (p.games || []).filter((g) => !g.isRemake);
      const best = [...games].sort((a, b) => (b.score || 0) - (a.score || 0) || (b.kills || 0) - (a.kills || 0))[0];
      const worst = [...games].sort((a, b) => (a.score || 10) - (b.score || 10) || (b.deaths || 0) - (a.deaths || 0))[0];
      const maxDmg = [...games].sort((a, b) => (b.damage || 0) - (a.damage || 0))[0];
      const maxDeaths = [...games].sort((a, b) => (b.deaths || 0) - (a.deaths || 0))[0];

      const bestChamp = best ? resolveChampName(best.champion) : 'Campeón';
      const worstChamp = worst ? resolveChampName(worst.champion) : 'Campeón';

      // Glory roast / praise
      const gloryQuotes = [
        `El día que los astros se alinearon y jugó como si le pagaran en dólares por ganar.`,
        `Se creía Faker en Worlds: esquivó habilidades hasta con los pensamientos.`,
        `Destrucción nuclear autorizada; el equipo rival todavía está buscando su dignidad en el río.`,
        `Rendimiento de maestro ajedrecista: carrió a 4 conitos de tránsito hasta la victoria.`
      ];
      const gloryQuote = gloryQuotes[Math.abs(p.name.length * 5) % gloryQuotes.length];

      // Infamy dark humor roasts
      const infamyQuotes = [
        `El día que el mouse se le resbaló y se dedicó a donar LP a la beneficencia rival.`,
        `Un performance tan doloroso que el botón de rendirse parecía la opción más humanitaria.`,
        `Donó más oro al equipo enemigo que una ONG internacional en tiempos de crisis.`,
        `Caminó hacia la muerte tantas veces que los súbditos enemigos ya lo saludaban por su nombre.`
      ];
      const infamyQuote = infamyQuotes[Math.abs(p.name.length * 7) % infamyQuotes.length];

      return `
        <article class="record-personal-card">
          <div class="personal-card-header">
            <div class="personal-card-avatar-wrap">
              <img src="${iconImg(p.profileIconId)}" alt="${esc(p.name)}" onerror="this.src='logo.jpg'">
              ${p.level ? `<span class="personal-card-level">NVL ${p.level}</span>` : ''}
            </div>
            <div class="personal-card-names">
              <span class="personal-card-name">${esc(p.name)}</span>
              ${p.nickname?.title ? `<span class="personal-card-nick">“${esc(p.nickname.title)}”</span>` : ''}
            </div>
            <div class="personal-card-rank-chip">${p.solo?.label ?? 'Unranked'}</div>
          </div>

          <!-- Feat 1: Gloria Personal -->
          <div class="personal-feat glory">
            <div class="personal-feat-header">
              <span class="personal-feat-badge">Hazaña #1 · Su Mayor Gloria</span>
              <span class="px-score ${best && best.score >= 8 ? 'px-s-great' : 'px-s-good'}">Score ${best?.score?.toFixed(1) ?? '—'}</span>
            </div>
            <div class="personal-feat-body">
              <div class="personal-feat-champ">
                <img src="${champImg(bestChamp)}" alt="${esc(bestChamp)}" onerror="this.src='logo.jpg'">
              </div>
              <div class="personal-feat-details">
                <div class="personal-feat-kda">${best?.kills ?? 0} / ${best?.deaths ?? 0} / ${best?.assists ?? 0} <small style="font-weight:500; color:var(--text-muted);">(${(((best?.kills ?? 0) + (best?.assists ?? 0)) / Math.max(1, best?.deaths ?? 1)).toFixed(2)} KDA)</small></div>
                <div class="personal-feat-meta">${esc(bestChamp)} · ${kNum(maxDmg?.damage || 0)} Daño pico · ${best?.win ? 'Victoria' : 'Derrota'}</div>
              </div>
            </div>
            <p class="personal-feat-quote">“${gloryQuote}”</p>
            ${best?.matchId ? `
              <div class="personal-feat-footer">
                <button class="record-match-btn" data-match-id="${esc(best.matchId)}">🔍 Ver Partida de Oro</button>
              </div>
            ` : ''}
          </div>

          <!-- Feat 2: Infamia Personal con Humor Negro -->
          <div class="personal-feat infamy">
            <div class="personal-feat-header">
              <span class="personal-feat-badge">Hazaña #2 · Su Mancha de la Infamia</span>
              <span class="px-score px-s-low">Score ${worst?.score?.toFixed(1) ?? '—'}</span>
            </div>
            <div class="personal-feat-body">
              <div class="personal-feat-champ">
                <img src="${champImg(worstChamp)}" alt="${esc(worstChamp)}" onerror="this.src='logo.jpg'">
              </div>
              <div class="personal-feat-details">
                <div class="personal-feat-kda" style="color:#fca5a5;">${worst?.kills ?? 0} / ${worst?.deaths ?? 0} / ${worst?.assists ?? 0} <small style="font-weight:500; color:var(--text-muted);">(Pico ${maxDeaths?.deaths ?? 0} muertes)</small></div>
                <div class="personal-feat-meta">${esc(worstChamp)} · ${worst?.minutes ?? 0}m de sufrimiento · Score ${worst?.score?.toFixed(1) ?? '—'}</div>
              </div>
            </div>
            <p class="personal-feat-quote">“${infamyQuote}”</p>
            ${worst?.matchId ? `
              <div class="personal-feat-footer">
                <button class="record-match-btn" data-match-id="${esc(worst.matchId)}">🔍 Ver Partida del Inting</button>
              </div>
            ` : ''}
          </div>
        </article>
      `;
    }).join('');
  }

  // 4. BIND FILTER PILLS (SIN ICONOS)
  $$('.records-filter-pill').forEach((btn) => {
    btn.onclick = () => {
      $$('.records-filter-pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;

      const secGlory = $('#records-glory-section');
      const secInfamy = $('#records-infamy-section');
      const secPersonal = $('#records-personal-section');

      if (filter === 'all') {
        if (secGlory) secGlory.style.display = 'block';
        if (secInfamy) secInfamy.style.display = 'block';
        if (secPersonal) secPersonal.style.display = 'block';
      } else if (filter === 'glory') {
        if (secGlory) secGlory.style.display = 'block';
        if (secInfamy) secInfamy.style.display = 'none';
        if (secPersonal) secPersonal.style.display = 'none';
      } else if (filter === 'infamy') {
        if (secGlory) secGlory.style.display = 'none';
        if (secInfamy) secInfamy.style.display = 'block';
        if (secPersonal) secPersonal.style.display = 'none';
      } else if (filter === 'personal') {
        if (secGlory) secGlory.style.display = 'none';
        if (secInfamy) secInfamy.style.display = 'none';
        if (secPersonal) secPersonal.style.display = 'block';
      }
    };
  });

  // 5. BIND ALL MODAL BUTTONS
  $$('#view-records .record-match-btn').forEach((btn) => {
    btn.onclick = () => {
      openMatchModal(btn.dataset.matchId);
    };
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

function getPlayerLpSeries(player, rangeMode = '30d') {
  if (!player.solo) return null;
  const now = Date.now();
  const DAY = 24 * 3600 * 1000;
  const days = rangeMode === '7d' ? 7 : rangeMode === '15d' ? 15 : rangeMode === 'all' ? 60 : 30;
  const startTs = now - days * DAY;

  const soloGames = (player.games || [])
    .filter((g) => g.queueId === 420 && !g.isRemake)
    .sort((a, b) => a.endTs - b.endTs);

  let runningVal = player.solo.value;
  const gamePoints = [];
  const rev = [...soloGames].reverse();
  for (const g of rev) {
    const delta = typeof g.lpDelta === 'number' ? g.lpDelta : (g.win ? 22 : -20);
    gamePoints.unshift({
      t: g.endTs,
      v: runningVal,
      delta,
      win: g.win,
      champ: g.champion,
    });
    runningVal -= delta;
  }

  const baseVal = runningVal;
  const points = [{ t: startTs, v: baseVal, isStart: true }];
  gamePoints.forEach((pt) => {
    if (pt.t >= startTs && pt.t <= now) {
      points.push(pt);
    }
  });
  points.push({ t: now, v: player.solo.value, isCurrent: true });

  const rangeGames = soloGames.filter((g) => g.endTs >= startTs && g.endTs <= now);
  const wins = rangeGames.filter((g) => g.win).length;
  const losses = rangeGames.length - wins;
  const winrate = rangeGames.length > 0 ? Math.round((wins / rangeGames.length) * 100) : 0;

  return {
    points,
    startTs,
    endTs: now,
    baseVal,
    currentVal: player.solo.value,
    days,
    gamesCount: rangeGames.length,
    wins,
    losses,
    winrate,
  };
}

let currentLpChartRange = '30d';

function renderLpChart(player, rangeMode = '30d') {
  currentLpChartRange = rangeMode;
  const container = $('#lp-chart-container');
  if (!container) return;

  const series = getPlayerLpSeries(player, rangeMode);
  if (!series || series.points.length < 2) {
    container.innerHTML = '<div class="muted" style="text-align:center; padding:30px;">Sin partidas clasificatorias registradas en este período.</div>';
    return;
  }

  const { points, startTs, endTs, baseVal, currentVal, days, gamesCount, wins, losses, winrate } = series;

  const w = 800;
  const h = 230;
  const padL = 90;
  const padR = 30;
  const padT = 32;
  const padB = 36;

  const vals = points.map((x) => x.v);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = Math.max(30, maxV - minV);
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const timeSpan = Math.max(1, endTs - startTs);

  const pts = points.map((pt) => {
    const timeRatio = Math.max(0, Math.min(1, (pt.t - startTs) / timeSpan));
    const x = padL + timeRatio * chartW;
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

  // 5 Calendar Date Ticks across the timeline
  const xMarkers = [];
  const xCount = 5;
  for (let i = 0; i < xCount; i++) {
    const t = startTs + (i / (xCount - 1)) * timeSpan;
    const x = padL + (i / (xCount - 1)) * chartW;
    const dateStr = new Date(t).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    xMarkers.push({ x, label: dateStr });
  }

  // Update Metrics
  const peakValEl = $('#lp-peak-val');
  if (peakValEl) peakValEl.textContent = valToLabel(peakPt.pt.v);
  
  const progValEl = $('#lp-prog-val');
  const deltaTotal = currentVal - baseVal;
  if (progValEl) {
    progValEl.textContent = `${deltaTotal >= 0 ? '+' : ''}${deltaTotal} LP`;
    progValEl.style.color = deltaTotal >= 0 ? 'var(--success)' : 'var(--danger)';
  }

  const wrValEl = $('#lp-wr-val');
  if (wrValEl) {
    wrValEl.textContent = `${winrate}% (${wins}V - ${losses}D)`;
    wrValEl.style.color = winrate >= 50 ? 'var(--cyan)' : 'var(--danger)';
  }

  const subtitleEl = $('#lp-history-subtitle');
  if (subtitleEl) {
    subtitleEl.textContent = rangeMode === '30d' 
      ? 'Progreso continuo en Ranked Solo/Duo en los últimos 30 días (Mes Completo)' 
      : rangeMode === '15d'
      ? 'Progreso continuo en Ranked Solo/Duo en los últimos 15 días'
      : rangeMode === '7d'
      ? 'Progreso continuo en Ranked Solo/Duo en los últimos 7 días'
      : 'Historial completo de progreso en Ranked Solo/Duo';
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

        <!-- Match dots -->
        ${pts.map((p, idx) => {
          if (idx === 0 || idx === pts.length - 1 || idx === peakIdx) return '';
          const tooltip = `${new Date(p.pt.t).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} · ${p.pt.champ ? `${p.pt.win ? 'Victoria' : 'Derrota'} con ${p.pt.champ}` : 'Registro LP'} · ${valToLabel(p.pt.v)}`;
          return `
            <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#111A2B" stroke="#39C5F5" stroke-width="1.5" style="cursor:pointer;">
              <title>${esc(tooltip)}</title>
            </circle>
          `;
        }).join('')}

        <!-- Start dot -->
        <circle cx="${firstPt.x.toFixed(1)}" cy="${firstPt.y.toFixed(1)}" r="3.5" fill="#121E32" stroke="#39C5F5" stroke-width="2">
          <title>${esc(`Inicio del período: ${valToLabel(firstPt.pt.v)}`)}</title>
        </circle>

        <!-- Peak dot with crown -->
        <circle cx="${peakPt.x.toFixed(1)}" cy="${peakPt.y.toFixed(1)}" r="5.5" fill="#E8C982" stroke="#080D19" stroke-width="2"/>
        <text x="${peakPt.x.toFixed(1)}" y="${Math.max(14, peakPt.y - 8).toFixed(1)}" fill="#E8C982" font-size="10.5" font-weight="bold" font-family="system-ui" text-anchor="middle">👑 Pico: ${esc(valToLabel(peakPt.pt.v))}</text>

        <!-- Current dot -->
        <circle cx="${lastPt.x.toFixed(1)}" cy="${lastPt.y.toFixed(1)}" r="5.5" fill="#39C5F5" stroke="#FFFFFF" stroke-width="2">
          <title>${esc(`Actual: ${valToLabel(lastPt.pt.v)}`)}</title>
        </circle>
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
  const dSeason = d.season ?? d.week ?? 0;
  const topChamp = p.topChampions?.[0]?.champion || (p.games?.[0] ? resolveChampName(p.games[0].champion) : 'Kai\'Sa');
  const champSplashUrl = getChampSplashUrl(topChamp);
  const soloTier = p.solo?.tier ? p.solo.tier.toLowerCase() : 'unranked';
  const flexTier = p.flex?.tier ? p.flex.tier.toLowerCase() : 'unranked';
  const soloTierLabel = p.solo?.label ?? 'Unranked';
  const flexTierLabel = p.flex?.label ?? 'Unranked';
  const score = p.stats ? p.stats.avgScore.toFixed(1) : '—';

  content.innerHTML = `
    <div class="profile-header-card">
      <div class="profile-header-bg" style="background-image: linear-gradient(135deg, rgba(8, 13, 25, 0.45) 0%, rgba(8, 13, 25, 0.92) 65%, #0B1322 100%), url('${champSplashUrl}'), url('assets/banner.jpg');"></div>
      
      <div class="profile-header-main">
        <div class="profile-avatar-wrapper">
          <img class="profile-avatar-big tier-${soloTier}" src="${iconImg(p.profileIconId)}" alt="${esc(p.name)}" onerror="this.src='logo.jpg'">
          ${p.level ? `<span class="profile-level-badge">NVL ${p.level}</span>` : ''}
        </div>

        <div class="profile-info">
          <div class="profile-name-row">
            <h2 class="profile-name">${esc(p.name)}</h2>
            ${p.nickname ? `<span class="row-nickname-badge">"${esc(p.nickname.title)}"</span>` : ''}
          </div>

          <div class="profile-main-champ-row">
            <span class="profile-main-champ-chip" title="Campeón insignia más jugado">
              <img class="profile-main-champ-icon" src="${champImg(topChamp)}" alt="${esc(topChamp)}" onerror="this.style.display='none'">
              <span class="profile-main-champ-txt">Campeón Principal: <strong>${esc(topChamp)}</strong></span>
              ${p.topChampions?.[0]?.games ? `<span class="profile-main-champ-sub">(${p.topChampions[0].games} partidas · ${p.topChampions[0].wins}V)</span>` : ''}
            </span>
          </div>

          <div class="profile-ranks-line">
            <span class="profile-rank-chip solo tier-${soloTier}" title="Clasificatoria Solo/Duo">
              <strong class="q-tag">Solo:</strong> ${esc(soloTierLabel)}
            </span>
            <span class="profile-rank-chip flex tier-${flexTier}" title="Clasificatoria Flex">
              <strong class="q-tag">Flex:</strong> ${esc(flexTierLabel)}
            </span>
          </div>

          <div class="profile-meta-line">
            <span class="profile-meta-tag">${esc(p.riotId)}</span>
            <span class="profile-meta-dot">•</span>
            <span class="profile-meta-tag">Región: ${esc(formatPlatform(p.platform ?? board.platform))}</span>
            <span class="profile-meta-dot">•</span>
            <span class="profile-meta-tag">Temporada 2026</span>
          </div>

          <div class="profile-actions-row">
            <button id="open-gamer-card-btn" class="profile-gamer-btn" title="Generar tarjeta compartible de invocador">
              <span>Generar Tarjeta de Invocador</span>
            </button>
          </div>
        </div>
      </div>

      <div class="profile-score-box" title="Calificación Oficial de Rendimiento OP.GG">
        <span class="profile-score-brand">OP.GG</span>
        <span class="profile-score-num">${score}</span>
        <span class="profile-score-title">SCORE</span>
      </div>
    </div>

    <!-- Stats row -->
    <div class="stat-grid-4">
      <div class="stat-card">
        <div class="stat-info">
          <span class="stat-val ${p.stats && p.stats.winrate >= 50 ? 'winrate-pos' : 'winrate-neg'}">${p.stats ? p.stats.winrate + '%' : '—'}</span>
          <span class="stat-lbl">Win Rate (${p.stats?.wins ?? 0}V - ${(p.stats?.games ?? 0) - (p.stats?.wins ?? 0)}D)</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <span class="stat-val" style="color:${dSeason >= 0 ? 'var(--success)' : 'var(--danger)'}">${signed(dSeason)} LP ${dSeason >= 0 ? '▲' : '▼'}</span>
          <span class="stat-lbl">Temporada (Semana: ${signed(d.week ?? 0)} LP)</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <span class="stat-val">${p.stats ? p.stats.kda : '—'}</span>
          <span class="stat-lbl">KDA Promedio</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-info">
          <span class="stat-val">${p.stats ? p.stats.mvp : 0} MVP <small style="font-size:13px;color:var(--text-muted);font-weight:600;">/ ${p.stats ? p.stats.ace : 0} ACE</small></span>
          <span class="stat-lbl">Distinciones de Partida</span>
        </div>
      </div>
    </div>

    <!-- LP History & Elo Evolution Chart -->
    <div class="lp-history-card">
      <div class="lp-history-header">
        <div>
          <h3 style="font-family:var(--font-heading); font-size:17px; color:var(--gold); margin:0;">Evolución de Elo y LP</h3>
          <span class="muted sub" id="lp-history-subtitle">Progreso continuo en Ranked Solo/Duo en los últimos 30 días (Mes Completo)</span>
        </div>
        <div class="lp-range-pills" id="lp-range-pills">
          <button class="pill-btn active" data-range="30d">30 Días</button>
          <button class="pill-btn" data-range="15d">15 Días</button>
          <button class="pill-btn" data-range="7d">7 Días</button>
          <button class="pill-btn" data-range="all">Todo</button>
        </div>
        <div class="lp-history-metrics">
          <div class="lp-metric-pill">
            <span class="muted sub">Pico Máximo:</span>
            <strong id="lp-peak-val" style="color:var(--gold-bright);">—</strong>
          </div>
          <div class="lp-metric-pill">
            <span class="muted sub">Progreso:</span>
            <strong id="lp-prog-val" style="color:var(--success);">—</strong>
          </div>
          <div class="lp-metric-pill" id="lp-period-wr-pill">
            <span class="muted sub">Winrate SoloQ:</span>
            <strong id="lp-wr-val" style="color:var(--cyan);">—</strong>
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

    <!-- Recent Match History (Identical to Inicio Feed) -->
    <div class="profile-history-section">
      <div class="profile-history-header-bar">
        <div>
          <h3 style="font-family:var(--font-heading); font-size:18px; margin:0 0 4px; color:var(--gold);">Historial de Partidas Ranked</h3>
          <p class="muted sub" style="margin:0;">Historial competitivo detallado con rival en línea, distinciones y estadísticas de combate</p>
        </div>
        <div class="pill-group profile-history-filter" id="profile-matches-queue-filter">
          <button class="pill-btn active" data-pfilter="all">Todas</button>
          <button class="pill-btn" data-pfilter="solo">Solo/Duo</button>
          <button class="pill-btn" data-pfilter="flex">Flex</button>
          <button class="pill-btn" data-pfilter="win">Victorias</button>
          <button class="pill-btn" data-pfilter="loss">Derrotas</button>
          <button class="pill-btn" data-pfilter="surrender">Surrender</button>
        </div>
      </div>

      <div id="profile-matches-feed" class="profile-matches-feed"></div>
      <div id="profile-matches-pagination" class="overview-pagination"></div>
    </div>
  `;

  // Render LP Chart (default 30 days / full month)
  renderLpChart(p, '30d');

  // Bind LP range buttons
  content.querySelectorAll('#lp-range-pills button').forEach((btn) => {
    btn.onclick = () => {
      content.querySelectorAll('#lp-range-pills button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderLpChart(p, btn.dataset.range);
    };
  });

  // Render Match History Feed
  currentProfileMatchFilter = 'all';
  currentProfileMatchPage = 1;
  renderProfileMatchesFeed(p);

  // Bind filter buttons
  content.querySelectorAll('#profile-matches-queue-filter button').forEach((btn) => {
    btn.onclick = () => {
      content.querySelectorAll('#profile-matches-queue-filter button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentProfileMatchFilter = btn.dataset.pfilter;
      currentProfileMatchPage = 1;
      renderProfileMatchesFeed(p);
    };
  });

  // Bind Gamer Card button
  $('#open-gamer-card-btn')?.addEventListener('click', () => {
    if (selectedPlayerForProfile) generateGamerCard(selectedPlayerForProfile);
  });

  switchView('player');
};

let currentProfileMatchFilter = 'all';
let currentProfileMatchPage = 1;

function renderProfileMatchesFeed(p) {
  const feed = $('#profile-matches-feed');
  const paginationContainer = $('#profile-matches-pagination');
  if (!feed || !p) return;

  let matches = [...(p.games || [])];

  if (currentProfileMatchFilter === 'solo') {
    matches = matches.filter((g) => g.queueId === 420);
  } else if (currentProfileMatchFilter === 'flex') {
    matches = matches.filter((g) => g.queueId === 440);
  } else if (currentProfileMatchFilter === 'win') {
    matches = matches.filter((g) => g.win && !g.isRemake);
  } else if (currentProfileMatchFilter === 'loss') {
    matches = matches.filter((g) => !g.win && !g.isRemake);
  } else if (currentProfileMatchFilter === 'surrender') {
    matches = matches.filter((g) => g.isSurrender && !g.isRemake);
  }

  const totalMatches = matches.length;
  const totalPages = Math.max(1, Math.ceil(totalMatches / MATCHES_PER_PAGE));
  if (currentProfileMatchPage > totalPages) currentProfileMatchPage = totalPages;
  if (currentProfileMatchPage < 1) currentProfileMatchPage = 1;

  if (!totalMatches) {
    feed.innerHTML = `
      <div style="text-align:center; padding:40px; background:rgba(255,255,255,0.02); border-radius:12px; border:1px solid var(--border-light);" class="muted">
        No se encontraron partidas con los filtros seleccionados.
      </div>
    `;
    if (paginationContainer) paginationContainer.innerHTML = '';
    return;
  }

  const startIdx = (currentProfileMatchPage - 1) * MATCHES_PER_PAGE;
  const endIdx = startIdx + MATCHES_PER_PAGE;
  const pagedMatches = matches.slice(startIdx, endIdx);

  feed.innerHTML = pagedMatches.map((g) => {
    const isRemake = Boolean(g.isRemake || (g.minutes && g.minutes < 5));
    const isSurrender = Boolean(!isRemake && (g.isSurrender || (g.minutes && g.minutes >= 5 && g.minutes <= 21)));
    const isWin = g.win;
    const qName = g.queueId === 420 ? 'Solo/Duo' : g.queueId === 440 ? 'Ranked Flex' : 'Ranked';
    const matchLpDelta = g.lpDelta ?? null;
    const champName = resolveChampName(g.champion);
    const kdaRatio = ((g.kills + g.assists) / Math.max(1, g.deaths)).toFixed(2);
    const kpPct = Math.round((g.kp || 0) * 100);
    const dmgSharePct = Math.round((g.dmgShare || 0) * 100);
    const csPerMin = (g.cs / Math.max(1, g.minutes)).toFixed(1);

    return `
      <article class="overview-match-card profile-match-card ${isRemake ? 'remake' : isWin ? 'win' : 'loss'}" data-match-id="${esc(g.matchId)}">
        <div class="overview-match-header">
          <div class="feed-header-left">
            <span class="feed-badge-result ${isRemake ? 'remake' : isWin ? 'win' : 'loss'}">
              ${isRemake ? 'REMAKE' : isWin ? 'VICTORIA' : 'DERROTA'}
            </span>
            ${isSurrender && !isRemake ? `
              <span class="feed-badge-surrender ${isWin ? 'enemy' : 'team'}" title="${isWin ? 'Victoria por rendición del equipo enemigo' : 'Derrota por rendición'}">
                Surrender
              </span>
            ` : ''}
            <span class="feed-badge-queue">${qName}</span>
            <span class="feed-badge-time">
              ${g.minutes}m
              ${matchLpDelta != null ? `
                <span class="feed-badge-lp ${matchLpDelta > 0 ? 'pos' : matchLpDelta < 0 ? 'neg' : 'zero'}" title="${matchLpDelta > 0 ? `Ganó +${matchLpDelta} LP` : matchLpDelta < 0 ? `Perdió ${matchLpDelta} LP` : 'Sin variación de LP'}">
                  ${matchLpDelta > 0 ? `+${matchLpDelta} LP ▲` : matchLpDelta < 0 ? `${matchLpDelta} LP ▼` : '±0 LP'}
                </span>
              ` : ''}
            </span>
            <span class="feed-badge-date">${formatMatchDate(g.endTs)}</span>
          </div>
          <div class="feed-header-right">
            <span class="feed-btn-view-match">Ver 5v5 completo →</span>
          </div>
        </div>

        <div class="overview-match-participants">
          <div class="overview-participant-row">
            <!-- Identity -->
            <div class="overview-p-left">
              <div class="overview-champ-wrap">
                <img class="overview-champ-img" src="${champImg(champName)}" alt="${esc(champName)}" onerror="this.src='logo.jpg'">
                <span class="overview-role-badge">${ROLE[g.position] ?? g.position ?? 'MID'}</span>
              </div>
              <div class="overview-identity-wrap">
                <div class="overview-player-name">
                  <strong>${esc(p.name)}</strong>
                </div>
                <div class="overview-champ-line">
                  <span class="overview-champ-name">${esc(champName)}</span>
                  ${g.mvp ? `<span class="overview-honor-tag mvp" title="${esc((I18N[currentLang] || I18N.es).ui.tooltipMvp)}">MVP</span>` : ''}
                  ${g.ace ? `<span class="overview-honor-tag ace" title="${esc((I18N[currentLang] || I18N.es).ui.tooltipAce)}">ACE</span>` : ''}
                  ${g.mochila ? `<span class="overview-honor-tag mochila" title="${esc((I18N[currentLang] || I18N.es).ui.tooltipMochila)}">🎒 MOCHILA</span>` : ''}
                </div>
              </div>
            </div>

            <!-- KDA -->
            <div class="overview-kda-group">
              <div class="overview-kda-numbers">
                <strong>${g.kills}</strong> / <span class="deaths">${g.deaths}</span> / <strong>${g.assists}</strong>
              </div>
              <div class="overview-kda-sub">
                <strong style="color:var(--text-primary);">${kdaRatio}</strong> KDA · <span>${kpPct}% KP</span>
              </div>
            </div>

            <!-- Score OP Score & Place -->
            <div class="overview-score-group">
              <div class="overview-score-box">
                <span class="overview-score-tag opgg-source" title="Calificación oficial de OP.GG (1 a 10)">
                  <span class="score-lbl">OP.GG</span>
                  <span class="score-val">${g.score?.toFixed(1) || '—'}</span>
                </span>
                <span class="overview-place-tag ${g.place === 1 ? 'top-1' : g.place <= 3 ? 'top-3' : 'mid'}" title="Posición ${g.place || 5} de 10 jugadores en la partida">
                  ${g.place ? `${g.place}/10` : '—'}
                </span>
              </div>
            </div>

            <!-- Lane Opponent Matchup (Rival en Línea) -->
            <div class="overview-rival-box">
              ${g.opp ? `
                <div class="overview-rival-title">Rival en Línea:</div>
                <div class="overview-rival-content">
                  <img class="overview-rival-champ-img" src="${champImg(g.opp.champion)}" alt="${esc(resolveChampName(g.opp.champion))}" title="${esc(resolveChampName(g.opp.champion))}" onerror="this.src='logo.jpg'">
                  <div class="overview-rival-info">
                    <span class="overview-rival-status ${g.score >= (g.opp.score || 0) ? 'win' : 'loss'}">
                      ${g.score >= (g.opp.score || 0) ? 'Ganó vs' : 'Perdió vs'}
                    </span>
                    <span class="overview-rival-scores">
                      Score: ${g.score?.toFixed(1) || '—'} vs ${g.opp.score?.toFixed(1) || '—'}
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
                <strong>${(g.damage / 1000).toFixed(1)}k</strong>
                <span class="stat-sub">(${dmgSharePct}%)</span>
              </div>
              <div class="overview-stat-item" title="Súbditos y monstruos asesinados">
                <span class="stat-lbl">CS:</span>
                <strong>${g.cs}</strong>
                <span class="stat-sub">(${csPerMin}/m)</span>
              </div>
              <div class="overview-stat-item" title="Oro total acumulado">
                <span class="stat-lbl">Oro:</span>
                <strong>${(g.gold / 1000).toFixed(1)}k</strong>
              </div>
              <div class="overview-stat-item" title="Puntuación de visión">
                <span class="stat-lbl">Visión:</span>
                <strong>${g.vision || 0}</strong>
              </div>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Pagination controls
  renderProfileMatchesPagination(totalPages, totalMatches, startIdx, endIdx, p);

  // Card click event -> openMatchModal
  feed.querySelectorAll('.overview-match-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.overview-mobile-toggle-btn')) return;
      openMatchModal(card.dataset.matchId);
    });
  });

  // Mobile expandable stats toggle
  feed.querySelectorAll('.overview-mobile-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
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
}

function renderProfileMatchesPagination(totalPages, totalMatches, startIdx, endIdx, p) {
  const container = $('#profile-matches-pagination');
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = `
      <div class="matches-pagination-info">
        Mostrando todas las <strong>${totalMatches}</strong> partidas
      </div>
    `;
    return;
  }

  const pages = getPaginationPages(currentProfileMatchPage, totalPages);
  const pageBtnsHtml = pages.map((page) => {
    if (page === '...') {
      return '<span style="color:var(--text-secondary); padding:0 4px; font-weight:700;">…</span>';
    }
    return `<button class="pagination-btn ${page === currentProfileMatchPage ? 'active' : ''}" data-ppage="${page}">${page}</button>`;
  }).join('');

  container.innerHTML = `
    <div class="matches-pagination-info">
      Página <strong>${currentProfileMatchPage}</strong> de <strong>${totalPages}</strong> &middot; Mostrando <strong>${startIdx + 1}–${Math.min(endIdx, totalMatches)}</strong> de <strong>${totalMatches}</strong> partidas
    </div>
    <div class="matches-pagination-controls">
      <button class="pagination-btn" id="prev-profile-matches-page" ${currentProfileMatchPage === 1 ? 'disabled' : ''}>
        Anterior
      </button>
      ${pageBtnsHtml}
      <button class="pagination-btn" id="next-profile-matches-page" ${currentProfileMatchPage === totalPages ? 'disabled' : ''}>
        Siguiente
      </button>
    </div>
  `;

  container.querySelectorAll('button[data-ppage]').forEach((btn) => {
    btn.onclick = () => {
      currentProfileMatchPage = Number(btn.dataset.ppage);
      renderProfileMatchesFeed(p);
      $('#profile-matches-feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });

  const prevBtn = $('#prev-profile-matches-page');
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (currentProfileMatchPage > 1) {
        currentProfileMatchPage--;
        renderProfileMatchesFeed(p);
        $('#profile-matches-feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
  }

  const nextBtn = $('#next-profile-matches-page');
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (currentProfileMatchPage < totalPages) {
        currentProfileMatchPage++;
        renderProfileMatchesFeed(p);
        $('#profile-matches-feed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
  }
}

$('#back-from-player-btn')?.addEventListener('click', () => switchView('leaderboard'));

// ---------- Sort controls ----------
function setLeaderboardSort(sortKey) {
  if (!sortKey) return;
  currentSort = sortKey;
  $$('.pill-btn[data-sort]').forEach((b) => {
    b.classList.toggle('active', b.dataset.sort === sortKey);
  });
  $$('.leaderboard-table-header [data-sort-col]').forEach((col) => {
    col.classList.toggle('active', col.dataset.sortCol === sortKey);
  });
  renderPodium();
  renderLeaderboards();
}

$$('.pill-btn[data-sort]').forEach((btn) => {
  btn.addEventListener('click', () => {
    setLeaderboardSort(btn.dataset.sort);
  });
});

$$('.leaderboard-table-header [data-sort-col]').forEach((col) => {
  col.addEventListener('click', () => {
    setLeaderboardSort(col.dataset.sortCol);
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

// Weekly MVP Leaderboard Modal
function openWeeklyMvpModal() {
  const dialog = $('#weekly-mvp-dialog');
  const content = $('#weekly-mvp-content');
  if (!dialog || !content) return;

  const ps = board?.players ?? [];
  if (!ps.length) {
    content.innerHTML = '<div style="text-align:center; padding:30px;" class="muted">No hay jugadores registrados en el ranking.</div>';
    dialog.showModal();
    return;
  }

  const playerStats = ps.map((p) => {
    const w = getWeeklyStats(p);
    return {
      player: p,
      w,
      games: w?.games ?? 0,
      eligible: Boolean(w && w.games >= 3),
      lpWeek: w?.lpWeek ?? (p.lpDelta?.week ?? 0),
      score: w?.performanceIndex ?? 0,
    };
  });

  playerStats.sort((a, b) => {
    if (a.eligible && b.eligible) {
      const posA = a.lpWeek >= 0 ? 1 : 0;
      const posB = b.lpWeek >= 0 ? 1 : 0;
      if (posB !== posA) return posB - posA;
      return b.score - a.score;
    }
    if (a.eligible && !b.eligible) return -1;
    if (!a.eligible && b.eligible) return 1;
    if (a.games > 0 && b.games > 0) return b.score - a.score;
    if (a.games > 0) return -1;
    if (b.games > 0) return 1;
    return (b.player.solo?.value ?? 0) - (a.player.solo?.value ?? 0);
  });

  const weekStartDate = board?.weekStart ? new Date(board.weekStart).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : 'esta semana';
  const metaBadge = $('#weekly-mvp-meta-badge');
  if (metaBadge) {
    metaBadge.textContent = `🏆 RANKING SEMANAL · Desde ${weekStartDate}`;
  }

  content.innerHTML = `
    <!-- Explicación de la fórmula (oculta por defecto, se abre con el signo ?) -->
    <div class="weekly-formula-card" id="weekly-formula-card" hidden>
      <div class="weekly-formula-header">
        <span class="weekly-formula-title">📐 ¿Cómo se calcula el MVP de la semana?</span>
        <button type="button" class="weekly-formula-close-btn" id="close-weekly-formula-btn" aria-label="Cerrar explicación">&times;</button>
      </div>
      <p class="weekly-formula-desc">
        El MVP semanal se determina calculando un <strong>Índice de Rendimiento Compuesto</strong> que premia el impacto individual real, la consistencia de victorias y la progresión competitiva en clasificatorias:
      </p>
      <div class="weekly-formula-tags">
        <div class="formula-pill">
          <span class="formula-weight">OP.GG Score × 10</span>
          <span class="formula-concept">Calificación oficial OP.GG</span>
        </div>
        <div class="formula-pill">
          <span class="formula-weight">Win Rate × 25</span>
          <span class="formula-concept">% de victorias</span>
        </div>
        <div class="formula-pill">
          <span class="formula-weight">Net Wins × 2.5</span>
          <span class="formula-concept">Victorias − Derrotas</span>
        </div>
        <div class="formula-pill">
          <span class="formula-weight">LP Ganados × 0.15</span>
          <span class="formula-concept">Subida de rango</span>
        </div>
        <div class="formula-pill">
          <span class="formula-weight">MVPs × 1.5</span>
          <span class="formula-concept">Mejor de la partida</span>
        </div>
        <div class="formula-pill">
          <span class="formula-weight">Actividad × 0.3</span>
          <span class="formula-concept">Partidas (máx. 15)</span>
        </div>
      </div>
      <div class="weekly-formula-rules">
        <span>⚠️ <strong>Criterios de clasificación:</strong> Se requiere un mínimo de <strong>3 partidas</strong> en la semana. Los jugadores con balance de LP positivo tienen prioridad sobre balances negativos.</span>
      </div>

      <!-- Sección expandible "Ver más": Por qué se calcula así -->
      <details class="weekly-why-details">
        <summary class="weekly-why-summary">
          <span>💡 ¿Por qué se calcula así y no solo con Win Rate o LP? <strong>(Ver más)</strong></span>
          <span class="why-chevron">▾</span>
        </summary>
        <div class="weekly-why-content">
          <div class="why-item">
            <strong class="why-title">🚫 ¿Por qué no solo por Win Rate?</strong>
            <p>Alguien podría jugar <strong>1 sola partida</strong>, ganarla (100% Win Rate) y ser MVP toda la semana sin volver a jugar, superando a quien jugó 20 partidas con 70% de victorias.</p>
          </div>
          <div class="why-item">
            <strong class="why-title">🚫 ¿Por qué no solo por OP.GG Score?</strong>
            <p>Alguien podría jugar pasivo cuidando solo su KDA, perder 5 partidas seguidas (0% Win Rate) y aun así ser MVP sin aportar victorias al equipo.</p>
          </div>
          <div class="why-item">
            <strong class="why-title">🚫 ¿Por qué no solo por cantidad de partidas?</strong>
            <p>Ganaría simplemente quien juegue 40 partidas con 30% de win rate sobre quien jugó 8 partidas impecables con 80% de win rate.</p>
          </div>
          <div class="why-item">
            <strong class="why-title">🚫 ¿Por qué no solo por LP subidos?</strong>
            <p>Las ganancias de LP dependen del MMR y la división (en rangos bajos se gana más LP por partida que en rangos altos), lo que crearía ventajas disparejas.</p>
          </div>
          <div class="why-conclusion">
            <span>⚖️ <strong>El equilibrio:</strong> El <strong>OP.GG Score (×10)</strong> es el pilar principal (~60% del puntaje) y evalúa el impacto individual real. El <strong>Win Rate</strong> y las <strong>Victorias Netas</strong> aseguran que ganar sea determinante, y los <strong>LP</strong> junto a los <strong>MVPs</strong> premian a quienes realmente carrilean y suben de rango.</span>
          </div>
        </div>
      </details>
    </div>

    <div class="weekly-ranking-list">
      <div class="weekly-ranking-title-row">
        <span>TABLA DE POSICIONES SEMANAL</span>
        <span>${playerStats.filter((x) => x.eligible).length} clasificados</span>
      </div>
      ${playerStats.map((item, idx) => {
        const p = item.player;
        const w = item.w;
        const rankNum = idx + 1;
        const isLeader = idx === 0 && item.eligible;
        const rankBadgeClass = isLeader ? 'rank-gold' : rankNum === 2 ? 'rank-silver' : rankNum === 3 ? 'rank-bronze' : 'rank-normal';
        const iconUrl = iconImg(p.profileIconId);
        const soloTier = p.solo?.label ?? 'Unranked';

        // Desglose de sumandos del cálculo
        let mathHtml = '';
        if (w) {
          const scorePts = w.avgScore * 10;
          const wrPts = (w.wins / w.games) * 25;
          const netWins = Math.max(0, w.wins - w.losses);
          const netPts = netWins * 2.5;
          const lpPts = Math.max(0, w.lpWeek) * 0.15;
          const mvpPts = w.mvps * 1.5;
          const actPts = Math.min(w.games, 15) * 0.3;
          const totalSum = scorePts + wrPts + netPts + lpPts + mvpPts + actPts;

          mathHtml = `
            <div class="weekly-math-simple">
              <span class="math-simple-lbl">Suma del cálculo:</span>
              <span class="math-simple-terms">
                <span class="m-part" title="Calificación oficial OP.GG: ${w.avgScore.toFixed(1)} × 10"><strong>${scorePts.toFixed(1)}</strong> <small>OP.GG</small></span>
                <span class="m-op">+</span>
                <span class="m-part" title="Win Rate: ${w.winrate}% × 25"><strong>${wrPts.toFixed(1)}</strong> <small>WR</small></span>
                <span class="m-op">+</span>
                <span class="m-part" title="Victorias netas: ${netWins} × 2.5"><strong>${netPts.toFixed(1)}</strong> <small>NetV</small></span>
                <span class="m-op">+</span>
                <span class="m-part" title="LP ganado: ${Math.max(0, w.lpWeek)} × 0.15"><strong>${lpPts.toFixed(1)}</strong> <small>LP</small></span>
                <span class="m-op">+</span>
                <span class="m-part" title="Distinciones MVP: ${w.mvps} × 1.5"><strong>${mvpPts.toFixed(1)}</strong> <small>MVPs</small></span>
                <span class="m-op">+</span>
                <span class="m-part" title="Partidas jugadas: ${Math.min(w.games, 15)} × 0.3"><strong>${actPts.toFixed(1)}</strong> <small>Part.</small></span>
              </span>
            </div>
          `;
        }

        return `
          <div class="weekly-player-card ${isLeader ? 'is-leader' : ''}" data-puuid="${esc(p.puuid)}">
            <div class="weekly-card-left">
              <div class="weekly-rank-number ${rankBadgeClass}">
                ${isLeader ? '👑' : `#${rankNum}`}
              </div>
              <img class="weekly-player-avatar" src="${iconUrl}" alt="${esc(p.name)}" onerror="this.src='logo.jpg'">
              <div class="weekly-player-info">
                <div class="weekly-player-name-line">
                  <strong class="weekly-player-name">${esc(p.name)}</strong>
                  ${p.nickname ? `<span class="weekly-player-nick">"${esc(p.nickname.title)}"</span>` : ''}
                </div>
                <div class="weekly-player-meta">
                  <span class="weekly-solo-tier">${esc(soloTier)}</span>
                  ${isLeader ? `<span class="weekly-status-badge leader">👑 LÍDER MVP</span>`
                    : item.eligible ? `<span class="weekly-status-badge ok">✓ CLASIFICADO</span>`
                    : item.games > 0 ? `<span class="weekly-status-badge pending">⏳ ${item.games}/3 partidas</span>`
                    : `<span class="weekly-status-badge none">SIN ACTIVIDAD</span>`}
                </div>
              </div>
            </div>

            <div class="weekly-card-right">
              <div class="weekly-score-box">
                <span class="weekly-score-val">${item.score > 0 ? item.score.toFixed(1) : '—'}</span>
                <span class="weekly-score-lbl">PUNTOS</span>
              </div>
            </div>

            <div class="weekly-card-breakdown">
              ${w ? `
                <div class="w-stat" title="Partidas jugadas y porcentaje de victorias">
                  <span class="w-lbl">WR:</span>
                  <strong class="w-val">${w.winrate}%</strong>
                  <span class="w-sub">(${w.wins}V - ${w.losses}D)</span>
                </div>
                <div class="w-stat" title="Calificación oficial OP.GG promedio">
                  <span class="w-lbl">OP.GG:</span>
                  <strong class="w-val">★ ${w.avgScore.toFixed(1)}</strong>
                </div>
                <div class="w-stat ${w.lpWeek > 0 ? 'pos' : w.lpWeek < 0 ? 'neg' : ''}" title="Progreso de LP semanal">
                  <span class="w-lbl">LP:</span>
                  <strong class="w-val">${w.lpWeek > 0 ? `+${w.lpWeek}` : w.lpWeek} LP</strong>
                </div>
                <div class="w-stat" title="Premios MVP en partidas individuales">
                  <span class="w-lbl">MVPs:</span>
                  <strong class="w-val">${w.mvps}</strong>
                </div>
                <div class="w-stat" title="KDA Ratio">
                  <span class="w-lbl">KDA:</span>
                  <strong class="w-val">${w.kda}</strong>
                </div>
              ` : `
                <div class="w-stat muted">Sin partidas registradas esta semana.</div>
              `}
            </div>

            ${mathHtml}
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Botón para cerrar la tarjeta de fórmula
  $('#close-weekly-formula-btn')?.addEventListener('click', () => {
    const card = $('#weekly-formula-card');
    if (card) card.hidden = true;
    $('#weekly-help-btn')?.classList.remove('is-active');
  });

  content.querySelectorAll('.weekly-player-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button, a')) return;
      const puuid = card.getAttribute('data-puuid');
      if (puuid && window.viewPlayerProfile) {
        dialog.close();
        window.viewPlayerProfile(puuid);
      }
    });
  });

  // Asegurar que la tarjeta de explicación empiece oculta al entrar
  const formulaCard = $('#weekly-formula-card');
  if (formulaCard) formulaCard.hidden = true;
  $('#weekly-help-btn')?.classList.remove('is-active');

  dialog.showModal();
}
window.openWeeklyMvpModal = openWeeklyMvpModal;

// Botón de ayuda '?' en la cabecera del modal
$('#weekly-help-btn')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const card = $('#weekly-formula-card');
  if (card) {
    const willShow = card.hidden;
    card.hidden = !willShow;
    $('#weekly-help-btn')?.classList.toggle('is-active', willShow);
    if (willShow) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('#mvp-tag-pill-btn, .mvp-tag-pill');
  if (btn) {
    e.preventDefault();
    openWeeklyMvpModal();
  }
});

$('#close-weekly-mvp-btn')?.addEventListener('click', () => $('#weekly-mvp-dialog')?.close());
$('#cancel-weekly-mvp-btn')?.addEventListener('click', () => $('#weekly-mvp-dialog')?.close());
$('#weekly-mvp-dialog')?.addEventListener('click', (e) => {
  if (e.target === $('#weekly-mvp-dialog')) $('#weekly-mvp-dialog').close();
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
plus?.install({ getBoard: () => board, reload: load, switchView, openMatchModal, toast, esc, champImg, iconImg, tierColor, ROLE, getChampSplashUrl });

load().then(pollStatus);
