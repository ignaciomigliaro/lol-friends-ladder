// Every player's state at each minute of a game, from Riot's match timeline.
// Same fields as summaryState() in src/opscore.js, minus the result (unknown mid-game).
export function minuteStates(match, timeline) {
  const ps = match.info.participants;
  const blank = () => ({ k: 0, d: 0, a: 0, wards: 0, wardKills: 0, towers: 0, plates: 0, obj: 0 });
  const acc = Object.fromEntries(ps.map((p) => [p.participantId, blank()]));
  const team = { 100: { towers: 0, obj: 0 }, 200: { towers: 0, obj: 0 } };
  const OBJ = { DRAGON: 1, BARON_NASHOR: 2, RIFTHERALD: 1 };
  const out = [];
  for (const frame of timeline.info.frames) {
    for (const ev of frame.events ?? []) {
      if (ev.type === 'CHAMPION_KILL') {
        if (acc[ev.killerId]) acc[ev.killerId].k++;
        if (acc[ev.victimId]) acc[ev.victimId].d++;
        for (const id of ev.assistingParticipantIds ?? []) if (acc[id]) acc[id].a++;
      } else if (ev.type === 'WARD_PLACED' && acc[ev.creatorId]) acc[ev.creatorId].wards++;
      else if (ev.type === 'WARD_KILL' && acc[ev.killerId]) acc[ev.killerId].wardKills++;
      else if (ev.type === 'TURRET_PLATE_DESTROYED' && acc[ev.killerId]) acc[ev.killerId].plates++;
      else if (ev.type === 'BUILDING_KILL' && ev.buildingType === 'TOWER_BUILDING') {
        team[ev.teamId === 100 ? 200 : 100].towers++;
        if (acc[ev.killerId]) acc[ev.killerId].towers++;
        for (const id of ev.assistingParticipantIds ?? []) if (acc[id]) acc[id].towers++;
      } else if (ev.type === 'ELITE_MONSTER_KILL' && OBJ[ev.monsterType]) {
        if (team[ev.killerTeamId]) team[ev.killerTeamId].obj += OBJ[ev.monsterType];
        if (acc[ev.killerId] && ev.monsterType !== 'RIFTHERALD') acc[ev.killerId].obj += OBJ[ev.monsterType];
      }
    }
    const states = new Map();
    for (const p of ps) {
      const f = frame.participantFrames[p.participantId];
      const a = acc[p.participantId];
      states.set(p.puuid, {
        teamId: p.teamId,
        pos: p.teamPosition || 'MIDDLE',
        k: a.k, d: a.d, a: a.a,
        gold: f.totalGold, xp: f.xp, level: f.level,
        cs: f.minionsKilled + f.jungleMinionsKilled,
        dmg: f.damageStats?.totalDamageDoneToChampions ?? 0,
        taken: f.damageStats?.totalDamageTaken ?? 0,
        wards: a.wards, wardKills: a.wardKills, towers: a.towers, plates: a.plates, obj: a.obj,
        tTowers: team[p.teamId].towers, tObj: team[p.teamId].obj,
      });
    }
    out.push({ second: Math.round(frame.timestamp / 1000), states });
  }
  return out;
}
