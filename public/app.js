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

function ddragon(kind, name) {
  const v = board?.ddragonVersion ?? '14.24.1';
  if (!name) return '';
  return `https://ddragon.leagueoflegends.com/cdn/${v}/img/${kind}/${name}.png`;
}
const champImg = (c) => ddragon('champion', board?.champIds?.[c] ?? (c === 'FiddleSticks' ? 'Fiddlesticks' : c));
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

  const titles = {
    overview: 'Overview Dashboard',
    leaderboard: 'Tabla de Clasificación',
    duels: 'Arena de Duelos 1v1',
    synergy: 'Sinergia & Partidas en Grupo',
    apodos: 'Apodos de la Semana',
    records: 'Salón de la Fama & Récords',
    meta: 'Meta & Champion Pool',
    player: 'Perfil de Invocador',
  };
  const titleEl = $('#page-title');
  if (titleEl) titleEl.textContent = titles[viewName] ?? 'Dashboard';

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

$('#mobile-toggle')?.addEventListener('click', () => {
  $('#sidebar')?.classList.toggle('mobile-open');
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

// ---------- render MVP of the week ----------
function renderMvp() {
  const container = $('#mvp-container');
  if (!container) return;
  const ps = board?.players ?? [];
  if (!ps.length) {
    container.innerHTML = '';
    return;
  }

  // MVP is the highest average score among players with positive or solid stats
  const eligible = ps.filter((p) => p.stats && p.stats.games >= 3);
  const mvp = (eligible.length ? eligible : ps).slice().sort((a, b) => (b.stats?.avgScore ?? 0) - (a.stats?.avgScore ?? 0))[0] ?? ps[0];

  const s = mvp.stats;
  const d = mvp.lpDelta?.week;
  const mainChamp = mvp.topChampions?.[0]?.champion ?? 'Aatrox';
  const champUrl = champImg(mainChamp);
  const score = s ? s.avgScore.toFixed(1) : '8.8';
  const wr = s ? `${s.winrate}%` : '65%';
  const lpWeek = d ? (d > 0 ? `+${d} LP ▲` : `${d} LP ▼`) : '+0 LP';
  const tierLabel = mvp.solo?.label ?? 'Emerald II';

  container.innerHTML = `
    <div class="mvp-banner-card">
      <div class="mvp-tag-pill">👑 MVP OF THE WEEK</div>
      <div class="mvp-inner">
        <div class="mvp-left">
          <div class="mvp-portrait-wrap">
            <img class="mvp-portrait" src="${champUrl}" alt="${esc(mainChamp)}" onerror="this.src='${iconImg(mvp.profileIconId)}'">
          </div>
          <div class="mvp-details">
            <div class="mvp-rank-line">
              <span class="mvp-rank-badge" style="color:${tierColor(mvp)}">${esc(tierLabel)}</span>
              <span class="row-nickname-badge">${mvp.nickname ? `"${mvp.nickname.title}" ${mvp.nickname.emoji}` : ''}</span>
            </div>
            <div class="mvp-name">${esc(mvp.name)}</div>
            <div class="mvp-substats">
              <span>Win Rate: <strong style="color:var(--text-primary)">${wr}</strong></span>
              <span style="color:${d >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:700;">${lpWeek}</span>
              ${s ? `<span>KDA: <strong>${s.kda}</strong></span>` : ''}
            </div>
          </div>
        </div>
        <div class="mvp-right">
          <div class="mvp-score-emblem">
            <span class="mvp-score-num">${score}</span>
            <span class="mvp-score-label">OP SCORE</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ---------- render competitive 4 stat cards ----------
function renderStatGrid() {
  const ps = board?.players ?? [];
  $('#stat-total-friends').textContent = ps.length;

  const withStats = ps.filter((p) => p.stats);
  if (withStats.length) {
    const avgWr = Math.round(withStats.reduce((acc, p) => acc + p.stats.winrate, 0) / withStats.length);
    $('#stat-avg-winrate').textContent = `${avgWr}%`;
  } else {
    $('#stat-avg-winrate').textContent = '—';
  }

  const totalWeekLp = ps.reduce((acc, p) => acc + (p.lpDelta?.week ?? 0), 0);
  const lpEl = $('#stat-total-lp');
  lpEl.textContent = signed(totalWeekLp) + ' LP';
  lpEl.style.color = totalWeekLp >= 0 ? 'var(--success)' : 'var(--danger)';

  $('#stat-total-games').textContent = board?.groupGames?.length ?? 0;
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

  const metrics = [
    { label: 'OP.GG Score', valA: pA.stats?.avgScore ?? 0, valB: pB.stats?.avgScore ?? 0, fmt: (v) => v.toFixed(1) },
    { label: 'Win Rate %', valA: pA.stats?.winrate ?? 0, valB: pB.stats?.winrate ?? 0, fmt: (v) => `${v}%` },
    { label: 'KDA Ratio', valA: pA.stats?.kda ?? 0, valB: pB.stats?.kda ?? 0, fmt: (v) => v.toFixed(2) },
    { label: 'Partidas Jugadas', valA: pA.stats?.games ?? 0, valB: pB.stats?.games ?? 0, fmt: (v) => v },
    { label: 'LP Ganados (Semana)', valA: pA.lpDelta?.week ?? 0, valB: pB.lpDelta?.week ?? 0, fmt: (v) => signed(v) + ' LP' },
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
              <div class="muted sub">Win Rate Dúo</div>
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
      unit: 'Premios MVP OP.GG',
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

    const team100 = info.participants.filter((p) => p.teamId === 100);
    const team200 = info.participants.filter((p) => p.teamId === 200);

    const win100 = team100[0]?.win;
    const kills100 = team100.reduce((acc, p) => acc + (p.kills ?? 0), 0);
    const gold100 = team100.reduce((acc, p) => acc + (p.goldEarned ?? 0), 0);

    const win200 = team200[0]?.win;
    const kills200 = team200.reduce((acc, p) => acc + (p.kills ?? 0), 0);
    const gold200 = team200.reduce((acc, p) => acc + (p.goldEarned ?? 0), 0);

    const maxDmgInMatch = Math.max(1, ...info.participants.map((p) => p.totalDamageDealtToChampions ?? 0));
    const friendPuuids = new Set((board?.players ?? []).map((p) => p.puuid));

    const renderTeam = (participants, isBlue, win, kills, gold) => {
      const teamColor = isBlue ? 'blue' : 'red';
      const teamName = isBlue ? 'Equipo Azul' : 'Equipo Rojo';
      return `
        <div class="match-team-card">
          <div class="match-team-header ${teamColor}">
            <span>${teamName} — ${win ? '🏆 VICTORIA' : '💀 DERROTA'}</span>
            <span>${kills} Kills · ${(gold / 1000).toFixed(1)}k Oro</span>
          </div>
          <table class="match-player-table">
            <thead>
              <tr style="font-size:11px; color:var(--text-muted); text-align:left; border-bottom:1px solid rgba(36,51,75,0.6);">
                <th style="padding:6px 12px;">CAMPEÓN / INVOCADOR</th>
                <th style="padding:6px 8px;">ROL</th>
                <th style="padding:6px 8px;">KDA</th>
                <th style="padding:6px 8px;">CS</th>
                <th style="padding:6px 8px;">DAÑO</th>
                <th style="padding:6px 8px;">ORO</th>
              </tr>
            </thead>
            <tbody>
              ${participants.map((p) => {
                const isFriend = friendPuuids.has(p.puuid);
                const friendObj = board?.players?.find((x) => x.puuid === p.puuid);
                const dispName = friendObj ? friendObj.name : (p.riotIdGameName || p.summonerName || p.championName);
                const dmg = p.totalDamageDealtToChampions ?? 0;
                const dmgPct = Math.round((dmg / maxDmgInMatch) * 100);
                const cs = (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0);
                const kdaRatio = ((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(1);

                return `
                  <tr class="match-player-row ${isFriend ? 'is-friend' : ''}">
                    <td>
                      <div class="match-champ-cell">
                        <img class="match-champ-icon-small" src="${champImg(p.championName)}" alt="">
                        <div class="match-player-name-wrap">
                          <strong style="color:${isFriend ? 'var(--gold-bright)' : 'var(--text-primary)'};">${esc(dispName)}</strong>
                          ${isFriend ? '<span class="match-friend-badge">★ Amigo</span>' : `<span class="muted sub">${esc(p.championName)}</span>`}
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
                    <td><span class="muted">${(p.goldEarned / 1000).toFixed(1)}k</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    };

    body.innerHTML = `
      ${renderTeam(team100, true, win100, kills100, gold100)}
      ${renderTeam(team200, false, win200, kills200, gold200)}
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
      { label: 'SCORE OP.GG', val: `${player.stats?.avgScore?.toFixed(1) ?? '—'}`, col: '#E8C982' },
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
    ctx.fillText(`Temporada 2026 · Servidor ${(player.platform ?? 'LAN').toUpperCase()} · Generado por La Grieta de los Pibes`, 70, 595);

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
        <div class="muted" style="margin-top:4px;">${esc(p.riotId)} · Región: ${esc(p.platform ?? board.platform ?? 'la1')}</div>
        <button id="open-gamer-card-btn" class="btn btn-primary" style="margin-top:12px; width:fit-content; font-size:12px; padding:6px 14px;">🃏 Generar Tarjeta de Invocador</button>
      </div>
      <div class="mvp-score-emblem">
        <span class="mvp-score-num">${p.stats ? p.stats.avgScore.toFixed(1) : '—'}</span>
        <span class="mvp-score-label">SCORE OP.GG</span>
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
      ${(p.games ?? []).slice(0, 15).map((g) => `
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
          <div style="flex:1;">
            <span class="muted sub">Score:</span> <strong style="color:var(--gold); font-size:15px;">${g.score.toFixed(1)}</strong>
            ${g.mvp ? ' <span class="stat-icon-gold" style="padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;">MVP</span>' : ''}
            ${g.ace ? ' <span class="stat-icon-purple" style="padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;">ACE</span>' : ''}
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
async function pollStatus() {
  const res = await fetch('api/status').catch(() => null);
  if (!res?.ok) {
    staticMode = true;
    return;
  }
  const st = await res.json();
  const banner = $('#sync-banner');
  const fill = $('#sync-progress-fill');
  const text = $('#sync-text');
  const refreshBtn = $('#header-refresh-btn');

  if (refreshBtn) refreshBtn.disabled = st.running;

  if (st.running) {
    banner.hidden = false;
    const { done = 0, total = 1, current } = st.progress ?? {};
    const pct = Math.round((100 * done) / Math.max(1, total));
    if (fill) fill.style.width = `${pct}%`;
    if (text) text.textContent = `Sincronizando con Riot Games: ${current ? esc(current) : ''} (${done}/${total})…`;
    setTimeout(pollStatus, 1500);
  } else {
    banner.hidden = true;
    if (st.error) toast('Error en sincronización: ' + st.error);
    if (pollStatus.wasRunning) {
      load();
    }
  }
  pollStatus.wasRunning = st.running;
}

$('#header-refresh-btn')?.addEventListener('click', async () => {
  toast('Iniciando búsqueda de partidas en Riot Games...');
  await fetch('api/refresh', { method: 'POST' }).catch(() => null);
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

// ---------- Live Game Tracker (Spectator v5) ----------
let liveTeamsOpen = {};

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

    if (data.inGame && data.games?.length > 0) {
      if (dot) dot.classList.add('live');
      if (statusText) statusText.textContent = `🔴 ${data.activeCount} en partida`;

      if (banner) {
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
              <div style="display:flex; align-items:center; gap:8px;">
                <button id="manual-live-check-btn" class="live-refresh-btn" title="Comprobar estado en vivo">🔄 Actualizar</button>
              </div>
            </div>
            <div class="live-players-grid">
              ${data.games.map((g) => {
                if (liveTeamsOpen[g.gameId] === undefined) liveTeamsOpen[g.gameId] = true;
                const isOpen = liveTeamsOpen[g.gameId];
                return `
                <div class="live-game-box" style="display:flex; flex-direction:column; gap:8px; flex:1;">
                  <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                    <div class="muted sub" style="font-size:11px; font-weight:700; color:var(--cyan);">
                      🎮 ${esc(g.queue)} · Minuto ${g.minutes} ${g.isDuo ? '· ⭐ Dúo de amigos' : g.isCivilWar ? '· ⚔️ ¡Guerra Civil!' : ''}
                    </div>
                    ${g.teams ? `
                      <button class="live-toggle-teams-btn" data-game-id="${g.gameId}">
                        👥 ${isOpen ? 'Ocultar Equipos' : 'Ver Equipos (Azul vs Rojo)'}
                      </button>
                    ` : ''}
                  </div>
                  <div style="display:flex; flex-wrap:wrap; gap:8px;">
                    ${g.friends.map((f) => `
                      <div class="live-player-chip">
                        <img class="live-champ-img" src="${champImg(f.champion)}" alt="" onerror="this.src='logo.jpg'">
                        <div>
                          <strong style="font-size:14px; color:var(--text-primary);">${esc(f.name)}</strong>
                          <div class="muted sub" style="color:var(--gold); font-size:11px;">${esc(f.champion)} · ${f.teamId === 100 ? 'Azul' : 'Rojo'}</div>
                        </div>
                        <button class="live-build-btn open-champ-build" data-champ="${esc(f.champion)}" style="margin-left:8px;" title="Ver Build y Objetos">🎒 Build</button>
                      </div>
                    `).join('')}
                  </div>

                  ${g.teams && isOpen ? `
                    <div class="live-teams-container">
                      <div class="live-teams-header">
                        <div style="display:flex; align-items:center; gap:8px;">
                          <strong style="color:var(--text-primary); font-size:13px;">🛡️ Alineación 5v5 de la Partida</strong>
                          <span class="muted sub" style="font-size:11px;">Riot Spectator v5</span>
                        </div>
                        <span class="muted sub" style="font-size:11px; color:var(--gold); font-weight:700;">🎮 ${esc(g.queue)} · Minuto ${g.minutes}</span>
                      </div>
                      <div class="live-teams-grid">
                        <!-- Blue Team -->
                        <div class="live-team-col">
                          <div class="live-team-badge blue">
                            <span>🛡️ Equipo Azul</span>
                            <span style="font-size:10px; opacity:0.8;">Lado Azul</span>
                          </div>
                          ${(g.teams?.blue ?? []).map((p) => `
                            <div class="live-participant-row ${p.isFriend ? 'friend' : ''}">
                              <div class="live-participant-left">
                                <img class="live-champ-thumb" src="${champImg(p.champion)}" alt="" onerror="this.src='logo.jpg'">
                                <div class="live-spells-col">
                                  ${spellImg(p.spell1Id) ? `<img class="live-spell-thumb" src="${spellImg(p.spell1Id)}" title="Hechizo 1" alt="">` : ''}
                                  ${spellImg(p.spell2Id) ? `<img class="live-spell-thumb" src="${spellImg(p.spell2Id)}" title="Hechizo 2" alt="">` : ''}
                                </div>
                                <div class="live-participant-names">
                                  <span class="live-participant-player">
                                    ${esc(p.summonerName)}
                                    ${p.isFriend ? `<span class="live-friend-tag">★ Amigo</span>` : ''}
                                  </span>
                                  <span class="live-participant-champ">${esc(p.champion)}</span>
                                </div>
                              </div>
                              <button class="live-build-btn open-champ-build" data-champ="${esc(p.champion)}" style="padding:2px 7px; font-size:10px;" title="Ver Build de ${esc(p.champion)}">🎒 Build</button>
                            </div>
                          `).join('')}
                          ${(g.bans?.blue?.length ?? 0) > 0 ? `
                            <div class="live-bans-row">
                              <span style="font-size:10px;">Banes:</span>
                              ${g.bans.blue.map((b) => `<img class="live-ban-thumb" src="${champImg(b.champion)}" title="${esc(b.champion)}" alt="" onerror="this.style.display='none'">`).join('')}
                            </div>
                          ` : ''}
                        </div>

                        <!-- Center VS Divider -->
                        <div class="live-vs-divider">
                          <div class="live-vs-circle">VS</div>
                          <span class="muted sub" style="font-size:10px; font-weight:700; color:var(--gold);">Min ${g.minutes}</span>
                        </div>

                        <!-- Red Team -->
                        <div class="live-team-col">
                          <div class="live-team-badge red">
                            <span>🛡️ Equipo Rojo</span>
                            <span style="font-size:10px; opacity:0.8;">Lado Rojo</span>
                          </div>
                          ${(g.teams?.red ?? []).map((p) => `
                            <div class="live-participant-row ${p.isFriend ? 'friend' : ''}">
                              <div class="live-participant-left">
                                <img class="live-champ-thumb" src="${champImg(p.champion)}" alt="" onerror="this.src='logo.jpg'">
                                <div class="live-spells-col">
                                  ${spellImg(p.spell1Id) ? `<img class="live-spell-thumb" src="${spellImg(p.spell1Id)}" title="Hechizo 1" alt="">` : ''}
                                  ${spellImg(p.spell2Id) ? `<img class="live-spell-thumb" src="${spellImg(p.spell2Id)}" title="Hechizo 2" alt="">` : ''}
                                </div>
                                <div class="live-participant-names">
                                  <span class="live-participant-player">
                                    ${esc(p.summonerName)}
                                    ${p.isFriend ? `<span class="live-friend-tag">★ Amigo</span>` : ''}
                                  </span>
                                  <span class="live-participant-champ">${esc(p.champion)}</span>
                                </div>
                              </div>
                              <button class="live-build-btn open-champ-build" data-champ="${esc(p.champion)}" style="padding:2px 7px; font-size:10px;" title="Ver Build de ${esc(p.champion)}">🎒 Build</button>
                            </div>
                          `).join('')}
                          ${(g.bans?.red?.length ?? 0) > 0 ? `
                            <div class="live-bans-row">
                              <span style="font-size:10px;">Banes:</span>
                              ${g.bans.red.map((b) => `<img class="live-ban-thumb" src="${champImg(b.champion)}" title="${esc(b.champion)}" alt="" onerror="this.style.display='none'">`).join('')}
                            </div>
                          ` : ''}
                        </div>
                      </div>
                    </div>
                  ` : ''}
                </div>
              `;
              }).join('')}
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
            <div style="display:flex; align-items:center; gap:8px;">
              <span>🎮</span>
              <span>Ningún amigo está en partida en este momento.</span>
            </div>
            <button id="manual-live-check-btn" class="live-refresh-btn" title="Comprobar con Riot Games">🔄 Comprobar en vivo</button>
          </div>
        `;
      }
    }

    $('#manual-live-check-btn')?.addEventListener('click', () => checkLiveTracker(true));
    $$('.live-toggle-teams-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const gid = btn.dataset.gameId;
        liveTeamsOpen[gid] = !liveTeamsOpen[gid];
        checkLiveTracker();
      });
    });
    $$('.open-champ-build').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openBuildModal(btn.dataset.champ);
      });
    });
  } catch (err) {
    console.warn('Error checking live tracker:', err);
  }
}

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
    board = await (await fetch(`leaderboard.json?t=${Date.now()}`, { cache: 'no-store' })).json();
    $('#group-subtitle').textContent = board.groupName ?? 'La Grieta de los Pibes';
    $('#sidebar-region').textContent = `Temporada 2026 · ${(board.platform ?? 'LAN').toUpperCase()}`;

    renderMvp();
    renderStatGrid();
    renderPodium();
    renderLeaderboards();
    populateDuelSelectors();
    renderSynergy();
    renderApodos();
    renderRecords();
    renderMeta();
    handleHash();
    checkLiveTracker();
    setInterval(checkLiveTracker, 60_000);
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
