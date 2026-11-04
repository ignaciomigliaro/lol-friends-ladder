// Computes historical Hall of Fame records and group aggregates
// from tracked friends and their parsed ranked matches.

export function computeGroupRecords(players = []) {
  const records = {
    maxDamage: null,
    maxKills: null,
    maxDeaths: null,
    maxVision: null,
    maxGold: null,
    maxCs: null,
    maxAssists: null,
    maxSoloKills: null,
    longestGame: null,
    bestKda: null,
    mostMvp: null,
    highestWinrate: null,
    highestAvgScore: null,
    highestWeeklyLp: null,
    totals: {
      totalGames: 0,
      totalWins: 0,
      winrate: 0,
      totalKills: 0,
      totalDeaths: 0,
      totalAssists: 0,
      totalDamage: 0,
    },
  };

  const updateRecord = (key, val, p, g) => {
    if (val === undefined || val === null || Number.isNaN(val)) return;
    if (!records[key] || val > records[key].value) {
      records[key] = {
        value: val,
        player: p.name,
        puuid: p.puuid,
        riotId: p.riotId,
        champion: g.champion,
        matchId: g.matchId,
        date: g.endTs,
        minutes: g.minutes,
        win: g.win,
        role: g.position,
        kills: g.kills,
        deaths: g.deaths,
        assists: g.assists,
      };
    }
  };

  for (const p of players) {
    // Player-level cumulative records
    if (p.stats) {
      if (p.stats.mvp > 0 && (!records.mostMvp || p.stats.mvp > records.mostMvp.value)) {
        records.mostMvp = { value: p.stats.mvp, player: p.name, puuid: p.puuid, riotId: p.riotId };
      }
      if (p.stats.games >= 5 && (!records.highestWinrate || p.stats.winrate > records.highestWinrate.value)) {
        records.highestWinrate = { value: p.stats.winrate, player: p.name, puuid: p.puuid, riotId: p.riotId, games: p.stats.games };
      }
      if (p.stats.games >= 5 && (!records.highestAvgScore || p.stats.avgScore > records.highestAvgScore.value)) {
        records.highestAvgScore = { value: p.stats.avgScore, player: p.name, puuid: p.puuid, riotId: p.riotId, games: p.stats.games };
      }
    }
    if (p.lpDelta?.week && (!records.highestWeeklyLp || p.lpDelta.week > records.highestWeeklyLp.value)) {
      records.highestWeeklyLp = { value: p.lpDelta.week, player: p.name, puuid: p.puuid, riotId: p.riotId };
    }

    // Per-game records
    for (const g of p.games ?? []) {
      if (g.isRemake) continue;
      records.totals.totalGames++;
      if (g.win) records.totals.totalWins++;
      records.totals.totalKills += (g.kills ?? 0);
      records.totals.totalDeaths += (g.deaths ?? 0);
      records.totals.totalAssists += (g.assists ?? 0);
      records.totals.totalDamage += (g.damage ?? 0);

      updateRecord('maxDamage', g.damage, p, g);
      updateRecord('maxKills', g.kills, p, g);
      updateRecord('maxDeaths', g.deaths, p, g);
      updateRecord('maxVision', g.vision, p, g);
      updateRecord('maxGold', g.gold, p, g);
      updateRecord('maxCs', g.cs, p, g);
      updateRecord('maxAssists', g.assists, p, g);
      updateRecord('maxSoloKills', g.soloKills, p, g);
      updateRecord('longestGame', g.minutes, p, g);

      if ((g.kills ?? 0) >= 5) {
        const kda = ((g.kills ?? 0) + (g.assists ?? 0)) / Math.max(1, g.deaths ?? 0);
        updateRecord('bestKda', Math.round(kda * 10) / 10, p, g);
      }
    }
  }

  if (records.totals.totalGames > 0) {
    records.totals.winrate = Math.round((records.totals.totalWins * 100) / records.totals.totalGames);
  }

  return records;
}
