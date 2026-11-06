// End-to-end check of the published site: builds it from demo data (no Riot key needed),
// serves it like GitHub Pages and clicks through every page a friend would use.
//
//   npm run test:e2e
// Uses Puppeteer's own Chrome (npx puppeteer browsers install chrome), like GitHub. To use Edge instead:
//   PUPPETEER_EXECUTABLE_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = '/lol-friends-ladder/'; // same sub-path as GitHub Pages
const FAKE_WORKER = 'https://update.example.workers.dev';
const TABS = ['#', '#players', '#roasts', '#duelos', '#records', '#meta'];

let tmp, server, url, browser, board;
const workerCalls = [];

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ladder-e2e-'));
  const env = { ...process.env, LADDER_DATA_DIR: path.join(tmp, 'data'), LADDER_SITE_DIR: path.join(tmp, 'site') };
  await run(process.execPath, ['src/demo.js'], { cwd: ROOT, env });
  await run(process.execPath, ['build.js', '--no-refresh'], { cwd: ROOT, env });

  // The demo has no Worker; point the Update button at a fake one the browser intercepts.
  const boardFile = path.join(tmp, 'site', 'leaderboard.json');
  board = JSON.parse(await fs.readFile(boardFile, 'utf8'));
  board.updateUrl = FAKE_WORKER;
  await fs.writeFile(boardFile, JSON.stringify(board));

  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.jpg': 'image/jpeg', '.png': 'image/png' };
  server = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!p.startsWith(BASE)) { res.writeHead(404); return res.end(); }
    const file = path.join(tmp, 'site', p.slice(BASE.length) || 'index.html');
    try {
      const body = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404); // like GitHub Pages: no api/ routes
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}${BASE}`;

  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', `--user-data-dir=${path.join(tmp, 'browser')}`],
  });
});

after(async () => {
  await browser?.close();
  server?.close();
  if (tmp) await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
});

async function openPage({ width = 1280, hash = '' } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(FAKE_WORKER)) {
      workerCalls.push(r.method());
      return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ result: 'cooldown', retryInSec: 125 }) });
    }
    // Stay offline: champion art isn't needed to test behaviour.
    if (/^(data|blob):/.test(u)) return r.continue();
    if (!u.startsWith(url.replace(BASE, ''))) return r.respond({ status: 204, body: '' });
    return r.continue();
  });
  await page.goto(url + hash, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#tabs a.active'), { timeout: 15000 });
  await settle(200);
  return { page, errors };
}

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

test('the site loads without script errors', async () => {
  const { page, errors } = await openPage();
  const rows = await page.$$eval('#board .player', (r) => r.length);
  assert.equal(rows, board.players.length);
  assert.deepEqual(errors, []);
  await page.close();
});

test('every tab opens and shows content', async () => {
  const { page, errors } = await openPage();
  for (const hash of TABS) {
    await page.click(`#tabs a[href="${hash}"]`);
    await settle();
    const active = await page.$eval('#tabs a.active', (a) => a.getAttribute('href'));
    assert.equal(active, hash, `${hash} is the active tab`);
    const text = await page.evaluate((h) => document.querySelector(h === '#' ? '#view-board' : '#view-player').innerText.trim().length, hash);
    assert.ok(text > 50, `${hash} shows content`);
  }
  assert.deepEqual(errors, []);
  await page.close();
});

test('clicking a player shows their games with their place and MVP / ACE / Mochila tags', async () => {
  const { page, errors } = await openPage();
  await page.click('#board .player .row');
  await page.waitForSelector('#board .player .games .game');
  const badges = await page.$$eval('#board .player .badge', (b) => b.map((x) => x.textContent));
  assert.ok(badges.some((b) => /^\d+°$/.test(b)), 'each game shows its place');
  assert.ok(await page.$$eval('#board .player .game', (g) => g.every((x) => /\d+ \w+\.?, \d\d:\d\d/.test(x.innerText))), 'each game shows its date');
  const p = board.players.find((x) => x.puuid === board.players[0].puuid);
  const shown = p.games.slice(0, 20).filter((g) => !g.isRemake);
  if (shown.some((g) => g.mochila && !g.mvp && !g.ace)) assert.ok(badges.some((b) => b.includes('Mochila')), 'Mochila tag shown');
  assert.deepEqual(errors, []);
  await page.close();
});

test('Jugadores lists every player and opens their profile', async () => {
  const { page, errors } = await openPage({ hash: '#players' });
  const cards = await page.$$eval('#view-player .pcard', (c) => c.length);
  assert.equal(cards, board.players.length);
  await page.click('#view-player .pcard');
  await page.waitForSelector('#view-player .profile-head');
  const sections = await page.$$eval('#view-player h3', (h) => h.map((x) => x.textContent));
  for (const name of ['Tendencias', 'Contra jugadores de tu elo', 'Por partida contra el grupo', 'Líneas', 'Campeones', 'Partidas']) {
    assert.ok(sections.some((s) => s.includes(name)), `profile shows "${name}"`);
  }
  assert.deepEqual(errors, []);
  await page.close();
});

test('clicking a champion shows its matchups with both scores', async () => {
  const { page, errors } = await openPage({ hash: '#players' });
  await page.click('#view-player .pcard');
  await page.waitForSelector('#view-player .champ-row');
  await page.click('#view-player .champ-row');
  await page.waitForSelector('#champ-detail');
  const headers = await page.$$eval('#champ-detail th', (th) => th.map((x) => x.textContent));
  assert.ok(headers.includes('Su score') && headers.includes('Score rival'), 'matchup table has both scores');
  assert.deepEqual(errors, []);
  await page.close();
});

test('nicknames are on the leaderboard; the roasts have their own tab', async () => {
  const { page, errors } = await openPage();
  const nicks = await page.$$eval('#board .row .nick', (n) => n.length);
  assert.equal(nicks, board.players.filter((p) => p.nickname).length);
  assert.equal(await page.$('#view-board .roast'), null, 'no roasts on the leaderboard');
  await page.click('#tabs a[href="#roasts"]');
  await settle();
  const roasts = await page.$$eval('#roast-list .roast p', (p) => p.map((x) => x.textContent.length));
  assert.equal(roasts.length, board.players.filter((p) => p.roast).length);
  assert.ok(roasts.every((n) => n > 60), 'roasts are full paragraphs');
  assert.deepEqual(errors, []);
  await page.close();
});

test('Duelos compares two players and switching one updates it', async () => {
  const { page, errors } = await openPage({ hash: '#duelos' });
  const rows = await page.$$eval('#view-player .duel-row', (r) => r.length);
  assert.ok(rows >= 10, 'every stat is compared');
  const before = await page.$eval('#view-player .duel-side.b .name', (n) => n.textContent);
  const a = await page.$eval('#duel-a', (s) => s.value);
  const other = board.players.find((p) => p.puuid !== a && p.name !== before);
  await page.select('#duel-b', other.puuid);
  await settle();
  const after = await page.$eval('#view-player .duel-side.b .name', (n) => n.textContent);
  assert.equal(after, other.name);
  assert.deepEqual(errors, []);
  await page.close();
});

test('Récords and Meta show the group data', async () => {
  const { page, errors } = await openPage({ hash: '#records' });
  assert.ok(await page.$$eval('#view-player .rcard', (c) => c.length) >= 5, 'records are listed');
  await page.click('#tabs a[href="#meta"]');
  await settle();
  assert.ok(await page.$$eval('#view-player table.stats tbody tr', (r) => r.length) >= 3, 'champions are listed');
  assert.deepEqual(errors, []);
  await page.close();
});

test('the Update button asks the Worker for an update on the website', async () => {
  const { page, errors } = await openPage();
  workerCalls.length = 0;
  await page.click('#refresh');
  await settle(1200);
  assert.ok(workerCalls.includes('POST'), 'Update button called the Worker');
  assert.deepEqual(errors, []);
  await page.close();
});

test('phone width: every page fits the screen', async () => {
  for (const hash of ['', '#players', '#roasts', '#duelos', '#records', '#meta']) {
    const { page, errors } = await openPage({ width: 390, hash });
    if (hash === '#players') {
      await page.click('#view-player .pcard');
      await page.waitForSelector('#view-player .profile-head');
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `${hash || 'leaderboard'} scrolls sideways by ${overflow}px`);
    assert.deepEqual(errors, []);
    await page.close();
  }
});
