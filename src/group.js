// Detailed breakdowns for games where 2+ tracked friends played on the same team.
import { scoreMatch, isRemake } from './score.js';

export const GROUP_QUEUES = {
  400: 'Normal Draft', 420: 'Ranked Solo/Duo', 430: 'Normal Blind', 440: 'Ranked Flex',
  450: 'ARAM', 480: 'Swiftplay', 490: 'Quickplay',
};
const MAX_STORED = 60;

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const sum = (list, fn) => list.reduce((acc, x) => acc + fn(x), 0);

// Raw per-player metrics. Bars on the page are drawn relative to the best of all 10 players.
function metrics(p, team, minutes) {
  const c = p.challenges ?? {};
  const teamKills = Math.max(1, sum(team, (x) => x.kills));
  const share = (fn) => fn(p) / Math.max(1, sum(team, fn));
  return {
    damage: p.totalDamageDealtToChampions,
    damageShare: share((x) => x.totalDamageDealtToChampions),
    kp: (p.kills + p.assists) / teamKills,
    objectives: p.damageDealtToObjectives,
    objectivesShare: share((x) => x.damageDealtToObjectives),
    towers: p.damageDealtToBuildings ?? p.damageDealtToTurrets ?? 0,
    towersShare: share((x) => x.damageDealtToBuildings ?? x.damageDealtToTurrets ?? 0),
    turrets: p.turretTakedowns ?? p.turretKills ?? 0,
    epic: (c.dragonTakedowns ?? p.dragonKills ?? 0) + (c.baronTakedowns ?? p.baronKills ?? 0) + (c.riftHeraldTakedowns ?? 0) + (c.voidMonsterKill ?? 0),
    vision: p.visionScore,
    visionPerMin: p.visionScore / minutes,
    tanking: p.totalDamageTaken + p.damageSelfMitigated,
    tankingShare: share((x) => x.totalDamageTaken + x.damageSelfMitigated),
    gold: p.goldEarned,
    goldShare: share((x) => x.goldEarned),
    csPerMin: (p.totalMinionsKilled + p.neutralMinionsKilled) / minutes,
    support: (p.totalHealsOnTeammates ?? 0) + (p.totalDamageShieldedOnTeammates ?? 0),
  };
}

const BAR_KEYS = ['damage', 'kp', 'objectives', 'towers', 'epic', 'vision', 'tanking', 'gold'];

// friendsByPuuid: Map<puuid, display name>. Returns null if fewer than 2 friends were teammates.
export function buildGroupGame(match, friendsByPuuid) {
  if (!GROUP_QUEUES[match.info.queueId] || isRemake(match)) return null;
  const ps = match.info.participants;
  const byTeam = {};
  for (const p of ps) if (friendsByPuuid.has(p.puuid)) (byTeam[p.teamId] ??= []).push(p);
  const friends = Object.values(byTeam).sort((a, b) => b.length - a.length)[0];
  if (!friends || friends.length < 2) return null;

  const minutes = Math.max(1, match.info.gameDuration / 60);
  const scores = scoreMatch(match);
  const all = ps.map((p) => ({ p, m: metrics(p, ps.filter((x) => x.teamId === p.teamId), minutes) }));
  const lobbyMax = Object.fromEntries(BAR_KEYS.map((k) => [k, Math.max(1e-9, ...all.map((x) => x.m[k]))]));

  const players = friends
    .map((p) => {
      const s = scores.get(p.puuid);
      const m = all.find((x) => x.p === p).m;
      return {
        puuid: p.puuid,
        name: friendsByPuuid.get(p.puuid),
        champion: p.championName,
        position: p.teamPosition,
        kills: p.kills, deaths: p.deaths, assists: p.assists,
        score: s.score, place: s.place, mvp: s.mvp, ace: s.ace,
        m: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round(v, 3)])),
      };
    })
    .sort((a, b) => b.score - a.score);

  const teamId = friends[0].teamId;
  const team = ps.filter((x) => x.teamId === teamId);
  const enemy = ps.filter((x) => x.teamId !== teamId);
  return {
    matchId: match.metadata.matchId,
    queueId: match.info.queueId,
    queue: GROUP_QUEUES[match.info.queueId],
    endTs: match.info.gameEndTimestamp ?? match.info.gameCreation + match.info.gameDuration * 1000,
    minutes: Math.round(minutes),
    win: friends[0].win,
    teamKills: sum(team, (x) => x.kills),
    enemyKills: sum(enemy, (x) => x.kills),
    lobbyMax: Object.fromEntries(Object.entries(lobbyMax).map(([k, v]) => [k, round(v, 3)])),
    players,
  };
}

export function mergeGroupGames(stored, fresh) {
  const byId = new Map(stored.map((g) => [g.matchId, g]));
  for (const g of fresh) byId.set(g.matchId, g);
  return [...byId.values()].sort((a, b) => b.endTs - a.endTs).slice(0, MAX_STORED);
}

// Per-friend and per-duo records across all stored group games.
export function groupSummary(games) {
  const people = {};
  const duos = {};
  for (const g of games) {
    g.players.forEach((p, i) => {
      const s = (people[p.puuid] ??= { name: p.name, games: 0, wins: 0, score: 0, carries: 0, last: 0 });
      s.name = p.name;
      s.games++;
      s.wins += g.win;
      s.score += p.score;
      if (i === 0) s.carries++;
      if (i === g.players.length - 1) s.last++;
    });
    for (let i = 0; i < g.players.length; i++) {
      for (let j = i + 1; j < g.players.length; j++) {
        const pair = [g.players[i], g.players[j]].sort((a, b) => a.puuid.localeCompare(b.puuid));
        const d = (duos[pair.map((x) => x.puuid).join('+')] ??= { names: [], games: 0, wins: 0 });
        d.names = pair.map((x) => x.name);
        d.games++;
        d.wins += g.win;
      }
    }
  }
  return {
    games: games.length,
    wins: sum(games, (g) => g.win),
    players: Object.values(people)
      .map((s) => ({ ...s, score: round(s.score / s.games), winrate: Math.round((100 * s.wins) / s.games) }))
      .sort((a, b) => b.score - a.score),
    duos: Object.values(duos)
      .map((d) => ({ ...d, winrate: Math.round((100 * d.wins) / d.games) }))
      .sort((a, b) => b.games - a.games || b.winrate - a.winrate),
  };
}
