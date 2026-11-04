// Ingestion and parsing of Riot LoL Live Client Data API (https://127.0.0.1:2999/liveclientdata/allgamedata)
import { computeDynamicPrediction } from './prediction.js';

let activeTelemetry = null;
const TELEMETRY_TTL_MS = 90_000; // 90 seconds freshness window

export function parseLiveClientData(raw) {
  if (!raw || !raw.allPlayers || !Array.isArray(raw.allPlayers)) {
    return null;
  }

  const gameTime = Number(raw.gameData?.gameTime) || 0;
  const minutes = Math.floor(gameTime / 60);
  const seconds = Math.floor(gameTime % 60);

  const playersMap = {}; // nameOrChamp -> playerData
  const blue = { kills: 0, deaths: 0, assists: 0, gold: 0, towers: 0, dragons: 0, barons: 0 };
  const red = { kills: 0, deaths: 0, assists: 0, gold: 0, towers: 0, dragons: 0, barons: 0 };

  const playerTeamMap = new Map(); // summonerName -> 'ORDER' | 'CHAOS'

  for (const p of raw.allPlayers) {
    const isBlue = p.team === 'ORDER';
    playerTeamMap.set(p.summonerName, p.team);

    const scores = p.scores || {};
    const kills = Number(scores.kills) || 0;
    const deaths = Number(scores.deaths) || 0;
    const assists = Number(scores.assists) || 0;
    const cs = Number(scores.creepScore) || 0;
    const level = Number(p.level) || 1;

    // Estimate item net worth & gold
    const items = (p.items || []).map((it) => ({
      id: it.itemID,
      name: it.displayName,
      count: it.count || 1,
      price: it.price || 0,
    }));

    const itemGold = items.reduce((acc, it) => acc + (it.price || 0) * (it.count || 1), 0);
    const estGold = itemGold + Math.max(0, Math.floor(cs * 20.5 + kills * 300 + assists * 150));

    if (isBlue) {
      blue.kills += kills;
      blue.deaths += deaths;
      blue.assists += assists;
      blue.gold += estGold;
    } else {
      red.kills += kills;
      red.deaths += deaths;
      red.assists += assists;
      red.gold += estGold;
    }

    const sName = p.summonerName || '';
    const cName = p.championName || '';

    const info = {
      summonerName: sName,
      championName: cName,
      team: p.team,
      teamId: isBlue ? 100 : 200,
      level,
      isDead: Boolean(p.isDead),
      respawnTimer: Math.round(Number(p.respawnTimer) || 0),
      kills,
      deaths,
      assists,
      cs,
      gold: estGold,
      items,
    };

    if (sName) {
      playersMap[sName.toLowerCase()] = info;
      playersMap[sName.toLowerCase().split('#')[0]] = info;
    }
    if (cName) {
      playersMap[cName.toLowerCase()] = info;
      playersMap[cName.toLowerCase().replace(/[^a-z0-9]/g, '')] = info;
    }
    if (p.rawChampionName) {
      const cleanRaw = String(p.rawChampionName).toLowerCase().replace(/.*_/, '').replace(/[^a-z0-9]/g, '');
      if (cleanRaw) playersMap[cleanRaw] = info;
    }
  }

  // Parse events (Dragons, Barons, Turrets)
  const events = raw.events?.Events || [];
  for (const ev of events) {
    const killer = ev.KillerName;
    const team = playerTeamMap.get(killer);
    const isBlue = team === 'ORDER';

    if (ev.EventName === 'DragonKill') {
      if (isBlue) blue.dragons += 1;
      else if (team === 'CHAOS') red.dragons += 1;
    } else if (ev.EventName === 'BaronKill') {
      if (isBlue) blue.barons += 1;
      else if (team === 'CHAOS') red.barons += 1;
    } else if (ev.EventName === 'TurretKilled') {
      if (isBlue) blue.towers += 1;
      else if (team === 'CHAOS') red.towers += 1;
    }
  }

  const goldLead = blue.gold - red.gold;
  const killsLead = blue.kills - red.kills;

  return {
    updatedAt: Date.now(),
    gameTime: Math.round(gameTime),
    minutes,
    seconds,
    blue,
    red,
    goldLead,
    killsLead,
    players: playersMap,
  };
}

export function recordTelemetry(rawOrParsed) {
  if (!rawOrParsed) return null;
  const parsed = rawOrParsed.allPlayers ? parseLiveClientData(rawOrParsed) : rawOrParsed;
  if (!parsed) return null;

  activeTelemetry = {
    ...parsed,
    receivedAt: Date.now(),
  };
  return activeTelemetry;
}

export function getLatestTelemetry() {
  if (!activeTelemetry) return null;
  const age = Date.now() - (activeTelemetry.receivedAt || activeTelemetry.updatedAt || 0);
  if (age > TELEMETRY_TTL_MS) {
    return null;
  }
  return activeTelemetry;
}

export function getDemoTelemetry() {
  const gameTime = 26 * 60 + 14; // 26:14
  return {
    updatedAt: Date.now(),
    receivedAt: Date.now(),
    gameTime,
    minutes: 26,
    seconds: 14,
    blue: {
      kills: 22,
      deaths: 15,
      assists: 38,
      gold: 48900,
      towers: 5,
      dragons: 3,
      barons: 1,
    },
    red: {
      kills: 15,
      deaths: 22,
      assists: 24,
      gold: 44300,
      towers: 2,
      dragons: 1,
      barons: 0,
    },
    goldLead: 4600,
    killsLead: 7,
    players: {
      panda: {
        summonerName: 'Panda',
        championName: 'JarvanIV',
        teamId: 100,
        level: 13,
        isDead: false,
        respawnTimer: 0,
        kills: 7,
        deaths: 2,
        assists: 11,
        cs: 168,
        gold: 11200,
        items: [
          { id: 6692, name: 'Eclipse' },
          { id: 6610, name: 'Cielo Desgarrado' },
          { id: 3161, name: 'Lanza de Shojin' },
          { id: 3047, name: 'Punteras de Acero' },
          { id: 1036, name: 'Espada Larga' },
          { id: 3340, name: 'Lente del Oráculo' },
        ],
      },
      xacyme: {
        summonerName: 'XACYME',
        championName: 'Rumble',
        teamId: 100,
        level: 14,
        isDead: false,
        respawnTimer: 0,
        kills: 5,
        deaths: 3,
        assists: 6,
        cs: 215,
        gold: 10900,
        items: [
          { id: 3157, name: 'Reloj de Arena de Zhonya' },
          { id: 3152, name: 'Cinturón Cohete Hextech' },
          { id: 3020, name: 'Botas de Hechicero' },
        ],
      },
      'tsm mave': {
        summonerName: 'TSM Mave',
        championName: 'Yasuo',
        teamId: 100,
        level: 13,
        isDead: true,
        respawnTimer: 18,
        kills: 4,
        deaths: 5,
        assists: 4,
        cs: 198,
        gold: 9800,
        items: [
          { id: 3046, name: 'Bailarín Espectral' },
          { id: 3031, name: 'Filo Infinito' },
          { id: 3006, name: 'Grebas de Berserker' },
        ],
      },
      morii: {
        summonerName: 'Morii',
        championName: 'KogMaw',
        teamId: 100,
        level: 13,
        isDead: false,
        respawnTimer: 0,
        kills: 5,
        deaths: 3,
        assists: 9,
        cs: 232,
        gold: 11600,
        items: [
          { id: 3124, name: 'Espada de Furia de Guinsoo' },
          { id: 3153, name: 'Espada del Rey Arruinado' },
          { id: 3006, name: 'Grebas de Berserker' },
        ],
      },
      'el iluminati': {
        summonerName: 'El Iluminati',
        championName: 'Pyke',
        teamId: 100,
        level: 11,
        isDead: false,
        respawnTimer: 0,
        kills: 1,
        deaths: 2,
        assists: 12,
        cs: 34,
        gold: 5400,
        items: [
          { id: 3179, name: 'Filo de la Noche' },
          { id: 3117, name: 'Botas de Movilidad' },
        ],
      },
      juandiobrando: {
        summonerName: 'JuanDioBrando',
        championName: 'Yone',
        teamId: 200,
        level: 14,
        isDead: false,
        respawnTimer: 0,
        kills: 6,
        deaths: 4,
        assists: 3,
        cs: 220,
        gold: 10800,
        items: [
          { id: 3046, name: 'Bailarín Espectral' },
          { id: 3031, name: 'Filo Infinito' },
          { id: 3006, name: 'Grebas de Berserker' },
        ],
      },
      vicenzo: {
        summonerName: 'VICENZO',
        championName: 'Nocturne',
        teamId: 200,
        level: 12,
        isDead: false,
        respawnTimer: 0,
        kills: 3,
        deaths: 5,
        assists: 5,
        cs: 145,
        gold: 8400,
        items: [
          { id: 6692, name: 'Eclipse' },
          { id: 3047, name: 'Punteras de Acero' },
        ],
      },
      t3mple: {
        summonerName: 'T3mple',
        championName: 'Kayn',
        teamId: 200,
        level: 13,
        isDead: false,
        respawnTimer: 0,
        kills: 3,
        deaths: 4,
        assists: 6,
        cs: 172,
        gold: 9200,
        items: [
          { id: 6691, name: 'Rencor de Serylda' },
          { id: 3142, name: 'Espada Fantasma de Youmuu' },
        ],
      },
      udsep: {
        summonerName: 'Udsep',
        championName: 'Lucian',
        teamId: 200,
        level: 12,
        isDead: true,
        respawnTimer: 25,
        kills: 2,
        deaths: 5,
        assists: 4,
        cs: 185,
        gold: 8900,
        items: [
          { id: 6676, name: 'Coleccionista' },
          { id: 3031, name: 'Filo Infinito' },
        ],
      },
      foxlime: {
        summonerName: 'foxlime',
        championName: 'Lux',
        teamId: 200,
        level: 11,
        isDead: false,
        respawnTimer: 0,
        kills: 1,
        deaths: 4,
        assists: 6,
        cs: 28,
        gold: 5000,
        items: [
          { id: 6655, name: 'Compañero de Luden' },
          { id: 3020, name: 'Botas de Hechicero' },
        ],
      },
    },
  };
}
