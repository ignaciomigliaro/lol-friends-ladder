// WhatsApp bot: answers commands in the group with the leaderboard image, posts a weekly recap,
// and announces promotions/demotions after each refresh.
//
// Uses whatsapp-web.js, which drives WhatsApp Web through a linked device (scan a QR code once).
// This is unofficial: use a spare number if you can, since WhatsApp may ban accounts it thinks are bots.
import fs from 'node:fs';
import path from 'node:path';
import wwebjs from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { DATA_DIR } from './config.js';
import { readLeaderboard, readJson, writeJson } from './tracker.js';

const { Client, LocalAuth, MessageMedia } = wwebjs;

const STATE_FILE = path.join(DATA_DIR, 'bot-state.json');
const DAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MIN_REFRESH_GAP = 5 * 60 * 1000;

const HELP = [
  '🤖 *Comandos del bot*',
  '*!tabla*: la tabla de rangos (imagen)',
  '*!score*: tabla ordenada por score promedio',
  '*!semana*: tabla ordenada por LP ganados esta semana',
  '*!apodos*: los apodos de la semana',
  '*!stats nombre*: stats de un jugador (ej: !stats panda)',
  '*!actualizar*: busca partidas nuevas y manda la tabla',
].join('\n');

const normalize = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

function findBrowser(configured) {
  const candidates = [
    configured,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return candidates.find((p) => p && fs.existsSync(p));
}

export function nicknamesText(board) {
  const ps = board.players.filter((p) => p.nickname);
  if (!ps.length) return 'Todavía no hay apodos. Prueben con !actualizar';
  return ['🎭 *Apodos de la semana*', ...ps.map((p) => `${p.nickname.emoji} *${p.name}*: "${p.nickname.title}" (${p.nickname.reason})`)].join('\n');
}

export function statsText(p) {
  const lines = [`📊 *${p.name}*${p.nickname ? ` "${p.nickname.title}" ${p.nickname.emoji}` : ''}`];
  const week = p.lpDelta?.week ? ` (${signed(p.lpDelta.week)} LP esta semana)` : '';
  lines.push(`${p.solo?.label ?? 'Unranked'}${week}`);
  if (p.stats) {
    const s = p.stats;
    lines.push(`Score *${s.avgScore.toFixed(1)}* · ${s.winrate}% WR (${s.games} partidas) · KDA ${s.kda}`);
    lines.push(`${s.mvp} MVP · ${s.ace} ACE${s.streak >= 3 ? ` · 🔥 ${s.streak} victorias seguidas` : s.streak <= -3 ? ` · 🧊 ${-s.streak} derrotas seguidas` : ''}`);
  }
  if (p.games?.length) {
    lines.push('', '*Últimas 5:*');
    for (const g of p.games.slice(0, 5)) {
      const badge = g.mvp ? ' 👑MVP' : g.ace ? ' ⭐ACE' : '';
      lines.push(`${g.win ? '✅' : '❌'} ${g.champion} ${g.kills}/${g.deaths}/${g.assists} · score ${g.score.toFixed(1)}${badge}`);
    }
  }
  if (p.topChampions?.length) {
    lines.push('', `*Mains:* ${p.topChampions.map((c) => `${c.champion} (${c.games})`).join(', ')}`);
  }
  return lines.join('\n');
}

export function findPlayer(board, query) {
  const q = normalize(query);
  if (!q) return null;
  return (
    board.players.find((p) => normalize(p.name) === q || normalize(p.riotId) === q) ??
    board.players.find((p) => normalize(p.name).includes(q) || normalize(p.riotId).includes(q))
  );
}

export function rankChanges(before, after) {
  if (!before?.players?.length) return [];
  const msgs = [];
  for (const p of after.players) {
    const old = before.players.find((x) => x.puuid === p.puuid);
    if (!old || !p.solo) continue;
    if (!old.solo) {
      msgs.push(`🆕 *${p.name}* terminó las clasificatorias: *${p.solo.label}*`);
      continue;
    }
    if (old.solo.tier === p.solo.tier && old.solo.rank === p.solo.rank) continue;
    const label = p.solo.label.replace(/ \d+ LP$/, '');
    msgs.push(
      p.solo.value > old.solo.value
        ? `🎉 *${p.name}* subió a *${label}*. ¡Felicitaciones, crack!`
        : `💀 *${p.name}* bajó a *${label}*. F en el chat 🫡`,
    );
  }
  return msgs;
}

export async function startBot({ getConfig, port, runRefresh }) {
  const cfg = () => getConfig().whatsapp ?? {};
  const browser = findBrowser(cfg().browserPath);
  if (!browser) console.warn('[bot] No Chrome/Edge found. Set whatsapp.browserPath in config.json.');

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(DATA_DIR, 'whatsapp-session') }),
    puppeteer: { headless: true, executablePath: browser, args: ['--no-sandbox', '--disable-gpu'] },
  });

  let ready = false;
  let lastRefresh = 0;

  client.on('qr', (qr) => {
    console.log('\n[bot] Scan this QR with the WhatsApp account the bot should use:');
    console.log('      WhatsApp > Settings > Linked devices > Link a device\n');
    qrcode.generate(qr, { small: true });
  });
  client.on('authenticated', () => console.log('[bot] Linked.'));
  client.on('auth_failure', (m) => console.error('[bot] Login failed:', m));
  client.on('disconnected', (r) => {
    ready = false;
    console.warn('[bot] Disconnected:', r);
  });

  // Renders the leaderboard image by opening the dashboard's #card view in the bot's browser.
  async function renderCard(sort = 'rank') {
    const page = await client.pupBrowser.newPage();
    try {
      await page.goto(`http://127.0.0.1:${port}/?sort=${sort}#card`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('body[data-card-ready] canvas', { timeout: 15000 });
      const dataUrl = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
      return new MessageMedia('image/png', dataUrl.split(',')[1], `tabla-${sort}.png`);
    } finally {
      await page.close();
    }
  }

  const groupNames = () => [cfg().group].flat().filter(Boolean).map(normalize);

  async function targetChats() {
    const names = groupNames();
    if (!names.length) return [];
    const chats = await client.getChats();
    return chats.filter((c) => c.isGroup && names.includes(normalize(c.name)));
  }

  async function sendCard(chat, sort, caption) {
    const board = await readLeaderboard();
    if (!board?.players?.length) return chat.sendMessage('Todavía no hay datos. Prueben con !actualizar');
    await chat.sendMessage(await renderCard(sort), { caption });
  }

  async function handle(msg) {
    const body = (msg.body ?? '').trim();
    if (!body.startsWith('!')) return;
    const chat = await msg.getChat();
    const names = groupNames();
    if (names.length && !(chat.isGroup && names.includes(normalize(chat.name)))) return;

    const [cmd, ...rest] = body.slice(1).split(/\s+/);
    const arg = rest.join(' ');
    const board = await readLeaderboard();

    switch (normalize(cmd)) {
      case 'tabla': case 'rank': case 'ranking': case 'leaderboard':
        return sendCard(chat, 'rank', '🏆 Tabla de rangos');
      case 'score':
        return sendCard(chat, 'score', '⭐ Ordenado por score promedio');
      case 'semana': case 'week':
        return sendCard(chat, 'week', '📈 Ordenado por LP de esta semana');
      case 'apodos': case 'apodo':
        return msg.reply(board ? nicknamesText(board) : 'Todavía no hay datos.');
      case 'stats': case 'stat': case 'perfil': {
        if (!board) return msg.reply('Todavía no hay datos.');
        const p = findPlayer(board, arg);
        if (!p) return msg.reply(`No encontré a "${arg}". Jugadores: ${board.players.map((x) => x.name).join(', ')}`);
        return msg.reply(statsText(p));
      }
      case 'actualizar': case 'update': case 'refresh': {
        if (Date.now() - lastRefresh > MIN_REFRESH_GAP) {
          await msg.reply('⏳ Buscando partidas nuevas...');
          lastRefresh = Date.now();
          await runRefresh();
        }
        return sendCard(chat, 'rank', '🏆 Tabla actualizada');
      }
      case 'ayuda': case 'help': case 'comandos':
        return msg.reply(HELP);
      default:
        return undefined;
    }
  }

  // message_create also fires for messages sent from the bot's own number, so commands
  // work even if you link your personal WhatsApp. Bot replies never start with "!".
  client.on('message_create', (msg) => {
    handle(msg).catch((err) => {
      console.error('[bot] Command failed:', err);
      msg.reply('😵 Algo falló, prueben de nuevo en un rato.').catch(() => {});
    });
  });

  // Weekly recap, checked every minute.
  async function maybeRecap() {
    const recap = cfg().weeklyRecap;
    if (!ready || !recap) return;
    const now = new Date();
    const day = normalize(recap.day ?? 'lunes');
    const dayIndex = Math.max(DAYS.indexOf(day), DAYS_EN.indexOf(day));
    if (now.getDay() !== dayIndex || now.getHours() < (recap.hour ?? 12)) return;

    const today = now.toLocaleDateString('en-CA'); // local YYYY-MM-DD
    const state = await readJson(STATE_FILE, {});
    if (state.lastRecap === today) return;
    state.lastRecap = today;
    await writeJson(STATE_FILE, state);

    await runRefresh();
    const board = await readLeaderboard();
    for (const chat of await targetChats()) {
      await sendCard(chat, 'rank', '📅 *Resumen semanal*');
      await chat.sendMessage(nicknamesText(board));
    }
  }
  setInterval(() => maybeRecap().catch((e) => console.error('[bot] Recap failed:', e.message)), 60_000);

  client.on('ready', async () => {
    ready = true;
    const groups = await targetChats();
    if (groupNames().length && !groups.length) {
      console.warn(`[bot] Ready, but no group named "${cfg().group}" was found. Add the bot's number to the group, and check the name in config.json.`);
    } else {
      console.log(`[bot] Ready. Listening in: ${groups.map((g) => g.name).join(', ') || 'all chats'}`);
    }
  });

  console.log('[bot] Starting WhatsApp...');
  client.initialize().catch((err) => console.error('[bot] Could not start WhatsApp:', err.message));

  return {
    // Called by the server after every refresh, to announce promotions and demotions.
    async onRefresh(before, after) {
      if (!ready || cfg().announceRankChanges === false) return;
      const msgs = rankChanges(before, after);
      if (!msgs.length) return;
      for (const chat of await targetChats()) await chat.sendMessage(msgs.join('\n'));
    },
  };
}
