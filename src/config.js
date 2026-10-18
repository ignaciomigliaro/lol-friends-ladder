import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');

// config.json is safe to commit (it's public on GitHub). The API key lives in secrets.json
// (git-ignored) locally, or in the RIOT_API_KEY environment variable / GitHub secret.
const CONFIG_FILE = path.join(ROOT, 'config.json');
const SECRETS_FILE = path.join(ROOT, 'secrets.json');

const isRealKey = (k) => typeof k === 'string' && k.startsWith('RGAPI-') && !k.includes('xxxx');

export function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.copyFileSync(path.join(ROOT, 'config.example.json'), CONFIG_FILE);
    console.log('Created config.json from the example. Add your friends\' Riot IDs, and your API key to secrets.json.');
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

  // Move a key pasted into config.json over to secrets.json so it never gets committed.
  if ('apiKey' in config) {
    if (isRealKey(config.apiKey)) fs.writeFileSync(SECRETS_FILE, JSON.stringify({ apiKey: config.apiKey }, null, 2) + '\n');
    delete config.apiKey;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
  }
  const secrets = fs.existsSync(SECRETS_FILE) ? JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8')) : {};

  config.apiKey = process.env.RIOT_API_KEY || secrets.apiKey;
  config.platform ??= 'la1';
  config.matchesPerPlayer ??= 15;
  config.groupName ??= 'Friends';
  config.port ??= 3000;
  config.host ??= '127.0.0.1';
  config.friends = (config.friends ?? []).map((f) => (typeof f === 'string' ? { riotId: f } : f));
  return config;
}
