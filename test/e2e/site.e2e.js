// End-to-end check of the published site: builds it from demo data (no Riot key needed),
// serves it like GitHub Pages and clicks through every page a friend would use.
//
//   npm run test:e2e
// Locally on Windows, point Puppeteer at Edge or Chrome:
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
const VIEWS = ['overview', 'leaderboard', 'players', 'duels', 'records', 'synergy', 'apodos', 'meta'];

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
    // Stay offline: champion art and fonts aren't needed to test behaviour.
    if (/^(data|blob):/.test(u)) return r.continue();
    if (!u.startsWith(url.replace(BASE, ''))) return r.respond({ status: 204, body: '' });
    return r.continue();
  });
  await page.goto(url + hash, { waitUntil: 'load' });
  // The app keeps polling (live games, sync status), so wait for the data to render instead of network idle.
  await page.waitForFunction(() => document.querySelector('#podium-container')?.children.length > 0, { timeout: 15000 });
  await settle(200);
  return { page, errors };
}

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

test('the site loads without script errors', async () => {
  const { page, errors } = await openPage();
  assert.deepEqual(errors, []);
  await page.close();
});

test('every page in the menu opens and shows content', async () => {
  const { page, errors } = await openPage();
  for (const view of VIEWS) {
    const link = await page.$(`.sidebar-nav [data-view="${view}"]`);
    assert.ok(link, `menu has "${view}"`);
    await link.click();
    await settle();
    const { active, text } = await page.$eval(`#view-${view}`, (s) => ({ active: s.classList.contains('active-view'), text: s.innerText.trim().length }));
    assert.ok(active, `${view} becomes the visible page`);
    assert.ok(text > 20, `${view} shows content`);
  }
  assert.deepEqual(errors, []);
  await page.close();
});

test('Jugadores lists every player and opens their profile', async () => {
  const { page, errors } = await openPage({ hash: '#players' });
  await settle();
  const cards = await page.$$eval('#view-players .px-pcard', (c) => c.length);
  assert.equal(cards, board.players.length);

  await page.click('#view-players .px-pcard');
  await page.waitForSelector('#px-extras .px-h3');
  const sections = await page.$$eval('#px-extras .px-h3', (h) => h.map((x) => x.textContent));
  for (const name of ['Tendencia de Score', 'Vs jugadores de su elo', 'Por partida vs el grupo', 'Carriles', 'Campeones']) {
    assert.ok(sections.some((s) => s.includes(name)), `profile shows "${name}"`);
  }
  assert.deepEqual(errors, []);
  await page.close();
});

test('clicking a champion shows its matchups with both scores', async () => {
  const { page, errors } = await openPage({ hash: `#player:${board.players[0].puuid}` });
  await page.waitForSelector('#px-extras .px-champ-row');
  await page.click('#px-extras .px-champ-row');
  await page.waitForSelector('#px-champ-detail');
  const headers = await page.$$eval('#px-champ-detail th', (th) => th.map((x) => x.textContent));
  assert.ok(headers.includes('Su score') && headers.includes('Score rival'), 'matchup table has both scores');
  const rows = await page.$$eval('#px-champ-detail .px-table tbody tr', (r) => r.length);
  assert.ok(rows > 0, 'at least one matchup');
  assert.deepEqual(errors, []);
  await page.close();
});

test('Apodos shows a nickname and a full roast for every player', async () => {
  const { page, errors } = await openPage({ hash: '#apodos' });
  await settle();
  const roasts = await page.$$eval('#apodos-grid .px-roast p', (p) => p.map((x) => x.textContent.length));
  const expected = board.players.filter((p) => p.roast).length;
  assert.equal(roasts.length, expected);
  assert.ok(roasts.every((n) => n > 120), 'roasts are full paragraphs');
  assert.deepEqual(errors, []);
  await page.close();
});

test('the Update button asks the Worker for an update on the website', async () => {
  const { page, errors } = await openPage();
  workerCalls.length = 0;
  await page.click('#header-refresh-btn');
  await settle(1200);
  assert.ok(workerCalls.includes('POST'), 'Update button called the Worker');
  assert.deepEqual(errors, []);
  await page.close();
});

test('phone width: player pages fit the screen', async () => {
  const { page, errors } = await openPage({ width: 390, hash: `#player:${board.players[0].puuid}` });
  await page.waitForSelector('#px-extras');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `page scrolls sideways by ${overflow}px`);
  assert.deepEqual(errors, []);
  await page.close();
});
