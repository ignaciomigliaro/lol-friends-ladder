import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { RiotClient, AuthError, PLATFORM_TO_REGION } from './riot.js';
import { scoreMatch, isRemake } from './score.js';
import { rankValue, rankLabel } from './ranks.js';
import { assignNicknames } from './nicknames.js';
import { buildGroupGame, mergeGroupGames, groupSummary } from './group.js';
import { computeGroupRecords } from './records.js';
import { computeGroupMeta } from './meta.js';

const DAY = 24 * 60 * 60 * 1000;
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const GROUP_FILE = path.join(DATA_DIR, 'group-games.json');

const RANKED_QUEUES = new Set([420, 440]); // Solo/Duo, Flex
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function splitRiotId(riotId) {
  const i = riotId.lastIndexOf('#');
  if (i <= 0) throw new Error(`"${riotId}" is not a Riot ID. Use the format Name#TAG`);
  return [riotId.slice(0, i), riotId.slice(i + 1)];
}

function queueEntry(entries, queueType) {
  const e = entries.find((x) => x.queueType === queueType);
  if (!e) return null;
  return {
    tier: e.tier, rank: e.rank, lp: e.leaguePoints, wins: e.wins, losses: e.losses,
    hotStreak: e.hotStreak, label: rankLabel(e), value: rankValue(e),
  };
}

// Per-game numbers for comparing a player with their lane opponent.
function laneStats(p, m) {
  const team = m.info.participants.filter((x) => x.teamId === p.teamId);
  const teamKills = Math.max(1, team.reduce((acc, x) => acc + x.kills, 0));
  return {
    kills: p.kills, deaths: p.deaths, assists: p.assists,
    cs: p.totalMinionsKilled + p.neutralMinionsKilled,
    damage: p.totalDamageDealtToChampions,
    objectives: p.damageDealtToObjectives,
    vision: p.visionScore,
    gold: p.goldEarned,
    kp: round((p.kills + p.assists) / teamKills, 2),
  };
}

// games keeps up to profileMatches games for the personal tab; stats/topChampions use the most
// recent statsGames of them so the leaderboard reflects current form.
export function summarizePlayer({ friend, account, summoner, entries, matches, statsGames = Infinity, profileMatches = Infinity }) {
  const puuid = account.puuid;
  const games = [];
  for (const m of matches) {
    if (!m || !RANKED_QUEUES.has(m.info.queueId)) continue;
    const p = m.info.participants.find((x) => x.puuid === puuid);
    if (!p) continue;
    const scores = scoreMatch(m);
    const s = scores.get(puuid);
    const team = m.info.participants.filter((x) => x.teamId === p.teamId);
    // The enemy in the same role: same game, same rank. Used as the "players at your elo" benchmark.
    const opp = p.teamPosition && m.info.participants.find((x) => x.teamId !== p.teamId && x.teamPosition === p.teamPosition);
    const teamKills = Math.max(1, team.reduce((acc, x) => acc + x.kills, 0));
    const teamDmg = Math.max(1, team.reduce((acc, x) => acc + x.totalDamageDealtToChampions, 0));
    const remake = isRemake(m);
    const surrender = !remake && (
      Boolean(p.gameEndedInSurrender) ||
      m.info.participants.some((x) => x.gameEndedInSurrender) ||
      (m.info.gameDuration >= 300 && m.info.gameDuration <= 1260)
    );
    games.push({
      matchId: m.metadata.matchId,
      queueId: m.info.queueId,
      endTs: m.info.gameEndTimestamp ?? m.info.gameCreation + m.info.gameDuration * 1000,
      minutes: round(m.info.gameDuration / 60, 0),
      champion: p.championName,
      position: p.teamPosition,
      win: p.win,
      isRemake: remake,
      isSurrender: surrender,
      kills: p.kills, deaths: p.deaths, assists: p.assists,
      cs: p.totalMinionsKilled + p.neutralMinionsKilled,
      vision: p.visionScore,
      kp: round((p.kills + p.assists) / teamKills, 2),
      dmgShare: round(p.totalDamageDealtToChampions / teamDmg, 2),
      deadPct: round((p.totalTimeSpentDead ?? 0) / m.info.gameDuration, 2),
      damage: p.totalDamageDealtToChampions,
      objectives: p.damageDealtToObjectives,
      gold: p.goldEarned,
      soloKills: p.challenges?.soloKills ?? 0,
      opp: opp ? { champion: opp.championName, score: scores.get(opp.puuid)?.score ?? null, ...laneStats(opp, m) } : null,
      ...s,
    });
  }
  games.sort((a, b) => b.endTs - a.endTs);

  const maxHistory = Number.isFinite(profileMatches) ? profileMatches : Infinity;
  const historyGames = Number.isFinite(maxHistory) ? games.slice(0, maxHistory) : games;
  const validGames = historyGames.filter((g) => !g.isRemake);
  const recent = validGames.slice(0, statsGames);
  const n = recent.length;
  const sum = (fn) => recent.reduce((acc, g) => acc + fn(g), 0);
  const wins = sum((g) => g.win);

  const champs = {};
  for (const g of recent) {
    const c = (champs[g.champion] ??= { champion: g.champion, games: 0, wins: 0, score: 0 });
    c.games++; c.wins += g.win; c.score += g.score;
  }
  const topChampions = Object.values(champs)
    .sort((a, b) => b.games - a.games || b.score - a.score)
    .slice(0, 3)
    .map((c) => ({ ...c, score: round(c.score / c.games) }));

  // Current win/loss streak from the most recent game backwards (remakes are neutral and skipped)
  let streak = 0;
  for (const g of historyGames) {
    if (g.isRemake) continue;
    if (streak === 0) streak = g.win ? 1 : -1;
    else if (g.win === streak > 0) streak += streak > 0 ? 1 : -1;
    else break;
  }

  return {
    riotId: `${account.gameName}#${account.tagLine}`,
    name: friend.name ?? account.gameName,
    puuid,
    level: summoner?.summonerLevel ?? null,
    profileIconId: summoner?.profileIconId ?? null,
    solo: queueEntry(entries, 'RANKED_SOLO_5x5'),
    flex: queueEntry(entries, 'RANKED_FLEX_SR'),
    stats: n === 0 ? null : {
      games: n,
      wins,
      winrate: round((100 * wins) / n, 0),
      avgScore: round(sum((g) => g.score) / n),
      kda: round(sum((g) => g.kills + g.assists) / Math.max(1, sum((g) => g.deaths)), 2),
      avgKills: round(sum((g) => g.kills) / n),
      avgDeaths: round(sum((g) => g.deaths) / n),
      avgAssists: round(sum((g) => g.assists) / n),
      mvp: sum((g) => g.mvp),
      ace: sum((g) => g.ace),
      streak,
    },
    topChampions,
    games: historyGames,
  };
}

// --- LP history (so we can show "+45 LP this week") ---

export function recordHistory(history, players, now) {
  for (const p of players) {
    if (!p.solo) continue;
    const arr = (history[p.puuid] ??= []);
    const last = arr.at(-1);
    // g = season games played; it drops when Riot resets ranks, which marks a new season.
    const g = p.solo.wins + p.solo.losses;
    if (!last || last.value !== p.solo.value || (last.g != null && g < last.g) || now - last.t > DAY / 4) {
      arr.push({ t: now, value: p.solo.value, label: p.solo.label, g });
    }
    // Keep a year: long enough for a whole season's LP line.
    history[p.puuid] = arr.filter((s) => now - s.t < 365 * DAY);
  }
}

function lpChange(arr = [], now, value, windowMs) {
  if (value < 0 || arr.length === 0) return null;
  const before = arr.filter((s) => s.t <= now - windowMs).at(-1) ?? arr[0];
  return value - before.value;
}

// Start of the current week (default Monday 00:00 in the given time zone) as a UTC timestamp.
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export function weekStart(now, { day = 'monday', timeZone = 'America/New_York' } = {}) {
  const parts = (ts) => Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', weekday: 'long',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(ts).map((x) => [x.type, x.value]),
  );
  const p = parts(now);
  const back = (WEEKDAYS.indexOf(p.weekday.toLowerCase()) - WEEKDAYS.indexOf(day) + 7) % 7;
  // Local midnight of that day, converted to UTC using the zone's offset at that moment.
  const guess = Date.UTC(+p.year, +p.month - 1, +p.day - back);
  const q = parts(guess);
  const offset = Date.UTC(+q.year, +q.month - 1, +q.day, +q.hour, +q.minute, +q.second) - guess;
  return guess - offset;
}

// "This week" resets every week: compare with the last snapshot from before the week started.
// Someone added mid-week is compared with their first snapshot instead.
export function weekChange(arr = [], value, start, playerGames = []) {
  if (value < 0) return null;
  const before = arr.filter((s) => s.t <= start).at(-1);
  if (before) {
    return value - before.value;
  }
  // Fallback: If no snapshot exists from before weekStart, calculate LP delta from matches
  // played this week before the earliest snapshot
  const firstSnap = arr[0];
  const firstSnapTs = firstSnap?.t ?? Date.now();
  const olderWeekRanked = (playerGames || []).filter(
    (g) => g.endTs >= start && g.endTs < firstSnapTs && g.queueId === 420,
  );
  if (olderWeekRanked.length > 0) {
    const wins = olderWeekRanked.filter((g) => g.win).length;
    const losses = olderWeekRanked.length - wins;
    const baseDelta = firstSnap ? value - firstSnap.value : 0;
    return baseDelta + (wins - losses) * 22;
  }
  if (arr.length > 0) return value - arr[0].value;
  return 0;
}

// "This season" counts from the first snapshot after the latest rank reset (season games dropped),
// or after config.seasonStart, or else from when tracking started. Riot has no LP history to go further back.
function seasonBase(arr = [], seasonStart) {
  let from = arr.findIndex((s) => !seasonStart || s.t >= seasonStart);
  if (from < 0) return null;
  for (let i = arr.length - 1; i > from; i--) {
    if (arr[i].g != null && arr[i - 1].g != null && arr[i].g < arr[i - 1].g) { from = i; break; }
  }
  return arr[from];
}

export function attachDeltas(players, history, now, week, seasonStart) {
  for (const p of players) {
    const v = p.solo?.value ?? -1;
    const base = v < 0 ? null : seasonBase(history[p.puuid], seasonStart);
    p.lpDelta = {
      day: lpChange(history[p.puuid], now, v, DAY),
      week: weekChange(history[p.puuid], v, week, p.games),
      season: base ? v - base.value : null,
      seasonSince: base?.t ?? null,
    };
  }
}

export function sortPlayers(players) {
  return players.sort(
    (a, b) => (b.solo?.value ?? -1) - (a.solo?.value ?? -1) || (b.stats?.avgScore ?? 0) - (a.stats?.avgScore ?? 0),
  );
}

// Match data names champions by internal id (MonkeyKing, Chogath, KSante...). Data Dragon maps
// each id to the name players know (Wukong, Cho'Gath, K'Sante).
async function championNames(version) {
  try {
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`, {
      signal: AbortSignal.timeout(10_000),
    });
    const { data } = await res.json();
    return Object.values(data).map((c) => ({ id: c.id, name: c.name }));
  } catch {
    return null;
  }
}

// Rewrites every champion field to its display name; returns name -> image id for the ones that differ.
export function renameChampions(players, groupGames, champions) {
  if (!champions) return {};
  const byId = new Map(champions.map((c) => [c.id.toLowerCase(), c.name]));
  const name = (id) => byId.get(String(id).toLowerCase()) ?? id;
  const fix = (o) => { if (o?.champion) o.champion = name(o.champion); };
  for (const p of players) {
    for (const g of p.games ?? []) { fix(g); fix(g.opp); }
    for (const c of p.topChampions ?? []) fix(c);
  }
  for (const g of groupGames) for (const p of g.players) fix(p);
  return Object.fromEntries(champions.filter((c) => c.name !== c.id).map((c) => [c.name, c.id]));
}

async function latestDdragonVersion() {
  try {
    const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', {
      signal: AbortSignal.timeout(10_000),
    });
    return (await res.json())[0];
  } catch {
    return null;
  }
}

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeJson(file, data) {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmpFile = path.join(dir, `.${path.basename(file)}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`);
  try {
    await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmpFile, file);
  } catch (err) {
    await fs.unlink(tmpFile).catch(() => {});
    throw err;
  }
}

export const readLeaderboard = async () => {
  const board = await readJson(LEADERBOARD_FILE, null);
  if (board?.players) {
    if (!board.records) board.records = computeGroupRecords(board.players);
    if (!board.meta) board.meta = computeGroupMeta(board.players);
  }
  return board;
};

// After an API key switch, every PUUID changes: move saved history and games to the new ones.
function remapPuuids(history, groupGames, remap) {
  if (!remap?.size) return;
  for (const [oldId, newId] of remap) {
    if (history[oldId]) {
      history[newId] = [...(history[oldId] ?? []), ...(history[newId] ?? [])].sort((a, b) => a.t - b.t);
      delete history[oldId];
    }
  }
  for (const g of groupGames) for (const p of g.players) p.puuid = remap.get(p.puuid) ?? p.puuid;
}

export async function saveLeaderboard(config, players, errors, ddragonVersion, freshGroupGames = [], puuidRemap) {
  const now = Date.now();
  const names = new Map(players.map((p) => [p.puuid, p.name]));
  const stored = await readJson(GROUP_FILE, []);
  const history = await readJson(HISTORY_FILE, {});
  remapPuuids(history, stored, puuidRemap);
  const groupGames = mergeGroupGames(stored, freshGroupGames);
  const champIds = renameChampions(players, groupGames, ddragonVersion ? await championNames(ddragonVersion) : null);
  for (const g of groupGames) for (const p of g.players) p.name = names.get(p.puuid) ?? p.name;
  await writeJson(GROUP_FILE, groupGames);

  recordHistory(history, players, now);
  const week = weekStart(now, config.weekStart);
  attachDeltas(players, history, now, week, config.seasonStart ? Date.parse(config.seasonStart) : null);
  // Solo/Duo LP snapshots for the LP-over-time chart (value = comparable LP, see ranks.js).
  for (const p of players) p.lpHistory = (history[p.puuid] ?? []).map((s) => ({ t: s.t, v: s.value }));
  await writeJson(HISTORY_FILE, history);

  const board = {
    groupName: config.groupName,
    platform: config.platform,
    updatedAt: now,
    ddragonVersion,
    players: sortPlayers(players),
    errors,
    groupGames,
    groupSummary: groupSummary(groupGames),
    updateUrl: config.updateUrl ?? null,
    weekStart: week,
    champIds,
    records: computeGroupRecords(players),
    meta: computeGroupMeta(players),
  };
  assignNicknames(board.players, now);
  await writeJson(LEADERBOARD_FILE, board);
  return board;
}

export async function refreshAll(config, onProgress = () => {}) {
  const client = new RiotClient({ ...config, dataDir: DATA_DIR });
  const players = [];
  const errors = [];
  const total = config.friends.length;
  const ddragonVersion = await latestDdragonVersion();
  const recentByPlayer = new Map();

  for (const [i, friend] of config.friends.entries()) {
    onProgress({ done: i, total, current: friend.riotId });
    try {
      const [gameName, tagLine] = splitRiotId(friend.riotId);
      const platform = (friend.platform ?? config.platform).toLowerCase();
      const region = PLATFORM_TO_REGION[platform] ?? client.region;
      const account = await client.account(gameName, tagLine, region);
      if (!account) throw new Error('Riot ID not found (check spelling and tag)');
      // Solo/Duo and Flex are fetched separately so a player who grinds one queue still
      // has their other queue's history on the profile.
      const perQueue = Math.max(config.matchesPerPlayer + 10, config.profileMatches ?? 50);
      const [summoner, entries, soloIds, flexIds, recentIds] = await Promise.all([
        client.summoner(account.puuid, platform),
        client.leagueEntries(account.puuid, platform),
        client.matchIds(account.puuid, perQueue, { queue: 420 }, region),
        client.matchIds(account.puuid, perQueue, { queue: 440 }, region),
        client.matchIds(account.puuid, config.groupLookback ?? 20, {}, region),
      ]);
      const ids = [...soloIds, ...flexIds];
      const matches = await Promise.all(ids.map((id) => client.match(id, region)));
      const maxHistory = config.profileMatches ?? config.matchesPerPlayer ?? 40;
      const player = summarizePlayer({
        friend,
        account,
        summoner,
        entries,
        matches,
        statsGames: config.matchesPerPlayer,
        profileMatches: maxHistory,
      });
      player.platform = platform;
      players.push(player);
      recentByPlayer.set(account.puuid, { ids: new Set([...ids, ...recentIds]), region });
    } catch (err) {
      if (err instanceof AuthError) throw err;
      errors.push({ riotId: friend.riotId, error: err.message });
    }
  }
  // Games together: only download matches that show up in 2+ friends' recent history.
  onProgress({ done: total, total, current: 'games played together' });
  const seen = new Map();
  const matchRegion = new Map();
  for (const { ids, region } of recentByPlayer.values()) {
    for (const id of ids) {
      seen.set(id, (seen.get(id) ?? 0) + 1);
      matchRegion.set(id, region);
    }
  }
  const shared = [...seen].filter(([, n]) => n >= 2).map(([id]) => id);
  const friendsByPuuid = new Map(players.map((p) => [p.puuid, p.name]));
  const groupGames = (await Promise.all(shared.map((id) => client.match(id, matchRegion.get(id) ?? client.region))))
    .filter(Boolean)
    .map((m) => buildGroupGame(m, friendsByPuuid))
    .filter(Boolean);

  onProgress({ done: total, total, current: null });
  return saveLeaderboard(config, players, errors, ddragonVersion, groupGames, client.puuidRemap);
}
