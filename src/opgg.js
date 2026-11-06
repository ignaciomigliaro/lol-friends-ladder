// Fetches official OP.GG match scores directly from OP.GG's public MCP endpoint.

export const PLATFORM_TO_OPGG = {
  la1: 'lan',
  la2: 'las',
  na1: 'na',
  br1: 'br',
  euw1: 'euw',
  eun1: 'eune',
  kr: 'kr',
  jp1: 'jp',
  tr1: 'tr',
  ru: 'ru',
  oc1: 'oce',
  ph2: 'sea',
  sg2: 'sea',
  th2: 'sea',
  tw2: 'sea',
  vn2: 'sea',
};

export async function fetchOpggMatches({ gameName, tagLine, platform = 'la1', limit = 20 }) {
  const region = PLATFORM_TO_OPGG[platform.toLowerCase()] ?? platform.toLowerCase();
  try {
    const res = await fetch('https://mcp-api.op.gg/mcp', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
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
    const text = json.result?.content?.[0]?.text || '';

    // Parse the DSL format returned by the MCP endpoint
    const regex = /GameHistory\(\"[^\"]+\",\"([^\"]+)\",(\d+),\[Participant\(\"([^\"]+)\",Stats\((\d+),(\d+),(\d+),\"([^\"]+)\",([\d.]+|None),(\d+|None)\)\)\]\)/g;
    let match;
    const matches = [];
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        createdAt: match[1],
        duration: parseInt(match[2], 10),
        champion: match[3],
        kills: parseInt(match[4], 10),
        deaths: parseInt(match[5], 10),
        assists: parseInt(match[6], 10),
        result: match[7],
        opScore: match[8] === 'None' ? null : parseFloat(match[8]),
        opScoreRank: match[9] === 'None' ? null : parseInt(match[9], 10),
      });
    }
    return matches;
  } catch (err) {
    // Graceful fallback if OP.GG times out or fails
    return [];
  }
}

export function enrichGamesWithOpgg(games = [], opggMatches = []) {
  if (!opggMatches.length || !games.length) return 0;
  let matchedCount = 0;

  for (const g of games) {
    const found = opggMatches.find((m) => {
      if (m.champion.toLowerCase() !== g.champion.toLowerCase()) return false;
      if (m.kills !== g.kills || m.deaths !== g.deaths || m.assists !== g.assists) return false;
      const diffSecs = Math.abs(m.duration - (g.minutes * 60));
      return diffSecs <= 60;
    });

    if (found && found.opScore != null) {
      g.score = found.opScore;
      if (found.opScoreRank != null) {
        g.place = found.opScoreRank;
        g.mvp = found.opScoreRank === 1 && g.win;
        g.ace = found.opScoreRank === 1 && !g.win;
      }
      g.scoreSource = 'opgg';
      g.opggExact = true;
      matchedCount++;
    }
  }

  return matchedCount;
}
