// Generates fake matches for a fake friend group so you can preview the app without an API key.
// Real data from a refresh overwrites it.
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { summarizePlayer, saveLeaderboard, readJson, writeJson } from './tracker.js';

const POSITIONS = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
const CHAMPS = {
  TOP: ['Darius', 'Garen', 'Aatrox', 'Fiora', 'Sett'],
  JUNGLE: ['LeeSin', 'Viego', 'Kayn', 'Warwick', 'Graves'],
  MIDDLE: ['Ahri', 'Yasuo', 'Syndra', 'Sylas', 'Akali'],
  BOTTOM: ['Jinx', 'Kaisa', 'Ezreal', 'Caitlyn', 'MissFortune'],
  UTILITY: ['Thresh', 'Lulu', 'Nautilus', 'Leona', 'Nami'],
};
const FRIENDS = [
  { name: 'Nacho', tier: 'EMERALD', rank: 'II', lp: 67, skill: 1.25, main: 'MIDDLE', weekAgo: -88 },
  { name: 'Santi', tier: 'PLATINUM', rank: 'I', lp: 12, skill: 1.1, main: 'JUNGLE', weekAgo: 35 },
  { name: 'Fede', tier: 'DIAMOND', rank: 'IV', lp: 23, skill: 1.35, main: 'BOTTOM', weekAgo: -41 },
  { name: 'Juli', tier: 'GOLD', rank: 'II', lp: 88, skill: 0.95, main: 'UTILITY', weekAgo: 20 },
  { name: 'Tomi', tier: 'SILVER', rank: 'I', lp: 45, skill: 0.75, main: 'TOP', weekAgo: -60 },
  { name: 'Mati', tier: null, skill: 0.9, main: 'JUNGLE' },
];

const rand = (a, b) => a + Math.random() * (b - a);
const int = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[int(0, arr.length - 1)];

function fakeParticipant(puuid, teamId, position, win, skill) {
  const s = skill * (win ? 1.15 : 0.85) * rand(0.6, 1.4);
  const sup = position === 'UTILITY';
  return {
    puuid, teamId, win, teamPosition: position, championName: pick(CHAMPS[position]),
    kills: Math.round(rand(0, sup ? 4 : 11) * s), deaths: Math.round(rand(1, 9) / s), assists: Math.round(rand(2, sup ? 20 : 12) * s),
    totalDamageDealtToChampions: Math.round(rand(8000, sup ? 14000 : 32000) * s),
    totalDamageTaken: Math.round(rand(12000, position === 'TOP' || position === 'JUNGLE' ? 38000 : 22000)),
    damageSelfMitigated: Math.round(rand(5000, 25000)),
    goldEarned: Math.round(rand(sup ? 7000 : 9000, sup ? 10000 : 16000) * s),
    totalMinionsKilled: sup ? int(10, 40) : Math.round(rand(140, 260) * s),
    neutralMinionsKilled: position === 'JUNGLE' ? Math.round(rand(120, 200) * s) : int(0, 10),
    visionScore: Math.round(rand(sup ? 50 : 12, sup ? 100 : 35) * s),
    damageDealtToObjectives: Math.round(rand(1000, position === 'JUNGLE' ? 30000 : 12000) * s),
    gameEndedInEarlySurrender: false,
  };
}

function fakeMatch(puuid, friend, idx) {
  const duration = int(20 * 60, 38 * 60);
  const end = Date.now() - idx * rand(3, 14) * 3600_000;
  const myTeamWins = Math.random() < 0.35 + friend.skill * 0.15;
  const myPos = Math.random() < 0.75 ? friend.main : pick(POSITIONS);
  const participants = [];
  for (const teamId of [100, 200]) {
    const win = (teamId === 100) === myTeamWins;
    for (const pos of POSITIONS) {
      const me = teamId === 100 && pos === myPos;
      participants.push(fakeParticipant(me ? puuid : `bot-${teamId}-${pos}`, teamId, pos, win, me ? friend.skill : 1));
    }
  }
  return {
    metadata: { matchId: `DEMO_${puuid}_${idx}` },
    info: { queueId: 420, gameDuration: duration, gameEndTimestamp: end, gameCreation: end - duration * 1000, participants },
  };
}

const players = FRIENDS.map((f, i) => {
  const puuid = `demo-${i}`;
  const entries = f.tier ? [{ queueType: 'RANKED_SOLO_5x5', tier: f.tier, rank: f.rank, leaguePoints: f.lp, wins: int(30, 120), losses: int(30, 110), hotStreak: false }] : [];
  return summarizePlayer({
    friend: { name: f.name },
    account: { puuid, gameName: f.name, tagLine: 'LAN' },
    summoner: { summonerLevel: int(80, 600), profileIconId: int(1, 28) },
    entries,
    matches: Array.from({ length: 15 }, (_, j) => fakeMatch(puuid, f, j)),
  });
});

// Seed a "one week ago" snapshot so LP deltas show up (merged, so real history is kept).
const historyFile = path.join(DATA_DIR, 'history.json');
const history = await readJson(historyFile, {});
const weekAgo = Date.now() - 7.5 * 24 * 3600_000;
for (const p of players) {
  const f = FRIENDS.find((x) => x.name === p.name);
  if (p.solo) history[p.puuid] = [{ t: weekAgo, value: p.solo.value - f.weekAgo, label: 'demo' }];
}
await writeJson(historyFile, history);
await saveLeaderboard({ groupName: 'La Grieta de los Pibes (demo)', platform: 'la1' }, players, [], '14.20.1');
console.log('Demo data written to data/leaderboard.json');
