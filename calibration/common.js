import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OPGG_DIR = path.join(ROOT, 'opgg'); // HAR files saved from op.gg (git-ignored)
export const CAL_DIR = path.join(ROOT, 'calibration', 'data'); // downloaded data (git-ignored)
export const RIOT_DIR = path.join(CAL_DIR, 'riot');

export const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

// "champion:K/D/A" of all 10 players identifies a game on both OP.GG and Riot.
export const signature = (players) => players.map((p) => `${p.champ}:${p.k}/${p.d}/${p.a}`).sort().join('|');
