import fs from 'node:fs/promises';
import path from 'node:path';
import { scoreMatch } from '../src/score.js';
import { buildGroupGame } from '../src/group.js';
import { computeGroupRecords } from '../src/records.js';
import { computeGroupMeta } from '../src/meta.js';
import { DATA_DIR } from '../src/config.js';
import { writeJson, readJson } from '../src/tracker.js';

const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');
const GROUP_GAMES_FILE = path.join(DATA_DIR, 'group-games.json');

async function findMatchFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findMatchFiles(fullPath)));
    } else if (entry.name.endsWith('.json')) {
      const matchId = entry.name.replace(/\.json$/, '');
      files.push({ matchId, fullPath });
    }
  }
  return files;
}

async function main() {
  console.log('🔄 Buscando partidas en caché...');
  const matchesDir = path.join(DATA_DIR, 'matches');
  const matchFiles = await findMatchFiles(matchesDir);
  const matchMap = new Map();
  for (const m of matchFiles) {
    matchMap.set(m.matchId, m.fullPath);
  }
  console.log(`📦 Se encontraron ${matchMap.size} partidas cacheadas en disco.`);

  console.log('📖 Leyendo leaderboard actual...');
  const board = await readJson(LEADERBOARD_FILE, null);
  if (!board || !board.players) {
    console.error('❌ No se encontró data/leaderboard.json');
    return;
  }

  const round = (val, d = 1) => Number(Number(val).toFixed(d));
  let rescoredGames = 0;

  for (const player of board.players) {
    const oldAvg = player.stats?.avgScore;
    const oldMvp = player.stats?.mvp;
    const oldAce = player.stats?.ace;

    // Recalcular cada partida
    for (const g of (player.games || [])) {
      const filePath = matchMap.get(g.matchId);
      if (!filePath) continue;
      try {
        const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
        const scores = scoreMatch(raw);
        const s = scores.get(player.puuid);
        if (s) {
          g.score = s.score;
          g.place = s.place;
          g.mvp = s.mvp;
          g.ace = s.ace;
          g.mochila = s.mochila;
          rescoredGames++;
        }
      } catch (e) {
        // Ignorar errores de archivo individual
      }
    }

    // Recomputar estadísticas del jugador (usando sus partidas recientes)
    const recent = (player.games || []).slice(0, 40);
    const n = recent.length;
    if (n > 0 && player.stats) {
      const sum = (fn) => recent.reduce((acc, g) => acc + fn(g), 0);
      player.stats.avgScore = round(sum((g) => g.score) / n);
      player.stats.mvp = sum((g) => (g.mvp ? 1 : 0));
      player.stats.ace = sum((g) => (g.ace ? 1 : 0));

      // Recomputar topChampions
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

    console.log(`👤 ${player.name.padEnd(16)} | Score: ${oldAvg ?? '-'} -> ${player.stats?.avgScore ?? '-'} | MVPs: ${oldMvp ?? '-'} -> ${player.stats?.mvp ?? '-'}`);
  }

  // Recomputar récords del grupo y metadata
  board.records = computeGroupRecords(board.players);
  board.meta = computeGroupMeta(board.players);

  console.log(`💾 Guardando leaderboard actualizado (${rescoredGames} partidas repuntuadas)...`);
  await writeJson(LEADERBOARD_FILE, board);

  // Recomputar partidas grupales (group-games.json) para incluir s.mochila
  const friendsByPuuid = new Map(board.players.map((p) => [p.puuid, p.name]));
  const existingGroupGames = await readJson(GROUP_GAMES_FILE, []);
  const updatedGroupGames = [];
  for (const g of existingGroupGames) {
    const filePath = matchMap.get(g.matchId);
    if (!filePath) {
      updatedGroupGames.push(g);
      continue;
    }
    try {
      const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
      const rebuilt = buildGroupGame(raw, friendsByPuuid);
      updatedGroupGames.push(rebuilt || g);
    } catch {
      updatedGroupGames.push(g);
    }
  }
  if (updatedGroupGames.length) {
    console.log(`💾 Guardando group-games.json (${updatedGroupGames.length} partidas de grupo)...`);
    await writeJson(GROUP_GAMES_FILE, updatedGroupGames);
  }

  // Calcular quién es el MVP de la semana con los nuevos datos
  const weekStart = board.weekStart;
  const getWeeklyStats = (p) => {
    const games = (p.games || []).filter((g) => (weekStart ? g.endTs >= weekStart : true));
    if (!games.length) return null;
    const wins = games.filter((g) => g.win).length;
    const avgScore = games.reduce((acc, g) => acc + g.score, 0) / games.length;
    const lpWeek = p.lpDelta?.week ?? 0;
    const performanceIndex = (avgScore * 8) + (wins * 1.5) + (Math.max(0, lpWeek) * 0.1) + ((wins / games.length) * 20);
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
    console.log('\n👑 ===========================================');
    console.log(`   MVP DE LA SEMANA ACTUALIZADO: ${weeklyMvp.player.name}`);
    console.log(`   OP SCORE SEMANAL: ${weeklyMvp.wStats.avgScore}`);
    console.log(`   Partidas: ${weeklyMvp.wStats.games} (${weeklyMvp.wStats.winrate}% WR) | MVPs: ${weeklyMvp.wStats.mvps}`);
    console.log('=============================================\n');
  }

  console.log('✅ Actualización completada con éxito.');
}

main().catch(console.error);
