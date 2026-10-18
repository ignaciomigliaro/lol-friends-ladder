export const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER'];
const DIVISIONS = ['IV', 'III', 'II', 'I'];
const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);
const APEX_BASE = 7 * 400; // Iron IV 0 LP .. Diamond I 100 LP = 2800

// Converts a league entry into one comparable number, where 1 point = 1 LP.
// Apex tiers share a single LP ladder, so they all sit on the same base.
export function rankValue(entry) {
  if (!entry) return -1;
  if (APEX.has(entry.tier)) return APEX_BASE + entry.leaguePoints;
  const tier = TIERS.indexOf(entry.tier);
  const div = DIVISIONS.indexOf(entry.rank);
  return tier * 400 + div * 100 + entry.leaguePoints;
}

export function rankLabel(entry) {
  if (!entry) return 'Unranked';
  const tier = entry.tier[0] + entry.tier.slice(1).toLowerCase();
  return APEX.has(entry.tier) ? `${tier} ${entry.leaguePoints} LP` : `${tier} ${entry.rank} ${entry.leaguePoints} LP`;
}
