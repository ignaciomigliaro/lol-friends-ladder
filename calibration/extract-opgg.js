// Step 1: read OP.GG games out of HAR files saved from the browser (opgg/*.har).
// Keeps only ranked games and, per player: champion, team, K/D/A, OP Score and its per-minute timeline.
//
//   node calibration/extract-opgg.js
import fs from 'node:fs';
import path from 'node:path';
import { CAL_DIR, OPGG_DIR, readJson, writeJson } from './common.js';

const files = fs.existsSync(OPGG_DIR) ? fs.readdirSync(OPGG_DIR).filter((f) => f.endsWith('.har')) : [];
if (!files.length) throw new Error(`No .har files in ${OPGG_DIR}. See calibration/README.md.`);

const games = new Map(readJson(path.join(CAL_DIR, 'opgg-games.json'), []).map((g) => [g.opggId, g]));
const before = games.size;
for (const file of files) {
  const har = JSON.parse(fs.readFileSync(path.join(OPGG_DIR, file), 'utf8'));
  for (const e of har.log.entries) {
    if (!e.request.url.includes('op.gg/lol/summoners/')) continue;
    // Match history arrives as lines like `1:{"data":[...games...]}`.
    for (const line of (e.response.content?.text ?? '').split('\n')) {
      if (!line.includes('"op_score"')) continue;
      let data;
      try { data = JSON.parse(line.slice(line.indexOf(':') + 1)).data; } catch { continue; }
      for (const g of data ?? []) {
        const queue = g.game_type?.game_type;
        if (queue !== 'SOLORANKED' && queue !== 'FLEXRANKED') continue;
        games.set(g.id, {
          opggId: g.id,
          created: Date.parse(g.created_at),
          length: g.game_length,
          queue,
          players: [...g.team_blue, ...g.team_red].map((p) => ({
            champ: p.champion_id,
            team: p.team_key,
            k: p.stats?.kill,
            d: p.stats?.death,
            a: p.stats?.assist,
            score: p.stats?.op_score,
            tl: (p.stats?.op_score_timeline ?? []).map((x) => [x.second, x.score]),
          })),
        });
      }
    }
  }
}
writeJson(path.join(CAL_DIR, 'opgg-games.json'), [...games.values()]);
console.log(`${games.size} ranked OP.GG games (${games.size - before} new) from ${files.length} HAR file(s).`);
