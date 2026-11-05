// Saves 10 held-out games (never used for training) as an anonymous test fixture:
// the match as the site stores it, plus OP.GG's score for each player.
//   node calibration/make-fixture.js   (run before train.js)
import path from 'node:path';
import { ROOT, CAL_DIR, RIOT_DIR, readJson, writeJson } from './common.js';
import { pruneMatch } from '../src/riot.js';

const opgg = new Map(readJson(path.join(CAL_DIR, 'opgg-games.json'), []).map((g) => [g.opggId, g]));
const usable = [];
for (const { matchId, opggId } of readJson(path.join(CAL_DIR, 'linked.json'), [])) {
  const m = readJson(path.join(RIOT_DIR, `${matchId}.json`));
  if (!m || !readJson(path.join(RIOT_DIR, `${matchId}.timeline.json`))) continue;
  if (m.info.gameDuration < 300 || m.info.participants.some((p) => p.gameEndedInEarlySurrender)) continue;
  const label = opgg.get(opggId);
  const scores = m.info.participants.map((p) => label.players.find((x) => x.champ === p.championId && x.k === p.kills && x.d === p.deaths && x.a === p.assists)?.score);
  if (scores.some((s) => s === undefined)) continue;
  usable.push({ id: matchId, m, scores });
}
// Same split as train.js: every 5th usable game is held out.
const held = usable.filter((_, i) => i % 5 === 4).slice(0, 10);
const games = held.map(({ m, scores }, g) => {
  const match = pruneMatch(m);
  match.metadata.matchId = `FIXTURE_${g}`;
  match.info.participants.forEach((p, i) => { p.puuid = `g${g}p${i}`; });
  return { match, opgg: Object.fromEntries(match.info.participants.map((p, i) => [p.puuid, scores[i]])) };
});
writeJson(path.join(ROOT, 'test', 'fixtures', 'opgg-games.json'), games);
// train.js keeps these games out of the final model, so the test measures unseen games.
writeJson(path.join(CAL_DIR, 'fixture-ids.json'), held.map((h) => h.id));
console.log(`Wrote ${games.length} held-out games to test/fixtures/opgg-games.json`);
