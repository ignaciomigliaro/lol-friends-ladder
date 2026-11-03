import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT, DATA_DIR, loadConfig } from './src/config.js';
import { refreshAll, readLeaderboard } from './src/tracker.js';
import { whatsappMessage } from './src/whatsapp.js';

let config = loadConfig();
const PUBLIC_DIR = path.join(ROOT, 'public');
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const status = { running: false, progress: null, error: null, lastRun: null };

let bot = null;
let refreshing = null;

// Concurrent callers (button, timer, bot) share one refresh.
function runRefresh() {
  refreshing ??= doRefresh().finally(() => (refreshing = null));
  return refreshing;
}

// config.json is re-read on every refresh, so edits apply without restarting the server.
async function doRefresh() {
  try {
    config = loadConfig();
  } catch (err) {
    status.error = `config.json is invalid: ${err.message}`;
    return;
  }
  Object.assign(status, { running: true, error: null, progress: { done: 0, total: config.friends.length } });
  console.log(`[${new Date().toLocaleTimeString()}] Refreshing ${config.friends.length} players...`);
  try {
    const before = await readLeaderboard();
    const board = await refreshAll(config, (p) => (status.progress = p));
    for (const e of board.errors) console.warn(`  ! ${e.riotId}: ${e.error}`);
    console.log(`[${new Date().toLocaleTimeString()}] Done.`);
    await bot?.onRefresh(before, board).catch((err) => console.error('[bot] Announcement failed:', err.message));
    if (config.discord?.enabled && config.discord?.webhookUrl) {
      try {
        const { formatDiscordLeaderboard, sendDiscordWebhook } = await import('./src/discord.js');
        await sendDiscordWebhook(config.discord.webhookUrl, formatDiscordLeaderboard(board));
        console.log('[discord] Leaderboard posted to Discord webhook.');
      } catch (err) {
        console.error('[discord] Webhook failed:', err.message);
      }
    }
  } catch (err) {
    status.error = err.message;
    console.error(`Refresh failed: ${err.message}`);
  } finally {
    status.running = false;
    status.lastRun = Date.now();
  }
}

// Keeps a copy of every leaderboard image that gets sent, in data/cards/.
async function saveCard(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 10 * 1024 * 1024) throw new Error('Image too large');
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  if (!body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) throw new Error('Not a PNG');
  const dir = path.join(DATA_DIR, 'cards');
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const file = path.join(dir, `leaderboard-${stamp}.png`);
  await fs.writeFile(file, body);
  return path.relative(ROOT, file);
}

async function parseJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('Body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function findMatch(matchId) {
  const root = path.join(DATA_DIR, 'matches');
  const direct = path.join(root, `${matchId}.json`);
  const directData = await fs.readFile(direct, 'utf8').then(JSON.parse).catch(() => null);
  if (directData) return directData;
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const ent of entries) {
    if (ent.isDirectory()) {
      const sub = path.join(root, ent.name, `${matchId}.json`);
      const subData = await fs.readFile(sub, 'utf8').then(JSON.parse).catch(() => null);
      if (subData) return subData;
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    // Same file names the static GitHub Pages build uses.
    if (url.pathname === '/leaderboard.json') return send(res, 200, (await readLeaderboard()) ?? { players: [] });
    if (url.pathname === '/whatsapp.txt') return send(res, 200, whatsappMessage(await readLeaderboard()), 'text/plain');
    if (url.pathname === '/api/leaderboard') return send(res, 200, (await readLeaderboard()) ?? { players: [] });
    if (url.pathname.startsWith('/api/match/')) {
      const matchId = url.pathname.slice('/api/match/'.length).replace(/[^a-zA-Z0-9_-]/g, '');
      const matchData = await findMatch(matchId);
      if (!matchData) return send(res, 404, { error: 'Partida no encontrada' });
      return send(res, 200, matchData);
    }
    if (url.pathname.startsWith('/api/build/')) {
      const champ = decodeURIComponent(url.pathname.slice('/api/build/'.length)).trim();
      const { getChampionBuild } = await import('./src/builds.js');
      const build = getChampionBuild(champ);
      if (!build) return send(res, 404, { error: 'Build no encontrada' });
      return send(res, 200, build);
    }
    if (url.pathname === '/api/live') {
      config = loadConfig();
      const { checkLiveGames, getDemoLiveMatch } = await import('./src/live.js');
      if (url.searchParams.get('demo') === '1') {
        return send(res, 200, getDemoLiveMatch());
      }
      const liveData = await checkLiveGames(config);
      return send(res, 200, liveData);
    }
    if (url.pathname === '/api/status') return send(res, 200, status);
    if (url.pathname === '/api/whatsapp') return send(res, 200, whatsappMessage(await readLeaderboard()), 'text/plain');
    if (url.pathname === '/api/card' && req.method === 'POST') {
      const file = await saveCard(req);
      return send(res, 201, { file });
    }
    if (url.pathname === '/api/refresh' && req.method === 'POST') {
      runRefresh();
      return send(res, 202, status);
    }
    if (url.pathname === '/api/config' && req.method === 'GET') {
      config = loadConfig();
      return send(res, 200, {
        groupName: config.groupName,
        platform: config.platform,
        friends: config.friends,
      });
    }
    if (url.pathname === '/api/config/friends' && req.method === 'POST') {
      const body = await parseJson(req);
      if (!Array.isArray(body.friends)) return send(res, 400, { error: 'friends must be an array' });
      const rawConfig = JSON.parse(await fs.readFile(path.join(ROOT, 'config.json'), 'utf8'));
      if (body.groupName) rawConfig.groupName = String(body.groupName).trim();
      if (body.platform) rawConfig.platform = String(body.platform).trim().toLowerCase();
      rawConfig.friends = body.friends.map((f) => {
        if (typeof f === 'string') return f.trim();
        const obj = { riotId: f.riotId.trim() };
        if (f.name && f.name.trim()) obj.name = f.name.trim();
        if (f.platform && f.platform.trim()) obj.platform = f.platform.trim().toLowerCase();
        return obj;
      }).filter((f) => (typeof f === 'string' ? f.includes('#') : f.riotId.includes('#')));

      const { writeJson } = await import('./src/tracker.js');
      await writeJson(path.join(ROOT, 'config.json'), rawConfig);
      config = loadConfig();
      if (body.refresh !== false) {
        runRefresh();
      }
      return send(res, 200, { ok: true, config: { groupName: config.groupName, platform: config.platform, friends: config.friends }, status });
    }
    if (url.pathname === '/api/discord' && req.method === 'POST') {
      config = loadConfig();
      if (!config.discord?.webhookUrl) return send(res, 400, { error: 'No discord.webhookUrl configured in config.json' });
      const { formatDiscordLeaderboard, sendDiscordWebhook } = await import('./src/discord.js');
      const ok = await sendDiscordWebhook(config.discord.webhookUrl, formatDiscordLeaderboard(await readLeaderboard()));
      return send(res, ok ? 200 : 502, { ok });
    }

    const file = path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
    const body = await fs.readFile(file).catch(() => null);
    if (!body) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (err) {
    send(res, 500, { error: err.message });
  }
});

server.listen(config.port, config.host, async () => {
  const shown = config.host === '0.0.0.0' ? 'localhost' : config.host;
  console.log(`La Grieta de los Pibes running at http://${shown}:${config.port}`);

  if (config.whatsapp?.enabled) {
    try {
      const { startBot } = await import('./src/bot.js');
      bot = await startBot({ getConfig: () => config, port: config.port, runRefresh });
    } catch (err) {
      console.error(`[bot] Could not load the WhatsApp bot (did you run "npm install"?): ${err.message}`);
    }
  }
});

const hasKey = config.apiKey && !config.apiKey.includes('xxxx');
if (!hasKey) {
  console.log('No API key in config.json yet — add it, then press Refresh on the page.');
} else if (!process.argv.includes('--no-refresh')) {
  runRefresh();
}
if (config.autoRefreshMinutes > 0) {
  setInterval(() => {
    if (config.apiKey && !config.apiKey.includes('xxxx')) runRefresh();
  }, config.autoRefreshMinutes * 60_000);
}
