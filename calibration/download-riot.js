// Step 2: download the same games from Riot (match + per-minute timeline) with the key in secrets.json.
// Games are found through the match history of each player whose OP.GG page was saved, and linked to
// OP.GG by the champions and K/D/A of all 10 players.
//
//   node calibration/download-riot.js "Panda#JK23" ["Other#TAG" ...]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CAL_DIR, RIOT_DIR, readJson, writeJson, signature } from './common.js';

const riotIds = process.argv.slice(2);
if (!riotIds.length) throw new Error('Pass the Riot ID(s) whose OP.GG pages you saved, e.g. "Panda#JK23".');
const key = readJson(path.join(ROOT, 'secrets.json'), {}).apiKey;
if (!key) throw new Error('No apiKey in secrets.json.');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 8; i++) {
    const res = await fetch(url, { headers: { 'X-Riot-Token': key } });
    if (res.status === 429) { await sleep(1000 * (Number(res.headers.get('retry-after')) || 10)); continue; }
    if (res.status >= 500) { await sleep(3000); continue; }
    if (!res.ok) throw new Error(`Riot said ${res.status} for ${url}`);
    await sleep(1250); // stays under a personal key's 100 requests / 2 minutes
    return res.json();
  }
  throw new Error(`Gave up on ${url}`);
}
async function cached(name, url) {
  const file = path.join(RIOT_DIR, name);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const data = await get(url);
  writeJson(file, data);
  return data;
}

const games = readJson(path.join(CAL_DIR, 'opgg-games.json'), []);
const wanted = new Map(games.map((g) => [signature(g.players), g]));
const linked = new Map(readJson(path.join(CAL_DIR, 'linked.json'), []).map((l) => [l.opggId, l]));
const since = Math.floor(Math.min(...games.map((g) => g.created)) / 1000) - 86400;
const API = 'https://americas.api.riotgames.com';

for (const riotId of riotIds) {
  const [name, tag] = [riotId.slice(0, riotId.lastIndexOf('#')), riotId.slice(riotId.lastIndexOf('#') + 1)];
  const { puuid } = await get(`${API}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
  const ids = [];
  for (const queue of [420, 440]) {
    for (let start = 0; ; start += 100) {
      const page = await get(`${API}/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${queue}&startTime=${since}&start=${start}&count=100`);
      ids.push(...page);
      if (page.length < 100) break;
    }
  }
  console.log(`${riotId}: ${ids.length} ranked games on Riot`);
  for (const id of ids) {
    const match = await cached(`${id}.json`, `${API}/lol/match/v5/matches/${id}`);
    const g = wanted.get(signature(match.info.participants.map((p) => ({ champ: p.championId, k: p.kills, d: p.deaths, a: p.assists }))));
    if (!g) continue;
    await cached(`${id}.timeline.json`, `${API}/lol/match/v5/matches/${id}/timeline`);
    linked.set(g.opggId, { matchId: id, opggId: g.opggId });
  }
}
writeJson(path.join(CAL_DIR, 'linked.json'), [...linked.values()]);
console.log(`${linked.size}/${games.length} OP.GG games linked to Riot matches.`);
