import { RiotClient, PLATFORM_TO_REGION } from './riot.js';
import { DATA_DIR } from './config.js';
import { readJson } from './tracker.js';
import { getChampionBuild } from './builds.js';

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
let liveCache = null;
let liveCacheExpiry = 0;

export async function getChampionIdMap(ddragonVersion = '14.24.1') {
  const now = Date.now();
  if (champIdMap && now < champMapExpiry) return champIdMap;
  try {
    const res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/en_US/champion.json`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error('Failed to fetch champion list');
    const data = await res.json();
    const map = {};
    for (const c of Object.values(data.data)) {
      map[c.key] = c.id;
    }
    champIdMap = map;
    champMapExpiry = now + 6 * 60 * 60 * 1000; // cache for 6 hours
    return map;
  } catch {
    return champIdMap ?? {};
  }
}

export async function checkLiveGames(config) {
  const now = Date.now();
  if (liveCache && now < liveCacheExpiry) {
    return liveCache;
  }

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
          };
        };

        const blueTeam = (game.participants || []).filter((p) => p.teamId === 100).map(mapParticipant);
        const redTeam = (game.participants || []).filter((p) => p.teamId === 200).map(mapParticipant);

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
          const startTime = game.gameStartTime > 0 ? game.gameStartTime : now - (game.gameLength ?? 0) * 1000;
          const minutes = Math.max(0, Math.floor((now - startTime) / 60000));

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
          });
        }
      } catch {
        // Safe fallback if rate limited or player not in game
      }
    }),
  );

  const games = Array.from(activeMatchesMap.values()).map((g) => {
    const teams = new Set(g.friends.map((f) => f.teamId));
    return {
      ...g,
      isDuo: g.friends.length >= 2 && teams.size === 1,
      isCivilWar: g.friends.length >= 2 && teams.size > 1,
    };
  });

  const result = {
    inGame: games.length > 0,
    activeCount: games.reduce((acc, g) => acc + g.friends.length, 0),
    checkedAt: now,
    games,
  };

  liveCache = result;
  liveCacheExpiry = now + 45 * 1000; // 45 seconds cache
  return result;
}

export function getDemoLiveMatch() {
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
          blue: [
            { summonerName: 'Panda', champion: 'JarvanIV', isFriend: true, spell1Id: 4, spell2Id: 11, build: getChampionBuild('JarvanIV') },
            { summonerName: 'XACYME', champion: 'Rumble', isFriend: false, spell1Id: 4, spell2Id: 12, build: getChampionBuild('Rumble') },
            { summonerName: 'TSM Mave', champion: 'Yasuo', isFriend: false, spell1Id: 4, spell2Id: 14, build: getChampionBuild('Yasuo') },
            { summonerName: 'Morii', champion: 'KogMaw', isFriend: false, spell1Id: 4, spell2Id: 7, build: getChampionBuild('KogMaw') },
            { summonerName: 'El Iluminati', champion: 'Pyke', isFriend: false, spell1Id: 4, spell2Id: 14, build: getChampionBuild('Pyke') },
          ],
          red: [
            { summonerName: 'JuanDioBrando', champion: 'Yone', isFriend: false, spell1Id: 4, spell2Id: 12, build: getChampionBuild('Yone') },
            { summonerName: 'VICENZO', champion: 'Nocturne', isFriend: false, spell1Id: 4, spell2Id: 11, build: getChampionBuild('Nocturne') },
            { summonerName: 'T3mple', champion: 'Kayn', isFriend: false, spell1Id: 4, spell2Id: 11, build: getChampionBuild('Kayn') },
            { summonerName: 'Udsep', champion: 'Lucian', isFriend: false, spell1Id: 4, spell2Id: 7, build: getChampionBuild('Lucian') },
            { summonerName: 'foxlime', champion: 'Lux', isFriend: false, spell1Id: 4, spell2Id: 21, build: getChampionBuild('Lux') },
          ],
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
        isDuo: false,
        isCivilWar: false,
      },
    ],
  };
}
