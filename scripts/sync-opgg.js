import { fetchOpggMatches, enrichGamesWithOpgg } from '../src/opgg.js';
import { DATA_DIR } from '../src/config.js';
import { readJson, writeJson } from '../src/tracker.js';
import { computeGroupRecords } from '../src/records.js';
import { computeGroupMeta } from '../src/meta.js';
import path from 'node:path';

const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');

async function main() {
  console.log('🌐 Conectando directamente a la API oficial de OP.GG...\n');
  const board = await readJson(LEADERBOARD_FILE, null);
  if (!board || !board.players) {
    console.error('❌ No se encontró data/leaderboard.json');
    return;
  }

  const round = (val, d = 1) => Number(Number(val).toFixed(d));
  let totalMatched = 0;

  for (const player of board.players) {
    const parts = (player.riotId || '').split('#');
    if (parts.length < 2) continue;
    const [gameName, tagLine] = parts;
    const platform = player.platform || board.platform || 'la1';

    console.log(`📡 Consultando OP.GG para ${gameName}#${tagLine} (${platform})...`);
    const opggMatches = await fetchOpggMatches({ gameName, tagLine, platform, limit: 20 });
    console.log(`   -> Se obtuvieron ${opggMatches.length} partidas oficiales de OP.GG.`);

    const beforeAvg = player.stats?.avgScore;
    const beforeMvps = player.stats?.mvp;

    const matched = enrichGamesWithOpgg(player.games || [], opggMatches);
    totalMatched += matched;

    // Recomputar estadísticas del jugador con los scores exactos de OP.GG
    const recent = (player.games || []).slice(0, 40);
    const n = recent.length;
    if (n > 0 && player.stats) {
      const sum = (fn) => recent.reduce((acc, g) => acc + fn(g), 0);
      player.stats.avgScore = round(sum((g) => g.score) / n);
      player.stats.mvp = sum((g) => (g.mvp ? 1 : 0));
      player.stats.ace = sum((g) => (g.ace ? 1 : 0));

      const champs = {};
      for (const g of recent) {
        const c = (champs[g.champion] ??= { champion: g.champion, games: 0, wins: 0, score: 0 });
        c.games++;
        c.wins += g.win ? 1 : 0;
        c.score += g.score;
      }
      player.topChampions = Object.values(champs)
        .sort((a, b) => b.games - a.games || b.score - a.score)
        .slice(0, 3)
        .map((c) => ({ ...c, score: round(c.score / c.games) }));
    }

    console.log(`   ✅ ${matched} partidas sincronizadas 1:1 con OP.GG | Score: ${beforeAvg ?? '-'} -> ${player.stats?.avgScore ?? '-'} | MVPs: ${beforeMvps ?? '-'} -> ${player.stats?.mvp ?? '-'}\n`);
  }

  // Recomputar récords
  board.records = computeGroupRecords(board.players);
  board.meta = computeGroupMeta(board.players);

  await writeJson(LEADERBOARD_FILE, board);
  console.log(`💾 Leaderboard guardado con éxito (${totalMatched} partidas sincronizadas directamente con OP.GG).\n`);

  // Calcular MVP de la semana con los datos de OP.GG
  const weekStart = board.weekStart;
  const getWeeklyStats = (p) => {
    const games = (p.games || []).filter((g) => (weekStart ? g.endTs >= weekStart : true));
    if (!games.length) return null;
    const wins = games.filter((g) => g.win).length;
    const avgScore = games.reduce((acc, g) => acc + g.score, 0) / games.length;
    const lpWeek = p.lpDelta?.week ?? 0;
    const mvps = games.filter((g) => g.mvp).length;
    const netWins = Math.max(0, wins - (games.length - wins));
    const performanceIndex = (avgScore * 10) + ((wins / games.length) * 25) + (Math.max(0, lpWeek) * 0.15) + (netWins * 2.5) + (mvps * 1.5) + (Math.min(games.length, 15) * 0.3);
    return {
      games: games.length,
      wins,
      losses: games.length - wins,
      winrate: Math.round((wins / games.length) * 100),
      avgScore: round(avgScore),
      mvps: games.filter((g) => g.mvp).length,
      performanceIndex,
    };
  };

  const candidates = board.players
    .map((p) => ({ player: p, wStats: getWeeklyStats(p) }))
    .filter((x) => x.wStats && x.wStats.games >= 3);

  if (candidates.length) {
    candidates.sort((a, b) => {
      const posA = a.wStats.lpWeek >= 0 ? 1 : 0;
      const posB = b.wStats.lpWeek >= 0 ? 1 : 0;
      if (posB !== posA) return posB - posA;
      return b.wStats.performanceIndex - a.wStats.performanceIndex;
    });
    const weeklyMvp = candidates[0];
    console.log('👑 ====================================================');
    console.log(`   MVP DE LA SEMANA (CALIFICACIÓN OFICIAL OP.GG): ${weeklyMvp.player.name}`);
    console.log(`   OP SCORE PROMEDIO: ${weeklyMvp.wStats.avgScore}`);
    console.log(`   Partidas: ${weeklyMvp.wStats.games} (${weeklyMvp.wStats.winrate}% WR) | MVPs: ${weeklyMvp.wStats.mvps}`);
    console.log('====================================================\n');
  }
}

main().catch(console.error);
