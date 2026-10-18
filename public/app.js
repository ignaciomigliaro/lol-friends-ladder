const $ = (s) => document.querySelector(s);

const TIER_COLORS = {
  IRON: '#8b8580', BRONZE: '#b07a5c', SILVER: '#a9b4c2', GOLD: '#e3b453', PLATINUM: '#4fc1b4',
  EMERALD: '#2fcf7a', DIAMOND: '#7b9bff', MASTER: '#c06bf0', GRANDMASTER: '#f05a4f', CHALLENGER: '#f6d27a',
};
const ROLE = { TOP: 'Top', JUNGLE: 'Jungle', MIDDLE: 'Mid', BOTTOM: 'ADC', UTILITY: 'Support' };

let board = null;
let staticMode = false;
const SORTS = ['rank', 'score', 'winrate', 'week'];
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
const champImg = (c) => ddragon('champion', c === 'FiddleSticks' ? 'Fiddlesticks' : c);

function timeAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
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
  }[sortBy];
  return ps.sort((a, b) => by(b) - by(a));
}

// ---------- rendering ----------

function deltaHtml(p) {
  const d = p.lpDelta?.week;
  if (d == null || d === 0) return '';
  return `<span class="delta ${d > 0 ? 'up' : 'down'}">${signed(d)} LP this week</span>`;
}

function rankHtml(p) {
  const wl = p.solo ? `${p.solo.wins}W ${p.solo.losses}L · ${Math.round((100 * p.solo.wins) / (p.solo.wins + p.solo.losses))}%` : 'No solo/duo games';
  return `<div class="tier" style="color:${tierColor(p)}">${esc(p.solo?.label ?? 'Unranked')}</div>
    <div class="sub">${wl}</div>${deltaHtml(p)}`;
}

const QUEUE = { 420: 'Solo/Duo', 440: 'Flex' };
const ordinal = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

function gameHtml(g) {
  const kda = ((g.kills + g.assists) / Math.max(1, g.deaths)).toFixed(2);
  const badge = g.mvp ? '<span class="badge mvp">MVP</span>' : g.ace ? '<span class="badge ace">ACE</span>' : '';
  return `<div class="game ${g.win ? 'w' : ''}">
    <b></b>
    <img src="${champImg(g.champion)}" alt="${esc(g.champion)}" onerror="this.style.visibility='hidden'">
    <div><strong>${g.kills} / ${g.deaths} / ${g.assists}</strong><div class="sub">${kda} KDA · ${g.cs} CS</div></div>
    <div class="hide-sm sub">${esc(g.champion)} · ${ROLE[g.position] ?? '—'} · ${QUEUE[g.queueId] ?? 'Ranked'}<br>${g.win ? 'Victory' : 'Defeat'} · ${g.minutes}m · ${timeAgo(g.endTs)}</div>
    <div class="game-place" title="Finished ${ordinal(g.place)} of the 10 players by score">${badge}<span class="badge place">${ordinal(g.place)} / 10</span></div>
    <span class="score ${scoreClass(g.score)}">${g.score.toFixed(1)}</span>
  </div>`;
}

function playerHtml(p, i) {
  const s = p.stats;
  const form = (p.games ?? []).slice(0, 10).reverse().map((g) => `<i class="${g.win ? 'w' : ''}" title="${esc(g.champion)} ${g.score}"></i>`).join('');
  const champs = (p.topChampions ?? []).map((c) => `<img src="${champImg(c.champion)}" title="${esc(c.champion)} · ${c.games}g · ${c.score} avg" alt="${esc(c.champion)}" onerror="this.remove()">`).join('');
  const medal = ['🥇', '🥈', '🥉'][i] ?? i + 1;
  const isOpen = open.has(p.puuid);

  return `<article class="player">
    <div class="row" data-puuid="${esc(p.puuid)}">
      <div class="pos">${medal}</div>
      <img class="avatar" style="border-color:${tierColor(p)}" src="${ddragon('profileicon', p.profileIconId)}" alt="" onerror="this.style.visibility='hidden'">
      <div>
        <div class="name">${esc(p.name)}</div>
        ${p.nickname ? `<div class="nick" title="${esc(p.nickname.reason)}">“${esc(p.nickname.title)}” ${p.nickname.emoji}</div>` : ''}
        <div class="sub">${esc(p.riotId)}${p.level ? ` · Lv ${p.level}` : ''}</div>
        <div class="sm-only">${rankHtml(p)}</div>
      </div>
      <div class="hide-sm">${rankHtml(p)}</div>
      <div title="Average score over last ${s?.games ?? 0} ranked games">
        <span class="score ${s ? scoreClass(s.avgScore) : ''}">${s ? s.avgScore.toFixed(1) : '–'}</span>
        <div class="sub">${s ? `${s.mvp} MVP · ${s.ace} ACE` : 'no games'}</div>
      </div>
      <div class="hide-sm">
        <div class="form">${form}</div>
        <div class="sub">${s ? `${s.winrate}% WR · ${s.kda} KDA · ${s.games}g` : ''}</div>
      </div>
      <div class="hide-sm"><div class="champs">${champs}</div>
        <div class="sub">${s?.streak >= 3 ? `🔥 ${s.streak} win streak` : s?.streak <= -3 ? `🧊 ${-s.streak} loss streak` : ''}</div></div>
    </div>
    ${isOpen && p.nickname ? `<div class="games nick-reason">${p.nickname.emoji} <strong>“${esc(p.nickname.title)}”</strong>: ${esc(p.nickname.reason)}</div>` : ''}
    ${isOpen ? `<div class="games">${(p.games ?? []).slice(0, s?.games ?? 0).map(gameHtml).join('') || '<p class="muted">No recent ranked games.</p>'}
      <a class="profile-link" href="#p/${slug(p)}">Open ${esc(p.name)}'s profile →</a></div>` : ''}
  </article>`;
}

// ---------- personal tabs ----------

const slug = (p) => encodeURIComponent(p.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-'));
let profileQueue = 'all';

// #            -> leaderboard
// #players     -> grid of all players
// #p/<slug>    -> one player's page
function route() {
  const m = location.hash.match(/^#p\/(.+)$/);
  const player = m ? board?.players.find((p) => slug(p) === m[1]) ?? null : null;
  if (player) return { view: 'player', player };
  if (location.hash === '#players' || m) return { view: 'players' };
  return { view: 'board' };
}

function renderTabs(view) {
  const onPlayers = view !== 'board';
  $('#tabs').innerHTML = `<a href="#" class="${onPlayers ? '' : 'active'}">🏆 Leaderboard</a>
    <a href="#players" class="${onPlayers ? 'active' : ''}">👤 Players <span class="count">${board.players?.length ?? 0}</span></a>`;
}

function playersGridHtml() {
  const cards = sortedPlayers().map((p) => {
    const elo = eloAnalysis(p.games ?? []);
    const focus = elo?.workOn[0];
    return `<a class="pcard" href="#p/${slug(p)}">
      <img class="avatar" style="border-color:${tierColor(p)}" src="${ddragon('profileicon', p.profileIconId)}" alt="" onerror="this.style.visibility='hidden'">
      <div class="pcard-main">
        <div class="name">${esc(p.name)}</div>
        ${p.nickname ? `<div class="nick">“${esc(p.nickname.title)}” ${p.nickname.emoji}</div>` : ''}
        <div class="tier" style="color:${tierColor(p)}">${esc(p.solo?.label ?? 'Unranked')}</div>
        ${focus ? `<div class="sub">🎯 Work on: ${focus.metric.short}</div>` : ''}
      </div>
      <span class="score ${p.stats ? scoreClass(p.stats.avgScore) : ''}">${p.stats ? p.stats.avgScore.toFixed(1) : '–'}</span>
    </a>`;
  }).join('');
  return `<p class="muted">Pick a friend to see their stats, lanes, champions and what to work on.</p><div class="pgrid">${cards}</div>`;
}

function playerSwitcherHtml(current) {
  const options = [...board.players].sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => `<option value="${slug(p)}" ${p === current ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  return `<div class="switcher"><a href="#players">← All players</a>
    <label class="sub">Player <select id="player-select">${options}</select></label></div>`;
}

// ---------- compared with players at the same elo ----------
// Benchmark = each game's lane opponent: same role, same game, so matched to the same rank/MMR.

const ELO_METRICS = [
  { key: 'damage', short: 'Damage', label: 'Damage to champions', fmt: (v) => kNum(v),
    tip: (d) => `You deal ${d.relPct}% less damage to champions than your lane opponents. Look for more trades in lane, and stay in range during fights instead of waiting for the perfect moment.` },
  { key: 'deaths', short: 'Deaths', label: 'Deaths', lowerIsBetter: true, fmt: (v) => v.toFixed(1),
    tip: (d) => `You die ${d.absDiff.toFixed(1)} more times per game than your lane opponents. Ward before walking past the river, and back off when the enemy jungler isn't on the map.` },
  { key: 'cs', short: 'CS', label: 'Minions (CS)', skipRole: 'UTILITY', fmt: (v) => Math.round(v),
    tip: (d) => `You farm ${Math.round(d.absDiff)} fewer minions per game (about ${Math.max(1, Math.round(d.absDiff / 20))} wave${Math.round(d.absDiff / 20) === 1 ? '' : 's'}). Catch side waves between fights and practice last-hitting under tower.` },
  { key: 'kp', short: 'Kill participation', label: 'Kill participation', fmt: (v) => pct(v), points: true,
    tip: (d) => `You're in ${Math.round(100 * d.absDiff)} percentage points fewer of your team's kills. Group for dragons, heralds and barons, and follow up on your jungler's ganks.` },
  { key: 'vision', short: 'Vision', label: 'Vision score', fmt: (v) => v.toFixed(1),
    tip: (d) => `Your vision score is ${d.absDiff.toFixed(1)} lower per game. Buy a control ward every time you back and use your trinket on cooldown.` },
  { key: 'objectives', short: 'Objectives', label: 'Objective damage', fmt: (v) => kNum(v),
    tip: (d) => `You do ${d.relPct}% less objective damage. After winning a fight or a trade, hit towers, dragons and grubs instead of going back to farm.` },
  { key: 'gold', short: 'Gold', label: 'Gold earned', fmt: (v) => kNum(v),
    tip: (d) => `You earn ${kNum(d.absDiff)} less gold per game. Most of it comes from CS and kills, so keep farming between fights.` },
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
  if (!e) return '<p class="muted">Not enough games with a lane opponent to compare.</p>';
  const tier = p.solo?.label?.replace(/ \d+ LP$/, '') ?? 'their rank';
  const diffText = (r) => {
    if (r.metric.points ? Math.round(100 * r.absDiff) === 0 : r.relPct === 0) return '±0';
    if (r.metric.points) return `${r.you >= r.them ? '+' : '−'}${Math.round(100 * r.absDiff)} pts`;
    return `${r.you >= r.them ? '+' : '−'}${r.relPct}%`;
  };
  const table = `<div class="table-wrap"><table class="stats">
    <thead><tr><th>Per game</th><th>${esc(p.name)}</th><th>Lane opponents</th><th>Difference</th></tr></thead>
    <tbody>${e.rows.map((r) => `<tr>
      <td>${r.metric.label}</td>
      <td><strong>${r.metric.fmt(r.you)}</strong></td>
      <td>${r.metric.fmt(r.them)}</td>
      <td class="${Math.abs(r.goodness) < GAP ? 'muted' : r.goodness > 0 ? 'up' : 'down'}"><strong>${diffText(r)}</strong>${Math.abs(r.goodness) < GAP ? ' · even' : r.goodness > 0 ? ' · better' : ' · worse'}</td>
    </tr>`).join('')}</tbody></table></div>`;

  const workOn = e.workOn.length
    ? e.workOn.map((r, i) => `<div class="advice work"><div class="advice-title">${i + 1}. ${r.metric.short}</div><p>${r.metric.tip(r)}</p></div>`).join('')
    : '<div class="advice good"><p>No clear weak spots: you match or beat your lane opponents in every stat. 👏</p></div>';
  const strengths = e.strengths.map((r) => `<span class="chip up">✅ ${r.metric.short} ${diffText(r)}</span>`).join('');

  return `<p class="muted">Compared with the enemy player in the same lane in each of these ${e.n} games. Ranked matchmaking pairs players of the same rank and MMR, so they're ${esc(p.name)}'s real peers (${esc(tier)}). Riot's API doesn't publish rank-wide averages.</p>
    <div class="headline compact">
      <div class="hl"><span class="sub">Outscored lane opponent</span><strong class="hl-num ${e.outscored * 2 >= e.n ? 'up' : 'down'}">${Math.round((100 * e.outscored) / e.n)}%</strong><span class="sub">${e.outscored} of ${e.n} games, by 0–10 score</span></div>
    </div>
    <h4>🎯 What to work on</h4>${workOn}
    ${strengths ? `<h4>💪 Strengths</h4><div class="chips">${strengths}</div>` : ''}
    <h4>Head to head</h4>${table}`;
}

const queueGames = (p) => (p.games ?? []).filter((g) => profileQueue === 'all' || String(g.queueId) === profileQueue);

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
    mvp: total((g) => g.mvp), ace: total((g) => g.ace),
  };
}

// Per-game stat tiles, each compared with the rest of the group.
const TILES = [
  { key: 'damage', label: 'Damage / game', fmt: (a) => kNum(a.damage), sub: (a) => `${pct(a.dmgShare)} of team damage` },
  { key: 'cs', label: 'Minions / game', fmt: (a) => Math.round(a.cs), sub: (a) => `${a.csMin.toFixed(1)} CS/min` },
  { key: 'deaths', label: 'Deaths / game', fmt: (a) => a.deaths.toFixed(1), sub: (a) => `${a.kills.toFixed(1)} / ${a.deaths.toFixed(1)} / ${a.assists.toFixed(1)}`, lowerIsBetter: true },
  { key: 'kp', label: 'Kill participation', fmt: (a) => pct(a.kp), sub: () => 'of team kills' },
  { key: 'objectives', label: 'Objective damage / game', fmt: (a) => kNum(a.objectives), sub: () => 'towers, dragons, barons…' },
  { key: 'vision', label: 'Vision score / game', fmt: (a) => a.vision.toFixed(1), sub: () => 'wards placed + cleared' },
  { key: 'gold', label: 'Gold / game', fmt: (a) => kNum(a.gold), sub: () => '' },
  { key: 'kda', label: 'KDA', fmt: (a) => a.kda.toFixed(2), sub: () => '(kills + assists) / deaths' },
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

function playerProfileHtml(p) {
  const games = queueGames(p);
  const a = aggregate(games);
  const others = board.players.filter((x) => x !== p).map((x) => aggregate(queueGames(x))).filter(Boolean);
  const queueChips = [['all', 'All ranked'], ['420', 'Solo/Duo'], ['440', 'Flex']]
    .map(([q, label]) => `<button data-queue="${q}" class="${profileQueue === q ? 'active' : ''}">${label}</button>`).join('');

  const header = `<section class="profile-head">
    <img class="avatar big" style="border-color:${tierColor(p)}" src="${ddragon('profileicon', p.profileIconId)}" alt="" onerror="this.style.visibility='hidden'">
    <div class="ph-main">
      <h2>${esc(p.name)}</h2>
      ${p.nickname ? `<div class="nick">“${esc(p.nickname.title)}” ${p.nickname.emoji} <span class="sub">${esc(p.nickname.reason)}</span></div>` : ''}
      <div class="sub">${esc(p.riotId)}${p.level ? ` · Level ${p.level}` : ''}</div>
    </div>
    <div class="ph-ranks">
      <div><span class="sub">Solo/Duo</span> ${rankHtml(p)}</div>
      ${p.flex ? `<div><span class="sub">Flex</span> <div class="tier" style="color:${TIER_COLORS[p.flex.tier]}">${esc(p.flex.label)}</div><div class="sub">${p.flex.wins}W ${p.flex.losses}L</div></div>` : ''}
    </div>
  </section>`;

  if (!a) return `${header}<nav class="sort">${queueChips}</nav><p class="muted">No ${profileQueue === '440' ? 'Flex' : profileQueue === '420' ? 'Solo/Duo' : 'ranked'} games in recent history.</p>`;

  const headline = `<div class="headline">
    <div class="hl"><span class="sub">Average score</span><span class="score big ${scoreClass(a.score)}">${a.score.toFixed(1)}</span><span class="sub">over ${a.n} games</span></div>
    <div class="hl"><span class="sub">Average finish in game</span><strong class="hl-num">${a.place.toFixed(1)}<small> / 10</small></strong><span class="sub">${a.mvp} MVP · ${a.ace} ACE</span></div>
    <div class="hl"><span class="sub">Win rate</span><strong class="hl-num ${a.winrate >= 50 ? 'up' : 'down'}">${Math.round(a.winrate)}%</strong><span class="sub">${a.wins}W ${a.losses}L</span></div>
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
      ${groupAvg == null ? '' : `<div class="tile-cmp ${better ? 'up' : 'down'}">${better ? '▲' : '▼'} group avg ${t.fmt({ ...a, [t.key]: groupAvg })} · #${rank} of ${all.length}</div>`}
    </div>`;
  }).join('');

  const roles = roleRows(games);
  const best = roles.find((r) => r.tag === 'best');
  const worst = roles.find((r) => r.tag === 'worst');
  const roleSummary = best
    ? `<p class="role-summary">💪 Strongest lane: <strong>${ROLE[best.role] ?? best.role}</strong> · 🥀 Weakest lane: <strong>${ROLE[worst.role] ?? worst.role}</strong></p>`
    : `<p class="role-summary muted">Not enough games in different lanes to compare (needs 2+ lanes with 2+ games each).</p>`;
  const roleTable = `<div class="table-wrap"><table class="stats">
    <thead><tr><th>Lane</th><th>Games</th><th>Win rate</th><th>Avg score</th><th>Avg finish</th><th>KDA</th><th>Dmg / game</th><th>CS / game</th></tr></thead>
    <tbody>${roles.map((r) => `<tr class="${r.tag ?? ''}">
      <td><strong>${ROLE[r.role] ?? 'Other'}</strong> ${r.tag === 'best' ? '💪' : r.tag === 'worst' ? '🥀' : ''}</td>
      <td>${r.a.n}</td>
      <td><div class="wr"><span class="bar-track"><i style="width:${r.a.winrate}%;background:${r.a.winrate >= 50 ? 'var(--win)' : 'var(--loss)'}"></i></span>${Math.round(r.a.winrate)}% <span class="sub">${r.a.wins}W ${r.a.losses}L</span></div></td>
      <td><span class="score ${scoreClass(r.a.score)}">${r.a.score.toFixed(1)}</span></td>
      <td>${r.a.place.toFixed(1)}</td>
      <td>${r.a.kda.toFixed(2)}</td>
      <td>${kNum(r.a.damage)}</td>
      <td>${Math.round(r.a.cs)}</td>
    </tr>`).join('')}</tbody></table></div>`;

  const champs = {};
  for (const g of games) (champs[g.champion] ??= []).push(g);
  const champRows = Object.entries(champs).map(([c, list]) => ({ c, a: aggregate(list) }))
    .sort((x, y) => y.a.n - x.a.n || y.a.score - x.a.score).slice(0, 8);
  const champTable = `<div class="table-wrap"><table class="stats">
    <thead><tr><th>Champion</th><th>Games</th><th>Win rate</th><th>Avg score</th><th>KDA</th></tr></thead>
    <tbody>${champRows.map(({ c, a: ca }) => `<tr>
      <td class="champ-cell"><img src="${champImg(c)}" alt="" onerror="this.style.visibility='hidden'"> ${esc(c)}</td>
      <td>${ca.n}</td>
      <td class="${ca.winrate >= 50 ? 'up' : 'down'}">${Math.round(ca.winrate)}% <span class="sub">${ca.wins}W ${ca.losses}L</span></td>
      <td><span class="score ${scoreClass(ca.score)}">${ca.score.toFixed(1)}</span></td>
      <td>${ca.kda.toFixed(2)}</td>
    </tr>`).join('')}</tbody></table></div>`;

  return `${header}
    <nav class="sort">${queueChips}<span class="sub">Last ${a.n} ranked games</span></nav>
    ${headline}
    <h3>Vs players at your elo</h3>${eloHtml(p, games)}
    <h3>Per game vs the group</h3><div class="tiles">${tiles}</div>
    <h3>Lanes</h3>${roleSummary}${roleTable}
    <h3>Champions</h3>${champTable}
    <h3>Games</h3><div class="games profile-games">${games.map(gameHtml).join('')}</div>`;
}

function render() {
  if (!board) return;
  $('#group').textContent = board.groupName ?? 'Friends Ladder';
  document.title = board.groupName ?? 'Friends Ladder';
  $('#updated').textContent = board.updatedAt ? `Updated ${new Date(board.updatedAt).toLocaleString()} · ${board.platform?.toUpperCase() ?? ''}` : 'No data yet — add your API key and hit Refresh';

  const { view, player } = route();
  renderTabs(view);
  $('#view-board').hidden = view !== 'board';
  $('#view-player').hidden = view === 'board';
  if (view === 'players') {
    $('#view-player').innerHTML = playersGridHtml();
    return;
  }
  if (view === 'player') {
    $('#view-player').innerHTML = playerSwitcherHtml(player) + playerProfileHtml(player);
    return;
  }
  $('#board').innerHTML = sortedPlayers().map(playerHtml).join('') || '<p class="muted">No players yet.</p>';

  const errs = board.errors ?? [];
  $('#errors').hidden = errs.length === 0;
  $('#errors').innerHTML = errs.map((e) => `<div>⚠ ${esc(e.riotId)}: ${esc(e.error)}</div>`).join('');
  renderTogether();
}

// ---------- games played together ----------

const FRIEND_COLORS = ['#c8aa6e', '#60a5fa', '#f472b6', '#34d399', '#a78bfa', '#fb923c', '#f87171', '#22d3ee'];
const openGames = new Set();
let showAllGames = false;

const kNum = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);
const pct = (x) => `${Math.round(100 * x)}%`;

const METRICS = [
  { key: 'damage', label: 'Damage to champions', fmt: (m) => `${kNum(m.damage)} · ${pct(m.damageShare)}` },
  { key: 'kp', label: 'Kill participation', fmt: (m) => pct(m.kp) },
  { key: 'objectives', label: 'Objective damage', fmt: (m) => `${kNum(m.objectives)} · ${pct(m.objectivesShare)}` },
  { key: 'towers', label: 'Tower damage', fmt: (m) => `${kNum(m.towers)} · ${m.turrets} 🗼` },
  { key: 'epic', label: 'Epic monsters', hint: 'dragons, barons, heralds, voidgrubs', fmt: (m) => `${m.epic}` },
  { key: 'vision', label: 'Vision', fmt: (m) => `${m.vision} · ${m.visionPerMin.toFixed(1)}/min` },
  { key: 'tanking', label: 'Damage absorbed', fmt: (m) => `${kNum(m.tanking)} · ${pct(m.tankingShare)}` },
  { key: 'gold', label: 'Gold', fmt: (m) => `${kNum(m.gold)} · ${pct(m.goldShare)}` },
];

function friendColor(puuid) {
  const i = (board.players ?? []).findIndex((p) => p.puuid === puuid);
  return FRIEND_COLORS[(i < 0 ? 0 : i) % FRIEND_COLORS.length];
}

function groupGameHtml(g) {
  const isOpen = openGames.has(g.matchId);
  const n = g.players.length;
  const header = `<div class="gg-head" data-match="${esc(g.matchId)}">
    <b class="gg-result ${g.win ? 'w' : ''}">${g.win ? 'WIN' : 'LOSS'}</b>
    <div class="gg-champs">${g.players.map((p) => `<img src="${champImg(p.champion)}" alt="" title="${esc(p.name)} · ${esc(p.champion)}" style="border-color:${friendColor(p.puuid)}" onerror="this.style.visibility='hidden'">`).join('')}</div>
    <div class="gg-names"><strong>${g.players.map((p) => esc(p.name)).join(' + ')}</strong>
      <div class="sub">${esc(g.queue)} · ${g.minutes}m · ${g.teamKills}–${g.enemyKills} kills · ${timeAgo(g.endTs)}</div></div>
    <span class="gg-toggle">${isOpen ? '▾' : '▸'}</span>
  </div>`;
  if (!isOpen) return `<article class="gg">${header}</article>`;

  const ranking = g.players.map((p, i) => {
    const tag = i === 0 ? '<span class="badge mvp">👑 Carry del grupo</span>' : i === n - 1 ? '<span class="badge place">🎒 Mochila del grupo</span>' : '';
    const lobby = p.mvp ? '<span class="badge mvp">MVP</span>' : p.ace ? '<span class="badge ace">ACE</span>' : `<span class="badge place">#${p.place} of 10</span>`;
    return `<div class="gg-rank">
      <span class="pos">${i + 1}</span>
      <img src="${champImg(p.champion)}" alt="" style="border-color:${friendColor(p.puuid)}" onerror="this.style.visibility='hidden'">
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
      <p class="sub">Full bar = best of all 10 players in the game. Ranking uses the 0–10 score.</p>
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
    <p class="muted">${s.games} games with 2+ of you on the same team · <strong class="${wr >= 50 ? 'up' : 'down'}">${s.wins}W ${s.games - s.wins}L (${wr}%)</strong></p>
    <div class="together-grid">
      <div class="tcard"><div class="metric-title">When playing together</div>
        ${s.players.map((p) => `<div class="trow"><span>${esc(p.name)}</span><span class="sub">${p.games}g · ${p.winrate}% WR · 👑${p.carries} 🎒${p.last}</span><span class="score ${scoreClass(p.score)}">${p.score.toFixed(1)}</span></div>`).join('')}
      </div>
      <div class="tcard"><div class="metric-title">Duos</div>
        ${s.duos.slice(0, 6).map((d) => `<div class="trow"><span>${d.names.map(esc).join(' + ')}</span><span class="sub">${d.games}g</span><strong class="${d.winrate >= 50 ? 'up' : 'down'}">${d.wins}W ${d.games - d.wins}L</strong></div>`).join('')}
      </div>
    </div>`;

  const list = showAllGames ? games : games.slice(0, 8);
  $('#together-games').innerHTML = list.map(groupGameHtml).join('') +
    (games.length > list.length ? `<button id="more-games">Show all ${games.length} games</button>` : '');
}

async function load() {
  board = await (await fetch(`leaderboard.json?t=${Date.now()}`, { cache: 'no-store' })).json();
  render();
  // Open /#card to preview the share image full size (/?sort=score#card for another order).
  // The WhatsApp bot renders its images through this too.
  if (location.hash === '#card') {
    document.body.replaceChildren(drawCard());
    document.body.dataset.cardReady = 'true';
  }
}

// ---------- refresh ----------

async function pollStatus() {
  const res = await fetch('api/status').catch(() => null);
  if (!res?.ok) {
    // Static site (GitHub Pages): no server here. Updates run on GitHub, started on a schedule
    // or through the update Worker if one is configured.
    staticMode = true;
    $('#refresh').hidden = !board?.updateUrl;
    $('#refresh').textContent = '⟳ Update now';
    $('#refresh').title = 'Fetch new games from Riot (takes about 1–2 minutes)';
    return;
  }
  const st = await res.json();
  const box = $('#status');
  $('#refresh').disabled = st.running;
  if (st.running) {
    const { done = 0, total = 1, current } = st.progress ?? {};
    box.className = 'status';
    box.hidden = false;
    box.innerHTML = `Refreshing ${current ? esc(current) : ''} (${done}/${total})… first run can take a few minutes because of Riot's rate limits.
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

// ---------- sharing ----------

async function whatsappText() {
  return (await fetch('whatsapp.txt', { cache: 'no-store' })).text();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}


// Draws a WhatsApp-friendly leaderboard card (text only, so the canvas never gets tainted).
function drawCard() {
  const players = sortedPlayers();
  const nicknamed = players.filter((p) => p.nickname);
  const W = 1080, ROW = 118, TOP = 210, PAD = 48, NICK_ROW = 44;
  const nickTop = TOP + players.length * ROW + 30;
  const H = nickTop + (nicknamed.length ? 56 + nicknamed.length * NICK_ROW : 0) + 80;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const font = (w, s, style = '') => `${style} ${w} ${s}px "Segoe UI", "Segoe UI Emoji", system-ui, -apple-system, Roboto, sans-serif`;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#111a33'); bg.addColorStop(1, '#070b16');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#c8aa6e'; ctx.fillRect(0, 0, W, 8);

  ctx.fillStyle = '#c8aa6e'; ctx.font = font(800, 54);
  ctx.fillText(fit(ctx, board.groupName ?? 'Friends Ladder', W - 2 * PAD), PAD, 92);
  ctx.fillStyle = '#8a94b0'; ctx.font = font(500, 26);
  const sortName = { rank: 'Solo/Duo rank', score: 'avg score', winrate: 'win rate', week: 'LP this week' }[sortBy];
  ctx.fillText(`Ranked leaderboard · sorted by ${sortName} · ${new Date(board.updatedAt).toLocaleDateString()}`, PAD, 136);
  ctx.fillStyle = '#5d6786'; ctx.font = font(600, 20);
  ctx.fillText('RANK', 375, 190); ctx.fillText('SCORE', 640, 190); ctx.fillText('WIN RATE', 800, 190);

  players.forEach((p, i) => {
    const y = TOP + i * ROW;
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
    roundRect(ctx, PAD - 16, y, W - 2 * PAD + 32, ROW - 12, 18);
    const color = tierColor(p);
    ctx.fillStyle = color; roundRect(ctx, PAD - 16, y, 8, ROW - 12, 4);

    const mid = y + (ROW - 12) / 2;
    ctx.fillStyle = i < 3 ? ['#f6d27a', '#cfd6e4', '#d9925f'][i] : '#8a94b0';
    ctx.font = font(800, 40); ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), PAD + 30, mid + 14);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#e8ecf6'; ctx.font = font(700, 32);
    ctx.fillText(fit(ctx, p.name, 260), 100, mid - 4);
    if (p.nickname) {
      ctx.fillStyle = '#c8aa6e'; ctx.font = font(600, 19, 'italic');
      ctx.fillText(fit(ctx, `“${p.nickname.title}” ${p.nickname.emoji}`, 265), 100, mid + 26);
    } else {
      ctx.fillStyle = '#8a94b0'; ctx.font = font(500, 20);
      ctx.fillText(fit(ctx, p.riotId, 260), 100, mid + 26);
    }

    ctx.fillStyle = color; ctx.font = font(700, 28);
    ctx.fillText(fit(ctx, p.solo?.label ?? 'Unranked', 255), 375, mid - 4);
    const d = p.lpDelta?.week;
    if (d) {
      ctx.fillStyle = d > 0 ? '#4ade80' : '#f87171'; ctx.font = font(700, 21);
      ctx.fillText(`${d > 0 ? '▲' : '▼'} ${signed(d)} LP this week`, 375, mid + 26);
    }

    const s = p.stats;
    if (s) {
      const pill = { 's-great': ['#c8aa6e', '#1a1408'], 's-good': ['#2563eb', '#fff'], 's-ok': ['#0f766e', '#fff'], 's-low': ['#3a425c', '#cfd5e6'] }[scoreClass(s.avgScore)];
      ctx.fillStyle = pill[0]; roundRect(ctx, 640, mid - 30, 118, 52, 26);
      ctx.fillStyle = pill[1]; ctx.font = font(800, 32); ctx.textAlign = 'center';
      ctx.fillText(s.avgScore.toFixed(1), 699, mid + 7);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#8a94b0'; ctx.font = font(500, 18);
      ctx.fillText(s.mvp ? `${s.mvp}× MVP` : '', 648, mid + 46);

      ctx.fillStyle = s.winrate >= 50 ? '#e8ecf6' : '#f87171'; ctx.font = font(700, 30);
      ctx.fillText(`${s.winrate}%`, 800, mid - 2);
      ctx.fillStyle = '#8a94b0'; ctx.font = font(500, 20);
      ctx.fillText(`${s.wins}W ${s.games - s.wins}L · ${s.kda} KDA`, 800, mid + 28);
    }
  });

  if (nicknamed.length) {
    ctx.fillStyle = '#c8aa6e'; ctx.font = font(800, 30);
    ctx.fillText('🎭 Apodos de la semana', PAD, nickTop + 30);
    nicknamed.forEach((p, i) => {
      const y = nickTop + 56 + i * NICK_ROW + 24;
      let x = PAD;
      const piece = (text, color, f) => {
        ctx.fillStyle = color; ctx.font = f;
        const t = fit(ctx, text, W - PAD - x);
        ctx.fillText(t, x, y);
        x += ctx.measureText(t).width;
      };
      piece(`${p.nickname.emoji}  `, '#e8ecf6', font(500, 22));
      piece(p.name, '#e8ecf6', font(700, 22));
      piece(' es ', '#8a94b0', font(500, 22));
      piece(`“${p.nickname.title}”`, '#c8aa6e', font(700, 22, 'italic'));
      piece(`: ${p.nickname.reason}`, '#8a94b0', font(500, 22));
    });
  }

  ctx.fillStyle = '#5d6786'; ctx.font = font(500, 20);
  ctx.fillText('Score: OP.GG-style 0–10 rating, average of recent ranked games', PAD, H - 36);
  return c;
}

function fit(ctx, text, maxW) {
  if (maxW <= 0) return '';
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
}

const cardBlob = () => new Promise((resolve) => drawCard().toBlob(resolve, 'image/png'));
const fileName = () => `leaderboard-${new Date().toISOString().slice(0, 10)}.png`;

async function downloadCard(blob) {
  const url = URL.createObjectURL(blob ?? (await cardBlob()));
  const a = Object.assign(document.createElement('a'), { href: url, download: fileName() });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Keeps a copy of every image that gets sent in data/cards/ on the PC running the server.
function keepCard(blob) {
  if ($('#refresh').hidden) return; // static site: nowhere to save it
  fetch('api/card', { method: 'POST', body: blob, headers: { 'Content-Type': 'image/png' } }).catch(() => {});
}

function showSentHelp() {
  const box = $('#status');
  box.className = 'status ok';
  box.hidden = false;
  box.innerHTML = `✅ <strong>Image copied.</strong> In WhatsApp, open the group and press <kbd>Ctrl</kbd>+<kbd>V</kbd>, then send.
    WhatsApp didn't open? <a href="whatsapp://">Open WhatsApp app</a> · <a href="https://web.whatsapp.com" target="_blank" rel="noopener">WhatsApp Web</a>`;
  clearTimeout(showSentHelp.timer);
  showSentHelp.timer = setTimeout(() => (box.hidden = true), 20000);
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
  if (location.hash === '#card') return;
  render();
  window.scrollTo(0, 0);
});

$('#view-player').addEventListener('change', (e) => {
  if (e.target.id === 'player-select') location.hash = `#p/${e.target.value}`;
});

$('#view-player').addEventListener('click', (e) => {
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
    showStatus('Starting update…');
    let r;
    try {
      r = await (await fetch(board.updateUrl, { method: 'POST' })).json();
    } catch {
      return showStatus('Could not reach the update service. Try again in a bit.', 'error');
    }
    if (r.error) return showStatus(`Update failed to start: ${esc(r.error)}`, 'error');
    if (r.result === 'cooldown') {
      const min = Math.ceil(r.retryInSec / 60);
      return showStatus(`It was updated less than 5 minutes ago. You can update again in ${min} minute${min === 1 ? '' : 's'}.`);
    }

    const before = board.updatedAt;
    const started = Date.now();
    for (let i = 0; Date.now() - started < 6 * 60_000; i++) {
      const secs = Math.round((Date.now() - started) / 1000);
      showStatus(`${r.result === 'running' ? 'An update is already running' : 'Update started'}. Looking for new games… (${secs}s, usually 1–2 minutes)
        <div class="bar indeterminate"><i></i></div>`);
      await sleep(8000);
      const fresh = await fetch(`leaderboard.json?t=${Date.now()}`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
      if (fresh?.updatedAt > before) {
        board = fresh;
        render();
        $('#status').hidden = true;
        return toast('Updated with the latest games!');
      }
      if (i % 3 === 2) {
        const st = await fetch(board.updateUrl).then((x) => x.json()).catch(() => null);
        if (st?.last?.status === 'completed' && st.last.conclusion !== 'success' && Date.parse(st.last.createdAt) >= started - 60_000) {
          return showStatus('The update ran but failed (maybe the Riot API key expired). The data shown is from the last good update.', 'error');
        }
      }
    }
    showStatus('The update is taking longer than usual. Reload the page in a few minutes.');
  } finally {
    btn.disabled = false;
  }
}

// Main action: copy the leaderboard image and jump to WhatsApp so it can be pasted into the group.
$('#send').addEventListener('click', async () => {
  // On phones the share menu attaches the image straight to a WhatsApp chat.
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare) return $('#share').click();
  const blob = cardBlob();
  blob.then(keepCard);
  try {
    // Handing ClipboardItem a promise keeps the click's user activation for the clipboard write.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch {
    await downloadCard(await blob);
    toast('Could not copy the image, so it was downloaded. Attach it in WhatsApp.');
    return;
  }
  showSentHelp();
  location.href = 'whatsapp://';
});

$('#share').addEventListener('click', async () => {
  const blob = await cardBlob();
  keepCard(blob);
  const file = new File([blob], fileName(), { type: 'image/png' });
  if (!navigator.canShare?.({ files: [file] })) {
    await downloadCard(blob);
    toast('Sharing is not supported here, so the image was downloaded');
    return;
  }
  try {
    await navigator.share({ files: [file] });
  } catch (err) {
    if (err.name !== 'AbortError') toast('Sharing failed: ' + err.message);
  }
});

$('#download').addEventListener('click', async () => {
  const blob = await cardBlob();
  keepCard(blob);
  downloadCard(blob);
});

$('#copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(await whatsappText());
  toast('Text copied! Paste it in the group chat');
});

document.querySelectorAll('#sort-nav button').forEach((x) => x.classList.toggle('active', x.dataset.sort === sortBy));
// pollStatus needs the board to know whether an update button is available.
load().then(pollStatus);
