// Builders for fake Riot match data, so tests never need the API.

const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

export function participant(overrides = {}) {
  return {
    puuid: 'bot', teamId: 100, win: true, teamPosition: 'MIDDLE', championName: 'Ahri',
    kills: 4, deaths: 4, assists: 6,
    totalDamageDealtToChampions: 18000, totalDamageTaken: 18000, damageSelfMitigated: 9000,
    goldEarned: 11000, totalMinionsKilled: 170, neutralMinionsKilled: 4, visionScore: 22,
    damageDealtToObjectives: 6000, damageDealtToBuildings: 2500, turretTakedowns: 1,
    totalTimeSpentDead: 120, gameEndedInEarlySurrender: false, challenges: {},
    ...overrides,
  };
}

// One ranked match: `me` plays `role` on team 100 against `oppChamp` in the same role on team 200.
export function match({
  id, puuid = 'me', queueId = 420, endTs = Date.parse('2026-10-20T20:00:00Z'), minutes = 30,
  role = 'MIDDLE', champ = 'Ahri', oppChamp = 'Zed', win = true, me = {}, opp = {},
}) {
  const participants = [];
  for (const teamId of [100, 200]) {
    for (const pos of POSITIONS) {
      const isMe = teamId === 100 && pos === role;
      const isOpp = teamId === 200 && pos === role;
      participants.push(participant({
        puuid: isMe ? puuid : `${id}-${teamId}-${pos}`,
        teamId,
        teamPosition: pos,
        win: teamId === 100 ? win : !win,
        championName: isMe ? champ : isOpp ? oppChamp : `${pos[0]}${teamId}`,
        ...(isMe ? me : {}),
        ...(isOpp ? opp : {}),
      }));
    }
  }
  return {
    metadata: { matchId: id },
    info: { queueId, gameDuration: minutes * 60, gameEndTimestamp: endTs, gameCreation: endTs - minutes * 60000, participants },
  };
}

export const account = (puuid = 'me', gameName = 'Tester') => ({ puuid, gameName, tagLine: 'LAN' });

export const soloEntry = (tier = 'GOLD', rank = 'II', leaguePoints = 50, wins = 30, losses = 30) =>
  ({ queueType: 'RANKED_SOLO_5x5', tier, rank, leaguePoints, wins, losses, hotStreak: false });
