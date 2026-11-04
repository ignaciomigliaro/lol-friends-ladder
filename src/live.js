import { RiotClient, PLATFORM_TO_REGION } from './riot.js';
import { DATA_DIR } from './config.js';
import { readJson } from './tracker.js';
import { getChampionBuild } from './builds.js';
import { analyzePlayerStats, computeMatchPrediction, computeDynamicPrediction } from './prediction.js';
import { getLatestTelemetry, getDemoTelemetry } from './telemetry.js';

const QUEUES = {
  420: 'Ranked Solo/Duo',
  440: 'Ranked Flex',
  400: 'Normal Reclutamiento',
  430: 'Normal Oculta',
  450: 'ARAM',
  490: 'Partida Rápida',
  1700: 'Arena 2v2v2v2',
};

let champIdMap = null;
let champMapExpiry = 0;
let rawGamesCache = null;
let rawGamesExpiry = 0;
const participantStatsCache = new Map(); // key -> { stats, expiry }

function applyTelemetryToGame(game, telemetry) {
  if (!telemetry) return game;
  const basePrediction = game.basePrediction || game.prediction;
  const prediction = basePrediction ? computeDynamicPrediction(basePrediction, telemetry) : game.prediction;

  const mapTeam = (team = []) =>
    team.map((p) => {
      const sKey = (p.summonerName || '').toLowerCase();
      const cKey = (p.champion || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const inGame = telemetry.players?.[sKey] || telemetry.players?.[cKey] || telemetry.players?.[(p.champion || '').toLowerCase()];
      return inGame ? { ...p, inGame } : p;
    });

  return {
    ...game,
    telemetry,
    basePrediction,
    prediction,
    teams: {
      blue: mapTeam(game.teams?.blue),
      red: mapTeam(game.teams?.red),
    },
  };
}

let latestVersionCache = null;
let latestVersionExpiry = 0;

export async function getLatestDdragonVersion() {
  const now = Date.now();
  if (latestVersionCache && now < latestVersionExpiry) return latestVersionCache;
  try {
    const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', {
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const versions = await res.json();
      if (versions?.[0]) {
        latestVersionCache = versions[0];
        latestVersionExpiry = now + 6 * 60 * 60 * 1000;
        return versions[0];
      }
    }
  } catch {}
  return '16.22.1';
}

export async function getChampionIdMap(ddragonVersion) {
  const now = Date.now();
  if (champIdMap && now < champMapExpiry) return champIdMap;
  try {
    const version = ddragonVersion || (await getLatestDdragonVersion()) || '16.22.1';
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error('Failed to fetch champion list');
    const data = await res.json();
    const map = {};
    for (const c of Object.values(data.data)) {
      map[c.key] = c.id;
    }
    map['805'] = 'Locke';
    map['800'] = 'Mel';
    map['804'] = 'Yunara';
    map['893'] = 'Aurora';
    map['901'] = 'Smolder';
    champIdMap = map;
    champMapExpiry = now + 6 * 60 * 60 * 1000; // cache for 6 hours
    return map;
  } catch {
    return champIdMap ?? { '805': 'Locke', '800': 'Mel', '804': 'Yunara', '893': 'Aurora', '901': 'Smolder' };
  }
}

async function enrichParticipantStats(client, participant, platform) {
  if (!participant.puuid) {
    participant.stats = analyzePlayerStats([], null);
    return;
  }
  const cacheKey = `${platform}:${participant.puuid}:${participant.championId}`;
  const now = Date.now();
  const cached = participantStatsCache.get(cacheKey);
  if (cached && now < cached.expiry) {
    participant.stats = cached.stats;
    return;
  }

  let entries = [];
  let mastery = null;
  try {
    const [entriesRes, masteryRes] = await Promise.allSettled([
      client.leagueEntries(participant.puuid, platform),
      client.championMastery(participant.puuid, participant.championId, platform),
    ]);
    if (entriesRes.status === 'fulfilled' && Array.isArray(entriesRes.value)) {
      entries = entriesRes.value;
    }
    if (masteryRes.status === 'fulfilled' && masteryRes.value) {
      mastery = masteryRes.value;
    }
  } catch {
    // Graceful fallback for unranked/network/rate-limits
  }

  const stats = analyzePlayerStats(entries, mastery);
  participantStatsCache.set(cacheKey, { stats, expiry: now + 15 * 60 * 1000 });
  if (participantStatsCache.size > 500) {
    for (const [k, v] of participantStatsCache.entries()) {
      if (now >= v.expiry) participantStatsCache.delete(k);
    }
  }
  participant.stats = stats;
}

export async function checkLiveGames(config) {
  const now = Date.now();
  const telemetry = getLatestTelemetry();

  let rawGames = rawGamesCache;

  if (!rawGames || now >= rawGamesExpiry) {
    const client = new RiotClient({ ...config, dataDir: DATA_DIR });
    const accountsFile = `${DATA_DIR}/accounts.json`;
    const accountsData = await readJson(accountsFile, { accounts: {} });
    const accounts = accountsData.accounts ?? accountsData;

    const champMap = await getChampionIdMap();
    const friendsByPuuid = new Map();
    for (const f of config.friends) {
      const key = f.riotId.toLowerCase();
      const acc = accounts[key];
      if (acc) {
        friendsByPuuid.set(acc.puuid, {
          name: f.name ?? acc.gameName,
          riotId: f.riotId,
          platform: (f.platform ?? config.platform).toLowerCase(),
        });
      }
    }

    const activeMatchesMap = new Map(); // gameId -> gameObj

    // Check each tracked friend
    await Promise.all(
      [...friendsByPuuid.entries()].map(async ([puuid, info]) => {
        try {
          const game = await client.activeGame(puuid, info.platform);
          if (!game || !game.gameId) return;

          const participant = game.participants?.find((p) => p.puuid === puuid);
          const champName = champMap[participant?.championId] ?? 'Unknown';

          const friendEntry = {
            puuid,
            name: info.name,
            riotId: info.riotId,
            teamId: participant?.teamId ?? 100,
            champion: champName,
            spell1Id: participant?.spell1Id,
            spell2Id: participant?.spell2Id,
            build: getChampionBuild(champName),
          };

          const mapParticipant = (p) => {
            const isFriend = friendsByPuuid.has(p.puuid);
            const fInfo = friendsByPuuid.get(p.puuid);
            const champ = champMap[p.championId] ?? (p.championId ? `Champ #${p.championId}` : 'Unknown');
            return {
              puuid: p.puuid,
              riotId: p.riotId || (isFriend ? fInfo.riotId : null),
              summonerName: isFriend ? fInfo.name : (p.riotId?.split('#')[0] || p.summonerName || 'Invocador'),
              champion: champ,
              championId: p.championId,
              teamId: p.teamId,
              spell1Id: p.spell1Id,
              spell2Id: p.spell2Id,
              profileIconId: p.profileIconId,
              isFriend,
              friendName: isFriend ? fInfo.name : null,
              build: getChampionBuild(champ),
              stats: null,
            };
          };

          const blueTeam = (game.participants || []).filter((p) => p.teamId === 100).map(mapParticipant);
          const redTeam = (game.participants || []).filter((p) => p.teamId === 200).map(mapParticipant);

          // Fetch ranks & mastery in parallel
          await Promise.all([
            ...blueTeam.map((p) => enrichParticipantStats(client, p, info.platform)),
            ...redTeam.map((p) => enrichParticipantStats(client, p, info.platform)),
          ]);

          const startTime = game.gameStartTime > 0 ? game.gameStartTime : now - (game.gameLength ?? 0) * 1000;
          const minutes = Math.max(0, Math.floor((now - startTime) / 60000));
          const prediction = computeMatchPrediction(blueTeam, redTeam, minutes);

          const bans = {
            blue: (game.bannedChampions || [])
              .filter((b) => b.teamId === 100 && b.championId > 0)
              .map((b) => ({ championId: b.championId, champion: champMap[b.championId] || `Champ #${b.championId}` })),
            red: (game.bannedChampions || [])
              .filter((b) => b.teamId === 200 && b.championId > 0)
              .map((b) => ({ championId: b.championId, champion: champMap[b.championId] || `Champ #${b.championId}` })),
          };

          if (activeMatchesMap.has(game.gameId)) {
            const existing = activeMatchesMap.get(game.gameId);
            if (!existing.friends.some((f) => f.puuid === friendEntry.puuid)) {
              existing.friends.push(friendEntry);
            }
          } else {
            activeMatchesMap.set(game.gameId, {
              gameId: game.gameId,
              queueId: game.gameQueueConfigId,
              queue: QUEUES[game.gameQueueConfigId] ?? 'Grieta del Invocador',
              gameMode: game.gameMode,
              startTime,
              minutes,
              friends: [friendEntry],
              teams: {
                blue: blueTeam,
                red: redTeam,
              },
              bans,
              basePrediction: prediction,
              prediction,
            });
          }
        } catch {
          // Safe fallback if rate limited or player not in game
        }
      }),
    );

    rawGames = Array.from(activeMatchesMap.values()).map((g) => {
      const teams = new Set(g.friends.map((f) => f.teamId));
      return {
        ...g,
        isDuo: g.friends.length >= 2 && teams.size === 1,
        isCivilWar: g.friends.length >= 2 && teams.size > 1,
      };
    });

    rawGamesCache = rawGames;
    rawGamesExpiry = now + 45 * 1000; // 45 seconds cache for Riot API
  }

  // Apply freshest telemetry and dynamic prediction on every request
  const games = (rawGames || []).map((g) => applyTelemetryToGame(g, telemetry));

  return {
    inGame: games.length > 0,
    activeCount: games.reduce((acc, g) => acc + g.friends.length, 0),
    checkedAt: now,
    ddragonVersion: await getLatestDdragonVersion(),
    games,
  };
}

export function getDemoLiveMatch() {
  const blue = [
    {
      summonerName: 'Panda',
      champion: 'JarvanIV',
      championId: 59,
      isFriend: true,
      spell1Id: 4,
      spell2Id: 11,
      build: getChampionBuild('JarvanIV'),
      stats: {
        rankValue: 1878,
        rankLabel: 'Emerald II',
        tier: 'EMERALD',
        rank: 'II',
        lp: 78,
        winrate: 58,
        games: 112,
        hotStreak: true,
        mastery: { points: 185_400, level: 10, isMain: true },
      },
    },
    {
      summonerName: 'XACYME',
      champion: 'Rumble',
      championId: 68,
      isFriend: false,
      spell1Id: 4,
      spell2Id: 12,
      build: getChampionBuild('Rumble'),
      stats: {
        rankValue: 2035,
        rankLabel: 'Diamond IV',
        tier: 'DIAMOND',
        rank: 'IV',
        lp: 35,
        winrate: 53,
        games: 98,
        hotStreak: false,
        mastery: { points: 95_200, level: 7, isMain: true },
      },
    },
    {
      summonerName: 'TSM Mave',
      champion: 'Yasuo',
      championId: 157,
      isFriend: false,
      spell1Id: 4,
      spell2Id: 14,
      build: getChampionBuild('Yasuo'),
      stats: {
        rankValue: 1512,
        rankLabel: 'Platinum I',
        tier: 'PLATINUM',
        rank: 'I',
        lp: 12,
        winrate: 49,
        games: 210,
        hotStreak: false,
        mastery: { points: 350_000, level: 14, isMain: true },
      },
    },
    {
      summonerName: 'Morii',
      champion: 'KogMaw',
      championId: 96,
      isFriend: false,
      spell1Id: 4,
      spell2Id: 7,
      build: getChampionBuild('KogMaw'),
      stats: {
        rankValue: 1660,
        rankLabel: 'Emerald IV',
        tier: 'EMERALD',
        rank: 'IV',
        lp: 60,
        winrate: 52,
        games: 84,
        hotStreak: false,
        mastery: { points: 110_500, level: 8, isMain: true },
      },
    },
    {
      summonerName: 'El Iluminati',
      champion: 'Pyke',
      championId: 555,
      isFriend: false,
      spell1Id: 4,
      spell2Id: 14,
      build: getChampionBuild('Pyke'),
      stats: {
        rankValue: 1744,
        rankLabel: 'Emerald III',
        tier: 'EMERALD',
        rank: 'III',
        lp: 44,
        winrate: 54,
        games: 130,
        hotStreak: true,
        mastery: { points: 240_000, level: 11, isMain: true },
      },
    },
  ];

  const red = [
    {
      summonerName: 'JuanDioBrando',
      champion: 'Yone',
      championId: 777,
      isFriend: false,
      spell1Id: 4,
      spell2Id: 12,
      build: getChampionBuild('Yone'),
      stats: {
        rankValue: 1990,
        rankLabel: 'Emerald I',
        tier: 'EMERALD',
        rank: 'I',
        lp: 90,
        winrate: 51,
        games: 165,
        hotStreak: false,
        mastery: { points: 280_000, level: 12, isMain: true },
      },
    },
    {
      summonerName: 'VICENZO',
      champion: 'Nocturne',
      championId: 56,
      isFriend: false,
      spell1Id: 4,
      spell2Id: 11,
      build: getChampionBuild('Nocturne'),
      stats: {
        rankValue: 1715,
        rankLabel: 'Emerald III',
        tier: 'EMERALD',
        rank: 'III',
        lp: 15,
        winrate: 50,
        games: 75,
        hotStreak: false,
        mastery: { points: 65_000, level: 6, isMain: false },
      },
    },
    {
      summonerName: 'T3mple',
      champion: 'Kayn',
      championId: 141,
      isFriend: false,
      spell1Id: 4,
      spell2Id: 11,
      build: getChampionBuild('Kayn'),
      stats: {
        rankValue: 1850,
        rankLabel: 'Emerald II',
        tier: 'EMERALD',
        rank: 'II',
        lp: 50,
        winrate: 55,
        games: 140,
        hotStreak: false,
        mastery: { points: 190_000, level: 9, isMain: true },
      },
    },
    {
      summonerName: 'Udsep',
      champion: 'Lucian',
      championId: 236,
      isFriend: false,
      spell1Id: 4,
      spell2Id: 7,
      build: getChampionBuild('Lucian'),
      stats: {
        rankValue: 1480,
        rankLabel: 'Platinum II',
        tier: 'PLATINUM',
        rank: 'II',
        lp: 80,
        winrate: 48,
        games: 92,
        hotStreak: false,
        mastery: { points: 130_000, level: 7, isMain: true },
      },
    },
    {
      summonerName: 'foxlime',
      champion: 'Lux',
      championId: 99,
      isFriend: false,
      spell1Id: 4,
      spell2Id: 21,
      build: getChampionBuild('Lux'),
      stats: {
        rankValue: 1120,
        rankLabel: 'Gold I',
        tier: 'GOLD',
        rank: 'I',
        lp: 20,
        winrate: 47,
        games: 60,
        hotStreak: false,
        mastery: { points: 80_000, level: 6, isMain: false },
      },
    },
  ];

  const basePrediction = computeMatchPrediction(blue, red, 26);
  const demoTelemetry = getDemoTelemetry();
  const prediction = computeDynamicPrediction(basePrediction, demoTelemetry);

  // Attach in-game telemetry to demo players
  for (const team of [blue, red]) {
    for (const p of team) {
      const key = (p.summonerName || p.champion || '').toLowerCase();
      const inGame = demoTelemetry.players?.[key] || demoTelemetry.players?.[p.champion?.toLowerCase()];
      if (inGame) p.inGame = inGame;
    }
  }

  return {
    inGame: true,
    activeCount: 1,
    checkedAt: Date.now(),
    games: [
      {
        gameId: 1760179072,
        queueId: 420,
        queue: 'Ranked Solo/Duo',
        gameMode: 'CLASSIC',
        startTime: Date.now() - 26 * 60 * 1000,
        minutes: 26,
        telemetry: demoTelemetry,
        friends: [
          {
            puuid: '83WQX3_4EPAy-su8cJDhHlXo-ex6iLUzZFNz1ZTUr1XJgBiIitDH5Wm4kjz_cjL3lv-btNe8GOjTQw',
            name: 'Panda',
            riotId: 'Panda#JK23',
            teamId: 100,
            champion: 'JarvanIV',
            spell1Id: 4,
            spell2Id: 11,
            build: getChampionBuild('JarvanIV'),
          },
        ],
        teams: {
          blue,
          red,
        },
        bans: {
          blue: [
            { champion: 'Warwick' },
            { champion: 'Morgana' },
            { champion: 'Akali' },
            { champion: 'Darius' },
            { champion: 'Jinx' },
          ],
          red: [
            { champion: 'Malphite' },
            { champion: 'Fiddlesticks' },
            { champion: 'Caitlyn' },
            { champion: 'Zed' },
            { champion: 'Blitzcrank' },
          ],
        },
        prediction,
        isDuo: false,
        isCivilWar: false,
      },
    ],
  };
}
