import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { RiotClient, AuthError } from './riot.js';
import { scoreMatch, isRemake } from './score.js';
import { rankValue, rankLabel } from './ranks.js';
import { assignNicknames } from './nicknames.js';
import { buildGroupGame, mergeGroupGames, groupSummary } from './group.js';

const DAY = 24 * 60 * 60 * 1000;
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const GROUP_FILE = path.join(DATA_DIR, 'group-games.json');

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

export function summarizePlayer({ friend, account, summoner, entries, matches }) {
  const puuid = account.puuid;
  const games = [];
  for (const m of matches) {
    if (!m || isRemake(m)) continue;
    const p = m.info.participants.find((x) => x.puuid === puuid);
    if (!p) continue;
    const s = scoreMatch(m).get(puuid);
    const team = m.info.participants.filter((x) => x.teamId === p.teamId);
    const teamKills = Math.max(1, team.reduce((acc, x) => acc + x.kills, 0));
    const teamDmg = Math.max(1, team.reduce((acc, x) => acc + x.totalDamageDealtToChampions, 0));
    games.push({
      matchId: m.metadata.matchId,
      queueId: m.info.queueId,
      endTs: m.info.gameEndTimestamp ?? m.info.gameCreation + m.info.gameDuration * 1000,
      minutes: round(m.info.gameDuration / 60, 0),
      champion: p.championName,
      position: p.teamPosition,
      win: p.win,
      kills: p.kills, deaths: p.deaths, assists: p.assists,
      cs: p.totalMinionsKilled + p.neutralMinionsKilled,
      vision: p.visionScore,
      kp: round((p.kills + p.assists) / teamKills, 2),
      dmgShare: round(p.totalDamageDealtToChampions / teamDmg, 2),
      deadPct: round((p.totalTimeSpentDead ?? 0) / m.info.gameDuration, 2),
      ...s,
    });
  }
  games.sort((a, b) => b.endTs - a.endTs);

  const n = games.length;
  const sum = (fn) => games.reduce((acc, g) => acc + fn(g), 0);
  const wins = sum((g) => g.win);

  const champs = {};
  for (const g of games) {
    const c = (champs[g.champion] ??= { champion: g.champion, games: 0, wins: 0, score: 0 });
    c.games++; c.wins += g.win; c.score += g.score;
  }
  const topChampions = Object.values(champs)
    .sort((a, b) => b.games - a.games || b.score - a.score)
    .slice(0, 3)
    .map((c) => ({ ...c, score: round(c.score / c.games) }));

  // Current win/loss streak from the most recent game backwards.
  let streak = 0;
  for (const g of games) {
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
    games,
  };
}

// --- LP history (so we can show "+45 LP this week") ---

export function recordHistory(history, players, now) {
  for (const p of players) {
    if (!p.solo) continue;
    const arr = (history[p.puuid] ??= []);
    const last = arr.at(-1);
    if (!last || last.value !== p.solo.value || now - last.t > DAY / 4) {
      arr.push({ t: now, value: p.solo.value, label: p.solo.label });
    }
    history[p.puuid] = arr.filter((s) => now - s.t < 60 * DAY);
  }
}

function lpChange(arr = [], now, value, windowMs) {
  if (value < 0 || arr.length === 0) return null;
  const before = arr.filter((s) => s.t <= now - windowMs).at(-1) ?? arr[0];
  return value - before.value;
}

export function attachDeltas(players, history, now) {
  for (const p of players) {
    const v = p.solo?.value ?? -1;
    p.lpDelta = {
      day: lpChange(history[p.puuid], now, v, DAY),
      week: lpChange(history[p.puuid], now, v, 7 * DAY),
    };
  }
}

export function sortPlayers(players) {
  return players.sort(
    (a, b) => (b.solo?.value ?? -1) - (a.solo?.value ?? -1) || (b.stats?.avgScore ?? 0) - (a.stats?.avgScore ?? 0),
  );
}

async function latestDdragonVersion() {
  try {
    const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
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
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

export const readLeaderboard = () => readJson(LEADERBOARD_FILE, null);

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
  for (const g of groupGames) for (const p of g.players) p.name = names.get(p.puuid) ?? p.name;
  await writeJson(GROUP_FILE, groupGames);

  recordHistory(history, players, now);
  attachDeltas(players, history, now);
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
      const account = await client.account(gameName, tagLine);
      if (!account) throw new Error('Riot ID not found (check spelling and tag)');
      const [summoner, entries, ids, recentIds] = await Promise.all([
        client.summoner(account.puuid),
        client.leagueEntries(account.puuid),
        client.matchIds(account.puuid, config.matchesPerPlayer, 'ranked'),
        client.matchIds(account.puuid, config.groupLookback ?? 20),
      ]);
      const matches = await Promise.all(ids.map((id) => client.match(id)));
      const player = summarizePlayer({ friend, account, summoner, entries, matches });
      players.push(player);
      recentByPlayer.set(account.puuid, new Set([...ids, ...recentIds]));
    } catch (err) {
      if (err instanceof AuthError) throw err;
      errors.push({ riotId: friend.riotId, error: err.message });
    }
  }
  // Games together: only download matches that show up in 2+ friends' recent history.
  onProgress({ done: total, total, current: 'games played together' });
  const seen = new Map();
  for (const idSet of recentByPlayer.values()) for (const id of idSet) seen.set(id, (seen.get(id) ?? 0) + 1);
  const shared = [...seen].filter(([, n]) => n >= 2).map(([id]) => id);
  const friendsByPuuid = new Map(players.map((p) => [p.puuid, p.name]));
  const groupGames = (await Promise.all(shared.map((id) => client.match(id))))
    .filter(Boolean)
    .map((m) => buildGroupGame(m, friendsByPuuid))
    .filter(Boolean);

  onProgress({ done: total, total, current: null });
  return saveLeaderboard(config, players, errors, ddragonVersion, groupGames, client.puuidRemap);
}
