// Builds the static site for GitHub Pages into site/.
//   node build.js              -> refresh from the Riot API, then build
//   node build.js --no-refresh -> build from the data already saved
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, loadConfig } from './src/config.js';
import { refreshAll, readLeaderboard } from './src/tracker.js';
import { whatsappMessage } from './src/whatsapp.js';
import { BUILDS_CATALOG, getChampionBuild } from './src/builds.js';

const SITE = process.env.LADDER_SITE_DIR ? path.resolve(process.env.LADDER_SITE_DIR) : path.join(ROOT, 'site');

let board;
if (process.argv.includes('--no-refresh')) {
  board = await readLeaderboard();
} else {
  board = await refreshAll(loadConfig(), ({ done, total, current }) => {
    if (current) console.log(`[${Math.min(done + 1, total)}/${total}] ${current}`);
  });
  for (const e of board.errors) console.warn(`  ! ${e.riotId}: ${e.error}`);
}
if (!board?.players?.length) throw new Error('No leaderboard data to publish.');

await fs.rm(SITE, { recursive: true, force: true });
await fs.cp(path.join(ROOT, 'public'), SITE, { recursive: true });
// Version the asset URLs so browsers pick up a new deploy right away instead of a cached copy.
const indexFile = path.join(SITE, 'index.html');
const v = Date.now().toString(36);
const html = await fs.readFile(indexFile, 'utf8');
await fs.writeFile(indexFile, html.replace('href="style.css"', `href="style.css?v=${v}"`).replace('src="app.js"', `src="app.js?v=${v}"`));
await fs.writeFile(path.join(SITE, 'leaderboard.json'), JSON.stringify(board));
const matchesDir = path.join(ROOT, 'data', 'matches');
if (await fs.stat(matchesDir).then(() => true).catch(() => false)) {
  await fs.cp(matchesDir, path.join(SITE, 'matches'), { recursive: true });
}
await fs.writeFile(path.join(SITE, 'whatsapp.txt'), whatsappMessage(board));
// GitHub Pages has no /api/build: publish every champion's build as one file.
const champions = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', { signal: AbortSignal.timeout(10_000) })
  .then((r) => r.json())
  .then(([ver]) => fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion.json`, { signal: AbortSignal.timeout(10_000) }))
  .then((r) => r.json())
  .then((d) => Object.keys(d.data))
  .catch(() => Object.keys(BUILDS_CATALOG)); // offline: the hand-made builds only
const builds = Object.fromEntries(champions.map((c) => [c.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(), getChampionBuild(c)]));
await fs.writeFile(path.join(SITE, 'builds.json'), JSON.stringify(builds));
await fs.writeFile(path.join(SITE, '.nojekyll'), '');
console.log(`Built site/ with ${board.players.length} players and ${board.groupGames?.length ?? 0} games together.`);
