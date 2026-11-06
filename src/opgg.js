// OP.GG's real OP Score for a player's recent games, from OP.GG's public MCP API (mcp-api.op.gg).
// Ported from the development branch (src/opgg.js by Victor). Games OP.GG returns replace the
// site's own estimate (src/opscore.js); every other game keeps the estimate. If OP.GG doesn't
// answer, nothing changes.

export const PLATFORM_TO_OPGG = {
  la1: 'lan', la2: 'las', na1: 'na', br1: 'br', euw1: 'euw', eun1: 'eune', kr: 'kr', jp1: 'jp',
  tr1: 'tr', ru: 'ru', oc1: 'oce', ph2: 'sea', sg2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea',
};

// The MCP answer is a compact text format; one GameHistory(...) per game, with only this player.
const GAME_RE = /GameHistory\("[^"]+","([^"]+)",(\d+),\[Participant\("([^"]+)",Stats\((\d+),(\d+),(\d+),"([^"]+)",([\d.]+|None),(\d+|None)\)\)\]\)/g;

export function parseOpggMatches(text = '') {
  const out = [];
  for (const m of text.matchAll(GAME_RE)) {
    out.push({
      createdAt: m[1],
      duration: Number(m[2]),
      champion: m[3],
      kills: Number(m[4]),
      deaths: Number(m[5]),
      assists: Number(m[6]),
      result: m[7],
      opScore: m[8] === 'None' ? null : Number(m[8]),
      opScoreRank: m[9] === 'None' ? null : Number(m[9]),
    });
  }
  return out;
}

export async function fetchOpggMatches({ gameName, tagLine, platform = 'la1', limit = 20 }) {
  const region = PLATFORM_TO_OPGG[platform.toLowerCase()] ?? platform.toLowerCase();
  try {
    const res = await fetch('https://mcp-api.op.gg/mcp', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'lol-friends-ladder' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'lol_list_summoner_matches',
          arguments: {
            game_name: gameName,
            tag_line: tagLine,
            region,
            limit: Math.min(20, Math.max(5, limit)),
            desired_output_fields: [
              'data.game_history[].id',
              'data.game_history[].created_at',
              'data.game_history[].game_length_second',
              'data.game_history[].participants[].champion_name',
              'data.game_history[].participants[].stats.{op_score,op_score_rank,kill,death,assist,result}',
            ],
          },
        },
      }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return parseOpggMatches(json.result?.content?.[0]?.text);
  } catch {
    return []; // OP.GG down or slow: keep the site's own scores
  }
}

// "Kai'Sa" and "KaiSa", "Nunu & Willump" and "Nunu", etc. compare equal.
const champKey = (s) => String(s ?? '').toLowerCase().replace(/[^a-z]/g, '').replace(/willump$/, '');

// Sets OP.GG's score on the games it recognizes (same champion, K/D/A and length within a minute).
// op_score_rank is the player's place out of 10 by OP Score, so:
//   rank 1 on the winning team = MVP; rank 1 on the losing team = ACE (best loser, and best overall).
// Otherwise ACE (best of the losing team) can't be told from one player's rank, so the site's own
// MVP/ACE/Mochila tags stay. Returns how many games were matched.
export function applyOpggScores(games = [], opggMatches = []) {
  let matched = 0;
  for (const g of games) {
    if (g.isRemake) continue;
    const o = opggMatches.find((m) => m.opScore != null
      && champKey(m.champion) === champKey(g.champion)
      && m.kills === g.kills && m.deaths === g.deaths && m.assists === g.assists
      && Math.abs(m.duration - g.minutes * 60) <= 60);
    if (!o) continue;
    setExact(g, { score: Math.round(o.opScore * 10) / 10, place: o.opScoreRank });
    matched++;
  }
  return matched;
}

// Puts an exact OP.GG result on a game (also used to keep last refresh's exact scores).
export function setExact(g, { score, place }) {
  g.score = score;
  g.scoreSource = 'opgg';
  if (place == null) return;
  g.place = place;
  if (place === 1) {
    g.mvp = g.win;
    g.ace = !g.win;
    g.mochila = false;
  } else if (g.win && place > 2) {
    g.mvp = false; // at least one winner scored higher (rank 2 can still be MVP behind an ACE)
  }
}
