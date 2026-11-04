// Cloudflare Worker behind the site's "Update now" button.
// Holds a GitHub token (secret GITHUB_TOKEN, only allowed to run Actions on this repo) and starts
// the update workflow. Cooldown comes from GitHub's own run history, so no storage is needed.
//
//   GET  /      -> status of the latest update run
//   POST /      -> start an update (unless one is running or ran in the last COOLDOWN_MIN minutes)
//   GET  /live  -> which friends are in a game right now (secret RIOT_API_KEY; GitHub Pages has no server)

const WORKFLOW = 'update.yml';
const COOLDOWN_MIN = 5;
const ACTIVE = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending']);
const LIVE_CACHE_MS = 45_000; // every visitor polls once a minute; this keeps Riot calls low
const QUEUES = { 420: 'Ranked Solo/Duo', 440: 'Ranked Flex', 400: 'Normal Reclutamiento', 430: 'Normal Oculta', 450: 'ARAM', 490: 'Partida Rápida', 1700: 'Arena 2v2v2v2' };
let liveCache = null;
let champCache = null;

// Data Dragon champion ids by numeric key ("62" -> "MonkeyKing"), the names the site's images use.
async function championIds() {
  if (champCache && Date.now() - champCache.at < 6 * 3600_000) return champCache.map;
  const [version] = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json();
  const list = (await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`)).json()).data;
  const map = Object.fromEntries(Object.values(list).map((c) => [c.key, c.id]));
  champCache = { at: Date.now(), map };
  return map;
}

// Same shape as the local server's /api/live (src/live.js), so the site renders it the same way.
export async function liveGames(env, now = Date.now()) {
  if (liveCache && now - liveCache.at < LIVE_CACHE_MS) return liveCache.data;
  const board = await (await fetch(`${env.SITE_URL}/leaderboard.json?t=${now}`)).json();
  const friends = new Map(board.players.map((p) => [p.puuid, p]));
  const champs = await championIds().catch(() => ({}));
  const champ = (id) => champs[id] ?? (id > 0 ? `Champ #${id}` : 'Unknown');

  const found = await Promise.all(board.players.map(async (p) => {
    const platform = (p.platform ?? board.platform ?? 'la1').toLowerCase();
    const res = await fetch(`https://${platform}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${p.puuid}`, {
      headers: { 'X-Riot-Token': env.RIOT_API_KEY },
    });
    if (res.status === 404) return null; // not in a game
    if (!res.ok) throw new Error(`Riot said ${res.status}`);
    return { p, game: await res.json() };
  }));

  const games = new Map();
  for (const hit of found.filter(Boolean)) {
    const { p, game } = hit;
    const me = game.participants?.find((x) => x.puuid === p.puuid);
    const friend = { puuid: p.puuid, name: p.name, riotId: p.riotId, teamId: me?.teamId ?? 100, champion: champ(me?.championId), spell1Id: me?.spell1Id, spell2Id: me?.spell2Id };
    if (games.has(game.gameId)) { games.get(game.gameId).friends.push(friend); continue; }
    const person = (x) => {
      const f = friends.get(x.puuid);
      return { puuid: x.puuid, riotId: x.riotId ?? f?.riotId ?? null, summonerName: f?.name ?? (x.riotId?.split('#')[0] || 'Invocador'), champion: champ(x.championId), championId: x.championId, teamId: x.teamId, spell1Id: x.spell1Id, spell2Id: x.spell2Id, profileIconId: x.profileIconId, isFriend: !!f, friendName: f?.name ?? null };
    };
    const bans = (team) => (game.bannedChampions ?? []).filter((b) => b.teamId === team && b.championId > 0).map((b) => ({ championId: b.championId, champion: champ(b.championId) }));
    const startTime = game.gameStartTime > 0 ? game.gameStartTime : now - (game.gameLength ?? 0) * 1000;
    games.set(game.gameId, {
      gameId: game.gameId, queueId: game.gameQueueConfigId, queue: QUEUES[game.gameQueueConfigId] ?? 'Grieta del Invocador', gameMode: game.gameMode,
      startTime, minutes: Math.max(0, Math.floor((now - startTime) / 60000)), friends: [friend],
      teams: { blue: (game.participants ?? []).filter((x) => x.teamId === 100).map(person), red: (game.participants ?? []).filter((x) => x.teamId === 200).map(person) },
      bans: { blue: bans(100), red: bans(200) },
    });
  }
  const list = [...games.values()].map((g) => {
    const teams = new Set(g.friends.map((f) => f.teamId));
    return { ...g, isDuo: g.friends.length >= 2 && teams.size === 1, isCivilWar: g.friends.length >= 2 && teams.size > 1 };
  });
  const data = { inGame: list.length > 0, activeCount: list.reduce((n, g) => n + g.friends.length, 0), checkedAt: now, games: list };
  liveCache = { at: now, data };
  return data;
}

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (new URL(req.url).pathname === '/live') {
      if (!env.RIOT_API_KEY) return json({ error: 'RIOT_API_KEY is not set on the Worker' }, 503);
      try {
        return json(await liveGames(env));
      } catch (err) {
        return json({ error: `Could not check live games: ${err.message}` }, 502);
      }
    }

    const gh = (path, init = {}) =>
      fetch(`https://api.github.com/repos/${env.REPO}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'lol-friends-ladder-update-button',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

    const res = await gh(`/actions/workflows/${WORKFLOW}/runs?per_page=1`);
    if (!res.ok) return json({ error: `GitHub said ${res.status}` }, 502);
    const last = (await res.json()).workflow_runs?.[0];
    const lastInfo = last && {
      status: last.status,
      conclusion: last.conclusion,
      createdAt: last.created_at,
      updatedAt: last.updated_at,
    };

    if (req.method === 'GET') return json({ last: lastInfo });
    if (req.method !== 'POST') return json({ error: 'Use GET or POST' }, 405);

    if (last && ACTIVE.has(last.status)) return json({ result: 'running', last: lastInfo });
    const ageMs = last ? Date.now() - Date.parse(last.created_at) : Infinity;
    if (ageMs < COOLDOWN_MIN * 60_000) {
      return json({ result: 'cooldown', retryInSec: Math.ceil((COOLDOWN_MIN * 60_000 - ageMs) / 1000), last: lastInfo });
    }

    const started = await gh(`/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ ref: 'main' }),
    });
    if (started.status !== 204) return json({ error: `Could not start the update (GitHub said ${started.status})` }, 502);
    return json({ result: 'started', startedAt: new Date().toISOString() });
  },
};
