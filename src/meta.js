// Computes group-wide champion statistics, tier lists, and role meta
// from all parsed ranked matches of the friend group.

export const ROLE_NAMES = {
  TOP: 'Superior',
  JUNGLE: 'Jungla',
  MIDDLE: 'Carril Central',
  BOTTOM: 'Tirador (ADC)',
  UTILITY: 'Soporte',
};

export function computeGroupMeta(players = []) {
  const champStats = {};

  for (const p of players) {
    for (const g of p.games ?? []) {
      const c = g.champion;
      if (!c || g.isRemake) continue;

      if (!champStats[c]) {
        champStats[c] = {
          champion: c,
          games: 0,
          wins: 0,
          kills: 0,
          deaths: 0,
          assists: 0,
          damage: 0,
          gold: 0,
          cs: 0,
          players: {},
          roles: {},
        };
      }

      const s = champStats[c];
      s.games++;
      if (g.win) s.wins++;
      s.kills += g.kills ?? 0;
      s.deaths += g.deaths ?? 0;
      s.assists += g.assists ?? 0;
      s.damage += g.damage ?? 0;
      s.gold += g.gold ?? 0;
      s.cs += g.cs ?? 0;

      s.players[p.name] = (s.players[p.name] ?? 0) + 1;
      const pos = g.position || 'MIDDLE';
      s.roles[pos] = (s.roles[pos] ?? 0) + 1;
    }
  }

  const allChamps = Object.values(champStats).map((c) => {
    const winrate = Math.round((c.wins * 100) / c.games);
    const kda = Number(((c.kills + c.assists) / Math.max(1, c.deaths)).toFixed(2));
    const avgDamage = Math.round(c.damage / c.games);
    const avgCs = Math.round(c.cs / c.games);
    const topPlayerEntry = Object.entries(c.players).sort((a, b) => b[1] - a[1])[0];
    const topRoleEntry = Object.entries(c.roles).sort((a, b) => b[1] - a[1])[0];

    return {
      champion: c.champion,
      games: c.games,
      wins: c.wins,
      losses: c.games - c.wins,
      winrate,
      kda,
      avgDamage,
      avgCs,
      topPlayer: topPlayerEntry ? topPlayerEntry[0] : 'Invocador',
      topPlayerGames: topPlayerEntry ? topPlayerEntry[1] : 0,
      topRole: topRoleEntry ? topRoleEntry[0] : 'MIDDLE',
    };
  });

  allChamps.sort((a, b) => b.games - a.games || b.winrate - a.winrate);

  // God Tier: min 3 games, WR >= 60%
  const godTier = allChamps
    .filter((c) => c.games >= 3 && c.winrate >= 60)
    .sort((a, b) => b.winrate - a.winrate || b.games - a.games);

  // Cursed Tier: min 3 games, WR <= 35%
  const cursedTier = allChamps
    .filter((c) => c.games >= 3 && c.winrate <= 35)
    .sort((a, b) => a.winrate - b.winrate || b.games - a.games);

  // Role Meta Breakdown
  const roles = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
  const roleMeta = {};

  for (const r of roles) {
    const roleChamps = allChamps.filter((c) => c.topRole === r);
    roleChamps.sort((a, b) => b.games - a.games);

    // Find specialist player for this role
    const playerRoleCounts = {};
    for (const p of players) {
      for (const g of p.games ?? []) {
        if (g.isRemake) continue;
        if ((g.position || 'MIDDLE') === r) {
          playerRoleCounts[p.name] = (playerRoleCounts[p.name] ?? 0) + 1;
        }
      }
    }
    const specialistEntry = Object.entries(playerRoleCounts).sort((a, b) => b[1] - a[1])[0];

    roleMeta[r] = {
      role: r,
      roleName: ROLE_NAMES[r] ?? r,
      champions: roleChamps.slice(0, 5),
      specialist: specialistEntry ? specialistEntry[0] : 'Nadie',
      specialistGames: specialistEntry ? specialistEntry[1] : 0,
      totalGames: Object.values(playerRoleCounts).reduce((a, b) => a + b, 0),
    };
  }

  return {
    totalUniqueChampions: allChamps.length,
    champions: allChamps,
    godTier: godTier.slice(0, 6),
    cursedTier: cursedTier.slice(0, 6),
    roleMeta,
  };
}
