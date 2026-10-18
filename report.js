// Prints the WhatsApp-ready leaderboard to the terminal (and data/whatsapp.txt).
//   node report.js            -> uses the last saved data
//   node report.js --refresh  -> pulls fresh data from the Riot API first
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR, loadConfig } from './src/config.js';
import { refreshAll, readLeaderboard } from './src/tracker.js';
import { whatsappMessage } from './src/whatsapp.js';

const config = loadConfig();
let board;
if (process.argv.includes('--refresh')) {
  board = await refreshAll(config, ({ done, total, current }) => {
    if (current) console.error(`[${done + 1}/${total}] ${current}`);
  });
  for (const e of board.errors) console.error(`  ! ${e.riotId}: ${e.error}`);
} else {
  board = await readLeaderboard();
}

const text = whatsappMessage(board);
await fs.mkdir(DATA_DIR, { recursive: true });
await fs.writeFile(path.join(DATA_DIR, 'whatsapp.txt'), text);
console.log(text);
