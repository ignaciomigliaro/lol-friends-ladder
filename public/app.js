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
    player: 'Perfil de Invocador',
  };
  const titleEl = $('#page-title');
  if (titleEl) titleEl.textContent = titles[viewName] ?? 'Dashboard';

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
  } else if (raw === 'player' || raw.startsWith('player:')) {
    const puuid = raw.startsWith('player:') ? raw.replace('player:', '') : board?.players?.[0]?.puuid;
    if (puuid) window.viewPlayerProfile?.(puuid);
  } else if (['overview', 'leaderboard', 'duels', 'synergy', 'apodos'].includes(raw)) {
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
        <div class="profile-match-card ${win ? 'win' : 'loss'}">
          <div style="font-weight:700; color:${win ? 'var(--cyan)' : 'var(--danger)'}; min-width:60px;">${win ? 'VICTORIA' : 'DERROTA'}</div>
          <div class="muted" style="min-width:90px;">${g.queue} · ${g.minutes}m</div>
          <div style="flex:1;">
            ${g.players.map((p) => `<span style="margin-right:10px; font-weight:600;">${esc(p.name)} (${esc(p.champion)}) Score: <strong style="color:var(--gold)">${p.score.toFixed(1)}</strong></span>`).join('')}
          </div>
        </div>
      `;
    }).join('') || '<div class="muted">Aún no se han detectado partidas donde 2+ amigos jueguen en el mismo equipo.</div>';
  }
}

// ---------- Apodos & Roasts ----------
function renderApodos() {
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
        <div class="profile-match-card ${g.win ? 'win' : 'loss'}">
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
        </div>
      `).join('') || '<div class="muted">No hay partidas registradas.</div>'}
    </div>
  `;

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

// WhatsApp Share button
$('#header-share-btn')?.addEventListener('click', async () => {
  const res = await fetch('/api/whatsapp').catch(() => null);
  const text = res?.ok ? await res.text() : '';
  if (text) {
    await navigator.clipboard.writeText(text);
    toast('¡Texto formateado copiado al portapapeles!');
  }
});

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
    handleHash();
  } catch (err) {
    console.error('Failed to load leaderboard data:', err);
  }
}

load().then(pollStatus);
